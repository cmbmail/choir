"""CDE file storage: mock (local disk) or future Aliyun CDE integration."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from pathlib import Path
from typing import BinaryIO, Optional, Tuple

from flask import current_app


class CdeError(Exception):
    pass


def _storage_root() -> Path:
    root = current_app.config.get("CDE_STORAGE_ROOT")
    return Path(root)


def _mode() -> str:
    return (current_app.config.get("CDE_MODE") or "mock").lower()


def is_mock_mode() -> bool:
    return _mode() == "mock"


def upload_file(
    choir_id: int,
    category: str,
    file_obj: BinaryIO,
    original_name: str,
    mime_type: Optional[str] = None,
) -> Tuple[str, int]:
    """Store file; return (cde_file_id, size_bytes)."""
    if _mode() == "mock":
        return _mock_upload(choir_id, category, file_obj, original_name)
    raise CdeError("CDE 未配置：请设置 CDE_MODE=mock 或配置阿里云 CDE 凭证")


def delete_file(cde_file_id: str, choir_id: int) -> None:
    if _mode() == "mock":
        path = _mock_path(choir_id, cde_file_id)
        if path.is_file():
            path.unlink()
        return
    raise CdeError("CDE 未配置")


def resolve_file_path(choir_id: int, cde_file_id: str) -> Optional[Path]:
    if _mode() != "mock":
        return None
    path = _mock_path(choir_id, cde_file_id)
    return path if path.is_file() else None


def make_stream_token(choir_id: int, cde_file_id: str, ttl_seconds: int = 3600) -> str:
    """HMAC token for temporary stream URLs (mock / future CDE)."""
    exp = int(time.time()) + ttl_seconds
    payload = f"{choir_id}:{cde_file_id}:{exp}"
    secret = current_app.config["SECRET_KEY"].encode()
    sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{exp}.{sig}"


def verify_stream_token(choir_id: int, cde_file_id: str, token: str) -> bool:
    if not token or "." not in token:
        return False
    exp_s, sig = token.split(".", 1)
    try:
        exp = int(exp_s)
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    payload = f"{choir_id}:{cde_file_id}:{exp}"
    secret = current_app.config["SECRET_KEY"].encode()
    expected = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(expected, sig)


def _mock_upload(
    choir_id: int,
    category: str,
    file_obj: BinaryIO,
    original_name: str,
) -> Tuple[str, int]:
    file_id = uuid.uuid4().hex
    safe_name = os.path.basename(original_name or "file")
    dest_dir = _storage_root() / str(choir_id) / category
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{file_id}__{safe_name}"
    data = file_obj.read()
    dest.write_bytes(data)
    return file_id, len(data)


def storage_usage_bytes(choir_id: Optional[int] = None) -> int:
    """Total bytes under storage root (optionally per choir)."""
    root = _storage_root()
    if not root.is_dir():
        return 0
    total = 0
    if choir_id is not None:
        targets = [root / str(choir_id)]
    else:
        targets = [root]
    for base in targets:
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.is_file():
                try:
                    total += path.stat().st_size
                except OSError:
                    pass
    return total


def _mock_path(choir_id: int, cde_file_id: str) -> Path:
    root = _storage_root() / str(choir_id)
    if not root.is_dir():
        return root / "missing"
    for sub in root.iterdir():
        if not sub.is_dir():
            continue
        for f in sub.glob(f"{cde_file_id}__*"):
            return f
    return root / "missing"
