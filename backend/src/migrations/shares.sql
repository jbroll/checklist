-- Minimal sharing table
CREATE TABLE IF NOT EXISTS share_invites (
  token TEXT PRIMARY KEY,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  folder_covalue_id TEXT NOT NULL,
  recipient_jazz_account_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('view', 'edit', 'admin')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER
);

CREATE INDEX idx_expires ON share_invites(expires_at);
