from typing import Any, Dict

from app.extensions import db


class Recording(db.Model):
    __tablename__ = "recordings"

    recording_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False)
    work_id = db.Column(db.Integer, db.ForeignKey("works.work_id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    cde_file_id = db.Column(db.String(128))
    file_name = db.Column(db.String(255))
    mime_type = db.Column(db.String(128))
    file_size = db.Column(db.BigInteger)
    parts = db.Column(db.JSON)
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.user_id"))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    work = db.relationship("Work", back_populates="recordings")
    uploader = db.relationship("User", foreign_keys=[uploaded_by])

    def to_dict(self, include_stream: bool = False) -> Dict[str, Any]:
        row: Dict[str, Any] = {
            "recording_id": self.recording_id,
            "work_id": self.work_id,
            "choir_id": self.choir_id,
            "name": self.name,
            "file_name": self.file_name,
            "mime_type": self.mime_type,
            "file_size": self.file_size,
            "parts": self.parts or [],
            "uploaded_by": self.uploaded_by,
            "uploader": self.uploader.name if self.uploader else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_stream and self.recording_id:
            row["stream_url"] = f"/api/recordings/{self.recording_id}/stream"
        return row
