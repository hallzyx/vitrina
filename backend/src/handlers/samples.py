"""POST /api/samples/{sampleId}/run: run the pipeline live on a fixed demonstration photo set.

Judges and visitors rarely have 12 photos at hand, so the app offers sample sets. Because the inputs are
fixed and known (they live in S3 under samples/), this needs no invite phrase: the abuse it allows is
bounded by a per-visitor and a global daily cap. When the cap is reached the API answers `sample_cap`
and the app replays the recorded run from the example store instead.
"""
import json
import time
from concurrent.futures import ThreadPoolExecutor

from common import limits
from common.aws import s3, stepfunctions, table
from common.config import env, env_int
from common.http import ApiError, api, json_body, response
from common.ids import ulid
from common.security import day_stamp, ip_hash, is_allowlisted
from common.stores import create_store_record, now_iso
from common.validation import clean_text

DAY = 86400
_MANIFEST_SECONDS = 300
_manifest: dict = {"at": 0.0, "data": None}


def load_manifest() -> dict:
    if _manifest["data"] is None or time.monotonic() - _manifest["at"] > _MANIFEST_SECONDS:
        body = s3().get_object(Bucket=env("BUCKET_PROCESSED"), Key="samples/index.json")["Body"].read()
        _manifest["data"], _manifest["at"] = json.loads(body), time.monotonic()
    return _manifest["data"]


def reset_manifest_cache() -> None:
    _manifest["data"], _manifest["at"] = None, 0.0


def run(event: dict) -> dict:
    sample_id = (event.get("pathParameters") or {}).get("sampleId", "")
    sample = next((s for s in load_manifest().get("samples", []) if s["id"] == sample_id), None)
    if not sample:
        raise ApiError(404, "not_found", "Sample not found.")
    body = json_body(event)
    store_name = clean_text(body.get("storeName"), "storeName", 60, required=False) or "Demo store"

    day = day_stamp()
    try:
        if not is_allowlisted(event):  # the owner's IP skips only the per-visitor cap
            limits.bump(f"sample#{ip_hash(event)}#{day}", 2 * DAY, limit=env_int("MAX_SAMPLE_RUNS_PER_DAY", 2))
        limits.bump(f"sample#global#{day}", 2 * DAY, limit=env_int("MAX_GLOBAL_SAMPLE_RUNS_PER_DAY", 12))
    except ApiError:
        raise ApiError(429, "sample_cap", "Live sample runs are paused for today. You can watch a recorded run instead.") from None

    store, token = create_store_record(store_name, "", "USD", {}, demo=True)
    product_id = ulid()
    raw_bucket, samples_bucket = env("BUCKET_RAW"), env("BUCKET_PROCESSED")
    keys = [f"raw/{store['storeId']}/{product_id}/{i:02d}.jpg" for i in range(1, int(sample["photos"]) + 1)]

    def copy(pair):
        index, dst = pair
        s3().copy_object(Bucket=raw_bucket, Key=dst, CopySource={"Bucket": samples_bucket, "Key": f"samples/{sample_id}/{index:02d}.jpg"})

    with ThreadPoolExecutor(6) as pool:
        list(pool.map(copy, enumerate(keys, start=1)))

    item = {
        "storeId": store["storeId"],
        "productId": product_id,
        "status": "processing",
        "step": "validate",
        "rawKeys": keys,
        "photosTotal": len(keys),
        "photosDone": 0,
        "attempts": 1,
        "sample": sample_id,
        "name": sample["name"]["en"],
        "frameKeys": [],
        "copy": {},
        "createdAt": now_iso(),
    }
    table("TABLE_PRODUCTS").put_item(Item=item)
    stepfunctions().start_execution(
        stateMachineArn=env("STATE_MACHINE_ARN"),
        name=f"{product_id}-1",
        input=json.dumps({"storeId": store["storeId"], "productId": product_id}),
    )
    return response(202, {"storeId": store["storeId"], "productId": product_id, "slug": store["slug"], "editToken": token})


@api
def handler(event, context):
    if event.get("routeKey") == "POST /api/samples/{sampleId}/run":
        return run(event)
    raise ApiError(404, "not_found", "Unknown route.")
