from datetime import datetime

from app.extensions import db


class CaptchaChallenge(db.Model):
    __tablename__ = "captcha_challenges"

    captcha_id = db.Column(db.String(36), primary_key=True)
    answer_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def is_expired(self):
        return datetime.utcnow() >= self.expires_at
