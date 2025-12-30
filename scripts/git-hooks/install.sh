#!/bin/bash
# Install git hooks from scripts/git-hooks to .git/hooks
# Run with: npm run setup:hooks or ./scripts/git-hooks/install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

# Ensure .git/hooks exists
mkdir -p "$GIT_HOOKS_DIR"
mkdir -p "$GIT_HOOKS_DIR/logs"

# Install commit-msg hook
if [ -f "$SCRIPT_DIR/commit-msg" ]; then
    cp "$SCRIPT_DIR/commit-msg" "$GIT_HOOKS_DIR/commit-msg"
    chmod +x "$GIT_HOOKS_DIR/commit-msg"
    echo "Installed commit-msg hook"
fi

echo "Git hooks installed successfully"
