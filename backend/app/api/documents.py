import json
import mimetypes

from flask import jsonify, redirect, request, send_file

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import Document, User, Work
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
    can_delete_document,
    can_edit_document,
    can_read_documents,
    can_write_documents,
    document_visible_to_user,
)
from app.services.operation_log import write_operation_log
from app.services.upload_validation import validate_upload
from app.services.work_access import can_read_work, can_write_work


def _choir_scope(user):
    if user.system_super_admin:
        choir_id = request.args.get("choir_id", type=int)
        return choir_id
    return user.choir_id


@api_bp.get("/documents")
@login_required
def documents_list():
    user = get_current_user()
    if not can_read_documents(user):
        return jsonify({"error": "无权限", "required": "documents.read"}), 403

    choir_id = _choir_scope(user)
    if not choir_id and not user.system_super_admin:
        return jsonify({"error": "缺少 choir_id"}), 400
    if not choir_id:
        return jsonify({"documents": []})

    work_id = request.args.get("work_id", type=int)
    if work_id:
        work = Work.query.get_or_404(work_id)
        if not can_read_work(user, work):
            return jsonify({"error": "无权限"}), 403
        q = Document.query.filter_by(work_id=work_id)
    else:
        q = Document.query.filter_by(choir_id=choir_id)

    doc_type = request.args.get("type") or request.args.get("doc_type")
    category = request.args.get("category")
    collection = request.args.get("collection")
    search = (request.args.get("q") or "").strip()

    if doc_type and doc_type != "all":
        q = q.filter_by(doc_type=doc_type)
    if category and category != "all":
        q = q.filter_by(category=category)
    if collection and collection != "all":
        q = q.filter_by(collection_name=collection)
    if search:
        q = q.filter(Document.title.contains(search))

    rows = q.order_by(Document.created_at.desc()).limit(200).all()
    visible = [d for d in rows if document_visible_to_user(user, d)]
    return jsonify(
        {
            "documents": [d.to_dict(include_stream=True) for d in visible],
            "total": len(visible),
        }
    )


@api_bp.get("/documents/<int:document_id>")
@login_required
def documents_get(document_id: int):
    user = get_current_user()
    doc = Document.query.get_or_404(document_id)
    if not document_visible_to_user(user, doc):
        return jsonify({"error": "无权限"}), 403
    return jsonify(doc.to_dict(include_stream=True))


@api_bp.post("/documents/upload")
@login_required
def documents_upload():
    user = get_current_user()
    if not can_write_documents(user):
        return jsonify({"error": "无权限", "required": "documents.write"}), 403

    f = request.files.get("file")
    if not f:
        return jsonify({"error": "缺少 file"}), 400

    title = (request.form.get("title") or f.filename or "未命名").strip()[:200]
    doc_type = (request.form.get("doc_type") or request.form.get("type") or "other").strip()
    category = (request.form.get("category") or "").strip() or None
    style = (request.form.get("style") or "").strip() or None
    collection_name = (request.form.get("collection") or request.form.get("collection_name") or "").strip() or None
    video_url = (request.form.get("video_url") or "").strip() or None

    voice_parts_raw = request.form.get("voice_parts")
    voice_parts = None
    if voice_parts_raw:
        try:
            voice_parts = json.loads(voice_parts_raw)
        except json.JSONDecodeError:
            return jsonify({"error": "voice_parts 须为 JSON 数组"}), 400

    if is_section_leader_upload_restricted(user, voice_parts):
        return jsonify({"error": "声部长只能上传本声部资料"}), 403

    work_id = request.form.get("work_id", type=int)
    work_bound_types = ("score", "accompaniment", "performance_video", "notes")
    if doc_type in work_bound_types and not work_id:
        return jsonify({"error": "上传作品资料须指定作品"}), 400
    if work_id:
        work = Work.query.get(work_id)
        if not work or not can_write_work(user, work):
            return jsonify({"error": "作品不存在或无上传权限"}), 400
    else:
        work = None
        if user.system_super_admin:
            choir_id = request.form.get("choir_id", type=int)
        else:
            choir_id = user.choir_id
        if not choir_id:
            return jsonify({"error": "缺少 choir_id"}), 400

    if work:
        choir_id = work.choir_id

    data = f.read()
    size = len(data)
    ok, msg = validate_upload(f.filename or "", size, f.mimetype)
    if not ok:
        return jsonify({"error": msg}), 400

    from io import BytesIO

    storage_category = "scores" if doc_type == "score" else (doc_type or "documents")
    try:
        cde_id, stored_size = upload_file(
            choir_id, storage_category, BytesIO(data), f.filename or "file", f.mimetype
        )
    except CdeError as e:
        return jsonify({"error": str(e)}), 503

    doc = Document(
        choir_id=choir_id,
        work_id=work_id,
        title=title,
        doc_type=doc_type,
        category=category,
        style=style,
        collection_name=collection_name,
        cde_file_id=cde_id,
        file_name=f.filename,
        mime_type=f.mimetype or mimetypes.guess_type(f.filename or "")[0],
        file_size=stored_size,
        voice_parts=voice_parts,
        video_url=video_url,
        uploaded_by=user.user_id,
    )
    db.session.add(doc)
    db.session.commit()

    write_operation_log(
        "documents.upload",
        user=user,
        resource_type="document",
        resource_id=str(doc.document_id),
        detail={"title": title, "doc_type": doc_type, "work_id": work_id},
    )
    return jsonify(doc.to_dict(include_stream=True)), 201


