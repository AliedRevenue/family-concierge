/**
 * Database Layer - Provides typed access to SQLite via Turso/libSQL
 * All database operations go through this module
 *
 * Supports both:
 * - Local file-based SQLite (for development)
 * - Turso cloud database (for production)
 */

import { createClient, Client, InStatement } from '@libsql/client';
import { v4 as uuid } from 'uuid';
import type {
  ProcessedMessage,
  PersistedEvent,
  CalendarOperation,
  ConfigVersion,
  DiscoverySession,
  Exception,
  AuditLog,
  ForwardedMessage,
  ApprovalToken,
} from '../types/index.js';

export class DatabaseClient {
  private client: Client;

  constructor(url: string, authToken?: string) {
    // Support both local files and Turso URLs
    // Local: file:./data/fca.db or just ./data/fca.db
    // Turso: libsql://your-db.turso.io
    const isLocalFile = !url.startsWith('libsql://') && !url.startsWith('https://');

    this.client = createClient({
      url: isLocalFile ? `file:${url}` : url,
      authToken: authToken,
    });
  }

  /**
   * Get the underlying database client
   */
  getConnection(): Client {
    return this.client;
  }

  /**
   * Execute raw SQL (for migrations)
   */
  async execute(sql: string, args?: any[]): Promise<any> {
    return this.client.execute({ sql, args: args || [] });
  }

  /**
   * Execute multiple statements in a batch
   */
  async batch(statements: InStatement[]): Promise<any[]> {
    return this.client.batch(statements);
  }

  /**
   * Build a person filter that handles comma-separated multi-person assignments
   */
  private buildPersonFilter(person: string, columnName: string = 'pa.person'): { sql: string; args: string[] } {
    const sql = `AND (
      ${columnName} = ?
      OR ${columnName} LIKE ? || ', %'
      OR ${columnName} LIKE '%, ' || ?
      OR ${columnName} LIKE '%, ' || ? || ', %'
    )`;
    return { sql, args: [person, person, person, person] };
  }

