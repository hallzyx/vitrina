"""Runs every pipeline task in the order Step Functions would, with AWS simulated and the models stubbed."""
import io
from decimal import Decimal

import boto3
import numpy as np
import pytest
from PIL import Image, ImageDraw

import ai
import tasks
from core import PipelineError

STORE, PRODUCT = "STORE1", "PROD1"


def make_photo(index: int, size=(900, 900), blur=False) -> bytes:
    """A gray studio background with a colored piece that shifts a little from photo to photo."""
    image = Image.new("RGB", size, (150, 150, 150))
    draw = ImageDraw.Draw(image)
    cx = 450 + (index % 3 - 1) * 6
    draw.ellipse((cx - 170, 250, cx + 170, 780), fill=(196, 108, 76))
    draw.rectangle((cx - 60, 170, cx + 60, 300), fill=(196, 108, 76))
    # Fine texture, like real paper and pottery, so a sharp photo has detail and a blurred one loses it.
    noise = np.random.default_rng(index).normal(0, 7, (size[1], size[0], 1))
    image = Image.fromarray(np.clip(np.asarray(image, dtype=np.float32) + noise, 0, 255).astype(np.uint8))
    if blur:
        from PIL import ImageFilter

        image = image.filter(ImageFilter.GaussianBlur(25))
    buf = io.BytesIO()
    image.save(buf, "JPEG", quality=92)
    return buf.getvalue()


@pytest.fixture
def stubs(monkeypatch):
    # Segmentation: anything far from the gray background is "the piece".
    def fake_alpha(image):
        arr = np.asarray(image.convert("RGB"), dtype=np.float32)
        return (np.abs(arr - 150).max(axis=2) > 25).astype(np.float32)

    # Embeddings: a color histogram, so a cutout on gray resembles its photo without being identical.
    def fake_embed(jpeg):
        arr = np.asarray(Image.open(io.BytesIO(jpeg)).convert("RGB").resize((32, 32)), dtype=np.float32)
        return np.concatenate([arr[..., c].ravel()[:64] for c in range(3)]) + 1.0

    answers = {
        "listing": {
            "en": {"name": "Terracotta vessel", "description": "A rounded vessel with a narrow neck and a warm reddish color."},
            "es": {"name": "Vasija terracota", "description": "Una vasija redondeada de cuello estrecho y un cálido color rojizo."},
        },
        "brand": {"displayName": "Warm Ember", "tone": "warm"},
    }
    calls = []

    def fake_converse(system, content, max_tokens=900):
        kind = "brand" if "brand identity" in system else "listing"
        calls.append(kind)
        return answers[kind]

    monkeypatch.setattr(tasks, "segment_alpha", fake_alpha)
    monkeypatch.setattr(ai, "titan_embed", fake_embed)
    monkeypatch.setattr(ai, "converse_json", fake_converse)
    return {"answers": answers, "calls": calls}


def seed(count=10, blurry=(), name="Terracotta vessel", notes=""):
    s3 = boto3.client("s3")
    keys = []
    for i in range(1, count + 1):
        key = f"raw/{STORE}/{PRODUCT}/{i:02d}.jpg"
        s3.put_object(Bucket="raw-bucket", Key=key, Body=make_photo(i, blur=i in blurry))
        keys.append(key)
    db = boto3.resource("dynamodb")
    db.Table("stores").put_item(Item={"storeId": STORE, "name": "Casa", "slug": "casa-1", "brand": {}, "status": "draft", "editTokenHash": "x"})
    db.Table("products").put_item(
        Item={"storeId": STORE, "productId": PRODUCT, "status": "processing", "rawKeys": keys, "name": name, "notes": notes, "frameKeys": [], "copy": {}}
    )


def run_pipeline():
    base = {"storeId": STORE, "productId": PRODUCT}
    validated = tasks.validate(base)
    photos = [tasks.process_photo({**base, "photo": p}) for p in validated["photos"]]
    aligned = tasks.align({**base, "photos": photos})
    checked = tasks.fidelity({**base, "frames": aligned["frames"]})
    tasks.brand({**base, "frames": checked["kept"]})
    written = tasks.listing({**base, "frames": checked["kept"]})
    tasks.finalize({**base, "frames": checked["kept"], "score": checked["score"], "checked": checked["checked"], "copy": written["copy"]})
    return validated, aligned, checked, written


