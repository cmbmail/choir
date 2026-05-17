from datetime import datetime

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=True, index=True)
    role_id = db.Column(db.Integer, db.ForeignKey("choir_roles.role_id"), nullable=True, index=True)
    username = db.Column(db.String(32), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(64), nullable=False)
    email = db.Column(db.String(255))
    voice_part = db.Column(db.SmallInteger)
    status = db.Column(
        db.Enum("active", "inactive", "leave", name="user_status"),
        nullable=False,
        default="active",
    )
    system_super_admin = db.Column(db.Boolean, nullable=False, default=False)
    failed_login_count = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime)
    password_changed_at = db.Column(db.DateTime)
    token_version = db.Column(db.Integer, nullable=False, default=0)
    last_login = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    choir = db.relationship("Choir", back_populates="users")
    role = db.relationship("ChoirRole", back_populates="users")

    __table_args__ = (db.UniqueConstraint("choir_id", "username", name="uk_users_choir_username"),)

    @property
    def permissions(self):
        if self.system_super_admin:
            return ["*"]
        if self.role and self.role.permissions:
            return list(self.role.permissions)
        return []

    @property
    def role_code(self):
        if self.role:
            return self.role.role_code
        return None

    def to_member_dict(self, include_security=False, viewer=None):
        from app.services.member_privacy import can_view_full_phone, mask_phone

        username = self.username
        if viewer is not None and not can_view_full_phone(viewer):
            username = mask_phone(self.username)

        data = {
            "user_id": self.user_id,
            "choir_id": self.choir_id,
            "username": username,
            "name": self.name,
            "email": self.email,
            "voice_part": self.voice_part,
            "status": self.status,
            "role_id": self.role_id,
            "role_code": self.role_code,
            "role_name": self.role.name if self.role else None,
            "choir_name": self.choir.name if self.choir else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_security:
            data["failed_login_count"] = self.failed_login_count
            data["locked_until"] = self.locked_until.isoformat() if self.locked_until else None
        return data

    def to_me_dict(self):
        payload = self.to_member_dict()
        payload["permissions"] = self.permissions
        payload["system_super_admin"] = self.system_super_admin
        if self.choir:
            payload["choir"] = self.choir.to_dict()
        return payload
