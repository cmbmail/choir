import json
import mimetypes
from io import BytesIO

from flask import jsonify, redirect, request, send_file

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import Choir, Document, Recording, Work, WorkShare
from app.services.cde_service import (
    CdeError,
    delete_file,
    get_download_url,
    is_pds_mode,
    make_play_url,
    resolve_file_path,
    upload_file,
    verify_stream_token,
)
from app.services.document_access import (
    can_read_documents,
    can_read_recordings,
    can_write_documents,
    can_write_recordings,
)
from app.services.operation_log import write_operation_log
from app.services.work_access import (
    can_manage_work_shares,
    can_read_work,
    can_write_work,
    shared_choir_ids,
    works_for_choir_query,
)
from app.services.upload_validation import validate_upload


def _choir_id(user):
    if user.system_super_admin:
        return request.args.get("choir_id", type=int) or request.form.get("choir_id", type=int)
    return user.choir_id


def _work_payload(work: Work, choir_id, include_recordings=False):
    shares = shared_choir_ids(work.work_id)
    item = work.to_dict(
        include_recordings=include_recordings,
        viewer_choir_id=choir_id,
        shared_choir_ids=shares,
    )
    item["score_count"] = Document.query.filter_by(
        work_id=work.work_id, doc_type="score"
    ).count()
    item["doc_count"] = Document.query.filter_by(work_id=work.work_id).count()
    shared_names = []
    if shares:
        rows = Choir.query.filter(Choir.choir_id.in_(shares)).all()
        shared_names = [c.name for c in rows]
    item["shared_choir_names"] = shared_names
    return item


@api_bp.get("/works")
@login_required
def works_list():
    user = get_current_user()
    if not can_read_recordings(user) and not can_read_documents(user):
        return jsonify({"error": "无权限"}), 403
    choir_id = _choir_id(user)
    if not choir_id:
        return jsonify({"works": []})
    include_recordings = request.args.get("include_recordings", "1") != "0"
    rows = works_for_choir_query(choir_id).order_by(Work.created_at.desc()).all()
    works = [_work_payload(w, choir_id, include_recordings) for w in rows]
    return jsonify({"works": works})


@api_bp.get("/works/<int:work_id>")
@login_required
def works_get(work_id: int):
    user = get_current_user()
    work = Work.query.get_or_404(work_id)
    if not can_read_work(user, work):
        return jsonify({"error": "无权限"}), 403
    if not can_read_recordings(user) and not can_read_documents(user):
        return jsonify({"error": "无权限"}), 403
    choir_id = user.choir_id or work.choir_id
    return jsonify(_work_payload(work, choir_id, include_recordings=True))


@api_bp.post("/works")
@login_required
def works_create():
    user = get_current_user()
    if not can_write_recordings(user) and not can_write_documents(user):
        return jsonify({"error": "无权限"}), 403

    data = request.get_json(silent=True) or {}
    if user.system_super_admin:
        choir_id = data.get("choir_id") or request.args.get("choir_id", type=int)
        if not choir_id:
            return jsonify({"error": "系统超管创建作品须指定 choir_id"}), 400
    else:
        choir_id = user.choir_id
    if not choir_id:
        return jsonify({"error": "缺少 choir_id"}), 400
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "缺少作品名称"}), 400

    work = Work(
        choir_id=choir_id,
        name=name[:100],
        composer=(data.get("composer") or "")[:50] or None,
    )
    db.session.add(work)
    db.session.commit()
    write_operation_log(
        "works.create", user=user, resource_type="work", resource_id=str(work.work_id)
    )
    viewer = user.choir_id or choir_id
    return jsonify(_work_payload(work, viewer)), 201


@api_bp.patch("/works/<int:work_id>")
@login_required
def works_patch(work_id: int):
    user = get_current_user()
    work = Work.query.get_or_404(work_id)
    if not can_write_work(user, work):
        return jsonify({"error": "无权限"}), 403

    data = request.get_json(silent=True) or {}
    name = data.get("name")
    if name is not None:
        name = str(name).strip()
        if not name:
            return jsonify({"error": "作品名称不能为空"}), 400
        work.name = name[:100]
    if "composer" in data:
        comp = (data.get("composer") or "").strip()
        work.composer = comp[:50] or None

    db.session.commit()
    write_operation_log(
        "works.update", user=user, resource_type="work", resource_id=str(work_id)
    )
    choir_id = user.choir_id or work.choir_id
    return jsonify(_work_payload(work, choir_id))


@api_bp.put("/works/<int:work_id>/shares")
@login_required
def works_set_shares(work_id: int):
    user = get_current_user()
    work = Work.query.get_or_404(work_id)
    if not can_manage_work_shares(user, work):
        return jsonify({"error": "无权限设置共享"}), 403

    data = request.get_json(silent=True) or {}
    raw_ids = data.get("choir_ids") or []
    try:
        target_ids = {int(x) for x in raw_ids if int(x) != work.choir_id}
    except (TypeError, ValueError):
        return jsonify({"error": "choir_ids 须为整数数组"}), 400

    if target_ids:
        valid = {
            c.choir_id
            for c in Choir.query.filter(
                Choir.choir_id.in_(target_ids), Choir.status == "active"
            ).all()
        }
        if valid != target_ids:
            return jsonify({"error": "存在无效的合唱团 ID"}), 400

    WorkShare.query.filter_by(work_id=work_id).delete()
    for cid in sorted(target_ids):
        db.session.add(
            WorkShare(work_id=work_id, choir_id=cid, shared_by=user.user_id)
        )
    db.session.commit()
    write_operation_log(
        "works.share",
        user=user,
        resource_type="work",
        resource_id=str(work_id),
        detail={"choir_ids": sorted(target_ids)},
    )
    choir_id = user.choir_id or work.choir_id
    return jsonify(_work_payload(work, choir_id))


