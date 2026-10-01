"""The steps of the product pipeline. Each takes the Step Functions state and returns a small dict."""
import io
import json
import re
import statistics
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal

import numpy as np
from botocore.exceptions import ClientError
from PIL import Image

import ai
import brand as brand_mod
import imaging
import listing as listing_mod
from core import (
    PipelineError,
    bump_photos_done,
    cut_key,
    end_run,
    env_float,
    env_int,
    frame_key,
    get_product,
    get_store,
    preview_keys,
    processed_bucket,
    product_key,
    put_s3,
    raw_bucket,
    read_s3,
    s3,
    set_step,
    table,
    thumb_key,
)
from segment import segment_alpha

WORKERS = 4
MAX_OBJECT_AREA = 0.95  # above this the "object" is basically the whole frame: no real background was found
MIN_OBJECT_AREA = 0.02


def _ids(event):
    return event["storeId"], event["productId"]


def _spaced(items: list, count: int) -> list:
    """`count` items spread evenly across the list (front, side, back, ...)."""
    if len(items) <= count:
        return list(items)
    return [items[round(i * (len(items) - 1) / (count - 1))] for i in range(count)]


# ---------------------------------------------------------------------------------------------
# 1. Validate
# ---------------------------------------------------------------------------------------------


def validate(event: dict) -> dict:
    store_id, product_id = _ids(event)
    product = get_product(store_id, product_id)
    keys = product["rawKeys"]
    set_step(store_id, product_id, "validate", status="processing", photosDone=0, photosTotal=len(keys), previews=[])
    min_side = env_int("MIN_SIDE_PX", 600)

    def inspect(item):
        index, key = item
        try:
            image = imaging.open_image(read_s3(raw_bucket(), key))
        except ClientError:
            return {"index": index, "key": key, "reason": "missing_file"}
        except PipelineError as err:
            return {"index": index, "key": key, "reason": err.code}
        if min(image.size) < min_side:
            return {"index": index, "key": key, "reason": "too_small"}
        return {"index": index, "key": key, "sharpness": imaging.sharpness(image)}

    with ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(inspect, enumerate(keys, start=1)))

    usable = [r for r in results if "sharpness" in r]
    dropped = [{"index": r["index"], "reason": r["reason"]} for r in results if "reason" in r]
    if usable:
        # Blurry means below an absolute floor, or clearly blurrier than the rest of the set. The floor
        # matters when most photos are blurry (the median is then blurry too). Measured on real renders:
        # sharp 70-650, the same photos blurred (radius 3) 2.5-15.
        limit = max(env_float("MIN_SHARPNESS", 12.0), 0.35 * statistics.median(r["sharpness"] for r in usable))
        for r in list(usable):
            if r["sharpness"] < limit:
                usable.remove(r)
                dropped.append({"index": r["index"], "reason": "blurry"})

    minimum = env_int("MIN_PHOTOS", 6)
    if len(usable) < minimum:
        reasons = sorted({d["reason"] for d in dropped})
        raise PipelineError(
            "too_blurry" if "blurry" in reasons else "not_enough_photos",
            f"Only {len(usable)} of {len(keys)} photos are usable (need at least {minimum}). Problems: {', '.join(reasons) or 'none'}.",
        )
    return {"photos": [{"index": r["index"], "key": r["key"]} for r in usable], "dropped": dropped}


# ---------------------------------------------------------------------------------------------
# 2. Remove the background of one photo and measure its fidelity
# ---------------------------------------------------------------------------------------------


def _write_preview(store_id: str, product_id: str, index: int, image: Image.Image, rgba: Image.Image, score) -> dict | None:
    """Progress preview of one finished photo for the creator's processing screen, or None if it could not be written.

    The previews are a nicety: a failure here never fails the photo.
    """
    photo_key, cutout_key = preview_keys(store_id, product_id, index)
    # Short-lived and private: deleted when the run ends, so neither CloudFront nor shared caches should keep them.
    cache = "private, max-age=900"
    try:
        photo, cutout = imaging.preview_pair(image, rgba)
        put_s3(processed_bucket(), photo_key, photo, "image/webp", cache)
        put_s3(processed_bucket(), cutout_key, cutout, "image/webp", cache)
    except Exception:  # noqa: BLE001
        return None
    return {"i": index, "o": photo_key, "c": cutout_key, "s": Decimal(str(score)) if score is not None else None}


