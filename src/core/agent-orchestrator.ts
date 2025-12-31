/**
 * Agent Orchestrator
 * Main entry point - coordinates all agent operations
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AgentConfig,
  AgentMode,
  ExtractedEvent,
  PersistedEvent,
  CalendarOperation,
  ProcessedMessage,
  ForwardedMessage,
  ForwardingCondition,
} from '../types/index.js';
import type { DatabaseClient } from '../database/client.js';
import type { Logger } from '../utils/logger.js';
import type { GmailConnector } from './gmail-connector.js';
import type { CalendarWriter } from './calendar-writer.js';
import type { EventExtractor } from './event-extractor.js';
import type { PackRegistry } from './pack-registry.js';
import { FingerprintGenerator } from '../utils/fingerprint.js';

export class AgentOrchestrator {
  constructor(
    private config: AgentConfig,
    private mode: AgentMode,
    private db: DatabaseClient,
    private gmail: GmailConnector,
    private calendar: CalendarWriter,
    private extractor: EventExtractor,
    private packRegistry: PackRegistry,
    private logger: Logger
  ) {}

  /**
   * Main agent run - process emails and create/update events
   */
  async run(): Promise<void> {
    this.logger.info('AgentOrchestrator', 'run_started', {
      mode: this.mode,
      packsEnabled: this.config.packs.length,
    });

    try {
      // Process each enabled pack
      for (const enabledPack of this.config.packs) {
        const pack = this.packRegistry.get(enabledPack.packId);
        if (!pack) {
          this.logger.warn('AgentOrchestrator', 'pack_not_found', {
            packId: enabledPack.packId,
          });
          continue;
        }

        await this.processPack(enabledPack.packId, enabledPack.config);
      }

      this.logger.info('AgentOrchestrator', 'run_completed', {});
    } catch (error) {
      this.logger.error('AgentOrchestrator', 'run_failed', {}, error as Error);
      throw error;
    }
  }

  /**
   * Process a single pack
   */
  private async processPack(packId: string, packConfig: any): Promise<void> {
    this.logger.info('AgentOrchestrator', 'pack_processing_started', { packId });

    // Build query from sources
    const queries = this.buildQueries(packConfig);

    let processedCount = 0;

    for (const query of queries) {
      // Fetch messages
      const messageIds = await this.gmail.listMessages(
        query,
        this.config.processing.maxEmailsPerRun
      );

      this.logger.info('AgentOrchestrator', 'messages_fetched', {
        packId,
        query,
        count: messageIds.length,
      });

      // Process each message (unit of work = one email)
      for (const messageId of messageIds) {
        try {
          await this.processMessage(messageId, packId, packConfig);
          processedCount++;
        } catch (error) {
          this.logger.error(
            'AgentOrchestrator',
            'message_processing_failed',
            { messageId, packId },
            error as Error
          );

          // Record exception but continue processing
          await this.recordException(messageId, packId, error as Error);
        }
      }
    }

    this.logger.info('AgentOrchestrator', 'pack_processing_completed', {
      packId,
      processedCount,
    });
  }

  /**
   * Process a single message
   * INVARIANT: Never process the same message twice
   */
  private async processMessage(
    messageId: string,
    packId: string,
    packConfig: any
  ): Promise<void> {
    // Check if already processed
    const existing = this.db.getProcessedMessage(messageId);
    if (existing) {
      this.logger.debug('AgentOrchestrator', 'message_already_processed', {
        messageId,
        packId,
      });
      return;
    }

    this.logger.info('AgentOrchestrator', 'processing_message', { messageId, packId });

    // Fetch message
    const message = await this.gmail.getMessage(messageId);
    if (!message) {
      this.logger.warn('AgentOrchestrator', 'message_not_found', { messageId });
      return;
    }

    // Get body and attachments
    const body = this.gmail.getBody(message);
    const attachments = await this.gmail.getAttachments(message);

    // Extract events
    const extractedEvents = await this.extractor.extractEvents(
      message,
      body,
      attachments,
      packId,
      packConfig.extractionHints.preferIcsOverText
    );

    this.logger.info('AgentOrchestrator', 'events_extracted', {
      messageId,
      packId,
      count: extractedEvents.length,
    });

    // Process each extracted event
    const fingerprints: string[] = [];

    for (const extractedEvent of extractedEvents) {
      try {
        await this.processExtractedEvent(extractedEvent);
        fingerprints.push(extractedEvent.fingerprint);
      } catch (error) {
        this.logger.error(
          'AgentOrchestrator',
          'event_processing_failed',
          { messageId, fingerprint: extractedEvent.fingerprint },
          error as Error
        );
      }
    }

    // Mark message as processed
    const processedMessage: ProcessedMessage = {
      messageId,
      processedAt: new Date().toISOString(),
      packId,
      extractionStatus: extractedEvents.length > 0 ? 'success' : 'skipped',
      eventsExtracted: extractedEvents.length,
      fingerprints,
    };

    this.db.insertProcessedMessage(processedMessage);

    // Apply label if configured
    const source = packConfig.sources.find((s: any) => s.enabled);
    if (source?.label) {
      await this.gmail.addLabel(messageId, source.label);
    }

    // Check if forwarding should be triggered
    if (packConfig.forwarding?.enabled && extractedEvents.length === 0) {
      await this.handleForwarding(message, messageId, packId, packConfig);
    }
  }

  /**
   * Handle email forwarding based on pack configuration
   */
  private async handleForwarding(
    message: any,
    messageId: string,
    packId: string,
    packConfig: any
  ): Promise<void> {
    const forwardingConfig = packConfig.forwarding;
    if (!forwardingConfig || !forwardingConfig.enabled) return;

    // Check if already forwarded
    const existingForward = this.db.getForwardedMessage(messageId);
    if (existingForward) {
      this.logger.debug('AgentOrchestrator', 'message_already_forwarded', {
        messageId,
        packId,
      });
      return;
    }

    // Evaluate forwarding conditions
    const matchedConditions = this.evaluateForwardingConditions(
      message,
      forwardingConfig.conditions,
      packConfig
    );

    if (matchedConditions.length === 0) {
      this.logger.debug('AgentOrchestrator', 'forwarding_conditions_not_met', {
        messageId,
        packId,
      });
      return;
    }

    // Build reason
    const reason = this.buildForwardingReason(matchedConditions);

    this.logger.info('AgentOrchestrator', 'forwarding_email', {
      messageId,
      packId,
      forwardTo: forwardingConfig.forwardTo,
      reason,
    });

    const forwardedMessage: ForwardedMessage = {
      id: uuidv4(),
      sourceMessageId: messageId,
      forwardedAt: new Date().toISOString(),
      forwardedTo: forwardingConfig.forwardTo,
      packId,
      reason,
      conditions: matchedConditions,
      success: false,
    };

    try {
      // Don't forward in dry-run mode
      if (this.mode !== 'dry-run') {
        await this.gmail.forwardMessage(
          message,
          forwardingConfig.forwardTo,
          reason,
          forwardingConfig.subjectPrefix || '[FCA] ',
          forwardingConfig.includeOriginal ?? true
        );
      }

      forwardedMessage.success = true;
      this.db.insertForwardedMessage(forwardedMessage);

      this.logger.info('AgentOrchestrator', 'email_forwarded', {
        messageId,
        packId,
        forwardTo: forwardingConfig.forwardTo,
      });
    } catch (error) {
      forwardedMessage.success = false;
      forwardedMessage.error = (error as Error).message;
      this.db.insertForwardedMessage(forwardedMessage);

      this.logger.error(
        'AgentOrchestrator',
        'forwarding_failed',
        { messageId, packId },
        error as Error
      );

      await this.recordException(messageId, packId, error as Error, 'forwarding_error');
    }
  }

  /**
   * Evaluate which forwarding conditions are met
   */
  private evaluateForwardingConditions(
    message: any,
    conditions: ForwardingCondition[],
    packConfig: any
  ): ForwardingCondition[] {
    const matched: ForwardingCondition[] = [];
    const subject = this.gmail.getHeader(message, 'subject') || '';
    const body = this.gmail.getBody(message);
    const text = `${subject} ${body.text || ''}`.toLowerCase();

    for (const condition of conditions) {
      let isMatch = false;

      switch (condition.type) {
        case 'no_event_found':
          // This is implicit - we only call this when events.length === 0
          isMatch = true;
          break;

        case 'keyword_match':
          if (Array.isArray(condition.value)) {
            isMatch = (condition.value as string[]).some((keyword) =>
              text.includes(keyword.toLowerCase())
            );
          } else if (typeof condition.value === 'string') {
            isMatch = text.includes(condition.value.toLowerCase());
          }
          break;

        case 'always':
          isMatch = true;
          break;

        case 'confidence_below':
          // Not applicable when no event extracted
          isMatch = false;
          break;
      }

      // Check exclude patterns
      if (isMatch && condition.excludePatterns) {
        const hasExcluded = condition.excludePatterns.some((pattern) =>
          text.includes(pattern.toLowerCase())
        );
        if (hasExcluded) {
          isMatch = false;
        }
      }

      if (isMatch) {
        matched.push(condition);
      }
    }

    return matched;
  }

  /**
   * Build human-readable forwarding reason
   */
  private buildForwardingReason(conditions: ForwardingCondition[]): string {
    const reasons = conditions.map((c) => {
      switch (c.type) {
        case 'no_event_found':
          return 'No calendar event found but message matched pack criteria';
        case 'keyword_match':
          return `Matched keywords: ${Array.isArray(c.value) ? c.value.join(', ') : c.value}`;
        case 'always':
          return 'Always forward matching messages';
        default:
          return `Condition met: ${c.type}`;
      }
    });

    return reasons.join(' | ');
  }

  /**
   * Process an extracted event
   * INVARIANT: Never create duplicate events
   */
  private async processExtractedEvent(extractedEvent: ExtractedEvent): Promise<void> {
    const { fingerprint, sourceMessageId, sourcePack, confidence, event } = extractedEvent;

    // Check for duplicates within deduplication window
    const dateKey = event.startDateTime.split('T')[0];
    const duplicates = this.db.findDuplicateEvents(
      fingerprint,
      dateKey,
      this.config.processing.deduplicationWindowDays
    );

    if (duplicates.length > 0) {
      this.logger.info('AgentOrchestrator', 'duplicate_detected', {
        fingerprint,
        existing: duplicates.length,
      });

      await this.recordException(
        sourceMessageId,
        sourcePack,
        new Error('Duplicate event detected'),
        'duplicate_detected'
      );

      return;
    }

    // Check confidence threshold
    const shouldAutoCreate = confidence >= this.config.confidence.autoCreate;
    const requiresReview = confidence < this.config.confidence.requireReviewBelow;

    // Create persisted event
    const persistedEvent: PersistedEvent = {
      id: uuidv4(),
      fingerprint,
      sourceMessageId,
      packId: sourcePack,
      eventIntent: event,
      confidence,
      status: shouldAutoCreate && !requiresReview ? 'approved' : 'pending_approval',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      manuallyEdited: false,
    };

    this.db.insertEvent(persistedEvent);

    // Create calendar operation
    const operation: CalendarOperation = {
      id: uuidv4(),
      type: 'create',
      eventFingerprint: fingerprint,
      eventIntent: event,
      reason: `Extracted from email (confidence: ${confidence.toFixed(2)})`,
      requiresApproval: requiresReview || this.mode === 'copilot',
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    this.db.insertCalendarOperation(operation);

    // Execute immediately in autopilot mode (if high confidence)
    if (this.mode === 'autopilot' && shouldAutoCreate && !requiresReview) {
      await this.executeOperation(operation);
    } else if (this.mode === 'dry-run') {
      this.logger.info('AgentOrchestrator', 'dry_run_skip', {
        fingerprint,
        operation: operation.type,
      });
    }
  }

  /**
   * Execute a calendar operation
   */
  private async executeOperation(operation: CalendarOperation): Promise<void> {
    if (this.mode === 'dry-run') {
      this.logger.info('AgentOrchestrator', 'dry_run_skip_execution', {
        operationId: operation.id,
      });
      return;
    }

    try {
      this.logger.info('AgentOrchestrator', 'executing_operation', {
        operationId: operation.id,
        type: operation.type,
      });

      const calendarEvent = await this.calendar.createEvent(
        this.config.calendar.calendarId,
        operation.eventIntent
      );

      // Update operation
      this.db.updateCalendarOperation(operation.id, {
        status: 'executed',
        executedAt: new Date().toISOString(),
        calendarEventId: calendarEvent.id!,
      });

      // Update event
      this.db.updateEvent(operation.eventFingerprint, {
        status: 'created',
        calendarEventId: calendarEvent.id!,
        lastSyncedAt: new Date().toISOString(),
      });

      this.logger.info('AgentOrchestrator', 'operation_executed', {
        operationId: operation.id,
        calendarEventId: calendarEvent.id,
      });
    } catch (error) {
      this.logger.error(
        'AgentOrchestrator',
        'operation_execution_failed',
        { operationId: operation.id },
        error as Error
      );

      this.db.updateCalendarOperation(operation.id, {
        status: 'failed',
        error: (error as Error).message,
      });

      this.db.updateEvent(operation.eventFingerprint, {
        status: 'failed',
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Build Gmail queries from pack config
   */
  private buildQueries(packConfig: any): string[] {
    const queries: string[] = [];
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - this.config.processing.lookbackDays);

    for (const source of packConfig.sources) {
      if (!source.enabled) continue;

      const parts: string[] = [];

      // Date filter
      parts.push(
        `after:${lookbackDate.getFullYear()}/${lookbackDate.getMonth() + 1}/${lookbackDate.getDate()}`
      );

      // From domains
      if (source.fromDomains && source.fromDomains.length > 0) {
        const domainQuery = source.fromDomains.map((d: string) => `from:*@${d}`).join(' OR ');
        parts.push(`(${domainQuery})`);
      }

      // From addresses
      if (source.fromAddresses && source.fromAddresses.length > 0) {
        const addressQuery = source.fromAddresses.map((a: string) => `from:${a}`).join(' OR ');
        parts.push(`(${addressQuery})`);
      }

      // Keywords
      if (source.keywords && source.keywords.length > 0) {
        const keywordQuery = source.keywords.map((k: string) => `"${k}"`).join(' OR ');
        parts.push(`(${keywordQuery})`);
      }

      queries.push(parts.join(' '));
    }

    return queries;
  }

  /**
   * Record an exception
   */
  private async recordException(
    messageId: string,
    packId: string,
    error: Error,
    type: any = 'extraction_error'
  ): Promise<void> {
    const exception = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type,
      severity: 'medium' as const,
      message: error.message,
      context: {
        messageId,
        packId,
        stack: error.stack,
      },
      resolved: false,
    };

    this.db.insertException(exception);
  }
}
