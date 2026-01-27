-- Migration 012: Add 'newsletter' to extraction_status CHECK constraint
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table

-- Create new table with updated CHECK constraint
CREATE TABLE IF NOT EXISTS processed_messages_new (
    message_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    extraction_status TEXT NOT NULL CHECK (extraction_status IN ('success', 'failed', 'skipped', 'newsletter')),
    events_extracted INTEGER NOT NULL DEFAULT 0,
    fingerprints TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copy existing data
INSERT INTO processed_messages_new
SELECT message_id, processed_at, pack_id, extraction_status, events_extracted, fingerprints, error, created_at
FROM processed_messages;

-- Drop old table
DROP TABLE processed_messages;

-- Rename new table
ALTER TABLE processed_messages_new RENAME TO processed_messages;

-- Recreate indexes
CREATE INDEX idx_processed_messages_pack_id ON processed_messages(pack_id);
CREATE INDEX idx_processed_messages_processed_at ON processed_messages(processed_at);

-- Record migration
INSERT INTO schema_migrations (version, name) VALUES (12, 'newsletter_status');
