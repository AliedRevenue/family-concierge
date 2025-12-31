/**
 * Backfill Command
 * Safely backfill events from historical emails with enforced dry-run workflow
 */

import { parseArgs } from 'node:util';
import { format, subDays, addDays } from 'date-fns';
import type { AgentOrchestrator } from './core/agent-orchestrator.js';
import type { Logger } from './utils/logger.js';

export interface BackfillOptions {
  from: string;
  to: string;
  dryRun: boolean;
  confirm?: boolean;
  maxEvents?: number;
}

export interface BackfillResult {
  messagesScanned: number;
  eventsExtracted: number;
  highConfidence: number;
  lowConfidence: number;
  eventsCreated: number;
  errors: string[];
}

export class BackfillCommand {
  constructor(
    private _orchestrator: AgentOrchestrator, // Prefix with _ to indicate intentionally unused for now
    private logger: Logger
  ) {}

  /**
   * Parse command-line arguments
   */
  static parseArgs(args: string[]): BackfillOptions {
    const { values } = parseArgs({
      args,
      options: {
        from: { type: 'string' },
        to: { type: 'string' },
        'dry-run': { type: 'boolean', default: true },
        confirm: { type: 'boolean', default: false },
        'max-events': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });

    // Default: last 30 days
    const defaultTo = format(new Date(), 'yyyy-MM-dd');
    const defaultFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd');

    return {
      from: values.from || defaultFrom,
      to: values.to || defaultTo,
      dryRun: values['dry-run'] !== false, // Enforce dry-run unless explicitly disabled
      confirm: values.confirm || false,
      maxEvents: values['max-events'] ? parseInt(values['max-events'], 10) : 100,
    };
  }

  /**
   * Execute backfill with safety checks
   */
  async execute(options: BackfillOptions): Promise<BackfillResult> {
    this.logger.info('backfill', 'starting', { from: options.from, to: options.to, dryRun: options.dryRun });

    // Validate date range
    this.validateDateRange(options.from, options.to);

    // Safety check: Enforce dry-run on first pass
    if (!options.dryRun && !options.confirm) {
      throw new Error(
        'Cannot run backfill without dry-run. First run with --dry-run to preview changes, then use --confirm to execute.'
      );
    }

    // Safety check: Cap events
    const maxEvents = options.maxEvents || 100;
    if (maxEvents > 1000) {
      throw new Error('Maximum 1000 events per backfill run. Break into smaller batches.');
    }

    const result: BackfillResult = {
      messagesScanned: 0,
      eventsExtracted: 0,
      highConfidence: 0,
      lowConfidence: 0,
      eventsCreated: 0,
      errors: [],
    };

    try {
      if (options.dryRun) {
        this.logger.info('backfill', 'mode', { mode: 'dry-run' });
        await this.executeDryRun(options, result);
      } else {
        this.logger.info('backfill', 'mode', { mode: 'live' });
        await this.executeLive(options, result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      this.logger.error('backfill', 'failed', { error: errorMessage });
    }

    this.printSummary(result, options);
    return result;
  }

  /**
   * Execute dry-run (preview only)
   */
  private async executeDryRun(_options: BackfillOptions, _result: BackfillResult): Promise<void> {
    // TODO: Implement when AgentOrchestrator has fetchMessagesInDateRange and extractEventsFromMessage methods
    this.logger.warn('backfill', 'dry-run-not-implemented', { message: 'Backfill dry-run not yet implemented' });
    throw new Error('Backfill functionality requires AgentOrchestrator refactoring - deferred to future task');
  }

  /**
   * Execute live (create events)
   */
  private async executeLive(_options: BackfillOptions, _result: BackfillResult): Promise<void> {
    // TODO: Implement when AgentOrchestrator has proper message processing interface
    this.logger.warn('backfill', 'live-not-implemented', { message: 'Backfill live mode not yet implemented' });
    throw new Error('Backfill functionality requires AgentOrchestrator refactoring - deferred to future task');
  }

  /**
   * Validate date range
   */
  private validateDateRange(from: string, to: string): void {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const now = new Date();

    if (isNaN(fromDate.getTime())) {
      throw new Error(`Invalid from date: ${from}. Use format: YYYY-MM-DD`);
    }

    if (isNaN(toDate.getTime())) {
      throw new Error(`Invalid to date: ${to}. Use format: YYYY-MM-DD`);
    }

    if (fromDate > toDate) {
      throw new Error('from date must be before to date');
    }

    if (toDate > addDays(now, 1)) {
      throw new Error('to date cannot be in the future');
    }

    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      throw new Error('Date range cannot exceed 365 days. Break into smaller batches.');
    }
  }

  /**
   * Print summary to console
   */
  private printSummary(result: BackfillResult, options: BackfillOptions): void {
    console.log('\n' + '='.repeat(60));
    console.log('BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Date Range: ${options.from} to ${options.to}`);
    console.log(`Messages Scanned: ${result.messagesScanned}`);
    console.log(`Events Extracted: ${result.eventsExtracted}`);
    console.log(`  - High Confidence (≥70%): ${result.highConfidence}`);
    console.log(`  - Low Confidence (<70%): ${result.lowConfidence}`);
    
    if (!options.dryRun) {
      console.log(`Events Created: ${result.eventsCreated}`);
    }
    
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.length}`);
      console.log('\nErrors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    console.log('='.repeat(60));

    if (options.dryRun && result.eventsExtracted > 0) {
      console.log('\n✅ Dry run complete. To create these events, run:');
      console.log(`   npm run backfill -- --from ${options.from} --to ${options.to} --dry-run=false --confirm`);
    } else if (!options.dryRun) {
      console.log('\n✅ Backfill complete!');
    }
  }

  /**
   * Rollback backfilled events (emergency use only)
   */
  async rollback(options: { from: string; to: string; confirm: boolean }): Promise<void> {
    if (!options.confirm) {
      throw new Error('Rollback requires --confirm flag');
    }

    this.logger.warn('backfill', 'rollback-starting', options);

    // TODO: Implement rollback logic
    // - Query events created in date range
    // - Filter by provenance.method or creation timestamp
    // - Delete from calendar
    // - Update database status

    throw new Error('Rollback not yet implemented');
  }
}
