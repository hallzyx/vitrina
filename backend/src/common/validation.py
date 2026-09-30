"""Input validation and sanitization. All user text is stored as plain text and escaped on render."""
import re
import secrets
import unicodedata
from decimal import Decimal, InvalidOperation

from .config import ALLOWED_CURRENCIES, ALLOWED_TONES
from .http import ApiError

_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean_text(value, field: str, max_len: int, required: bool = True) -> str | None:
    if value is None or value == "":
        if required:
            raise ApiError(400, "invalid_request", f"'{field}' is required.")
        return None
    if not isinstance(value, str):
        raise ApiError(400, "invalid_request", f"'{field}' must be text.")
    text = unicodedata.normalize("NFC", value)
    text = "".join(ch for ch in text if ch in "\n\t " or not unicodedata.category(ch).startswith("C"))
    text = re.sub(r"[ \t]+", " ", text).strip()
    if required and not text:
        raise ApiError(400, "invalid_request", f"'{field}' is required.")
    if len(text) > max_len:
        raise ApiError(400, "invalid_request", f"'{field}' is too long (max {max_len} characters).")
    return text or None


def clean_whatsapp(value) -> str:
    if not isinstance(value, str):
        raise ApiError(400, "invalid_request", "'whatsapp' must be text.")
    digits = re.sub(r"\D", "", value)
    if not 8 <= len(digits) <= 15:
        raise ApiError(400, "invalid_request", "'whatsapp' must include the country code (8 to 15 digits).")
    return digits


def clean_currency(value) -> str:
    code = (value or "USD")
    if not isinstance(code, str) or code.upper() not in ALLOWED_CURRENCIES:
        raise ApiError(400, "invalid_request", "'currency' is not supported.")
    return code.upper()


def clean_price(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        price = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ApiError(400, "invalid_request", "'price' must be a number.") from None
    if not Decimal("0") <= price <= Decimal("1000000"):
        raise ApiError(400, "invalid_request", "'price' is out of range.")
    return price


def clean_brand(value) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ApiError(400, "invalid_request", "'brand' must be an object.")
    colors = value.get("colors") or []
    if not isinstance(colors, list) or len(colors) > 6 or not all(isinstance(c, str) and _COLOR.match(c) for c in colors):
        raise ApiError(400, "invalid_request", "'brand.colors' must be up to 6 hex colors like #c2623f.")
    tone = value.get("tone")
    if tone is not None and tone not in ALLOWED_TONES:
        raise ApiError(400, "invalid_request", "'brand.tone' is not supported.")
    brand: dict = {"colors": [c.lower() for c in colors]}
    if tone:
        brand["tone"] = tone
    display = clean_text(value.get("displayName"), "brand.displayName", 60, required=False)
    if display:
        brand["displayName"] = display
    return brand


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:32].strip("-") or "store"
    return f"{base}-{secrets.token_hex(2)}"
