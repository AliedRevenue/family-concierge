/**
 * Run migrations endpoint - call once to set up the database
 */

import { Request, Response } from 'express';
import { createClient } from '@libsql/client';

// Embedded migrations for serverless (since we can't read files)
const MIGRATIONS = [
  {
    version: 1,
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        extraction_status TEXT NOT NULL CHECK (extraction_status IN ('success', 'failed', 'skipped')),
        events_extracted INTEGER NOT NULL DEFAULT 0,
        fingerprints TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_processed_messages_pack_id ON processed_messages(pack_id);
      CREATE INDEX IF NOT EXISTS idx_processed_messages_processed_at ON processed_messages(processed_at);

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

      CREATE TABLE IF NOT EXISTS config_versions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        config TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS pending_approvals (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        subject TEXT,
        from_email TEXT,
        snippet TEXT,
        discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
        approved INTEGER NOT NULL DEFAULT 0,
        approved_at TEXT,
        events_json TEXT,
        person TEXT,
        email_category TEXT,
        email_body TEXT
      );

      CREATE TABLE IF NOT EXISTS approval_tokens (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        action TEXT
      );

      CREATE TABLE IF NOT EXISTS notification_recipients (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        notification_types TEXT NOT NULL DEFAULT '["digests"]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS dismissed_items (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        dismissed_by TEXT,
        dismissed_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS email_read_items (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_id TEXT NOT NULL,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(email, item_type, item_id)
      );

      CREATE TABLE IF NOT EXISTS dashboard_view_tokens (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
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
      const statements = migration.sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          await client.execute(statement);
        } catch (error) {
          results.push(`  Error: ${error instanceof Error ? error.message : 'Unknown'}`);
          // Continue with other statements
        }
      }

      // Record migration
      await client.execute({
        sql: 'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
        args: [migration.version, migration.name]
      });

      results.push(`Migration ${migration.version} complete`);
    }

    // Verify tables
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tables = tablesResult.rows.map(r => r.name);

    res.status(200).json({
      status: 'ok',
      results,
      tables,
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