def process_photo(event: dict) -> dict:
    store_id, product_id = _ids(event)
    photo = event["photo"]
    index = photo["index"]
    if index == 1:
        set_step(store_id, product_id, "background")
    try:
        image = imaging.limit_size(imaging.open_image(read_s3(raw_bucket(), photo["key"])), 1024)
        alpha = segment_alpha(image)
        alpha = np.where(alpha < 0.04, 0.0, alpha)
        box = imaging.bbox_from_alpha(alpha)
        area = float((alpha > 0.5).mean())
        if box is None or area < MIN_OBJECT_AREA or area > MAX_OBJECT_AREA:
            return {"index": index, "ok": False, "reason": "no_object"}

        rgba = image.convert("RGBA")
        rgba.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)))
        buf = io.BytesIO()
        rgba.save(buf, "PNG", compress_level=3)
        put_s3(processed_bucket(), cut_key(store_id, product_id, index), buf.getvalue(), "image/png")

        # Fidelity: does the cutout still look like the same piece as the photo it came from? If the
        # embedding model stays throttled the frame is kept but NOT scored, and the product says so.
        # Only every Nth frame is scored (FIDELITY_SAMPLE_EVERY, default 2): Titan on-demand allows 20
        # requests per minute and cannot be raised, so scoring all frames would run into the limit.
        # Unscored frames are reported through `fidelityChecked`, never passed off as checked.
        crop = imaging.expand_box(box, image.size)
        step = max(1, env_int("FIDELITY_SAMPLE_EVERY", 2))
        try:
            if (index - 1) % step:
                raise ai.EmbeddingUnavailable("not_sampled")
            original = ai.titan_embed(imaging.to_jpeg(image.crop(crop), 512))
            processed = ai.titan_embed(imaging.to_jpeg(imaging.on_gray(rgba.crop(crop)), 512))
            score = round(imaging.cosine(original, processed), 4)
        except ai.EmbeddingUnavailable:
            score = None
    except PipelineError as err:
        return {"index": index, "ok": False, "reason": err.code}
    bump_photos_done(store_id, product_id, _write_preview(store_id, product_id, index, image, rgba, score))
    return {
        "index": index,
        "ok": True,
        "box": list(box),
        "width": image.width,
        "height": image.height,
        "fidelity": score,
    }


# ---------------------------------------------------------------------------------------------
# 3. Align and center: one scale and one floor line for every frame
# ---------------------------------------------------------------------------------------------


def align(event: dict) -> dict:
    store_id, product_id = _ids(event)
    set_step(store_id, product_id, "align")
    cutouts = sorted((p for p in event["photos"] if p.get("ok")), key=lambda p: p["index"])
    minimum = env_int("MIN_PHOTOS", 6)
    if len(cutouts) < minimum:
        raise PipelineError(
            "no_object",
            f"The piece could be separated from the background in only {len(cutouts)} photos (need {minimum}). "
            "Use a plain background and keep the piece in view.",
        )
    layout = imaging.align_layout([tuple(c["box"]) for c in cutouts])

    def build(item):
        cut, position = item
        index = cut["index"]
        cutout = Image.open(io.BytesIO(read_s3(processed_bucket(), cut_key(store_id, product_id, index)))).convert("RGBA")
        frame = imaging.render_frame(cutout, tuple(cut["box"]), layout["scale"], position)
        thumb = frame.resize((imaging.THUMB_SIZE, imaging.THUMB_SIZE), Image.LANCZOS)
        immutable = "public, max-age=31536000, immutable"
        put_s3(processed_bucket(), frame_key(store_id, product_id, index), imaging.webp_bytes(frame), "image/webp", immutable)
        put_s3(processed_bucket(), thumb_key(store_id, product_id, index), imaging.webp_bytes(thumb, 82), "image/webp", immutable)
        return {
            "index": index,
            "frameKey": frame_key(store_id, product_id, index),
            "thumbKey": thumb_key(store_id, product_id, index),
            "fidelity": cut["fidelity"],
        }

    with ThreadPoolExecutor(WORKERS) as pool:
        frames = list(pool.map(build, zip(cutouts, layout["placements"])))
    # The aligned thumbnails let the processing screen spin the piece before the run is finished.
    table("TABLE_PRODUCTS").update_item(
        Key=product_key(store_id, product_id),
        UpdateExpression="SET alignedThumbs = :a",
        ExpressionAttributeValues={":a": [{"i": f["index"], "k": f["thumbKey"]} for f in frames]},
    )
    return {"frames": frames, "mode": layout["mode"], "scale": round(layout["scale"], 4)}


