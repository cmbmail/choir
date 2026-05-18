"""Work recycle bin: soft delete, restore, and purge after retention."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import Document, Recording, User, Work, WorkShare
from app.services.cde_service import CdeError, delete_file

TRASH_RETENTION_DAYS = 7


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def purge_available_at(deleted_at: datetime) -> datetime:
    if deleted_at.tzinfo is None:
        deleted_at = deleted_at.replace(tzinfo=timezone.utc)
    return deleted_at + timedelta(days=TRASH_RETENTION_DAYS)


def is_purge_eligible(work: Work, now: datetime | None = None) -> bool:
    if not work.deleted_at:
        return False
    now = now or _utcnow()
    return now >= purge_available_at(work.deleted_at)


def soft_delete_work(work: Work, user: User) -> None:
    if work.deleted_at:
        return
    work.deleted_at = _utcnow()
    work.deleted_by = user.user_id
    WorkShare.query.filter_by(work_id=work.work_id).delete()


def restore_work(work: Work) -> None:
    work.deleted_at = None
    work.deleted_by = None


def _delete_document_files(doc: Document) -> None:
    if doc.cde_file_id:
        try:
            delete_file(doc.cde_file_id, doc.choir_id)
        except CdeError:
            pass


def hard_delete_work(work: Work) -> None:
    for doc in Document.query.filter_by(work_id=work.work_id).all():
        _delete_document_files(doc)
        db.session.delete(doc)
    for rec in Recording.query.filter_by(work_id=work.work_id).all():
        if rec.cde_file_id:
            try:
                delete_file(rec.cde_file_id, rec.choir_id)
            except CdeError:
                pass
        db.session.delete(rec)
    WorkShare.query.filter_by(work_id=work.work_id).delete()
    db.session.delete(work)


def purge_expired_works(choir_id: int | None = None) -> int:
    """Permanently remove works deleted more than TRASH_RETENTION_DAYS ago."""
    now = _utcnow()
    cutoff = now - timedelta(days=TRASH_RETENTION_DAYS)
    q = Work.query.filter(Work.deleted_at.isnot(None), Work.deleted_at <= cutoff)
    if choir_id is not None:
        q = q.filter_by(choir_id=choir_id)
    removed = 0
    for work in q.all():
        hard_delete_work(work)
        removed += 1
    if removed:
        db.session.commit()
    return removed
