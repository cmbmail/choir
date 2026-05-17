from __future__ import annotations

import re

import bcrypt
from flask import current_app


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def check_password(plain: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain.encode(), password_hash.encode())


def validate_password_strength(plain: str) -> str | None:
    min_len = current_app.config["PASSWORD_MIN_LENGTH"]
    if len(plain) < min_len:
        return f"密码至少 {min_len} 位"
    if not re.search(r"[A-Za-z]", plain):
        return "密码须包含字母"
    if not re.search(r"\d", plain):
        return "密码须包含数字"
    return None


def validate_phone(username: str) -> str | None:
    if not username.isdigit():
        return "手机号须为数字"
    if not (8 <= len(username) <= 15):
        return "手机号须为 8–15 位数字"
    return None
