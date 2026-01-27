/**
 * Logger - Structured logging with Winston
 * All log entries also written to audit_logs table
 */

import winston from 'winston';
import type { AuditLog } from '../types/index.js';
import type { DatabaseClient } from '../database/client.js';

export class Logger {
  private winston: winston.Logger;
  private db?: DatabaseClient;

  constructor(db?: DatabaseClient) {
    this.db = db;

    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
      ],
    });

    // Add file transport if LOG_FILE is specified
    if (process.env.LOG_FILE) {
      this.winston.add(
        new winston.transports.File({
          filename: process.env.LOG_FILE,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        })
      );
    }
  }

  debug(module: string, action: string, details: Record<string, unknown>): void {
    this.log('debug', module, action, details);
  }

  info(module: string, action: string, details: Record<string, unknown>): void {
    this.log('info', module, action, details);
  }

  warn(module: string, action: string, details: Record<string, unknown>): void {
    this.log('warn', module, action, details);
  }

  error(module: string, action: string, details: Record<string, unknown>, error?: Error): void {
    const enrichedDetails = { ...details };
    if (error) {
      enrichedDetails.error = error.message;
      enrichedDetails.stack = error.stack;
    }
    this.log('error', module, action, enrichedDetails);
  }

  private log(
    level: AuditLog['level'],
    module: string,
    action: string,
    details: Record<string, unknown>
  ): void {
    this.winston.log(level, `[${module}] ${action}`, details);

    // Also write to audit_logs if DB is available (fire-and-forget async)
    if (this.db) {
      const auditLog: AuditLog = {
        timestamp: new Date().toISOString(),
        level,
        module,
        action,
        details,
        messageId: details.messageId as string | undefined,
        eventFingerprint: details.eventFingerprint as string | undefined,
        userId: details.userId as string | undefined,
      };
      this.db.insertAuditLog(auditLog).catch((err) => {
        // Fallback to console if DB write fails
        this.winston.error('Failed to write audit log to database', { error: err });
      });
    }
  }
}
