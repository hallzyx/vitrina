"""Amazon Bedrock calls. Model IDs come from environment variables, never from code."""
import base64
import json
import random
import re
import time

import numpy as np
from botocore.exceptions import ClientError

from core import bedrock, env

# New AWS accounts start with low Bedrock quotas, so throttling is expected under bursts. These are the
# errors that simply mean "try again in a moment".
RETRYABLE = {
    "ThrottlingException",
    "TooManyRequestsException",
    "ServiceUnavailableException",
    "ModelTimeoutException",
    "InternalServerException",
}


class EmbeddingUnavailable(Exception):
    """The embedding model kept throttling. The caller may continue without a fidelity score."""


def with_backoff(call, attempts: int = 8, base: float = 1.5, cap: float = 15.0):
    """Retry `call` on throttling with exponential backoff and jitter (about a minute in the worst case)."""
    last: ClientError | None = None
    for attempt in range(attempts):
        try:
            return call()
        except ClientError as err:
            if err.response["Error"]["Code"] not in RETRYABLE:
                raise
            last = err
            if attempt < attempts - 1:
                time.sleep(min(cap, base * 2**attempt) * (0.5 + random.random() / 2))
    assert last is not None
    raise last


def titan_embed(jpeg: bytes) -> np.ndarray:
    """Multimodal embedding of one image (Titan), used to compare a processed frame with its photo."""
    body = json.dumps({"inputImage": base64.b64encode(jpeg).decode("ascii"), "embeddingConfig": {"outputEmbeddingLength": 384}})
    try:
        response = with_backoff(
            lambda: bedrock().invoke_model(
                modelId=env("BEDROCK_MODEL_EMBED"), body=body, contentType="application/json", accept="application/json"
            )
        )
    except ClientError as err:
        if err.response["Error"]["Code"] in RETRYABLE:
            raise EmbeddingUnavailable(err.response["Error"]["Code"]) from err
        raise
    return np.asarray(json.loads(response["body"].read())["embedding"], dtype=np.float32)


def image_block(jpeg: bytes) -> dict:
    return {"image": {"format": "jpeg", "source": {"bytes": jpeg}}}


def parse_json(text: str) -> dict:
    """Extract the first JSON object from a model answer, tolerating code fences and extra words."""
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("The model did not return JSON.")
    return json.loads(cleaned[start : end + 1])


def converse_json(system: str, content: list, max_tokens: int = 900) -> dict:
    response = with_backoff(
        lambda: bedrock().converse(
            modelId=env("BEDROCK_MODEL_TEXT"),
            system=[{"text": system}],
            messages=[{"role": "user", "content": content}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.2},
        )
    )
    text = "".join(part.get("text", "") for part in response["output"]["message"]["content"])
    return parse_json(text)
