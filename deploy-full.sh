#!/bin/bash
# Deploy both frontend and backend to bubblelist.rkroll.com

set -e

MODE="${1:-update}"
DEPLOY_SH="../deploy.sh/deploy.sh"

echo "=== Bubblelist Deployment (mode: $MODE) ==="
echo ""

# Deploy frontend
echo "[1/2] Deploying Frontend..."
"$DEPLOY_SH" "$MODE" .
echo "✓ Frontend deployed"
echo ""

# Deploy backend
echo "[2/2] Deploying Backend..."
cd backend
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Backend deployed"
echo ""

echo "=== Deployment Complete ==="
echo "Visit: https://bubblelist.rkroll.com"
