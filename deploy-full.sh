#!/bin/bash
# Deploy marketing website, app frontend, and backend
#
# Domains:
#   - kjekit.com     -> Marketing website (static)
#   - app.kjekit.com -> App frontend + backend API

set -e

MODE="${1:-update}"
DEPLOY_SH="../deploy.sh/deploy.sh"

echo "=== Kjekit Full Deployment (mode: $MODE) ==="
echo ""

# Build website pages from markdown
echo "[1/5] Building Website Pages..."
npm run build:website
echo "✓ Website pages built"
echo ""

# Deploy marketing website
echo "[2/5] Deploying Marketing Website..."
cd website
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Marketing website deployed (kjekit.com)"
echo ""

# Deploy app frontend
echo "[3/5] Deploying App Frontend..."
"$DEPLOY_SH" "$MODE" .
echo "✓ App frontend deployed (app.kjekit.com)"
echo ""

# Deploy backend
echo "[4/5] Deploying Backend..."
cd backend
"../../deploy.sh/deploy.sh" "$MODE" .
cd ..
echo "✓ Backend deployed"
echo ""

# Deploy secrets (not in git, but deployed automatically)
echo "[5/5] Deploying Backend Secrets..."
if [ -f "backend/secrets.env" ]; then
    scp backend/secrets.env app.kjekit.com:/var/lib/kjekit-api-data/secrets.env
    ssh app.kjekit.com "sudo systemctl restart kjekit-api"
    echo "✓ Secrets deployed and backend restarted"
else
    echo "⚠ backend/secrets.env not found, skipping secrets deployment"
fi
echo ""

echo "=== Deployment Complete ==="
echo "Marketing: https://kjekit.com"
echo "App:       https://app.kjekit.com"
