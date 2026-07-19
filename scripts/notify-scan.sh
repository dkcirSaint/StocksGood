#!/usr/bin/env bash
# 荷包股股：觸發 Email 通知掃描（略過時刻表，直接掃描）
# 用法：
#   ./scripts/notify-scan.sh
#   NOTIFY_BASE_URL=http://localhost:3000 NOTIFY_CRON_SECRET=xxx ./scripts/notify-scan.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$val" =~ ^\".*\"$ ]]; then
      val="${val:1:${#val}-2}"
    elif [[ "$val" =~ ^\'.*\'$ ]]; then
      val="${val:1:${#val}-2}"
    fi
    printf -v "$key" '%s' "$val"
    export "$key"
  done <"$file"
}

# 若外面沒先帶入密鑰，再從 .env 讀
if [[ -z "${NOTIFY_CRON_SECRET:-}" ]]; then
  load_env_file "$ROOT/.env"
fi

BASE_URL="${NOTIFY_BASE_URL:-http://127.0.0.1:3000}"
SECRET="${NOTIFY_CRON_SECRET:-}"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

HEADERS=(-H "Content-Type: application/json")
URL="${BASE_URL%/}/api/notify/scan"

if [[ -n "$SECRET" ]]; then
  HEADERS+=(-H "Authorization: Bearer ${SECRET}")
fi

echo "POST ${URL}"
curl -sS -X POST "${HEADERS[@]}" "$URL" | python3 -m json.tool 2>/dev/null || curl -sS -X POST "${HEADERS[@]}" "$URL"
echo
