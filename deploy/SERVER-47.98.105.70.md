# 部署到 47.98.105.70

**系统：Alibaba Cloud Linux 3**（`dnf`，`firewalld`，`mysqld`）  
**访问：暂用 IP** — `http://47.98.105.70` + `AUTH_MODE=development`

---

## 访问地址（部署完成后）

| 用途 | URL |
|------|-----|
| 登录页 | http://47.98.105.70/login.html |
| 注册页 | http://47.98.105.70/register.html |
| 健康检查 | http://47.98.105.70/health |
| API | http://47.98.105.70/api/... |
| 管理端原型 | http://47.98.105.70/ui/极简中式-桌面端.html |

---

## 阿里云控制台

### 安全组（必做）

入方向放行：**22**、**80**（以后 HTTPS 再加 **443**）。  
**勿**对公网开放 **3306**。

### 系统防火墙（ACL3 常见）

若 ECS 内启用了 `firewalld`，需放行 HTTP（`install-acl3-deps.sh` 会自动处理）。  
仍打不开 80 时，到控制台再查安全组。

---

## 零、本机上传代码（Mac）

```bash
cd /Users/admin/Cursor/Choir01
tar czf /tmp/choir.tgz --exclude backend/.venv --exclude .git .
scp /tmp/choir.tgz root@47.98.105.70:/tmp/
```

---

## 一、SSH 登录

```bash
ssh root@47.98.105.70
```

---

## 二、安装系统依赖（仅首次）

```bash
mkdir -p /opt/choir
# 若已 scp 上传，先解压：
cd /opt && tar xzf /tmp/choir.tgz -C choir 2>/dev/null || true
# 或 git clone 到 /opt/choir 后：

bash /opt/choir/deploy/install-acl3-deps.sh
```

脚本会安装：`python3.11`、`nginx`、`mysql-server`、`git`、`gcc`，并启动 `mysqld` / `nginx`。

> 若仓库无 `python3.11`，脚本会回退 `python3`；项目需 **Python ≥3.10**，可执行 `python3 --version` 确认。

---

## 三、MySQL 8（同机）

```bash
# 可选：首次加固
mysql_secure_installation

mysql -u root -p <<'SQL'
CREATE DATABASE IF NOT EXISTS choir_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'choir'@'127.0.0.1' IDENTIFIED BY '请改成强密码';
GRANT ALL ON choir_db.* TO 'choir'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
```

导入表结构：

```bash
mysql -u choir -p choir_db < /opt/choir/scripts/schema.sql
```

---

## 四、应用配置

```bash
cp /opt/choir/.env.production-ip.example /opt/choir/.env
chmod 600 /opt/choir/.env
vi /opt/choir/.env
```

必改项：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 密码与上一步 MySQL 一致 |
| `SECRET_KEY` / `JWT_SECRET` / `INVITE_CODE_PEPPER` | 各执行 `openssl rand -hex 32` |
| `SYSTEM_SUPER_ADMIN_USERNAME` | 11 位手机号 |
| `SYSTEM_SUPER_ADMIN_PASSWORD` | 强密码 |

保持 **`AUTH_MODE=development`**（IP + HTTP 登录）。

种子数据：

```bash
cd /opt/choir
source backend/.venv/bin/activate
python3.11 scripts/seed.py || python3 scripts/seed.py
```

---

## 五、安装应用（Gunicorn + Nginx）

```bash
useradd -r -s /sbin/nologin choir 2>/dev/null || true
chown -R choir:choir /opt/choir

cd /opt/choir && bash deploy/install-ip.sh
```

### SELinux（若登录页 403 / Nginx 拒绝读文件）

```bash
dnf install -y policycoreutils-python-utils
semanage fcontext -a -t httpd_sys_content_t '/opt/choir(/.*)?'
restorecon -Rv /opt/choir
setsebool -P httpd_can_network_connect 1
```

---

## 六、验证

```bash
curl -s http://127.0.0.1:5000/health
curl -s http://127.0.0.1/health
curl -s http://47.98.105.70/api/choirs/public
```

浏览器：**http://47.98.105.70/login.html**

| 账号类型 | 说明 |
|----------|------|
| 系统超管 | 合唱团选「系统超管」；手机号/密码见 `.env` |
| 团内超管（seed） | 选 `choir_001`；`13900000001` / `ChoirAdmin1` |

---

## 七、常用命令（ACL3）

```bash
systemctl status choir-api nginx mysqld
journalctl -u choir-api -f
tail -f /var/log/nginx/error.log
```

更新代码：

```bash
cd /opt/choir && git pull   # 或重新 scp 覆盖
source backend/.venv/bin/activate && pip install -r backend/requirements.txt
systemctl restart choir-api
```

---

## 八、以后上域名 + HTTPS

```bash
dnf install -y certbot python3-certbot-nginx
# 改用 deploy/nginx-choir.conf，server_name 改为域名
certbot --nginx -d your.domain.com
```

`.env` 改为 `AUTH_MODE=production` 后 `systemctl restart choir-api`。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 外网 80 不通 | 安全组 + `firewall-cmd --list-all` |
| 502 | `journalctl -u choir-api -n 50` |
| 403 静态页 | SELinux `restorecon`（见第五节） |
| PyMySQL 报错 | `DATABASE_URL`、MySQL 是否监听 `127.0.0.1` |
| 无 python3.11 | `dnf module list python3` 或启用 EPOL 源 |
