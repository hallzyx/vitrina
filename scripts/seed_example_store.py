"""Build the public example store (/s/example) by running the REAL pipeline on the sample photo sets.

For every sample it calls the live API (`POST /api/samples/{id}/run`), waits for the run to finish, and
records how long each step actually took (from the Step Functions history) so the app can replay the
run later without spending anything. It then gathers the finished products into one published store
with the slug `example`. Everything shown comes from real pipeline output; nothing is fabricated.

Needs AWS credentials for `vitrina-agent` (boto3 needs `pip install "botocore[crt]"` for `aws login`).
It clears the operator's own daily sample-run counters between runs, so run it from the operator's machine.

Usage: python scripts/seed_example_store.py [--base https://<cloudfront-domain>] [--samples id1,id2,...]
"""
import argparse
import hashlib
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))
from common.ids import ulid  # noqa: E402

REGION = "us-east-1"
STACK = "vitrina"
STATE_MACHINE = f"arn:aws:states:{REGION}:{{account}}:stateMachine:vitrina-pipeline"
STATE_TO_STEP = {
    "Validate": "validate",
    "ProcessPhotos": "background",
    "Align": "align",
    "Fidelity": "fidelity",
    "Brand": "brand",
    "Listing": "listing",
    "Finalize": "ready",
}
# Demonstration prices, clearly part of the demo store.
PRICES = {"elephant_carved": 54, "vase_antique_01": 62, "jug_01": 38, "basket_wicker_01": 34, "bowl_wooden_01": 46}


def http(method: str, url: str, body: dict | None = None, headers: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        raw = err.read()
        return err.code, json.loads(raw) if raw else None


def clear_my_sample_counters(limits) -> None:
    """Remove only this operator's daily sample counters (the global one is kept as a real cap)."""
    for item in limits.scan()["Items"]:
        key = item["visitorKey"]
        if key.startswith("sample#") and not key.startswith("sample#global#"):
            limits.delete_item(Key={"visitorKey": key})


def step_timings(sfn, account: str, product_id: str) -> dict:
    arn = f"arn:aws:states:{REGION}:{account}:execution:vitrina-pipeline:{product_id}-1"
    events = sfn.get_execution_history(executionArn=arn, maxResults=1000)["events"]
    # Only the top-level states count. The Map state runs many inner "ProcessPhoto" tasks, which would
    # otherwise cut the background-removal step short (its duration runs until the NEXT top-level state).
    starts = [
        (e["stateEnteredEventDetails"]["name"], e["timestamp"])
        for e in events
        if e["type"] in ("TaskStateEntered", "MapStateEntered") and e["stateEnteredEventDetails"]["name"] in STATE_TO_STEP
    ]
    end = max(e["timestamp"] for e in events if e["type"] in ("ExecutionSucceeded", "ExecutionFailed"))
    steps = []
    for i, (name, at) in enumerate(starts):
        nxt = starts[i + 1][1] if i + 1 < len(starts) else end
        steps.append({"step": STATE_TO_STEP[name], "ms": int((nxt - at).total_seconds() * 1000)})
    return {"totalMs": int((end - starts[0][1]).total_seconds() * 1000), "steps": steps}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://dz81nhpgrhb93.cloudfront.net")
    parser.add_argument("--samples", default=",".join(PRICES))
    parser.add_argument("--pause", type=int, default=25, help="seconds to wait between runs")
    args = parser.parse_args()

    account = boto3.client("sts").get_caller_identity()["Account"]
    ddb, sfn, s3 = boto3.resource("dynamodb", region_name=REGION), boto3.client("stepfunctions", region_name=REGION), boto3.client("s3", region_name=REGION)
    stores, products, limits = ddb.Table(f"{STACK}-stores"), ddb.Table(f"{STACK}-products"), ddb.Table(f"{STACK}-limits")

    runs = []
    for sample_id in args.samples.split(","):
        clear_my_sample_counters(limits)
        status, body = http("POST", f"{args.base}/api/samples/{sample_id}/run", {"storeName": "Casa Demo"})
        if status != 202:
            sys.exit(f"{sample_id}: run failed {status} {body}")
        headers = {"X-Edit-Token": body["editToken"]}
        print(f"{sample_id}: started (product {body['productId']})")
        started = time.time()
        while time.time() - started < 240:
            time.sleep(3)
            code, state = http("GET", f"{args.base}/api/stores/{body['storeId']}/products/{body['productId']}/status", headers=headers)
            if code == 200 and state["status"] in ("ready_360", "ready_3d", "failed"):
                break
        if state["status"] == "failed" or state["status"] not in ("ready_360", "ready_3d"):
            sys.exit(f"{sample_id}: pipeline did not finish: {state}")
        timings = step_timings(sfn, account, body["productId"])
        print(f"{sample_id}: ready in {timings['totalMs'] / 1000:.1f}s, fidelity {state['fidelityScore']}")
        runs.append({"sample": sample_id, **body, "timings": timings})
        time.sleep(args.pause)  # new accounts have low Bedrock quotas: do not send runs back to back

    # Gather the finished products into one published store with the slug `example`.
    example_id = ulid()
    first_store = stores.get_item(Key={"storeId": runs[0]["storeId"]})["Item"]
    stores.put_item(
        Item={
            "storeId": example_id,
            "slug": "example",
            "name": "Casa Demo",
            "whatsapp": "15550100000",  # fictional number
            "currency": "USD",
            "brand": first_store.get("brand", {}),
            "status": "published",
            "demo": True,
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "publishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "editTokenHash": hashlib.sha256(secrets.token_bytes(32)).hexdigest(),  # nobody holds this token: read-only
        }
    )
    for run in runs:
        item = products.get_item(Key={"storeId": run["storeId"], "productId": run["productId"]})["Item"]
        item["storeId"] = example_id
        item["price"] = Decimal(PRICES[run["sample"]])
        item["replay"] = json.loads(json.dumps(run["timings"]), parse_float=Decimal)
        products.put_item(Item=item)
        products.delete_item(Key={"storeId": run["storeId"], "productId": run["productId"]})
        stores.delete_item(Key={"storeId": run["storeId"]})
        raw = s3.list_objects_v2(Bucket=f"{STACK}-raw-{account}-{REGION}", Prefix=f"raw/{run['storeId']}/").get("Contents", [])
        if raw:
            s3.delete_objects(Bucket=f"{STACK}-raw-{account}-{REGION}", Delete={"Objects": [{"Key": o["Key"]} for o in raw], "Quiet": True})
    clear_my_sample_counters(limits)
    print(f"example store ready: {args.base}/s/example ({len(runs)} products)")


if __name__ == "__main__":
    main()
