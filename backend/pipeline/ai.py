"""Amazon Bedrock calls. Model IDs come from environment variables, never from code."""
import base64
import json
import re

import numpy as np

from core import bedrock, env


def titan_embed(jpeg: bytes) -> np.ndarray:
    """Multimodal embedding of one image (Titan), used to compare a processed frame with its photo."""
    body = json.dumps({"inputImage": base64.b64encode(jpeg).decode("ascii"), "embeddingConfig": {"outputEmbeddingLength": 384}})
    response = bedrock().invoke_model(
        modelId=env("BEDROCK_MODEL_EMBED"), body=body, contentType="application/json", accept="application/json"
    )
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
    response = bedrock().converse(
        modelId=env("BEDROCK_MODEL_TEXT"),
        system=[{"text": system}],
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0.2},
    )
    text = "".join(part.get("text", "") for part in response["output"]["message"]["content"])
    return parse_json(text)
