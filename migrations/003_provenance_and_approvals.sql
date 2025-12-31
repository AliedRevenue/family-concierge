-- Migration: Add provenance tracking and approval system
-- Version: 003
-- Date: 2025-12-28

-- ============================================
-- Add provenance column to events table
-- ============================================

ALTER TABLE events ADD COLUMN provenance TEXT; -- JSON-serialized ExtractionProvenance

-- ============================================
-- Create approval_tokens table
-- ============================================

CREATE TABLE IF NOT EXISTS approval_tokens (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0, -- SQLite boolean (0/1)
  approved_at TEXT,
  used INTEGER NOT NULL DEFAULT 0, -- Prevent double-use (0/1)
  FOREIGN KEY (operation_id) REFERENCES calendar_operations(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_approval_tokens_operation ON approval_tokens(operation_id);
CREATE INDEX IF NOT EXISTS idx_approval_tokens_expires ON approval_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_approval_tokens_used ON approval_tokens(used);
