-- Migration 015: AI Classification Support
-- Adds obligation_date for time-based visibility and classification metadata

-- Add obligation_date column for when the obligation/announcement is relevant
ALTER TABLE pending_approvals ADD COLUMN obligation_date TEXT;

-- Add classification metadata
ALTER TABLE pending_approvals ADD COLUMN classification_confidence REAL;
ALTER TABLE pending_approvals ADD COLUMN classification_reasoning TEXT;
ALTER TABLE pending_approvals ADD COLUMN classified_at TEXT;

-- Index for efficient time-based queries
CREATE INDEX IF NOT EXISTS idx_pending_approvals_obligation_date ON pending_approvals(obligation_date);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_item_type ON pending_approvals(item_type);

-- Record migration
INSERT INTO schema_migrations (version, name) VALUES (15, 'ai_classification');
