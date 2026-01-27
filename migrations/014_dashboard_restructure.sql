-- Migration 014: Dashboard Restructure
-- Adds item_type classification and summary cache table

-- Add item_type column to pending_approvals for obligation vs announcement classification
ALTER TABLE pending_approvals ADD COLUMN item_type TEXT DEFAULT 'unknown';
-- Values: 'obligation', 'announcement', 'unknown'

-- Create summary cache table for AI-generated summaries
CREATE TABLE IF NOT EXISTS dashboard_summary_cache (
  id TEXT PRIMARY KEY,
  section_type TEXT NOT NULL,  -- 'obligations', 'announcements', 'catchup'
  summary_text TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,   -- Cache expiration (30 min default)
  item_count INTEGER NOT NULL,
  item_ids TEXT NOT NULL       -- JSON array of item IDs used to generate
);

CREATE INDEX IF NOT EXISTS idx_summary_cache_section ON dashboard_summary_cache(section_type);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_item_type ON pending_approvals(item_type);

-- Record this migration
INSERT INTO schema_migrations (version, name) VALUES (14, 'dashboard_restructure');
