import io
import tempfile

import pytest

from app.config import Config


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


def test_system_storage(client, choir_admin_headers, app_phase2):
    res = client.get("/api/system/storage", headers=choir_admin_headers)
    assert res.status_code == 200
    data = res.get_json()
    assert "used_bytes" in data
    assert "quota_bytes" in data
    assert data["cde_mode"] == "mock"
