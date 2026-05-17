"""Write audit rows to operation_logs for key actions."""

from __future__ import annotations

from typing import Any, Optional

from flask import request

from app.extensions import db
from app.models import OperationLog


def write_operation_log(
    action: str,
    *,
    user=None,
    choir_id=None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    detail: Optional[dict[str, Any]] = None,
) -> OperationLog:
    if choir_id is None and user is not None and not user.system_super_admin:
        choir_id = user.choir_id

    ip = None
    try:
        ip = request.remote_addr
    except RuntimeError:
        pass

    row = OperationLog(
        choir_id=choir_id,
        user_id=user.user_id if user else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        detail=detail or {},
        ip_address=ip,
    )
    db.session.add(row)
    return row
