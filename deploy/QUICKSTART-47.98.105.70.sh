#!/bin/bash
# Alibaba Cloud Linux 3 @ 47.98.105.70 — 克隆后一键部署（root）
# 用法见 deploy/SERVER-47.98.105.70.md「完整流程」
set -euo pipefail

CHOIR_ROOT="${CHOIR_ROOT:-/opt/choir}"
BRANCH="${BRANCH:-cursor/requirements-v2.1-multitenant-plan}"
REPO_SSH="${REPO_SSH:-git@github.com:cmbmail/choir.git}"
REPO_HTTPS="${REPO_HTTPS:-https://github.com/cmbmail/choir.git}"

echo "=============================================="
echo " 弦歌合唱团 — 部署到 $CHOIR_ROOT"
echo " 分支: $BRANCH"
echo "=============================================="

if [[ ! -f "$CHOIR_ROOT/backend/run.py" ]]; then
  echo "错误: 未找到代码，请先 clone 到 $CHOIR_ROOT"
  echo "  export GIT_CLONE_MODE=ssh   # 或 https"
  exit 1
fi

cd "$CHOIR_ROOT"

if [[ ! -f .env ]]; then
  cp .env.production-ip.example .env
  chmod 600 .env
  echo ""
  echo ">>> 已生成 .env，请先编辑后再继续："
  echo "    vi $CHOIR_ROOT/.env"
  echo "    必改: DATABASE_URL, SECRET_KEY, JWT_SECRET, INVITE_CODE_PEPPER,"
  echo "          SYSTEM_SUPER_ADMIN_USERNAME, SYSTEM_SUPER_ADMIN_PASSWORD"
  echo ""
  read -r -p "编辑完成后按 Enter 继续..." _
fi

# 读取 DATABASE_URL 检查是否仍为占位
if grep -q '你的MySQL密码' .env 2>/dev/null; then
  echo "错误: .env 中 DATABASE_URL 仍为占位，请先 vi .env"
  exit 1
fi

echo "==> 系统依赖（可跳过若已执行 install-acl3-deps.sh）"
if ! command -v nginx &>/dev/null; then
  bash "$CHOIR_ROOT/deploy/install-acl3-deps.sh"
fi

echo "==> 导入数据库（若库已存在会报错，可忽略后继续）"
# 从 .env 解析密码较复杂，建议手动执行一次：
if ! mysql -u choir -p"${MYSQL_CHOIR_PWD:-}" choir_db -e "SELECT 1" &>/dev/null; then
  echo "请手动执行:"
  echo "  mysql -u choir -p choir_db < $CHOIR_ROOT/scripts/schema.sql"
  echo "  cd $CHOIR_ROOT && source backend/.venv/bin/activate && python scripts/seed.py"
  read -r -p "完成后按 Enter..." _
else
  mysql -u choir -p"${MYSQL_CHOIR_PWD}" choir_db < "$CHOIR_ROOT/scripts/schema.sql" || true
  cd "$CHOIR_ROOT" && source backend/.venv/bin/activate && python scripts/seed.py
fi

echo "==> 应用服务"
useradd -r -s /sbin/nologin choir 2>/dev/null || true
chown -R choir:choir "$CHOIR_ROOT"
bash "$CHOIR_ROOT/deploy/install-ip.sh"

if command -v getenforce &>/dev/null && [[ "$(getenforce)" == "Enforcing" ]]; then
  echo "==> SELinux"
  dnf install -y policycoreutils-python-utils 2>/dev/null || true
  semanage fcontext -a -t httpd_sys_content_t "${CHOIR_ROOT}(/.*)?" 2>/dev/null || true
  restorecon -Rv "$CHOIR_ROOT" 2>/dev/null || true
  setsebool -P httpd_can_network_connect 1 2>/dev/null || true
fi

echo ""
echo "=============================================="
echo " 验证:"
curl -sf http://127.0.0.1/health && echo ""
echo " 浏览器: http://47.98.105.70/login.html"
echo "=============================================="
