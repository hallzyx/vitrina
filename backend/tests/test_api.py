import boto3
from conftest import INVITE, call

from handlers import access, products, public, stores

STORE_BODY = {"name": "Casa Arcilla", "whatsapp": "+51 999 000 111", "currency": "pen"}


def new_store(ip="203.0.113.7"):
    status, body = call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE}, ip=ip)
    assert status == 201
    return body


def edit_headers(store):
    return {"X-Edit-Token": store["editToken"]}


def add_ready_product(store, product_id="READY", **extra):
    boto3.resource("dynamodb").Table("products").put_item(
        Item={
            "storeId": store["storeId"], "productId": product_id, "status": "ready_360", "name": "Ready vase",
            "frameKeys": ["media/x/READY/f01.webp"], "thumbKeys": ["media/x/READY/t01.webp"],
            "copy": {"en": {"name": "Ready vase", "description": "d"}, "es": {"name": "Jarrón", "description": "d"}}, **extra,
        }
    )


def create_product(store, **overrides):
    body = {"photoCount": 12, "name": "Vase", "price": 48, **overrides}
    return call(
        products.handler,
        "POST /api/stores/{storeId}/products",
        body,
        edit_headers(store),
        path={"storeId": store["storeId"]},
    )


# --- invite phrase -----------------------------------------------------------------------------


def test_verify_accepts_the_right_phrase_and_rejects_others():
    assert call(access.handler, "POST /api/access/verify", {"code": INVITE})[0] == 200
    status, body = call(access.handler, "POST /api/access/verify", {"code": "nope"})
    assert (status, body["error"]) == (401, "invalid_code")
    assert call(access.handler, "POST /api/access/verify", {})[0] == 400


def test_verify_locks_an_ip_after_repeated_failures():
    for _ in range(3):
        assert call(access.handler, "POST /api/access/verify", {"code": "bad"})[0] == 401
    status, body = call(access.handler, "POST /api/access/verify", {"code": INVITE})
    assert (status, body["error"]) == (429, "too_many_attempts")
    # Another visitor is not affected.
    assert call(access.handler, "POST /api/access/verify", {"code": INVITE}, ip="198.51.100.9")[0] == 200


def test_cloudfront_viewer_address_is_used_as_client_identity():
    for _ in range(3):
        call(access.handler, "POST /api/access/verify", {"code": "bad"}, {"CloudFront-Viewer-Address": "198.51.100.5:4711"})
    same = call(access.handler, "POST /api/access/verify", {"code": INVITE}, {"CloudFront-Viewer-Address": "198.51.100.5:9999"})
    other = call(access.handler, "POST /api/access/verify", {"code": INVITE}, {"CloudFront-Viewer-Address": "198.51.100.6:4711"})
    assert (same[0], other[0]) == (429, 200)


# --- stores -------------------------------------------------------------------------------------


def test_create_store_requires_the_phrase():
    assert call(stores.handler, "POST /api/stores", STORE_BODY)[0] == 401
    assert call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": "nope"})[0] == 401


def test_create_store_returns_the_token_once_and_stores_only_its_hash():
    store = new_store()
    assert store["slug"].startswith("casa-arcilla-")
    assert len(store["editToken"]) >= 43  # 256 bits, url-safe base64

    item = boto3.resource("dynamodb").Table("stores").get_item(Key={"storeId": store["storeId"]})["Item"]
    assert item["editTokenHash"] != store["editToken"]
    assert store["editToken"] not in str(item)
    assert item["whatsapp"] == "51999000111" and item["currency"] == "PEN" and item["status"] == "draft"


def test_create_store_validates_input():
    headers = {"X-Access-Code": INVITE}
    assert call(stores.handler, "POST /api/stores", {**STORE_BODY, "whatsapp": "123"}, headers)[0] == 400
    assert call(stores.handler, "POST /api/stores", {**STORE_BODY, "name": ""}, headers)[0] == 400
    assert call(stores.handler, "POST /api/stores", {**STORE_BODY, "currency": "XXX"}, headers)[0] == 400
    assert call(stores.handler, "POST /api/stores", {**STORE_BODY, "brand": {"colors": ["red"]}}, headers)[0] == 400
    # Rejected requests must not consume the daily quota (3 stores/day in the test config).
    for _ in range(3):
        new_store()


def test_create_store_is_limited_per_visitor_per_day():
    for _ in range(3):
        new_store()
    status, body = call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE})
    assert (status, body["error"]) == (429, "limit_reached")


def test_publish_needs_the_edit_token():
    store = new_store()
    add_ready_product(store)
    route, path = "POST /api/stores/{storeId}/publish", {"storeId": store["storeId"]}
    assert call(stores.handler, route, path=path)[0] == 403
    assert call(stores.handler, route, headers={"X-Edit-Token": "wrong"}, path=path)[0] == 403
    # A valid token of this store used against another store id must not reveal whether it exists.
    assert call(stores.handler, route, headers=edit_headers(store), path={"storeId": "missing"})[0] == 403
    assert call(stores.handler, route, headers=edit_headers(store), path=path) == (200, {"slug": store["slug"], "status": "published"})


