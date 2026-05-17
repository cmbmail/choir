#!/bin/bash
# Alibaba Cloud Linux 3 — 首次安装系统依赖（root 执行一次）
# curl 或 scp 到服务器后: bash install-acl3-deps.sh
set -euo pipefail

if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  source /etc/os-release
  echo "OS: ${NAME:-unknown} ${VERSION_ID:-}"
fi

echo "==> dnf 更新并安装依赖"
dnf makecache -y
dnf install -y \
  python3.11 python3.11-pip python3.11-devel \
  nginx mysql-server git gcc openssl

# 若无 python3.11，回退系统 python3
if ! command -v python3.11 &>/dev/null; then
  echo "未找到 python3.11，安装 python3"
  dnf install -y python3 python3-pip python3-devel
fi

echo "==> 启动 MySQL、Nginx"
systemctl enable --now mysqld
systemctl enable --now nginx

echo "==> firewalld（若启用则放行 HTTP/HTTPS/SSH）"
if systemctl is-active firewalld &>/dev/null; then
  firewall-cmd --permanent --add-service=ssh
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
  echo "firewalld 已放行 22/80/443"
else
  echo "firewalld 未运行，请确认阿里云安全组已放行 80"
fi

echo "==> SELinux（若 Enforcing，允许 Nginx 读静态目录并反代）"
if command -v getenforce &>/dev/null && [[ "$(getenforce)" == "Enforcing" ]]; then
  setsebool -P httpd_can_network_connect 1 || true
  echo "已设置 httpd_can_network_connect"
  echo "代码放到 /opt/choir 后执行:"
  echo "  dnf install -y policycoreutils-python-utils"
  echo "  semanage fcontext -a -t httpd_sys_content_t '/opt/choir(/.*)?'"
  echo "  restorecon -Rv /opt/choir"
fi

echo "==> 完成。下一步:"
echo "  1. 配置 MySQL 用户与库（见 SERVER-47.98.105.70.md）"
echo "  2. 上传代码到 /opt/choir"
echo "  3. bash /opt/choir/deploy/install-ip.sh"
