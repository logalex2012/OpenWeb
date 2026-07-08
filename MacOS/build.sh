#!/bin/bash
# Builds MacOS/OpenWeb.app from src/main.swift — no Xcode required.
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="OpenWeb"
APP_DIR="$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ICONSET_DIR="AppIcon.iconset"
FAVICON="../static/favicon.png"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

if [ ! -f "AppIcon.icns" ] && [ -f "$FAVICON" ]; then
    echo "Generating app icon from $FAVICON..."
    rm -rf "$ICONSET_DIR"
    mkdir -p "$ICONSET_DIR"
    sips -z 16 16   "$FAVICON" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
    sips -z 32 32   "$FAVICON" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
    sips -z 32 32   "$FAVICON" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
    sips -z 64 64   "$FAVICON" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
    sips -z 128 128 "$FAVICON" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
    sips -z 256 256 "$FAVICON" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
    sips -z 256 256 "$FAVICON" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
    sips -z 512 512 "$FAVICON" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
    sips -z 512 512 "$FAVICON" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
    cp "$FAVICON" "$ICONSET_DIR/icon_512x512@2x.png"
    iconutil -c icns "$ICONSET_DIR" -o AppIcon.icns
    rm -rf "$ICONSET_DIR"
fi

echo "Compiling..."
swiftc -O -o "$MACOS_DIR/$APP_NAME" src/main.swift \
    -framework Cocoa -framework WebKit

cp Info.plist "$CONTENTS_DIR/Info.plist"
[ -f AppIcon.icns ] && cp AppIcon.icns "$RESOURCES_DIR/AppIcon.icns"

echo "Signing (ad-hoc)..."
codesign --force --deep --sign - "$APP_DIR"

echo "Built $APP_DIR"
echo "Run with: open \"$APP_DIR\""
