from datetime import datetime

from app.extensions import db


class SystemConfig(db.Model):
    __tablename__ = "system_config"

    config_key = db.Column(db.String(64), primary_key=True)
    config_value = db.Column(db.String(255), nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
