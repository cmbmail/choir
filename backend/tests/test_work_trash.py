import io
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

from app.extensions import db
from app.models import Work


@pytest.fixture
def app_phase2(app):
    app.config["CDE_MODE"] = "mock"
    app.config["CDE_STORAGE_ROOT"] = tempfile.mkdtemp(prefix="choir_cde_test_")
    return app


def test_work_soft_delete_restore_and_purge(client, choir_admin_headers, app_phase2):
    res = client.post(
        "/api/works",
        json={"name": "待删除作品", "composer": "测"},
        headers=choir_admin_headers,
    )
    assert res.status_code == 201
    work_id = res.get_json()["work_id"]

    data = b"%PDF-1.4 trash test"
    res = client.post(
        "/api/documents/upload",
        data={
            "file": (io.BytesIO(data), "trash.pdf"),
            "title": "歌谱",
            "doc_type": "score",
            "work_id": str(work_id),
        },
        headers=choir_admin_headers,
        content_type="multipart/form-data",
    )
    assert res.status_code == 201

    res = client.delete(f"/api/works/{work_id}", headers=choir_admin_headers)
    assert res.status_code == 200
    assert res.get_json()["doc_count"] == 1

    res = client.get("/api/works", headers=choir_admin_headers)
    assert work_id not in [w["work_id"] for w in res.get_json()["works"]]

    res = client.get("/api/works/trash", headers=choir_admin_headers)
    assert res.status_code == 200
    trash = res.get_json()["works"]
    assert any(w["work_id"] == work_id for w in trash)
    assert trash[0]["purge_eligible"] is False

    res = client.get(f"/api/documents?work_id={work_id}", headers=choir_admin_headers)
    assert res.status_code == 410

    res = client.get(f"/api/works/{work_id}", headers=choir_admin_headers)
    assert res.status_code == 410

    res = client.delete(
        f"/api/works/{work_id}/permanent", headers=choir_admin_headers
    )
    assert res.status_code == 403

    res = client.post(f"/api/works/{work_id}/restore", headers=choir_admin_headers)
    assert res.status_code == 200

    res = client.get("/api/works", headers=choir_admin_headers)
    assert work_id in [w["work_id"] for w in res.get_json()["works"]]

    res = client.delete(f"/api/works/{work_id}", headers=choir_admin_headers)
    assert res.status_code == 200

    work = Work.query.get(work_id)
    work.deleted_at = datetime.now(timezone.utc) - timedelta(days=8)
    db.session.commit()

    res = client.post("/api/works/trash/purge", headers=choir_admin_headers)
    assert res.status_code == 200
    assert res.get_json()["removed"] >= 1
    assert Work.query.get(work_id) is None
