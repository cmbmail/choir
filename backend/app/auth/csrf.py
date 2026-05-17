import secrets

from flask import current_app, jsonify, request


SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_EXEMPT_PREFIXES = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/captcha",
    "/api/auth/csrf",
    "/health",
)


def csrf_enabled() -> bool:
    return current_app.config.get("AUTH_MODE") == "production"


def issue_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response, token: str):
    response.set_cookie(
        "csrf_token",
        token,
        httponly=False,
        secure=True,
        samesite="Lax",
        max_age=int(current_app.config["JWT_ACCESS_DELTA"].total_seconds()),
    )


def validate_csrf() -> bool:
    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token:
        return False
    return secrets.compare_digest(cookie_token, header_token)


def should_enforce_csrf() -> bool:
    if not csrf_enabled():
        return False
    if request.method in SAFE_METHODS:
        return False
    path = request.path or ""
    for prefix in CSRF_EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return False
    return path.startswith("/api/")


def csrf_protect():
    if should_enforce_csrf() and not validate_csrf():
        return jsonify({"error": "CSRF 校验失败"}), 403
    return None
