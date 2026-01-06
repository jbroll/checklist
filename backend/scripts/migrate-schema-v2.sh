#!/bin/bash
# Migration script: v1 -> v2 schema alignment with jbr-jazz
#
# Changes:
#   share_invites:
#     - folder_covalue_id -> target_covalue_id
#     - permission: view/edit/admin -> reader/writer/admin
#   subscription_tier:
#     - max_lists -> max_items
#     - session_retention_days -> retention_days
#   usage_snapshot:
#     - list_count -> item_count
#   user_subscription:
#     - status CHECK: add 'beta' option
#
# Usage:
#   ./migrate-schema-v2.sh [path/to/auth.db]
#   ./migrate-schema-v2.sh                    # defaults to ./auth.db

set -e

DB_PATH="${1:-./auth.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file not found: $DB_PATH"
  exit 1
fi

# Create backup
BACKUP_PATH="${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
echo "==> Creating backup: $BACKUP_PATH"
cp "$DB_PATH" "$BACKUP_PATH"

echo "==> Running migration on: $DB_PATH"
echo ""

# Check SQLite version
SQLITE_VERSION=$(sqlite3 "$DB_PATH" "SELECT sqlite_version();")
echo "SQLite version: $SQLITE_VERSION"
echo ""

# Helper function to check if column exists
col_exists() {
  local table=$1
  local column=$2
  sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('$table') WHERE name = '$column';" | grep -q "1"
}

# 1. Migrate share_invites
echo "==> Checking share_invites table..."
if col_exists "share_invites" "folder_covalue_id"; then
  echo "    Migrating: folder_covalue_id -> target_covalue_id"
  echo "    Migrating: permission values (view->reader, edit->writer)"

  sqlite3 "$DB_PATH" <<'EOF'
BEGIN TRANSACTION;

CREATE TABLE share_invites_new (
  token TEXT PRIMARY KEY,
  sender_email TEXT NOT NULL,
  sender_jazz_account_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  target_covalue_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('reader', 'writer', 'admin')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER
);

INSERT INTO share_invites_new (
  token, sender_email, sender_jazz_account_id, recipient_email,
  target_covalue_id, permission, expires_at, created_at, accepted_at
)
SELECT
  token, sender_email, sender_jazz_account_id, recipient_email,
  folder_covalue_id,
  CASE permission
    WHEN 'view' THEN 'reader'
    WHEN 'edit' THEN 'writer'
    ELSE permission
  END,
  expires_at, created_at, accepted_at
FROM share_invites;

DROP TABLE share_invites;
ALTER TABLE share_invites_new RENAME TO share_invites;

CREATE INDEX idx_share_invites_expires ON share_invites(expires_at);
CREATE INDEX idx_share_invites_target ON share_invites(target_covalue_id);

COMMIT;
EOF
  echo "    Done."
else
  echo "    Already migrated, skipping."
fi
echo ""

# 2. Migrate subscription_tier
echo "==> Checking subscription_tier table..."
if col_exists "subscription_tier" "max_lists"; then
  echo "    Renaming: max_lists -> max_items"
  sqlite3 "$DB_PATH" "ALTER TABLE subscription_tier RENAME COLUMN max_lists TO max_items;"
  echo "    Done."
else
  echo "    max_items already exists, skipping."
fi

if col_exists "subscription_tier" "session_retention_days"; then
  echo "    Renaming: session_retention_days -> retention_days"
  sqlite3 "$DB_PATH" "ALTER TABLE subscription_tier RENAME COLUMN session_retention_days TO retention_days;"
  echo "    Done."
else
  echo "    retention_days already exists, skipping."
fi
echo ""

# 3. Migrate usage_snapshot
echo "==> Checking usage_snapshot table..."
if col_exists "usage_snapshot" "list_count"; then
  echo "    Renaming: list_count -> item_count"
  sqlite3 "$DB_PATH" "ALTER TABLE usage_snapshot RENAME COLUMN list_count TO item_count;"
  echo "    Done."
else
  echo "    item_count already exists, skipping."
fi
echo ""

# 4. Migrate user_subscription (need to check CHECK constraint)
echo "==> Checking user_subscription table..."

# Check if 'beta' status exists in CHECK constraint by looking at table definition
TABLE_SQL=$(sqlite3 "$DB_PATH" "SELECT sql FROM sqlite_master WHERE type='table' AND name='user_subscription';")
if echo "$TABLE_SQL" | grep -q "'beta'"; then
  echo "    CHECK constraint already includes 'beta', skipping."
else
  echo "    Updating CHECK constraint to include 'beta' status"

  sqlite3 "$DB_PATH" <<'EOF'
BEGIN TRANSACTION;

CREATE TABLE user_subscription_new (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  tier_slug TEXT NOT NULL DEFAULT 'free' REFERENCES subscription_tier(slug),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'beta' CHECK(status IN ('active', 'past_due', 'cancelled', 'trialing', 'beta')),
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

INSERT INTO user_subscription_new
SELECT * FROM user_subscription;

DROP TABLE user_subscription;
ALTER TABLE user_subscription_new RENAME TO user_subscription;

CREATE INDEX idx_subscription_status ON user_subscription(status);
CREATE INDEX idx_subscription_stripe_customer ON user_subscription(stripe_customer_id);

COMMIT;
EOF
  echo "    Done."
fi
echo ""

# Verify
echo "==> Migration complete!"
echo ""
echo "Backup saved to: $BACKUP_PATH"
echo ""
echo "Verification:"
echo "  share_invites columns:"
sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('share_invites');" | tr '\n' ' '
echo ""
echo "  subscription_tier columns:"
sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('subscription_tier');" | tr '\n' ' '
echo ""
echo "  usage_snapshot columns:"
sqlite3 "$DB_PATH" "SELECT name FROM pragma_table_info('usage_snapshot');" | tr '\n' ' '
echo ""
