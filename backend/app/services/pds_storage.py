"""Alibaba Cloud PDS (Drive and Photo Service) enterprise storage."""

from __future__ import annotations

import logging
import os
import re
import urllib.error
import urllib.request
from typing import BinaryIO, Dict, Optional, Tuple

from flask import current_app

from app.extensions import db
from app.models import Choir

logger = logging.getLogger(__name__)

_folder_cache: Dict[Tuple[int, str], str] = {}


class PdsConfigError(Exception):
    pass


class PdsStorageError(Exception):
    pass


def is_pds_enabled() -> bool:
    mode = (current_app.config.get("CDE_MODE") or "mock").lower()
    return mode in ("pds", "cde")


def _require_config() -> None:
    if not current_app.config.get("ALIYUN_ACCESS_KEY_ID"):
        raise PdsConfigError("缺少 ALIYUN_ACCESS_KEY_ID")
    if not current_app.config.get("ALIYUN_ACCESS_KEY_SECRET"):
        raise PdsConfigError("缺少 ALIYUN_ACCESS_KEY_SECRET")
    if not current_app.config.get("CDE_DRIVE_ID"):
        raise PdsConfigError("缺少 CDE_DRIVE_ID")
    domain = current_app.config.get("CDE_DOMAIN_ID") or current_app.config.get(
        "CDE_ENTERPRISE_ID"
    )
    if not domain:
        raise PdsConfigError("缺少 CDE_DOMAIN_ID（企业代码 / domain ID）")


def _domain_id() -> str:
    return (
        current_app.config.get("CDE_DOMAIN_ID")
        or current_app.config.get("CDE_ENTERPRISE_ID")
        or ""
    ).strip()


def _endpoint_host() -> str:
    """Hostname for PDS SDK (no scheme).

    gateway_pds sets Config.endpoint as the HTTP Host header. A value like
    https://xxx.api.aliyunpds.com makes nginx return 400 Bad Request.
    """
    explicit = (current_app.config.get("CDE_ENDPOINT") or "").strip()
    if explicit:
        host = explicit.rstrip("/")
        if host.startswith("https://"):
            host = host[8:]
        elif host.startswith("http://"):
            host = host[7:]
        return host.rstrip("/")
    domain = _domain_id()
    if not domain:
        raise PdsConfigError("缺少 CDE_ENDPOINT 或 CDE_DOMAIN_ID")
    return f"{domain}.api.aliyunpds.com"


def _drive_id() -> str:
    return str(current_app.config.get("CDE_DRIVE_ID") or "").strip()


def _client():
    from alibabacloud_pds20220301.client import Client
    from alibabacloud_tea_openapi import models as open_api_models

    _require_config()
    config = open_api_models.Config(
        access_key_id=current_app.config["ALIYUN_ACCESS_KEY_ID"],
        access_key_secret=current_app.config["ALIYUN_ACCESS_KEY_SECRET"],
        endpoint=_endpoint_host(),
    )
    return Client(config)


def _safe_name(name: str) -> str:
    base = os.path.basename(name or "file").strip() or "file"
    return re.sub(r"[/\\]+", "_", base)[:200]


def _response_body(resp):
    body = getattr(resp, "body", None)
    if body is None:
        raise PdsStorageError("PDS 响应为空")
    return body


def ensure_folder(parent_file_id: str, name: str) -> str:
    """Create folder if missing; return folder file_id."""
    from alibabacloud_pds20220301 import models

    drive_id = _drive_id()
    client = _client()
    req = models.CreateFileRequest(
        drive_id=drive_id,
        parent_file_id=parent_file_id,
        name=name,
        type="folder",
        check_name_mode="refuse",
    )
    try:
        resp = client.create_file(req)
    except Exception as e:
        raise PdsStorageError(f"创建目录失败: {e}") from e
    body = _response_body(resp)
    if body.file_id:
        return body.file_id
    raise PdsStorageError(f"无法创建目录 {name}")


def ensure_choir_root_folder(choir: Choir) -> str:
    """Ensure choir folder under CDE_ROOT_FOLDER_ID; persist cde_root_folder_id."""
    if choir.cde_root_folder_id:
        return choir.cde_root_folder_id
    parent = (current_app.config.get("CDE_ROOT_FOLDER_ID") or "root").strip()
    folder_id = ensure_folder(parent, choir.slug)
    choir.cde_root_folder_id = folder_id
    db.session.commit()
    return folder_id


