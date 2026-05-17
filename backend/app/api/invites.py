from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from app.api import api_bp
from app.auth.decorators import get_current_user, login_required, require_permission
from app.extensions import db
from app.models import Choir, InvitationCode
from app.services.invite_code import generate_plain_code, hash_code
from app.services.permissions import has_permission


def _invite_status(invite: InvitationCode) -> str:
    if invite.revoked_at:
        return "revoked"
    if invite.use_count >= invite.max_uses:
        return "exhausted"
    if invite.expires_at <= datetime.utcnow():
        return "expired"
    return "active"


def _invite_dict(invite: InvitationCode) -> dict:
    choir = invite.choir
    return {
        "invite_id": invite.invite_id,
        "choir_id": invite.choir_id,
        "choir_name": choir.name if choir else None,
        "choir_slug": choir.slug if choir else None,
        "voice_part": invite.voice_part,
        "max_uses": invite.max_uses,
        "use_count": invite.use_count,
        "expires_at": invite.expires_at.isoformat(),
        "revoked_at": invite.revoked_at.isoformat() if invite.revoked_at else None,
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
        "status": _invite_status(invite),
        "can_revoke": _invite_status(invite) == "active",
    }


@api_bp.post("/invites")
@require_permission("invites.create")
def invites_create():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    expires_days = int(data.get("expires_in_days") or current_app.config["INVITE_CODE_DEFAULT_EXPIRE_DAYS"])
    max_uses = int(data.get("max_uses") or 1)
    voice_part = data.get("voice_part")

    if user.system_super_admin:
        choir_id = data.get("choir_id")
        if not choir_id:
            return jsonify({"error": "系统超管发码须指定 choir_id"}), 400
    else:
        choir_id = user.choir_id

    choir = Choir.query.filter_by(choir_id=choir_id, status="active").first()
    if not choir:
        return jsonify({"error": "合唱团不存在或已停用"}), 400

    plain = generate_plain_code()
    invite = InvitationCode(
        choir_id=choir.choir_id,
        code_hash=hash_code(plain),
        voice_part=voice_part,
        max_uses=max(1, min(max_uses, 5)),
        expires_at=datetime.utcnow() + timedelta(days=max(1, min(expires_days, 30))),
        created_by=None if user.system_super_admin else user.user_id,
    )
    db.session.add(invite)
    db.session.commit()

    base = request.host_url.rstrip("/")
    register_url = f"{base}/register.html?choir={choir.slug}&code={plain}"
    return jsonify(
        {
            "invite_id": invite.invite_id,
            "choir_id": choir.choir_id,
            "choir_name": choir.name,
            "invite_code": plain,
            "expires_at": invite.expires_at.isoformat(),
            "register_url": register_url,
        }
    ), 201


@api_bp.get("/invites")
@require_permission("invites.create")
def invites_list():
    user = get_current_user()
    q = InvitationCode.query
    if user.system_super_admin:
        choir_id = request.args.get("choir_id", type=int)
        if choir_id:
            q = q.filter_by(choir_id=choir_id)
    else:
        q = q.filter_by(choir_id=user.choir_id)
    rows = q.order_by(InvitationCode.created_at.desc()).limit(100).all()
    return jsonify({"invites": [_invite_dict(i) for i in rows]})


@api_bp.delete("/invites/<int:invite_id>")
@login_required
def invites_revoke(invite_id: int):
    user = get_current_user()
    if not has_permission(user, "invites.revoke"):
        return jsonify({"error": "无权限", "required": "invites.revoke"}), 403

    invite = InvitationCode.query.get_or_404(invite_id)
    if not user.system_super_admin and invite.choir_id != user.choir_id:
        return jsonify({"error": "无权限"}), 403
    if user.role_code == "class_leader" and invite.created_by != user.user_id:
        return jsonify({"error": "仅可作废自己签发的邀请码"}), 403

    invite.revoked_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"ok": True})
