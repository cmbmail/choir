#!/bin/bash
# Alibaba Cloud Linux 3 / 47.98.105.70 — 应用安装（需先跑 install-acl3-deps.sh）
# 用法: cd /opt/choir && bash deploy/install-ip.sh
set -euo pipefail

CHOIR_ROOT="${CHOIR_ROOT:-/opt/choir}"
cd "$CHOIR_ROOT"

PY=python3.11
command -v "$PY" &>/dev/null || PY=python3
echo "==> Python venv ($PY)"
cd backend
"$PY" -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt

echo "==> .env"
if [[ ! -f "$CHOIR_ROOT/.env" ]]; then
  cp "$CHOIR_ROOT/.env.production-ip.example" "$CHOIR_ROOT/.env"
  echo "已创建 .env，请编辑 DATABASE_URL 与超管密码后重新运行 seed"
fi

echo "==> systemd"
cp "$CHOIR_ROOT/deploy/choir-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable choir-api
systemctl restart choir-api

echo "==> nginx (IP)"
cp "$CHOIR_ROOT/deploy/nginx-choir-ip.conf" /etc/nginx/conf.d/choir.conf
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null || true
nginx -t
systemctl reload nginx

echo "==> 完成。请先配置 .env 与 MySQL，再执行:"
echo "    mysql -u choir -p choir_db < $CHOIR_ROOT/scripts/schema.sql"
echo "    cd $CHOIR_ROOT && source backend/.venv/bin/activate && python scripts/seed.py"
echo "    curl -s http://127.0.0.1/health"
echo "    浏览器: http://47.98.105.70/login.html"
