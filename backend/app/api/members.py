from flask import jsonify, request
from sqlalchemy import or_

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required
from app.extensions import db
from app.models import ChoirRole, User
from app.services.operation_log import write_operation_log
from app.services.permissions import (
    can_access_member,
    can_write_member,
    has_permission,
)


def _full_members_write(user) -> bool:
    return user.system_super_admin or (
        has_permission(user, "members.write") and user.role_code != "section_leader"
    )


@api_bp.get("/members")
@login_required
def members_list():
    user = get_current_user()
    if not user.system_super_admin and not has_permission(user, "members.read"):
        return jsonify({"error": "无权限", "required": "members.read"}), 403

    q = User.query.filter(User.system_super_admin.is_(False))
    if user.system_super_admin:
        choir_id = request.args.get("choir_id", type=int)
        if choir_id:
            q = q.filter_by(choir_id=choir_id)
    else:
        q = q.filter_by(choir_id=user.choir_id)
        if user.role_code == "section_leader":
            if user.voice_part is None:
                return jsonify({"members": []})
            q = q.filter_by(voice_part=user.voice_part)

    role_id = request.args.get("role_id", type=int)
    voice_part = request.args.get("voice_part", type=int)
    status = request.args.get("status")
    search = (request.args.get("q") or "").strip()

    if role_id:
        q = q.filter_by(role_id=role_id)
    if voice_part:
        q = q.filter_by(voice_part=voice_part)
    if status:
        q = q.filter_by(status=status)
    if search:
        q = q.filter(or_(User.name.contains(search), User.username.contains(search)))

    rows = q.order_by(User.user_id).limit(200).all()
    return jsonify(
        {"members": [u.to_member_dict(include_security=True, viewer=user) for u in rows]}
    )


@api_bp.get("/members/<int:user_id>")
@login_required
def members_get(user_id: int):
    user = get_current_user()
    target = User.query.get_or_404(user_id)
    if not can_access_member(user, target):
        return jsonify({"error": "无权限"}), 403
    return jsonify(target.to_member_dict(include_security=True, viewer=user))


@api_bp.put("/members/<int:user_id>")
@login_required
def members_update(user_id: int):
    actor = get_current_user()
    target = User.query.get_or_404(user_id)
    if target.system_super_admin:
        return jsonify({"error": "不可修改系统超管"}), 400

    data = request.get_json(silent=True) or {}

    if "role_id" in data and data["role_id"] != target.role_id:
        new_role_id = data["role_id"]
        if actor.system_super_admin or (
            has_permission(actor, "members.assign_role") and actor.choir_id == target.choir_id
        ):
            role = ChoirRole.query.filter_by(role_id=new_role_id, choir_id=target.choir_id).first()
            if not role:
                return jsonify({"error": "无效角色"}), 400
            target.role_id = new_role_id
        else:
            return jsonify({"error": "无权限分配角色", "required": "members.assign_role"}), 403

    if not can_write_member(actor, target):
        if "role_id" not in data or data.get("role_id") == target.role_id:
            return jsonify({"error": "无权限"}), 403

    if "name" in data:
        name = (data.get("name") or "").strip()
        if name:
            target.name = name
    if "email" in data:
        target.email = data.get("email")
    if "voice_part" in data:
        target.voice_part = data.get("voice_part")
    if "status" in data:
        st = data.get("status")
        if st not in ("active", "inactive", "leave"):
            return jsonify({"error": "无效状态"}), 400
        if actor.role_code == "section_leader":
            if st in ("leave", "inactive"):
                target.status = st
        elif _full_members_write(actor):
            target.status = st

    write_operation_log(
        "member.update",
        user=actor,
        choir_id=target.choir_id,
        resource_type="user",
        resource_id=target.user_id,
        detail={"name": target.name, "status": target.status},
    )
    db.session.commit()
    return jsonify(target.to_member_dict(include_security=True, viewer=actor))


@api_bp.post("/members/<int:user_id>/unlock")
@login_required
def members_unlock(user_id: int):
    actor = get_current_user()
    target = User.query.get_or_404(user_id)
    if not actor.system_super_admin:
        if not _full_members_write(actor) or actor.choir_id != target.choir_id:
            return jsonify({"error": "无权限"}), 403

    target.failed_login_count = 0
    target.locked_until = None
    write_operation_log(
        "member.unlock",
        user=actor,
        choir_id=target.choir_id,
        resource_type="user",
        resource_id=target.user_id,
    )
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.delete("/members/<int:user_id>")
@login_required
def members_delete(user_id: int):
    actor = get_current_user()
    target = User.query.get_or_404(user_id)
    if actor.user_id == target.user_id:
        return jsonify({"error": "不可删除当前登录用户"}), 400
    if not actor.system_super_admin:
        if not _full_members_write(actor) or actor.choir_id != target.choir_id:
            return jsonify({"error": "无权限"}), 403
    write_operation_log(
        "member.delete",
        user=actor,
        choir_id=target.choir_id,
        resource_type="user",
        resource_id=target.user_id,
        detail={"name": target.name, "username": target.username},
    )
    db.session.delete(target)
    db.session.commit()
    return jsonify({"ok": True})