def product():
    return boto3.resource("dynamodb").Table("products").get_item(Key={"storeId": STORE, "productId": PRODUCT})["Item"]


def test_full_run_produces_a_ready_360_product(stubs):
    seed(10)
    validated, aligned, checked, written = run_pipeline()

    item = product()
    assert item["status"] == "ready_360" and item["step"] == "ready"
    assert len(item["frameKeys"]) == 10 and len(item["thumbKeys"]) == 10
    assert item["frameKeys"][0] == f"media/{STORE}/{PRODUCT}/f01.webp"
    assert isinstance(item["fidelityScore"], Decimal) and 0.8 <= float(item["fidelityScore"]) <= 1
    assert item["copy"]["es"]["name"] == "Vasija terracota"
    assert aligned["mode"] == "steady"

    s3 = boto3.client("s3")
    frame = Image.open(io.BytesIO(s3.get_object(Bucket="processed-bucket", Key=item["frameKeys"][0])["Body"].read()))
    assert frame.size == (1024, 1024) and frame.format == "WEBP" and frame.mode == "RGBA"
    assert np.asarray(frame)[..., 3].min() == 0  # transparent background
    thumb = Image.open(io.BytesIO(s3.get_object(Bucket="processed-bucket", Key=item["thumbKeys"][0])["Body"].read()))
    assert thumb.size == (320, 320)
    assert "Contents" not in s3.list_objects_v2(Bucket="processed-bucket", Prefix=f"work/{STORE}/{PRODUCT}/")  # scratch removed

    brand = boto3.resource("dynamodb").Table("stores").get_item(Key={"storeId": STORE})["Item"]["brand"]
    assert len(brand["colors"]) == 4 and brand["tone"] == "warm" and brand["displayName"] == "Warm Ember"


def test_brand_names_that_claim_a_material_are_not_used(stubs):
    stubs["answers"]["brand"] = {"displayName": "Warm Clay", "tone": "rustic"}
    seed(8)
    run_pipeline()
    brand = boto3.resource("dynamodb").Table("stores").get_item(Key={"storeId": STORE})["Item"]["brand"]
    assert "displayName" not in brand and brand["tone"] == "rustic"


def test_piece_pixels_are_not_altered_by_the_pipeline(stubs):
    """Fidelity: inside the piece, the frame is the photo. The pipeline only adds transparency."""
    seed(8)
    run_pipeline()
    s3 = boto3.client("s3")
    original = np.asarray(Image.open(io.BytesIO(make_photo(1))).convert("RGB"), dtype=np.float32)
    frame = np.asarray(
        Image.open(io.BytesIO(s3.get_object(Bucket="processed-bucket", Key=product()["frameKeys"][0])["Body"].read()))
    )
    solid = frame[..., 3] == 255
    # The piece's color in the frame matches the color it had in the photo.
    assert np.abs(frame[..., :3][solid].mean(axis=0) - np.array([196, 108, 76])).max() < 4
    assert solid.sum() > 10000 and original.shape[0] == 900


def test_a_throttled_embedding_keeps_the_frame_but_reports_it_as_unchecked(stubs, monkeypatch):
    """Low Bedrock quotas must not fail a product: the frame stays, unscored, and the product says how many were checked."""
    real = ai.titan_embed
    calls = {"n": 0}

    def flaky(jpeg):
        calls["n"] += 1
        if calls["n"] in (5, 6):  # the 1st embedding of the 3rd and of the 4th photo fails, so those two go unscored
            raise ai.EmbeddingUnavailable("ThrottlingException")
        return real(jpeg)

    monkeypatch.setattr(ai, "titan_embed", flaky)
    monkeypatch.setenv("FIDELITY_SAMPLE_EVERY", "1")  # score every frame so the counts below are exact
    seed(10)
    _, aligned, checked, _ = run_pipeline()
    item = product()
    assert item["status"] == "ready_360" and len(item["frameKeys"]) == 10
    assert checked["checked"] == 8 and item["fidelityChecked"] == 8
    assert 0.8 <= float(item["fidelityScore"]) <= 1  # the score covers only the checked frames


