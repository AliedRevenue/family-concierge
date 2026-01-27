/**
 * AI Summary Generator
 * Uses Claude to generate fun, readable summaries for dashboard sections
 */

import Anthropic from '@anthropic-ai/sdk';
import { DatabaseClient } from '../database/client.js';

export interface SummaryConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface SummaryResult {
  summary: string;
  generatedAt: string;
  itemCount: number;
  fromCache: boolean;
}

export class AISummaryGenerator {
  private anthropic: Anthropic;
  private model: string;
  private maxTokens: number;
  private db: DatabaseClient;

  constructor(config: SummaryConfig, db: DatabaseClient) {
    this.anthropic = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 300;
    this.db = db;
  }

  /**
   * Generate summary for upcoming obligations
   * @param items - The obligation items to summarize
   * @param packId - Optional pack ID for pack-specific caching (e.g., 'school', 'activities')
   */
  async generateObligationsSummary(items: any[], packId?: string): Promise<SummaryResult> {
    // Check cache first (use pack-specific cache key if packId provided)
    const cacheKey = packId ? `obligations_${packId}` : 'obligations';
    const cached = await this.db.getCachedSummary(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    if (items.length === 0) {
      return {
        summary: "All clear! No upcoming obligations on the calendar. Enjoy the downtime!",
        generatedAt: new Date().toISOString(),
        itemCount: 0,
        fromCache: false,
      };
    }

    const itemsJson = items.map(item => ({
      title: item.subject || this.extractEventTitle(item.event_intent),
      date: this.extractEventDate(item.event_intent) || item.created_at,
      person: item.person || 'Family',
      type: item.event_intent ? 'calendar_event' : 'pending_item',
    }));

    const prompt = `You are a friendly family assistant. Generate a fun, engaging 2-3 sentence summary of upcoming obligations for parents. Be specific about dates, events, and who they involve. Use a warm, helpful tone like a friend giving you the weekly scoop.

Rules:
- Mention the most urgent items first
- Include specific dates (like "Thursday" or "this Monday") and child names when available
- Keep it conversational and brief
- Focus on what parents need to DO or ATTEND
- Don't use bullet points - write in flowing prose
- Use casual language and contractions

Items to summarize (${items.length} total):
${JSON.stringify(itemsJson, null, 2)}

Generate the summary:`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = (response.content[0] as any).text || 'Unable to generate summary.';
      const result: SummaryResult = {
        summary,
        generatedAt: new Date().toISOString(),
        itemCount: items.length,
        fromCache: false,
      };

      // Cache the result (use pack-specific cache key)
      await this.db.saveSummaryCache(cacheKey, summary, items.map(i => i.id));

      return result;
    } catch (error) {
      console.error('Error generating obligations summary:', error);
      return this.fallbackObligationsSummary(items);
    }
  }

  /**
   * Generate summary for announcements
   * @param items - The announcement items to summarize
   * @param packId - Optional pack ID for pack-specific caching (e.g., 'school', 'activities')
   */
  async generateAnnouncementsSummary(items: any[], packId?: string): Promise<SummaryResult> {
    // Check cache first (use pack-specific cache key if packId provided)
    const cacheKey = packId ? `announcements_${packId}` : 'announcements';
    const cached = await this.db.getCachedSummary(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    if (items.length === 0) {
      return {
        summary: "No new announcements this week. The inbox is quiet!",
        generatedAt: new Date().toISOString(),
        itemCount: 0,
        fromCache: false,
      };
    }

    const itemsJson = items.map(item => ({
      subject: item.subject,
      from: item.from_name || item.from_email,
      snippet: (item.snippet || '').slice(0, 200),
      person: item.person || 'School',
      daysAgo: this.calculateDaysAgo(item.created_at),
    }));

    const prompt = `You are a friendly family assistant. Generate a fun, engaging 2-3 sentence summary of school/activity announcements. Focus on interesting things kids are learning or celebrating. Use a warm, curious tone.

Rules:
- Highlight interesting learning topics or classroom activities
- Mention celebrations or special themes
- Keep it light and informational
- No action required from parents - these are just FYIs
- Don't use bullet points - write in flowing prose
- Use casual language and be enthusiastic about what kids are learning

Items to summarize (${items.length} total):
${JSON.stringify(itemsJson, null, 2)}

Generate the summary:`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = (response.content[0] as any).text || 'Unable to generate summary.';
      const result: SummaryResult = {
        summary,
        generatedAt: new Date().toISOString(),
        itemCount: items.length,
        fromCache: false,
      };

      // Cache the result (use pack-specific cache key)
      await this.db.saveSummaryCache(cacheKey, summary, items.map(i => i.id));

      return result;
    } catch (error) {
      console.error('Error generating announcements summary:', error);
      return this.fallbackAnnouncementsSummary(items);
    }
  }

