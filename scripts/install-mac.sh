#!/bin/bash
# Installs JEE Sprint on this Mac:
#   1. builds the pages,
#   2. copies the sync server into ~/Library/Application Support/JEE Sprint/app
#      (outside the Documents folder, which macOS blocks for background processes),
#   3. starts it as a LaunchAgent (runs at login, restarts if it stops),
#   4. builds "JEE Sprint.app" into ~/Applications.
# Safe to re-run: progress in state.json is never touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$HOME/Library/Application Support/JEE Sprint"
RUNTIME="$DATA/app"
LABEL="com.saif.jeesprint"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"
DOMAIN="gui/$(id -u)"

echo "Building pages…"
node "$ROOT/build.mjs"

echo "Installing the sync service into $RUNTIME…"
mkdir -p "$RUNTIME/src"
cp "$ROOT/server.mjs" "$ROOT/calendar-sync.mjs" "$RUNTIME/"
cp "$ROOT/src/core.mjs" "$ROOT/src/calendar.mjs" "$RUNTIME/src/"
rm -rf "$RUNTIME/public"
cp -R "$ROOT/dist/mac" "$RUNTIME/public"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$RUNTIME/server.mjs</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/jee-sprint.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/jee-sprint.log</string>
</dict>
</plist>
EOF

# Stop the old service, wait until macOS has really unloaded it, then start the new one.
# Starting too soon fails with "Bootstrap failed: 5", which once left the service down.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
  sleep 0.5
done
started=""
for _ in 1 2 3 4 5; do
  if launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then started=1; break; fi
  sleep 1
done
if [ -z "$started" ]; then
  echo "Couldn't start the sync service. Run: launchctl bootstrap $DOMAIN \"$PLIST\"" >&2
  exit 1
fi

echo "Building JEE Sprint.app…"
BUILD="$ROOT/dist/macapp"
APP="$BUILD/JEE Sprint.app"
rm -rf "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$BUILD/AppIcon.iconset"
xcrun swiftc -O "$ROOT/mac/JEESprint.swift" -o "$APP/Contents/MacOS/JEESprint"
cp "$ROOT/mac/Info.plist" "$APP/Contents/Info.plist"

swift "$ROOT/scripts/make-icon.swift" "$BUILD/icon-1024.png" 1024
for s in 16 32 128 256 512; do
  sips -z $s $s "$BUILD/icon-1024.png" --out "$BUILD/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d "$BUILD/icon-1024.png" --out "$BUILD/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$BUILD/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"

mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/JEE Sprint.app"
cp -R "$APP" "$HOME/Applications/JEE Sprint.app"

for _ in 1 2 3 4 5 6; do curl -fsS -o /dev/null "http://127.0.0.1:5199/" 2>/dev/null && break; sleep 0.5; done
if curl -fsS -o /dev/null "http://127.0.0.1:5199/"; then
  echo "Done. The sync service is running; open JEE Sprint from ~/Applications or Spotlight."
else
  echo "Installed, but the sync service isn't answering yet. Check ~/Library/Logs/jee-sprint.log" >&2
  exit 1
fi
