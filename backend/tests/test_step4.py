"""阶段一第 4 步：合唱团停用、操作日志"""

from app.extensions import db
from app.models import Choir, OperationLog, User
from app.services.password import hash_password


def test_choir_suspend_blocks_login(client, choir_admin_headers, app):
    with app.app_context():
        choir_id = Choir.query.filter_by(slug="choir_test").first().choir_id

    res = client.patch(
        f"/api/choirs/{choir_id}/status",
        headers=choir_admin_headers,
        json={"status": "suspended"},
    )
    assert res.status_code == 200
    assert res.get_json()["status"] == "suspended"

    login = client.post(
        "/api/auth/login",
        json={"username": "13900000001", "password": "ChoirAdmin1"},
    )
    assert login.status_code == 401

    with app.app_context():
        assert OperationLog.query.filter_by(action="choir.suspend").count() >= 1


def test_choir_admin_can_list_logs(client, choir_admin_headers, app):
    with app.app_context():
        choir_id = Choir.query.filter_by(slug="choir_test").first().choir_id

    res = client.get(
        f"/api/system/logs?choir_id={choir_id}&limit=20",
        headers=choir_admin_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert "logs" in body
    assert body["total"] >= 0


def test_member_cannot_list_logs(client, app):
    with app.app_context():
        choir = Choir.query.filter_by(slug="choir_test").first()
        member_role = choir.roles.filter_by(role_code="member").first()
        member = User(
            choir_id=choir.choir_id,
            role_id=member_role.role_id,
            username="13800990002",
            password_hash=hash_password("TestPass1"),
            name="普通团员",
            status="active",
        )
        db.session.add(member)
        db.session.commit()

    login = client.post(
        "/api/auth/login",
        json={"username": "13800990002", "password": "TestPass1"},
    )
    assert login.status_code == 200
    token = login.get_json()["access_token"]
    res = client.get("/api/system/logs", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_roles_permissions_catalog(client, choir_admin_headers):
    res = client.get("/api/choir/permissions", headers=choir_admin_headers)
    assert res.status_code == 200
    perms = res.get_json()["permissions"]
    assert "choir.suspend" in perms
    assert "roles.manage" in perms
