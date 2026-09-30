"""POST /api/access/verify: check the invite phrase without side effects."""
from common.access import require_code
from common.http import ApiError, api, json_body, response


@api
def handler(event, context):
    code = json_body(event).get("code")
    if not isinstance(code, str):
        raise ApiError(400, "invalid_request", "'code' is required.")
    require_code(event, code)
    return response(200, {"ok": True})
