"""POST .../products/{productId}/start (invite phrase + edit token) and GET .../status (edit token)."""
import json

from botocore.exceptions import ClientError

from common.access import require_code
from common.aws import s3, stepfunctions, table
from common.config import env, env_int
from common.http import ApiError, api, header, response
from common.stores import require_store

# Must match STEPS in backend/pipeline/core.py.
STEPS = ["validate", "background", "align", "fidelity", "brand", "listing", "ready"]
MAX_ATTEMPTS = 3
_MISSING = {"404", "NoSuchKey", "NotFound"}


def _product(store_id: str, product_id: str | None) -> dict:
    if not product_id or len(product_id) > 40:
        raise ApiError(404, "not_found", "Product not found.")
    item = table("TABLE_PRODUCTS").get_item(Key={"storeId": store_id, "productId": product_id}).get("Item")
    if not item:
        raise ApiError(404, "not_found", "Product not found.")
    return item


def start(event: dict) -> dict:
    # This is the step that spends money (Bedrock, compute), so the invite phrase is checked first.
    require_code(event, header(event, "x-access-code"))
    path = event.get("pathParameters") or {}
    store = require_store(event, path.get("storeId"))
    product = _product(store["storeId"], path.get("productId"))

    if product["status"] not in ("uploading", "failed"):
        raise ApiError(409, "already_started", "This product is already being processed or is ready.")
    attempts = int(product.get("attempts", 0))
    if attempts >= MAX_ATTEMPTS:
        raise ApiError(429, "too_many_attempts", "This product has reached its processing attempts. Create it again.")

    present = 0
    for key in product["rawKeys"]:
        try:
            s3().head_object(Bucket=env("BUCKET_RAW"), Key=key)
            present += 1
        except ClientError as err:
            if err.response["Error"]["Code"] not in _MISSING:
                raise
    minimum = env_int("MIN_PHOTOS", 6)
    if present < minimum:
        raise ApiError(400, "missing_uploads", f"Only {present} photos were uploaded; at least {minimum} are needed.")

    try:
        table("TABLE_PRODUCTS").update_item(
            Key={"storeId": store["storeId"], "productId": product["productId"]},
            UpdateExpression="SET #s = :processing, #step = :first, attempts = if_not_exists(attempts, :zero) + :one, photosDone = :zero REMOVE #err",
            ConditionExpression="#s IN (:uploading, :failed)",
            ExpressionAttributeNames={"#s": "status", "#step": "step", "#err": "error"},
            ExpressionAttributeValues={
                ":processing": "processing", ":first": STEPS[0], ":zero": 0, ":one": 1,
                ":uploading": "uploading", ":failed": "failed",
            },
        )
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(409, "already_started", "This product is already being processed.") from None
        raise

    stepfunctions().start_execution(
        stateMachineArn=env("STATE_MACHINE_ARN"),
        name=f"{product['productId']}-{attempts + 1}",
        input=json.dumps({"storeId": store["storeId"], "productId": product["productId"]}),
    )
    return response(202, {"status": "processing"})


def _url(key: str) -> str:
    return "/" + key.lstrip("/")


def status(event: dict) -> dict:
    path = event.get("pathParameters") or {}
    store = require_store(event, path.get("storeId"))
    product = _product(store["storeId"], path.get("productId"))
    current = product["status"]
    step = product.get("step")
    out = {
        "status": current,
        "step": step,
        "stepIndex": STEPS.index(step) if step in STEPS else 0,
        "totalSteps": len(STEPS),
        "photos": {"done": int(product.get("photosDone", 0)), "total": int(product.get("photosTotal", len(product["rawKeys"])))},
    }
    if current == "failed":
        out["error"] = product.get("error", {"code": "internal_error", "message": "Processing failed."})
    if current in ("ready_360", "ready_3d"):
        out.update(
            {
                "frames": [_url(k) for k in product.get("frameKeys", [])],
                "thumbs": [_url(k) for k in product.get("thumbKeys", [])],
                "copy": product.get("copy", {}),
                "fidelityScore": product.get("fidelityScore"),
                "fidelityChecked": product.get("fidelityChecked"),
                "brand": store.get("brand", {}),
            }
        )
    return response(200, out)


@api
def handler(event, context):
    route = event.get("routeKey")
    if route == "POST /api/stores/{storeId}/products/{productId}/start":
        return start(event)
    if route == "GET /api/stores/{storeId}/products/{productId}/status":
        return status(event)
    raise ApiError(404, "not_found", "Unknown route.")