  /**
   * Generate summary for weekly catch-up (past items)
   */
  async generateCatchupSummary(items: any[]): Promise<SummaryResult> {
    // Check cache first
    const cached = await this.db.getCachedSummary('catchup');
    if (cached) {
      return { ...cached, fromCache: true };
    }

    if (items.length === 0) {
      return {
        summary: "Nothing to catch up on from last week. You're all caught up!",
        generatedAt: new Date().toISOString(),
        itemCount: 0,
        fromCache: false,
      };
    }

    const itemsJson = items.map(item => ({
      title: item.subject || this.extractEventTitle(item.event_intent),
      status: item.catch_up_status || 'completed',
      person: item.person || 'Family',
      date: this.extractEventDate(item.event_intent) || item.read_at || item.created_at,
    }));

    const prompt = `You are a friendly family assistant. Generate a fun, engaging 2-3 sentence summary of what happened last week. Celebrate accomplishments and note things the family did. Use a warm, reflective tone.

Rules:
- Use past tense - these things already happened
- Celebrate wins and accomplishments
- Keep it brief and positive
- Don't use bullet points - write in flowing prose
- Use casual language

Items from last week (${items.length} total):
${JSON.stringify(itemsJson, null, 2)}

Generate the summary:`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = (response.content[0] as any).text || 'Unable to generate summary.';
      const result: SummaryResult = {
        summary,
        generatedAt: new Date().toISOString(),
        itemCount: items.length,
        fromCache: false,
      };

      // Cache the result
      await this.db.saveSummaryCache('catchup', summary, items.map(i => i.id));

      return result;
    } catch (error) {
      console.error('Error generating catchup summary:', error);
      return this.fallbackCatchupSummary(items);
    }
  }

  /**
   * Generate summary for tasks (action items without dates)
   */
  async generateTasksSummary(items: any[]): Promise<SummaryResult> {
    // Check cache first
    const cached = await this.db.getCachedSummary('tasks');
    if (cached) {
      return { ...cached, fromCache: true };
    }

    if (items.length === 0) {
      return {
        summary: "No pending tasks - you're all caught up! 🎉",
        generatedAt: new Date().toISOString(),
        itemCount: 0,
        fromCache: false,
      };
    }

    const itemsJson = items.map(item => ({
      subject: item.subject,
      from: item.from_name || item.from_email,
      snippet: (item.snippet || '').slice(0, 200),
      daysSinceReceived: item.days_since_received || 0,
    }));

    const prompt = `You are a friendly family assistant. Generate a brief, motivating 1-2 sentence summary of pending tasks that need attention. These are action items like waivers to sign, forms to fill out, or things to review.

Rules:
- Be specific about what needs to be done
- Keep it actionable and concise
- Use encouraging language ("Don't forget to..." or "Quick reminder to...")
- Prioritize items that have been waiting longer
- Don't use bullet points - write in flowing prose
- Use casual language

Tasks to summarize (${items.length} total):
${JSON.stringify(itemsJson, null, 2)}

Generate the summary:`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = (response.content[0] as any).text || 'Unable to generate summary.';
      const result: SummaryResult = {
        summary,
        generatedAt: new Date().toISOString(),
        itemCount: items.length,
        fromCache: false,
      };

      // Cache the result
      await this.db.saveSummaryCache('tasks', summary, items.map(i => i.id));

      return result;
    } catch (error) {
      console.error('Error generating tasks summary:', error);
      return this.fallbackTasksSummary(items);
    }
  }

  /**
   * Generate summary for updates (combined announcements and past items)
   */
  async generateUpdatesSummary(items: any[]): Promise<SummaryResult> {
    // Check cache first
    const cached = await this.db.getCachedSummary('updates');
    if (cached) {
      return { ...cached, fromCache: true };
    }

    if (items.length === 0) {
      return {
        summary: "No updates to share - all quiet on the home front!",
        generatedAt: new Date().toISOString(),
        itemCount: 0,
        fromCache: false,
      };
    }

    const itemsJson = items.map(item => ({
      subject: item.subject,
      from: item.from_name || item.from_email,
      snippet: (item.snippet || '').slice(0, 200),
      type: item.update_type || 'update',
      daysAgo: item.days_ago || 0,
      obligationDate: item.obligation_date,
    }));

    const prompt = `You are a friendly family assistant. Generate a fun, engaging 2-3 sentence summary of recent updates for parents. This includes school newsletters, class updates, and events that recently happened.

Rules:
- Mix informational updates with recent happenings
- Highlight interesting things kids are learning or did
- Mention past events in past tense ("had a great time at..." or "completed...")
- Keep it light and conversational
- Don't use bullet points - write in flowing prose
- Use casual language and be warm

Updates to summarize (${items.length} total):
${JSON.stringify(itemsJson, null, 2)}

Generate the summary:`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = (response.content[0] as any).text || 'Unable to generate summary.';
      const result: SummaryResult = {
        summary,
        generatedAt: new Date().toISOString(),
        itemCount: items.length,
        fromCache: false,
      };

      // Cache the result
      await this.db.saveSummaryCache('updates', summary, items.map(i => i.id));

      return result;
    } catch (error) {
      console.error('Error generating updates summary:', error);
      return this.fallbackUpdatesSummary(items);
    }
  }

  // ========================================
  // Fallback summaries (when Claude fails)
  // ========================================

  private fallbackUpdatesSummary(items: any[]): SummaryResult {
    const count = items.length;
    const summary = `${count} update${count === 1 ? '' : 's'} to catch up on.`;

    return {
      summary,
      generatedAt: new Date().toISOString(),
      itemCount: count,
      fromCache: false,
    };
  }

  private fallbackTasksSummary(items: any[]): SummaryResult {
    const count = items.length;
    let summary = `${count} task${count === 1 ? '' : 's'} waiting for your attention.`;

    if (count > 0) {
      const first = items[0];
      summary += ` First up: ${first.subject || 'an item to review'}.`;
    }

    return {
      summary,
      generatedAt: new Date().toISOString(),
      itemCount: count,
      fromCache: false,
    };
  }

  private fallbackObligationsSummary(items: any[]): SummaryResult {
    const count = items.length;
    let summary = `You have ${count} upcoming obligation${count === 1 ? '' : 's'}. `;

    if (count > 0) {
      const first = items[0];
      const title = first.subject || this.extractEventTitle(first.event_intent) || 'an event';
      summary += `Coming up first: ${title}.`;
    }

    return {
      summary,
      generatedAt: new Date().toISOString(),
      itemCount: count,
      fromCache: false,
    };
  }

  private fallbackAnnouncementsSummary(items: any[]): SummaryResult {
    const count = items.length;
    const summary = `${count} announcement${count === 1 ? '' : 's'} to catch up on this week.`;

    return {
      summary,
      generatedAt: new Date().toISOString(),
      itemCount: count,
      fromCache: false,
    };
  }

  private fallbackCatchupSummary(items: any[]): SummaryResult {
    const count = items.length;
    const summary = `${count} item${count === 1 ? '' : 's'} from last week to review.`;

    return {
      summary,
      generatedAt: new Date().toISOString(),
      itemCount: count,
      fromCache: false,
    };
  }

  // ========================================
  // Helpers
  // ========================================

  private extractEventTitle(eventIntent: string | null): string | null {
    if (!eventIntent) return null;
    try {
      const parsed = JSON.parse(eventIntent);
      return parsed.title || parsed.summary || null;
    } catch {
      return null;
    }
  }

  private extractEventDate(eventIntent: string | null): string | null {
    if (!eventIntent) return null;
    try {
      const parsed = JSON.parse(eventIntent);
      return parsed.startDateTime || null;
    } catch {
      return null;
    }
  }

  private calculateDaysAgo(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
