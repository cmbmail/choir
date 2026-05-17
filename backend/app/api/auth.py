from __future__ import annotations

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from app.api import api_bp
from app.auth.csrf import issue_csrf_token, set_csrf_cookie
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import Choir, InvitationCode, User
from app.services.captcha import create_captcha, verify_captcha
from app.services.choir_bootstrap import get_member_role
from app.services.invite_code import hash_code, verify_code
from app.services.jwt_tokens import issue_token
from app.services.operation_log import write_operation_log
from app.services.password import (
    check_password,
    hash_password,
    validate_password_strength,
    validate_phone,
)


def _auth_response(user):
    token = issue_token(user)
    body = {"user": user.to_me_dict(), "access_token": token}
    if current_app.config["AUTH_MODE"] == "production":
        csrf = issue_csrf_token()
        resp = jsonify(
            {
                "user": body["user"],
                "access_token": token,
                "csrf_token": csrf,
            }
        )
        resp.set_cookie(
            "access_token",
            token,
            httponly=True,
            secure=True,
            samesite="Lax",
            max_age=int(current_app.config["JWT_ACCESS_DELTA"].total_seconds()),
        )
        set_csrf_cookie(resp, csrf)
        return resp
    return jsonify(body)


@api_bp.get("/auth/csrf")
def get_csrf():
    token = issue_csrf_token()
    resp = jsonify({"csrf_token": token})
    if current_app.config["AUTH_MODE"] == "production":
        set_csrf_cookie(resp, token)
    return resp


def _needs_captcha(user: User | None) -> bool:
    threshold = current_app.config["LOGIN_CAPTCHA_AFTER_FAILURES"]
    if user and user.failed_login_count >= threshold:
        return True
    return False


def _register_fail(user: User | None):
    if not user:
        return
    user.failed_login_count += 1
    if user.failed_login_count >= current_app.config["LOGIN_MAX_FAILURES"]:
        user.locked_until = datetime.utcnow() + timedelta(
            minutes=current_app.config["LOGIN_LOCKOUT_MINUTES"]
        )


@api_bp.get("/auth/captcha")
def get_captcha():
    captcha_id, image_base64 = create_captcha()
    db.session.commit()
    return jsonify({"captcha_id": captcha_id, "image_base64": image_base64})


def _login_candidates(username: str) -> list[User]:
    rows = User.query.filter_by(username=username, status="active").all()
    out: list[User] = []
    for user in rows:
        if user.system_super_admin:
            out.append(user)
        elif user.choir_id and user.choir and user.choir.status == "active":
            out.append(user)
    return out


def _identity_dict(user: User) -> dict:
    if user.system_super_admin:
        return {
            "user_id": user.user_id,
            "kind": "system",
            "label": "系统管理",
            "choir_name": None,
            "choir_slug": None,
            "role_name": "系统超管",
        }
    choir = user.choir
    role_name = user.role.name if user.role else "成员"
    choir_name = choir.name if choir else ""
    return {
        "user_id": user.user_id,
        "kind": "choir",
        "label": f"{choir_name} · {role_name}",
        "choir_name": choir_name,
        "choir_slug": choir.slug if choir else None,
        "role_name": role_name,
    }


def _finish_login(user: User):
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()
    write_operation_log(
        "auth.login",
        user=user,
        resource_type="user",
        resource_id=user.user_id,
        detail={"username": user.username},
    )
    db.session.commit()
    return _auth_response(user)


