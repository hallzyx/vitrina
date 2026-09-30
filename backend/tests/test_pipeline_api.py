import boto3
from conftest import INVITE, call

from handlers import pipeline_api, products, stores

STORE_BODY = {"name": "Casa Arcilla", "whatsapp": "+51 999 000 111"}


class FakeStepFunctions:
    def __init__(self):
        self.started = []

    def start_execution(self, **kwargs):
        self.started.append(kwargs)
        return {"executionArn": "arn:fake"}


def setup_product(monkeypatch, uploaded=12):
    fake = FakeStepFunctions()
    monkeypatch.setattr(pipeline_api, "stepfunctions", lambda: fake)
    _, store = call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE})
    _, product = call(
        products.handler, "POST /api/stores/{storeId}/products", {"photoCount": 12}, {"X-Edit-Token": store["editToken"]}, path={"storeId": store["storeId"]}
    )
    s3 = boto3.client("s3")
    for upload in product["uploads"][:uploaded]:
        s3.put_object(Bucket="raw-bucket", Key=upload["key"], Body=b"x")
    path = {"storeId": store["storeId"], "productId": product["productId"]}
    return fake, store, product, path


def start(store, path, code=INVITE, token=True):
    headers = {"X-Access-Code": code} if code else {}
    if token:
        headers["X-Edit-Token"] = store["editToken"]
    return call(pipeline_api.handler, "POST /api/stores/{storeId}/products/{productId}/start", headers=headers, path=path)


def status(store, path, token=True):
    headers = {"X-Edit-Token": store["editToken"]} if token else {}
    return call(pipeline_api.handler, "GET /api/stores/{storeId}/products/{productId}/status", headers=headers, path=path)


def test_start_needs_the_invite_phrase_and_the_edit_token(monkeypatch):
    fake, store, _, path = setup_product(monkeypatch)
    assert start(store, path, code=None)[0] == 401
    assert start(store, path, code="nope")[0] == 401
    assert start(store, path, token=False)[0] == 403
    assert fake.started == []


def test_start_requires_enough_uploaded_photos(monkeypatch):
    fake, store, _, path = setup_product(monkeypatch, uploaded=4)
    status_code, body = start(store, path)
    assert (status_code, body["error"]) == (400, "missing_uploads")
    assert fake.started == []


def test_start_launches_the_pipeline_once(monkeypatch):
    fake, store, product, path = setup_product(monkeypatch)
    assert start(store, path) == (202, {"status": "processing"})
    assert len(fake.started) == 1
    sent = fake.started[0]
    assert sent["name"] == f"{product['productId']}-1" and sent["stateMachineArn"].endswith(":test")
    assert '"storeId"' in sent["input"] and store["editToken"] not in sent["input"]
    code, body = start(store, path)
    assert (code, body["error"]) == (409, "already_started")
    assert len(fake.started) == 1


def test_a_failed_product_can_be_retried_a_limited_number_of_times(monkeypatch):
    fake, store, _, path = setup_product(monkeypatch)
    table = boto3.resource("dynamodb").Table("products")
    key = {"storeId": path["storeId"], "productId": path["productId"]}
    for attempt in (1, 2, 3):
        assert start(store, path)[0] == 202
        table.update_item(Key=key, UpdateExpression="SET #s = :f", ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":f": "failed"})
    code, body = start(store, path)
    assert (code, body["error"]) == (429, "too_many_attempts")
    assert [s["name"][-2:] for s in fake.started] == ["-1", "-2", "-3"]


def test_status_reports_progress_and_needs_the_token(monkeypatch):
    _, store, _, path = setup_product(monkeypatch)
    assert status(store, path, token=False)[0] == 403
    start(store, path)
    table = boto3.resource("dynamodb").Table("products")
    table.update_item(
        Key={"storeId": path["storeId"], "productId": path["productId"]},
        UpdateExpression="SET #step = :s, photosDone = :d",
        ExpressionAttributeNames={"#step": "step"},
        ExpressionAttributeValues={":s": "background", ":d": 5},
    )
    code, body = status(store, path)
    assert code == 200 and body["status"] == "processing" and body["step"] == "background"
    assert body["stepIndex"] == 1 and body["totalSteps"] == 7 and body["photos"]["done"] == 5


def test_status_of_a_ready_product_includes_frames_copy_and_brand(monkeypatch):
    _, store, _, path = setup_product(monkeypatch)
    boto3.resource("dynamodb").Table("products").update_item(
        Key={"storeId": path["storeId"], "productId": path["productId"]},
        UpdateExpression="SET #s = :r, frameKeys = :f, thumbKeys = :t, #c = :c",
        ExpressionAttributeNames={"#s": "status", "#c": "copy"},
        ExpressionAttributeValues={":r": "ready_360", ":f": ["media/a/f01.webp"], ":t": ["media/a/t01.webp"], ":c": {"en": {"name": "Vase", "description": "d"}}},
    )
    code, body = status(store, path)
    assert code == 200 and body["frames"] == ["/media/a/f01.webp"] and body["copy"]["en"]["name"] == "Vase"


def test_failed_status_carries_a_code(monkeypatch):
    _, store, _, path = setup_product(monkeypatch)
    boto3.resource("dynamodb").Table("products").update_item(
        Key={"storeId": path["storeId"], "productId": path["productId"]},
        UpdateExpression="SET #s = :f, #e = :e",
        ExpressionAttributeNames={"#s": "status", "#e": "error"},
        ExpressionAttributeValues={":f": "failed", ":e": {"code": "low_fidelity", "message": "m"}},
    )
    code, body = status(store, path)
    assert code == 200 and body["status"] == "failed" and body["error"]["code"] == "low_fidelity"
