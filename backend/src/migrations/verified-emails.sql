-- Verified emails table - links additional emails to a user account
CREATE TABLE IF NOT EXISTS verified_email (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verified_email_user_id ON verified_email(user_id);
CREATE INDEX IF NOT EXISTS idx_verified_email_email ON verified_email(email);
