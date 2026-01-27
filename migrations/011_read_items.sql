-- Migration: Read Items Tracking
-- Tracks items that have been marked as "read" (softer than dismiss)
-- Used for newsletters, class updates, and other informational emails

CREATE TABLE IF NOT EXISTS read_items (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'pending_approval',  -- 'pending_approval', 'newsletter', etc.
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_by TEXT NOT NULL DEFAULT 'parent'
);

CREATE INDEX IF NOT EXISTS idx_read_items_item_id ON read_items(item_id);
CREATE INDEX IF NOT EXISTS idx_read_items_read_at ON read_items(read_at);
