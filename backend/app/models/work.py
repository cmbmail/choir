from typing import Any, Dict

from app.extensions import db


class Work(db.Model):
    __tablename__ = "works"

    work_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    composer = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    recordings = db.relationship(
        "Recording", back_populates="work", cascade="all, delete-orphan"
    )

    def to_dict(self, include_recordings: bool = False) -> Dict[str, Any]:
        row: Dict[str, Any] = {
            "work_id": self.work_id,
            "choir_id": self.choir_id,
            "name": self.name,
            "composer": self.composer or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_recordings:
            row["recordings"] = [r.to_dict() for r in self.recordings]
        return row
