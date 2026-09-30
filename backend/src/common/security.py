"""Hashing, tokens and client identification."""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Both sides are hashed first so their lengths do not leak."""
    return hmac.compare_digest(sha256_hex(a), sha256_hex(b))


def new_edit_token() -> str:
    """256 random bits, URL-safe. Only its hash is ever stored."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return sha256_hex(token)


def client_ip(event: dict) -> str:
    """Viewer IP. Behind CloudFront the API only sees the edge IP, so trust the header CloudFront
    sets (viewers cannot spoof it) and fall back to the socket address for direct API calls."""
    viewer = (event.get("headers") or {}).get("cloudfront-viewer-address")
    if viewer:
        return viewer.rsplit(":", 1)[0].strip("[]")
    return ((event.get("requestContext") or {}).get("http") or {}).get("sourceIp", "unknown")


def ip_hash(event: dict) -> str:
    return sha256_hex(f"vitrina|{client_ip(event)}")[:32]


def is_allowlisted(event: dict) -> bool:
    """True if the viewer's IP is on the owner's allowlist (`ALLOWLISTED_IPS`, comma separated).

    The allowlist only skips the PER-VISITOR daily counters. The global caps, the invite phrase and the
    failed-phrase lockout still apply, because a public IP can be shared (home routers, carrier-grade NAT)
    and it must not become a way around authentication or the overall spending limits.
    """
    allowed = {ip.strip() for ip in os.environ.get("ALLOWLISTED_IPS", "").split(",") if ip.strip()}
    return bool(allowed) and client_ip(event) in allowed


def day_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def hour_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H")