def _category_parent(choir_id: int, category: str) -> str:
    cache_key = (choir_id, category)
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]
    choir = Choir.query.get(choir_id)
    if not choir:
        raise PdsStorageError("合唱团不存在")
    choir_root = ensure_choir_root_folder(choir)
    cat = (category or "documents").strip().lower()
    folder_id = ensure_folder(choir_root, cat)
    _folder_cache[cache_key] = folder_id
    return folder_id


def upload_file(
    choir_id: int,
    category: str,
    file_obj: BinaryIO,
    original_name: str,
    content_type: Optional[str] = None,
) -> Tuple[str, int]:
    from alibabacloud_pds20220301 import models

    data = file_obj.read()
    size = len(data)
    if size <= 0:
        raise PdsStorageError("空文件无法上传")

    drive_id = _drive_id()
    parent_file_id = _category_parent(choir_id, category)
    file_name = _safe_name(original_name)
    client = _client()

    part = models.CreateFileRequestPartInfoList(part_number=1)
    create_req = models.CreateFileRequest(
        drive_id=drive_id,
        parent_file_id=parent_file_id,
        name=file_name,
        type="file",
        size=size,
        content_type=content_type or "application/octet-stream",
        check_name_mode="auto_rename",
        part_info_list=[part],
    )
    try:
        create_resp = client.create_file(create_req)
    except Exception as e:
        raise PdsStorageError(f"PDS 创建上传任务失败: {e}") from e

    body = _response_body(create_resp)
    if getattr(body, "rapid_upload", False) and body.file_id:
        return body.file_id, size

    parts = body.part_info_list or []
    if not parts or not parts[0].upload_url:
        raise PdsStorageError("PDS 未返回上传地址")

    upload_url = parts[0].upload_url
    upload_id = body.upload_id
    file_id = body.file_id
    if not upload_id or not file_id:
        raise PdsStorageError("PDS 上传任务信息不完整")

    req = urllib.request.Request(upload_url, data=data, method="PUT")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            if resp.status and resp.status >= 400:
                raise PdsStorageError(f"上传分片失败 HTTP {resp.status}")
    except urllib.error.URLError as e:
        raise PdsStorageError(f"上传分片失败: {e}") from e

    complete_req = models.CompleteFileRequest(
        drive_id=drive_id,
        file_id=file_id,
        upload_id=upload_id,
    )
    try:
        client.complete_file(complete_req)
    except Exception as e:
        raise PdsStorageError(f"PDS 完成上传失败: {e}") from e

    return file_id, size


def delete_file(file_id: str) -> None:
    from alibabacloud_pds20220301 import models

    if not file_id:
        return
    client = _client()
    req = models.DeleteFileRequest(drive_id=_drive_id(), file_id=file_id)
    try:
        client.delete_file(req)
    except Exception as e:
        raise PdsStorageError(f"PDS 删除失败: {e}") from e


def get_download_url(
    file_id: str,
    ttl_seconds: int = 3600,
    content_type: Optional[str] = None,
) -> str:
    from alibabacloud_pds20220301 import models

    expire = min(max(int(ttl_seconds), 60), 115200)
    client = _client()
    req = models.GetDownloadUrlRequest(
        drive_id=_drive_id(),
        file_id=file_id,
        expire_sec=expire,
    )
    if content_type:
        req.response_content_type = content_type
    try:
        resp = client.get_download_url(req)
    except Exception as e:
        raise PdsStorageError(f"获取下载链接失败: {e}") from e
    body = _response_body(resp)
    url = body.url or body.internal_url or body.cdn_url
    if not url:
        raise PdsStorageError("PDS 未返回下载 URL")
    return url


def drive_usage_bytes() -> Tuple[int, int]:
    """Return (used_bytes, total_bytes) for configured drive."""
    from alibabacloud_pds20220301 import models

    client = _client()
    req = models.GetDriveRequest(drive_id=_drive_id())
    try:
        resp = client.get_drive(req)
    except Exception as e:
        logger.warning("PDS get_drive failed: %s", e)
        return 0, 0
    body = _response_body(resp)
    used = int(getattr(body, "used_size", None) or 0)
    total = int(getattr(body, "total_size", None) or 0)
    return used, total
