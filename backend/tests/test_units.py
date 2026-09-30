import base64
import json

import pytest

from common.http import ApiError, json_body
from common.ids import ulid
from common.security import client_ip, hash_token, new_edit_token, safe_equal
from common.validation import clean_brand, clean_price, clean_text, clean_whatsapp, slugify


def test_slugify_is_ascii_and_suffixed():
    slug = slugify("Cerámica Ñandú & Hijos!")
    assert slug.startswith("ceramica-nandu-hijos-") and slug.isascii()
    assert slugify("!!!").startswith("store-")


def test_clean_text_strips_control_characters_and_enforces_limits():
    assert clean_text("  Hola\x00 ‮mundo\x07 ", "f", 40) == "Hola mundo"
    assert clean_text("", "f", 10, required=False) is None
    with pytest.raises(ApiError):
        clean_text("x" * 11, "f", 10)
    with pytest.raises(ApiError):
        clean_text(123, "f", 10)


def test_whatsapp_and_price_and_brand():
    assert clean_whatsapp("+51 (999) 000-111") == "51999000111"
    with pytest.raises(ApiError):
        clean_whatsapp("12345")
    assert str(clean_price("48")) == "48.00" and clean_price(None) is None
    with pytest.raises(ApiError):
        clean_price(-1)
    assert clean_brand({"colors": ["#C2623F"], "tone": "warm"}) == {"colors": ["#c2623f"], "tone": "warm"}
    with pytest.raises(ApiError):
        clean_brand({"tone": "goth"})


def test_tokens_are_random_and_compared_in_constant_time_form():
    a, b = new_edit_token(), new_edit_token()
    assert a != b and len(a) >= 43
    assert safe_equal(hash_token(a), hash_token(a)) and not safe_equal(hash_token(a), hash_token(b))


def test_client_ip_prefers_the_cloudfront_header_and_handles_ipv6():
    event = {"headers": {"cloudfront-viewer-address": "[2001:db8::1]:5000"}, "requestContext": {"http": {"sourceIp": "10.0.0.1"}}}
    assert client_ip(event) == "2001:db8::1"
    assert client_ip({"requestContext": {"http": {"sourceIp": "10.0.0.1"}}}) == "10.0.0.1"


def test_ulids_are_unique_and_time_ordered():
    first, second = ulid(), ulid()
    assert len(first) == 26 and first != second


def test_json_body_limits_and_shape():
    assert json_body({"body": base64.b64encode(json.dumps({"a": 1}).encode()).decode(), "isBase64Encoded": True}) == {"a": 1}
    for bad in ("[1]", "{oops", "x" * 70000):
        with pytest.raises(ApiError):
            json_body({"body": bad})
