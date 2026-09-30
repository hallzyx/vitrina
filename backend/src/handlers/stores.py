"""POST /api/stores (invite phrase required) and POST /api/stores/{storeId}/publish (edit token)."""
from datetime import datetime, timezone

from common import limits
from common.access import require_code
from common.aws import table
from common.config import env_int
from common.http import ApiError, api, header, json_body, response
from common.ids import ulid
from common.security import day_stamp, hash_token, ip_hash, new_edit_token
from common.stores import find_by_slug, require_store
from common.validation import clean_brand, clean_currency, clean_text, clean_whatsapp, slugify

DAY = 86400


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create_store(event: dict) -> dict:
    require_code(event, header(event, "x-access-code"))

    # Validate first so a typo never burns the visitor's daily quota.
    body = json_body(event)
    name = clean_text(body.get("name"), "name", 60)
    item = {
        "storeId": ulid(),
        "name": name,
        "whatsapp": clean_whatsapp(body.get("whatsapp")),
        "currency": clean_currency(body.get("currency")),
        "brand": clean_brand(body.get("brand")),
        "status": "draft",
        "createdAt": _now(),
    }

    day = day_stamp()
    limits.bump(f"store#{ip_hash(event)}#{day}", 2 * DAY, limit=env_int("MAX_STORES_PER_DAY", 3))
    limits.bump(f"store#global#{day}", 2 * DAY, limit=env_int("MAX_GLOBAL_STORES_PER_DAY", 20))

    for _ in range(5):
        slug = slugify(name)
        if not find_by_slug(slug):
            break
    else:
        raise ApiError(503, "try_again", "Could not allocate a store address. Please retry.")
    item["slug"] = slug

    token = new_edit_token()
    item["editTokenHash"] = hash_token(token)
    table("TABLE_STORES").put_item(Item=item, ConditionExpression="attribute_not_exists(storeId)")
    # The edit token is returned this once; only its hash is stored.
    return response(201, {"storeId": item["storeId"], "slug": slug, "editToken": token})


def publish_store(event: dict) -> dict:
    store = require_store(event, (event.get("pathParameters") or {}).get("storeId"))
    table("TABLE_STORES").update_item(
        Key={"storeId": store["storeId"]},
        UpdateExpression="SET #s = :published, publishedAt = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":published": "published", ":now": _now()},
    )
    return response(200, {"slug": store["slug"], "status": "published"})


@api
def handler(event, context):
    route = event.get("routeKey", "")
    if route == "POST /api/stores":
        return create_store(event)
    if route == "POST /api/stores/{storeId}/publish":
        return publish_store(event)
    raise ApiError(404, "not_found", "Unknown route.")
