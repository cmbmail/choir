from flask import current_app, jsonify, request

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required, require_permission
from app.extensions import db
from app.models import Choir
from app.services.choir_bootstrap import next_choir_slug, seed_builtin_roles


@api_bp.get("/choirs/public")
def choirs_public():
    rows = Choir.query.filter_by(status="active").order_by(Choir.choir_id).all()
    return jsonify({"choirs": [c.to_public_dict() for c in rows]})


@api_bp.get("/choir")
@login_required
def choir_current():
    user = get_current_user()
    if user.system_super_admin:
        return jsonify({"error": "系统超管无当前团"}), 400
    return jsonify(user.choir.to_dict())


@api_bp.put("/choir")
@require_permission("choir.rename")
def choir_update_self():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "团名不能为空"}), 400
    choir = user.choir
    choir.name = name
    db.session.commit()
    return jsonify(choir.to_dict())


@api_bp.get("/choirs")
@login_required
def choirs_list():
    user = get_current_user()
    if not user.system_super_admin:
        return jsonify({"error": "无权限"}), 403
    rows = Choir.query.order_by(Choir.choir_id).all()
    return jsonify({"choirs": [c.to_dict() for c in rows]})


@api_bp.post("/choirs")
@login_required
def choirs_create():
    user = get_current_user()
    if not user.system_super_admin:
        return jsonify({"error": "仅系统超管可创建合唱团"}), 403
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "团名不能为空"}), 400
    max_members = int(data.get("max_members") or current_app.config["MAX_MEMBERS_PER_CHOIR"])

    slug = next_choir_slug()
    choir = Choir(name=name, slug=slug, max_members=max_members, status="active")
    db.session.add(choir)
    db.session.flush()
    seed_builtin_roles(choir)
    db.session.commit()
    return jsonify({"choir_id": choir.choir_id, "slug": choir.slug, "name": choir.name}), 201


@api_bp.put("/choirs/<int:choir_id>")
@login_required
def choirs_update(choir_id: int):
    user = get_current_user()
    choir = Choir.query.get_or_404(choir_id)
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "团名不能为空"}), 400

    from app.services.permissions import has_permission

    if user.system_super_admin:
        choir.name = name
        db.session.commit()
        return jsonify(choir.to_dict())

    if user.choir_id != choir_id or not has_permission(user, "choir.rename"):
        return jsonify({"error": "无权限"}), 403

    choir.name = name
    db.session.commit()
    return jsonify(choir.to_dict())
