from datetime import datetime

from app.extensions import db


class InvitationCode(db.Model):
    __tablename__ = "invitation_codes"

    invite_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False, index=True)
    code_hash = db.Column(db.String(64), unique=True, nullable=False)
    voice_part = db.Column(db.SmallInteger)
    max_uses = db.Column(db.Integer, nullable=False, default=1)
    use_count = db.Column(db.Integer, nullable=False, default=0)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.user_id"))
    revoked_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    choir = db.relationship("Choir")
    creator = db.relationship("User", foreign_keys=[created_by])

    def is_valid(self):
        if self.revoked_at:
            return False
        if self.use_count >= self.max_uses:
            return False
        return self.expires_at > datetime.utcnow()
