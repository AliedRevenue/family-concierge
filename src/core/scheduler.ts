/**
 * Scheduler
 * Manages periodic agent runs and digest generation using node-cron
 */

import cron from 'node-cron';
import type { Logger } from 'winston';
import type { AgentConfig } from '../types/index.js';

export interface ScheduledJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  job: cron.ScheduledTask;
}

export class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();

  constructor(private logger: Logger) {}

  /**
   * Schedule the agent to run periodically
   */
  scheduleAgentRun(schedule: string, runAgent: () => Promise<void>): void {
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    const job = cron.schedule(
      schedule,
      async () => {
        try {
          this.logger.info('Starting scheduled agent run');
          await runAgent();
          this.logger.info('Scheduled agent run completed');
        } catch (error) {
          this.logger.error('Scheduled agent run failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        scheduled: false, // Don't start immediately
      }
    );

    this.jobs.set('agent-run', {
      name: 'agent-run',
      schedule,
      task: runAgent,
      job,
    });

    this.logger.info(`Scheduled agent runs with cron: ${schedule}`);
  }

  /**
   * Schedule digest generation
   */
  scheduleDigest(schedule: string, generateDigest: () => Promise<void>): void {
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    const job = cron.schedule(
      schedule,
      async () => {
        try {
          this.logger.info('Starting scheduled digest generation');
          await generateDigest();
          this.logger.info('Scheduled digest generation completed');
        } catch (error) {
          this.logger.error('Scheduled digest generation failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        scheduled: false,
      }
    );

    this.jobs.set('digest', {
      name: 'digest',
      schedule,
      task: generateDigest,
      job,
    });

    this.logger.info(`Scheduled digest generation with cron: ${schedule}`);
  }

  /**
   * Schedule cleanup tasks (expired tokens, old logs, etc.)
   */
  scheduleCleanup(schedule: string, cleanup: () => Promise<void>): void {
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    const job = cron.schedule(
      schedule,
      async () => {
        try {
          this.logger.debug('Starting scheduled cleanup');
          await cleanup();
          this.logger.debug('Scheduled cleanup completed');
        } catch (error) {
          this.logger.error('Scheduled cleanup failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        scheduled: false,
      }
    );

    this.jobs.set('cleanup', {
      name: 'cleanup',
      schedule,
      task: cleanup,
      job,
    });

    this.logger.info(`Scheduled cleanup tasks with cron: ${schedule}`);
  }

  /**
   * Start all scheduled jobs
   */
  startAll(): void {
    for (const [name, scheduledJob] of this.jobs.entries()) {
      scheduledJob.job.start();
      this.logger.info(`Started scheduled job: ${name} (${scheduledJob.schedule})`);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll(): void {
    for (const [name, scheduledJob] of this.jobs.entries()) {
      scheduledJob.job.stop();
      this.logger.info(`Stopped scheduled job: ${name}`);
    }
  }

  /**
   * Start a specific job
   */
  start(jobName: string): void {
    const scheduledJob = this.jobs.get(jobName);
    if (!scheduledJob) {
      throw new Error(`Job not found: ${jobName}`);
    }
    scheduledJob.job.start();
    this.logger.info(`Started scheduled job: ${jobName} (${scheduledJob.schedule})`);
  }

  /**
   * Stop a specific job
   */
  stop(jobName: string): void {
    const scheduledJob = this.jobs.get(jobName);
    if (!scheduledJob) {
      throw new Error(`Job not found: ${jobName}`);
    }
    scheduledJob.job.stop();
    this.logger.info(`Stopped scheduled job: ${jobName}`);
  }

  /**
   * Remove a scheduled job
   */
  remove(jobName: string): void {
    const scheduledJob = this.jobs.get(jobName);
    if (scheduledJob) {
      scheduledJob.job.stop();
      this.jobs.delete(jobName);
      this.logger.info(`Removed scheduled job: ${jobName}`);
    }
  }

  /**
   * Get status of all jobs
   */
  getStatus(): Array<{ name: string; schedule: string; running: boolean }> {
    return Array.from(this.jobs.values()).map(job => ({
      name: job.name,
      schedule: job.schedule,
      running: true, // node-cron doesn't expose status, assume running if in map
    }));
  }

  /**
   * Configure schedules from config file
   */
  configureFromConfig(config: AgentConfig, handlers: {
    runAgent: () => Promise<void>;
    generateDigest: () => Promise<void>;
    cleanup: () => Promise<void>;
  }): void {
    // Schedule agent runs if configured
    if (config.schedule?.agentRuns) {
      this.scheduleAgentRun(config.schedule.agentRuns, handlers.runAgent);
    }

    // Schedule digest generation
    if (config.digests?.frequency) {
      const digestSchedule = this.frequencyToCron(config.digests.frequency);
      this.scheduleDigest(digestSchedule, handlers.generateDigest);
    }

    // Schedule cleanup (daily at 3am by default)
    const cleanupSchedule = config.schedule?.cleanup || '0 3 * * *';
    this.scheduleCleanup(cleanupSchedule, handlers.cleanup);

    this.logger.info('Configured scheduler from config file');
  }

  /**
   * Convert frequency string to cron expression
   */
  private frequencyToCron(frequency: string): string {
    switch (frequency.toLowerCase()) {
      case 'daily':
        return '0 9 * * *'; // 9am daily
      case 'weekly':
        return '0 9 * * 1'; // 9am Monday
      case 'biweekly':
        return '0 9 1,15 * *'; // 9am on 1st and 15th
      default:
        // If it's already a cron expression, validate and return
        if (cron.validate(frequency)) {
          return frequency;
        }
        throw new Error(`Invalid frequency: ${frequency}. Use 'daily', 'weekly', 'biweekly', or a valid cron expression.`);
    }
  }
}
