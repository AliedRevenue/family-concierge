-- Migration 013: Add email body storage and view tokens for read-only access

-- Add email body columns to pending_approvals
ALTER TABLE pending_approvals ADD COLUMN email_body_text TEXT;
ALTER TABLE pending_approvals ADD COLUMN email_body_html TEXT;

-- Create view tokens table for read-only dashboard access
CREATE TABLE IF NOT EXISTS view_tokens (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    last_used_at TEXT,
    FOREIGN KEY (recipient_id) REFERENCES notification_recipients(id)
);

CREATE INDEX IF NOT EXISTS idx_view_tokens_token ON view_tokens(token);
CREATE INDEX IF NOT EXISTS idx_view_tokens_recipient ON view_tokens(recipient_id);

-- Record migration
INSERT INTO schema_migrations (version, name) VALUES (13, 'email_body_and_view_tokens');