@api_bp.patch("/documents/<int:document_id>")
@login_required
def documents_patch(document_id: int):
    user = get_current_user()
    doc = Document.query.get_or_404(document_id)
    if not can_edit_document(user, doc):
        return jsonify({"error": "无权限"}), 403

    data = request.get_json(silent=True) or {}
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "标题不能为空"}), 400
        doc.title = title[:200]
    if "doc_type" in data:
        doc.doc_type = (data.get("doc_type") or doc.doc_type).strip()[:32]
    if "category" in data:
        doc.category = (data.get("category") or "").strip() or None
    if "style" in data:
        doc.style = (data.get("style") or "").strip() or None
    if "collection_name" in data:
        doc.collection_name = (data.get("collection") or data.get("collection_name") or "").strip() or None
    if "work_id" in data:
        raw = data.get("work_id")
        if raw is None or raw == "":
            doc.work_id = None
        else:
            try:
                wid = int(raw)
            except (TypeError, ValueError):
                return jsonify({"error": "work_id 无效"}), 400
            work = Work.query.get(wid)
            if not work or not can_write_work(user, work):
                return jsonify({"error": "目标作品不存在或无权限"}), 400
            doc.work_id = wid

    db.session.commit()
    write_operation_log(
        "documents.update",
        user=user,
        resource_type="document",
        resource_id=str(document_id),
        detail={"title": doc.title, "work_id": doc.work_id},
    )
    return jsonify(doc.to_dict(include_stream=True))


def is_section_leader_upload_restricted(user: User, voice_parts) -> bool:
    from app.services.permissions import is_section_leader

    if not is_section_leader(user):
        return False
    if not voice_parts:
        return True
    if user.voice_part is None:
        return True
    return user.voice_part not in voice_parts


@api_bp.delete("/documents/<int:document_id>")
@login_required
def documents_delete(document_id: int):
    user = get_current_user()
    doc = Document.query.get_or_404(document_id)
    if not can_delete_document(user, doc):
        return jsonify({"error": "无权限"}), 403

    if doc.cde_file_id:
        try:
            delete_file(doc.cde_file_id, doc.choir_id)
        except CdeError:
            pass

    title = doc.title
    db.session.delete(doc)
    db.session.commit()
    write_operation_log(
        "documents.delete",
        user=user,
        resource_type="document",
        resource_id=str(document_id),
        detail={"title": title},
    )
    return jsonify({"ok": True})


@api_bp.get("/documents/<int:document_id>/stream")
def documents_stream(document_id: int):
    """Inline stream; token query or Bearer auth."""
    token = request.args.get("token")
    doc = Document.query.get_or_404(document_id)

    if not token:
        user = get_current_user()
        if not user or not document_visible_to_user(user, doc):
            return jsonify({"error": "未授权"}), 401
    elif not doc.cde_file_id or not verify_stream_token(doc.choir_id, doc.cde_file_id, token):
        return jsonify({"error": "链接无效或已过期"}), 403

    if is_pds_mode():
        try:
            url = get_download_url(
                doc.cde_file_id or "",
                mime_type=doc.mime_type,
            )
            return redirect(url)
        except CdeError as e:
            return jsonify({"error": str(e)}), 404

    path = resolve_file_path(doc.choir_id, doc.cde_file_id or "")
    if not path:
        return jsonify({"error": "文件不存在"}), 404

    mime = doc.mime_type or mimetypes.guess_type(doc.file_name or "")[0] or "application/octet-stream"
    return send_file(
        path,
        mimetype=mime,
        as_attachment=False,
        download_name=doc.file_name or "file",
        conditional=True,
    )


@api_bp.get("/documents/<int:document_id>/play-url")
@login_required
def documents_play_url(document_id: int):
    user = get_current_user()
    doc = Document.query.get_or_404(document_id)
    if not document_visible_to_user(user, doc):
        return jsonify({"error": "无权限"}), 403
    if doc.video_url:
        return jsonify({"url": doc.video_url, "kind": "external"})
    if not doc.cde_file_id:
        return jsonify({"error": "无可播放文件"}), 404
    ttl = int(request.args.get("ttl", 3600))
    try:
        return jsonify(
            make_play_url(
                "documents",
                doc.document_id,
                doc.choir_id,
                doc.cde_file_id,
                ttl,
                doc.mime_type,
            )
        )
    except CdeError as e:
        return jsonify({"error": str(e)}), 503
