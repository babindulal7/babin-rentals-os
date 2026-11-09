#!/usr/bin/env bash
# One-time installation on the normal logged-in Mac user, without sudo.
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: bash tools/workstation-sync/install-macos.sh /absolute/path/to/babin-rentals-os" >&2; exit 2; fi
repo="$(cd "$1" && pwd -P)"
script="$repo/tools/workstation-sync/sync.mjs"
[[ -f "$script" ]] || { echo 'sync.mjs missing. Merge PR before installing.' >&2; exit 1; }
for c in node git gh; do command -v "$c" >/dev/null || { echo "Install $c before proceeding" >&2; exit 1; }; done
gh auth status >/dev/null 2>&1 || { echo "Run gh auth login as this Mac user first" >&2; exit 1; }
origin="$(git -C "$repo" config --get remote.origin.url)"
case "$origin" in
  https://github.com/babindulal7/babin-rentals-os|https://github.com/babindulal7/babin-rentals-os.git|git@github.com:babindulal7/babin-rentals-os|git@github.com:babindulal7/babin-rentals-os.git|ssh://git@github.com/babindulal7/babin-rentals-os|ssh://git@github.com/babindulal7/babin-rentals-os.git) ;;
  *) echo 'Wrong GitHub origin. Stopping.' >&2; exit 1 ;;
esac

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
plist="$HOME/Library/LaunchAgents/com.babinrentals.os-safe-sync.plist"
label='com.babinrentals.os-safe-sync'
node_bin="$(command -v node)"
# launchd uses a small default PATH; include CLI installation directories.
path_value="$(dirname "$(command -v node)"):$(dirname "$(command -v git)"):$(dirname "$(command -v gh)"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>$(xml "$node_bin")</string>
    <string>$(xml "$script")</string>
    <string>--apply</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$repo")</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(xml "$path_value")</string></dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$(xml "$HOME/Library/Logs/babin-os-safe-sync.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$HOME/Library/Logs/babin-os-safe-sync.log")</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "Installed: $label (every 15 minutes)"
echo "Log: $HOME/Library/Logs/babin-os-safe-sync.log"
echo "Uninstall: launchctl bootout gui/$(id -u)/$label; rm '$plist'"
