from datetime import datetime

from app.extensions import db


class Choir(db.Model):
    __tablename__ = "choirs"

    choir_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(50), unique=True, nullable=False, index=True)
    max_members = db.Column(db.Integer, nullable=False, default=100)
    status = db.Column(db.Enum("active", "suspended", name="choir_status"), nullable=False, default="active")
    cde_root_folder_id = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    roles = db.relationship("ChoirRole", back_populates="choir", lazy="dynamic")
    users = db.relationship("User", back_populates="choir", lazy="dynamic")

    def to_public_dict(self):
        return {"choir_id": self.choir_id, "slug": self.slug, "name": self.name}

    def to_dict(self):
        return {
            **self.to_public_dict(),
            "max_members": self.max_members,
            "status": self.status,
        }


class ChoirRole(db.Model):
    __tablename__ = "choir_roles"

    role_id = db.Column(db.Integer, primary_key=True)
    choir_id = db.Column(db.Integer, db.ForeignKey("choirs.choir_id"), nullable=False, index=True)
    role_code = db.Column(db.String(32), nullable=False)
    name = db.Column(db.String(64), nullable=False)
    permissions = db.Column(db.JSON, nullable=False, default=list)
    is_builtin = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    choir = db.relationship("Choir", back_populates="roles")
    users = db.relationship("User", back_populates="role", lazy="dynamic")

    __table_args__ = (db.UniqueConstraint("choir_id", "role_code", name="uk_choir_roles_code"),)

    def to_dict(self):
        return {
            "role_id": self.role_id,
            "choir_id": self.choir_id,
            "role_code": self.role_code,
            "name": self.name,
            "permissions": self.permissions or [],
            "is_builtin": self.is_builtin,
        }
