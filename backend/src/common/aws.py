"""Lazily created AWS clients, so importing a module never touches the network."""
import functools
import os

import boto3
from botocore.config import Config


@functools.lru_cache(maxsize=None)
def _dynamodb():
    return boto3.resource("dynamodb")


def table(env_name: str):
    """DynamoDB table whose name is in the given environment variable."""
    return _dynamodb().Table(os.environ[env_name])


@functools.lru_cache(maxsize=None)
def s3():
    return boto3.client("s3", config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}))


@functools.lru_cache(maxsize=None)
def ssm():
    return boto3.client("ssm")


@functools.lru_cache(maxsize=None)
def stepfunctions():
    return boto3.client("stepfunctions")
