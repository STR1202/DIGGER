#!/usr/bin/env bash
# VPS の初期セットアップ（技術選定書 §9.2・本番リリース計画書 §3.2）。
# 「作り直しがいつでもできる」ことを目的にする。手で足した設定はここに書き戻す。
#
# 対象: KAGOYA CLOUD VPS（Ubuntu Server 24.04 LTS、6 vCPU / 8GB / 800GB NVMe プラン）。
# KAGOYA はコントロールパネルで「ログイン用認証キー」を事前登録してからインスタンスを作る方式で、
# 初期ログインは root ではなく `ubuntu` ユーザー（sudo 可・パスワードログインは最初から禁止）になる。
# そのためこのスクリプトは ubuntu ユーザーから `sudo` 経由で実行する前提で、root 昇格を自分で行う。
# 他社 VPS（root で直接ログインするタイプ）でも root のまま実行すれば同じように動く。
#
# 使い方:
#   scp infra/bootstrap.sh ubuntu@<VPSのIP>:~/
#   ssh ubuntu@<VPSのIP> 'DEPLOY_SSH_PUBKEY="$(cat ~/.ssh/authorized_keys)" bash bootstrap.sh'
# 冪等（再実行しても壊れない）。
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "==> root で再実行します（sudo）"
  exec sudo --preserve-env=DEPLOY_SSH_PUBKEY bash "$0" "$@"
fi

DEPLOY_USER="deploy"
REPO_DIR="/opt/diggr"

echo "==> OS 更新とセキュリティ自動更新"
apt-get update -y
apt-get upgrade -y
apt-get install -y unattended-upgrades fail2ban ufw git curl ca-certificates gnupg nano
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> deploy ユーザー（root ログイン禁止・公開鍵のみ）"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
fi
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# 未指定なら、いま SSH で入ってきたユーザー（KAGOYA の既定は ubuntu）の鍵をそのまま引き継ぐ。
if [ -z "${DEPLOY_SSH_PUBKEY:-}" ] && [ -n "${SUDO_USER:-}" ] && [ -f "/home/$SUDO_USER/.ssh/authorized_keys" ]; then
  DEPLOY_SSH_PUBKEY="$(cat "/home/$SUDO_USER/.ssh/authorized_keys")"
fi
if [ -n "${DEPLOY_SSH_PUBKEY:-}" ]; then
  echo "$DEPLOY_SSH_PUBKEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
else
  echo "!! DEPLOY_SSH_PUBKEY 未設定。/home/$DEPLOY_USER/.ssh/authorized_keys を後で必ず設定すること" >&2
fi

sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
# Ubuntu/Debian のサービス名は ssh、RHEL 系は sshd。両対応にしておく。
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "==> ファイアウォール（80 / 443 / SSH のみ）"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"

echo "==> NTP（cron とパイプラインの時刻ずれ防止）"
timedatectl set-ntp true

echo "==> リポジトリ配置"
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone https://github.com/STR1202/DIGGER.git "$REPO_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$REPO_DIR"

if [ ! -f "$REPO_DIR/infra/.env" ]; then
  cp "$REPO_DIR/infra/.env.example" "$REPO_DIR/infra/.env"
  chmod 600 "$REPO_DIR/infra/.env"
  echo "!! $REPO_DIR/infra/.env を編集してシークレットを設定してから 'docker compose up -d' すること" >&2
fi

echo "==> cron 登録（本番リリース計画書 §3.1 ステップ 9）"
CRON_FILE="/etc/cron.d/diggr"
cat > "$CRON_FILE" <<'EOF'
# 月次: 毎月 1 日 03:00 にデータパイプラインを実行
0 3 1 * * root cd /opt/diggr/infra && docker compose --profile pipeline run --rm pipeline >> /var/log/diggr-pipeline.log 2>&1
# 日次: 02:00 に DB バックアップ
0 2 * * * root /opt/diggr/infra/backup.sh >> /var/log/diggr-backup.log 2>&1
# 日次: 90 日アクセスの無いマップを掃除（ブックマーク済みは除外、基本設計書 R-33）
30 2 * * * root cd /opt/diggr/infra && docker compose exec -T postgres psql -U diggr -d diggr -c "DELETE FROM maps m WHERE m.last_opened_at < now() - interval '90 days' AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.target_type='map' AND b.target_key=m.id);" >> /var/log/diggr-gc.log 2>&1
EOF
chmod 644 "$CRON_FILE"

echo "==> 完了。ここでいったんログアウトし、$DEPLOY_USER で入り直してください:"
echo "  1) exit  # このセッションを抜ける"
echo "  2) ssh $DEPLOY_USER@<このVPSのIP>"
echo "  3) cd $REPO_DIR/infra && nano .env  # シークレットを設定して保存（Ctrl+O → Enter → Ctrl+X）"
echo "  4) docker compose build && docker compose up -d"
echo "  5) curl -f https://\$DIGGR_DOMAIN/health"
