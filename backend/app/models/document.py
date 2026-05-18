from typing import Any, Dict, List, Optional

from app.extensions import db


class Document(db.Model):
    __tablename__ = "documents"

    document_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False)
    work_id = db.Column(db.Integer, db.ForeignKey("works.work_id"), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)
    doc_type = db.Column(db.String(32), nullable=False, default="other")
    category = db.Column(db.String(64))
    style = db.Column(db.String(64))
    collection_name = db.Column(db.String(64))
    description = db.Column(db.Text)
    musical_key = db.Column(db.String(32))
    cde_file_id = db.Column(db.String(128))
    file_name = db.Column(db.String(255))
    mime_type = db.Column(db.String(128))
    file_size = db.Column(db.BigInteger)
    voice_parts = db.Column(db.JSON)
    video_url = db.Column(db.String(500))
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.user_id"))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    uploader = db.relationship("User", foreign_keys=[uploaded_by])
    work = db.relationship("Work", foreign_keys=[work_id], back_populates="documents")

    def to_dict(self, include_stream: bool = False) -> Dict[str, Any]:
        uploader_name = self.uploader.name if self.uploader else None
        ext = ""
        if self.file_name and "." in self.file_name:
            ext = self.file_name.rsplit(".", 1)[-1].lower()
        row: Dict[str, Any] = {
            "document_id": self.document_id,
            "choir_id": self.choir_id,
            "work_id": self.work_id,
            "work_name": self.work.name if self.work else "",
            "work_composer": self.work.composer if self.work else "",
            "title": self.title,
            "doc_type": self.doc_type,
            "type": self.doc_type,
            "category": self.category or "",
            "style": self.style or "",
            "collection": self.collection_name or "",
            "collection_name": self.collection_name or "",
            "description": self.description or "",
            "musical_key": self.musical_key or "",
            "file_name": self.file_name,
            "mime_type": self.mime_type,
            "file_size": self.file_size,
            "voice_parts": self.voice_parts or [],
            "video_url": self.video_url or "",
            "uploaded_by": self.uploaded_by,
            "uploader": uploader_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "ext": ext,
        }
        if include_stream and self.document_id:
            row["stream_url"] = f"/api/documents/{self.document_id}/stream"
        return row
