import os
import sys
import warnings

import pytest

try:
    from sqlalchemy.exc import LegacyAPIWarning

    warnings.filterwarnings("ignore", category=LegacyAPIWarning)
except ImportError:
    pass
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.config import Config
from app.extensions import db
from app.models import Choir, User
from app.services.choir_bootstrap import seed_builtin_roles
from app.services.password import hash_password


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
    AUTH_MODE = "development"
    JWT_SECRET = "test-jwt-secret-for-pytest-only-32b"
    SECRET_KEY = "test-secret"
    INVITE_CODE_PEPPER = "test-invite-pepper"
    LOGIN_MAX_FAILURES = 5
    LOGIN_CAPTCHA_AFTER_FAILURES = 3


@pytest.fixture
def app():
    application = create_app(TestConfig)
    with application.app_context():
        db.create_all()
        choir = Choir(name="测试团", slug="choir_test", max_members=100, status="active")
        db.session.add(choir)
        db.session.flush()
        roles = seed_builtin_roles(choir)
        admin = User(
            choir_id=choir.choir_id,
            role_id=roles["super_admin"].role_id,
            username="13900000001",
            password_hash=hash_password("ChoirAdmin1"),
            name="测试管理员",
            status="active",
        )
        member_role = roles["member"]
        db.session.add(admin)
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def choir_admin_headers(client):
    res = client.post(
        "/api/auth/login",
        json={"username": "13900000001", "password": "ChoirAdmin1"},
    )
    assert res.status_code == 200, res.get_json()
    token = res.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
