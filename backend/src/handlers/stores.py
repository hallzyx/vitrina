"""POST /api/stores (invite phrase required) and POST /api/stores/{storeId}/publish (edit token)."""
from boto3.dynamodb.conditions import Key

from common import limits
from common.access import require_code
from common.aws import table
from common.config import env_int
from common.http import ApiError, api, header, json_body, response
from common.security import day_stamp, ip_hash, is_allowlisted
from common.stores import create_store_record, now_iso, require_store
from common.validation import clean_brand, clean_currency, clean_text, clean_whatsapp

DAY = 86400
READY = {"ready_360", "ready_3d"}


def create_store(event: dict) -> dict:
    require_code(event, header(event, "x-access-code"))

    # Validate first so a typo never burns the visitor's daily quota.
    body = json_body(event)
    name = clean_text(body.get("name"), "name", 60)
    whatsapp = clean_whatsapp(body.get("whatsapp")) if body.get("whatsapp") else ""  # required later, at publish
    currency = clean_currency(body.get("currency"))
    brand = clean_brand(body.get("brand"))

    day = day_stamp()
    if not is_allowlisted(event):
        limits.bump(f"store#{ip_hash(event)}#{day}", 2 * DAY, limit=env_int("MAX_STORES_PER_DAY", 3))
    limits.bump(f"store#global#{day}", 2 * DAY, limit=env_int("MAX_GLOBAL_STORES_PER_DAY", 20))

    item, token = create_store_record(name, whatsapp, currency, brand)
    # The edit token is returned this once; only its hash is stored.
    return response(201, {"storeId": item["storeId"], "slug": item["slug"], "editToken": token})


def publish_store(event: dict) -> dict:
    store = require_store(event, (event.get("pathParameters") or {}).get("storeId"))
    if not store.get("whatsapp"):
        raise ApiError(400, "whatsapp_required", "Add a WhatsApp number before publishing.")
    products = table("TABLE_PRODUCTS").query(KeyConditionExpression=Key("storeId").eq(store["storeId"]))["Items"]
    if not any(p.get("status") in READY for p in products):
        raise ApiError(400, "no_ready_products", "Publish after at least one product has finished processing.")
    table("TABLE_STORES").update_item(
        Key={"storeId": store["storeId"]},
        UpdateExpression="SET #s = :published, publishedAt = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":published": "published", ":now": now_iso()},
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
