from datetime import datetime

from app.extensions import db


class OperationLog(db.Model):
    __tablename__ = "operation_logs"

    log_id = db.Column(db.BigInteger, primary_key=True)
    choir_id = db.Column(db.Integer, index=True)
    user_id = db.Column(db.Integer, index=True)
    action = db.Column(db.String(64), nullable=False)
    resource_type = db.Column(db.String(32))
    resource_id = db.Column(db.String(64))
    detail = db.Column(db.JSON)
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
