#!/usr/bin/env bash
# 復旧訓練・実復旧の両方で使う（本番リリース計画書 §3.5・G4-5）。
# 使い方: ./restore.sh /var/backups/diggr/public-20260910-020000.dump
set -euo pipefail
cd "$(dirname "$0")"

FILE="${1:?usage: restore.sh <dump-file>}"
[ -f "$FILE" ] || { echo "not found: $FILE" >&2; exit 1; }

echo "==> public スキーマへ復元します: $FILE"
read -r -p "本当に実行しますか？ 既存データは上書きされます [y/N] " CONFIRM
[ "$CONFIRM" = "y" ] || exit 1

START=$(date +%s)
docker compose exec -T postgres \
  pg_restore -U diggr -d diggr --schema=public --clean --if-exists < "$FILE"
END=$(date +%s)

echo "==> 復元完了（$((END - START)) 秒）"
echo "==> music_v{n} は空のままです（意図的。空でも API は起動する）"
echo "==> 次: docker compose up -d api && curl -f http://localhost:8080/health"
echo "==> 詰まった箇所は RECOVERY.md に追記すること（次回の短縮点）"
