"""Atomic counters in the Limits table (PK `visitorKey`, TTL attribute `expiresAt`)."""
import time

from botocore.exceptions import ClientError

from .aws import table
from .http import ApiError


def _limits():
    return table("TABLE_LIMITS")


def count(key: str) -> int:
    item = _limits().get_item(Key={"visitorKey": key}, ConsistentRead=True).get("Item")
    return int(item["count"]) if item else 0


def bump(key: str, ttl_seconds: int, limit: int | None = None) -> int:
    """Increment a counter. With `limit`, raise 429 instead of exceeding it."""
    kwargs = {}
    if limit is not None:
        kwargs["ConditionExpression"] = "attribute_not_exists(#c) OR #c < :limit"
    names = {"#c": "count"}
    values = {":one": 1, ":exp": int(time.time()) + ttl_seconds}
    if limit is not None:
        values[":limit"] = limit
    try:
        result = _limits().update_item(
            Key={"visitorKey": key},
            UpdateExpression="ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)",
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ReturnValues="UPDATED_NEW",
            **kwargs,
        )
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(429, "limit_reached", "Daily limit reached. Please try again tomorrow.") from None
        raise
    return int(result["Attributes"]["count"])
