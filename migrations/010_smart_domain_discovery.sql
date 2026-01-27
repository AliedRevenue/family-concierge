-- Migration 010: Smart Domain Discovery
-- Purpose: Track suggested domains, rejections, and exploration runs

-- ============================================
-- Suggested Domains Table
-- Tracks discovered domains awaiting parent decision
-- ============================================
CREATE TABLE IF NOT EXISTS suggested_domains (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  domain TEXT NOT NULL,

  -- Discovery metadata
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  email_count INTEGER NOT NULL DEFAULT 0,

  -- Evidence: which kid names were mentioned
  matched_keywords TEXT NOT NULL, -- JSON array: ["Colin", "Henry"]

  -- Sample evidence (up to 5 message IDs)
  evidence_message_ids TEXT NOT NULL, -- JSON array

  -- Sample subjects for display
  sample_subjects TEXT, -- JSON array

  -- Confidence score (0.0-1.0)
  confidence REAL NOT NULL DEFAULT 0.5,

  -- Status: 'pending', 'approved', 'rejected'
  status TEXT NOT NULL DEFAULT 'pending',

  -- If approved
  approved_at TEXT,
  approved_by TEXT DEFAULT 'parent',

  -- If rejected
  rejected_at TEXT,
  rejected_by TEXT DEFAULT 'parent',
  rejection_reason TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(pack_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_suggested_domains_pack_status
  ON suggested_domains(pack_id, status);
CREATE INDEX IF NOT EXISTS idx_suggested_domains_domain
  ON suggested_domains(domain);

-- ============================================
-- Domain Exploration Runs Table
-- Tracks when broader Gmail queries are run
-- ============================================
CREATE TABLE IF NOT EXISTS domain_exploration_runs (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  run_at TEXT NOT NULL,

  -- Query used (e.g., "Colin OR Henry")
  query_used TEXT NOT NULL,

  -- Results
  emails_scanned INTEGER NOT NULL DEFAULT 0,
  new_domains_found INTEGER NOT NULL DEFAULT 0,
  suggestions_created INTEGER NOT NULL DEFAULT 0,

  -- Duration in ms
  duration_ms INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'completed', -- 'running', 'completed', 'failed'
  error TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_exploration_runs_pack
  ON domain_exploration_runs(pack_id, run_at DESC);

-- ============================================
-- Rejected Domains Table (permanent suppressions)
-- Separate from suggested_domains for cleaner queries
-- ============================================
CREATE TABLE IF NOT EXISTS rejected_domains (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  domain TEXT NOT NULL,

  rejected_at TEXT NOT NULL,
  rejected_by TEXT DEFAULT 'parent',
  reason TEXT NOT NULL,

  -- Original evidence when rejected
  original_email_count INTEGER,
  original_matched_keywords TEXT, -- JSON array

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(pack_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_rejected_domains_pack
  ON rejected_domains(pack_id);
CREATE INDEX IF NOT EXISTS idx_rejected_domains_domain
  ON rejected_domains(domain);