# ---------------------------------------------------------------------------------------------
# 4. Fidelity: drop frames that drifted from their photo
# ---------------------------------------------------------------------------------------------


def fidelity(event: dict) -> dict:
    store_id, product_id = _ids(event)
    set_step(store_id, product_id, "fidelity")
    # An absolute floor catches catastrophic failures. The relative rule adapts to each photo set: a
    # frame far below the set's own median lost something the others kept (measured with damaged
    # masks: a correct cutout scores 0.96-0.99, scattered holes 0.82-0.88, a lost quarter ~0.92-0.97).
    floor = env_float("FIDELITY_THRESHOLD", 0.80)
    frames = event["frames"]
    scored = [f for f in frames if f.get("fidelity") is not None]
    # Frames the embedding model could not score (throttling) are kept and reported as unchecked.
    threshold = None
    if scored:
        median = statistics.median(f["fidelity"] for f in scored)
        threshold = round(max(floor, median - env_float("FIDELITY_MAX_DROP", 0.05)), 4)
    kept = [f for f in frames if f.get("fidelity") is None or f["fidelity"] >= threshold]
    dropped = [f for f in frames if f.get("fidelity") is not None and f["fidelity"] < threshold]
    minimum = env_int("MIN_PHOTOS", 6)
    if len(kept) < minimum:
        raise PipelineError(
            "low_fidelity",
            f"Only {len(kept)} views matched the original photos closely enough (need {minimum}). Try sharper, evenly lit photos.",
        )
    for frame in dropped:
        s3().delete_objects(
            Bucket=processed_bucket(),
            Delete={"Objects": [{"Key": frame["frameKey"]}, {"Key": frame["thumbKey"]}]},
        )
    table("TABLE_PRODUCTS").update_item(
        Key=product_key(store_id, product_id),
        UpdateExpression="SET fidelityReview = :r",
        ExpressionAttributeValues={
            ":r": {"threshold": Decimal(str(threshold)) if threshold is not None else None, "dropped": [f["index"] for f in dropped]}
        },
    )
    kept_scores = [f["fidelity"] for f in kept if f.get("fidelity") is not None]
    return {
        "kept": kept,
        "dropped": [f["index"] for f in dropped],
        "score": round(statistics.mean(kept_scores), 4) if kept_scores else None,
        "checked": len(kept_scores),
        "threshold": threshold,
    }


# ---------------------------------------------------------------------------------------------
# 5. Brand (only for the store's first product)
# ---------------------------------------------------------------------------------------------


def _load_frame(frame: dict) -> Image.Image:
    return Image.open(io.BytesIO(read_s3(processed_bucket(), frame["frameKey"]))).convert("RGBA")


def brand(event: dict) -> dict:
    store_id, product_id = _ids(event)
    set_step(store_id, product_id, "brand")
    store = get_store(store_id)
    if (store.get("brand") or {}).get("colors"):
        return {"skipped": True}

    pictures = [_load_frame(f) for f in _spaced(event["frames"], 3)]
    solid = [np.asarray(p)[..., :3][np.asarray(p)[..., 3] > 230] for p in pictures]
    solid = [s for s in solid if len(s)]
    colors = brand_mod.palette_from_pixels(np.concatenate(solid)) if solid else ["#c2623f", "#eed7cc", "#6b7a4f", "#2b2622"]
    result = {"colors": colors, "tone": "warm"}
    try:
        suggestion = ai.converse_json(
            brand_mod.SYSTEM_BRAND, [ai.image_block(imaging.to_jpeg(imaging.on_gray(p), 640)) for p in pictures[:2]], 200
        )
        if suggestion.get("tone") in brand_mod.TONES:
            result["tone"] = suggestion["tone"]
        name = listing_mod.clean(suggestion.get("displayName"))
        if name and len(name) <= 60 and not listing_mod.find_violations(name, "") and not brand_mod.hints_at_material(name):
            result["displayName"] = name
    except Exception:  # noqa: BLE001 - the palette is enough; the name and tone are a nicety
        pass
    try:
        table("TABLE_STORES").update_item(
            Key={"storeId": store_id},
            UpdateExpression="SET brand = :b",
            ConditionExpression="attribute_not_exists(brand.colors)",
            ExpressionAttributeValues={":b": result},
        )
    except ClientError as err:
        if err.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
    return {"skipped": False, **result}


