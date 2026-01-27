/**
 * Database Migration Runner
 * Applies SQL migrations in order and tracks applied versions
 * Updated for libSQL/Turso async API
 */

import { Client } from '@libsql/client';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Migration {
  version: number;
  name: string;
  sql: string;
}

export class MigrationRunner {
  private client: Client;
  private migrationsPath: string;

  constructor(client: Client, migrationsPath?: string) {
    this.client = client;
    this.migrationsPath = migrationsPath || join(__dirname, '../../migrations');
  }

  /**
   * Run all pending migrations
   */
  public async migrate(): Promise<void> {
    console.log('Starting database migration...');

    // Ensure schema_migrations table exists
    await this.ensureMigrationsTable();

    const appliedVersions = await this.getAppliedVersions();
    const pendingMigrations = this.getPendingMigrations(appliedVersions);

    if (pendingMigrations.length === 0) {
      console.log('✓ Database is up to date. No migrations needed.');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s)`);

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    console.log('✓ All migrations completed successfully');
  }

  /**
   * Rollback to a specific version (for development)
   */
  public async rollbackTo(version: number): Promise<void> {
    console.warn(`⚠️  Rollback to version ${version} - this may cause data loss`);

    const appliedVersions = await this.getAppliedVersions();
    const toRollback = appliedVersions.filter((v) => v > version).sort((a, b) => b - a);

    if (toRollback.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    // For v1, we don't have rollback SQL files
    // This is a destructive operation: drop all tables and re-migrate
    console.warn('⚠️  Full rollback: dropping all tables...');

    const tables = [
      'pending_approvals',
      'approval_tokens',
      'audit_logs',
      'exceptions',
      'discovery_evidence',
      'discovery_sessions',
      'config_versions',
      'manual_edit_flags',
      'calendar_operations',
      'events',
      'processed_messages',
      'schema_migrations',
    ];

    for (const table of tables) {
      await this.client.execute(`DROP TABLE IF EXISTS ${table}`);
    }

    console.log('✓ All tables dropped. Run migrate() to reapply migrations.');
  }

  /**
   * Get current schema version
   */
  public async getCurrentVersion(): Promise<number> {
    const versions = await this.getAppliedVersions();
    return versions.length > 0 ? Math.max(...versions) : 0;
  }

  /**
   * Close database connection (no-op for libSQL)
   */
  public close(): void {
    // libSQL client doesn't need explicit close
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  private async getAppliedVersions(): Promise<number[]> {
    try {
      const result = await this.client.execute(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      return result.rows.map((row: any) => row.version as number);
    } catch (error) {
      return [];
    }
  }

  private getPendingMigrations(appliedVersions: number[]): Migration[] {
    let files: string[];
    try {
      files = readdirSync(this.migrationsPath)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    } catch (error) {
      console.warn('⚠️  Migrations directory not found:', this.migrationsPath);
      return [];
    }

    const migrations: Migration[] = [];

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        console.warn(`⚠️  Ignoring invalid migration file: ${file}`);
        continue;
      }

      const version = parseInt(match[1], 10);
      const name = match[2];

      if (!appliedVersions.includes(version)) {
        const sql = readFileSync(join(this.migrationsPath, file), 'utf-8');
        migrations.push({ version, name, sql });
      }
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  private async applyMigration(migration: Migration): Promise<void> {
    console.log(`  Applying migration ${migration.version}: ${migration.name}...`);

    try {
      // Split migration SQL into statements and execute each
      // libSQL doesn't support multiple statements in a single execute
      const statements = migration.sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        await this.client.execute(statement);
      }

      // Record migration (skip if already recorded by migration itself)
      const exists = await this.client.execute({
        sql: 'SELECT 1 FROM schema_migrations WHERE version = ?',
        args: [migration.version],
      });

      if (exists.rows.length === 0) {
        await this.client.execute({
          sql: 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          args: [migration.version, migration.name],
        });
      }

      console.log(`  ✓ Migration ${migration.version} applied successfully`);
    } catch (error) {
      console.error(`  ✗ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createClient } = await import('@libsql/client');

  const command = process.argv[2] || 'migrate';
  const dbPath = process.env.TURSO_DATABASE_URL || process.env.DATABASE_PATH || './data/fca.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // Determine if it's a local file or Turso URL
  const isLocalFile = !dbPath.startsWith('libsql://') && !dbPath.startsWith('https://');
  const client = createClient({
    url: isLocalFile ? `file:${dbPath}` : dbPath,
    authToken,
  });

  const runner = new MigrationRunner(client);

  try {
    switch (command) {
      case 'migrate':
        await runner.migrate();
        console.log(`Current schema version: ${await runner.getCurrentVersion()}`);
        break;
      case 'version':
        console.log(`Current schema version: ${await runner.getCurrentVersion()}`);
        break;
      case 'rollback':
        const version = parseInt(process.argv[3], 10);
        if (isNaN(version)) {
          console.error('Usage: npm run migrate rollback <version>');
          process.exit(1);
        }
        await runner.rollbackTo(version);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log('Available commands: migrate, version, rollback <version>');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    runner.close();
  }
}