@api_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    user_id = data.get("user_id")

    if not username or not password:
        return jsonify({"error": "用户名或密码错误"}), 401

    candidates = _login_candidates(username)
    if not candidates:
        db.session.commit()
        return jsonify({"error": "用户名或密码错误"}), 401

    if any(_needs_captcha(u) for u in candidates):
        cid = data.get("captcha_id")
        code = data.get("captcha_code")
        if not cid or not code or not verify_captcha(cid, code):
            db.session.commit()
            return jsonify({"error": "验证码错误或已过期"}), 400

    now = datetime.utcnow()
    unlocked = [
        u
        for u in candidates
        if not (u.locked_until and u.locked_until > now)
    ]
    if not unlocked:
        locked = max(candidates, key=lambda u: u.locked_until or now)
        db.session.commit()
        return jsonify(
            {"error": "账户已锁定", "locked_until": locked.locked_until.isoformat()}
        ), 423

    matched = [u for u in unlocked if check_password(password, u.password_hash)]
    if not matched:
        for u in candidates:
            _register_fail(u)
        db.session.commit()
        return jsonify({"error": "用户名或密码错误"}), 401

    if user_id is not None:
        matched = [u for u in matched if u.user_id == int(user_id)]
        if len(matched) != 1:
            db.session.commit()
            return jsonify({"error": "无效的身份选择"}), 400

    if len(matched) == 1:
        return _finish_login(matched[0])

    identities = [_identity_dict(u) for u in matched]
    db.session.commit()
    return jsonify({"need_identity_select": True, "identities": identities})


@api_bp.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    choir_slug = data.get("choir_slug")
    invite_plain = (data.get("invite_code") or "").strip()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    err = validate_phone(username) or validate_password_strength(password)
    if err:
        return jsonify({"error": err}), 400
    if not name:
        return jsonify({"error": "真实姓名必填"}), 400
    if not choir_slug or not invite_plain:
        return jsonify({"error": "团队与邀请码必填"}), 400

    choir = Choir.query.filter_by(slug=choir_slug, status="active").first()
    if not choir:
        return jsonify({"error": "邀请码无效"}), 400

    member_count = User.query.filter_by(choir_id=choir.choir_id).count()
    if member_count >= choir.max_members:
        return jsonify({"error": "该团已满员"}), 400

    code_hash = hash_code(invite_plain)
    invite = InvitationCode.query.filter_by(choir_id=choir.choir_id, code_hash=code_hash).first()
    if not invite or not invite.is_valid():
        return jsonify({"error": "邀请码无效或已过期"}), 400

    if User.query.filter_by(choir_id=choir.choir_id, username=username).first():
        return jsonify({"error": "该手机号已在团内注册"}), 409

    member_role = get_member_role(choir.choir_id)
    if not member_role:
        return jsonify({"error": "团队角色未初始化"}), 500

    voice_part = data.get("voice_part")
    if voice_part is None and invite.voice_part is not None:
        voice_part = invite.voice_part

    user = User(
        choir_id=choir.choir_id,
        role_id=member_role.role_id,
        username=username,
        password_hash=hash_password(password),
        name=name,
        email=data.get("email"),
        voice_part=voice_part,
        status="active",
    )
    db.session.add(user)
    invite.use_count += 1
    write_operation_log(
        "member.register",
        user=user,
        choir_id=choir.choir_id,
        resource_type="user",
        resource_id=user.user_id,
        detail={"username": username, "name": name},
    )
    db.session.commit()
    return jsonify({"user": user.to_me_dict()}), 201


@api_bp.get("/auth/me")
@login_required
def me():
    user = get_current_user()
    return jsonify(user.to_me_dict())


@api_bp.post("/auth/logout")
@login_required
def logout():
    user = get_current_user()
    write_operation_log(
        "auth.logout",
        user=user,
        resource_type="user",
        resource_id=user.user_id,
    )
    db.session.commit()
    resp = jsonify({"ok": True})
    resp.delete_cookie("access_token")
    return resp


@api_bp.put("/auth/password")
@login_required
def change_password():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    old = data.get("old_password") or ""
    new = data.get("new_password") or ""
    if not check_password(old, user.password_hash):
        return jsonify({"error": "原密码错误"}), 400
    err = validate_password_strength(new)
    if err:
        return jsonify({"error": err}), 400
    user.password_hash = hash_password(new)
    user.password_changed_at = datetime.utcnow()
    user.token_version += 1
    write_operation_log(
        "auth.password_change",
        user=user,
        resource_type="user",
        resource_id=user.user_id,
    )
    db.session.commit()
    return jsonify({"ok": True})
