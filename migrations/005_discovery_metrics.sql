-- Migration: Add discovery metrics instrumentation tables
-- Version: 005
-- Date: 2025-12-29

-- ============================================
-- Create discovery_run_stats table
-- Aggregates per-run metrics: volume, histogram, rejection reasons
-- ============================================

CREATE TABLE IF NOT EXISTS discovery_run_stats (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  pack_id TEXT NOT NULL,
  run_timestamp TEXT NOT NULL,
  
  -- Volume metrics
  scanned_count INTEGER NOT NULL DEFAULT 0,
  scored_count INTEGER NOT NULL DEFAULT 0,
  flagged_count INTEGER NOT NULL DEFAULT 0,
  sampled_for_review INTEGER NOT NULL DEFAULT 0,
  
  -- Confidence histogram (5 buckets: 0.0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
  histogram_very_low INTEGER NOT NULL DEFAULT 0,    -- [0.0, 0.2)
  histogram_low INTEGER NOT NULL DEFAULT 0,         -- [0.2, 0.4)
  histogram_medium INTEGER NOT NULL DEFAULT 0,      -- [0.4, 0.6)
  histogram_high INTEGER NOT NULL DEFAULT 0,        -- [0.6, 0.8)
  histogram_very_high INTEGER NOT NULL DEFAULT 0,   -- [0.8, 1.0]
  
  -- Rejection reasons (most common reasons emails were not flagged)
  rejection_reason_domain INTEGER NOT NULL DEFAULT 0,     -- Unknown domain
  rejection_reason_keyword_no_match INTEGER NOT NULL DEFAULT 0,  -- No keyword match
  rejection_reason_low_score INTEGER NOT NULL DEFAULT 0,   -- Below threshold
  rejection_reason_duplicate INTEGER NOT NULL DEFAULT 0,   -- Already seen
  rejection_reason_other INTEGER NOT NULL DEFAULT 0,       -- Other
  
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES discovery_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_run_stats_pack ON discovery_run_stats(pack_id);
CREATE INDEX IF NOT EXISTS idx_discovery_run_stats_timestamp ON discovery_run_stats(run_timestamp DESC);

-- ============================================
-- Create discovery_rejected_sample table
-- Sampled just-below-threshold emails for review (expires after 30 days)
-- Includes top 20 near-threshold + up to 10 random weak samples
-- ============================================

CREATE TABLE IF NOT EXISTS discovery_rejected_sample (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  relevance_score REAL NOT NULL,
  
  -- Sample category: helps understand what we're missing
  -- 'near_threshold' = scored 0.50-0.70 (just below default 0.75)
  -- 'weak_signal' = scored 0.30-0.50 (weak match)
  -- 'very_weak' = scored 0.10-0.30 (minimal match)
  sample_category TEXT NOT NULL,
  
  -- Why it was rejected
  rejection_reason TEXT,
  
  -- Flag if user marked this as a false negative ("I missed this!")
  marked_false_negative INTEGER NOT NULL DEFAULT 0,
  false_negative_at TEXT,
  
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,  -- 30 days from creation
  
  UNIQUE(session_id, message_id),
  FOREIGN KEY (session_id) REFERENCES discovery_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_rejected_sample_session ON discovery_rejected_sample(session_id);
CREATE INDEX IF NOT EXISTS idx_discovery_rejected_sample_false_neg ON discovery_rejected_sample(marked_false_negative);
CREATE INDEX IF NOT EXISTS idx_discovery_rejected_sample_expires ON discovery_rejected_sample(expires_at);

-- ============================================
-- Create discovery_false_negatives table
-- User-marked missed emails (ground truth for recall calculation)
-- ============================================

CREATE TABLE IF NOT EXISTS discovery_false_negatives (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  
  -- If we had sampled this email, what was the score?
  -- NULL if not sampled (user found it externally)
  sampled_score REAL,
  
  -- Why user says we missed it
  reason TEXT,
  
  -- User feedback
  marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(message_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_false_negatives_pack ON discovery_false_negatives(pack_id);
CREATE INDEX IF NOT EXISTS idx_discovery_false_negatives_marked ON discovery_false_negatives(marked_at DESC);

-- ============================================
-- Create discovery_metrics_summary view (for quick querying)
-- ============================================

CREATE VIEW IF NOT EXISTS discovery_metrics_summary AS
SELECT 
  drs.pack_id,
  drs.run_timestamp,
  drs.scanned_count,
  drs.flagged_count,
  ROUND(100.0 * drs.flagged_count / NULLIF(drs.scanned_count, 0), 1) as discovery_yield_pct,
  (drs.histogram_very_high + drs.histogram_high) as high_confidence_count,
  drs.sampled_for_review,
  (SELECT COUNT(*) FROM discovery_false_negatives WHERE pack_id = drs.pack_id) as false_negatives_count,
  drs.created_at
FROM discovery_run_stats drs
ORDER BY drs.run_timestamp DESC;
