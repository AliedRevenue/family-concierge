/**
 * Database Layer - Provides typed access to SQLite
 * All database operations go through this module
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  ProcessedMessage,
  PersistedEvent,
  CalendarOperation,
  ManualEditFlag,
  ConfigVersion,
  DiscoverySession,
  Evidence,
  Exception,
  AuditLog,
  ForwardedMessage,
  ApprovalToken,
} from '../types/index.js';

export class DatabaseClient {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Get the underlying database connection
   * (used by MigrationRunner to avoid multiple connections)
   */
  getConnection(): Database.Database {
    return this.db;
  }

  /**
   * Build a person filter that handles comma-separated multi-person assignments
   * Returns { sql: string, params: string[] }
   * E.g., for person="Colin", matches: "Colin", "Colin, Henry", "Henry, Colin"
   */
  private buildPersonFilter(person: string, columnName: string = 'pa.person'): { sql: string; params: string[] } {
    // Match: exact, starts with "Person, ", ends with ", Person", or middle ", Person, "
    const sql = `AND (
      ${columnName} = ?
      OR ${columnName} LIKE ? || ', %'
      OR ${columnName} LIKE '%, ' || ?
      OR ${columnName} LIKE '%, ' || ? || ', %'
    )`;
    return { sql, params: [person, person, person, person] };
  }

  /**
   * Auto-heal: If category_preferences table exists with bad FK constraint, drop and recreate
   * This handles the case where the migration was previously run with the FK constraint
   */
  public healCategoryPreferencesSchema(): void {
    try {
      // Check if category_preferences table exists
      const tableCheck = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM sqlite_master 
        WHERE type='table' AND name='category_preferences'
      `).get() as { cnt: number };

      if (tableCheck.cnt === 0) {
        return; // Table doesn't exist, no healing needed
      }

      // Check for FK constraints on category_preferences
      const fkCheck = this.db.prepare(`
        PRAGMA foreign_key_list(category_preferences)
      `).all();

      if (fkCheck.length > 0) {
        console.log('🔧 Detected bad FK constraint on category_preferences. Healing...');
        
        // Drop the bad table
        this.db.exec('DROP TABLE IF EXISTS category_preferences');
        
        // Recreate without FK constraint
        this.db.exec(`
          CREATE TABLE category_preferences (
            id TEXT PRIMARY KEY,
            pack_id TEXT NOT NULL UNIQUE,
            enabled_categories TEXT NOT NULL,
            sensitivity_map TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Recreate the index
        this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_category_preferences_pack ON category_preferences(pack_id)
        `);
        
        console.log('✅ Schema healed. category_preferences table recreated without FK.');
      }
    } catch (e) {
      // If healing fails, log but don't crash - migrations will handle it
      console.log('[INFO] Schema healing skipped:', e instanceof Error ? e.message : String(e));
    }
  }

  // ========================================
  // Processed Messages
  // ========================================

  insertProcessedMessage(message: ProcessedMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO processed_messages (
        message_id, processed_at, pack_id, extraction_status,
        events_extracted, fingerprints, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.messageId,
      message.processedAt,
      message.packId,
      message.extractionStatus,
      message.eventsExtracted,
      JSON.stringify(message.fingerprints),
      message.error || null
    );
  }

  getProcessedMessage(messageId: string): ProcessedMessage | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM processed_messages WHERE message_id = ?
    `);
    const row: any = stmt.get(messageId);
    return row ? this.rowToProcessedMessage(row) : undefined;
  }

  getRecentProcessedMessages(limit: number = 100): ProcessedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM processed_messages
      ORDER BY processed_at DESC
      LIMIT ?
    `);
    return stmt.all(limit).map((row: any) => this.rowToProcessedMessage(row));
  }

  // ========================================
  // Events
  // ========================================

  insertEvent(event: PersistedEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, fingerprint, source_message_id, pack_id, calendar_event_id,
        event_intent, confidence, status, created_at, updated_at,
        last_synced_at, manually_edited, error, provenance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  updateEvent(fingerprint: string, updates: Partial<PersistedEvent>): void {
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

    const stmt = this.db.prepare(`
      UPDATE events SET ${fields.join(', ')} WHERE fingerprint = ?
    `);

    stmt.run(...values);
  }

  getEventByFingerprint(fingerprint: string): PersistedEvent | undefined {
    const stmt = this.db.prepare('SELECT * FROM events WHERE fingerprint = ?');
    const row: any = stmt.get(fingerprint);
    return row ? this.rowToPersistedEvent(row) : undefined;
  }

  getEventsByStatus(status: PersistedEvent['status']): PersistedEvent[] {
    const stmt = this.db.prepare('SELECT * FROM events WHERE status = ? ORDER BY created_at DESC');
    return stmt.all(status).map((row: any) => this.rowToPersistedEvent(row));
  }

  getAllEvents(): PersistedEvent[] {
    const stmt = this.db.prepare('SELECT * FROM events ORDER BY created_at DESC');
    return stmt.all().map((row: any) => this.rowToPersistedEvent(row));
  }

  findEventsByDateRange(startDate: string, endDate: string): PersistedEvent[] {
    // Note: This queries the JSON field - not optimal but works for v1
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE json_extract(event_intent, '$.startDateTime') BETWEEN ? AND ?
      ORDER BY json_extract(event_intent, '$.startDateTime')
    `);
    return stmt.all(startDate, endDate).map((row: any) => this.rowToPersistedEvent(row));
  }

  /**
   * Get upcoming events for the next N days
   */
  getUpcomingEvents(days: number = 14): PersistedEvent[] {
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.findEventsByDateRange(now.toISOString(), endDate.toISOString());
  }

  /**
   * Get emails worth reading (pending approvals not dismissed, sorted by relevance)
   */
  getEmailsWorthReading(packId?: string, limit: number = 10): any[] {
    let query = `
      SELECT pa.*,
        CAST((julianday('now') - julianday(pa.created_at)) AS INTEGER) as days_ago
      FROM pending_approvals pa
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE pa.approved = 0
        AND di.id IS NULL
    `;
    const params: any[] = [];

    if (packId) {
      query += ` AND pa.pack_id = ?`;
      params.push(packId);
    }

    query += ` ORDER BY pa.relevance_score DESC, pa.created_at DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  findDuplicateEvents(
    fingerprint: string,
    dateKey: string,
    windowDays: number
  ): PersistedEvent[] {
    // Find events within deduplication window with matching fingerprint
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE fingerprint = ?
      AND date(json_extract(event_intent, '$.startDateTime')) BETWEEN
          date(?, '-${windowDays} days') AND date(?, '+${windowDays} days')
    `);
    return stmt.all(fingerprint, dateKey, dateKey).map((row: any) => this.rowToPersistedEvent(row));
  }

  // ========================================
  // Calendar Operations
  // ========================================

  insertCalendarOperation(operation: CalendarOperation): void {
    const stmt = this.db.prepare(`
      INSERT INTO calendar_operations (
        id, type, event_fingerprint, event_intent, reason,
        requires_approval, created_at, executed_at, status, error, calendar_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  updateCalendarOperation(id: string, updates: Partial<CalendarOperation>): void {
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

    const stmt = this.db.prepare(`
      UPDATE calendar_operations SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
  }

  getPendingOperations(): CalendarOperation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM calendar_operations
      WHERE status = 'pending' OR status = 'approved'
      ORDER BY created_at ASC
    `);
    return stmt.all().map((row: any) => this.rowToCalendarOperation(row));
  }

  getCalendarOperation(id: string): CalendarOperation | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM calendar_operations WHERE id = ?
    `);
    const row = stmt.get(id);
    return row ? this.rowToCalendarOperation(row) : undefined;
  }

  getCalendarOperationByFingerprint(fingerprint: string): CalendarOperation | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM calendar_operations
      WHERE event_fingerprint = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(fingerprint);
    return row ? this.rowToCalendarOperation(row) : undefined;
  }

  // ========================================
  // Config Versions
  // ========================================

  insertConfigVersion(configVersion: ConfigVersion): void {
    const stmt = this.db.prepare(`
      INSERT INTO config_versions (id, version, config, created_at, created_by, previous_version_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      configVersion.id,
      configVersion.version,
      JSON.stringify(configVersion.config),
      configVersion.createdAt,
      configVersion.createdBy,
      configVersion.previousVersionId || null
    );
  }

  getLatestConfig(): ConfigVersion | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM config_versions
      ORDER BY version DESC
      LIMIT 1
    `);
    const row: any = stmt.get();
    return row ? this.rowToConfigVersion(row) : undefined;
  }

  getConfigByVersion(version: number): ConfigVersion | undefined {
    const stmt = this.db.prepare('SELECT * FROM config_versions WHERE version = ?');
    const row: any = stmt.get(version);
    return row ? this.rowToConfigVersion(row) : undefined;
  }

  // ========================================
  // Discovery
  // ========================================

  insertDiscoverySession(session: DiscoverySession): void {
    const stmt = this.db.prepare(`
      INSERT INTO discovery_sessions (id, pack_id, started_at, completed_at, emails_scanned, status, output, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.packId,
      session.startedAt,
      session.completedAt || null,
      session.emailsScanned,
      session.status,
      JSON.stringify(session.output),
      null
    );
  }

  updateDiscoverySession(id: string, updates: Partial<DiscoverySession>): void {
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

    const stmt = this.db.prepare(`
      UPDATE discovery_sessions SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
  }

  getDiscoverySession(id: string): DiscoverySession | undefined {
    const stmt = this.db.prepare('SELECT * FROM discovery_sessions WHERE id = ?');
    const row: any = stmt.get(id);
    return row ? this.rowToDiscoverySession(row) : undefined;
  }

  // ========================================
  // Exceptions
  // ========================================

  insertException(exception: Exception): void {
    const stmt = this.db.prepare(`
      INSERT INTO exceptions (id, timestamp, type, severity, message, context, resolved, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      exception.id,
      exception.timestamp,
      exception.type,
      exception.severity,
      exception.message,
      JSON.stringify(exception.context),
      exception.resolved ? 1 : 0,
      exception.resolvedAt || null
    );
  }

  getUnresolvedExceptions(): Exception[] {
    const stmt = this.db.prepare(`
      SELECT * FROM exceptions
      WHERE resolved = 0
      ORDER BY timestamp DESC
    `);
    return stmt.all().map((row: any) => this.rowToException(row));
  }

  // ========================================
  // Audit Logs
  // ========================================

  insertAuditLog(log: AuditLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (timestamp, level, module, action, details, message_id, event_fingerprint, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      log.timestamp,
      log.level,
      log.module,
      log.action,
      JSON.stringify(log.details),
      log.messageId || null,
      log.eventFingerprint || null,
      log.userId || null
    );
  }

  // ========================================
  // Forwarded Messages
  // ========================================

  insertForwardedMessage(message: ForwardedMessage): void {
    const stmt = this.db.prepare(`
      INSERT INTO forwarded_messages (
        id, source_message_id, forwarded_at, forwarded_to, pack_id, reason, conditions, success, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.sourceMessageId,
      message.forwardedAt,
      JSON.stringify(message.forwardedTo),
      message.packId,
      message.reason,
      JSON.stringify(message.conditions),
      message.success ? 1 : 0,
      message.error || null
    );
  }

  getForwardedMessage(sourceMessageId: string): ForwardedMessage | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM forwarded_messages WHERE source_message_id = ?
    `);
    const row: any = stmt.get(sourceMessageId);
    return row ? this.rowToForwardedMessage(row) : undefined;
  }

  getRecentForwardedMessages(limit: number = 100): ForwardedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM forwarded_messages
      ORDER BY forwarded_at DESC
      LIMIT ?
    `);
    return stmt.all(limit).map((row: any) => this.rowToForwardedMessage(row));
  }

  getForwardedMessagesByDateRange(startDate: string, endDate: string): ForwardedMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM forwarded_messages
      WHERE forwarded_at >= ? AND forwarded_at <= ?
      ORDER BY forwarded_at DESC
    `);
    return stmt.all(startDate, endDate).map((row: any) => this.rowToForwardedMessage(row));
  }

  // ========================================
  // Utilities
  // ========================================

  close(): void {
    // Don't close - connection is shared with WebServer
    // this.db.close();
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

  insertApprovalToken(token: ApprovalToken): void {
    const stmt = this.db.prepare(`
      INSERT INTO approval_tokens (
        id, operation_id, created_at, expires_at, approved, approved_at, used
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      token.id,
      token.operationId,
      token.createdAt,
      token.expiresAt,
      token.approved ? 1 : 0,
      token.approvedAt || null,
      token.used ? 1 : 0
    );
  }

  getApprovalToken(tokenId: string): ApprovalToken | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM approval_tokens WHERE id = ?
    `);
    const row: any = stmt.get(tokenId);
    return row ? this.rowToApprovalToken(row) : undefined;
  }

  updateApprovalToken(tokenId: string, updates: Partial<ApprovalToken>): void {
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

    const stmt = this.db.prepare(`
      UPDATE approval_tokens SET ${fields.join(', ')} WHERE id = ?
    `);

    stmt.run(...values);
  }

  getApprovalTokenByOperation(operationId: string): ApprovalToken | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM approval_tokens WHERE operation_id = ? ORDER BY created_at DESC LIMIT 1
    `);
    const row: any = stmt.get(operationId);
    return row ? this.rowToApprovalToken(row) : undefined;
  }

  cleanupExpiredTokens(): number {
    const stmt = this.db.prepare(`
      DELETE FROM approval_tokens WHERE expires_at < ? AND used = 0
    `);
    const result = stmt.run(new Date().toISOString());
    return result.changes;
  }

  // ========================================
  // Pending Approvals (Email Approval Queue)
  // ========================================

  insertPendingApproval(approval: {
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
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO pending_approvals (
        id, message_id, pack_id, relevance_score,
        from_email, from_name, subject, snippet, created_at, approved,
        primary_category, secondary_categories, category_scores, save_reasons,
        person, assignment_reason, email_body_text, email_body_html,
        item_type, obligation_date, classification_confidence, classification_reasoning, classified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  getPendingApprovals(packId: string): any[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM pending_approvals
        WHERE pack_id = ? AND approved = 0
        ORDER BY created_at DESC
      `);
      const result = stmt.all(packId);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      return [];
    }
  }

  getPendingApprovalById(id: string): any {
    const stmt = this.db.prepare(`
      SELECT * FROM pending_approvals WHERE id = ?
    `);
    return stmt.get(id);
  }

  updatePendingApproval(
    id: string,
    updates: {
      approved?: boolean;
      approvedAt?: string;
      action?: string;
    }
  ): void {
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
    const stmt = this.db.prepare(`
      UPDATE pending_approvals SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  deletePendingApproval(id: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM pending_approvals WHERE id = ?
    `);
    stmt.run(id);
  }

  // ========================================
  // Discovery Metrics
  // ========================================

  insertDiscoveryRunStats(stats: {
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
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO discovery_run_stats (
        id, session_id, pack_id, run_timestamp,
        scanned_count, scored_count, flagged_count, sampled_for_review,
        histogram_very_low, histogram_low, histogram_medium, histogram_high, histogram_very_high,
        rejection_reason_domain, rejection_reason_keyword_no_match, rejection_reason_low_score,
        rejection_reason_duplicate, rejection_reason_other
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  insertDiscoveryRejectedSample(sample: {
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
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO discovery_rejected_sample (
        id, session_id, message_id, from_email, from_name, subject, snippet,
        relevance_score, sample_category, rejection_reason, marked_false_negative,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    stmt.run(
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
    );
  }

  insertDiscoveryFalseNegative(falseNegative: {
    id: string;
    messageId: string;
    packId: string;
    fromEmail?: string;
    fromName?: string;
    subject?: string;
    snippet?: string;
    sampledScore?: number;
    reason?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO discovery_false_negatives (
        id, message_id, pack_id, from_email, from_name, subject, snippet,
        sampled_score, reason, marked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  getDiscoveryRunStats(packId: string, limit: number = 10): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM discovery_run_stats
      WHERE pack_id = ?
      ORDER BY run_timestamp DESC
      LIMIT ?
    `);
    return stmt.all(packId, limit);
  }

  getDiscoveryRejectedSamples(sessionId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM discovery_rejected_sample
      WHERE session_id = ? AND marked_false_negative = 0
      ORDER BY relevance_score DESC
    `);
    return stmt.all(sessionId);
  }

  getDiscoveryFalseNegatives(packId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM discovery_false_negatives
      WHERE pack_id = ?
      ORDER BY marked_at DESC
    `);
    return stmt.all(packId);
  }

  markRejectedSampleAsFalseNegative(sampleId: string): void {
    const stmt = this.db.prepare(`
      UPDATE discovery_rejected_sample
      SET marked_false_negative = 1, false_negative_at = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), sampleId);
  }

  // ========================================
  // Category Preferences
  // ========================================

  saveCategoryPreferences(packId: string, preferences: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO category_preferences (
        id, pack_id, enabled_categories, sensitivity_map, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      `${packId}-prefs`,
      packId,
      JSON.stringify(preferences.enabled),
      JSON.stringify(preferences.sensitivity),
      new Date().toISOString()
    );
  }

  getCategoryPreferences(packId: string): any {
    const stmt = this.db.prepare(`
      SELECT enabled_categories, sensitivity_map FROM category_preferences
      WHERE pack_id = ?
    `);
    const result: any = stmt.get(packId);

    if (!result) {
      return null;
    }

    return {
      enabled: JSON.parse(result.enabled_categories),
      sensitivity: JSON.parse(result.sensitivity_map),
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

  /**
   * Recipient Management Methods
   */

  getAllRecipients(): any[] {
    const stmt = this.db.prepare(`
      SELECT id, email, name, receive_digests, receive_forwarding, receive_errors, receive_approvals, is_active, created_at, updated_at
      FROM notification_recipients
      WHERE is_active = 1
      ORDER BY email ASC
    `);
    return stmt.all();
  }

  addRecipient(email: string, name: string = '', preferences?: {
    receiveDigests?: boolean;
    receiveForwarding?: boolean;
    receiveErrors?: boolean;
    receiveApprovals?: boolean;
  }): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO notification_recipients 
      (id, email, name, receive_digests, receive_forwarding, receive_errors, receive_approvals, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    stmt.run(
      uuid(),
      email,
      name,
      preferences?.receiveDigests ?? 1,
      preferences?.receiveForwarding ?? 1,
      preferences?.receiveErrors ?? 1,
      preferences?.receiveApprovals ?? 0,
      now,
      now
    );
  }

  updateRecipient(email: string, preferences: {
    name?: string;
    receiveDigests?: boolean;
    receiveForwarding?: boolean;
    receiveErrors?: boolean;
    receiveApprovals?: boolean;
  }): void {
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

    const stmt = this.db.prepare(`
      UPDATE notification_recipients
      SET ${updates.join(', ')}
      WHERE email = ?
    `);
    stmt.run(...values);
  }

  deleteRecipient(email: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE notification_recipients
      SET is_active = 0, updated_at = ?
      WHERE email = ?
    `);
    stmt.run(now, email);
  }

  getRecipientsByNotificationType(type: 'digests' | 'forwarding' | 'errors' | 'approvals'): string[] {
    const columnMap = {
      digests: 'receive_digests',
      forwarding: 'receive_forwarding',
      errors: 'receive_errors',
      approvals: 'receive_approvals',
    };

    const stmt = this.db.prepare(`
      SELECT email FROM notification_recipients
      WHERE ${columnMap[type]} = 1 AND is_active = 1
      ORDER BY email ASC
    `);
    
    const result = stmt.all() as Array<{ email: string }>;
    return result.map(r => r.email);
  }

  recipientExists(email: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM notification_recipients WHERE email = ?
    `);
    const result = stmt.get(email) as { cnt: number };
    return result.cnt > 0;
  }

  /**
   * Dismissed Items Methods
   */

  dismissItem(itemId: string, reason: string, context: {
    itemType: 'pending_approval' | 'deferred';
    originalSubject?: string;
    originalFrom?: string;
    originalDate?: string;
    person?: string;
    packId?: string;
  }): void {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO dismissed_items 
      (id, item_type, item_id, dismissed_at, reason, original_subject, original_from, original_date, person, pack_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  getDismissedItems(startDate?: string, endDate?: string): any[] {
    let query = `
      SELECT * FROM dismissed_items
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      query += ` AND dismissed_at >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND dismissed_at <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY dismissed_at DESC`;

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  getDismissedItemsByPerson(person: string, startDate?: string, endDate?: string): any[] {
    // Use multi-person filter to handle comma-separated assignments
    const pf = this.buildPersonFilter(person, 'person');
    let query = `
      SELECT * FROM dismissed_items
      WHERE 1=1 ${pf.sql}
    `;
    const params: any[] = [...pf.params];

    if (startDate) {
      query += ` AND dismissed_at >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND dismissed_at <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY dismissed_at DESC`;

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  isItemDismissed(itemId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM dismissed_items WHERE item_id = ?
    `);
    const result = stmt.get(itemId) as { cnt: number };
    return result.cnt > 0;
  }

  // ========================================
  // Weekly Catch-Up / Newsletters
  // ========================================

  /**
   * Get newsletters and class updates (informational emails, not actionable events)
   * Matches patterns like "newsletter", "week of", "update", "announcement"
   */
  getNewsletters(limit: number = 20): any[] {
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

    // Build OR conditions for subject matching
    const conditions = newsletterPatterns.map(() => 'LOWER(pa.subject) LIKE ?').join(' OR ');

    // Note: We don't filter by approved status because newsletters are
    // informational - user wants to read them regardless of whether
    // a calendar event was created. Only exclude dismissed items.
    const query = `
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
    `;

    const stmt = this.db.prepare(query);
    return stmt.all(...newsletterPatterns, limit);
  }

  /**
   * Get unread newsletters only
   */
  getUnreadNewsletters(limit: number = 20): any[] {
    const all = this.getNewsletters(limit * 2); // Get more to filter
    return all.filter((n: any) => !n.is_read).slice(0, limit);
  }

  /**
   * Mark an item as read (softer than dismiss)
   */
  markAsRead(itemId: string, readBy: string = 'parent'): void {
    // Check if already read
    if (this.isRead(itemId)) return;

    const stmt = this.db.prepare(`
      INSERT INTO read_items (id, item_id, item_type, read_at, read_by)
      VALUES (?, ?, 'pending_approval', ?, ?)
    `);
    stmt.run(uuid(), itemId, new Date().toISOString(), readBy);
  }

  /**
   * Check if an item has been read
   */
  isRead(itemId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM read_items WHERE item_id = ?
    `);
    const result = stmt.get(itemId) as { cnt: number };
    return result.cnt > 0;
  }

  /**
   * Get read items for audit
   */
  getReadItems(since?: string): any[] {
    let query = `SELECT * FROM read_items`;
    const params: string[] = [];

    if (since) {
      query += ` WHERE read_at >= ?`;
      params.push(since);
    }

    query += ` ORDER BY read_at DESC`;

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // ========================================
  // Smart Domain Discovery Methods
  // ========================================

  insertSuggestedDomain(suggestion: {
    id: string;
    packId: string;
    domain: string;
    emailCount: number;
    matchedKeywords: string[];
    evidenceMessageIds: string[];
    sampleSubjects?: string[];
    confidence: number;
  }): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO suggested_domains
      (id, pack_id, domain, first_seen_at, last_seen_at, email_count,
       matched_keywords, evidence_message_ids, sample_subjects, confidence, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
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
    );
  }

  getSuggestedDomains(packId: string, status?: 'pending' | 'approved' | 'rejected'): any[] {
    let query = `SELECT * FROM suggested_domains WHERE pack_id = ?`;
    const params: any[] = [packId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY confidence DESC, email_count DESC`;

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  getSuggestedDomainById(id: string): any {
    const stmt = this.db.prepare(`SELECT * FROM suggested_domains WHERE id = ?`);
    return stmt.get(id);
  }

  getSuggestedDomainByDomain(packId: string, domain: string): any {
    const stmt = this.db.prepare(`
      SELECT * FROM suggested_domains WHERE pack_id = ? AND domain = ?
    `);
    return stmt.get(packId, domain);
  }

  updateSuggestedDomain(id: string, updates: {
    emailCount?: number;
    matchedKeywords?: string[];
    evidenceMessageIds?: string[];
    sampleSubjects?: string[];
    confidence?: number;
    lastSeenAt?: string;
  }): void {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.emailCount !== undefined) {
      fields.push('email_count = ?');
      params.push(updates.emailCount);
    }
    if (updates.matchedKeywords !== undefined) {
      fields.push('matched_keywords = ?');
      params.push(JSON.stringify(updates.matchedKeywords));
    }
    if (updates.evidenceMessageIds !== undefined) {
      fields.push('evidence_message_ids = ?');
      params.push(JSON.stringify(updates.evidenceMessageIds));
    }
    if (updates.sampleSubjects !== undefined) {
      fields.push('sample_subjects = ?');
      params.push(JSON.stringify(updates.sampleSubjects));
    }
    if (updates.confidence !== undefined) {
      fields.push('confidence = ?');
      params.push(updates.confidence);
    }
    if (updates.lastSeenAt !== undefined) {
      fields.push('last_seen_at = ?');
      params.push(updates.lastSeenAt);
    }

    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE suggested_domains SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
  }

  approveSuggestedDomain(id: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE suggested_domains
      SET status = 'approved', approved_at = ?, approved_by = 'parent', updated_at = ?
      WHERE id = ?
    `);
    stmt.run(now, now, id);
  }

  rejectSuggestedDomain(id: string, reason: string, permanent: boolean = true): void {
    const now = new Date().toISOString();

    // Update suggestion status
    const updateStmt = this.db.prepare(`
      UPDATE suggested_domains
      SET status = 'rejected', rejected_at = ?, rejected_by = 'parent', rejection_reason = ?, updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(now, reason, now, id);

    // If permanent, also add to rejected_domains table
    if (permanent) {
      const suggestion = this.getSuggestedDomainById(id);
      if (suggestion) {
        const insertStmt = this.db.prepare(`
          INSERT OR IGNORE INTO rejected_domains
          (id, pack_id, domain, rejected_at, rejected_by, reason, original_email_count, original_matched_keywords, created_at)
          VALUES (?, ?, ?, ?, 'parent', ?, ?, ?, ?)
        `);
        insertStmt.run(
          uuid(),
          suggestion.pack_id,
          suggestion.domain,
          now,
          reason,
          suggestion.email_count,
          suggestion.matched_keywords,
          now
        );
      }
    }
  }

  isRejectedDomain(packId: string, domain: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM rejected_domains WHERE pack_id = ? AND domain = ?
    `);
    const result = stmt.get(packId, domain) as { cnt: number };
    return result.cnt > 0;
  }

  getRejectedDomains(packId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM rejected_domains WHERE pack_id = ? ORDER BY rejected_at DESC
    `);
    return stmt.all(packId);
  }

  insertExplorationRun(run: {
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
  }): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO domain_exploration_runs
      (id, pack_id, run_at, query_used, emails_scanned, new_domains_found,
       suggestions_created, duration_ms, status, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  updateExplorationRun(id: string, updates: {
    status?: 'running' | 'completed' | 'failed';
    emailsScanned?: number;
    newDomainsFound?: number;
    suggestionsCreated?: number;
    durationMs?: number;
    error?: string;
  }): void {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.emailsScanned !== undefined) {
      fields.push('emails_scanned = ?');
      params.push(updates.emailsScanned);
    }
    if (updates.newDomainsFound !== undefined) {
      fields.push('new_domains_found = ?');
      params.push(updates.newDomainsFound);
    }
    if (updates.suggestionsCreated !== undefined) {
      fields.push('suggestions_created = ?');
      params.push(updates.suggestionsCreated);
    }
    if (updates.durationMs !== undefined) {
      fields.push('duration_ms = ?');
      params.push(updates.durationMs);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      params.push(updates.error);
    }

    if (fields.length === 0) return;

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE domain_exploration_runs SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
  }

  getRecentExplorationRuns(packId: string, limit: number = 10): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM domain_exploration_runs
      WHERE pack_id = ?
      ORDER BY run_at DESC
      LIMIT ?
    `);
    return stmt.all(packId, limit);
  }

  // ========================================
  // View Tokens (Read-only dashboard access)
  // ========================================

  /**
   * Create a view token for read-only dashboard access
   */
  createViewToken(recipientId: string, expiresInDays: number = 30): string {
    const token = uuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare(`
      INSERT INTO view_tokens (id, recipient_id, token, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuid(),
      recipientId,
      token,
      now.toISOString(),
      expiresAt.toISOString()
    );

    return token;
  }

  /**
   * Get view token details by token string
   */
  getViewToken(token: string): any | null {
    const stmt = this.db.prepare(`
      SELECT vt.*, nr.email, nr.name
      FROM view_tokens vt
      JOIN notification_recipients nr ON nr.id = vt.recipient_id
      WHERE vt.token = ?
    `);
    return stmt.get(token) || null;
  }

  /**
   * Validate a view token and update last_used_at
   * Returns recipient info if valid, null if expired/invalid
   */
  validateViewToken(token: string): { recipientId: string; email: string; name: string } | null {
    const viewToken = this.getViewToken(token);

    if (!viewToken) {
      return null;
    }

    // Check expiration
    if (viewToken.expires_at && new Date(viewToken.expires_at) < new Date()) {
      return null;
    }

    // Update last_used_at
    const updateStmt = this.db.prepare(`
      UPDATE view_tokens SET last_used_at = ? WHERE token = ?
    `);
    updateStmt.run(new Date().toISOString(), token);

    return {
      recipientId: viewToken.recipient_id,
      email: viewToken.email,
      name: viewToken.name || '',
    };
  }

  /**
   * Get recipient by email
   */
  getRecipientByEmail(email: string): any | null {
    const stmt = this.db.prepare(`
      SELECT * FROM notification_recipients WHERE email = ? AND is_active = 1
    `);
    return stmt.get(email) || null;
  }

  /**
   * Get all view tokens for a recipient
   */
  getViewTokensForRecipient(recipientId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM view_tokens
      WHERE recipient_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(recipientId);
  }

  /**
   * Revoke (delete) a view token
   */
  revokeViewToken(token: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM view_tokens WHERE token = ?
    `);
    stmt.run(token);
  }

  /**
   * Get email body for a pending approval
   */
  getEmailBody(approvalId: string): { text: string; html: string } | null {
    const stmt = this.db.prepare(`
      SELECT email_body_text, email_body_html FROM pending_approvals WHERE id = ?
    `);
    const result: any = stmt.get(approvalId);

    if (!result) {
      return null;
    }

    return {
      text: result.email_body_text || '',
      html: result.email_body_html || '',
    };
  }

  // ========================================
  // Dashboard Restructure: Obligations, Announcements, Catch-Up
  // ========================================

  /**
   * Classify an item as obligation or announcement based on content
   */
  classifyItem(item: any): 'obligation' | 'announcement' | 'unknown' {
    const subject = (item.subject || '').toLowerCase();
    const category = item.primary_category || '';

    // Obligation patterns
    const obligationKeywords = [
      'due', 'deadline', 'rsvp', 'sign up', 'signup', 'required', 'attend',
      'concert', 'performance', 'parade', 'permission', 'conference',
      'appointment', 'meeting', 'recital', 'game', 'match', 'tournament'
    ];

    const obligationCategories = ['medical_health', 'forms_admin', 'logistics'];

    // Check for obligation
    if (obligationCategories.includes(category)) {
      return 'obligation';
    }

    for (const keyword of obligationKeywords) {
      if (subject.includes(keyword)) {
        return 'obligation';
      }
    }

    // Announcement patterns
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

  /**
   * Get obligation items (things requiring action/attendance)
   * Uses AI classification (item_type = 'obligation') and time-based grouping
   */
  getObligationItems(packId?: string, person?: string): any[] {
    // Get obligations from pending_approvals (AI-classified or with obligation_date)
    // Show items where:
    // - item_type = 'obligation' AND (obligation_date is in the future OR within last 24 hours)
    // - OR has associated future event in events table
    // If packId is not specified, get from all packs
    // If person is specified, filter by person (supports comma-separated multi-person assignments)
    const params: string[] = [];
    let packFilter = '';
    let personFilter = '';

    if (packId) {
      packFilter = 'AND pa.pack_id = ?';
      params.push(packId);
    }
    if (person) {
      const pf = this.buildPersonFilter(person);
      personFilter = pf.sql;
      params.push(...pf.params);
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
          -- AI classified as obligation with future date (today or later) - MUST have a date
          (pa.item_type = 'obligation' AND pa.obligation_date >= date('now'))
          -- OR has associated future event (today or later)
          OR (e.id IS NOT NULL AND json_extract(e.event_intent, '$.startDateTime') >= datetime('now'))
        )
      ORDER BY time_group_order ASC, effective_date ASC, pa.created_at DESC
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Get task items (action items without specific dates)
   * These are obligations that need to be done but don't have a specific deadline
   * Examples: sign waivers, fill forms, review documents
   */
  getTaskItems(packId?: string, person?: string): any[] {
    const params: string[] = [];
    let packFilter = '';
    let personFilter = '';

    if (packId) {
      packFilter = 'AND pa.pack_id = ?';
      params.push(packId);
    }
    if (person) {
      const pf = this.buildPersonFilter(person);
      personFilter = pf.sql;
      params.push(...pf.params);
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
        -- Tasks are obligations WITHOUT dates
        AND pa.item_type = 'obligation'
        AND pa.obligation_date IS NULL
        -- Only show recent tasks (within last 30 days)
        AND pa.created_at >= datetime('now', '-30 days')
      ORDER BY pa.created_at DESC
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Get announcement items (informational, no action required)
   * Uses AI classification (item_type = 'announcement') and time-based visibility
   * Shows announcements from the last 7 days, grouped by time
   */
  getAnnouncementItems(packId?: string, _includeRead: boolean = false): any[] {
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
          WHEN pa.created_at >= datetime('now', '-2 days') THEN 'this_week'
          ELSE 'last_week'
        END as time_group
      FROM pending_approvals pa
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE di.id IS NULL
        ${packId ? 'AND pa.pack_id = ?' : ''}
        -- Show announcements from last 7 days (they age out automatically)
        AND pa.created_at >= datetime('now', '-7 days')
        -- AI classified as announcement OR unclassified (fallback for existing data)
        AND (pa.item_type = 'announcement' OR pa.item_type = 'unknown' OR pa.item_type IS NULL)
        -- Exclude items that are obligations
        AND pa.item_type != 'obligation'
      ORDER BY pa.created_at DESC
    `;

    const stmt = this.db.prepare(sql);
    return packId ? stmt.all(packId) : stmt.all();
  }

  /**
   * Get past items for Weekly Catch-Up
   * Shows items that have "aged out" of the main sections:
   * - Past obligations (obligation_date has passed, within last 7 days)
   * - Old announcements (7-14 days old)
   * - Past events that happened
   */
  getPastItems(packId?: string, daysBack: number = 7): any[] {
    // Combined query for all catch-up items
    const sql = `
      SELECT
        pa.id,
        pa.message_id,
        pa.pack_id,
        pa.subject,
        pa.from_name,
        pa.from_email,
        pa.person,
        pa.created_at,
        pa.item_type,
        pa.obligation_date,
        COALESCE(pa.email_body_html, pa.email_body_text) as email_body,
        e.event_intent,
        json_extract(e.event_intent, '$.title') as event_title,
        COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) as effective_date,
        CASE
          WHEN pa.item_type = 'obligation' AND pa.obligation_date < date('now') THEN 'past_obligation'
          WHEN e.id IS NOT NULL AND json_extract(e.event_intent, '$.startDateTime') < datetime('now') THEN 'past_event'
          WHEN pa.created_at < datetime('now', '-7 days') THEN 'old_announcement'
          ELSE 'archived'
        END as catch_up_status
      FROM pending_approvals pa
      LEFT JOIN events e ON e.source_message_id = pa.message_id
      LEFT JOIN dismissed_items di ON di.item_id = pa.id
      WHERE di.id IS NULL
        ${packId ? 'AND pa.pack_id = ?' : ''}
        AND (
          -- Past obligations (date has passed, within last 7 days)
          (pa.item_type = 'obligation' AND pa.obligation_date < date('now') AND pa.obligation_date >= date('now', '-' || ? || ' days'))
          -- Past events
          OR (e.id IS NOT NULL AND json_extract(e.event_intent, '$.startDateTime') < datetime('now') AND json_extract(e.event_intent, '$.startDateTime') >= datetime('now', '-' || ? || ' days'))
          -- Old announcements (7-14 days old)
          OR (pa.item_type != 'obligation' AND pa.created_at < datetime('now', '-7 days') AND pa.created_at >= datetime('now', '-14 days'))
        )
      ORDER BY effective_date DESC, pa.created_at DESC
    `;

    const stmt = this.db.prepare(sql);
    return packId ? stmt.all(packId, daysBack, daysBack) : stmt.all(daysBack, daysBack);
  }

  /**
   * Get all updates - combines announcements and past items into one section
   * Shows:
   * - Recent announcements (last 14 days)
   * - Past obligations that happened (last 14 days)
   * - Past events
   * Sorted by date, most recent first
   */
  getUpdatesItems(packId?: string, person?: string): any[] {
    const params: string[] = [];
    let packFilter = '';
    let personFilter = '';

    if (packId) {
      packFilter = 'AND pa.pack_id = ?';
      params.push(packId);
    }
    if (person) {
      const pf = this.buildPersonFilter(person);
      personFilter = pf.sql;
      params.push(...pf.params);
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
          -- Announcements (informational)
          pa.item_type = 'announcement'
          OR pa.item_type = 'unknown'
          OR pa.item_type IS NULL
          -- OR past obligations (date has passed)
          OR (pa.item_type = 'obligation' AND pa.obligation_date IS NOT NULL AND pa.obligation_date < date('now'))
        )
      ORDER BY sort_date DESC, pa.created_at DESC
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // ========================================
  // Summary Cache
  // ========================================

  /**
   * Get cached summary for a section
   */
  getCachedSummary(sectionType: string): { summary: string; generatedAt: string; itemCount: number } | null {
    const stmt = this.db.prepare(`
      SELECT summary_text, generated_at, item_count
      FROM dashboard_summary_cache
      WHERE section_type = ?
        AND valid_until > datetime('now')
      ORDER BY generated_at DESC
      LIMIT 1
    `);
    const result: any = stmt.get(sectionType);

    if (!result) {
      return null;
    }

    return {
      summary: result.summary_text,
      generatedAt: result.generated_at,
      itemCount: result.item_count,
    };
  }

  /**
   * Save summary to cache
   */
  saveSummaryCache(
    sectionType: string,
    summary: string,
    itemIds: string[],
    validMinutes: number = 30
  ): void {
    const now = new Date();
    const validUntil = new Date(now.getTime() + validMinutes * 60 * 1000);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO dashboard_summary_cache
      (id, section_type, summary_text, generated_at, valid_until, item_count, item_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      sectionType, // Use section as ID for simple replacement
      sectionType,
      summary,
      now.toISOString(),
      validUntil.toISOString(),
      itemIds.length,
      JSON.stringify(itemIds)
    );
  }

  /**
   * Invalidate summary cache for a section
   */
  invalidateSummaryCache(sectionType?: string): void {
    if (sectionType) {
      const stmt = this.db.prepare('DELETE FROM dashboard_summary_cache WHERE section_type = ?');
      stmt.run(sectionType);
    } else {
      this.db.exec('DELETE FROM dashboard_summary_cache');
    }
  }
}
