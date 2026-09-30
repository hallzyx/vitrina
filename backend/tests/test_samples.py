import json

import boto3
from conftest import call

from handlers import manage, samples

MANIFEST = {
    "samples": [
        {"id": "elephant_carved", "name": {"en": "Carved elephant", "es": "Elefante tallado"}, "photos": 12, "kind": "render"},
        {"id": "jug_01", "name": {"en": "Jug", "es": "Jarra"}, "photos": 6, "kind": "render"},
    ]
}


class FakeStepFunctions:
    def __init__(self):
        self.started = []

    def start_execution(self, **kwargs):
        self.started.append(kwargs)
        return {"executionArn": "arn:fake"}


def seed_samples(monkeypatch):
    s3 = boto3.client("s3")
    s3.put_object(Bucket="processed-bucket", Key="samples/index.json", Body=json.dumps(MANIFEST).encode())
    for sample in MANIFEST["samples"]:
        for i in range(1, sample["photos"] + 1):
            s3.put_object(Bucket="processed-bucket", Key=f"samples/{sample['id']}/{i:02d}.jpg", Body=b"jpeg-bytes", ContentType="image/jpeg")
    samples.reset_manifest_cache()
    fake = FakeStepFunctions()
    monkeypatch.setattr(samples, "stepfunctions", lambda: fake)
    return fake


def run(sample_id="elephant_carved", body=None, ip="203.0.113.7"):
    return call(samples.handler, "POST /api/samples/{sampleId}/run", body or {}, path={"sampleId": sample_id}, ip=ip)


def test_a_sample_run_needs_no_invite_phrase_and_starts_the_pipeline(monkeypatch):
    fake = seed_samples(monkeypatch)
    status, body = run()
    assert status == 202 and body["editToken"].startswith(body["storeId"] + ".")

    db = boto3.resource("dynamodb")
    store = db.Table("stores").get_item(Key={"storeId": body["storeId"]})["Item"]
    product = db.Table("products").get_item(Key={"storeId": body["storeId"], "productId": body["productId"]})["Item"]
    assert store["demo"] is True and store["whatsapp"] == "" and store["status"] == "draft"
    assert product["status"] == "processing" and product["sample"] == "elephant_carved" and product["name"] == "Carved elephant"
    assert len(product["rawKeys"]) == 12 and product["attempts"] == 1

    raw = boto3.client("s3").get_object(Bucket="raw-bucket", Key=product["rawKeys"][0])
    assert raw["Body"].read() == b"jpeg-bytes"
    assert len(fake.started) == 1 and fake.started[0]["name"] == f"{body['productId']}-1"
    assert body["editToken"] not in fake.started[0]["input"]


def test_the_sample_token_opens_the_dashboard(monkeypatch):
    seed_samples(monkeypatch)
    _, body = run()
    status, me = call(manage.handler, "GET /api/me", headers={"X-Edit-Token": body["editToken"]})
    assert status == 200 and me["store"]["demo"] is True and me["products"][0]["sampleId"] == "elephant_carved"


def test_unknown_samples_are_rejected_and_nothing_is_created(monkeypatch):
    fake = seed_samples(monkeypatch)
    for bad in ("nope", "../../etc", ""):
        assert run(bad)[0] == 404
    assert fake.started == [] and boto3.resource("dynamodb").Table("stores").scan()["Count"] == 0


def test_the_sample_run_is_capped_per_visitor_and_reports_it_distinctly(monkeypatch):
    seed_samples(monkeypatch)
    monkeypatch.setenv("MAX_SAMPLE_RUNS_PER_DAY", "2")
    assert run()[0] == 202 and run("jug_01")[0] == 202
    status, body = run()
    assert (status, body["error"]) == (429, "sample_cap")
    assert run(ip="198.51.100.9")[0] == 202  # another visitor is not affected


def test_the_sample_run_has_a_global_daily_cap(monkeypatch):
    seed_samples(monkeypatch)
    monkeypatch.setenv("MAX_GLOBAL_SAMPLE_RUNS_PER_DAY", "2")
    assert run(ip="198.51.100.1")[0] == 202 and run(ip="198.51.100.2")[0] == 202
    assert run(ip="198.51.100.3")[1]["error"] == "sample_cap"


def test_a_custom_store_name_is_sanitized(monkeypatch):
    seed_samples(monkeypatch)
    _, body = run(body={"storeName": "  Mi\x00 Tienda  "})
    assert boto3.resource("dynamodb").Table("stores").get_item(Key={"storeId": body["storeId"]})["Item"]["name"] == "Mi Tienda"
