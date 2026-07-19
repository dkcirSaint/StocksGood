#!/usr/bin/env bash
# 荷包股股：每分鐘由 crontab 呼叫；是否掃描依通知設定中的時刻（最多 3 組）
# 需求：本機 Next.js 有在跑（npm run dev），且電腦未休眠（或已自動喚醒）。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/data"
LOG_FILE="$LOG_DIR/notify-cron.log"
RESP_FILE="$LOG_DIR/notify-cron-tick-resp.json"
mkdir -p "$LOG_DIR"

export NOTIFY_BASE_URL="${NOTIFY_BASE_URL:-http://127.0.0.1:3000}"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

URL="${NOTIFY_BASE_URL%/}/api/notify/cron-tick"

{
  if ! CODE=$(curl -sS -o "$RESP_FILE" -w "%{http_code}" --connect-timeout 5 -X POST \
    -H "Content-Type: application/json" \
    "$URL"); then
    echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') ========"
    echo "ERROR: 無法連線 $NOTIFY_BASE_URL（請確認開發伺服器有開；休眠喚醒後若尚未啟動也會失敗）"
    exit 1
  fi

  BODY=$(cat "$RESP_FILE" 2>/dev/null || echo "{}")
  if [[ "$CODE" != "200" ]]; then
    echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') ========"
    echo "ERROR HTTP $CODE: $BODY"
    exit 1
  fi

  SKIPPED=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('skipped', False))" <<<"$BODY" 2>/dev/null || echo "True")
  if [[ "$SKIPPED" == "True" || "$SKIPPED" == "true" ]]; then
    exit 0
  fi

  echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') ========"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  echo "OK"
} >>"$LOG_FILE" 2>&1
