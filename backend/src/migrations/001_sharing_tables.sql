-- Folder Sharing Tables Migration
-- Version: 001
-- Date: 2025-11-19

-- Share invites table
-- Stores invite tokens and tracks their lifecycle
CREATE TABLE IF NOT EXISTS share_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,

  -- Owner information
  owner_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,

  -- Recipient information (email or phone, detected by syntax)
  recipient_identifier TEXT NOT NULL,

  -- Folder and permissions
  folder_id TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK(permission_level IN ('view', 'edit', 'admin')),

  -- Lifecycle timestamps (Unix seconds)
  expires_at INTEGER,
  created_at INTEGER NOT NULL,

  -- Acceptance tracking
  accepted_at INTEGER,
  accepted_by_user_id TEXT,
  accepted_by_oauth_sub TEXT,
  accepted_by_oauth_provider TEXT,

  -- Revocation
  revoked_at INTEGER,

  FOREIGN KEY (owner_id) REFERENCES user(id),
  FOREIGN KEY (accepted_by_user_id) REFERENCES user(id)
);

-- Indexes for performance
CREATE INDEX idx_share_invites_token ON share_invites(token);
CREATE INDEX idx_share_invites_folder_id ON share_invites(folder_id);
CREATE INDEX idx_share_invites_recipient ON share_invites(recipient_identifier);
CREATE INDEX idx_share_invites_expires_at ON share_invites(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_share_invites_owner ON share_invites(owner_id);

-- Audit log table
-- Immutable log of all sharing actions
CREATE TABLE IF NOT EXISTS share_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Action details
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_user_id TEXT,
  folder_id TEXT NOT NULL,

  -- Metadata as JSON
  metadata TEXT,

  -- Timestamp (Unix seconds)
  created_at INTEGER NOT NULL,

  FOREIGN KEY (actor_id) REFERENCES user(id),
  FOREIGN KEY (target_user_id) REFERENCES user(id)
);

-- Indexes for audit queries
CREATE INDEX idx_share_audit_log_folder_id ON share_audit_log(folder_id);
CREATE INDEX idx_share_audit_log_actor_id ON share_audit_log(actor_id);
CREATE INDEX idx_share_audit_log_created_at ON share_audit_log(created_at);
CREATE INDEX idx_share_audit_log_action ON share_audit_log(action);

-- Folder ownership tracking
-- Maps Jazz folder CoValue IDs to BetterAuth user IDs
-- Enables backend authorization without querying Jazz
CREATE TABLE IF NOT EXISTS folder_ownership (
  folder_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,

  FOREIGN KEY (owner_user_id) REFERENCES user(id)
);

CREATE INDEX idx_folder_ownership_owner ON folder_ownership(owner_user_id);
