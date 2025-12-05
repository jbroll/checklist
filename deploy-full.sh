#!/bin/bash
# Deploy marketing website, app frontend, and backend
#
# Domains:
#   - bubblelist.rkroll.com     -> Marketing website (static)
#   - app.bubblelist.rkroll.com -> App frontend + backend API

set -e

MODE="${1:-update}"
DEPLOY_SH="../deploy.sh/deploy.sh"

echo "=== BubbleList Full Deployment (mode: $MODE) ==="
echo ""

# Build website pages from markdown
echo "[1/4] Building Website Pages..."
npm run build:website
echo "✓ Website pages built"
echo ""

# Deploy marketing website
echo "[2/4] Deploying Marketing Website..."
cd website
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Marketing website deployed (bubblelist.rkroll.com)"
echo ""

# Deploy app frontend
echo "[3/4] Deploying App Frontend..."
"$DEPLOY_SH" "$MODE" .
echo "✓ App frontend deployed (bubblelist-app.rkroll.com)"
echo ""

# Deploy backend
echo "[4/4] Deploying Backend..."
cd backend
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Backend deployed"
echo ""

echo "=== Deployment Complete ==="
echo "Marketing: https://bubblelist.rkroll.com"
echo "App:       https://bubblelist-app.rkroll.com"
