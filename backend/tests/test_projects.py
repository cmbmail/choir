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
