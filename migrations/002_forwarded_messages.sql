-- Migration: 002_forwarded_messages
-- Description: Add table for tracking forwarded emails
-- Created: 2025-12-27

-- ========================================
-- Forwarded Messages
-- ========================================
CREATE TABLE IF NOT EXISTS forwarded_messages (
    id TEXT PRIMARY KEY,
    source_message_id TEXT NOT NULL,
    forwarded_at TEXT NOT NULL DEFAULT (datetime('now')),
    forwarded_to TEXT NOT NULL, -- JSON array of email addresses
    pack_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    conditions TEXT NOT NULL, -- JSON array of ForwardingCondition
    success INTEGER NOT NULL,
    error TEXT,
    FOREIGN KEY (source_message_id) REFERENCES processed_messages(message_id)
);

CREATE INDEX idx_forwarded_messages_source_message_id ON forwarded_messages(source_message_id);
CREATE INDEX idx_forwarded_messages_pack_id ON forwarded_messages(pack_id);
CREATE INDEX idx_forwarded_messages_forwarded_at ON forwarded_messages(forwarded_at);
CREATE INDEX idx_forwarded_messages_success ON forwarded_messages(success);

-- Update exception types to include forwarding errors
-- Note: SQLite doesn't support ALTER TABLE CHECK constraint modification
-- This is a documentation note for the new valid type

-- Update schema version
INSERT INTO schema_migrations (version, name) VALUES (2, '002_forwarded_messages');
