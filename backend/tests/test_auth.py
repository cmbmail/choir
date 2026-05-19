import hashlib
import uuid
from datetime import datetime, timedelta

from app.extensions import db
from app.models import CaptchaChallenge, ChoirRole, InvitationCode, User
from app.services.invite_code import generate_plain_code, hash_code
from app.services.password import hash_password


def _captcha_hash(code: str) -> str:
    return hashlib.sha256(code.lower().encode()).hexdigest()


def _seed_captcha(app, code: str = "abcd") -> dict:
    with app.app_context():
        captcha_id = str(uuid.uuid4())
        db.session.add(
            CaptchaChallenge(
                captcha_id=captcha_id,
                answer_hash=_captcha_hash(code),
                expires_at=datetime.utcnow() + timedelta(minutes=5),
            )
        )
        db.session.commit()
    return {"captcha_id": captcha_id, "captcha_code": code}


def test_login_and_me(client, choir_admin_headers):
    res = client.get("/api/auth/me", headers=choir_admin_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["username"] == "13900000001"
    assert body["role_code"] == "super_admin"


def test_login_lockout_after_failures(client, app):
    with app.app_context():
        user = User.query.filter_by(username="13900000001").first()
        user.failed_login_count = 0
        user.locked_until = datetime.utcnow() + timedelta(minutes=15)
        db.session.commit()

    res = client.post(
        "/api/auth/login",
        json={"username": "13900000001", "password": "ChoirAdmin1"},
    )
    assert res.status_code == 423


def test_login_identity_select(client, app):
    with app.app_context():
        from app.models import Choir
        from app.services.choir_bootstrap import next_choir_slug, seed_builtin_roles

        slug = next_choir_slug()
        choir2 = Choir(name="第二团", slug=slug, max_members=100, status="active")
        db.session.add(choir2)
        db.session.flush()
        roles = seed_builtin_roles(choir2)
        db.session.add(
            User(
                choir_id=choir2.choir_id,
                role_id=roles["member"].role_id,
                username="13800138888",
                password_hash=hash_password("SamePass1"),
                name="双身份团员",
                status="active",
            )
        )
        from app.models import ChoirRole

        admin = User.query.filter_by(username="13900000001").first()
        choir1 = admin.choir
        choir1.name = "第一团"
        member_role1 = ChoirRole.query.filter_by(
            choir_id=choir1.choir_id, role_code="member"
        ).first()
        db.session.add(
            User(
                choir_id=choir1.choir_id,
                role_id=member_role1.role_id,
                username="13800138888",
                password_hash=hash_password("SamePass1"),
                name="双身份团员",
                status="active",
            )
        )
        db.session.commit()

    res = client.post(
        "/api/auth/login",
        json={"username": "13800138888", "password": "SamePass1"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("need_identity_select") is True
    assert len(body["identities"]) == 2

    uid = body["identities"][0]["user_id"]
    res2 = client.post(
        "/api/auth/login",
        json={"username": "13800138888", "password": "SamePass1", "user_id": uid},
    )
    assert res2.status_code == 200
    assert res2.get_json().get("access_token")


def test_choir_contexts_multi_and_single(client, app, choir_admin_headers):
    res = client.get("/api/auth/choir-contexts", headers=choir_admin_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["multiple"] is False
    assert len(body["choirs"]) == 1

    with app.app_context():
        from app.models import Choir, ChoirRole, User
        from app.services.choir_bootstrap import next_choir_slug, seed_builtin_roles

        slug = next_choir_slug()
        choir2 = Choir(name="上下文二团", slug=slug, max_members=100, status="active")
        db.session.add(choir2)
        db.session.flush()
        seed_builtin_roles(choir2)
        admin_user = User.query.filter_by(username="13900000001").first()
        member_role = ChoirRole.query.filter_by(
            choir_id=choir2.choir_id, role_code="member"
        ).first()
        db.session.add(
            User(
                choir_id=choir2.choir_id,
                role_id=member_role.role_id,
                username=admin_user.username,
                password_hash=admin_user.password_hash,
                name="双团管理",
                status="active",
            )
        )
        db.session.commit()

    res2 = client.get("/api/auth/choir-contexts", headers=choir_admin_headers)
    assert res2.status_code == 200
    body2 = res2.get_json()
    assert body2["multiple"] is True
    assert len(body2["choirs"]) == 2


def test_register_with_invite(client, app):
    with app.app_context():
        choir = User.query.filter_by(username="13900000001").first().choir
        plain = generate_plain_code()
        invite = InvitationCode(
            choir_id=choir.choir_id,
            code_hash=hash_code(plain),
            max_uses=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.session.add(invite)
        db.session.commit()

    res = client.post(
        "/api/auth/register",
        json={
            "invite_code": plain,
            "username": "13800138000",
            "name": "新团员",
            "password": "TestPass1",
        },
    )
    assert res.status_code == 201
    assert res.get_json()["user"]["username"] == "13800138000"


def test_invite_preview(client, app):
    with app.app_context():
        choir = User.query.filter_by(username="13900000001").first().choir
        choir_name = choir.name
        plain = generate_plain_code()
        invite = InvitationCode(
            choir_id=choir.choir_id,
            code_hash=hash_code(plain),
            max_uses=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.session.add(invite)
        db.session.commit()

    res = client.get(f"/api/auth/invite-preview?code={plain}")
    assert res.status_code == 200
    assert res.get_json()["choir_name"] == choir_name


def test_register_ignores_client_voice_part(client, app):
    with app.app_context():
        choir = User.query.filter_by(username="13900000001").first().choir
        plain = generate_plain_code()
        invite = InvitationCode(
            choir_id=choir.choir_id,
            code_hash=hash_code(plain),
            max_uses=1,
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.session.add(invite)
        db.session.commit()

    res = client.post(
        "/api/auth/register",
        json={
            "invite_code": plain,
            "username": "13800138001",
            "name": "声部待分配",
            "password": "TestPass1",
            "voice_part": 3,
        },
    )
    assert res.status_code == 201
    with app.app_context():
        user = User.query.filter_by(username="13800138001").first()
        assert user.voice_part is None


def test_change_password_invalidates_token(client, choir_admin_headers):
    res = client.put(
        "/api/auth/password",
        headers=choir_admin_headers,
        json={"old_password": "ChoirAdmin1", "new_password": "ChoirAdmin2"},
    )
    assert res.status_code == 200

    res2 = client.get("/api/auth/me", headers=choir_admin_headers)
    assert res2.status_code == 401


def test_members_list_requires_auth(client):
    res = client.get("/api/members")
    assert res.status_code == 401


def test_members_list_ok(client, choir_admin_headers):
    res = client.get("/api/members", headers=choir_admin_headers)
    assert res.status_code == 200
    assert "members" in res.get_json()


def test_unlock_member(client, choir_admin_headers, app):
    with app.app_context():
        admin = User.query.filter_by(username="13900000001").first()
        locked = User(
            choir_id=admin.choir_id,
            role_id=admin.role_id,
            username="13800138001",
            password_hash=hash_password("TestPass1"),
            name="锁定用户",
            status="active",
            failed_login_count=5,
            locked_until=datetime.utcnow() + timedelta(minutes=15),
        )
        db.session.add(locked)
        db.session.commit()
        uid = locked.user_id

    res = client.post(f"/api/members/{uid}/unlock", headers=choir_admin_headers)
    assert res.status_code == 200

    with app.app_context():
        u = db.session.get(User, uid)
        assert u.failed_login_count == 0
        assert u.locked_until is None


def test_inactive_user_cannot_login(client, app):
    with app.app_context():
        admin = User.query.filter_by(username="13900000001").first()
        db.session.add(
            User(
                choir_id=admin.choir_id,
                role_id=admin.role_id,
                username="13800139999",
                password_hash=hash_password("TestPass1"),
                name="停用用户",
                status="inactive",
            )
        )
        db.session.commit()

    res = client.post(
        "/api/auth/login",
        json={"username": "13800139999", "password": "TestPass1"},
    )
    assert res.status_code == 401


def test_login_locks_after_fifth_failure(client, app):
    with app.app_context():
        user = User.query.filter_by(username="13900000001").first()
        user.failed_login_count = 4
        user.locked_until = None
        db.session.commit()

    cap = _seed_captcha(app)
    res = client.post(
        "/api/auth/login",
        json={
            "username": "13900000001",
            "password": "wrong-password",
            **cap,
        },
    )
    assert res.status_code == 401

    with app.app_context():
        user = User.query.filter_by(username="13900000001").first()
        assert user.failed_login_count >= 5
        assert user.locked_until is not None

    cap2 = _seed_captcha(app)
    res2 = client.post(
        "/api/auth/login",
        json={
            "username": "13900000001",
            "password": "ChoirAdmin1",
            **cap2,
        },
    )
    assert res2.status_code == 423


def test_register_without_invite(client):
    res = client.post(
        "/api/auth/register",
        json={
            "username": "13800138888",
            "name": "无码用户",
            "password": "TestPass1",
        },
    )
    assert res.status_code == 400


def test_members_assign_role(client, choir_admin_headers, app):
    with app.app_context():
        admin = User.query.filter_by(username="13900000001").first()
        member_role = ChoirRole.query.filter_by(
            choir_id=admin.choir_id, role_code="member"
        ).first()
        leader_role = ChoirRole.query.filter_by(
            choir_id=admin.choir_id, role_code="class_leader"
        ).first()
        member = User(
            choir_id=admin.choir_id,
            role_id=member_role.role_id,
            username="13800138802",
            password_hash=hash_password("TestPass1"),
            name="普通团员",
            status="active",
        )
        db.session.add(member)
        db.session.commit()
        member_id = member.user_id
        leader_role_id = leader_role.role_id
        member_role_id = member_role.role_id

    res = client.put(
        f"/api/members/{member_id}",
        headers=choir_admin_headers,
        json={"role_id": leader_role_id},
    )
    assert res.status_code == 200

    with app.app_context():
        assert db.session.get(User, member_id).role_id == leader_role_id

    login = client.post(
        "/api/auth/login",
        json={"username": "13800138802", "password": "TestPass1"},
    )
    assert login.status_code == 200
    member_headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    res2 = client.put(
        f"/api/members/{member_id}",
        headers=member_headers,
        json={"role_id": member_role_id},
    )
    assert res2.status_code == 403
    assert "members.assign_role" in res2.get_json().get("required", "")


def test_invite_create_and_revoke(client, choir_admin_headers):
    res = client.post(
        "/api/invites",
        headers=choir_admin_headers,
        json={"expires_in_days": 7, "max_uses": 1},
    )
    assert res.status_code == 201
    invite_id = res.get_json()["invite_id"]

    res2 = client.get("/api/invites", headers=choir_admin_headers)
    assert res2.status_code == 200
    ids = [i["invite_id"] for i in res2.get_json()["invites"]]
    assert invite_id in ids

    res3 = client.delete(f"/api/invites/{invite_id}", headers=choir_admin_headers)
    assert res3.status_code == 200
