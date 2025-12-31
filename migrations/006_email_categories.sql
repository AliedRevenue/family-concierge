-- Migration: Add email category classification
-- Version: 006
-- Date: 2025-12-30

-- ============================================
-- Add category columns to pending_approvals
-- ============================================

ALTER TABLE pending_approvals ADD COLUMN primary_category TEXT;
ALTER TABLE pending_approvals ADD COLUMN secondary_categories TEXT; -- JSON array
ALTER TABLE pending_approvals ADD COLUMN category_scores TEXT; -- JSON map
ALTER TABLE pending_approvals ADD COLUMN save_reasons TEXT; -- JSON array

-- ============================================
-- Create category preferences table
-- ============================================

CREATE TABLE IF NOT EXISTS category_preferences (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL UNIQUE,
  enabled_categories TEXT NOT NULL, -- JSON array of enabled categories
  sensitivity_map TEXT NOT NULL, -- JSON map of category -> sensitivity level
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

);

CREATE INDEX IF NOT EXISTS idx_category_preferences_pack ON category_preferences(pack_id);

-- ============================================
-- Add category breakdown to discovery_run_stats
-- ============================================

ALTER TABLE discovery_run_stats ADD COLUMN category_school_scanned INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_school_flagged INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_sports_scanned INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_sports_flagged INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_medical_scanned INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_medical_flagged INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_logistics_scanned INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_logistics_flagged INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_forms_scanned INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_forms_flagged INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_other_scanned INTEGER DEFAULT 0;
ALTER TABLE discovery_run_stats ADD COLUMN category_other_flagged INTEGER DEFAULT 0;

-- ============================================
-- Create per-category approval stats view
-- ============================================

CREATE VIEW IF NOT EXISTS discovery_category_approval_rates AS
SELECT
  pack_id,
  'school' as category,
  category_school_flagged as flagged,
  (SELECT COUNT(*) FROM pending_approvals WHERE pack_id = discovery_run_stats.pack_id AND primary_category = 'school' AND approved = 1) as approved,
  CASE 
    WHEN category_school_flagged > 0 THEN ROUND(CAST((SELECT COUNT(*) FROM pending_approvals WHERE pack_id = discovery_run_stats.pack_id AND primary_category = 'school' AND approved = 1) AS REAL) / category_school_flagged * 100, 1)
    ELSE 0
  END as approval_rate_pct
FROM discovery_run_stats
WHERE category_school_flagged > 0
UNION ALL
SELECT
  pack_id,
  'sports_activities' as category,
  category_sports_flagged as flagged,
  (SELECT COUNT(*) FROM pending_approvals WHERE pack_id = discovery_run_stats.pack_id AND primary_category = 'sports_activities' AND approved = 1) as approved,
  CASE 
    WHEN category_sports_flagged > 0 THEN ROUND(CAST((SELECT COUNT(*) FROM pending_approvals WHERE pack_id = discovery_run_stats.pack_id AND primary_category = 'sports_activities' AND approved = 1) AS REAL) / category_sports_flagged * 100, 1)
    ELSE 0
  END as approval_rate_pct
FROM discovery_run_stats
WHERE category_sports_flagged > 0;