def test_only_every_second_frame_is_scored_by_default_and_the_rest_is_reported_unchecked(stubs):
    """Titan allows 20 requests per minute, so half the frames are scored (two calls each)."""
    seed(12)
    _, aligned, checked, _ = run_pipeline()
    item = product()
    assert item["status"] == "ready_360" and len(item["frameKeys"]) == 12
    assert checked["checked"] == 6 and item["fidelityChecked"] == 6
    assert sorted(f["index"] for f in aligned["frames"] if f["fidelity"] is not None) == [1, 3, 5, 7, 9, 11]


def test_with_nothing_scored_the_product_is_ready_without_a_score(stubs, monkeypatch):
    def always_throttled(jpeg):
        raise ai.EmbeddingUnavailable("ThrottlingException")

    monkeypatch.setattr(ai, "titan_embed", always_throttled)
    seed(8)
    run_pipeline()
    item = product()
    assert item["status"] == "ready_360" and item["fidelityChecked"] == 0 and "fidelityScore" not in item


def test_brand_is_only_set_for_the_first_product(stubs):
    seed(8)
    boto3.resource("dynamodb").Table("stores").update_item(
        Key={"storeId": STORE}, UpdateExpression="SET brand = :b", ExpressionAttributeValues={":b": {"colors": ["#111111"], "tone": "rustic"}}
    )
    run_pipeline()
    brand = boto3.resource("dynamodb").Table("stores").get_item(Key={"storeId": STORE})["Item"]["brand"]
    assert brand == {"colors": ["#111111"], "tone": "rustic"}  # inherited, untouched
    assert "brand" not in stubs["calls"]


def test_too_few_usable_photos_fails_with_a_clear_code(stubs):
    seed(10, blurry=(1, 2, 3, 4, 5, 6, 7))
    with pytest.raises(PipelineError) as err:
        tasks.validate({"storeId": STORE, "productId": PRODUCT})
    assert err.value.code in ("too_blurry", "not_enough_photos")


def test_a_single_blurry_photo_is_dropped_but_the_run_continues(stubs):
    seed(10, blurry=(4,))
    validated = tasks.validate({"storeId": STORE, "productId": PRODUCT})
    assert [d for d in validated["dropped"] if d["index"] == 4][0]["reason"] == "blurry"
    assert len(validated["photos"]) == 9


def test_frames_below_the_fidelity_threshold_are_dropped(stubs, monkeypatch):
    seed(10)
    base = {"storeId": STORE, "productId": PRODUCT}
    photos = [tasks.process_photo({**base, "photo": p}) for p in tasks.validate(base)["photos"]]
    photos[2]["fidelity"] = 0.55
    aligned = tasks.align({**base, "photos": photos})
    checked = tasks.fidelity({**base, "frames": aligned["frames"]})
    assert checked["dropped"] == [photos[2]["index"]] and len(checked["kept"]) == 9
    keys = [o["Key"] for o in boto3.client("s3").list_objects_v2(Bucket="processed-bucket", Prefix="media/")["Contents"]]
    assert f"media/{STORE}/{PRODUCT}/f03.webp" not in keys


def test_a_frame_far_below_its_own_sets_median_is_dropped_even_above_the_floor(stubs):
    base = {"storeId": STORE, "productId": PRODUCT}
    seed(8)
    scores = [0.97, 0.98, 0.97, 0.90, 0.98, 0.97, 0.96, 0.98]  # the 0.90 is above the 0.80 floor but far below 0.97
    frames = [
        {"index": i, "frameKey": f"media/{STORE}/{PRODUCT}/f{i:02d}.webp", "thumbKey": f"media/{STORE}/{PRODUCT}/t{i:02d}.webp", "fidelity": s}
        for i, s in enumerate(scores, start=1)
    ]
    checked = tasks.fidelity({**base, "frames": frames})
    assert checked["dropped"] == [4] and len(checked["kept"]) == 7


