from flask import jsonify, request

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required, require_permission
from app.extensions import db
from app.models import ChoirRole, User
from app.services.permissions import has_permission


@api_bp.get("/choir/roles")
@login_required
def roles_list():
    user = get_current_user()
    if user.system_super_admin:
        choir_id = request.args.get("choir_id", type=int)
        if not choir_id:
            return jsonify({"error": "请指定 choir_id"}), 400
    else:
        if not has_permission(user, "roles.manage"):
            return jsonify({"error": "无权限", "required": "roles.manage"}), 403
        choir_id = user.choir_id

    rows = ChoirRole.query.filter_by(choir_id=choir_id).order_by(ChoirRole.role_id).all()
    return jsonify({"roles": [r.to_dict() for r in rows]})


@api_bp.post("/choir/roles")
@require_permission("roles.manage")
def roles_create():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    role_code = (data.get("role_code") or "").strip()
    name = (data.get("name") or "").strip()
    permissions = data.get("permissions") or []
    if not role_code or not name:
        return jsonify({"error": "role_code 与 name 必填"}), 400

    choir_id = user.choir_id
    if ChoirRole.query.filter_by(choir_id=choir_id, role_code=role_code).first():
        return jsonify({"error": "role_code 已存在"}), 409

    role = ChoirRole(
        choir_id=choir_id,
        role_code=role_code,
        name=name,
        permissions=permissions,
        is_builtin=False,
    )
    db.session.add(role)
    db.session.commit()
    return jsonify(role.to_dict()), 201


@api_bp.put("/choir/roles/<int:role_id>")
@require_permission("roles.manage")
def roles_update(role_id: int):
    user = get_current_user()
    role = ChoirRole.query.get_or_404(role_id)
    if role.choir_id != user.choir_id:
        return jsonify({"error": "无权限"}), 403

    data = request.get_json(silent=True) or {}
    if "name" in data:
        role.name = (data.get("name") or role.name).strip()
    if "permissions" in data:
        role.permissions = data.get("permissions") or []

    db.session.commit()
    return jsonify(role.to_dict())


@api_bp.delete("/choir/roles/<int:role_id>")
@require_permission("roles.manage")
def roles_delete(role_id: int):
    user = get_current_user()
    role = ChoirRole.query.get_or_404(role_id)
    if role.choir_id != user.choir_id:
        return jsonify({"error": "无权限"}), 403
    if role.is_builtin:
        return jsonify({"error": "内置角色不可删除"}), 400
    if User.query.filter_by(role_id=role.role_id).count():
        return jsonify({"error": "仍有成员使用该角色"}), 400
    db.session.delete(role)
    db.session.commit()
    return jsonify({"ok": True})
