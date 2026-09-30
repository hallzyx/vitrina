from common.http import api, response


@api
def handler(event, context):
    return response(200, {"status": "ok", "service": "vitrina"})
