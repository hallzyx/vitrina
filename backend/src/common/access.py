"""Invite phrase check. The phrase lives in SSM Parameter Store (SecureString), never in code or env."""
import time

from . import limits
from .aws import ssm
from .config import env, env_int
from .http import ApiError
from .security import hour_stamp, ip_hash, safe_equal

_CACHE_SECONDS = 300
_cache: dict = {"value": None, "at": 0.0}


def _expected_code() -> str:
    now = time.monotonic()
    if _cache["value"] is None or now - _cache["at"] > _CACHE_SECONDS:
        result = ssm().get_parameter(Name=env("ACCESS_CODE_PARAM_NAME"), WithDecryption=True)
        _cache["value"] = result["Parameter"]["Value"]
        _cache["at"] = now
    return _cache["value"]


def reset_cache() -> None:
    _cache["value"] = None
    _cache["at"] = 0.0


def require_code(event: dict, candidate: str | None) -> None:
    """Raise 401 for a wrong phrase and 429 once an IP has failed too many times this hour."""
    fail_key = f"fail#{ip_hash(event)}#{hour_stamp()}"
    if limits.count(fail_key) >= env_int("MAX_FAILED_ATTEMPTS", 10):
        raise ApiError(429, "too_many_attempts", "Too many attempts. Please try again in an hour.")
    if not candidate or len(candidate) > 200 or not safe_equal(candidate.strip(), _expected_code()):
        limits.bump(fail_key, 2 * 3600)
        raise ApiError(401, "invalid_code", "That invite phrase is not valid.")
