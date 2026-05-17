"""阶段一 API 扩展测试：CSRF、验证码、权限边界、成员编辑"""

from datetime import datetime, timedelta

import pytest

from app.extensions import db
from app.models import Choir, InvitationCode, User
from app.services.invite_code import generate_plain_code, hash_code
from app.services.password import hash_password


@pytest.fixture
def production_client(client, app):
    """AUTH_MODE=production 时 CSRF 开启"""
    old = app.config["AUTH_MODE"]
    app.config["AUTH_MODE"] = "production"
    yield client
    app.config["AUTH_MODE"] = old


def test_captcha_endpoint(client):
    res = client.get("/api/auth/captcha")
    assert res.status_code == 200
    data = res.get_json()
    assert data.get("captcha_id")
    assert data.get("image_base64", "").startswith("data:image/png;base64,")


def test_csrf_blocks_write_without_token(production_client, choir_admin_headers, app):
    assert app.config["AUTH_MODE"] == "production"
    res = production_client.post(
        "/api/invites",
        headers=choir_admin_headers,
        json={"expires_in_days": 7, "max_uses": 1},
    )
    assert res.status_code == 403
    assert "CSRF" in res.get_json().get("error", "")


def test_csrf_allows_write_with_token(production_client, choir_admin_headers):
    csrf_res = production_client.get("/api/auth/csrf")
    token = csrf_res.get_json()["csrf_token"]
    headers = {
        **choir_admin_headers,
        "X-CSRF-Token": token,
        "Cookie": f"csrf_token={token}",
    }
    res = production_client.post(
        "/api/invites",
        headers=headers,
        json={"expires_in_days": 7, "max_uses": 1},
    )
    assert res.status_code == 201


def test_member_role_cannot_list_members(client, app):
    with app.app_context():
        admin = User.query.filter_by(username="13900000001").first()
        from app.services.choir_bootstrap import get_member_role

        member_role = get_member_role(admin.choir_id)
        member = User(
            choir_id=admin.choir_id,
            role_id=member_role.role_id,
            username="13800139999",
            password_hash=hash_password("TestPass1"),
            name="普通团员",
            status="active",
        )
        db.session.add(member)
        db.session.commit()

    login = client.post(
        "/api/auth/login",
        json={"username": "13800139999", "password": "TestPass1"},
    )
    token = login.get_json()["access_token"]
    res = client.get("/api/members", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_section_leader_only_same_voice_part(client, app):
    with app.app_context():
        admin = User.query.filter_by(username="13900000001").first()
        choir_id = admin.choir_id
        from app.models import ChoirRole

        sl_role = ChoirRole.query.filter_by(choir_id=choir_id, role_code="section_leader").first()
        member_role = ChoirRole.query.filter_by(choir_id=choir_id, role_code="member").first()

        leader = User(
            choir_id=choir_id,
            role_id=sl_role.role_id,
            username="13800138888",
            password_hash=hash_password("TestPass1"),
            name="声部长",
            voice_part=1,
            status="active",
        )
        same_vp = User(
            choir_id=choir_id,
            role_id=member_role.role_id,
            username="13800138889",
            password_hash=hash_password("TestPass1"),
            name="同声部",
            voice_part=1,
            status="active",
        )
        other_vp = User(
            choir_id=choir_id,
            role_id=member_role.role_id,
            username="13800138890",
            password_hash=hash_password("TestPass1"),
            name="异声部",
            voice_part=5,
            status="active",
        )
        db.session.add_all([leader, same_vp, other_vp])
        db.session.commit()

    login = client.post(
        "/api/auth/login",
        json={"username": "13800138888", "password": "TestPass1"},
    )
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}
    res = client.get("/api/members", headers=headers)
    assert res.status_code == 200
    names = {m["name"] for m in res.get_json()["members"]}
    assert "同声部" in names
    assert "异声部" not in names


def test_update_member_name(client, choir_admin_headers, app):
    with app.app_context():
        uid = User.query.filter_by(username="13900000001").first().user_id

    res = client.put(
        f"/api/members/{uid}",
        headers=choir_admin_headers,
        json={"name": "管理员改名"},
    )
    assert res.status_code == 200
    assert res.get_json()["name"] == "管理员改名"


def test_login_requires_captcha_after_failures(client, app):
    with app.app_context():
        user = User.query.filter_by(username="13900000001").first()
        user.failed_login_count = 3
        user.locked_until = None
        db.session.commit()

    res = client.post(
        "/api/auth/login",
        json={"username": "13900000001", "password": "wrong"},
    )
    assert res.status_code == 400
    assert "验证码" in res.get_json().get("error", "")


def test_public_choirs_list(client, app):
    res = client.get("/api/choirs/public")
    assert res.status_code == 200
    assert len(res.get_json().get("choirs", [])) >= 1
