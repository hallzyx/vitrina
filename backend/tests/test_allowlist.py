"""The owner's IP skips the per-visitor counters only: never the global caps, the phrase or the lockout."""
import boto3
from conftest import INVITE, call
from test_samples import run, seed_samples

from handlers import access, products, stores

OWNER, OTHER = "203.0.113.50", "198.51.100.77"
STORE_BODY = {"name": "Casa", "whatsapp": "+51 999 000 111"}


def test_sample_runs_skip_the_per_visitor_cap_for_the_owner_only(monkeypatch):
    seed_samples(monkeypatch)
    monkeypatch.setenv("ALLOWLISTED_IPS", f"{OWNER}, 192.0.2.1")
    monkeypatch.setenv("MAX_SAMPLE_RUNS_PER_DAY", "1")
    monkeypatch.setenv("MAX_GLOBAL_SAMPLE_RUNS_PER_DAY", "10")
    assert [run(ip=OWNER)[0] for _ in range(4)] == [202, 202, 202, 202]  # the cap of 1 does not apply to the owner
    assert run(ip=OTHER)[0] == 202
    status, body = run(ip=OTHER)
    assert (status, body["error"]) == (429, "sample_cap")  # everyone else is still capped


def test_the_global_sample_cap_still_applies_to_the_owner(monkeypatch):
    seed_samples(monkeypatch)
    monkeypatch.setenv("ALLOWLISTED_IPS", OWNER)
    monkeypatch.setenv("MAX_SAMPLE_RUNS_PER_DAY", "1")
    monkeypatch.setenv("MAX_GLOBAL_SAMPLE_RUNS_PER_DAY", "3")
    assert [run(ip=OWNER)[0] for _ in range(3)] == [202, 202, 202]
    status, body = run(ip=OWNER)
    assert (status, body["error"]) == (429, "sample_cap")  # spending stays bounded even for an allowlisted IP


def test_the_owner_can_create_more_stores_but_still_needs_the_invite_phrase(monkeypatch):
    monkeypatch.setenv("ALLOWLISTED_IPS", OWNER)
    monkeypatch.setenv("MAX_STORES_PER_DAY", "1")
    for _ in range(3):
        assert call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE}, ip=OWNER)[0] == 201
    assert call(stores.handler, "POST /api/stores", STORE_BODY, ip=OWNER)[0] == 401  # no phrase, no store
    assert call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE}, ip=OTHER)[0] == 201
    assert call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE}, ip=OTHER)[0] == 429


def test_the_owner_skips_the_product_cap_but_not_the_token(monkeypatch):
    monkeypatch.setenv("ALLOWLISTED_IPS", OWNER)
    monkeypatch.setenv("MAX_PRODUCTS_PER_DAY", "1")
    _, store = call(stores.handler, "POST /api/stores", STORE_BODY, {"X-Access-Code": INVITE}, ip=OWNER)
    path, token = {"storeId": store["storeId"]}, {"X-Edit-Token": store["editToken"]}
    for _ in range(3):
        assert call(products.handler, "POST /api/stores/{storeId}/products", {"photoCount": 6}, token, path=path, ip=OWNER)[0] == 201
    assert call(products.handler, "POST /api/stores/{storeId}/products", {"photoCount": 6}, path=path, ip=OWNER)[0] == 403


def test_the_failed_phrase_lockout_is_never_bypassed(monkeypatch):
    """Otherwise anyone sharing the allowlisted IP could brute-force the invite phrase."""
    monkeypatch.setenv("ALLOWLISTED_IPS", OWNER)
    monkeypatch.setenv("MAX_FAILED_ATTEMPTS", "3")
    for _ in range(3):
        assert call(access.handler, "POST /api/access/verify", {"code": "bad"}, ip=OWNER)[0] == 401
    status, body = call(access.handler, "POST /api/access/verify", {"code": INVITE}, ip=OWNER)
    assert (status, body["error"]) == (429, "too_many_attempts")


def test_an_empty_or_default_allowlist_allows_nobody(monkeypatch):
    seed_samples(monkeypatch)
    monkeypatch.setenv("MAX_SAMPLE_RUNS_PER_DAY", "1")
    for value in ("", "none", " , "):
        monkeypatch.setenv("ALLOWLISTED_IPS", value)
        boto3.resource("dynamodb").Table("limits").scan()  # touch the table; counters persist across iterations
    assert run(ip=OWNER)[0] == 202
    assert run(ip=OWNER)[1]["error"] == "sample_cap"
