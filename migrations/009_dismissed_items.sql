-- Migration 009: Add dismissed items tracking
-- Purpose: Support DISMISSED state for parent-closed items

CREATE TABLE IF NOT EXISTS dismissed_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL, -- 'pending_approval' or 'deferred'
  item_id TEXT NOT NULL,
  dismissed_at TEXT NOT NULL,
  dismissed_by TEXT DEFAULT 'parent',
  reason TEXT,
  
  -- Original item context (for audit)
  original_subject TEXT,
  original_from TEXT,
  original_date TEXT,
  person TEXT,
  pack_id TEXT,
  
  -- Metadata
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dismissed_items_date ON dismissed_items(dismissed_at);
CREATE INDEX IF NOT EXISTS idx_dismissed_items_person ON dismissed_items(person);
CREATE INDEX IF NOT EXISTS idx_dismissed_items_pack ON dismissed_items(pack_id);
