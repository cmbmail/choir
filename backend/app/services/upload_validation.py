import os
from typing import Optional, Tuple

from flask import current_app


def validate_upload(
    filename: str, size: int, mime_type: Optional[str] = None
) -> Tuple[bool, str]:
    max_bytes = int(current_app.config.get("MAX_UPLOAD_BYTES", 4 * 1024 * 1024 * 1024))
    if size <= 0:
        return False, "空文件"
    if size > max_bytes:
        return False, f"文件超过大小限制（{max_bytes} 字节）"

    ext = ""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
    blocklist = {
        x.strip().lower()
        for x in (current_app.config.get("UPLOAD_BLOCKLIST_EXT") or "").split(",")
        if x.strip()
    }
    if ext and ext in blocklist:
        return False, f"不允许上传 .{ext} 类型文件"
    return True, ""
