#!/bin/bash
# Builds the shareable JEE Sprint (no personal notes, no sync key; pairs by code):
#   dist/friend/out/JEE Sprint (Mac).zip   self-contained universal Mac app
#   dist/friend/out/JEE Sprint.apk         Android app
#   dist/friend/out/READ ME FIRST.txt
# Then restores your own (personal) Android build, so `npm run apk` output stays yours.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/dist/friend"
OUT="$F/out"
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export JAVA_HOME

echo "Building friend pages…"
node "$ROOT/build.mjs" --friend
rm -rf "$OUT"; mkdir -p "$OUT" "$F/bin"

echo "Compiling the Mac app (Intel + Apple Silicon)…"
SRC="$ROOT/mac/JEESprintPortable.swift"
for arch in x86_64 arm64; do
  BIN="$F/bin/JEESprint-$arch"
  if [ ! -f "$BIN" ] || [ "$SRC" -nt "$BIN" ]; then
    xcrun swiftc -swift-version 5 -Onone -target "$arch-apple-macos13.0" "$SRC" -o "$BIN"  # -O took minutes per chip
  fi
done

APP="$F/JEE Sprint.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
lipo -create "$F/bin/JEESprint-x86_64" "$F/bin/JEESprint-arm64" -output "$APP/Contents/MacOS/JEESprint"
cp "$ROOT/mac/Info-portable.plist" "$APP/Contents/Info.plist"
cp -R "$F/mac-web" "$APP/Contents/Resources/public"
cp "$F/core.js" "$APP/Contents/Resources/core.js"

ICONSET="$F/AppIcon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
swift "$ROOT/scripts/make-icon.swift" "$F/icon-1024.png" 1024
for s in 16 32 128 256 512; do
  sips -z $s $s "$F/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$F/icon-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
ditto -c -k --keepParent "$APP" "$OUT/JEE Sprint (Mac).zip"

echo "Building the Android app…"
rm -rf "$ROOT/dist/android"
cp -R "$F/android" "$ROOT/dist/android"
(cd "$ROOT" && npx cap copy android >/dev/null)
(cd "$ROOT/android" && ./gradlew -q assembleDebug)
cp "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$OUT/JEE Sprint.apk"

echo "Restoring your own Android build…"
node "$ROOT/build.mjs" >/dev/null
(cd "$ROOT" && npx cap copy android >/dev/null)
(cd "$ROOT/android" && ./gradlew -q assembleDebug)

cp "$ROOT/mac/FRIEND-README.txt" "$OUT/READ ME FIRST.txt"
echo "Done: $OUT"
ls -la "$OUT"
