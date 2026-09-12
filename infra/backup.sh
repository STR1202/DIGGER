#!/usr/bin/env bash
# 日次バックアップ（本番リリース計画書 §3.5・G4-4）。
# 対象は public スキーマ（ユーザーデータ）のみ。music_v{n} は月次パイプラインが
# 再構築できるのでバックアップ不要（技術選定書 ADR-25 と同じ発想）。
set -euo pipefail
cd "$(dirname "$0")"

RETAIN_DAYS=14
DEST_DIR="/var/backups/diggr"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST_DIR/public-$STAMP.dump"

mkdir -p "$DEST_DIR"

docker compose exec -T postgres \
  pg_dump -U diggr -d diggr --schema=public --format=custom > "$FILE"

# 取得直後に検証する（壊れたバックアップに気づかないのが最悪、本番リリース計画書 §3.5）。
if ! docker compose exec -T postgres pg_restore --list < "$FILE" > /dev/null 2>&1; then
  echo "!! backup verification failed: $FILE" >&2
  exit 1
fi

echo "==> backed up: $FILE ($(du -h "$FILE" | cut -f1))"

find "$DEST_DIR" -name '*.dump' -mtime +"$RETAIN_DAYS" -delete

# TODO(本番): rclone 等でオブジェクトストレージへコピーする（同一 VPS 内保管だけでは
# ディスク故障に対して無力。技術選定書 §9.1 の「壊れたときにどう戻すか」を参照）。
