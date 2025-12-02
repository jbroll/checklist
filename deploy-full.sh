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

# Deploy marketing website
echo "[1/3] Deploying Marketing Website..."
cd website
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Marketing website deployed (bubblelist.rkroll.com)"
echo ""

# Deploy app frontend
echo "[2/3] Deploying App Frontend..."
"$DEPLOY_SH" "$MODE" .
echo "✓ App frontend deployed (bubblelist-app.rkroll.com)"
echo ""

# Deploy backend
echo "[3/3] Deploying Backend..."
cd backend
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Backend deployed"
echo ""

echo "=== Deployment Complete ==="
echo "Marketing: https://bubblelist.rkroll.com"
echo "App:       https://bubblelist-app.rkroll.com"
