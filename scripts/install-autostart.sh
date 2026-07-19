#!/usr/bin/env bash
# 安裝／移除「登入後自動啟動荷包股股開發伺服器」LaunchAgent

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="tw.stocksgood.dev-server"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
ENSURE="$ROOT/scripts/ensure-dev-server.sh"
ACTION="${1:-status}"

chmod +x "$ENSURE" "$ROOT/scripts/dev.sh" 2>/dev/null || true

case "$ACTION" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents"
    cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ENSURE}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${ROOT}/data/dev-server.launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/data/dev-server.launchd.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/Cellar/node/20.2.0/libexec/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl start "$LABEL" 2>/dev/null || true
    echo "installed:$PLIST"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "uninstalled"
    ;;
  status)
    if [[ -f "$PLIST" ]]; then
      if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
        echo "loaded"
      else
        echo "installed_not_loaded"
      fi
    else
      echo "not_installed"
    fi
    ;;
  *)
    echo "usage: $0 install|uninstall|status" >&2
    exit 1
    ;;
esac
