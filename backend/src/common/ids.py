"""ULID generation (time-ordered, 128-bit, Crockford base32)."""
import os
import time

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _encode(value: int, length: int) -> str:
    chars = []
    for _ in range(length):
        chars.append(_ALPHABET[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def ulid() -> str:
    millis = int(time.time() * 1000)
    randomness = int.from_bytes(os.urandom(10), "big")
    return _encode(millis, 10) + _encode(randomness, 16)
