"""Document / recording access by role and voice part."""

from typing import List, Optional

from app.models import Document, User
from app.services.permissions import has_permission, is_section_leader


def can_read_documents(user: User) -> bool:
    if user.system_super_admin:
        return True
    return has_permission(user, "documents.read") or has_permission(user, "documents.write")


def can_write_documents(user: User) -> bool:
    if user.system_super_admin:
        return True
    return has_permission(user, "documents.write")


def can_delete_document(user: User, doc: Document) -> bool:
    if user.system_super_admin:
        return True
    if not can_write_documents(user):
        return False
    if user.role_code in ("super_admin", "class_leader", "general_affairs", "conductor"):
        return user.choir_id == doc.choir_id
    if is_section_leader(user):
        if user.choir_id != doc.choir_id:
            return False
        parts: List[int] = doc.voice_parts or []
        if not parts:
            return True
        return user.voice_part is not None and user.voice_part in parts
    return doc.uploaded_by == user.user_id


def document_visible_to_user(user: User, doc: Document) -> bool:
    if user.system_super_admin:
        return True
    if user.choir_id != doc.choir_id:
        return False
    if not can_read_documents(user):
        return False
    if is_section_leader(user) and user.voice_part is not None:
        parts: List[int] = doc.voice_parts or []
        if parts and user.voice_part not in parts:
            return False
    return True


def can_read_recordings(user: User) -> bool:
    if user.system_super_admin:
        return True
    return has_permission(user, "recordings.read") or has_permission(user, "recordings.write")


def can_write_recordings(user: User) -> bool:
    if user.system_super_admin:
        return True
    return has_permission(user, "recordings.write")
