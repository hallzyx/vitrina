"""Store records and edit-token authorization.

The edit token is `<storeId>.<secret>`: the store id lets one header identify the store (so the edit
link alone opens the dashboard), and the secret carries 256 random bits. Only the SHA-256 of the whole
token is stored.
"""
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from .aws import table
from .http import ApiError, header
from .ids import ulid
from .security import hash_token, new_edit_token, safe_equal
from .validation import slugify


def get_store(store_id: str) -> dict | None:
    return table("TABLE_STORES").get_item(Key={"storeId": store_id}).get("Item")


def find_by_slug(slug: str) -> dict | None:
    result = table("TABLE_STORES").query(
        IndexName="slug-index", KeyConditionExpression=Key("slug").eq(slug), Limit=1
    )
    items = result.get("Items") or []
    return items[0] if items else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create_store_record(name: str, whatsapp: str, currency: str, brand: dict, demo: bool = False) -> tuple[dict, str]:
    """Insert a draft store and return (item, editToken). The token is shown to its owner only once."""
    store_id = ulid()
    for _ in range(5):
        slug = slugify(name)
        if not find_by_slug(slug):
            break
    else:
        raise ApiError(503, "try_again", "Could not allocate a store address. Please retry.")
    token = f"{store_id}.{new_edit_token()}"
    item = {
        "storeId": store_id,
        "slug": slug,
        "name": name,
        "whatsapp": whatsapp,
        "currency": currency,
        "brand": brand,
        "status": "draft",
        "createdAt": now_iso(),
        "editTokenHash": hash_token(token),
    }
    if demo:
        item["demo"] = True
    table("TABLE_STORES").put_item(Item=item, ConditionExpression="attribute_not_exists(storeId)")
    return item, token


def require_store(event: dict, store_id: str | None = None) -> dict:
    """The store the request's edit token belongs to.

    The token names its own store, so a token can only ever open that one. With a `store_id` (from the
    path) it must match. Every failure (no token, wrong token, another store's token, a store that does
    not exist) is the same 403, so nothing reveals which stores exist.
    """
    denied = ApiError(403, "forbidden", "A valid edit token is required.")
    token = header(event, "x-edit-token")
    if not token or len(token) > 200:
        raise denied
    target = token.partition(".")[0]
    if not target or len(target) > 40 or (store_id is not None and store_id != target):
        raise denied
    store = get_store(target)
    if not store or not safe_equal(hash_token(token), store["editTokenHash"]):
        raise denied
    return store
