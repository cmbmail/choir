import io
import tempfile

import pytest

from app.config import Config
from app.extensions import db
from app.models import Choir, User
from app.services.password import hash_password


@pytest.fixture
def app_phase2(app):
  app.config["CDE_MODE"] = "mock"
  app.config["CDE_STORAGE_ROOT"] = tempfile.mkdtemp(prefix="choir_cde_test_")
  return app


def test_documents_upload_list_stream(client, choir_admin_headers, app_phase2):
    res = client.post(
        "/api/works",
        json={"name": "测试乐谱作品", "composer": "测试"},
        headers=choir_admin_headers,
    )
    assert res.status_code == 201, res.get_json()
    work_id = res.get_json()["work_id"]

    data = b"%PDF-1.4 test choir document"
    res = client.post(
        "/api/documents/upload",
        data={
            "file": (io.BytesIO(data), "test-score.pdf"),
            "title": "测试乐谱",
            "doc_type": "score",
            "work_id": str(work_id),
            "category": "古诗词",
        },
        headers=choir_admin_headers,
        content_type="multipart/form-data",
    )
    assert res.status_code == 201, res.get_json()
    doc_id = res.get_json()["document_id"]

    res = client.get("/api/documents", headers=choir_admin_headers)
    assert res.status_code == 200
    ids = [d["document_id"] for d in res.get_json()["documents"]]
    assert doc_id in ids

    res = client.get(
        f"/api/documents/{doc_id}/play-url", headers=choir_admin_headers
    )
    assert res.status_code == 200
    play = res.get_json()
    assert "token=" in play["url"]

    res = client.get(play["url"])
    assert res.status_code == 200
    assert res.data == data

    res = client.delete(f"/api/documents/{doc_id}", headers=choir_admin_headers)
    assert res.status_code == 200


def test_works_and_recordings(client, choir_admin_headers, app_phase2):
    res = client.post(
        "/api/works",
        json={"name": "测试作品", "composer": "测试"},
        headers=choir_admin_headers,
    )
    assert res.status_code == 201
    work_id = res.get_json()["work_id"]

    audio = b"ID3test audio"
    res = client.post(
        f"/api/works/{work_id}/recordings/upload",
        data={
            "file": (io.BytesIO(audio), "soprano.mp3"),
            "name": "女高部",
            "parts": "[1]",
        },
        headers=choir_admin_headers,
        content_type="multipart/form-data",
    )
    assert res.status_code == 201, res.get_json()
    rec_id = res.get_json()["recording_id"]

    res = client.get("/api/works", headers=choir_admin_headers)
    assert res.status_code == 200
    assert any(w["work_id"] == work_id for w in res.get_json()["works"])

    res = client.get(
        f"/api/recordings/{rec_id}/play-url", headers=choir_admin_headers
    )
    assert res.status_code == 200
    stream_url = res.get_json()["url"]
    res = client.get(stream_url)
    assert res.status_code == 200
    assert res.data == audio


def test_super_admin_works_list_needs_choir_id(client, app_phase2):
    with client.application.app_context():
        choir = Choir.query.first()
        choir_id = choir.choir_id
        sa = User(
            username="19900000001",
            password_hash=hash_password("SysAdmin99x"),
            name="系统超管",
            system_super_admin=True,
            status="active",
        )
        db.session.add(sa)
        db.session.commit()

    login = client.post(
        "/api/auth/login",
        json={"username": "19900000001", "password": "SysAdmin99x"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    assert client.get("/api/works", headers=headers).get_json()["works"] == []

    created = client.post(
        "/api/works",
        json={"name": "超管作品", "choir_id": choir_id},
        headers=headers,
    )
    assert created.status_code == 201
    work_id = created.get_json()["work_id"]

    listed = client.get(f"/api/works?choir_id={choir_id}", headers=headers)
    assert listed.status_code == 200
    assert any(w["work_id"] == work_id for w in listed.get_json()["works"])


def test_work_shares(client, choir_admin_headers, app_phase2):
    res = client.post(
        "/api/works",
        json={"name": "共享测试作品", "composer": "测试"},
        headers=choir_admin_headers,
    )
    assert res.status_code == 201
    work_id = res.get_json()["work_id"]

    res = client.put(
        f"/api/works/{work_id}/shares",
        json={"choir_ids": []},
        headers=choir_admin_headers,
    )
    assert res.status_code == 200
    assert res.get_json()["shared_choir_ids"] == []


def test_system_storage(client, choir_admin_headers, app_phase2):
    res = client.get("/api/system/storage", headers=choir_admin_headers)
    assert res.status_code == 200
    data = res.get_json()
    assert "used_bytes" in data
    assert "quota_bytes" in data
    assert data["cde_mode"] == "mock"
