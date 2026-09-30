import json
import os
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

INVITE = "test-invite-phrase"
ENV = {
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "AWS_DEFAULT_REGION": "us-east-1",
    "TABLE_STORES": "stores",
    "TABLE_PRODUCTS": "products",
    "TABLE_STATS": "stats",
    "TABLE_LIMITS": "limits",
    "BUCKET_RAW": "raw-bucket",
    "ACCESS_CODE_PARAM_NAME": "/vitrina/test/access-code",
    "EXAMPLE_STORE_SLUG": "example",
    "MAX_FAILED_ATTEMPTS": "3",
    "MAX_STORES_PER_DAY": "3",
    "MAX_PRODUCTS_PER_DAY": "3",
    "MAX_GLOBAL_STORES_PER_DAY": "20",
    "MAX_GLOBAL_PRODUCTS_PER_DAY": "30",
    "MIN_PHOTOS": "6",
    "MAX_PHOTOS": "24",
    "MAX_PHOTO_MB": "8",
}


def make_event(route, body=None, headers=None, path=None, ip="203.0.113.7"):
    return {
        "routeKey": route,
        "headers": {k.lower(): v for k, v in (headers or {}).items()},
        "pathParameters": path,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"http": {"sourceIp": ip}},
    }


def call(handler, *args, **kwargs):
    result = handler(make_event(*args, **kwargs), None)
    body = json.loads(result["body"]) if result.get("body") else None
    return result["statusCode"], body


@pytest.fixture(autouse=True)
def aws(monkeypatch):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    with mock_aws():
        import common.access as access
        import common.aws as aws_module

        aws_module._dynamodb.cache_clear()
        aws_module.s3.cache_clear()
        aws_module.ssm.cache_clear()
        access.reset_cache()

        ddb = boto3.resource("dynamodb")
        ddb.create_table(
            TableName="stores",
            KeySchema=[{"AttributeName": "storeId", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "storeId", "AttributeType": "S"},
                {"AttributeName": "slug", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "slug-index",
                    "KeySchema": [{"AttributeName": "slug", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="products",
            KeySchema=[
                {"AttributeName": "storeId", "KeyType": "HASH"},
                {"AttributeName": "productId", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "storeId", "AttributeType": "S"},
                {"AttributeName": "productId", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="stats",
            KeySchema=[
                {"AttributeName": "storeId", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "storeId", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.create_table(
            TableName="limits",
            KeySchema=[{"AttributeName": "visitorKey", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "visitorKey", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        boto3.client("s3").create_bucket(Bucket="raw-bucket")
        boto3.client("ssm").put_parameter(Name="/vitrina/test/access-code", Value=INVITE, Type="SecureString")
        yield
