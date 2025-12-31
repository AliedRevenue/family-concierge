/**
 * Database Migration Runner
 * Applies SQL migrations in order and tracks applied versions
 */

import Database from 'better-sqlite3';
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
  private db: Database.Database;
  private migrationsPath: string;
  private ownsConnection: boolean; // Track if we created this connection

  constructor(databasePath: string, migrationsPath?: string);
  constructor(db: Database.Database, migrationsPath?: string);
  constructor(dbOrPath: string | Database.Database, migrationsPath?: string) {
    if (typeof dbOrPath === 'string') {
      // Created our own connection
      this.db = new Database(dbOrPath);
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
      this.db.pragma('foreign_keys = ON'); // Enforce foreign key constraints
      this.ownsConnection = true;
    } else {
      // Using provided connection
      this.db = dbOrPath;
      this.ownsConnection = false;
    }
    
    this.migrationsPath = migrationsPath || join(__dirname, '../../migrations');
  }

  /**
   * Run all pending migrations
   */
  public migrate(): void {
    console.log('Starting database migration...');

    // Ensure schema_migrations table exists
    this.ensureMigrationsTable();

    const appliedVersions = this.getAppliedVersions();
    const pendingMigrations = this.getPendingMigrations(appliedVersions);

    if (pendingMigrations.length === 0) {
      console.log('✓ Database is up to date. No migrations needed.');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s)`);

    for (const migration of pendingMigrations) {
      this.applyMigration(migration);
    }

    console.log('✓ All migrations completed successfully');
  }

  /**
   * Rollback to a specific version (for development)
   */
  public rollbackTo(version: number): void {
    console.warn(`⚠️  Rollback to version ${version} - this may cause data loss`);
    
    const appliedVersions = this.getAppliedVersions();
    const toRollback = appliedVersions.filter((v) => v > version).sort((a, b) => b - a);

    if (toRollback.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    // For v1, we don't have rollback SQL files
    // This is a destructive operation: drop all tables and re-migrate
    console.warn('⚠️  Full rollback: dropping all tables...');
    
    this.db.exec('DROP TABLE IF EXISTS pending_approvals');
    this.db.exec('DROP TABLE IF EXISTS approval_tokens');
    this.db.exec('DROP TABLE IF EXISTS audit_logs');
    this.db.exec('DROP TABLE IF EXISTS exceptions');
    this.db.exec('DROP TABLE IF EXISTS discovery_evidence');
    this.db.exec('DROP TABLE IF EXISTS discovery_sessions');
    this.db.exec('DROP TABLE IF EXISTS config_versions');
    this.db.exec('DROP TABLE IF EXISTS manual_edit_flags');
    this.db.exec('DROP TABLE IF EXISTS calendar_operations');
    this.db.exec('DROP TABLE IF EXISTS events');
    this.db.exec('DROP TABLE IF EXISTS processed_messages');
    this.db.exec('DROP TABLE IF EXISTS schema_migrations');

    console.log('✓ All tables dropped. Run migrate() to reapply migrations.');
  }

  /**
   * Get current schema version
   */
  public getCurrentVersion(): number {
    const versions = this.getAppliedVersions();
    return versions.length > 0 ? Math.max(...versions) : 0;
  }

  /**
   * Close database connection (only if we created it)
   */
  public close(): void {
    if (this.ownsConnection) {
      this.db.close();
    }
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  private getAppliedVersions(): number[] {
    try {
      const rows = this.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
      return rows.map((row: any) => row.version);
    } catch (error) {
      return [];
    }
  }

  private getPendingMigrations(appliedVersions: number[]): Migration[] {
    const files = readdirSync(this.migrationsPath)
      .filter((f) => f.endsWith('.sql'))
      .sort();

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

  private applyMigration(migration: Migration): void {
    console.log(`  Applying migration ${migration.version}: ${migration.name}...`);

    const transaction = this.db.transaction(() => {
      // Execute migration SQL
      this.db.exec(migration.sql);

      // Record migration (skip if already recorded by migration itself)
      const exists = this.db
        .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
        .get(migration.version);

      if (!exists) {
        this.db
          .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
          .run(migration.version, migration.name);
      }
    });

    try {
      transaction();
      console.log(`  ✓ Migration ${migration.version} applied successfully`);
    } catch (error) {
      console.error(`  ✗ Migration ${migration.version} failed:`, error);
      throw error;
    }
  }
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'migrate';
  const dbPath = process.env.DATABASE_PATH || './data/fca.db';

  const runner = new MigrationRunner(dbPath);

  try {
    switch (command) {
      case 'migrate':
        runner.migrate();
        console.log(`Current schema version: ${runner.getCurrentVersion()}`);
        break;
      case 'version':
        console.log(`Current schema version: ${runner.getCurrentVersion()}`);
        break;
      case 'rollback':
        const version = parseInt(process.argv[3], 10);
        if (isNaN(version)) {
          console.error('Usage: npm run migrate rollback <version>');
          process.exit(1);
        }
        runner.rollbackTo(version);
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