def test_a_uniformly_lower_baseline_does_not_drop_good_frames(stubs):
    """Real photos with cluttered backgrounds score lower for every frame; that alone is not a failure."""
    base = {"storeId": STORE, "productId": PRODUCT}
    seed(8)
    scores = [0.90, 0.91, 0.89, 0.90, 0.92, 0.90, 0.89, 0.91]
    frames = [
        {"index": i, "frameKey": f"media/{STORE}/{PRODUCT}/f{i:02d}.webp", "thumbKey": f"media/{STORE}/{PRODUCT}/t{i:02d}.webp", "fidelity": s}
        for i, s in enumerate(scores, start=1)
    ]
    assert tasks.fidelity({**base, "frames": frames})["dropped"] == []


def test_noisy_scores_from_phone_photos_widen_the_margin_but_a_damaged_frame_is_still_dropped(stubs):
    """Measured on real photos of a dark bottle: correct cutouts scored 0.855-0.94. Tight sets keep the 0.05 margin."""
    base = {"storeId": STORE, "productId": PRODUCT}
    seed(10)
    scores = [0.912, 0.8582, 0.8555, 0.9143, 0.9387, 0.9278, None, None, None, None]
    frames = [
        {"index": i, "frameKey": f"media/{STORE}/{PRODUCT}/f{i:02d}.webp", "thumbKey": f"media/{STORE}/{PRODUCT}/t{i:02d}.webp", "fidelity": s}
        for i, s in enumerate(scores, start=1)
    ]
    assert tasks.fidelity({**base, "frames": frames})["dropped"] == []  # these were correct cutouts
    frames[1]["fidelity"] = 0.80  # a frame at the floor of the noisy set is still caught
    assert tasks.fidelity({**base, "frames": frames})["dropped"] == [2]


def test_fidelity_fails_the_product_when_too_few_frames_remain(stubs):
    base = {"storeId": STORE, "productId": PRODUCT}
    seed(8)
    frames = [{"index": i, "frameKey": f"media/{STORE}/{PRODUCT}/f{i:02d}.webp", "thumbKey": f"media/{STORE}/{PRODUCT}/t{i:02d}.webp", "fidelity": 0.5} for i in range(1, 9)]
    with pytest.raises(PipelineError) as err:
        tasks.fidelity({**base, "frames": frames})
    assert err.value.code == "low_fidelity"


def test_a_photo_with_no_piece_in_it_is_reported_not_crashed(stubs):
    seed(8)
    empty = Image.new("RGB", (900, 900), (150, 150, 150))
    buf = io.BytesIO()
    empty.save(buf, "JPEG")
    boto3.client("s3").put_object(Bucket="raw-bucket", Key=f"raw/{STORE}/{PRODUCT}/01.jpg", Body=buf.getvalue())
    result = tasks.process_photo({"storeId": STORE, "productId": PRODUCT, "photo": {"index": 1, "key": f"raw/{STORE}/{PRODUCT}/01.jpg"}})
    assert result == {"index": 1, "ok": False, "reason": "no_object"}


def test_listing_retries_then_falls_back_when_the_model_invents_claims(stubs):
    seed(8, notes="Jarrón pequeño")
    stubs["answers"]["listing"] = {
        "en": {"name": "Handmade ceramic vase", "description": "A 30 cm handmade ceramic vase from Peru."},
        "es": {"name": "Jarrón de cerámica", "description": "Un jarrón de cerámica hecho a mano."},
    }
    base = {"storeId": STORE, "productId": PRODUCT}
    photos = [tasks.process_photo({**base, "photo": p}) for p in tasks.validate(base)["photos"]]
    frames = tasks.fidelity({**base, "frames": tasks.align({**base, "photos": photos})["frames"]})["kept"]
    result = tasks.listing({**base, "frames": frames})
    assert result["fallback"] is True
    assert stubs["calls"].count("listing") == 2  # one try plus one repair attempt
    assert result["copy"]["es"]["description"] == "Jarrón pequeño"  # only what the artisan wrote


def _live_objects():
    listed = boto3.client("s3").list_objects_v2(Bucket="processed-bucket", Prefix=f"media/{STORE}/{PRODUCT}/live/")
    return sorted(o["Key"] for o in listed.get("Contents", []))


