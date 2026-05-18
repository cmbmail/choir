from typing import Any, Dict, List, Optional

from app.extensions import db


class Work(db.Model):
    __tablename__ = "works"

    work_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    composer = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    deleted_at = db.Column(db.DateTime, nullable=True)
    deleted_by = db.Column(db.Integer, db.ForeignKey("users.user_id"), nullable=True)

    recordings = db.relationship(
        "Recording", back_populates="work", cascade="all, delete-orphan"
    )
    documents = db.relationship("Document", back_populates="work")
    shares = db.relationship(
        "WorkShare",
        back_populates="work",
        cascade="all, delete-orphan",
        foreign_keys="WorkShare.work_id",
    )
    owner_choir = db.relationship("Choir", foreign_keys=[choir_id])

    def to_dict(
        self,
        include_recordings: bool = False,
        viewer_choir_id: Optional[int] = None,
        shared_choir_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        row: Dict[str, Any] = {
            "work_id": self.work_id,
            "choir_id": self.choir_id,
            "owner_choir_name": self.owner_choir.name if self.owner_choir else "",
            "name": self.name,
            "composer": self.composer or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "is_owner": viewer_choir_id is not None and self.choir_id == viewer_choir_id,
        }
        if shared_choir_ids is not None:
            row["shared_choir_ids"] = shared_choir_ids
        if include_recordings:
            row["recordings"] = [r.to_dict() for r in self.recordings]
        return row
