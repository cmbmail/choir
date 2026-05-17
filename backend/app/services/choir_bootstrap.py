from __future__ import annotations

from app.extensions import db
from app.models import Choir, ChoirRole, SystemConfig
from app.services.permissions import BUILTIN_ROLE_TEMPLATES


def next_choir_slug() -> str:
    row = SystemConfig.query.filter_by(config_key="choir_slug_seq").with_for_update().first()
    if not row:
        row = SystemConfig(config_key="choir_slug_seq", config_value="0")
        db.session.add(row)
    seq = int(row.config_value) + 1
    row.config_value = str(seq)
    return f"choir_{seq:03d}"


def seed_builtin_roles(choir: Choir) -> dict[str, ChoirRole]:
    roles = {}
    for code, name, perms in BUILTIN_ROLE_TEMPLATES:
        role = ChoirRole(
            choir_id=choir.choir_id,
            role_code=code,
            name=name,
            permissions=perms,
            is_builtin=True,
        )
        db.session.add(role)
        roles[code] = role
    db.session.flush()
    return roles


def get_member_role(choir_id: int) -> ChoirRole | None:
    return ChoirRole.query.filter_by(choir_id=choir_id, role_code="member").first()
