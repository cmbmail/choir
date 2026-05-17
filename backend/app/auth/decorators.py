from functools import wraps

from flask import g, jsonify, request

from app.models import User
from app.services.jwt_tokens import decode_token
from app.services.permissions import has_permission


def _extract_token():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return request.cookies.get("access_token")


def get_current_user():
    if hasattr(g, "current_user"):
        return g.current_user
    token = _extract_token()
    if not token:
        g.current_user = None
        return None
    payload = decode_token(token)
    if not payload:
        g.current_user = None
        return None
    user = User.query.get(payload.get("sub"))
    if not user or user.token_version != payload.get("tv", 0):
        g.current_user = None
        return None
    g.current_user = user
    g.token_payload = payload
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "未登录"}), 401
        if not user.system_super_admin and user.status != "active":
            return jsonify({"error": "账号不可用"}), 403
        return fn(*args, **kwargs)

    return wrapper


def require_permission(key: str):
    def decorator(fn):
        @wraps(fn)
        @login_required
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not has_permission(user, key):
                return jsonify({"error": "无权限", "required": key}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
