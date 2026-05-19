from datetime import date, datetime, timezone

from flask import jsonify, request

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import Project, ProjectTodo, ProjectTransaction
from app.services.operation_log import write_operation_log
from app.services.project_access import (
    can_edit_project,
    can_read_projects,
    can_write_projects,
    project_visible_to_user,
)
from app.services.project_summary import build_project_summary


def _choir_id(user):
    if user.system_super_admin:
        cid = request.args.get("choir_id", type=int)
        if cid is None and request.is_json:
            data = request.get_json(silent=True) or {}
            cid = data.get("choir_id")
        if cid is None:
            cid = request.form.get("choir_id", type=int)
        return cid
    return user.choir_id


def _require_choir_id(user):
    cid = _choir_id(user)
    if not cid:
        return None, (jsonify({"error": "缺少 choir_id"}), 400)
    return cid, None


@api_bp.get("/projects/meta")
@login_required
def projects_meta():
    user = get_current_user()
    if not can_read_projects(user):
        return jsonify({"error": "无权限", "required": "projects.read"}), 403
    choir_id, err = _require_choir_id(user)
    if err:
        return err
    years = (
        db.session.query(Project.year)
        .filter_by(choir_id=choir_id)
        .distinct()
        .order_by(Project.year.desc())
        .all()
    )
    types = (
        db.session.query(Project.category_type)
        .filter_by(choir_id=choir_id)
        .distinct()
        .order_by(Project.category_type.asc())
        .all()
    )
    return jsonify(
        {
            "years": [y[0] for y in years],
            "category_types": [t[0] for t in types if t[0]],
            "default_types": ["演出", "排练", "采购", "行政", "其他"],
        }
    )


@api_bp.get("/projects")
@login_required
def projects_list():
    user = get_current_user()
    if not can_read_projects(user):
        return jsonify({"error": "无权限", "required": "projects.read"}), 403
    choir_id, err = _require_choir_id(user)
    if err:
        return err

    q = Project.query.filter_by(choir_id=choir_id)
    year = request.args.get("year", type=int)
    category_type = (request.args.get("category_type") or "").strip()
    status = (request.args.get("status") or "").strip()
    search = (request.args.get("q") or "").strip()
    if year:
        q = q.filter_by(year=year)
    if category_type and category_type != "all":
        q = q.filter_by(category_type=category_type)
    if status and status != "all":
        q = q.filter_by(status=status)
    if search:
        q = q.filter(Project.title.contains(search))

    rows = q.order_by(Project.updated_at.desc()).limit(200).all()
    return jsonify({"projects": [p.to_dict() for p in rows], "total": len(rows)})


@api_bp.post("/projects")
@login_required
def projects_create():
    user = get_current_user()
    if not can_write_projects(user):
        return jsonify({"error": "无权限", "required": "projects.write"}), 403
    data = request.get_json(silent=True) or {}
    choir_id = _choir_id(user) or data.get("choir_id")
    if not choir_id:
        return jsonify({"error": "缺少 choir_id"}), 400

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "请输入事项名称"}), 400
    try:
        year = int(data.get("year") or datetime.now(timezone.utc).year)
    except (TypeError, ValueError):
        return jsonify({"error": "年份无效"}), 400
    category_type = (data.get("category_type") or "其他").strip()[:32] or "其他"

    project = Project(
        choir_id=int(choir_id),
        year=year,
        category_type=category_type,
        title=title[:200],
        status="in_progress",
        progress_note=(data.get("progress_note") or "").strip() or None,
        created_by=user.user_id,
    )
    db.session.add(project)
    db.session.commit()
    write_operation_log(
        "projects.create",
        user=user,
        resource_type="project",
        resource_id=str(project.project_id),
        detail={"title": project.title},
    )
    return jsonify(project.to_dict(include_detail=True)), 201


