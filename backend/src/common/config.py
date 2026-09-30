"""Runtime configuration, read from environment variables at call time (never hard-coded)."""
import os


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


def env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


ALLOWED_CURRENCIES = frozenset({"USD", "PEN", "EUR", "MXN"})
ALLOWED_TONES = frozenset({"warm", "minimal", "rustic", "playful"})
# Upload content type -> file extension. Real type validation happens by content in the pipeline.
ALLOWED_PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
