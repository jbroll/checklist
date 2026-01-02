#!/bin/bash
# Deploy app frontend and backend
#
# Usage: ./deploy-full.sh [test|prod] [init|update]
#
# Environments:
#   test (default):
#     - checklist-test.rkroll.com -> Test app frontend + backend API
#
#   prod:
#     - checklist-app.rkroll.com -> App frontend + backend API

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
    echo "  prod  - Production (checklist-app.rkroll.com)"
    echo ""
    echo "Modes:"
    echo "  update - Update code only [default]"
    echo "  init   - Full setup (certificates, web server, etc.)"
    exit 1
fi

DEPLOY_SH="../deploy.sh/deploy.sh"

echo "=== CheckList Full Deployment ==="
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
    # Production deployment - app frontend + backend

    # Deploy app frontend
    echo "[1/3] Deploying App Frontend..."
    "$DEPLOY_SH" "$MODE" .
    echo "✓ App frontend deployed (checklist-app.rkroll.com)"
    echo ""

    # Deploy backend (secrets.env is deployed by deploy.sh module)
    echo "[2/3] Deploying Backend..."
    cd backend
    "../../deploy.sh/deploy.sh" "$MODE" .
    cd ..
    echo "✓ Backend deployed"

    # Verify backend health
    echo "    Checking backend health..."
    sleep 3
    if curl -sf https://checklist-app.rkroll.com/api/health > /dev/null; then
        echo "    ✓ Backend health check passed"
    else
        echo "    ✗ Backend health check FAILED"
        ssh checklist-app.rkroll.com "sudo journalctl -u checklist-api -n 10 --no-pager" || true
        exit 1
    fi
    echo ""

    # Run smoke tests
    echo "[3/3] Running Smoke Tests..."
    if npm run test:smoke:prod; then
        echo "✓ Smoke tests passed"
    else
        echo "✗ Smoke tests FAILED - deployment may have issues"
        exit 1
    fi
    echo ""

    echo "=== Production Deployment Complete ==="
    echo "App: https://checklist-app.rkroll.com"

elif [[ "$ENV" == "test" ]]; then
    # Test deployment - app + backend only (no marketing site)

    # Deploy app frontend with test config
    echo "[1/3] Deploying Test App Frontend..."
    if [[ ! -f "deploy-test.conf" ]]; then
        echo "ERROR: deploy-test.conf not found"
        exit 1
    fi

    DEPLOY_SH_CONF=deploy-test.conf "$DEPLOY_SH" "$MODE" .
    echo "✓ Test app frontend deployed (checklist-test.rkroll.com)"
    echo ""

    # Deploy backend with test config (secrets.env is deployed by deploy.sh module)
    echo "[2/3] Deploying Test Backend..."
    if [[ ! -f "backend/deploy-test.conf" ]]; then
        echo "ERROR: backend/deploy-test.conf not found"
        exit 1
    fi

    cd backend
    DEPLOY_SH_CONF=deploy-test.conf "../../deploy.sh/deploy.sh" "$MODE" .
    cd ..
    echo "✓ Test backend deployed"

    # Verify backend health
    echo "    Checking backend health..."
    sleep 3
    if curl -sf https://checklist-test.rkroll.com/api/health > /dev/null; then
        echo "    ✓ Backend health check passed"
    else
        echo "    ✗ Backend health check FAILED"
        ssh checklist-test.rkroll.com "sudo journalctl -u checkit-api-test -n 10 --no-pager" || true
        exit 1
    fi
    echo ""

    # Run smoke tests
    echo "[3/3] Running Smoke Tests..."
    if npm run test:smoke:test; then
        echo "✓ Smoke tests passed"
    else
        echo "✗ Smoke tests FAILED - deployment may have issues"
        exit 1
    fi
    echo ""

    echo "=== Test Deployment Complete ==="
    echo "Test App: https://checklist-test.rkroll.com"
fi
