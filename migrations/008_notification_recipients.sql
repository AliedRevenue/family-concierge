-- Migration 008: Add notification recipients management table
-- Allows users to manage who receives digests, forwarding, error notifications

CREATE TABLE IF NOT EXISTS notification_recipients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  
  -- Notification preferences
  receive_digests INTEGER DEFAULT 1,  -- 1 = yes, 0 = no
  receive_forwarding INTEGER DEFAULT 1,
  receive_errors INTEGER DEFAULT 1,
  receive_approvals INTEGER DEFAULT 0,  -- For pending approval notifications
  
  -- Status
  is_active INTEGER DEFAULT 1,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_email ON notification_recipients(email);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_active ON notification_recipients(is_active);
