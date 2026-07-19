#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 本機 Homebrew Node 20（若路徑不同可改這裡，或確保 node 已在 PATH）
NODE_BIN="/usr/local/Cellar/node/20.2.0/libexec/bin"
if [ -d "$NODE_BIN" ]; then
  export PATH="$NODE_BIN:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "找不到 node，請先安裝 Node.js 或調整 scripts/dev.sh 中的 PATH。"
  exit 1
fi

export WATCHPACK_POLLING=true

echo "========================================"
echo "  FindFortune 台股洞察 — 開發伺服器"
echo "  http://localhost:3000"
echo "  按 Ctrl+C 停止"
echo "========================================"
echo ""

npm run dev