def test_each_finished_photo_leaves_a_progress_preview_with_its_real_score(stubs):
    seed(8)
    base = {"storeId": STORE, "productId": PRODUCT}
    photos = [tasks.process_photo({**base, "photo": p}) for p in tasks.validate(base)["photos"]]
    item = product()
    previews = sorted(item["previews"], key=lambda p: p["i"])
    assert [int(p["i"]) for p in previews] == list(range(1, 9)) and int(item["photosDone"]) == 8
    for p, photo in zip(previews, photos):
        assert p["o"] == f"media/{STORE}/{PRODUCT}/live/p{int(p['i']):02d}-o.webp"
        # The score is exactly the one the run measured; unsampled photos stay unscored (None), never invented.
        assert (None if p["s"] is None else float(p["s"])) == photo["fidelity"]
    assert [p["s"] is None for p in previews] == [False, True] * 4

    s3 = boto3.client("s3")
    head = s3.head_object(Bucket="processed-bucket", Key=previews[0]["c"])
    assert head["ContentType"] == "image/webp" and head["CacheControl"].startswith("private")
    original = Image.open(io.BytesIO(s3.get_object(Bucket="processed-bucket", Key=previews[0]["o"])["Body"].read()))
    cutout = Image.open(io.BytesIO(s3.get_object(Bucket="processed-bucket", Key=previews[0]["c"])["Body"].read()))
    assert original.size == cutout.size and max(cutout.size) == 480  # the cutout overlays the photo exactly
    assert cutout.mode == "RGBA" and np.asarray(cutout)[..., 3].min() == 0

    aligned = tasks.align({**base, "photos": photos})
    assert [int(a["i"]) for a in product()["alignedThumbs"]] == list(range(1, 9))
    tasks.fidelity({**base, "frames": aligned["frames"]})
    review = product()["fidelityReview"]
    assert review["dropped"] == [] and 0.8 <= float(review["threshold"]) <= 1


def test_the_previews_are_removed_when_the_run_ends(stubs):
    seed(8)
    run_pipeline()
    item = product()
    assert item["status"] == "ready_360"
    assert not {"previews", "alignedThumbs", "fidelityReview"} & set(item)
    assert _live_objects() == []
    assert len(item["frameKeys"]) == 8  # the frames themselves are untouched


def test_the_previews_are_removed_when_the_run_fails(stubs):
    seed(8)
    base = {"storeId": STORE, "productId": PRODUCT}
    for p in tasks.validate(base)["photos"]:
        tasks.process_photo({**base, "photo": p})
    assert len(_live_objects()) == 16
    tasks.fail({**base, "error": {"Error": "States.Timeout", "Cause": ""}})
    item = product()
    assert item["status"] == "failed" and "previews" not in item
    assert _live_objects() == []


def test_a_preview_that_cannot_be_written_does_not_fail_the_photo(stubs, monkeypatch):
    seed(8)
    monkeypatch.setattr(tasks.imaging, "preview_pair", lambda *a, **k: (_ for _ in ()).throw(OSError("disk")))
    base = {"storeId": STORE, "productId": PRODUCT}
    result = tasks.process_photo({**base, "photo": tasks.validate(base)["photos"][0]})
    assert result["ok"] is True and int(product()["photosDone"]) == 1 and product()["previews"] == []


def test_fail_task_records_a_translatable_code(stubs):
    seed(8)
    cause = '{"errorMessage": "not_enough_photos: Only 3 of 12 photos are usable.", "errorType": "PipelineError"}'
    tasks.fail({"storeId": STORE, "productId": PRODUCT, "error": {"Error": "PipelineError", "Cause": cause}})
    item = product()
    assert item["status"] == "failed" and item["error"]["code"] == "not_enough_photos"
    tasks.fail({"storeId": STORE, "productId": PRODUCT, "error": {"Error": "States.Timeout", "Cause": ""}})
    assert product()["error"]["code"] == "timeout"
    tasks.fail({"storeId": STORE, "productId": PRODUCT, "error": {"Error": "Boom", "Cause": "kaboom"}})
    assert product()["error"]["code"] == "internal_error"
