# 网盘与相册服务 PDS（企业空间）配置指南

合唱团系统通过 **后端代理** 访问 PDS，浏览器不持有 AK/SK。`CDE_MODE=pds` 时启用真机存储。

---

## 1. 阿里云控制台准备

### 1.1 开通 PDS 企业版

1. 登录 [网盘与相册服务控制台](https://pds.console.aliyun.com/)。
2. 开通 **企业版**，记下 **企业代码（Domain ID）**。
   - 路径示例：管理控制台 → 企业设置 → 企业域名 / 企业代码
3. 创建或选定 **团队空间（Drive）**，记下 **DriveId**。

### 1.2 创建 RAM 子账号

1. [RAM 控制台](https://ram.console.aliyun.com/manage/ak) → 创建用户（如 `choir-pds-api`）。
2. 仅创建 **AccessKey**，无需控制台登录密码。
3. 授权策略（按需缩小权限）：
   - 开发阶段可用：`AliyunPDSFullAccess`
   - 生产建议自定义：文件创建/完成上传/删除/获取下载 URL、查询 Drive

### 1.3 目录规划

在 Drive 根目录或指定目录下创建文件夹 `choirs`（可选），记下其 **file_id** 作为 `CDE_ROOT_FOLDER_ID`。

系统会为每个合唱团自动创建：

```text
{CDE_ROOT_FOLDER_ID}/
  └── {choir_slug}/          → 写入 choirs.cde_root_folder_id
        ├── scores/          # 乐谱
        ├── recordings/      # 录音（与录音 API 一致）
        ├── perf/            # 其他资料类型按 doc_type 分子目录
        └── ...
```

---

## 2. 环境变量（`/opt/choir/.env`）

```bash
# 存储模式：mock | pds
CDE_MODE=pds

# PDS 企业代码（Domain ID），与 CDE_ENTERPRISE_ID 二选一
CDE_DOMAIN_ID=你的企业代码
# CDE_ENTERPRISE_ID=你的企业代码

# 团队空间 ID（控制台 Drive 列表）
CDE_DRIVE_ID=你的DriveId

# 合唱团根目录的父 folder_id（盘内 choirs 文件夹的 file_id；若在根目录建团则用 root）
CDE_ROOT_FOLDER_ID=root

# API 接入地址（可选；仅主机名，不要 https://）
# CDE_ENDPOINT=xxxxx.api.aliyunpds.com

# RAM AccessKey
ALIYUN_ACCESS_KEY_ID=LTAI...
ALIYUN_ACCESS_KEY_SECRET=...

# 单文件上限、配额展示
MAX_UPLOAD_BYTES=4294967296
CDE_STORAGE_QUOTA_BYTES=53687091200

# mock 模式才需要本地目录；pds 可保留
CDE_STORAGE_ROOT=/opt/choir/storage
```

修改后：

```bash
chmod 600 /opt/choir/.env
chown choir:choir /opt/choir/.env
cd /opt/choir/backend && source .venv/bin/activate && pip install -r requirements.txt
systemctl restart choir-api
```

---

## 3. 验证

```bash
# 健康检查
curl -s http://127.0.0.1:5000/health

# 登录后查看存储模式（应 cde_mode: pds）
curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:5000/api/system/storage
```

浏览器：

1. 登录 → **作品管理** → 新建作品 → 进入详情 → **上传资料**
2. 打开乐谱 → 应通过 PDS 临时 URL 预览（`play-url` 返回 `kind: external`）

---

## 4. 与 mock 模式对比

| 项 | mock | pds |
|----|------|-----|
| `CDE_MODE` | `mock` | `pds` |
| 文件位置 | ECS 本地 `CDE_STORAGE_ROOT` | 阿里云 PDS |
| 播放链接 | `/api/.../stream?token=` | PDS `GetDownloadUrl`（默认 1h） |
| 用量统计 | 本地目录求和 | Drive `used_size` |

---

## 5. 故障排查

| 现象 | 处理 |
|------|------|
| SDK 报 `400 Bad Request`（nginx HTML） | `CDE_ENDPOINT` 勿带 `https://`；SDK 用主机名作 Host 头 |
| `缺少 CDE_DOMAIN_ID` | 填写企业代码 |
| `PDS 创建上传任务失败` | 检查 AK 权限、DriveId、Endpoint 地域 |
| `上传分片失败` | ECS 出网带宽 / 安全组；上传 URL 需公网可达 |
| 播放 403 | 下载链接过期，重新打开页面获取新 `play-url` |
| 建团目录失败 | 查看 `journalctl -u choir-api`；确认 `CDE_ROOT_FOLDER_ID` 有效 |

---

## 6. 相关代码

- `backend/app/services/pds_storage.py` — PDS 上传/删除/下载 URL
- `backend/app/services/cde_service.py` — 统一 mock / pds 入口
- `backend/app/config.py` — 环境变量加载
