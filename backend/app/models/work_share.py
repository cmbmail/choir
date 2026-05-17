from app.extensions import db


class WorkShare(db.Model):
    __tablename__ = "work_shares"

    work_id = db.Column(db.Integer, db.ForeignKey("works.work_id"), primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), primary_key=True)
    shared_by = db.Column(db.Integer, db.ForeignKey("users.user_id"))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    work = db.relationship("Work", back_populates="shares", foreign_keys=[work_id])
    choir = db.relationship("Choir", foreign_keys=[choir_id])