  /**
   * Auto-heal: If category_preferences table exists with bad FK constraint, drop and recreate
   */
  async healCategoryPreferencesSchema(): Promise<void> {
    try {
      const tableCheck = await this.client.execute(`
        SELECT COUNT(*) as cnt FROM sqlite_master
        WHERE type='table' AND name='category_preferences'
      `);

      if ((tableCheck.rows[0] as any)?.cnt === 0) {
        return;
      }

      const fkCheck = await this.client.execute(`
        PRAGMA foreign_key_list(category_preferences)
      `);

      if (fkCheck.rows.length > 0) {
        console.log('🔧 Detected bad FK constraint on category_preferences. Healing...');

        await this.client.execute('DROP TABLE IF EXISTS category_preferences');

        await this.client.execute(`
          CREATE TABLE category_preferences (
            id TEXT PRIMARY KEY,
            pack_id TEXT NOT NULL UNIQUE,
            enabled_categories TEXT NOT NULL,
            sensitivity_map TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await this.client.execute(`
          CREATE INDEX IF NOT EXISTS idx_category_preferences_pack ON category_preferences(pack_id)
        `);

        console.log('✅ Schema healed. category_preferences table recreated without FK.');
      }
    } catch (e) {
      console.log('[INFO] Schema healing skipped:', e instanceof Error ? e.message : String(e));
    }
  }

  // ========================================
  // Processed Messages
  // ========================================

  async insertProcessedMessage(message: ProcessedMessage): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO processed_messages (
          message_id, processed_at, pack_id, extraction_status,
          events_extracted, fingerprints, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        message.messageId,
        message.processedAt,
        message.packId,
        message.extractionStatus,
        message.eventsExtracted,
        JSON.stringify(message.fingerprints),
        message.error || null
      ]
    });
  }

  async getProcessedMessage(messageId: string): Promise<ProcessedMessage | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM processed_messages WHERE message_id = ?`,
      args: [messageId]
    });
    const row = result.rows[0];
    return row ? this.rowToProcessedMessage(row) : undefined;
  }

  async getRecentProcessedMessages(limit: number = 100): Promise<ProcessedMessage[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM processed_messages ORDER BY processed_at DESC LIMIT ?`,
      args: [limit]
    });
    return result.rows.map((row: any) => this.rowToProcessedMessage(row));
  }

  // ========================================
  // Events
  // ========================================

  async insertEvent(event: PersistedEvent): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO events (
          id, fingerprint, source_message_id, pack_id, calendar_event_id,
          event_intent, confidence, status, created_at, updated_at,
          last_synced_at, manually_edited, error, provenance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        event.id,
        event.fingerprint,
        event.sourceMessageId,
        event.packId,
        event.calendarEventId || null,
        JSON.stringify(event.eventIntent),
        event.confidence,
        event.status,
        event.createdAt,
        event.updatedAt,
        event.lastSyncedAt || null,
        event.manuallyEdited ? 1 : 0,
        event.error || null,
        event.provenance ? JSON.stringify(event.provenance) : null
      ]
    });
  }

  async updateEvent(fingerprint: string, updates: Partial<PersistedEvent>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.calendarEventId) {
      fields.push('calendar_event_id = ?');
      values.push(updates.calendarEventId);
    }
    if (updates.lastSyncedAt) {
      fields.push('last_synced_at = ?');
      values.push(updates.lastSyncedAt);
    }
    if (updates.manuallyEdited !== undefined) {
      fields.push('manually_edited = ?');
      values.push(updates.manuallyEdited ? 1 : 0);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error || null);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(fingerprint);

    await this.client.execute({
      sql: `UPDATE events SET ${fields.join(', ')} WHERE fingerprint = ?`,
      args: values
    });
  }

  async getEventByFingerprint(fingerprint: string): Promise<PersistedEvent | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM events WHERE fingerprint = ?',
      args: [fingerprint]
    });
    const row = result.rows[0];
    return row ? this.rowToPersistedEvent(row) : undefined;
  }

  async getEventsByStatus(status: PersistedEvent['status']): Promise<PersistedEvent[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM events WHERE status = ? ORDER BY created_at DESC',
      args: [status]
    });
    return result.rows.map((row: any) => this.rowToPersistedEvent(row));
  }

  async getAllEvents(): Promise<PersistedEvent[]> {
    const result = await this.client.execute('SELECT * FROM events ORDER BY created_at DESC');
    return result.rows.map((row: any) => this.rowToPersistedEvent(row));
  }

  async findEventsByDateRange(startDate: string, endDate: string): Promise<PersistedEvent[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM events
        WHERE json_extract(event_intent, '$.startDateTime') BETWEEN ? AND ?
        ORDER BY json_extract(event_intent, '$.startDateTime')
      `,
      args: [startDate, endDate]
    });
    return result.rows.map((row: any) => this.rowToPersistedEvent(row));
  }

  async getUpcomingEvents(days: number = 14): Promise<PersistedEvent[]> {
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.findEventsByDateRange(now.toISOString(), endDate.toISOString());
  }

  async getEmailsWorthReading(packId?: string, limit: number = 10): Promise<any[]> {
    let sql = `
      SELECT pa.*,
        CAST((julianday('now') - julianday(pa.created_at)) AS INTEGER) as days_ago
      FROM pending_approvals pa
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE pa.approved = 0
        AND di.id IS NULL
    `;
    const args: any[] = [];

    if (packId) {
      sql += ` AND pa.pack_id = ?`;
      args.push(packId);
    }

    sql += ` ORDER BY pa.relevance_score DESC, pa.created_at DESC LIMIT ?`;
    args.push(limit);

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  async findDuplicateEvents(fingerprint: string, dateKey: string, windowDays: number): Promise<PersistedEvent[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM events
        WHERE fingerprint = ?
        AND date(json_extract(event_intent, '$.startDateTime')) BETWEEN
            date(?, '-' || ? || ' days') AND date(?, '+' || ? || ' days')
      `,
      args: [fingerprint, dateKey, windowDays, dateKey, windowDays]
    });
    return result.rows.map((row: any) => this.rowToPersistedEvent(row));
  }

  // ========================================
  // Calendar Operations
  // ========================================

  async insertCalendarOperation(operation: CalendarOperation): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO calendar_operations (
          id, type, event_fingerprint, event_intent, reason,
          requires_approval, created_at, executed_at, status, error, calendar_event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        operation.id,
        operation.type,
        operation.eventFingerprint,
        JSON.stringify(operation.eventIntent),
        operation.reason,
        operation.requiresApproval ? 1 : 0,
        operation.createdAt,
        operation.executedAt || null,
        operation.status,
        operation.error || null,
        operation.calendarEventId || null
      ]
    });
  }

  async updateCalendarOperation(id: string, updates: Partial<CalendarOperation>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.executedAt) {
      fields.push('executed_at = ?');
      values.push(updates.executedAt);
    }
    if (updates.calendarEventId) {
      fields.push('calendar_event_id = ?');
      values.push(updates.calendarEventId);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error || null);
    }

    values.push(id);

    await this.client.execute({
      sql: `UPDATE calendar_operations SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  async getPendingOperations(): Promise<CalendarOperation[]> {
    const result = await this.client.execute(`
      SELECT * FROM calendar_operations
      WHERE status = 'pending' OR status = 'approved'
      ORDER BY created_at ASC
    `);
    return result.rows.map((row: any) => this.rowToCalendarOperation(row));
  }

  async getCalendarOperation(id: string): Promise<CalendarOperation | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM calendar_operations WHERE id = ?`,
      args: [id]
    });
    const row = result.rows[0];
    return row ? this.rowToCalendarOperation(row) : undefined;
  }

  async getCalendarOperationByFingerprint(fingerprint: string): Promise<CalendarOperation | undefined> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM calendar_operations
        WHERE event_fingerprint = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      args: [fingerprint]
    });
    const row = result.rows[0];
    return row ? this.rowToCalendarOperation(row) : undefined;
  }

  // ========================================
  // Config Versions
  // ========================================

  async insertConfigVersion(configVersion: ConfigVersion): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO config_versions (id, version, config, created_at, created_by, previous_version_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        configVersion.id,
        configVersion.version,
        JSON.stringify(configVersion.config),
        configVersion.createdAt,
        configVersion.createdBy,
        configVersion.previousVersionId || null
      ]
    });
  }

  async getLatestConfig(): Promise<ConfigVersion | undefined> {
    const result = await this.client.execute(`
      SELECT * FROM config_versions
      ORDER BY version DESC
      LIMIT 1
    `);
    const row = result.rows[0];
    return row ? this.rowToConfigVersion(row) : undefined;
  }

  async getConfigByVersion(version: number): Promise<ConfigVersion | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM config_versions WHERE version = ?',
      args: [version]
    });
    const row = result.rows[0];
    return row ? this.rowToConfigVersion(row) : undefined;
  }

  // ========================================
  // Discovery
  // ========================================

  async insertDiscoverySession(session: DiscoverySession): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO discovery_sessions (id, pack_id, started_at, completed_at, emails_scanned, status, output, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        session.id,
        session.packId,
        session.startedAt,
        session.completedAt || null,
        session.emailsScanned,
        session.status,
        JSON.stringify(session.output),
        null
      ]
    });
  }

  async updateDiscoverySession(id: string, updates: Partial<DiscoverySession>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.completedAt) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }
    if (updates.emailsScanned !== undefined) {
      fields.push('emails_scanned = ?');
      values.push(updates.emailsScanned);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.output) {
      fields.push('output = ?');
      values.push(JSON.stringify(updates.output));
    }

    values.push(id);

    await this.client.execute({
      sql: `UPDATE discovery_sessions SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  async getDiscoverySession(id: string): Promise<DiscoverySession | undefined> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM discovery_sessions WHERE id = ?',
      args: [id]
    });
    const row = result.rows[0];
    return row ? this.rowToDiscoverySession(row) : undefined;
  }

  // ========================================
  // Exceptions
  // ========================================

  async insertException(exception: Exception): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO exceptions (id, timestamp, type, severity, message, context, resolved, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        exception.id,
        exception.timestamp,
        exception.type,
        exception.severity,
        exception.message,
        JSON.stringify(exception.context),
        exception.resolved ? 1 : 0,
        exception.resolvedAt || null
      ]
    });
  }

  async getUnresolvedExceptions(): Promise<Exception[]> {
    const result = await this.client.execute(`
      SELECT * FROM exceptions
      WHERE resolved = 0
      ORDER BY timestamp DESC
    `);
    return result.rows.map((row: any) => this.rowToException(row));
  }

  // ========================================
  // Audit Logs
  // ========================================

  async insertAuditLog(log: AuditLog): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO audit_logs (timestamp, level, module, action, details, message_id, event_fingerprint, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        log.timestamp,
        log.level,
        log.module,
        log.action,
        JSON.stringify(log.details),
        log.messageId || null,
        log.eventFingerprint || null,
        log.userId || null
      ]
    });
  }

  // ========================================
  // Forwarded Messages
  // ========================================

  async insertForwardedMessage(message: ForwardedMessage): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO forwarded_messages (
          id, source_message_id, forwarded_at, forwarded_to, pack_id, reason, conditions, success, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        message.id,
        message.sourceMessageId,
        message.forwardedAt,
        JSON.stringify(message.forwardedTo),
        message.packId,
        message.reason,
        JSON.stringify(message.conditions),
        message.success ? 1 : 0,
        message.error || null
      ]
    });
  }

  async getForwardedMessage(sourceMessageId: string): Promise<ForwardedMessage | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM forwarded_messages WHERE source_message_id = ?`,
      args: [sourceMessageId]
    });
    const row = result.rows[0];
    return row ? this.rowToForwardedMessage(row) : undefined;
  }

  async getRecentForwardedMessages(limit: number = 100): Promise<ForwardedMessage[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM forwarded_messages ORDER BY forwarded_at DESC LIMIT ?`,
      args: [limit]
    });
    return result.rows.map((row: any) => this.rowToForwardedMessage(row));
  }

  async getForwardedMessagesByDateRange(startDate: string, endDate: string): Promise<ForwardedMessage[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM forwarded_messages
        WHERE forwarded_at >= ? AND forwarded_at <= ?
        ORDER BY forwarded_at DESC
      `,
      args: [startDate, endDate]
    });
    return result.rows.map((row: any) => this.rowToForwardedMessage(row));
  }

  // ========================================
  // Utilities
  // ========================================

  close(): void {
    // libSQL client doesn't need explicit close in most cases
  }

  // ========================================
  // Row Mappers
  // ========================================

  private rowToProcessedMessage(row: any): ProcessedMessage {
    return {
      messageId: row.message_id,
      processedAt: row.processed_at,
      packId: row.pack_id,
      extractionStatus: row.extraction_status,
      eventsExtracted: row.events_extracted,
      fingerprints: JSON.parse(row.fingerprints || '[]'),
      error: row.error || undefined,
    };
  }

  private rowToPersistedEvent(row: any): PersistedEvent {
    return {
      id: row.id,
      fingerprint: row.fingerprint,
      sourceMessageId: row.source_message_id,
      packId: row.pack_id,
      calendarEventId: row.calendar_event_id || undefined,
      eventIntent: JSON.parse(row.event_intent),
      confidence: row.confidence,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSyncedAt: row.last_synced_at || undefined,
      manuallyEdited: row.manually_edited === 1,
      error: row.error || undefined,
      provenance: row.provenance ? JSON.parse(row.provenance) : undefined,
    };
  }

  private rowToCalendarOperation(row: any): CalendarOperation {
    return {
      id: row.id,
      type: row.type,
      eventFingerprint: row.event_fingerprint,
      eventIntent: JSON.parse(row.event_intent),
      reason: row.reason,
      requiresApproval: row.requires_approval === 1,
      createdAt: row.created_at,
      executedAt: row.executed_at || undefined,
      status: row.status,
      error: row.error || undefined,
      calendarEventId: row.calendar_event_id || undefined,
    };
  }

  private rowToForwardedMessage(row: any): ForwardedMessage {
    return {
      id: row.id,
      sourceMessageId: row.source_message_id,
      forwardedAt: row.forwarded_at,
      forwardedTo: JSON.parse(row.forwarded_to),
      packId: row.pack_id,
      reason: row.reason,
      conditions: JSON.parse(row.conditions),
      success: row.success === 1,
      error: row.error || undefined,
    };
  }

  private rowToConfigVersion(row: any): ConfigVersion {
    return {
      id: row.id,
      version: row.version,
      config: JSON.parse(row.config),
      createdAt: row.created_at,
      createdBy: row.created_by,
      previousVersionId: row.previous_version_id || undefined,
    };
  }

  private rowToDiscoverySession(row: any): DiscoverySession {
    return {
      id: row.id,
      packId: row.pack_id,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      emailsScanned: row.emails_scanned,
      status: row.status,
      output: JSON.parse(row.output || '{}'),
    };
  }

  private rowToException(row: any): Exception {
    return {
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      severity: row.severity,
      message: row.message,
      context: JSON.parse(row.context),
      resolved: row.resolved === 1,
      resolvedAt: row.resolved_at || undefined,
    };
  }

  // ========================================
  // Approval Tokens
  // ========================================

  async insertApprovalToken(token: ApprovalToken): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO approval_tokens (
          id, operation_id, created_at, expires_at, approved, approved_at, used
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        token.id,
        token.operationId,
        token.createdAt,
        token.expiresAt,
        token.approved ? 1 : 0,
        token.approvedAt || null,
        token.used ? 1 : 0
      ]
    });
  }

  async getApprovalToken(tokenId: string): Promise<ApprovalToken | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM approval_tokens WHERE id = ?`,
      args: [tokenId]
    });
    const row = result.rows[0];
    return row ? this.rowToApprovalToken(row) : undefined;
  }

  async updateApprovalToken(tokenId: string, updates: Partial<ApprovalToken>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.approved !== undefined) {
      fields.push('approved = ?');
      values.push(updates.approved ? 1 : 0);
    }
    if (updates.approvedAt) {
      fields.push('approved_at = ?');
      values.push(updates.approvedAt);
    }
    if (updates.used !== undefined) {
      fields.push('used = ?');
      values.push(updates.used ? 1 : 0);
    }

    if (fields.length === 0) return;

    values.push(tokenId);

    await this.client.execute({
      sql: `UPDATE approval_tokens SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  async getApprovalTokenByOperation(operationId: string): Promise<ApprovalToken | undefined> {
    const result = await this.client.execute({
      sql: `SELECT * FROM approval_tokens WHERE operation_id = ? ORDER BY created_at DESC LIMIT 1`,
      args: [operationId]
    });
    const row = result.rows[0];
    return row ? this.rowToApprovalToken(row) : undefined;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.client.execute({
      sql: `DELETE FROM approval_tokens WHERE expires_at < ? AND used = 0`,
      args: [new Date().toISOString()]
    });
    return result.rowsAffected;
  }

  // ========================================
  // Pending Approvals (Email Approval Queue)
  // ========================================

  async insertPendingApproval(approval: {
    id: string;
    messageId: string;
    packId: string;
    relevanceScore: number;
    fromEmail?: string;
    fromName?: string;
    subject?: string;
    snippet?: string;
    primaryCategory?: string;
    secondaryCategories?: string[];
    categoryScores?: Record<string, number>;
    saveReasons?: string[];
    person?: string;
    assignmentReason?: string;
    emailBodyText?: string;
    emailBodyHtml?: string;
    itemType?: 'obligation' | 'announcement';
    obligationDate?: string | null;
    classificationConfidence?: number;
    classificationReasoning?: string;
  }): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT OR IGNORE INTO pending_approvals (
          id, message_id, pack_id, relevance_score,
          from_email, from_name, subject, snippet, created_at, approved,
          primary_category, secondary_categories, category_scores, save_reasons,
          person, assignment_reason, email_body_text, email_body_html,
          item_type, obligation_date, classification_confidence, classification_reasoning, classified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        approval.id,
        approval.messageId,
        approval.packId,
        approval.relevanceScore,
        approval.fromEmail || null,
        approval.fromName || null,
        approval.subject || null,
        approval.snippet || null,
        new Date().toISOString(),
        approval.primaryCategory || null,
        approval.secondaryCategories ? JSON.stringify(approval.secondaryCategories) : null,
        approval.categoryScores ? JSON.stringify(approval.categoryScores) : null,
        approval.saveReasons ? JSON.stringify(approval.saveReasons) : null,
        approval.person || null,
        approval.assignmentReason || null,
        approval.emailBodyText || null,
        approval.emailBodyHtml || null,
        approval.itemType || 'unknown',
        approval.obligationDate || null,
        approval.classificationConfidence || null,
        approval.classificationReasoning || null,
        approval.itemType ? new Date().toISOString() : null
      ]
    });
  }

  async getPendingApprovals(packId: string): Promise<any[]> {
    try {
      const result = await this.client.execute({
        sql: `
          SELECT * FROM pending_approvals
          WHERE pack_id = ? AND approved = 0
          ORDER BY created_at DESC
        `,
        args: [packId]
      });
      return result.rows as any[];
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      return [];
    }
  }

  async getPendingApprovalById(id: string): Promise<any> {
    const result = await this.client.execute({
      sql: `SELECT * FROM pending_approvals WHERE id = ?`,
      args: [id]
    });
    return result.rows[0];
  }

  async updatePendingApproval(
    id: string,
    updates: {
      approved?: boolean;
      approvedAt?: string;
      action?: string;
    }
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.approved !== undefined) {
      fields.push('approved = ?');
      values.push(updates.approved ? 1 : 0);
    }

    if (updates.approvedAt !== undefined) {
      fields.push('approved_at = ?');
      values.push(updates.approvedAt);
    }

    if (updates.action !== undefined) {
      fields.push('action = ?');
      values.push(updates.action);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.client.execute({
      sql: `UPDATE pending_approvals SET ${fields.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  async deletePendingApproval(id: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM pending_approvals WHERE id = ?`,
      args: [id]
    });
  }

  // ========================================
  // Discovery Metrics
  // ========================================

  async insertDiscoveryRunStats(stats: {
    id: string;
    sessionId: string;
    packId: string;
    runTimestamp: string;
    scannedCount: number;
    scoredCount: number;
    flaggedCount: number;
    sampledForReview: number;
    histogramVeryLow: number;
    histogramLow: number;
    histogramMedium: number;
    histogramHigh: number;
    histogramVeryHigh: number;
    rejectionReasonDomain: number;
    rejectionReasonKeywordNoMatch: number;
    rejectionReasonLowScore: number;
    rejectionReasonDuplicate: number;
    rejectionReasonOther: number;
  }): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT OR IGNORE INTO discovery_run_stats (
          id, session_id, pack_id, run_timestamp,
          scanned_count, scored_count, flagged_count, sampled_for_review,
          histogram_very_low, histogram_low, histogram_medium, histogram_high, histogram_very_high,
          rejection_reason_domain, rejection_reason_keyword_no_match, rejection_reason_low_score,
          rejection_reason_duplicate, rejection_reason_other
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        stats.id,
        stats.sessionId,
        stats.packId,
        stats.runTimestamp,
        stats.scannedCount,
        stats.scoredCount,
        stats.flaggedCount,
        stats.sampledForReview,
        stats.histogramVeryLow,
        stats.histogramLow,
        stats.histogramMedium,
        stats.histogramHigh,
        stats.histogramVeryHigh,
        stats.rejectionReasonDomain,
        stats.rejectionReasonKeywordNoMatch,
        stats.rejectionReasonLowScore,
        stats.rejectionReasonDuplicate,
        stats.rejectionReasonOther
      ]
    });
  }

  async insertDiscoveryRejectedSample(sample: {
    id: string;
    sessionId: string;
    messageId: string;
    fromEmail?: string;
    fromName?: string;
    subject?: string;
    snippet?: string;
    relevanceScore: number;
    sampleCategory: string;
    rejectionReason?: string;
    expiresAt: string;
  }): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT OR IGNORE INTO discovery_rejected_sample (
          id, session_id, message_id, from_email, from_name, subject, snippet,
          relevance_score, sample_category, rejection_reason, marked_false_negative,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `,
      args: [
        sample.id,
        sample.sessionId,
        sample.messageId,
        sample.fromEmail || null,
        sample.fromName || null,
        sample.subject || null,
        sample.snippet || null,
        sample.relevanceScore,
        sample.sampleCategory,
        sample.rejectionReason || null,
        new Date().toISOString(),
        sample.expiresAt
      ]
    });
  }

  async insertDiscoveryFalseNegative(falseNegative: {
    id: string;
    messageId: string;
    packId: string;
    fromEmail?: string;
    fromName?: string;
    subject?: string;
    snippet?: string;
    sampledScore?: number;
    reason?: string;
  }): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT OR IGNORE INTO discovery_false_negatives (
          id, message_id, pack_id, from_email, from_name, subject, snippet,
          sampled_score, reason, marked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        falseNegative.id,
        falseNegative.messageId,
        falseNegative.packId,
        falseNegative.fromEmail || null,
        falseNegative.fromName || null,
        falseNegative.subject || null,
        falseNegative.snippet || null,
        falseNegative.sampledScore || null,
        falseNegative.reason || null,
        new Date().toISOString()
      ]
    });
  }

  async getDiscoveryRunStats(packId: string, limit: number = 10): Promise<any[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM discovery_run_stats
        WHERE pack_id = ?
        ORDER BY run_timestamp DESC
        LIMIT ?
      `,
      args: [packId, limit]
    });
    return result.rows as any[];
  }

  async getDiscoveryRejectedSamples(sessionId: string): Promise<any[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM discovery_rejected_sample
        WHERE session_id = ? AND marked_false_negative = 0
        ORDER BY relevance_score DESC
      `,
      args: [sessionId]
    });
    return result.rows as any[];
  }

  async getDiscoveryFalseNegatives(packId: string): Promise<any[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM discovery_false_negatives
        WHERE pack_id = ?
        ORDER BY marked_at DESC
      `,
      args: [packId]
    });
    return result.rows as any[];
  }

  async markRejectedSampleAsFalseNegative(sampleId: string): Promise<void> {
    await this.client.execute({
      sql: `
        UPDATE discovery_rejected_sample
        SET marked_false_negative = 1, false_negative_at = ?
        WHERE id = ?
      `,
      args: [new Date().toISOString(), sampleId]
    });
  }

  // ========================================
  // Category Preferences
  // ========================================

  async saveCategoryPreferences(packId: string, preferences: any): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO category_preferences (
          id, pack_id, enabled_categories, sensitivity_map, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        `${packId}-prefs`,
        packId,
        JSON.stringify(preferences.enabled),
        JSON.stringify(preferences.sensitivity),
        new Date().toISOString()
      ]
    });
  }

  async getCategoryPreferences(packId: string): Promise<any> {
    const result = await this.client.execute({
      sql: `
        SELECT enabled_categories, sensitivity_map FROM category_preferences
        WHERE pack_id = ?
      `,
      args: [packId]
    });
    const row: any = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      enabled: JSON.parse(row.enabled_categories),
      sensitivity: JSON.parse(row.sensitivity_map),
    };
  }

  private rowToApprovalToken(row: any): ApprovalToken {
    return {
      id: row.id,
      operationId: row.operation_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      approved: row.approved === 1,
      approvedAt: row.approved_at || undefined,
      used: row.used === 1,
    };
  }

  // ========================================
  // Recipient Management Methods
  // ========================================

  async getAllRecipients(): Promise<any[]> {
    const result = await this.client.execute(`
      SELECT id, email, name, receive_digests, receive_forwarding, receive_errors, receive_approvals, is_active, created_at, updated_at
      FROM notification_recipients
      WHERE is_active = 1
      ORDER BY email ASC
    `);
    return result.rows as any[];
  }

  async addRecipient(email: string, name: string = '', preferences?: {
    receiveDigests?: boolean;
    receiveForwarding?: boolean;
    receiveErrors?: boolean;
    receiveApprovals?: boolean;
  }): Promise<void> {
    const now = new Date().toISOString();

    await this.client.execute({
      sql: `
        INSERT INTO notification_recipients
        (id, email, name, receive_digests, receive_forwarding, receive_errors, receive_approvals, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `,
      args: [
        uuid(),
        email,
        name,
        preferences?.receiveDigests ?? 1,
        preferences?.receiveForwarding ?? 1,
        preferences?.receiveErrors ?? 1,
        preferences?.receiveApprovals ?? 0,
        now,
        now
      ]
    });
  }

  async updateRecipient(email: string, preferences: {
    name?: string;
    receiveDigests?: boolean;
    receiveForwarding?: boolean;
    receiveErrors?: boolean;
    receiveApprovals?: boolean;
  }): Promise<void> {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (preferences.name !== undefined) {
      updates.push('name = ?');
      values.push(preferences.name);
    }
    if (preferences.receiveDigests !== undefined) {
      updates.push('receive_digests = ?');
      values.push(preferences.receiveDigests ? 1 : 0);
    }
    if (preferences.receiveForwarding !== undefined) {
      updates.push('receive_forwarding = ?');
      values.push(preferences.receiveForwarding ? 1 : 0);
    }
    if (preferences.receiveErrors !== undefined) {
      updates.push('receive_errors = ?');
      values.push(preferences.receiveErrors ? 1 : 0);
    }
    if (preferences.receiveApprovals !== undefined) {
      updates.push('receive_approvals = ?');
      values.push(preferences.receiveApprovals ? 1 : 0);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = ?');
    values.push(now);
    values.push(email);

    await this.client.execute({
      sql: `UPDATE notification_recipients SET ${updates.join(', ')} WHERE email = ?`,
      args: values
    });
  }

  async deleteRecipient(email: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE notification_recipients SET is_active = 0, updated_at = ? WHERE email = ?`,
      args: [now, email]
    });
  }

  async getRecipientsByNotificationType(type: 'digests' | 'forwarding' | 'errors' | 'approvals'): Promise<string[]> {
    const columnMap = {
      digests: 'receive_digests',
      forwarding: 'receive_forwarding',
      errors: 'receive_errors',
      approvals: 'receive_approvals',
    };

    const result = await this.client.execute({
      sql: `
        SELECT email FROM notification_recipients
        WHERE ${columnMap[type]} = 1 AND is_active = 1
        ORDER BY email ASC
      `,
      args: []
    });

    return (result.rows as any[]).map(r => r.email);
  }

  async recipientExists(email: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM notification_recipients WHERE email = ?`,
      args: [email]
    });
    return (result.rows[0] as any)?.cnt > 0;
  }

  // ========================================
  // Dismissed Items Methods
  // ========================================

  async dismissItem(itemId: string, reason: string, context: {
    itemType: 'pending_approval' | 'deferred';
    originalSubject?: string;
    originalFrom?: string;
    originalDate?: string;
    person?: string;
    packId?: string;
  }): Promise<void> {
    const now = new Date().toISOString();

    await this.client.execute({
      sql: `
        INSERT INTO dismissed_items
        (id, item_type, item_id, dismissed_at, reason, original_subject, original_from, original_date, person, pack_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        uuid(),
        context.itemType,
        itemId,
        now,
        reason,
        context.originalSubject || null,
        context.originalFrom || null,
        context.originalDate || null,
        context.person || null,
        context.packId || null,
        now
      ]
    });
  }

  async getDismissedItems(startDate?: string, endDate?: string): Promise<any[]> {
    let sql = `SELECT * FROM dismissed_items WHERE 1=1`;
    const args: any[] = [];

    if (startDate) {
      sql += ` AND dismissed_at >= ?`;
      args.push(startDate);
    }
    if (endDate) {
      sql += ` AND dismissed_at <= ?`;
      args.push(endDate);
    }

    sql += ` ORDER BY dismissed_at DESC`;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  async getDismissedItemsByPerson(person: string, startDate?: string, endDate?: string): Promise<any[]> {
    const pf = this.buildPersonFilter(person, 'person');
    let sql = `SELECT * FROM dismissed_items WHERE 1=1 ${pf.sql}`;
    const args: any[] = [...pf.args];

    if (startDate) {
      sql += ` AND dismissed_at >= ?`;
      args.push(startDate);
    }
    if (endDate) {
      sql += ` AND dismissed_at <= ?`;
      args.push(endDate);
    }

    sql += ` ORDER BY dismissed_at DESC`;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  async isItemDismissed(itemId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM dismissed_items WHERE item_id = ?`,
      args: [itemId]
    });
    return (result.rows[0] as any)?.cnt > 0;
  }

  // ========================================
  // Weekly Catch-Up / Newsletters
  // ========================================

  async getNewsletters(limit: number = 20): Promise<any[]> {
    const newsletterPatterns = [
      '%newsletter%',
      '%week of%',
      '%weekly update%',
      '%class update%',
      '%announcement%',
      '%this week%',
      '%recap%',
      '%what we did%',
      '%classroom update%',
      '%parent update%',
    ];

    const conditions = newsletterPatterns.map(() => 'LOWER(pa.subject) LIKE ?').join(' OR ');

    const result = await this.client.execute({
      sql: `
        SELECT pa.*,
          CAST((julianday('now') - julianday(pa.created_at)) AS INTEGER) as days_ago,
          CASE WHEN ri.id IS NOT NULL THEN 1 ELSE 0 END as is_read
        FROM pending_approvals pa
        LEFT JOIN dismissed_items di ON di.item_id = pa.id
        LEFT JOIN read_items ri ON ri.item_id = pa.id
        WHERE di.id IS NULL
          AND (${conditions})
        ORDER BY pa.created_at DESC
        LIMIT ?
      `,
      args: [...newsletterPatterns, limit]
    });
    return result.rows as any[];
  }

  async getUnreadNewsletters(limit: number = 20): Promise<any[]> {
    const all = await this.getNewsletters(limit * 2);
    return all.filter((n: any) => !n.is_read).slice(0, limit);
  }

  async markAsRead(itemId: string, readBy: string = 'parent'): Promise<void> {
    if (await this.isRead(itemId)) return;

    await this.client.execute({
      sql: `INSERT INTO read_items (id, item_id, item_type, read_at, read_by) VALUES (?, ?, 'pending_approval', ?, ?)`,
      args: [uuid(), itemId, new Date().toISOString(), readBy]
    });
  }

  async isRead(itemId: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM read_items WHERE item_id = ?`,
      args: [itemId]
    });
    return (result.rows[0] as any)?.cnt > 0;
  }

  async getReadItems(since?: string): Promise<any[]> {
    let sql = `SELECT * FROM read_items`;
    const args: string[] = [];

    if (since) {
      sql += ` WHERE read_at >= ?`;
      args.push(since);
    }

    sql += ` ORDER BY read_at DESC`;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  // ========================================
  // Smart Domain Discovery Methods
  // ========================================

  async insertSuggestedDomain(suggestion: {
    id: string;
    packId: string;
    domain: string;
    emailCount: number;
    matchedKeywords: string[];
    evidenceMessageIds: string[];
    sampleSubjects?: string[];
    confidence: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        INSERT INTO suggested_domains
        (id, pack_id, domain, first_seen_at, last_seen_at, email_count,
         matched_keywords, evidence_message_ids, sample_subjects, confidence, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `,
      args: [
        suggestion.id,
        suggestion.packId,
        suggestion.domain,
        now,
        now,
        suggestion.emailCount,
        JSON.stringify(suggestion.matchedKeywords),
        JSON.stringify(suggestion.evidenceMessageIds),
        suggestion.sampleSubjects ? JSON.stringify(suggestion.sampleSubjects) : null,
        suggestion.confidence,
        now,
        now
      ]
    });
  }

  async getSuggestedDomains(packId: string, status?: 'pending' | 'approved' | 'rejected'): Promise<any[]> {
    let sql = `SELECT * FROM suggested_domains WHERE pack_id = ?`;
    const args: any[] = [packId];

    if (status) {
      sql += ` AND status = ?`;
      args.push(status);
    }

    sql += ` ORDER BY confidence DESC, email_count DESC`;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  async getSuggestedDomainById(id: string): Promise<any> {
    const result = await this.client.execute({
      sql: `SELECT * FROM suggested_domains WHERE id = ?`,
      args: [id]
    });
    return result.rows[0];
  }

  async getSuggestedDomainByDomain(packId: string, domain: string): Promise<any> {
    const result = await this.client.execute({
      sql: `SELECT * FROM suggested_domains WHERE pack_id = ? AND domain = ?`,
      args: [packId, domain]
    });
    return result.rows[0];
  }

  async updateSuggestedDomain(id: string, updates: {
    emailCount?: number;
    matchedKeywords?: string[];
    evidenceMessageIds?: string[];
    sampleSubjects?: string[];
    confidence?: number;
    lastSeenAt?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const args: any[] = [];

    if (updates.emailCount !== undefined) {
      fields.push('email_count = ?');
      args.push(updates.emailCount);
    }
    if (updates.matchedKeywords !== undefined) {
      fields.push('matched_keywords = ?');
      args.push(JSON.stringify(updates.matchedKeywords));
    }
    if (updates.evidenceMessageIds !== undefined) {
      fields.push('evidence_message_ids = ?');
      args.push(JSON.stringify(updates.evidenceMessageIds));
    }
    if (updates.sampleSubjects !== undefined) {
      fields.push('sample_subjects = ?');
      args.push(JSON.stringify(updates.sampleSubjects));
    }
    if (updates.confidence !== undefined) {
      fields.push('confidence = ?');
      args.push(updates.confidence);
    }
    if (updates.lastSeenAt !== undefined) {
      fields.push('last_seen_at = ?');
      args.push(updates.lastSeenAt);
    }

    fields.push('updated_at = ?');
    args.push(now);
    args.push(id);

    await this.client.execute({
      sql: `UPDATE suggested_domains SET ${fields.join(', ')} WHERE id = ?`,
      args
    });
  }

  async approveSuggestedDomain(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE suggested_domains SET status = 'approved', approved_at = ?, approved_by = 'parent', updated_at = ? WHERE id = ?`,
      args: [now, now, id]
    });
  }

  async rejectSuggestedDomain(id: string, reason: string, permanent: boolean = true): Promise<void> {
    const now = new Date().toISOString();

    await this.client.execute({
      sql: `UPDATE suggested_domains SET status = 'rejected', rejected_at = ?, rejected_by = 'parent', rejection_reason = ?, updated_at = ? WHERE id = ?`,
      args: [now, reason, now, id]
    });

    if (permanent) {
      const suggestion = await this.getSuggestedDomainById(id);
      if (suggestion) {
        await this.client.execute({
          sql: `
            INSERT OR IGNORE INTO rejected_domains
            (id, pack_id, domain, rejected_at, rejected_by, reason, original_email_count, original_matched_keywords, created_at)
            VALUES (?, ?, ?, ?, 'parent', ?, ?, ?, ?)
          `,
          args: [
            uuid(),
            suggestion.pack_id,
            suggestion.domain,
            now,
            reason,
            suggestion.email_count,
            suggestion.matched_keywords,
            now
          ]
        });
      }
    }
  }

  async isRejectedDomain(packId: string, domain: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM rejected_domains WHERE pack_id = ? AND domain = ?`,
      args: [packId, domain]
    });
    return (result.rows[0] as any)?.cnt > 0;
  }

  async getRejectedDomains(packId: string): Promise<any[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM rejected_domains WHERE pack_id = ? ORDER BY rejected_at DESC`,
      args: [packId]
    });
    return result.rows as any[];
  }

  async insertExplorationRun(run: {
    id: string;
    packId: string;
    runAt: string;
    queryUsed: string;
    emailsScanned: number;
    newDomainsFound: number;
    suggestionsCreated: number;
    status: 'running' | 'completed' | 'failed';
    durationMs?: number;
    error?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        INSERT INTO domain_exploration_runs
        (id, pack_id, run_at, query_used, emails_scanned, new_domains_found,
         suggestions_created, duration_ms, status, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        run.id,
        run.packId,
        run.runAt,
        run.queryUsed,
        run.emailsScanned,
        run.newDomainsFound,
        run.suggestionsCreated,
        run.durationMs || null,
        run.status,
        run.error || null,
        now
      ]
    });
  }

  async updateExplorationRun(id: string, updates: {
    status?: 'running' | 'completed' | 'failed';
    emailsScanned?: number;
    newDomainsFound?: number;
    suggestionsCreated?: number;
    durationMs?: number;
    error?: string;
  }): Promise<void> {
    const fields: string[] = [];
    const args: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      args.push(updates.status);
    }
    if (updates.emailsScanned !== undefined) {
      fields.push('emails_scanned = ?');
      args.push(updates.emailsScanned);
    }
    if (updates.newDomainsFound !== undefined) {
      fields.push('new_domains_found = ?');
      args.push(updates.newDomainsFound);
    }
    if (updates.suggestionsCreated !== undefined) {
      fields.push('suggestions_created = ?');
      args.push(updates.suggestionsCreated);
    }
    if (updates.durationMs !== undefined) {
      fields.push('duration_ms = ?');
      args.push(updates.durationMs);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      args.push(updates.error);
    }

    if (fields.length === 0) return;

    args.push(id);

    await this.client.execute({
      sql: `UPDATE domain_exploration_runs SET ${fields.join(', ')} WHERE id = ?`,
      args
    });
  }

  async getRecentExplorationRuns(packId: string, limit: number = 10): Promise<any[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM domain_exploration_runs WHERE pack_id = ? ORDER BY run_at DESC LIMIT ?`,
      args: [packId, limit]
    });
    return result.rows as any[];
  }

  // ========================================
  // View Tokens (Read-only dashboard access)
  // ========================================

  async createViewToken(recipientId: string, expiresInDays: number = 30): Promise<string> {
    const token = uuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    await this.client.execute({
      sql: `INSERT INTO view_tokens (id, recipient_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
      args: [uuid(), recipientId, token, now.toISOString(), expiresAt.toISOString()]
    });

    return token;
  }

  async getViewToken(token: string): Promise<any | null> {
    const result = await this.client.execute({
      sql: `
        SELECT vt.*, nr.email, nr.name
        FROM view_tokens vt
        JOIN notification_recipients nr ON nr.id = vt.recipient_id
        WHERE vt.token = ?
      `,
      args: [token]
    });
    return result.rows[0] || null;
  }

  async validateViewToken(token: string): Promise<{ recipientId: string; email: string; name: string } | null> {
    const viewToken = await this.getViewToken(token);

    if (!viewToken) {
      return null;
    }

    if (viewToken.expires_at && new Date(viewToken.expires_at) < new Date()) {
      return null;
    }

    await this.client.execute({
      sql: `UPDATE view_tokens SET last_used_at = ? WHERE token = ?`,
      args: [new Date().toISOString(), token]
    });

    return {
      recipientId: viewToken.recipient_id,
      email: viewToken.email,
      name: viewToken.name || '',
    };
  }

  async getRecipientByEmail(email: string): Promise<any | null> {
    const result = await this.client.execute({
      sql: `SELECT * FROM notification_recipients WHERE email = ? AND is_active = 1`,
      args: [email]
    });
    return result.rows[0] || null;
  }

  async getViewTokensForRecipient(recipientId: string): Promise<any[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM view_tokens WHERE recipient_id = ? ORDER BY created_at DESC`,
      args: [recipientId]
    });
    return result.rows as any[];
  }

  async revokeViewToken(token: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM view_tokens WHERE token = ?`,
      args: [token]
    });
  }

  async getEmailBody(approvalId: string): Promise<{ text: string; html: string } | null> {
    const result = await this.client.execute({
      sql: `SELECT email_body_text, email_body_html FROM pending_approvals WHERE id = ?`,
      args: [approvalId]
    });
    const row: any = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      text: row.email_body_text || '',
      html: row.email_body_html || '',
    };
  }

  // ========================================
  // Dashboard: Obligations, Announcements, Updates
  // ========================================

  classifyItem(item: any): 'obligation' | 'announcement' | 'unknown' {
    const subject = (item.subject || '').toLowerCase();
    const category = item.primary_category || '';

    const obligationKeywords = [
      'due', 'deadline', 'rsvp', 'sign up', 'signup', 'required', 'attend',
      'concert', 'performance', 'parade', 'permission', 'conference',
      'appointment', 'meeting', 'recital', 'game', 'match', 'tournament'
    ];

    const obligationCategories = ['medical_health', 'forms_admin', 'logistics'];

    if (obligationCategories.includes(category)) {
      return 'obligation';
    }

    for (const keyword of obligationKeywords) {
      if (subject.includes(keyword)) {
        return 'obligation';
      }
    }

    const announcementKeywords = [
      'newsletter', 'update', 'this week', 'learning about', 'celebrating',
      'class update', 'weekly', 'announcement', 'recap', 'what we did'
    ];

    for (const keyword of announcementKeywords) {
      if (subject.includes(keyword)) {
        return 'announcement';
      }
    }

    return 'unknown';
  }

  async getUpcomingObligations(packId?: string, person?: string): Promise<any[]> {
    const args: any[] = [];
    let packFilter = '';
    let personFilter = '';

    if (packId) {
      packFilter = 'AND pa.pack_id = ?';
      args.push(packId);
    }
    if (person) {
      const pf = this.buildPersonFilter(person);
      personFilter = pf.sql;
      args.push(...pf.args);
    }

    const sql = `
      SELECT
        pa.id,
        pa.message_id,
        pa.pack_id,
        pa.subject,
        pa.from_name,
        pa.from_email,
        pa.snippet,
        pa.person,
        pa.created_at,
        pa.item_type,
        pa.obligation_date,
        pa.classification_reasoning,
        COALESCE(pa.email_body_html, pa.email_body_text) as email_body,
        e.event_intent,
        json_extract(e.event_intent, '$.title') as event_title,
        COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) as effective_date,
        CASE
          WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+7 days') THEN 'this_week'
          WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+14 days') THEN 'next_week'
          WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+30 days') THEN 'this_month'
          ELSE 'later'
        END as time_group,
        CASE
          WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+7 days') THEN 1
          WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+14 days') THEN 2
          WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+30 days') THEN 3
          ELSE 4
        END as time_group_order
      FROM pending_approvals pa
      LEFT JOIN events e ON e.source_message_id = pa.message_id
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE di.id IS NULL
        ${packFilter}
        ${personFilter}
        AND (
          (pa.item_type = 'obligation' AND pa.obligation_date >= date('now'))
          OR (e.id IS NOT NULL AND json_extract(e.event_intent, '$.startDateTime') >= datetime('now'))
        )
      ORDER BY time_group_order ASC, effective_date ASC, pa.created_at DESC
    `;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  async getTaskItems(packId?: string, person?: string): Promise<any[]> {
    const args: any[] = [];
    let packFilter = '';
    let personFilter = '';

    if (packId) {
      packFilter = 'AND pa.pack_id = ?';
      args.push(packId);
    }
    if (person) {
      const pf = this.buildPersonFilter(person);
      personFilter = pf.sql;
      args.push(...pf.args);
    }

    const sql = `
      SELECT
        pa.id,
        pa.message_id,
        pa.pack_id,
        pa.subject,
        pa.from_name,
        pa.from_email,
        pa.snippet,
        pa.person,
        pa.created_at,
        pa.item_type,
        pa.classification_reasoning,
        COALESCE(pa.email_body_html, pa.email_body_text) as email_body,
        CAST((julianday('now') - julianday(pa.created_at)) AS INTEGER) as days_since_received
      FROM pending_approvals pa
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE di.id IS NULL
        ${packFilter}
        ${personFilter}
        AND pa.item_type = 'obligation'
        AND pa.obligation_date IS NULL
        AND pa.created_at >= datetime('now', '-30 days')
      ORDER BY pa.created_at DESC
    `;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  async getUpdatesItems(packId?: string, person?: string): Promise<any[]> {
    const args: any[] = [];
    let packFilter = '';
    let personFilter = '';

    if (packId) {
      packFilter = 'AND pa.pack_id = ?';
      args.push(packId);
    }
    if (person) {
      const pf = this.buildPersonFilter(person);
      personFilter = pf.sql;
      args.push(...pf.args);
    }

    const sql = `
      SELECT
        pa.id,
        pa.message_id,
        pa.pack_id,
        pa.subject,
        pa.from_name,
        pa.from_email,
        pa.snippet,
        pa.person,
        pa.created_at,
        pa.item_type,
        pa.obligation_date,
        pa.classification_reasoning,
        COALESCE(pa.email_body_html, pa.email_body_text) as email_body,
        CAST((julianday('now') - julianday(pa.created_at)) AS INTEGER) as days_ago,
        CASE
          WHEN pa.item_type = 'obligation' AND pa.obligation_date < date('now') THEN 'past_event'
          WHEN pa.item_type = 'announcement' THEN 'announcement'
          ELSE 'update'
        END as update_type,
        COALESCE(pa.obligation_date, date(pa.created_at)) as sort_date
      FROM pending_approvals pa
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE di.id IS NULL
        ${packFilter}
        ${personFilter}
        AND pa.created_at >= datetime('now', '-14 days')
        AND (
          pa.item_type = 'announcement'
          OR pa.item_type = 'unknown'
          OR pa.item_type IS NULL
          OR (pa.item_type = 'obligation' AND pa.obligation_date IS NOT NULL AND pa.obligation_date < date('now'))
        )
      ORDER BY sort_date DESC, pa.created_at DESC
    `;

    const result = await this.client.execute({ sql, args });
    return result.rows as any[];
  }

  // ========================================
  // Summary Cache
  // ========================================

  async getCachedSummary(sectionType: string): Promise<{ summary: string; generatedAt: string; itemCount: number } | null> {
    const result = await this.client.execute({
      sql: `
        SELECT summary_text, generated_at, item_count
        FROM dashboard_summary_cache
        WHERE section_type = ?
          AND valid_until > datetime('now')
        ORDER BY generated_at DESC
        LIMIT 1
      `,
      args: [sectionType]
    });
    const row: any = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      summary: row.summary_text,
      generatedAt: row.generated_at,
      itemCount: row.item_count,
    };
  }

  async saveSummaryCache(sectionType: string, summary: string, itemIds: string[], validMinutes: number = 30): Promise<void> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + validMinutes * 60 * 1000);

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO dashboard_summary_cache
        (id, section_type, summary_text, generated_at, valid_until, item_count, item_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        sectionType,
        sectionType,
        summary,
        now.toISOString(),
        validUntil.toISOString(),
        itemIds.length,
        JSON.stringify(itemIds)
      ]
    });
  }

  async invalidateSummaryCache(sectionType?: string): Promise<void> {
    if (sectionType) {
      await this.client.execute({
        sql: 'DELETE FROM dashboard_summary_cache WHERE section_type = ?',
        args: [sectionType]
      });
    } else {
      await this.client.execute('DELETE FROM dashboard_summary_cache');
    }
  }
}
