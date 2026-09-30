"""Public, code-free endpoints: published store, example store and view/click events."""
from boto3.dynamodb.conditions import Key

from common import limits
from common.aws import table
from common.config import env, env_int
from common.http import ApiError, api, json_body, response
from common.security import day_stamp, ip_hash
from common.stores import find_by_slug

VISIBLE = {"ready_360", "ready_3d"}
DAY = 86400


def _frame_url(key: str) -> str:
    return "/" + key.lstrip("/")


def _public_product(item: dict) -> dict:
    out = {
        "id": item["productId"],
        "status": item["status"],
        "frames": [_frame_url(k) for k in item.get("frameKeys", [])],
        "thumbs": [_frame_url(k) for k in item.get("thumbKeys", [])],
        "copy": item.get("copy", {}),
    }
    if item.get("sample"):
        out["sampleId"] = item["sample"]  # a demonstration product made from a sample photo set
    if item.get("replay"):
        out["replay"] = item["replay"]  # real per-step timings of the run that produced it, for replays
    for field in ("name", "price", "fidelityScore", "fidelityChecked"):
        if field in item:
            out[field] = item[field]
    if item.get("glbKey"):
        out["glb"] = _frame_url(item["glbKey"])
    return out


def _public_store(slug: str) -> dict:
    store = find_by_slug(slug)
    if not store or store.get("status") != "published":
        raise ApiError(404, "not_found", "Store not found.")
    items = table("TABLE_PRODUCTS").query(KeyConditionExpression=Key("storeId").eq(store["storeId"]))["Items"]
    products = [_public_product(p) for p in items if p.get("status") in VISIBLE]
    return {
        "slug": store["slug"],
        "name": store["name"],
        "brand": store.get("brand", {}),
        "whatsapp": store["whatsapp"],
        "currency": store["currency"],
        "demo": bool(store.get("demo")),
        "products": sorted(products, key=lambda p: p["id"]),
    }


def get_store(event: dict) -> dict:
    return response(200, _public_store((event.get("pathParameters") or {}).get("slug", "")))


def get_example(event: dict) -> dict:
    return response(200, _public_store(env("EXAMPLE_STORE_SLUG", "example")))


def record_event(event: dict) -> dict:
    body = json_body(event)
    kind, slug, product_id = body.get("type"), body.get("slug"), body.get("productId")
    if kind not in ("view", "click") or not isinstance(slug, str) or len(slug) > 80:
        raise ApiError(400, "invalid_request", "'type' must be 'view' or 'click' and 'slug' is required.")
    if product_id is not None and (not isinstance(product_id, str) or len(product_id) > 40):
        raise ApiError(400, "invalid_request", "'productId' is invalid.")
    store = find_by_slug(slug)
    if not store or store.get("status") != "published":
        raise ApiError(404, "not_found", "Store not found.")

    limits.bump(f"evt#{ip_hash(event)}#{day_stamp()}", 2 * DAY, limit=env_int("MAX_EVENTS_PER_DAY", 500))
    counter = "views" if kind == "view" else "clicks"
    stats = table("TABLE_STATS")
    for sort_key in ["STATS"] + ([f"P#{product_id}"] if product_id else []):
        stats.update_item(
            Key={"storeId": store["storeId"], "sk": sort_key},
            UpdateExpression="ADD #n :one",
            ExpressionAttributeNames={"#n": counter},
            ExpressionAttributeValues={":one": 1},
        )
    return {"statusCode": 204}


@api
def handler(event, context):
    route = event.get("routeKey")
    if route == "GET /api/public/stores/{slug}":
        return get_store(event)
    if route == "GET /api/public/example":
        return get_example(event)
    if route == "POST /api/public/events":
        return record_event(event)
    raise ApiError(404, "not_found", "Unknown route.")
