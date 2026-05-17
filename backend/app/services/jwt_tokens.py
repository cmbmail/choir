from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from flask import current_app


def issue_token(user) -> str:
    now = datetime.now(timezone.utc)
    exp = now + current_app.config["JWT_ACCESS_DELTA"]
    payload = {
        "sub": user.user_id,
        "iat": now,
        "exp": exp,
        "tv": user.token_version,
        "system_super_admin": user.system_super_admin,
    }
    if not user.system_super_admin:
        payload["choir_id"] = user.choir_id
        payload["role_id"] = user.role_id
        payload["role_code"] = user.role_code
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
