-- Share invites table (compatible with jbr-jazz conventions)
CREATE TABLE IF NOT EXISTS share_invites (
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

CREATE INDEX IF NOT EXISTS idx_share_invites_expires ON share_invites(expires_at);
CREATE INDEX IF NOT EXISTS idx_share_invites_target ON share_invites(target_covalue_id);

-- Migration: Rename column if old schema exists (SQLite 3.25+)
-- This handles existing databases gracefully
-- Note: Run this manually on existing databases if needed:
-- ALTER TABLE share_invites RENAME COLUMN folder_covalue_id TO target_covalue_id;
