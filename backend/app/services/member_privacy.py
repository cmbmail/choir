"""Member list phone visibility rules."""

from __future__ import annotations

from typing import Optional


def can_view_full_phone(user) -> bool:
    """系统超管或团内超管可见完整手机号。"""
    if not user:
        return False
    if user.system_super_admin:
        return True
    return user.role_code == "super_admin"


def mask_phone(username: Optional[str]) -> str:
    """非超管展示：仅保留后四位，前面用 **** 代替。"""
    s = (username or "").strip()
    if not s:
        return "—"
    if len(s) <= 4:
        return "****" + s
    return "****" + s[-4:]
