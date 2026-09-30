from decimal import Decimal

import boto3
from conftest import INVITE, call

from handlers import manage, products, stores

BODY = {"name": "Casa Arcilla", "whatsapp": "+51 999 000 111"}


def new_store(ip="203.0.113.7"):
    status, store = call(stores.handler, "POST /api/stores", BODY, {"X-Access-Code": INVITE}, ip=ip)
    assert status == 201
    return store


def token(store):
    return {"X-Edit-Token": store["editToken"]}


def seed_product(store, product_id="P1", **extra):
    boto3.resource("dynamodb").Table("products").put_item(
        Item={
            "storeId": store["storeId"], "productId": product_id, "status": "ready_360", "frameKeys": ["media/s/p/f01.webp"],
            "thumbKeys": ["media/s/p/t01.webp"], "copy": {"en": {"name": "Vase", "description": "d"}, "es": {"name": "Jarrón", "description": "d"}},
            "rawKeys": ["raw/s/p/01.jpg"], "fidelityScore": Decimal("0.97"), **extra,
        }
    )


def test_me_needs_only_the_edit_token_and_never_reveals_which_stores_exist():
    store = new_store()
    assert call(manage.handler, "GET /api/me")[0] == 403
    assert call(manage.handler, "GET /api/me", headers={"X-Edit-Token": "nope"})[0] == 403
    assert call(manage.handler, "GET /api/me", headers={"X-Edit-Token": "MISSINGSTORE.secret"})[0] == 403
    forged = store["storeId"] + ".not-the-secret"
    assert call(manage.handler, "GET /api/me", headers={"X-Edit-Token": forged})[0] == 403
    status, body = call(manage.handler, "GET /api/me", headers=token(store))
    assert status == 200 and body["store"]["slug"] == store["slug"] and body["store"]["whatsapp"] == "51999000111"
    assert "editTokenHash" not in str(body)


def test_me_lists_products_with_progress_and_counters():
    store = new_store()
    seed_product(store, "P1")
    seed_product(store, "P2", status="processing", step="background", photosDone=5)
    stats = boto3.resource("dynamodb").Table("stats")
    stats.put_item(Item={"storeId": store["storeId"], "sk": "STATS", "views": 12, "clicks": 3})
    stats.put_item(Item={"storeId": store["storeId"], "sk": "P#P1", "views": 7, "clicks": 2})
    _, body = call(manage.handler, "GET /api/me", headers=token(store))
    assert [p["id"] for p in body["products"]] == ["P1", "P2"]
    assert body["products"][1]["step"] == "background" and body["products"][0]["frames"] == ["/media/s/p/f01.webp"]
    assert body["stats"]["views"] == 12 and body["stats"]["clicks"] == 3 and body["stats"]["products"]["P1"] == {"views": 7, "clicks": 2}


def test_a_token_only_opens_its_own_store():
    first, second = new_store("198.51.100.1"), new_store("198.51.100.2")
    status, body = call(manage.handler, "GET /api/me", headers=token(first))
    assert body["store"]["storeId"] == first["storeId"]
    status, _ = call(manage.handler, "PUT /api/stores/{storeId}", {"name": "Hijack"}, token(first), path={"storeId": second["storeId"]})
    assert status == 403


def test_update_store_validates_and_persists():
    store = new_store()
    path = {"storeId": store["storeId"]}
    status, body = call(manage.handler, "PUT /api/stores/{storeId}", {"name": "  Nuevo  Nombre ", "whatsapp": "+51 988 777 666", "currency": "eur", "brand": {"colors": ["#C2623F"], "tone": "rustic", "displayName": "Sol"}}, token(store), path=path)
    assert status == 200
    assert body["store"]["name"] == "Nuevo Nombre" and body["store"]["whatsapp"] == "51988777666" and body["store"]["currency"] == "EUR"
    assert body["store"]["brand"] == {"colors": ["#c2623f"], "tone": "rustic", "displayName": "Sol"}
    for bad in ({}, {"whatsapp": "12"}, {"currency": "XXX"}, {"brand": {"tone": "goth"}}, {"name": ""}):
        assert call(manage.handler, "PUT /api/stores/{storeId}", bad, token(store), path=path)[0] == 400
    assert call(manage.handler, "PUT /api/stores/{storeId}", {"name": "x"}, path=path)[0] == 403


def test_update_product_edits_the_listing_and_price():
    store = new_store()
    seed_product(store)
    path = {"storeId": store["storeId"], "productId": "P1"}
    copy = {"en": {"name": "Blue vase", "description": "Edited by the artisan"}, "es": {"name": "Jarrón azul", "description": "Editado por el artesano"}}
    status, body = call(manage.handler, "PUT /api/stores/{storeId}/products/{productId}", {"copy": copy, "price": "48.5"}, token(store), path=path)
    assert status == 200 and body["product"]["copy"]["es"]["name"] == "Jarrón azul" and float(body["product"]["price"]) == 48.5
    assert call(manage.handler, "PUT /api/stores/{storeId}/products/{productId}", {"copy": {"en": copy["en"]}}, token(store), path=path)[0] == 400
    assert call(manage.handler, "PUT /api/stores/{storeId}/products/{productId}", {}, token(store), path=path)[0] == 400
    assert call(manage.handler, "PUT /api/stores/{storeId}/products/{productId}", {"price": -1}, token(store), path={**path, "productId": "P1"})[0] == 400
    assert call(manage.handler, "PUT /api/stores/{storeId}/products/{productId}", {"price": 1}, token(store), path={**path, "productId": "NOPE"})[0] == 404


def test_user_text_is_sanitized_before_it_is_stored():
    store = new_store()
    seed_product(store)
    path = {"storeId": store["storeId"], "productId": "P1"}
    copy = {"en": {"name": "Vase\x00‮", "description": "ok"}, "es": {"name": "Jarrón", "description": "ok"}}
    _, body = call(manage.handler, "PUT /api/stores/{storeId}/products/{productId}", {"copy": copy}, token(store), path=path)
    assert body["product"]["copy"]["en"]["name"] == "Vase"
