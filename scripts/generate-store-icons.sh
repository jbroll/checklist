#!/bin/bash
# Generate app store icons from SVG source
# Requires: librsvg-utils (sudo xbps-install -S librsvg-utils)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

SOURCE_SVG="$PROJECT_DIR/public/checklist-icon.svg"

# Output paths
PLAYSTORE_ICON="$PROJECT_DIR/playstore/icon-512x512.png"
APPSTORE_ICON="$PROJECT_DIR/appstore/icon-1024x1024.png"

# Check for rsvg-convert
if ! command -v rsvg-convert &> /dev/null; then
    echo "Error: rsvg-convert not found"
    echo "Install with: sudo xbps-install -S librsvg-utils"
    exit 1
fi

# Check source exists
if [ ! -f "$SOURCE_SVG" ]; then
    echo "Error: Source SVG not found: $SOURCE_SVG"
    exit 1
fi

echo "Generating store icons from: $SOURCE_SVG"

# Google Play Store: 512x512 (white background for consistency)
echo "  -> Play Store icon (512x512, white background)..."
rsvg-convert -w 512 -h 512 --background-color white "$SOURCE_SVG" -o "$PLAYSTORE_ICON"

# Apple App Store: 1024x1024 (white background, no transparency allowed)
echo "  -> App Store icon (1024x1024, white background)..."
rsvg-convert -w 1024 -h 1024 --background-color white "$SOURCE_SVG" -o "$APPSTORE_ICON"

echo ""
echo "Generated:"
echo "  $PLAYSTORE_ICON"
echo "  $APPSTORE_ICON"
