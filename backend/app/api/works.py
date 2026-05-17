import json
import mimetypes
from io import BytesIO

from flask import jsonify, request, send_file

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import Recording, Work
from app.services.cde_service import (
    CdeError,
    delete_file,
    make_stream_token,
    resolve_file_path,
    upload_file,
    verify_stream_token,
)
from app.services.document_access import can_read_recordings, can_write_recordings
from app.services.operation_log import write_operation_log
from app.services.permissions import has_permission
from app.services.upload_validation import validate_upload


def _choir_id(user):
    if user.system_super_admin:
        return request.args.get("choir_id", type=int) or request.form.get("choir_id", type=int)
    return user.choir_id


@api_bp.get("/works")
@login_required
def works_list():
    user = get_current_user()
    if not can_read_recordings(user):
        return jsonify({"error": "无权限", "required": "recordings.read"}), 403
    choir_id = _choir_id(user)
    if not choir_id:
        return jsonify({"works": []})
    rows = Work.query.filter_by(choir_id=choir_id).order_by(Work.created_at.desc()).all()
    return jsonify({"works": [w.to_dict(include_recordings=True) for w in rows]})


@api_bp.get("/works/<int:work_id>")
@login_required
def works_get(work_id: int):
    user = get_current_user()
    work = Work.query.get_or_404(work_id)
    if not user.system_super_admin and work.choir_id != user.choir_id:
        return jsonify({"error": "无权限"}), 403
    if not can_read_recordings(user):
        return jsonify({"error": "无权限"}), 403
    return jsonify(work.to_dict(include_recordings=True))


@api_bp.post("/works")
@login_required
def works_create():
    user = get_current_user()
    if not can_write_recordings(user) and not (
        user.system_super_admin or has_permission(user, "recordings.write")
    ):
        return jsonify({"error": "无权限", "required": "recordings.write"}), 403

    data = request.get_json(silent=True) or {}
    choir_id = user.choir_id if not user.system_super_admin else data.get("choir_id") or user.choir_id
    if not choir_id:
        return jsonify({"error": "缺少 choir_id"}), 400
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "缺少作品名称"}), 400

    work = Work(choir_id=choir_id, name=name[:100], composer=(data.get("composer") or "")[:50] or None)
    db.session.add(work)
    db.session.commit()
    write_operation_log(
        "works.create", user=user, resource_type="work", resource_id=str(work.work_id)
    )
    return jsonify(work.to_dict()), 201


@api_bp.post("/works/<int:work_id>/recordings/upload")
@login_required
def recordings_upload(work_id: int):
    user = get_current_user()
    if not can_write_recordings(user):
        return jsonify({"error": "无权限", "required": "recordings.write"}), 403

    work = Work.query.get_or_404(work_id)
    if not user.system_super_admin and work.choir_id != user.choir_id:
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
    if not user.system_super_admin and rec.choir_id != user.choir_id:
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

    if not token:
        user = get_current_user()
        if not user or (
            not user.system_super_admin and rec.choir_id != user.choir_id
        ) or not can_read_recordings(user):
            return jsonify({"error": "未授权"}), 401
    elif not rec.cde_file_id or not verify_stream_token(rec.choir_id, rec.cde_file_id, token):
        return jsonify({"error": "链接无效或已过期"}), 403

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
    if not user.system_super_admin and rec.choir_id != user.choir_id:
        return jsonify({"error": "无权限"}), 403
    if not can_read_recordings(user):
        return jsonify({"error": "无权限"}), 403
    if not rec.cde_file_id:
        return jsonify({"error": "无可播放文件"}), 404
    ttl = int(request.args.get("ttl", 3600))
    token = make_stream_token(rec.choir_id, rec.cde_file_id, ttl)
    return jsonify(
        {"url": f"/api/recordings/{rec.recording_id}/stream?token={token}", "expires_in": ttl}
    )
