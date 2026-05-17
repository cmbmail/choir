from __future__ import annotations

import hashlib
import hmac
import secrets
import string

from flask import current_app

_AMBIGUOUS = set("0O1lI")
_ALPHABET = "".join(c for c in (string.ascii_letters + string.digits) if c not in _AMBIGUOUS)


def generate_plain_code(length: int | None = None) -> str:
    length = length or current_app.config["INVITE_CODE_LENGTH"]
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def hash_code(plain: str) -> str:
    pepper = current_app.config["INVITE_CODE_PEPPER"].encode()
    return hmac.new(pepper, plain.encode(), hashlib.sha256).hexdigest()


def verify_code(plain: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(plain), code_hash)
