"""用户可切换的合唱团上下文（一人多团 / 系统超管选团）。"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from flask import request

from app.models import Choir, User


def list_choir_contexts(user: User) -> List[Dict[str, Any]]:
    if user.system_super_admin:
        rows = Choir.query.filter_by(status="active").order_by(Choir.choir_id).all()
        return [{"choir_id": c.choir_id, "choir_name": c.name} for c in rows]

    rows = (
        User.query.filter(
            User.username == user.username,
            User.status == "active",
            User.system_super_admin.is_(False),
            User.choir_id.isnot(None),
        )
        .order_by(User.choir_id)
        .all()
    )
    seen: set[int] = set()
    out: List[Dict[str, Any]] = []
    for u in rows:
        if not u.choir_id or u.choir_id in seen:
            continue
        seen.add(u.choir_id)
        out.append(
            {
                "choir_id": u.choir_id,
                "choir_name": u.choir.name if u.choir else "",
            }
        )
    return out


def user_may_use_choir(user: User, choir_id: int) -> bool:
    if not choir_id:
        return False
    return any(c["choir_id"] == choir_id for c in list_choir_contexts(user))


def resolve_choir_scope(user: User) -> Optional[int]:
    """解析当前请求应使用的 choir_id。"""
    contexts = list_choir_contexts(user)
    if len(contexts) == 1:
        return int(contexts[0]["choir_id"])

    req = request.args.get("choir_id", type=int) or request.form.get("choir_id", type=int)
    if len(contexts) > 1:
        if req and user_may_use_choir(user, req):
            return req
        return None

    if user.system_super_admin:
        return req
    return user.choir_id
