#!/bin/bash
# Deploy marketing website, app frontend, and backend
#
# Usage: ./deploy-full.sh [test|prod] [init|update]
#
# Environments:
#   test (default):
#     - checklist-test.rkroll.com -> Test app frontend + backend API
#
#   prod:
#     - kjekit.com          -> Marketing website (static)
#     - app.kjekit.com      -> App frontend + backend API
#     - checklist-app.rkroll.com (alias)

set -e

# Parse arguments
ENV="${1:-test}"
MODE="${2:-update}"

# Validate environment
if [[ "$ENV" != "prod" && "$ENV" != "test" ]]; then
    echo "Usage: $0 [test|prod] [init|update]"
    echo ""
    echo "Environments:"
    echo "  test  - Test (checklist-test.rkroll.com) [default]"
    echo "  prod  - Production (app.kjekit.com, kjekit.com)"
    echo ""
    echo "Modes:"
    echo "  update - Update code only [default]"
    echo "  init   - Full setup (certificates, web server, etc.)"
    exit 1
fi

DEPLOY_SH="../deploy.sh/deploy.sh"

echo "=== Kjekit Full Deployment ==="
echo "Environment: $ENV"
echo "Mode: $MODE"
echo ""

# Function to deploy with config override
deploy_with_config() {
    local dir="$1"
    local config_suffix="$2"

    if [[ -n "$config_suffix" && -f "$dir/deploy-${config_suffix}.conf" ]]; then
        # Use environment-specific config
        cp "$dir/deploy-${config_suffix}.conf" "$dir/deploy.conf.bak" 2>/dev/null || true
        cp "$dir/deploy-${config_suffix}.conf" "$dir/deploy.conf"
        trap "mv '$dir/deploy.conf.bak' '$dir/deploy.conf' 2>/dev/null || true" EXIT
    fi

    if [[ "$dir" == "." ]]; then
        "$DEPLOY_SH" "$MODE" .
    else
        cd "$dir"
        "../../deploy.sh/deploy.sh" "$MODE" .
        cd ..
    fi
}

if [[ "$ENV" == "prod" ]]; then
    # Production deployment - all three components

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

    # Deploy secrets
    echo "[5/5] Deploying Backend Secrets..."
    if [ -f "backend/secrets.env" ]; then
        scp backend/secrets.env app.kjekit.com:/var/lib/kjekit-api-data/secrets.env
        ssh app.kjekit.com "sudo systemctl restart kjekit-api"
        echo "✓ Secrets deployed and backend restarted"
    else
        echo "⚠ backend/secrets.env not found, skipping secrets deployment"
    fi
    echo ""

    echo "=== Production Deployment Complete ==="
    echo "Marketing: https://kjekit.com"
    echo "App:       https://app.kjekit.com"

elif [[ "$ENV" == "test" ]]; then
    # Test deployment - app + backend only (no marketing site)

    # Deploy app frontend with test config
    echo "[1/3] Deploying Test App Frontend..."
    if [[ ! -f "deploy-test.conf" ]]; then
        echo "ERROR: deploy-test.conf not found"
        exit 1
    fi

    # Backup and swap config
    cp deploy.conf deploy.conf.prod.bak
    cp deploy-test.conf deploy.conf

    "$DEPLOY_SH" "$MODE" .

    # Restore prod config
    mv deploy.conf.prod.bak deploy.conf
    echo "✓ Test app frontend deployed (checklist-test.rkroll.com)"
    echo ""

    # Deploy backend with test config
    echo "[2/3] Deploying Test Backend..."
    if [[ ! -f "backend/deploy-test.conf" ]]; then
        echo "ERROR: backend/deploy-test.conf not found"
        exit 1
    fi

    cd backend
    cp deploy.conf deploy.conf.prod.bak
    cp deploy-test.conf deploy.conf

    "../../deploy.sh/deploy.sh" "$MODE" .

    # Restore prod config
    mv deploy.conf.prod.bak deploy.conf
    cd ..
    echo "✓ Test backend deployed"
    echo ""

    # Deploy test secrets
    echo "[3/3] Deploying Test Backend Secrets..."
    if [ -f "backend/secrets-test.env" ]; then
        scp backend/secrets-test.env checklist-test.rkroll.com:/var/lib/kjekit-api-test-data/secrets.env
        ssh checklist-test.rkroll.com "sudo systemctl restart kjekit-api-test"
        echo "✓ Test secrets deployed and backend restarted"
    else
        echo "⚠ backend/secrets-test.env not found, skipping secrets deployment"
    fi
    echo ""

    echo "=== Test Deployment Complete ==="
    echo "Test App: https://checklist-test.rkroll.com"
fi
