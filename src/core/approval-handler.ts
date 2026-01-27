/**
 * Approval Handler
 * Manages approval tokens and executes approved operations
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseClient } from '../database/client.js';
import type { CalendarWriter } from './calendar-writer.js';
import type { ApprovalToken, CalendarOperation, PersistedEvent } from '../types/index.js';
import type { Logger } from 'winston';

export interface ApprovalResult {
  success: boolean;
  message: string;
  calendarEventId?: string;
  error?: string;
}

export class ApprovalHandler {
  constructor(
    private db: DatabaseClient,
    private calendarWriter: CalendarWriter,
    private calendarId: string,
    private logger: Logger
  ) {}

  /**
   * Generate a new approval token for a calendar operation
   * Tokens expire in 2 hours
   */
  async generateToken(operationId: string): Promise<ApprovalToken> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    const token: ApprovalToken = {
      id: uuidv4(),
      operationId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      approved: false,
      used: false,
    };

    await this.db.insertApprovalToken(token);
    this.logger.info('approval', 'token-generated', { tokenId: token.id, operationId });

    return token;
  }

  /**
   * Validate an approval token
   * Returns error message if invalid, null if valid
   */
  async validateToken(tokenId: string): Promise<string | null> {
    const token = await this.db.getApprovalToken(tokenId);
    
    if (!token) {
      return 'Token not found';
    }

    if (token.used) {
      return 'Token has already been used';
    }

    const now = new Date();
    const expiresAt = new Date(token.expiresAt);
    
    if (now > expiresAt) {
      return 'Token has expired';
    }

    return null; // Valid
  }

  /**
   * Approve and execute a calendar operation
   */
  async approveAndExecute(tokenId: string): Promise<ApprovalResult> {
    // Validate token
    const validationError = await this.validateToken(tokenId);
    if (validationError) {
      this.logger.warn('approval', 'validation-failed', { tokenId, error: validationError });
      return {
        success: false,
        message: validationError,
        error: validationError,
      };
    }

    const token = (await this.db.getApprovalToken(tokenId))!;
    
    // Mark token as approved and used
    await this.db.updateApprovalToken(tokenId, {
      approved: true,
      approvedAt: new Date().toISOString(),
      used: true,
    });

    // Get the calendar operation
    const operation = await this.db.getCalendarOperation(token.operationId);
    if (!operation) {
      const error = 'Calendar operation not found';
      this.logger.error('approval', 'operation-not-found', { operationId: token.operationId });
      return {
        success: false,
        message: error,
        error,
      };
    }

    // Get the associated event
    const event = await this.db.getEventByFingerprint(operation.eventFingerprint);
    if (!event) {
      const error = 'Event not found';
      this.logger.error('approval', 'event-not-found', { fingerprint: operation.eventFingerprint });
      return {
        success: false,
        message: error,
        error,
      };
    }

    try {
      // Execute the operation via CalendarWriter
      let calendarEventId: string;

      switch (operation.type) {
        case 'create':
          calendarEventId = await this.executeCreate(event);
          break;
        case 'update':
          if (!operation.calendarEventId) {
            throw new Error('Calendar event ID required for update operation');
          }
          calendarEventId = await this.executeUpdate(event, operation.calendarEventId);
          break;
        default:
          throw new Error(`Unsupported operation type: ${operation.type}`);
      }

      // Update operation status
      await this.db.updateCalendarOperation(operation.id, {
        status: 'executed',
        executedAt: new Date().toISOString(),
        calendarEventId,
      });

      // Update event status
      await this.db.updateEvent(event.fingerprint, {
        status: 'created',
        calendarEventId,
      });

      this.logger.info('approval', 'operation-executed', { operationId: operation.id, calendarEventId });

      return {
        success: true,
        message: `Event "${event.eventIntent.title}" has been added to your calendar`,
        calendarEventId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update operation status
      await this.db.updateCalendarOperation(operation.id, {
        status: 'failed',
        error: errorMessage,
      });

      // Update event status
      await this.db.updateEvent(event.fingerprint, {
        status: 'failed',
        error: errorMessage,
      });

      this.logger.error('approval', 'execution-failed', { operationId: operation.id, error: errorMessage });

      return {
        success: false,
        message: `Failed to create event: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a create operation
   */
  private async executeCreate(event: PersistedEvent): Promise<string> {
    const result = await this.calendarWriter.createEvent(this.calendarId, event.eventIntent);
    return result.id!;
  }

  /**
   * Execute an update operation
   */
  private async executeUpdate(event: PersistedEvent, calendarEventId: string): Promise<string> {
    await this.calendarWriter.updateEvent(this.calendarId, calendarEventId, event.eventIntent);
    return calendarEventId;
  }

  /**
   * Reject a pending operation
   */
  async reject(tokenId: string, reason?: string): Promise<ApprovalResult> {
    const validationError = await this.validateToken(tokenId);
    if (validationError) {
      return {
        success: false,
        message: validationError,
        error: validationError,
      };
    }

    const token = (await this.db.getApprovalToken(tokenId))!;
    
    // Mark token as used (but not approved)
    await this.db.updateApprovalToken(tokenId, {
      approved: false,
      used: true,
    });

    // Get the operation and mark as rejected
    const operation = await this.db.getCalendarOperation(token.operationId);
    if (operation) {
      await this.db.updateCalendarOperation(operation.id, {
        status: 'rejected',
        error: reason || 'User rejected',
      });

      // Update associated event
      const event = await this.db.getEventByFingerprint(operation.eventFingerprint);
      if (event) {
        await this.db.updateEvent(event.fingerprint, {
          status: 'flagged',
          error: reason || 'User rejected',
        });
      }
    }

    this.logger.info('approval', 'operation-rejected', { operationId: token.operationId, reason: reason || 'none' });

    return {
      success: true,
      message: 'Event has been rejected',
    };
  }

  /**
   * Cleanup expired tokens (run periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const count = await this.db.cleanupExpiredTokens();
    if (count > 0) {
      this.logger.info('approval', 'cleanup-tokens', { count });
    }
    return count;
  }

  /**
   * Get approval token by operation ID
   */
  async getTokenForOperation(operationId: string): Promise<ApprovalToken | undefined> {
    return await this.db.getApprovalTokenByOperation(operationId);
  }
}