def test_publish_requires_a_whatsapp_number_and_a_finished_product():
    route = "POST /api/stores/{storeId}/publish"
    no_number = call(stores.handler, "POST /api/stores", {"name": "No Number"}, {"X-Access-Code": INVITE}, ip="198.51.100.20")[1]
    add_ready_product(no_number)
    status, body = call(stores.handler, route, headers=edit_headers(no_number), path={"storeId": no_number["storeId"]})
    assert (status, body["error"]) == (400, "whatsapp_required")

    store = new_store()
    status, body = call(stores.handler, route, headers=edit_headers(store), path={"storeId": store["storeId"]})
    assert (status, body["error"]) == (400, "no_ready_products")
    create_product(store)  # still uploading: does not count
    status, body = call(stores.handler, route, headers=edit_headers(store), path={"storeId": store["storeId"]})
    assert (status, body["error"]) == (400, "no_ready_products")


def test_the_edit_token_carries_the_store_id_and_is_not_stored():
    store = new_store()
    assert store["editToken"].startswith(store["storeId"] + ".") and len(store["editToken"]) > 60
    item = boto3.resource("dynamodb").Table("stores").get_item(Key={"storeId": store["storeId"]})["Item"]
    assert store["editToken"] not in str(item)


# --- products -----------------------------------------------------------------------------------


def test_create_product_returns_constrained_upload_forms():
    store = new_store()
    status, body = create_product(store)
    assert status == 201 and len(body["uploads"]) == 12
    first = body["uploads"][0]
    assert first["key"] == f"raw/{store['storeId']}/{body['productId']}/01.jpg"
    assert first["fields"]["Content-Type"] == "image/jpeg"

    row = boto3.resource("dynamodb").Table("products").get_item(Key={"storeId": store["storeId"], "productId": body["productId"]})["Item"]
    assert row["status"] == "uploading" and len(row["rawKeys"]) == 12


def test_create_product_rejects_bad_requests():
    store = new_store()
    assert call(products.handler, "POST /api/stores/{storeId}/products", {"photoCount": 12}, path={"storeId": store["storeId"]})[0] == 403
    assert create_product(store, photoCount=3)[0] == 400
    assert create_product(store, photoCount=99)[0] == 400
    assert create_product(store, contentTypes=["image/gif"] * 12)[0] == 400
    assert create_product(store, price="abc")[0] == 400


def test_create_product_is_limited_per_visitor_per_day():
    store = new_store()
    for _ in range(3):
        assert create_product(store)[0] == 201
    status, body = create_product(store)
    assert (status, body["error"]) == (429, "limit_reached")


def test_a_token_from_one_store_does_not_open_another():
    first, second = new_store(ip="198.51.100.1"), new_store(ip="198.51.100.2")
    status, _ = call(
        products.handler, "POST /api/stores/{storeId}/products", {"photoCount": 12}, edit_headers(first), path={"storeId": second["storeId"]}
    )
    assert status == 403


# --- public -------------------------------------------------------------------------------------


def publish(store):
    add_ready_product(store)
    return call(stores.handler, "POST /api/stores/{storeId}/publish", headers=edit_headers(store), path={"storeId": store["storeId"]})


def test_unpublished_stores_are_not_public():
    store = new_store()
    assert call(public.handler, "GET /api/public/stores/{slug}", path={"slug": store["slug"]})[0] == 404


def test_public_store_hides_secrets_and_unfinished_products():
    store = new_store()
    _, created = create_product(store)  # still uploading: must stay hidden
    publish(store)  # adds one finished product, "READY"
    status, body = call(public.handler, "GET /api/public/stores/{slug}", path={"slug": store["slug"]})
    assert status == 200
    assert [p["id"] for p in body["products"]] == ["READY"]
    assert body["products"][0]["frames"] == ["/media/x/READY/f01.webp"]
    assert body["products"][0]["thumbs"] == ["/media/x/READY/t01.webp"] and body["demo"] is False
    dumped = str(body)
    assert "editTokenHash" not in dumped and store["editToken"] not in dumped and created["productId"] not in dumped


def test_demo_products_expose_their_sample_and_the_timings_of_their_recorded_run():
    store = new_store()
    add_ready_product(store, sample="elephant_carved", replay={"totalMs": 38500, "steps": [{"step": "validate", "ms": 3700}]})
    call(stores.handler, "POST /api/stores/{storeId}/publish", headers=edit_headers(store), path={"storeId": store["storeId"]})
    _, body = call(public.handler, "GET /api/public/stores/{slug}", path={"slug": store["slug"]})
    product = body["products"][0]
    assert product["sampleId"] == "elephant_carved" and product["replay"]["steps"][0] == {"step": "validate", "ms": 3700}


def test_example_store_is_public_without_any_code():
    assert call(public.handler, "GET /api/public/example")[0] == 404  # not seeded yet
    boto3.resource("dynamodb").Table("stores").put_item(
        Item={"storeId": "EX", "slug": "example", "name": "Example", "whatsapp": "1", "currency": "USD", "status": "published", "editTokenHash": "x"}
    )
    status, body = call(public.handler, "GET /api/public/example")
    assert status == 200 and body["slug"] == "example"


def test_events_count_views_and_clicks():
    store = new_store()
    publish(store)
    for kind in ("view", "view", "click"):
        assert call(public.handler, "POST /api/public/events", {"type": kind, "slug": store["slug"], "productId": "P1"})[0] == 204
    stats = boto3.resource("dynamodb").Table("stats")
    total = stats.get_item(Key={"storeId": store["storeId"], "sk": "STATS"})["Item"]
    per_product = stats.get_item(Key={"storeId": store["storeId"], "sk": "P#P1"})["Item"]
    assert (total["views"], total["clicks"], per_product["views"]) == (2, 1, 2)
    assert call(public.handler, "POST /api/public/events", {"type": "hack", "slug": store["slug"]})[0] == 400
    assert call(public.handler, "POST /api/public/events", {"type": "view", "slug": "missing"})[0] == 404
