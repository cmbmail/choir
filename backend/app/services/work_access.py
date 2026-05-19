"""Work visibility, write access, and multi-choir sharing."""

from typing import List, Optional

from sqlalchemy import or_

from app.extensions import db
from app.models import User, Work, WorkShare
from app.services.permissions import has_permission


def work_shared_to_choir(work_id: int, choir_id: Optional[int]) -> bool:
    if not choir_id:
        return False
    return (
        WorkShare.query.filter_by(work_id=work_id, choir_id=choir_id).first() is not None
    )


def _is_choir_admin(user: User) -> bool:
    return user.role_code in ("super_admin", "conductor", "general_affairs")


def can_manage_trash(user: User, choir_id: int) -> bool:
    if user.system_super_admin:
        return True
    if user.choir_id != choir_id:
        return False
    return _is_choir_admin(user)


def can_delete_work(user: User, work: Work) -> bool:
    """Move work to recycle bin (owner choir administrators)."""
    return can_manage_trash(user, work.choir_id)


def can_read_work(user: User, work: Work) -> bool:
    if work.deleted_at is not None:
        return can_delete_work(user, work)
    if user.system_super_admin:
        return True
    if user.choir_id == work.choir_id:
        return True
    return work_shared_to_choir(work.work_id, user.choir_id)


def can_write_work(user: User, work: Work) -> bool:
    """Edit work metadata and upload materials (owner choir only)."""
    if user.system_super_admin:
        return True
    if work.choir_id != user.choir_id:
        return False
    return (
        has_permission(user, "works.write")
        or has_permission(user, "works.*")
        or has_permission(user, "documents.write")
        or has_permission(user, "documents.*")
        or has_permission(user, "recordings.write")
        or has_permission(user, "recordings.*")
    )


def can_manage_work_shares(user: User, work: Work) -> bool:
    if user.system_super_admin:
        return True
    if work.choir_id != user.choir_id:
        return False
    return user.role_code in ("super_admin", "conductor")


def works_for_choir_query(choir_id: Optional[int]):
    if not choir_id:
        return Work.query.filter(False)
    return (
        Work.query.outerjoin(WorkShare, WorkShare.work_id == Work.work_id)
        .filter(Work.deleted_at.is_(None))
        .filter(or_(Work.choir_id == choir_id, WorkShare.choir_id == choir_id))
        .distinct()
    )


def works_trash_for_choir_query(choir_id: Optional[int]):
    if not choir_id:
        return Work.query.filter(False)
    return Work.query.filter(
        Work.choir_id == choir_id, Work.deleted_at.isnot(None)
    )


def shared_choir_ids(work_id: int) -> List[int]:
    return [s.choir_id for s in WorkShare.query.filter_by(work_id=work_id).all()]
