/**
 * Database Layer - Provides typed access to SQLite
 * All database operations go through this module
 */

import Database from 'better-sqlite3';
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
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO pending_approvals (
        id, message_id, pack_id, relevance_score,
        from_email, from_name, subject, snippet, created_at, approved,
        primary_category, secondary_categories, category_scores, save_reasons,
        person, assignment_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
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
      approval.assignmentReason || null
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
    const { v4: uuid } = require('uuid');
    
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
}
