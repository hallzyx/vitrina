"""The creator's dashboard and edits, all authorized by the edit token.

GET  /api/me                                  store, products (with progress) and counters
PUT  /api/stores/{storeId}                    name, WhatsApp, currency, brand
PUT  /api/stores/{storeId}/products/{id}      price and the bilingual listing
"""
from boto3.dynamodb.conditions import Key

from common.aws import table
from common.http import ApiError, api, json_body, response
from common.stores import require_store
from common.validation import clean_brand, clean_currency, clean_price, clean_text, clean_whatsapp

MAX_NAME, MAX_DESCRIPTION = 80, 400
READY = {"ready_360", "ready_3d"}


def _urls(keys):
    return ["/" + k.lstrip("/") for k in keys or []]


def _store_view(store: dict) -> dict:
    return {
        "storeId": store["storeId"],
        "slug": store["slug"],
        "name": store["name"],
        "whatsapp": store.get("whatsapp", ""),
        "currency": store["currency"],
        "brand": store.get("brand", {}),
        "status": store["status"],
        "demo": bool(store.get("demo")),
    }


def _product_view(item: dict) -> dict:
    out = {
        "id": item["productId"],
        "status": item["status"],
        "step": item.get("step"),
        "createdAt": item.get("createdAt"),
        "frames": _urls(item.get("frameKeys")),
        "thumbs": _urls(item.get("thumbKeys")),
        "copy": item.get("copy", {}),
        "sampleId": item.get("sample"),
    }
    for field in ("name", "price", "fidelityScore", "fidelityChecked", "error"):
        if field in item:
            out[field] = item[field]
    return out


def me(event: dict) -> dict:
    store = require_store(event)
    sid = store["storeId"]
    products = table("TABLE_PRODUCTS").query(KeyConditionExpression=Key("storeId").eq(sid))["Items"]
    stats = table("TABLE_STATS").query(KeyConditionExpression=Key("storeId").eq(sid))["Items"]
    totals = {"views": 0, "clicks": 0}
    per_product: dict[str, dict] = {}
    for row in stats:
        counts = {"views": int(row.get("views", 0)), "clicks": int(row.get("clicks", 0))}
        if row["sk"] == "STATS":
            totals = counts
        elif row["sk"].startswith("P#"):
            per_product[row["sk"][2:]] = counts
    return response(
        200,
        {
            "store": _store_view(store),
            "products": [_product_view(p) for p in sorted(products, key=lambda p: p["productId"])],
            "stats": {**totals, "products": per_product},
        },
    )


def update_store(event: dict) -> dict:
    store = require_store(event, (event.get("pathParameters") or {}).get("storeId"))
    body = json_body(event)
    changes: dict = {}
    if "name" in body:
        changes["name"] = clean_text(body["name"], "name", 60)
    if "whatsapp" in body:
        changes["whatsapp"] = clean_whatsapp(body["whatsapp"])
    if "currency" in body:
        changes["currency"] = clean_currency(body["currency"])
    if "brand" in body:
        changes["brand"] = clean_brand(body["brand"])
    if not changes:
        raise ApiError(400, "invalid_request", "Nothing to update.")
    names = {f"#n{i}": key for i, key in enumerate(changes)}
    values = {f":v{i}": value for i, value in enumerate(changes.values())}
    expression = "SET " + ", ".join(f"#n{i} = :v{i}" for i in range(len(changes)))
    updated = table("TABLE_STORES").update_item(
        Key={"storeId": store["storeId"]},
        UpdateExpression=expression,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )["Attributes"]
    return response(200, {"store": _store_view(updated)})


def _clean_copy(value) -> dict:
    if not isinstance(value, dict):
        raise ApiError(400, "invalid_request", "'copy' must be an object with 'en' and 'es'.")
    copy = {}
    for lang in ("en", "es"):
        block = value.get(lang)
        if not isinstance(block, dict):
            raise ApiError(400, "invalid_request", f"'copy.{lang}' is required.")
        copy[lang] = {
            "name": clean_text(block.get("name"), f"copy.{lang}.name", MAX_NAME),
            "description": clean_text(block.get("description"), f"copy.{lang}.description", MAX_DESCRIPTION, required=False) or "",
        }
    return copy


def update_product(event: dict) -> dict:
    path = event.get("pathParameters") or {}
    store = require_store(event, path.get("storeId"))
    product_id = path.get("productId")
    if not product_id or len(product_id) > 40:
        raise ApiError(404, "not_found", "Product not found.")
    key = {"storeId": store["storeId"], "productId": product_id}
    if not table("TABLE_PRODUCTS").get_item(Key=key).get("Item"):
        raise ApiError(404, "not_found", "Product not found.")
    body = json_body(event)
    parts, names, values = [], {}, {}
    if "copy" in body:
        parts.append("#c = :c"), names.update({"#c": "copy"}), values.update({":c": _clean_copy(body["copy"])})
    if "price" in body:
        price = clean_price(body["price"])
        if price is None:
            raise ApiError(400, "invalid_request", "'price' must be a number.")
        parts.append("price = :p"), values.update({":p": price})
    if not parts:
        raise ApiError(400, "invalid_request", "Nothing to update.")
    kwargs = {"ExpressionAttributeNames": names} if names else {}
    updated = table("TABLE_PRODUCTS").update_item(
        Key=key,
        UpdateExpression="SET " + ", ".join(parts),
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
        **kwargs,
    )["Attributes"]
    return response(200, {"product": _product_view(updated)})


@api
def handler(event, context):
    route = event.get("routeKey")
    if route == "GET /api/me":
        return me(event)
    if route == "PUT /api/stores/{storeId}":
        return update_store(event)
    if route == "PUT /api/stores/{storeId}/products/{productId}":
        return update_product(event)
    raise ApiError(404, "not_found", "Unknown route.")
