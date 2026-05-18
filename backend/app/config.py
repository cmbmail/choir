import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://choir:password@127.0.0.1:3306/choir_db?charset=utf8mb4",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    AUTH_MODE = os.getenv("AUTH_MODE", "development")
    JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))
    JWT_ACCESS_DELTA = timedelta(hours=JWT_EXPIRE_HOURS)

    LOGIN_MAX_FAILURES = int(os.getenv("LOGIN_MAX_FAILURES", "5"))
    LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))
    LOGIN_CAPTCHA_AFTER_FAILURES = int(os.getenv("LOGIN_CAPTCHA_AFTER_FAILURES", "3"))
    PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))

    MAX_MEMBERS_PER_CHOIR = int(os.getenv("MAX_MEMBERS_PER_CHOIR", "100"))
    INVITE_CODE_LENGTH = int(os.getenv("INVITE_CODE_LENGTH", "8"))
    INVITE_CODE_DEFAULT_EXPIRE_DAYS = int(os.getenv("INVITE_CODE_DEFAULT_EXPIRE_DAYS", "7"))
    INVITE_CODE_PEPPER = os.getenv("INVITE_CODE_PEPPER", "change-invite-pepper")

    SYSTEM_SUPER_ADMIN_USERNAME = os.getenv("SYSTEM_SUPER_ADMIN_USERNAME", "13800000000")
    SYSTEM_SUPER_ADMIN_PASSWORD = os.getenv("SYSTEM_SUPER_ADMIN_PASSWORD", "change-me")

    CAPTCHA_EXPIRE_MINUTES = 5

    CDE_MODE = os.getenv("CDE_MODE", "mock")
    CDE_STORAGE_ROOT = os.getenv(
        "CDE_STORAGE_ROOT",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage"),
    )
    MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(4 * 1024 * 1024 * 1024)))
    UPLOAD_BLOCKLIST_EXT = os.getenv("UPLOAD_BLOCKLIST_EXT", "exe,bat,cmd,sh,msi,dmg")
    CDE_STORAGE_QUOTA_BYTES = int(os.getenv("CDE_STORAGE_QUOTA_BYTES", str(50 * 1024**3)))

    ALIYUN_ACCESS_KEY_ID = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
    ALIYUN_ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")
    # PDS 企业版：domain ID（企业代码），见控制台
    CDE_DOMAIN_ID = os.getenv("CDE_DOMAIN_ID") or os.getenv("CDE_ENTERPRISE_ID", "")
    CDE_ENTERPRISE_ID = CDE_DOMAIN_ID
    CDE_ENDPOINT = os.getenv("CDE_ENDPOINT", "")
    CDE_DRIVE_ID = os.getenv("CDE_DRIVE_ID", "")
    CDE_ROOT_FOLDER_ID = os.getenv("CDE_ROOT_FOLDER_ID", "root")
