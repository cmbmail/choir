# 弦歌合唱团管理系统

合唱团排练、献唱、作业、成员与资料管理平台。**多合唱团租户**、邀请码注册、自定义角色（v2.1.5）。

## 快速开始

### 1. 数据库

```bash
mysql -u root -p < scripts/schema.sql
# 或 Docker:
# docker run -d --name choir-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=choir_db -p 3306:3306 mysql:8.0
```

### 2. 后端

```bash
cp .env.example .env
# 编辑 DATABASE_URL、SECRET_KEY、INVITE_CODE_PEPPER 等

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 初始化数据（系统超管 + 2 团 + 6 角色 + 团内超管账号）
python ../scripts/seed.py

# 启动 API
python run.py
# 健康检查: http://127.0.0.1:5000/health
```

默认账号（见 `.env` / seed）：

| 账号 | 密码 | 说明 |
|------|------|------|
| `SYSTEM_SUPER_ADMIN_USERNAME`（默认 13800000000） | `.env` 中配置 | 系统超管，登录不选团 |
| `13900000001` | `ChoirAdmin1` | 弦歌合唱团团内超管 |
| `13900000002` | `ChoirAdmin1` | 晨曦合唱团团内超管 |

### 3. 前端（阶段一）

用本地 HTTP 打开（避免 file:// CORS）：

```bash
cd prototypes
python3 -m http.server 8080
# 登录: http://127.0.0.1:8080/login.html
```

在 `prototypes/login.html` 前可设置 `window.CHOIR_API_BASE`（默认 `http://127.0.0.1:5000/api`）。

## 文档

- [需求与开发计划 v2.1.5](docs/弦歌合唱团管理系统-需求与开发计划-v2.0.md)

## 仓库结构

```
Choir01/
├── backend/           # Flask API
├── prototypes/        # login/register + js
├── scripts/
│   ├── schema.sql
│   └── seed.py
├── docs/
└── 2026-05-16-task-13/古典系/   # UI 原型
```

## 技术栈

| 项 | 选型 |
|----|------|
| 后端 | Flask 2.3 + SQLAlchemy |
| 数据库 | MySQL 8.0（生产 ECS 同机） |
| 文件 | 阿里云 CDE（阶段二） |
| 前端 | 古典系 HTML + prototypes |

## 部署到服务器（暂用 IP）

**http://47.98.105.70** · **Alibaba Cloud Linux 3** — [deploy/SERVER-47.98.105.70.md](deploy/SERVER-47.98.105.70.md)

1. `bash deploy/install-acl3-deps.sh`（dnf 装 Python/Nginx/MySQL）  
2. 配置 MySQL + `.env.production-ip.example` → `.env`  
3. `bash deploy/install-ip.sh`

通用说明：[deploy/README.md](deploy/README.md)

## 安全

- 勿将 `.env`、AccessKey 提交 Git
- 生产务必更换 `SECRET_KEY`、`JWT_SECRET`、`INVITE_CODE_PEPPER`
