#!/bin/bash
# Full deployment script for bubblelist.rkroll.com
# Deploys both frontend and backend

set -e

DEPLOY_SH="../deploy.sh/deploy.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Bubblelist Deployment ===${NC}"
echo ""

# Check if deploy.sh exists
if [[ ! -f "$DEPLOY_SH" ]]; then
    echo -e "${RED}ERROR: deploy.sh not found at $DEPLOY_SH${NC}"
    exit 1
fi

# Parse mode argument
MODE="${1:-update}"
if [[ "$MODE" != "init" && "$MODE" != "update" ]]; then
    echo -e "${RED}ERROR: Invalid mode '$MODE'. Use 'init' or 'update'${NC}"
    echo "Usage: $0 [init|update]"
    exit 1
fi

echo -e "Deployment mode: ${YELLOW}$MODE${NC}"
echo ""

# Check for required environment files in init mode
if [[ "$MODE" == "init" ]]; then
    if [[ ! -f "backend/.env.production" ]]; then
        echo -e "${RED}ERROR: backend/.env.production not found${NC}"
        echo "Please create it with your OAuth credentials and secrets"
        exit 1
    fi

    if grep -q "REPLACE_WITH_SECURE_RANDOM_STRING" backend/.env.production; then
        echo -e "${YELLOW}WARNING: backend/.env.production contains placeholder values${NC}"
        echo "Please update BETTER_AUTH_SECRET and OAuth credentials before deploying"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Deploy frontend
echo -e "${GREEN}[1/2] Deploying Frontend...${NC}"
"$DEPLOY_SH" "$MODE" . || {
    echo -e "${RED}Frontend deployment failed!${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}✓ Frontend deployed${NC}"
echo ""

# Deploy backend
echo -e "${GREEN}[2/2] Deploying Backend...${NC}"
cd backend
"../../deploy.sh/deploy.sh" "$MODE" . || {
    echo -e "${RED}Backend deployment failed!${NC}"
    exit 1
}
cd ..

echo ""
echo -e "${GREEN}✓ Backend deployed${NC}"
echo ""

# Final instructions for init mode
if [[ "$MODE" == "init" ]]; then
    echo -e "${GREEN}=== Initial Deployment Complete ===${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Set up backend secrets on the server:${NC}"
    echo ""
    echo "  ssh deploy@bubblelist.rkroll.com"
    echo "  sudo nano /etc/bubblelist-api/.env"
    echo ""
    echo "Copy the contents from backend/.env.production with real values, then:"
    echo ""
    echo "  sudo systemctl restart bubblelist-api"
    echo "  sudo systemctl status bubblelist-api"
    echo ""
else
    echo -e "${GREEN}=== Deployment Complete ===${NC}"
fi

echo "Visit: https://bubblelist.rkroll.com"
echo ""