@api_bp.get("/choirs/share-targets")
@login_required
def choirs_share_targets():
    user = get_current_user()
    if not user.system_super_admin and user.role_code not in (
        "super_admin",
        "conductor",
    ):
        return jsonify({"error": "无权限"}), 403
    q = Choir.query.filter_by(status="active").order_by(Choir.choir_id)
    if not user.system_super_admin and user.choir_id:
        q = q.filter(Choir.choir_id != user.choir_id)
    return jsonify({"choirs": [c.to_dict() for c in q.all()]})


@api_bp.post("/works/<int:work_id>/recordings/upload")
@login_required
def recordings_upload(work_id: int):
    user = get_current_user()
    if not can_write_recordings(user):
        return jsonify({"error": "无权限", "required": "recordings.write"}), 403

    work = Work.query.get_or_404(work_id)
    if not can_write_work(user, work):
        return jsonify({"error": "无权限"}), 403

    f = request.files.get("file")
    if not f:
        return jsonify({"error": "缺少 file"}), 400

    name = (request.form.get("name") or f.filename or "录音").strip()[:100]
    parts_raw = request.form.get("parts")
    parts = None
    if parts_raw:
        try:
            parts = json.loads(parts_raw)
        except json.JSONDecodeError:
            return jsonify({"error": "parts 须为 JSON 数组"}), 400

    data = f.read()
    ok, msg = validate_upload(f.filename or "", len(data), f.mimetype)
    if not ok:
        return jsonify({"error": msg}), 400

    try:
        cde_id, stored_size = upload_file(
            work.choir_id, "recordings", BytesIO(data), f.filename or "file", f.mimetype
        )
    except CdeError as e:
        return jsonify({"error": str(e)}), 503

    rec = Recording(
        choir_id=work.choir_id,
        work_id=work.work_id,
        name=name,
        cde_file_id=cde_id,
        file_name=f.filename,
        mime_type=f.mimetype or mimetypes.guess_type(f.filename or "")[0],
        file_size=stored_size,
        parts=parts,
        uploaded_by=user.user_id,
    )
    db.session.add(rec)
    db.session.commit()
    write_operation_log(
        "recordings.upload",
        user=user,
        resource_type="recording",
        resource_id=str(rec.recording_id),
        detail={"work_id": work_id, "name": name},
    )
    return jsonify(rec.to_dict(include_stream=True)), 201


@api_bp.delete("/recordings/<int:recording_id>")
@login_required
def recordings_delete(recording_id: int):
    user = get_current_user()
    rec = Recording.query.get_or_404(recording_id)
    work = Work.query.get(rec.work_id)
    if not work or not can_write_work(user, work):
        return jsonify({"error": "无权限"}), 403
    if not can_write_recordings(user):
        return jsonify({"error": "无权限"}), 403

    if rec.cde_file_id:
        try:
            delete_file(rec.cde_file_id, rec.choir_id)
        except CdeError:
            pass
    db.session.delete(rec)
    db.session.commit()
    write_operation_log(
        "recordings.delete",
        user=user,
        resource_type="recording",
        resource_id=str(recording_id),
    )
    return jsonify({"ok": True})


@api_bp.get("/recordings/<int:recording_id>/stream")
def recordings_stream(recording_id: int):
    token = request.args.get("token")
    rec = Recording.query.get_or_404(recording_id)
    work = Work.query.get(rec.work_id)

    if not token:
        user = get_current_user()
        if (
            not user
            or not work
            or not can_read_work(user, work)
            or not can_read_recordings(user)
        ):
            return jsonify({"error": "未授权"}), 401
    elif not rec.cde_file_id or not verify_stream_token(rec.choir_id, rec.cde_file_id, token):
        return jsonify({"error": "链接无效或已过期"}), 403

    if is_pds_mode():
        try:
            url = get_download_url(rec.cde_file_id or "", mime_type=rec.mime_type)
            return redirect(url)
        except CdeError as e:
            return jsonify({"error": str(e)}), 404

    path = resolve_file_path(rec.choir_id, rec.cde_file_id or "")
    if not path:
        return jsonify({"error": "文件不存在"}), 404
    mime = rec.mime_type or mimetypes.guess_type(rec.file_name or "")[0] or "audio/mpeg"
    return send_file(path, mimetype=mime, as_attachment=False, download_name=rec.file_name or "audio")


@api_bp.get("/recordings/<int:recording_id>/play-url")
@login_required
def recordings_play_url(recording_id: int):
    user = get_current_user()
    rec = Recording.query.get_or_404(recording_id)
    work = Work.query.get(rec.work_id)
    if not work or not can_read_work(user, work):
        return jsonify({"error": "无权限"}), 403
    if not can_read_recordings(user):
        return jsonify({"error": "无权限"}), 403
    if not rec.cde_file_id:
        return jsonify({"error": "无可播放文件"}), 404
    ttl = int(request.args.get("ttl", 3600))
    try:
        payload = make_play_url(
            "recordings",
            rec.recording_id,
            rec.choir_id,
            rec.cde_file_id,
            ttl,
            rec.mime_type,
        )
        return jsonify({"url": payload["url"], "expires_in": payload["expires_in"]})
    except CdeError as e:
        return jsonify({"error": str(e)}), 503
