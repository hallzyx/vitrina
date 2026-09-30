import pytest
from botocore.exceptions import ClientError

import ai


def error(code):
    return ClientError({"Error": {"Code": code, "Message": "m"}}, "InvokeModel")


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    slept = []
    monkeypatch.setattr(ai.time, "sleep", lambda s: slept.append(s))
    return slept


def test_throttling_is_retried_with_growing_waits_until_it_succeeds(no_sleep):
    attempts = {"n": 0}

    def call():
        attempts["n"] += 1
        if attempts["n"] < 4:
            raise error("ThrottlingException")
        return "ok"

    assert ai.with_backoff(call) == "ok"
    assert attempts["n"] == 4 and len(no_sleep) == 3
    assert no_sleep[0] <= 1.5 and no_sleep[2] > no_sleep[0]  # waits grow (with jitter)


def test_other_errors_are_not_retried(no_sleep):
    def call():
        raise error("AccessDeniedException")

    with pytest.raises(ClientError):
        ai.with_backoff(call)
    assert no_sleep == []


def test_persistent_throttling_gives_up_after_the_attempt_limit(no_sleep):
    attempts = {"n": 0}

    def call():
        attempts["n"] += 1
        raise error("ThrottlingException")

    with pytest.raises(ClientError):
        ai.with_backoff(call, attempts=5)
    assert attempts["n"] == 5 and len(no_sleep) == 4 and max(no_sleep) <= 15


def test_persistent_throttling_of_embeddings_becomes_embedding_unavailable(monkeypatch, no_sleep):
    class Client:
        def invoke_model(self, **kwargs):
            raise error("ThrottlingException")

    monkeypatch.setattr(ai, "bedrock", lambda: Client())
    monkeypatch.setenv("BEDROCK_MODEL_EMBED", "m")
    with pytest.raises(ai.EmbeddingUnavailable):
        ai.titan_embed(b"x")
