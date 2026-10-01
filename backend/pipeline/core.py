"""Shared plumbing for the pipeline Lambda: configuration, AWS clients, product state and S3 keys."""
import functools
import os

import boto3
from botocore.config import Config

# Progress steps shown to the creator, in order. `step` on the product item is one of these.
STEPS = ["validate", "background", "align", "fidelity", "brand", "listing", "ready"]


class PipelineError(Exception):
    """A failure with a stable code the UI can translate. The code travels in the message."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


@functools.lru_cache(maxsize=None)
def _dynamodb():
    return boto3.resource("dynamodb")


def table(env_name: str):
    return _dynamodb().Table(os.environ[env_name])


@functools.lru_cache(maxsize=None)
def s3():
    return boto3.client("s3")


@functools.lru_cache(maxsize=None)
def bedrock():
    # Throttling is retried with backoff in ai.with_backoff, so the SDK itself retries only lightly.
    return boto3.client("bedrock-runtime", config=Config(read_timeout=120, retries={"max_attempts": 2, "mode": "standard"}))


def raw_bucket() -> str:
    return env("BUCKET_RAW")


def processed_bucket() -> str:
    return env("BUCKET_PROCESSED")


def read_s3(bucket: str, key: str) -> bytes:
    return s3().get_object(Bucket=bucket, Key=key)["Body"].read()


def put_s3(bucket: str, key: str, body: bytes, content_type: str, cache_control: str | None = None) -> None:
    extra = {"CacheControl": cache_control} if cache_control else {}
    s3().put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type, **extra)


# ---- S3 key layout -------------------------------------------------------------------------
# work/  private intermediate cutouts (never served)
# media/ public frames and thumbnails, served by CloudFront at /media/*
# media/<store>/<product>/live/  small progress previews (photo and cutout), only while processing:
#        listed by the token-protected status endpoint and deleted when the run finishes or fails


def cut_key(store_id: str, product_id: str, index: int) -> str:
    return f"work/{store_id}/{product_id}/cut-{index:02d}.png"


def preview_keys(store_id: str, product_id: str, index: int) -> tuple[str, str]:
    """(photo, cutout) progress previews of one photo. Same size, so the cutout overlays the photo exactly."""
    base = f"media/{store_id}/{product_id}/live/p{index:02d}"
    return f"{base}-o.webp", f"{base}-c.webp"


# Progress attributes on the product item, written while the run is in flight and removed at the end.
LIVE_ATTRIBUTES = ("previews", "alignedThumbs", "fidelityReview")


def frame_key(store_id: str, product_id: str, index: int) -> str:
    return f"media/{store_id}/{product_id}/f{index:02d}.webp"


def thumb_key(store_id: str, product_id: str, index: int) -> str:
    return f"media/{store_id}/{product_id}/t{index:02d}.webp"


# ---- product state ---------------------------------------------------------------------------


def product_key(store_id: str, product_id: str) -> dict:
    return {"storeId": store_id, "productId": product_id}


def get_product(store_id: str, product_id: str) -> dict:
    item = table("TABLE_PRODUCTS").get_item(Key=product_key(store_id, product_id)).get("Item")
    if not item:
        raise PipelineError("not_found", "Product not found.")
    return item


def get_store(store_id: str) -> dict:
    item = table("TABLE_STORES").get_item(Key={"storeId": store_id}).get("Item")
    if not item:
        raise PipelineError("not_found", "Store not found.")
    return item


def set_step(store_id: str, product_id: str, step: str, **extra) -> None:
    """Record the current step (and optional extra attributes) so the status endpoint can show progress."""
    names, values, expr = {"#s": "step"}, {":s": step}, "SET #s = :s"
    for i, (name, value) in enumerate(extra.items()):
        names[f"#x{i}"], values[f":x{i}"] = name, value
        expr += f", #x{i} = :x{i}"
    table("TABLE_PRODUCTS").update_item(
        Key=product_key(store_id, product_id),
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def bump_photos_done(store_id: str, product_id: str, preview: dict | None = None) -> None:
    """Count one finished photo and, if given, append its progress preview in the same write."""
    expr, values = "ADD photosDone :one", {":one": 1}
    if preview is not None:
        expr += " SET previews = list_append(if_not_exists(previews, :empty), :p)"
        values.update({":empty": [], ":p": [preview]})
    table("TABLE_PRODUCTS").update_item(
        Key=product_key(store_id, product_id),
        UpdateExpression=expr,
        ExpressionAttributeValues=values,
    )


def end_run(store_id: str, product_id: str, set_expr: str, names: dict, values: dict, remove: tuple = ()) -> None:
    """Write the run's final state, drop the progress attributes in the same write, then delete their previews.

    Deleting the preview files is best effort and never fails the run.
    """
    old = table("TABLE_PRODUCTS").update_item(
        Key=product_key(store_id, product_id),
        UpdateExpression=f"{set_expr} REMOVE {', '.join([*remove, *LIVE_ATTRIBUTES])}",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_OLD",
    ).get("Attributes", {})
    count = max(len(old.get("rawKeys") or []), max((int(p["i"]) for p in old.get("previews") or []), default=0))
    keys = [{"Key": k} for i in range(1, count + 1) for k in preview_keys(store_id, product_id, i)]
    try:
        if keys:
            s3().delete_objects(Bucket=processed_bucket(), Delete={"Objects": keys, "Quiet": True})
    except Exception:  # noqa: BLE001 - leftovers live under an unguessable path and are never listed again
        pass
