"""HTTP helpers for API Gateway HTTP API (payload format 2.0)."""
import base64
import functools
import json
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_BODY_BYTES = 64 * 1024


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"Not serializable: {type(value).__name__}")


def response(status: int, body=None, headers: dict | None = None) -> dict:
    out = {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            **(headers or {}),
        },
    }
    if body is not None:
        out["body"] = json.dumps(body, default=_json_default, separators=(",", ":"))
    return out


def header(event: dict, name: str) -> str | None:
    """HTTP API lower-cases header names."""
    return (event.get("headers") or {}).get(name.lower())


def json_body(event: dict) -> dict:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8", errors="replace")
    if len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        raise ApiError(413, "payload_too_large", "Request body is too large.")
    try:
        data = json.loads(raw or "{}")
    except json.JSONDecodeError:
        raise ApiError(400, "invalid_json", "Request body must be valid JSON.") from None
    if not isinstance(data, dict):
        raise ApiError(400, "invalid_json", "Request body must be a JSON object.")
    return data


def api(fn):
    """Turn ApiError into a JSON error response and hide unexpected failures.

    Only the route and the error code are logged, never headers or bodies (they can carry secrets).
    """

    @functools.wraps(fn)
    def wrapper(event, context):
        route = event.get("routeKey", "?")
        try:
            result = fn(event, context)
            logger.info("route=%s status=%s", route, result.get("statusCode"))
            return result
        except ApiError as err:
            logger.info("route=%s status=%s code=%s", route, err.status, err.code)
            return response(err.status, {"error": err.code, "message": err.message})
        except Exception:  # noqa: BLE001 - last line of defence, response stays generic
            logger.exception("route=%s unexpected error", route)
            return response(500, {"error": "internal_error", "message": "Something went wrong."})

    return wrapper
