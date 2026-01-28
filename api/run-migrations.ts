/**
 * Run migrations endpoint - call once to set up the database
 * This contains a complete schema matching what the app expects
 */

import { Request, Response } from 'express';
import { createClient } from '@libsql/client';

// Complete migrations for serverless - includes all columns needed by the dashboard
const MIGRATIONS = [
  {
    version: 1,
    name: 'complete_schema',
    sql: `
      -- Schema migrations tracking
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Processed messages
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        extraction_status TEXT NOT NULL,
        events_extracted INTEGER NOT NULL DEFAULT 0,
        fingerprints TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_processed_messages_pack_id ON processed_messages(pack_id);
      CREATE INDEX IF NOT EXISTS idx_processed_messages_processed_at ON processed_messages(processed_at);

      -- Events
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL UNIQUE,
        source_message_id TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        calendar_event_id TEXT,
        event_intent TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_synced_at TEXT,
        manually_edited INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_events_source_message_id ON events(source_message_id);
      CREATE INDEX IF NOT EXISTS idx_events_pack_id ON events(pack_id);
      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

      -- Calendar operations
      CREATE TABLE IF NOT EXISTS calendar_operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        event_fingerprint TEXT NOT NULL,
        event_intent TEXT NOT NULL,
        reason TEXT NOT NULL,
        requires_approval INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        executed_at TEXT,
        status TEXT NOT NULL,
        error TEXT,
        calendar_event_id TEXT
      );

      -- Config versions
      CREATE TABLE IF NOT EXISTS config_versions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        config TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT NOT NULL
      );

      -- Audit logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        message_id TEXT,
        event_fingerprint TEXT,
        user_id TEXT
      );

      -- Pending approvals (complete with all columns)
      CREATE TABLE IF NOT EXISTS pending_approvals (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        relevance_score REAL,
        subject TEXT,
        from_name TEXT,
        from_email TEXT,
        snippet TEXT,
        discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
        approved INTEGER NOT NULL DEFAULT 0,
        approved_at TEXT,
        events_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        -- Person assignment (migration 007)
        person TEXT,
        assignment_reason TEXT,
        -- Email categories (migration 006)
        primary_category TEXT,
        secondary_categories TEXT,
        category_scores TEXT,
        save_reasons TEXT,
        -- Email body (migration 013)
        email_body_text TEXT,
        email_body_html TEXT,
        -- Dashboard restructure (migration 014)
        item_type TEXT DEFAULT 'unknown',
        -- AI classification (migration 015)
        obligation_date TEXT,
        classification_confidence REAL,
        classification_reasoning TEXT,
        classified_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_pack ON pending_approvals(pack_id);
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_approved ON pending_approvals(approved);
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_person ON pending_approvals(person);
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_item_type ON pending_approvals(item_type);
      CREATE INDEX IF NOT EXISTS idx_pending_approvals_obligation_date ON pending_approvals(obligation_date);

      -- Approval tokens
      CREATE TABLE IF NOT EXISTS approval_tokens (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        action TEXT
      );

      -- Notification recipients
      CREATE TABLE IF NOT EXISTS notification_recipients (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        notification_types TEXT NOT NULL DEFAULT '["digests"]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Dismissed items
      CREATE TABLE IF NOT EXISTS dismissed_items (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        dismissed_by TEXT,
        dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT,
        person TEXT,
        original_subject TEXT,
        original_from TEXT,
        original_date TEXT,
        pack_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dismissed_items_item_id ON dismissed_items(item_id);
      CREATE INDEX IF NOT EXISTS idx_dismissed_items_person ON dismissed_items(person);

      -- Email read items
      CREATE TABLE IF NOT EXISTS email_read_items (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        item_type TEXT NOT NULL DEFAULT 'pending_approval',
        item_id TEXT NOT NULL,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(email, item_type, item_id)
      );

      -- Dashboard view tokens
      CREATE TABLE IF NOT EXISTS dashboard_view_tokens (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      -- Summary cache for AI-generated summaries
      CREATE TABLE IF NOT EXISTS summary_cache (
        id TEXT PRIMARY KEY,
        cache_key TEXT NOT NULL UNIQUE,
        summary_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        item_count INTEGER NOT NULL,
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_summary_cache_key ON summary_cache(cache_key);
      CREATE INDEX IF NOT EXISTS idx_summary_cache_expires ON summary_cache(expires_at);

      -- Discovery sessions
      CREATE TABLE IF NOT EXISTS discovery_sessions (
        id TEXT PRIMARY KEY,
        pack_id TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        emails_scanned INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT
      );

      -- Exceptions
      CREATE TABLE IF NOT EXISTS exceptions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolved_at TEXT
      );
    `
  }
];

export default async function handler(req: Request, res: Response) {
  try {
    const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    if (!dbUrl) {
      res.status(500).json({ error: 'TURSO_DATABASE_URL not set' });
      return;
    }

    const client = createClient({ url: dbUrl, authToken });
    const results: string[] = [];

    // Check if we need to reset (force parameter)
    const forceReset = req.query.force === 'true';

    if (forceReset) {
      results.push('Force reset requested - dropping all tables...');
      const tables = [
        'summary_cache', 'email_read_items', 'dashboard_view_tokens',
        'dismissed_items', 'notification_recipients', 'approval_tokens',
        'pending_approvals', 'calendar_operations', 'events',
        'discovery_sessions', 'exceptions', 'audit_logs',
        'config_versions', 'processed_messages', 'schema_migrations'
      ];
      for (const table of tables) {
        try {
          await client.execute(`DROP TABLE IF EXISTS ${table}`);
          results.push(`  Dropped ${table}`);
        } catch (e) {
          results.push(`  Error dropping ${table}: ${e}`);
        }
      }
    }

    // Get applied migrations
    let appliedVersions: number[] = [];
    try {
      const result = await client.execute('SELECT version FROM schema_migrations');
      appliedVersions = result.rows.map(r => r.version as number);
    } catch (e) {
      results.push('schema_migrations table does not exist, will create');
    }

    // Apply pending migrations
    for (const migration of MIGRATIONS) {
      if (appliedVersions.includes(migration.version)) {
        results.push(`Migration ${migration.version} already applied`);
        continue;
      }

      results.push(`Applying migration ${migration.version}: ${migration.name}...`);

      // Split and execute statements
      // First split on semicolons, then for each statement:
      // - Remove comment-only lines (lines starting with --)
      // - Keep the actual SQL
      const statements = migration.sql
        .split(';')
        .map(s => {
          // Remove comment-only lines but keep inline comments
          const lines = s.split('\n');
          const sqlLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          });
          return sqlLines.join('\n').trim();
        })
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          await client.execute(statement);
        } catch (error) {
          results.push(`  Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      // Record migration
      try {
        await client.execute({
          sql: 'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
          args: [migration.version, migration.name]
        });
      } catch (e) {
        results.push(`  Error recording migration: ${e}`);
      }

      results.push(`Migration ${migration.version} complete`);
    }

    // Verify tables and columns
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tables = tablesResult.rows.map(r => r.name);

    // Check pending_approvals columns
    let pendingApprovalsCols: string[] = [];
    try {
      const colsResult = await client.execute("PRAGMA table_info(pending_approvals)");
      pendingApprovalsCols = colsResult.rows.map(r => r.name as string);
    } catch (e) {
      results.push(`Error checking columns: ${e}`);
    }

    res.status(200).json({
      status: 'ok',
      results,
      tables,
      pendingApprovalsColumns: pendingApprovalsCols,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined
    });
  }
}
