from flask import current_app, jsonify, request

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.models import OperationLog, User
from app.services.cde_service import is_mock_mode, storage_usage_bytes
from app.services.permissions import has_permission


@api_bp.get("/system/storage")
@login_required
def system_storage():
    user = get_current_user()
    if not user.system_super_admin and not has_permission(user, "system.monitor"):
        return jsonify({"error": "无权限", "required": "system.monitor"}), 403

    choir_id = request.args.get("choir_id", type=int)
    if not user.system_super_admin:
        choir_id = user.choir_id

    used = storage_usage_bytes(choir_id)
    quota = int(current_app.config.get("CDE_STORAGE_QUOTA_BYTES", 50 * 1024**3))
    return jsonify(
        {
            "choir_id": choir_id,
            "used_bytes": used,
            "quota_bytes": quota,
            "cde_mode": "mock" if is_mock_mode() else "cde",
            "usage_percent": round(used * 100.0 / quota, 2) if quota else 0,
        }
    )


@api_bp.get("/system/logs")
@login_required
def system_logs_list():
    user = get_current_user()
    choir_id = request.args.get("choir_id", type=int)
    limit = min(request.args.get("limit", 50, type=int), 200)
    offset = max(request.args.get("offset", 0, type=int), 0)
    action = (request.args.get("action") or "").strip()

    if user.system_super_admin:
        if choir_id is None and not request.args.get("all"):
            choir_id_filter = None
        else:
            choir_id_filter = choir_id
    else:
        if not has_permission(user, "system.monitor"):
            return jsonify({"error": "无权限", "required": "system.monitor"}), 403
        choir_id_filter = user.choir_id

    q = OperationLog.query
    if choir_id_filter is not None:
        q = q.filter_by(choir_id=choir_id_filter)
    if action:
        q = q.filter(OperationLog.action == action)

    total = q.count()
    rows = q.order_by(OperationLog.log_id.desc()).offset(offset).limit(limit).all()

    user_ids = {r.user_id for r in rows if r.user_id}
    names = {}
    if user_ids:
        for u in User.query.filter(User.user_id.in_(user_ids)).all():
            names[u.user_id] = u.name or u.username

    return jsonify(
        {
            "logs": [
                {
                    "log_id": r.log_id,
                    "choir_id": r.choir_id,
                    "user_id": r.user_id,
                    "user_name": names.get(r.user_id),
                    "action": r.action,
                    "resource_type": r.resource_type,
                    "resource_id": r.resource_id,
                    "detail": r.detail or {},
                    "ip_address": r.ip_address,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    )
