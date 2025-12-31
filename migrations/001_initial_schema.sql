-- Migration: 001_initial_schema
-- Description: Core tables for Family Concierge Agent
-- Created: 2025-12-27

-- ========================================
-- Processed Messages
-- ========================================
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    extraction_status TEXT NOT NULL CHECK (extraction_status IN ('success', 'failed', 'skipped')),
    events_extracted INTEGER NOT NULL DEFAULT 0,
    fingerprints TEXT, -- JSON array of fingerprints
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_processed_messages_pack_id ON processed_messages(pack_id);
CREATE INDEX idx_processed_messages_processed_at ON processed_messages(processed_at);

-- ========================================
-- Events
-- ========================================
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    source_message_id TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    calendar_event_id TEXT,
    event_intent TEXT NOT NULL, -- JSON serialized EventIntent
    confidence REAL NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'pending_approval', 'approved', 'created', 'updated', 'flagged', 'failed'
    )),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_synced_at TEXT,
    manually_edited INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    FOREIGN KEY (source_message_id) REFERENCES processed_messages(message_id)
);

CREATE INDEX idx_events_fingerprint ON events(fingerprint);
CREATE INDEX idx_events_source_message_id ON events(source_message_id);
CREATE INDEX idx_events_pack_id ON events(pack_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_calendar_event_id ON events(calendar_event_id);
CREATE INDEX idx_events_created_at ON events(created_at);

-- ========================================
-- Calendar Operations
-- ========================================
CREATE TABLE IF NOT EXISTS calendar_operations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('create', 'update', 'flag', 'skip')),
    event_fingerprint TEXT NOT NULL,
    event_intent TEXT NOT NULL, -- JSON serialized EventIntent
    reason TEXT NOT NULL,
    requires_approval INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    executed_at TEXT,
    status TEXT NOT NULL CHECK (status IN (
        'pending', 'approved', 'rejected', 'executed', 'failed'
    )),
    error TEXT,
    calendar_event_id TEXT,
    FOREIGN KEY (event_fingerprint) REFERENCES events(fingerprint)
);

CREATE INDEX idx_calendar_operations_status ON calendar_operations(status);
CREATE INDEX idx_calendar_operations_event_fingerprint ON calendar_operations(event_fingerprint);
CREATE INDEX idx_calendar_operations_created_at ON calendar_operations(created_at);

-- ========================================
-- Manual Edit Flags
-- ========================================
CREATE TABLE IF NOT EXISTS manual_edit_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_fingerprint TEXT NOT NULL,
    calendar_event_id TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    changes TEXT NOT NULL, -- JSON serialized changes
    reconciliation_policy TEXT NOT NULL CHECK (reconciliation_policy IN (
        'respect_manual', 'flag_conflict'
    )),
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT,
    FOREIGN KEY (event_fingerprint) REFERENCES events(fingerprint)
);

CREATE INDEX idx_manual_edit_flags_event_fingerprint ON manual_edit_flags(event_fingerprint);
CREATE INDEX idx_manual_edit_flags_resolved ON manual_edit_flags(resolved);

-- ========================================
-- Configuration Versions
-- ========================================
CREATE TABLE IF NOT EXISTS config_versions (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    config TEXT NOT NULL, -- JSON serialized AgentConfig
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT NOT NULL CHECK (created_by IN ('system', 'user', 'discovery')),
    previous_version_id TEXT,
    FOREIGN KEY (previous_version_id) REFERENCES config_versions(id)
);

CREATE INDEX idx_config_versions_version ON config_versions(version);
CREATE INDEX idx_config_versions_created_at ON config_versions(created_at);

-- ========================================
-- Discovery Sessions
-- ========================================
CREATE TABLE IF NOT EXISTS discovery_sessions (
    id TEXT PRIMARY KEY,
    pack_id TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    emails_scanned INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    output TEXT, -- JSON serialized DiscoveryOutput
    error TEXT
);

CREATE INDEX idx_discovery_sessions_pack_id ON discovery_sessions(pack_id);
CREATE INDEX idx_discovery_sessions_status ON discovery_sessions(status);
CREATE INDEX idx_discovery_sessions_started_at ON discovery_sessions(started_at);

-- ========================================
-- Discovery Evidence
-- ========================================
CREATE TABLE IF NOT EXISTS discovery_evidence (
    id TEXT PRIMARY KEY,
    discovery_session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    from_address TEXT NOT NULL,
    date TEXT NOT NULL,
    snippet TEXT,
    relevance_score REAL NOT NULL,
    matched_rules TEXT, -- JSON array
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (discovery_session_id) REFERENCES discovery_sessions(id)
);

CREATE INDEX idx_discovery_evidence_session_id ON discovery_evidence(discovery_session_id);
CREATE INDEX idx_discovery_evidence_message_id ON discovery_evidence(message_id);

-- ========================================
-- Exceptions / Errors
-- ========================================
CREATE TABLE IF NOT EXISTS exceptions (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    type TEXT NOT NULL CHECK (type IN (
        'extraction_error', 'calendar_error', 'duplicate_detected', 'api_error', 'other'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    message TEXT NOT NULL,
    context TEXT NOT NULL, -- JSON serialized context
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT
);

CREATE INDEX idx_exceptions_type ON exceptions(type);
CREATE INDEX idx_exceptions_severity ON exceptions(severity);
CREATE INDEX idx_exceptions_timestamp ON exceptions(timestamp);
CREATE INDEX idx_exceptions_resolved ON exceptions(resolved);

-- ========================================
-- Audit Logs
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL, -- JSON serialized details
    message_id TEXT,
    event_fingerprint TEXT,
    user_id TEXT
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_level ON audit_logs(level);
CREATE INDEX idx_audit_logs_module ON audit_logs(module);
CREATE INDEX idx_audit_logs_message_id ON audit_logs(message_id);
CREATE INDEX idx_audit_logs_event_fingerprint ON audit_logs(event_fingerprint);

-- ========================================
-- Schema Version Tracking
-- ========================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO schema_migrations (version, name) VALUES (1, '001_initial_schema');
