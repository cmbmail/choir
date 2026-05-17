#!/bin/bash
# 在 47.98.105.70 上首次拉取代码（root）
# 用法:
#   GIT_CLONE_MODE=ssh   bash clone-on-server.sh
#   GIT_CLONE_MODE=https bash clone-on-server.sh
set -euo pipefail

CHOIR_ROOT="${CHOIR_ROOT:-/opt/choir}"
BRANCH="${BRANCH:-cursor/requirements-v2.1-multitenant-plan}"
MODE="${GIT_CLONE_MODE:-ssh}"

REPO_SSH="git@github.com:cmbmail/choir.git"
REPO_HTTPS="https://github.com/cmbmail/choir.git"

if [[ -d "$CHOIR_ROOT/.git" ]]; then
  echo "已存在 $CHOIR_ROOT，执行 git pull..."
  cd "$CHOIR_ROOT"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
  exit 0
fi

mkdir -p "$(dirname "$CHOIR_ROOT")"
dnf install -y git 2>/dev/null || true

case "$MODE" in
  ssh)
    if [[ ! -f /root/.ssh/id_ed25519.pub && ! -f /root/.ssh/id_rsa.pub ]]; then
      echo "生成 SSH 密钥（用于 GitHub）..."
      ssh-keygen -t ed25519 -N "" -f /root/.ssh/id_ed25519 -q
    fi
    echo ""
    echo "======== 将下面公钥添加到 GitHub ========="
    echo " 仓库 → Settings → Deploy keys → Add deploy key"
    echo " 或 账号 → Settings → SSH keys"
    echo "------------------------------------------"
    cat /root/.ssh/id_ed25519.pub 2>/dev/null || cat /root/.ssh/id_rsa.pub
    echo "=========================================="
    read -r -p "添加完成后按 Enter 继续 clone..." _
    ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts 2>/dev/null || true
    GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
      git clone -b "$BRANCH" "$REPO_SSH" "$CHOIR_ROOT"
    ;;
  https)
    echo "使用 HTTPS clone（私有库需 Personal Access Token）"
    echo "  GitHub → Settings → Developer settings → Fine-grained token"
    echo "  权限: Repository contents Read"
    echo ""
    read -r -p "GitHub 用户名: " GH_USER
    read -r -s -p "Token (输入不回显): " GH_TOKEN
    echo ""
    git clone -b "$BRANCH" "https://${GH_USER}:${GH_TOKEN}@github.com/cmbmail/choir.git" "$CHOIR_ROOT"
    # 避免 token 留在 remote url
    cd "$CHOIR_ROOT"
    git remote set-url origin "$REPO_HTTPS"
    ;;
  *)
    echo "GIT_CLONE_MODE 须为 ssh 或 https"
    exit 1
    ;;
esac

echo "代码已在: $CHOIR_ROOT"
echo "下一步: bash $CHOIR_ROOT/deploy/install-acl3-deps.sh"