# ---------------------------------------------------------------------------------------------
# 6. Listing in English and Spanish
# ---------------------------------------------------------------------------------------------


def listing(event: dict) -> dict:
    store_id, product_id = _ids(event)
    set_step(store_id, product_id, "listing")
    product, store = get_product(store_id, product_id), get_store(store_id)
    notes, name_hint = product.get("notes", ""), product.get("name", "")
    facts = f"{notes} {name_hint}"

    pictures = [_load_frame(f) for f in _spaced(event["frames"], 3)]
    content = [ai.image_block(imaging.to_jpeg(imaging.on_gray(p), 768)) for p in pictures]
    content.append({"text": json.dumps({"artisanName": name_hint, "artisanNotes": notes, "storeName": store["name"]}, ensure_ascii=False)})

    problems: list[str] = []
    for _ in range(2):
        prompt = listing_mod.SYSTEM_LISTING + (("\n\n" + listing_mod.repair_hint(problems)) if problems else "")
        try:
            copy = listing_mod.validate_copy(ai.converse_json(prompt, content), facts)
            return {"copy": copy, "fallback": False}
        except listing_mod.ListingError as err:
            problems = err.args[0]
        except ValueError:  # not JSON
            problems = ["the answer was not valid JSON"]
    return {"copy": listing_mod.fallback_copy(name_hint, notes, store["name"]), "fallback": True}


# ---------------------------------------------------------------------------------------------
# 7. Finalize
# ---------------------------------------------------------------------------------------------


def finalize(event: dict) -> dict:
    store_id, product_id = _ids(event)
    frames = sorted(event["frames"], key=lambda f: f["index"])
    score = event.get("score")
    # `fidelityChecked` says how many frames were actually scored, so a partial check is never passed off
    # as a full one. With no score at all, the score attribute is removed.
    expression = (
        "SET #s = :ready, #step = :step, frameKeys = :frames, thumbKeys = :thumbs, #copy = :copy, "
        "fidelityChecked = :checked, completedAt = :now"
        + (", fidelityScore = :score" if score is not None else "")
    )
    values = {
        ":ready": "ready_360",
        ":step": "ready",
        ":frames": [f["frameKey"] for f in frames],
        ":thumbs": [f["thumbKey"] for f in frames],
        ":copy": event["copy"],
        ":checked": int(event.get("checked", len(frames))),
        ":now": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if score is not None:
        values[":score"] = Decimal(str(score))
    # The progress previews go away with the run; the frames are the product now.
    end_run(
        store_id,
        product_id,
        expression,
        {"#s": "status", "#step": "step", "#copy": "copy", "#err": "error"},
        values,
        remove=("#err",) if score is not None else ("#err", "fidelityScore"),
    )
    # The intermediate cutouts are private scratch files; remove them once the frames exist.
    listed = s3().list_objects_v2(Bucket=processed_bucket(), Prefix=f"work/{store_id}/{product_id}/")
    objects = [{"Key": o["Key"]} for o in listed.get("Contents", [])]
    if objects:
        s3().delete_objects(Bucket=processed_bucket(), Delete={"Objects": objects})
    return {"status": "ready_360", "frames": len(frames)}


# ---------------------------------------------------------------------------------------------
# Failure
# ---------------------------------------------------------------------------------------------

_CODED = re.compile(r"^([a-z_]+): (.*)$", re.DOTALL)


def fail(event: dict) -> dict:
    """Mark the product failed with a code the UI can translate. Reads the Step Functions error."""
    store_id, product_id = _ids(event)
    error = event.get("error") or {}
    cause = error.get("Cause") or ""
    try:
        cause = json.loads(cause).get("errorMessage", cause)
    except (ValueError, AttributeError):
        pass
    match = _CODED.match(cause)
    if match:
        code, message = match.group(1), match.group(2)
    elif "timed out" in cause.lower() or error.get("Error") == "States.Timeout":
        code, message = "timeout", "Processing took too long."
    else:
        code, message = "internal_error", "Something went wrong while processing the photos."
    end_run(
        store_id,
        product_id,
        "SET #s = :failed, #err = :err",
        {"#s": "status", "#err": "error"},
        {":failed": "failed", ":err": {"code": code, "message": message[:300]}},
    )
    return {"status": "failed", "code": code}
