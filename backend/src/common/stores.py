"""Store lookups and edit-token authorization."""
from boto3.dynamodb.conditions import Key

from .aws import table
from .http import ApiError, header
from .security import hash_token, safe_equal


def get_store(store_id: str) -> dict | None:
    return table("TABLE_STORES").get_item(Key={"storeId": store_id}).get("Item")


def find_by_slug(slug: str) -> dict | None:
    result = table("TABLE_STORES").query(
        IndexName="slug-index", KeyConditionExpression=Key("slug").eq(slug), Limit=1
    )
    items = result.get("Items") or []
    return items[0] if items else None


def require_store(event: dict, store_id: str | None) -> dict:
    """Return the store if the request carries its edit token; 404 if missing, 403 if the token is wrong."""
    if not store_id or len(store_id) > 40:
        raise ApiError(404, "not_found", "Store not found.")
    store = get_store(store_id)
    if not store:
        raise ApiError(404, "not_found", "Store not found.")
    token = header(event, "x-edit-token")
    if not token or len(token) > 200 or not safe_equal(hash_token(token), store["editTokenHash"]):
        raise ApiError(403, "forbidden", "A valid edit token is required.")
    return store
