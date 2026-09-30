"""POST /api/stores/{storeId}/products: create a product and return presigned upload forms (edit token)."""
from datetime import datetime, timezone

from common import limits
from common.aws import s3, table
from common.config import ALLOWED_PHOTO_TYPES, env, env_int
from common.http import ApiError, api, json_body, response
from common.ids import ulid
from common.security import day_stamp, ip_hash
from common.stores import require_store
from common.validation import clean_price, clean_text

DAY = 86400
UPLOAD_URL_SECONDS = 900


def create_product(event: dict) -> dict:
    store = require_store(event, (event.get("pathParameters") or {}).get("storeId"))
    body = json_body(event)

    min_photos, max_photos = env_int("MIN_PHOTOS", 6), env_int("MAX_PHOTOS", 24)
    count = body.get("photoCount")
    if isinstance(count, bool) or not isinstance(count, int) or not min_photos <= count <= max_photos:
        raise ApiError(400, "invalid_request", f"'photoCount' must be between {min_photos} and {max_photos}.")
    types = body.get("contentTypes") or ["image/jpeg"] * count
    if not isinstance(types, list) or len(types) != count or any(t not in ALLOWED_PHOTO_TYPES for t in types):
        raise ApiError(400, "invalid_request", "'contentTypes' must list one of image/jpeg, image/png or image/webp per photo.")

    name = clean_text(body.get("name"), "name", 80, required=False)
    notes = clean_text(body.get("notes"), "notes", 400, required=False)
    price = clean_price(body.get("price"))

    day = day_stamp()
    limits.bump(f"prod#{ip_hash(event)}#{day}", 2 * DAY, limit=env_int("MAX_PRODUCTS_PER_DAY", 3))
    limits.bump(f"prod#global#{day}", 2 * DAY, limit=env_int("MAX_GLOBAL_PRODUCTS_PER_DAY", 30))

    store_id, product_id = store["storeId"], ulid()
    max_bytes = env_int("MAX_PHOTO_MB", 8) * 1024 * 1024
    bucket = env("BUCKET_RAW")
    raw_keys, uploads = [], []
    for index, content_type in enumerate(types, start=1):
        key = f"raw/{store_id}/{product_id}/{index:02d}.{ALLOWED_PHOTO_TYPES[content_type]}"
        form = s3().generate_presigned_post(
            Bucket=bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_bytes]],
            ExpiresIn=UPLOAD_URL_SECONDS,
        )
        raw_keys.append(key)
        uploads.append({"key": key, "url": form["url"], "fields": form["fields"]})

    item = {
        "storeId": store_id,
        "productId": product_id,
        "status": "uploading",
        "rawKeys": raw_keys,
        "frameKeys": [],
        "copy": {},
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if name:
        item["name"] = name
    if notes:
        item["notes"] = notes
    if price is not None:
        item["price"] = price
    table("TABLE_PRODUCTS").put_item(Item=item)
    return response(201, {"productId": product_id, "uploads": uploads, "expiresIn": UPLOAD_URL_SECONDS})


@api
def handler(event, context):
    if event.get("routeKey") == "POST /api/stores/{storeId}/products":
        return create_product(event)
    raise ApiError(404, "not_found", "Unknown route.")