@api_bp.get("/projects/<int:project_id>")
@login_required
def projects_get(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not project_visible_to_user(user, project):
        return jsonify({"error": "无权限"}), 403
    return jsonify(project.to_dict(include_detail=True))


@api_bp.patch("/projects/<int:project_id>")
@login_required
def projects_patch(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    data = request.get_json(silent=True) or {}
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "事项名称不能为空"}), 400
        project.title = title[:200]
    if "year" in data:
        try:
            project.year = int(data["year"])
        except (TypeError, ValueError):
            return jsonify({"error": "年份无效"}), 400
    if "category_type" in data:
        project.category_type = (data.get("category_type") or "其他").strip()[:32] or "其他"
    if "progress_note" in data:
        project.progress_note = (data.get("progress_note") or "").strip() or None
    if "summary" in data:
        project.summary = (data.get("summary") or "").strip() or None
    if "status" in data:
        st = (data.get("status") or "").strip()
        if st in ("in_progress", "completed", "cancelled"):
            project.status = st
            if st == "completed" and not project.completed_at:
                project.completed_at = datetime.now(timezone.utc)
            if st != "completed":
                project.completed_at = None
    db.session.commit()
    return jsonify(project.to_dict(include_detail=True))


@api_bp.post("/projects/<int:project_id>/complete")
@login_required
def projects_complete(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    data = request.get_json(silent=True) or {}
    summary = (data.get("summary") or "").strip()
    if not summary:
        summary = build_project_summary(project)
    project.summary = summary
    project.status = "completed"
    project.completed_at = datetime.now(timezone.utc)
    db.session.commit()
    write_operation_log(
        "projects.complete",
        user=user,
        resource_type="project",
        resource_id=str(project.project_id),
    )
    return jsonify(project.to_dict(include_detail=True))


@api_bp.delete("/projects/<int:project_id>")
@login_required
def projects_delete(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    db.session.delete(project)
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.post("/projects/<int:project_id>/transactions")
@login_required
def project_transaction_create(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    data = request.get_json(silent=True) or {}
    direction = (data.get("direction") or "").strip()
    if direction not in ("income", "expense"):
        return jsonify({"error": "direction 须为 income 或 expense"}), 400
    try:
        amount = float(data.get("amount"))
        if amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"error": "金额须为正数"}), 400
    txn_date_raw = (data.get("txn_date") or "").strip()
    try:
        txn_date = date.fromisoformat(txn_date_raw) if txn_date_raw else date.today()
    except ValueError:
        return jsonify({"error": "日期格式无效"}), 400

    txn = ProjectTransaction(
        project_id=project.project_id,
        txn_date=txn_date,
        direction=direction,
        amount=amount,
        description=(data.get("description") or "").strip()[:500] or None,
        created_by=user.user_id,
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify(txn.to_dict()), 201


@api_bp.delete("/projects/<int:project_id>/transactions/<int:transaction_id>")
@login_required
def project_transaction_delete(project_id: int, transaction_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    txn = ProjectTransaction.query.filter_by(
        transaction_id=transaction_id, project_id=project_id
    ).first_or_404()
    db.session.delete(txn)
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.post("/projects/<int:project_id>/todos")
@login_required
def project_todo_create(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "请输入待办内容"}), 400
    max_order = (
        db.session.query(db.func.max(ProjectTodo.sort_order))
        .filter_by(project_id=project_id)
        .scalar()
        or 0
    )
    todo = ProjectTodo(
        project_id=project_id,
        content=content[:500],
        sort_order=int(max_order) + 1,
    )
    db.session.add(todo)
    db.session.commit()
    return jsonify(todo.to_dict()), 201


@api_bp.patch("/projects/<int:project_id>/todos/<int:todo_id>")
@login_required
def project_todo_patch(project_id: int, todo_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    todo = ProjectTodo.query.filter_by(todo_id=todo_id, project_id=project_id).first_or_404()
    data = request.get_json(silent=True) or {}
    if "content" in data:
        content = (data.get("content") or "").strip()
        if not content:
            return jsonify({"error": "待办内容不能为空"}), 400
        todo.content = content[:500]
    if "is_done" in data:
        done = bool(data.get("is_done"))
        todo.is_done = done
        todo.completed_at = datetime.now(timezone.utc) if done else None
    db.session.commit()
    return jsonify(todo.to_dict())


@api_bp.delete("/projects/<int:project_id>/todos/<int:todo_id>")
@login_required
def project_todo_delete(project_id: int, todo_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    todo = ProjectTodo.query.filter_by(todo_id=todo_id, project_id=project_id).first_or_404()
    db.session.delete(todo)
    db.session.commit()
    return jsonify({"ok": True})
