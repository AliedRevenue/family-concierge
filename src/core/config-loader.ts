/**
 * Config Loader
 * Loads and validates agent configuration from YAML/JSON
 */

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { AgentConfig } from '../types/index.js';

// Zod schema for runtime validation
// Family member schema
const FamilyMemberSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  groupAliases: z.array(z.string()).optional(),
  grade: z.string().optional(),
  gradeAliases: z.array(z.string()).optional(),
});

// External calendar schema
const ExternalCalendarSchema = z.object({
  name: z.string(),
  url: z.string(),
  type: z.enum(['school', 'assignments', 'activities', 'other']),
  enabled: z.boolean(),
  syncFrequency: z.enum(['daily', 'weekly', 'monthly']),
  filterByGrade: z.boolean().optional(),
});

const AgentConfigSchema = z.object({
  version: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  packs: z.array(
    z.object({
      packId: z.string(),
      priority: z.number().min(1).max(100),
      config: z.object({
        sources: z.array(
          z.object({
            name: z.string(),
            type: z.literal('email'),
            fromDomains: z.array(z.string()).optional(),
            fromAddresses: z.array(z.string()).optional(),
            keywords: z.array(z.string()).optional(),
            requiredKeywords: z.array(z.string()).optional(),
            label: z.string().optional(),
            enabled: z.boolean(),
          })
        ),
        extractionHints: z.object({
          preferIcsOverText: z.boolean(),
          dateFormats: z.array(z.string()).optional(),
          defaultDuration: z.number(),
          fallbackTime: z.string().optional(),
          requireExplicitTime: z.boolean(),
        }),
        eventDefaults: z.object({
          durationMinutes: z.number(),
          reminderMinutes: z.array(z.number()).optional(),
          color: z.string().optional(),
        }),
      }),
    })
  ),
  calendar: z.object({
    calendarId: z.string(),
    timezone: z.string(),
  }),
  family: z.object({
    members: z.array(FamilyMemberSchema),
    defaultAssignmentFallback: z.string().optional(),
  }).optional(),
  externalCalendars: z.array(ExternalCalendarSchema).optional(),
  invites: z.object({
    defaultGuests: z.array(z.string()),
    policy: z.enum(['always', 'conditional', 'manual']),
    conditionalRules: z
      .array(
        z.object({
          condition: z.enum(['pack', 'keyword', 'confidence']),
          value: z.union([z.string(), z.number()]),
          guests: z.array(z.string()),
        })
      )
      .optional(),
  }),
  confidence: z.object({
    autoCreate: z.number().min(0).max(1),
    autoUpdate: z.number().min(0).max(1),
    requireReviewBelow: z.number().min(0).max(1),
  }),
  defaults: z.object({
    eventDurationMinutes: z.number(),
    fallbackTime: z.string(),
    createIfTimeUnknown: z.boolean(),
  }),
  processing: z.object({
    maxEmailsPerRun: z.number(),
    lookbackDays: z.number(),
    deduplicationWindowDays: z.number(),
  }),
  notifications: z.object({
    email: z.string().email(),
    sendOnError: z.boolean(),
    sendDigests: z.boolean(),
  }),
  digests: z.object({
    frequency: z.string(),
    recipients: z.array(z.string()).optional(),
    recipient: z.string().optional(),
    includeForwarded: z.boolean(),
    includePending: z.boolean(),
  }).optional(),
});

export class ConfigLoader {
  /**
   * Load config from file path
   */
  static load(configPath: string): AgentConfig {
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    const content = readFileSync(configPath, 'utf-8');

    let parsed: unknown;
    if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
      parsed = parseYaml(content);
    } else if (configPath.endsWith('.json')) {
      parsed = JSON.parse(content);
    } else {
      throw new Error(`Unsupported config format: ${configPath}. Use .yaml or .json`);
    }

    // Validate with Zod
    const result = AgentConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Config validation failed: ${result.error.message}`);
    }

    return result.data as AgentConfig;
  }

  /**
   * Create default config (for bootstrapping)
   */
  static createDefault(): AgentConfig {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      packs: [],
      calendar: {
        calendarId: 'primary',
        timezone: process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles',
      },
      invites: {
        defaultGuests: [],
        policy: 'manual',
      },
      confidence: {
        autoCreate: 0.85,
        autoUpdate: 0.9,
        requireReviewBelow: 0.85,
      },
      defaults: {
        eventDurationMinutes: 60,
        fallbackTime: '09:00',
        createIfTimeUnknown: false,
      },
      processing: {
        maxEmailsPerRun: parseInt(process.env.MAX_EMAILS_PER_RUN || '50', 10),
        lookbackDays: parseInt(process.env.FIRST_RUN_LOOKBACK_DAYS || '14', 10),
        deduplicationWindowDays: parseInt(process.env.DEDUPLICATION_WINDOW_DAYS || '14', 10),
      },
      notifications: {
        email: process.env.NOTIFICATION_EMAIL || '',
        sendOnError: true,
        sendDigests: true,
      },
    };
  }

  /**
   * Validate a config object without loading from file
   */
  static validate(config: unknown): AgentConfig {
    const result = AgentConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Config validation failed: ${result.error.message}`);
    }
    return result.data as AgentConfig;
  }
}
