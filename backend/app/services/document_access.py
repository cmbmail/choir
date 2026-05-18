"""Document / recording access by role and voice part."""

from typing import List, Optional

from app.models import Document, User, Work
from app.services.permissions import has_permission, is_section_leader
from app.services.work_access import work_shared_to_choir


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


def _work_deleted(doc: Document) -> bool:
    if not doc.work_id:
        return False
    work = Work.query.get(doc.work_id)
    return bool(work and work.deleted_at)


def document_visible_to_user(user: User, doc: Document) -> bool:
    if _work_deleted(doc):
        return False
    if user.system_super_admin:
        return True
    if not can_read_documents(user):
        return False
    same_choir = user.choir_id == doc.choir_id
    via_shared_work = bool(
        doc.work_id and user.choir_id and work_shared_to_choir(doc.work_id, user.choir_id)
    )
    if not same_choir and not via_shared_work:
        return False
    if is_section_leader(user) and user.voice_part is not None:
        parts: List[int] = doc.voice_parts or []
        if parts and user.voice_part not in parts:
            return False
    return True


def can_edit_document(user: User, doc: Document) -> bool:
    if user.system_super_admin:
        return True
    if not can_write_documents(user):
        return False
    return user.choir_id == doc.choir_id


def can_read_recordings(user: User) -> bool:
    if user.system_super_admin:
        return True
    return has_permission(user, "recordings.read") or has_permission(user, "recordings.write")


def can_write_recordings(user: User) -> bool:
    if user.system_super_admin:
        return True
    return has_permission(user, "recordings.write")
