#!/usr/bin/env bash
# 荷包股股：給 macOS LaunchAgent 用的常駐開發伺服器
# 日誌：data/dev-server.log

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_BIN="/usr/local/Cellar/node/20.2.0/libexec/bin"
if [ -d "$NODE_BIN" ]; then
  export PATH="$NODE_BIN:$PATH"
fi

LOG_DIR="$ROOT/data"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-server.log"

export WATCHPACK_POLLING=true

{
  echo "======== $(date '+%Y-%m-%d %H:%M:%S %Z') launch ========"
  echo "cwd=$ROOT"
  echo "node=$(command -v node || true) $($(command -v node) -v 2>/dev/null || true)"
} >>"$LOG_FILE" 2>&1

# 若 3000 已被佔用，先不重複啟動（可能手動 npm run dev 已開）
if curl -sS -o /dev/null --connect-timeout 2 "http://127.0.0.1:3000" 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') port 3000 already up; idle wait" >>"$LOG_FILE"
  # 佔住行程，讓 LaunchAgent 知道服務「有在管」；每 60 秒檢查一次，掛了再退出讓 KeepAlive 重啟
  while curl -sS -o /dev/null --connect-timeout 2 "http://127.0.0.1:3000" 2>/dev/null; do
    sleep 60
  done
  echo "$(date '+%Y-%m-%d %H:%M:%S') port 3000 down; exiting for relaunch" >>"$LOG_FILE"
  exit 1
fi

exec >>"$LOG_FILE" 2>&1
exec npm run dev
