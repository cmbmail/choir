# 生产部署指南（ECS + 同机 MySQL）

**服务器：`47.98.105.70`，系统：Alibaba Cloud Linux 3** — 见 [SERVER-47.98.105.70.md](SERVER-47.98.105.70.md)  
首次：`install-acl3-deps.sh` → 配置 MySQL / `.env` → `install-ip.sh`

> 阶段一（认证 / 成员 / 邀请码）**可以**上服务器跑；CDE、排练等业务仍为后续阶段。

## 前置条件

| 项 | 要求 |
|----|------|
| 服务器 | 阿里云 ECS 2C2G，**cn-hangzhou**，Alibaba Cloud Linux 3 或 Ubuntu 22.04 |
| 域名 | 建议有；**HTTPS 必开**（生产 Cookie 需要） |
| 安全组 | 入站 **22**（SSH）、**80/443**（Web）；**不要**对公网开放 3306 |
| 密钥 | 在服务器上单独配置 `.env`，勿把 AccessKey 写进 Git |

## 1. 安装依赖（以 Alibaba Cloud Linux 为例）

```bash
sudo dnf install -y python3.11 python3.11-pip nginx mysql-server git

sudo systemctl enable --now mysqld
sudo mysql_secure_installation
```

创建数据库与用户：

```bash
sudo mysql -e "
CREATE DATABASE IF NOT EXISTS choir_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'choir'@'127.0.0.1' IDENTIFIED BY '你的强密码';
GRANT ALL ON choir_db.* TO 'choir'@'127.0.0.1';
FLUSH PRIVILEGES;
"
```

导入表结构：

```bash
mysql -u choir -p choir_db < /opt/choir/scripts/schema.sql
```

## 2. 拉代码与 Python 环境

```bash
sudo mkdir -p /opt/choir
sudo chown "$USER:$USER" /opt/choir
cd /opt/choir
git clone git@github.com:cmbmail/choir.git .   # 或你的仓库地址

cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 3. 配置 `.env`（项目根目录 `/opt/choir/.env`）

```bash
cp .env.example .env
chmod 600 .env
```

**生产务必修改：**

```env
FLASK_ENV=production
AUTH_MODE=production
SECRET_KEY=随机长字符串
JWT_SECRET=随机长字符串
INVITE_CODE_PEPPER=随机长字符串

DATABASE_URL=mysql+pymysql://choir:你的强密码@127.0.0.1:3306/choir_db?charset=utf8mb4

SYSTEM_SUPER_ADMIN_USERNAME=你的手机号
SYSTEM_SUPER_ADMIN_PASSWORD=强密码
```

初始化数据（仅首次）：

```bash
cd /opt/choir
source backend/.venv/bin/activate
python scripts/seed.py
```

## 4. Gunicorn（systemd）

```bash
sudo cp deploy/choir-api.service /etc/systemd/system/
# 编辑其中 User、WorkingDirectory、EnvironmentFile 路径
sudo systemctl daemon-reload
sudo systemctl enable --now choir-api
sudo systemctl status choir-api
```

本地验证 API：

```bash
curl -s http://127.0.0.1:5000/health
```

## 5. Nginx + HTTPS

```bash
sudo cp deploy/nginx-choir.conf /etc/nginx/conf.d/choir.conf
# 把 server_name 改成你的域名；root 指向 /opt/choir/prototypes 与静态原型目录
sudo nginx -t && sudo systemctl reload nginx
```

申请证书（示例 Certbot）：

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

**静态资源说明：**

- `prototypes/login.html`、`register.html` 由 Nginx 直接提供
- `2026-05-16-task-13/古典系/` 管理页原型同域访问，需在 `prototypes/js/api.js` 前设置 API 基址，或改 Nginx 反代后使用相对路径 `/api`

在 `prototypes/login.html` 的 `<head>` 中可增加：

```html
<script>window.CHOIR_API_BASE = "/api";</script>
```

## 6. 数据库备份（cron）

```bash
sudo cp deploy/backup-mysql.sh /usr/local/bin/choir-backup-mysql
sudo chmod +x /usr/local/bin/choir-backup-mysql
# crontab -e:
# 0 3 * * * /usr/local/bin/choir-backup-mysql
```

## 7. 部署后检查清单

- [ ] `https://域名/health` 或 `curl https://域名/api/../health`（经 Nginx 时需单独 location，见 nginx 示例）
- [ ] 系统超管登录（不选团 + 手机号）
- [ ] `POST /api/choirs` 建团（系统超管）
- [ ] 发邀请码 → 注册 → 系统超管赋权团内超管
- [ ] `.env` 未进 Git；防火墙未开放 3306

## 当前限制（阶段一）

| 已可上线 | 尚未完成 |
|----------|----------|
| 登录 / 注册 / 邀请码 | CDE 文件上传 |
| 多团 / 6 角色 / 成员管理 API | 成员管理 HTML 未完全接 API |
| JWT + 锁定 + 验证码 | 正式 pytest CI |
| 同机 MySQL | 短信注册（阶段二） |

## 更新发布

```bash
cd /opt/choir
git pull
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
sudo systemctl restart choir-api
```
