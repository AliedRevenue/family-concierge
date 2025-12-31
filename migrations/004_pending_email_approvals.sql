-- Migration: Add pending email approvals table
-- Version: 004
-- Date: 2025-12-29

-- ============================================
-- Create pending_approvals table
-- For emails discovered as relevant but pending parent approval
-- ============================================

CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  relevance_score REAL NOT NULL,
  from_email TEXT,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  action TEXT, -- 'approve', 'reject', or NULL if pending
  UNIQUE(message_id, pack_id)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pending_approvals_pack ON pending_approvals(pack_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_approved ON pending_approvals(approved);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_created ON pending_approvals(created_at DESC);
