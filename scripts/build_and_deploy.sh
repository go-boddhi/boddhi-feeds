#!/bin/bash
set -e

echo "Building production Wails binary..."
wails build

BUILD_BIN="/home/alok/scouts/digital_garden/build/bin/vayu"
TARGET_DIR="/home/alok/.local/bin"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
NEW_VERSION_BIN="${TARGET_DIR}/vayu_v1.0_${TIMESTAMP}"
SYMLINK="${TARGET_DIR}/vayu"

mkdir -p "$TARGET_DIR"

echo "Deploying new versioned binary: ${NEW_VERSION_BIN}..."
cp "$BUILD_BIN" "$NEW_VERSION_BIN"
chmod +x "$NEW_VERSION_BIN"

ln -sfn "$NEW_VERSION_BIN" "$SYMLINK"

echo "Deploy complete! 'vayu' symlink updated to $(readlink -f $SYMLINK)"
