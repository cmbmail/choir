import mimetypes
from datetime import date, datetime, timezone
from io import BytesIO

from flask import jsonify, redirect, request, send_file

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import Project, ProjectAsset, ProjectTodo, ProjectTransaction
from app.services.cde_service import (
    CdeError,
    get_download_url,
    is_pds_mode,
    resolve_file_path,
    upload_file,
)
from app.services import pds_storage
from app.services.upload_validation import validate_upload
from app.services.operation_log import write_operation_log
from app.services.project_access import (
    can_edit_project,
    can_read_projects,
    can_write_projects,
    project_visible_to_user,
)
from app.services.project_summary import build_project_summary

ASSET_EXTENSIONS = {
    "video": {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"},
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic"},
    "text": {
        ".pdf",
        ".doc",
        ".docx",
        ".txt",
        ".rtf",
        ".odt",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
    },
}


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


def _ext_ok(media_kind: str, filename: str) -> bool:
    if not filename or "." not in filename:
        return False
    ext = "." + filename.rsplit(".", 1)[-1].lower()
    return ext in ASSET_EXTENSIONS.get(media_kind, set())


def _reject_if_completed(project: Project, action: str):
    if project.status == "completed":
        return jsonify({"error": f"项目已完成，无法{action}"}), 400
    return None


def _require_completed(project: Project):
    if project.status != "completed":
        return jsonify({"error": "仅已完成项目可管理项目资料"}), 400
    return None


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
        if project.status == "completed":
            return jsonify({"error": "已完成项目不可修改进度"}), 400
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
    err = _reject_if_completed(project, "记流水")
    if err:
        return err
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
    err = _reject_if_completed(project, "删除流水")
    if err:
        return err
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
    err = _reject_if_completed(project, "添加待办")
    if err:
        return err
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
    err = _reject_if_completed(project, "修改待办")
    if err:
        return err
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
    err = _reject_if_completed(project, "删除待办")
    if err:
        return err
    todo = ProjectTodo.query.filter_by(todo_id=todo_id, project_id=project_id).first_or_404()
    db.session.delete(todo)
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.post("/projects/<int:project_id>/assets")
@login_required
def project_asset_create(project_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    err = _require_completed(project)
    if err:
        return err

    media_kind = (request.form.get("media_kind") or "").strip()
    if media_kind not in ("video", "image", "text"):
        return jsonify({"error": "media_kind 须为 video / image / text"}), 400

    title = (request.form.get("title") or "").strip()
    video_url = (request.form.get("video_url") or "").strip()[:500] or None
    f = request.files.get("file")

    if media_kind == "video" and video_url and not f:
        if not title:
            title = "视频链接"
        asset = ProjectAsset(
            project_id=project_id,
            media_kind=media_kind,
            title=title[:200],
            video_url=video_url,
            created_by=user.user_id,
        )
        db.session.add(asset)
        db.session.commit()
        return jsonify(asset.to_dict()), 201

    if not f:
        return jsonify({"error": "请上传文件或提供视频链接"}), 400
    if not title:
        title = f.filename or "未命名资料"

    data = f.read()
    size = len(data)
    ok, msg = validate_upload(f.filename or "", size, f.mimetype)
    if not ok:
        return jsonify({"error": msg}), 400
    if not _ext_ok(media_kind, f.filename or ""):
        labels = {"video": "影视", "image": "图片", "text": "文档"}
        return jsonify({"error": f"不符合{labels.get(media_kind, '')}文件格式"}), 400

    try:
        cde_id, stored_size = upload_file(
            project.choir_id,
            "project_assets",
            BytesIO(data),
            f.filename or "file",
            f.mimetype,
        )
    except CdeError as e:
        return jsonify({"error": str(e)}), 503

    asset = ProjectAsset(
        project_id=project_id,
        media_kind=media_kind,
        title=title[:200],
        file_name=f.filename,
        mime_type=f.mimetype or mimetypes.guess_type(f.filename or "")[0],
        file_size=stored_size,
        cde_file_id=cde_id,
        video_url=video_url,
        created_by=user.user_id,
    )
    db.session.add(asset)
    db.session.commit()
    return jsonify(asset.to_dict(include_stream=True)), 201


@api_bp.delete("/projects/<int:project_id>/assets/<int:asset_id>")
@login_required
def project_asset_delete(project_id: int, asset_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not can_edit_project(user, project):
        return jsonify({"error": "无权限"}), 403
    err = _require_completed(project)
    if err:
        return err
    asset = ProjectAsset.query.filter_by(
        asset_id=asset_id, project_id=project_id
    ).first_or_404()
    db.session.delete(asset)
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.get("/projects/<int:project_id>/assets/<int:asset_id>/stream")
@login_required
def project_asset_stream(project_id: int, asset_id: int):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    if not project_visible_to_user(user, project):
        return jsonify({"error": "无权限"}), 403
    asset = ProjectAsset.query.filter_by(
        asset_id=asset_id, project_id=project_id
    ).first_or_404()
    if asset.video_url and not asset.cde_file_id:
        return redirect(asset.video_url)
    if not asset.cde_file_id:
        return jsonify({"error": "无可播放文件"}), 404

    mime = asset.mime_type or mimetypes.guess_type(asset.file_name or "")[0] or "application/octet-stream"
    if is_pds_mode():
        try:
            url = get_download_url(asset.cde_file_id, mime_type=asset.mime_type)
            return redirect(url)
        except CdeError as e:
            return jsonify({"error": str(e)}), 404
        except pds_storage.PdsStorageError as e:
            return jsonify({"error": str(e)}), 502

    path = resolve_file_path(project.choir_id, asset.cde_file_id)
    if not path:
        return jsonify({"error": "文件不存在"}), 404
    return send_file(
        path,
        mimetype=mime,
        as_attachment=False,
        download_name=asset.file_name or "file",
        conditional=True,
    )
