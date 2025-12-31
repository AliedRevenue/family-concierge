-- Migration: Add person assignment fields
-- Version: 007
-- Date: 2025-12-29

-- ============================================
-- Add person identification and assignment tracking
-- ============================================

-- Add columns to pending_approvals
ALTER TABLE pending_approvals ADD COLUMN person TEXT; -- Family member name (e.g. "Emma", "James", "Family/Shared")
ALTER TABLE pending_approvals ADD COLUMN assignment_reason TEXT; -- How was person assigned? (exact, alias, group, shared_default, user_override)

-- Index for efficient person-based queries
CREATE INDEX IF NOT EXISTS idx_pending_approvals_person ON pending_approvals(person);
