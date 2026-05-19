import io


def test_projects_crud_and_complete(client, choir_admin_headers):
    h = choir_admin_headers
    meta = client.get("/api/projects/meta?choir_id=1", headers=h)
    assert meta.status_code == 200

    res = client.post(
        "/api/projects",
        json={
            "choir_id": 1,
            "year": 2026,
            "category_type": "演出",
            "title": "六月汇演",
            "progress_note": "筹备中",
        },
        headers=h,
    )
    assert res.status_code == 201, res.get_json()
    pid = res.get_json()["project_id"]

    txn = client.post(
        f"/api/projects/{pid}/transactions",
        json={
            "txn_date": "2026-05-01",
            "direction": "expense",
            "amount": 1200,
            "description": "服装",
        },
        headers=h,
    )
    assert txn.status_code == 201

    todo = client.post(
        f"/api/projects/{pid}/todos",
        json={"content": "确认场地"},
        headers=h,
    )
    assert todo.status_code == 201
    tid = todo.get_json()["todo_id"]

    client.patch(
        f"/api/projects/{pid}/todos/{tid}",
        json={"is_done": True},
        headers=h,
    )

    done = client.post(f"/api/projects/{pid}/complete", json={}, headers=h)
    assert done.status_code == 200
    body = done.get_json()
    assert body["status"] == "completed"
    assert body["summary"]
    assert "六月汇演" in body["summary"]

    lst = client.get("/api/projects?choir_id=1&year=2026", headers=h)
    assert lst.status_code == 200
    assert lst.get_json()["total"] >= 1

    txn2 = client.post(
        f"/api/projects/{pid}/transactions",
        json={"direction": "income", "amount": 100},
        headers=h,
    )
    assert txn2.status_code == 400

    asset = client.post(
        f"/api/projects/{pid}/assets",
        data={
            "media_kind": "text",
            "title": "总结稿",
            "file": (io.BytesIO(b"hello"), "note.txt"),
        },
        headers=h,
        content_type="multipart/form-data",
    )
    assert asset.status_code == 201, asset.get_json()
    aid = asset.get_json()["asset_id"]

    detail = client.get(f"/api/projects/{pid}", headers=h)
    assert detail.status_code == 200
    assets = detail.get_json().get("assets") or []
    assert any(a["asset_id"] == aid for a in assets)

    stream = client.get(f"/api/projects/{pid}/assets/{aid}/stream", headers=h)
    assert stream.status_code in (302, 200)

    client.delete(f"/api/projects/{pid}/assets/{aid}", headers=h)
