#!/usr/bin/env python3
"""初始化系统超管 + 2 个合唱团 + 6 内置角色 + 各团首任团内超管（开发联调）。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app import create_app
from app.extensions import db
from app.models import Choir, SystemConfig, User
from app.services.choir_bootstrap import seed_builtin_roles
from app.services.password import hash_password


def main():
    app = create_app()
    with app.app_context():
        db.create_all()

        if not SystemConfig.query.get("choir_slug_seq"):
            db.session.add(SystemConfig(config_key="choir_slug_seq", config_value="0"))

        phone = app.config["SYSTEM_SUPER_ADMIN_USERNAME"]
        pwd = app.config["SYSTEM_SUPER_ADMIN_PASSWORD"]

        sa = User.query.filter_by(system_super_admin=True).first()
        if not sa:
            sa = User(
                username=phone,
                password_hash=hash_password(pwd),
                name="系统超管",
                system_super_admin=True,
                choir_id=None,
                role_id=None,
                status="active",
            )
            db.session.add(sa)
            print(f"Created system super admin: {phone}")

        choirs_data = [
            ("弦歌合唱团", None),
            ("晨曦合唱团", None),
        ]
        for name, _ in choirs_data:
            existing = Choir.query.filter_by(name=name).first()
            if existing:
                print(f"Choir exists: {name} ({existing.slug})")
                continue
            from app.services.choir_bootstrap import next_choir_slug

            slug = next_choir_slug()
            choir = Choir(name=name, slug=slug, max_members=100, status="active")
            db.session.add(choir)
            db.session.flush()
            roles = seed_builtin_roles(choir)

            admin_phone = f"139{choir.choir_id:08d}"[-11:]
            if not User.query.filter_by(choir_id=choir.choir_id, username=admin_phone).first():
                admin = User(
                    choir_id=choir.choir_id,
                    role_id=roles["super_admin"].role_id,
                    username=admin_phone,
                    password_hash=hash_password("ChoirAdmin1"),
                    name=f"{name}管理员",
                    status="active",
                )
                db.session.add(admin)
                print(f"  Choir admin: {admin_phone} / ChoirAdmin1")

        db.session.commit()
        print("Seed done.")


if __name__ == "__main__":
    main()
