/**
 * ICS Calendar Fetcher
 *
 * Fetches external ICS calendar feeds, parses events,
 * and filters them based on grade/person relevance.
 */

import ICAL from 'ical.js';
import Anthropic from '@anthropic-ai/sdk';
import { ExternalCalendar, FamilyMember } from '../types/index.js';
import { DatabaseClient } from '../database/client.js';

export interface ParsedCalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  recurrenceRule?: string;
  sourceCalendar: string;
  rawData: any;
}

export interface FilteredEvent extends ParsedCalendarEvent {
  relevantTo: string[];  // Family member names this event applies to
  relevanceReason: string;
  shouldSync: boolean;
}

export interface ICSFetcherConfig {
  anthropicApiKey?: string;
  model?: string;
}

export class ICSCalendarFetcher {
  private anthropic?: Anthropic;
  private model: string;
  private db: DatabaseClient;

  constructor(db: DatabaseClient, config?: ICSFetcherConfig) {
    this.db = db;
    this.model = config?.model || 'claude-sonnet-4-20250514';

    if (config?.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    }
  }

  /**
   * Fetch and parse an ICS calendar feed
   */
  async fetchCalendar(calendar: ExternalCalendar): Promise<ParsedCalendarEvent[]> {
    console.log(`[ICS] Fetching calendar: ${calendar.name}`);

    // Convert webcal:// to https://
    const url = calendar.url.replace(/^webcal:\/\//, 'https://');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
      }

      const icsData = await response.text();
      return this.parseICS(icsData, calendar.name);
    } catch (error) {
      console.error(`[ICS] Error fetching ${calendar.name}:`, error);
      throw error;
    }
  }

  /**
   * Parse ICS data into structured events
   */
  parseICS(icsData: string, sourceName: string): ParsedCalendarEvent[] {
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events: ParsedCalendarEvent[] = [];
    const now = new Date();
    const futureLimit = new Date();
    futureLimit.setMonth(futureLimit.getMonth() + 3); // Only look 3 months ahead

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);

      // Skip past events
      const startDate = event.startDate?.toJSDate();
      if (!startDate || startDate < now) continue;

      // Skip events too far in the future
      if (startDate > futureLimit) continue;

      const endDate = event.endDate?.toJSDate() || startDate;
      const isAllDay = event.startDate?.isDate || false;

      events.push({
        uid: event.uid || `${sourceName}-${startDate.getTime()}`,
        summary: event.summary || 'Untitled Event',
        description: event.description || undefined,
        location: event.location || undefined,
        startDate,
        endDate,
        allDay: isAllDay,
        recurrenceRule: vevent.getFirstPropertyValue('rrule')?.toString(),
        sourceCalendar: sourceName,
        rawData: vevent.toJSON(),
      });
    }

    console.log(`[ICS] Parsed ${events.length} upcoming events from ${sourceName}`);
    return events;
  }

  /**
   * Filter events based on relevance to family members
   * Uses AI to determine if event applies to specific kids based on grade
   */
  async filterEventsByRelevance(
    events: ParsedCalendarEvent[],
    familyMembers: FamilyMember[]
  ): Promise<FilteredEvent[]> {
    const filteredEvents: FilteredEvent[] = [];

    // Build grade mapping
    const gradeInfo = familyMembers
      .filter(m => m.grade)
      .map(m => `${m.name}: ${m.grade} grade (aliases: ${m.gradeAliases?.join(', ') || 'none'})`)
      .join('\n');

    console.log(`[ICS] Filtering ${events.length} events for relevance...`);

    // Process events in batches to avoid too many API calls
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      if (this.anthropic) {
        // Use AI for smart filtering
        const filtered = await this.filterBatchWithAI(batch, familyMembers, gradeInfo);
        filteredEvents.push(...filtered);
      } else {
        // Fallback to rule-based filtering
        const filtered = this.filterBatchWithRules(batch, familyMembers);
        filteredEvents.push(...filtered);
      }
    }

    const relevantCount = filteredEvents.filter(e => e.shouldSync).length;
    console.log(`[ICS] ${relevantCount} of ${events.length} events are relevant to your family`);

    return filteredEvents;
  }

  /**
   * AI-based filtering for a batch of events
   */
  private async filterBatchWithAI(
    events: ParsedCalendarEvent[],
    familyMembers: FamilyMember[],
    gradeInfo: string
  ): Promise<FilteredEvent[]> {
    const eventDescriptions = events.map((e, idx) =>
      `${idx + 1}. "${e.summary}" on ${e.startDate.toLocaleDateString()}${e.description ? ` - ${e.description.substring(0, 100)}` : ''}`
    ).join('\n');

    const prompt = `You are helping filter school calendar events for a family.

FAMILY MEMBERS AND GRADES:
${gradeInfo}

EVENTS TO ANALYZE:
${eventDescriptions}

For each event, determine:
1. Is this event relevant to any of the family members listed above?
2. Which family member(s) does it apply to?

Grade reference for this school:
- "Class K" or "Kindergarten" = Kindergarten
- "Class I" = 1st grade
- "Class II" = 2nd grade
- "Class III" = 3rd grade
- "Class IV" = 4th grade
- "Class V" = 5th grade
- "Lower School" = typically K-5, includes all listed kids
- "All School" or no grade specified = applies to everyone

Respond in JSON format:
{
  "events": [
    {
      "index": 1,
      "shouldSync": true,
      "relevantTo": ["Colin", "Henry"],
      "reason": "Lower School event applies to both kids"
    },
    ...
  ]
}

Only include events that are actually relevant. If an event mentions a specific grade/class that doesn't match any family member, set shouldSync to false.`;

    try {
      const response = await this.anthropic!.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return events.map((event, idx) => {
        const analysis = result.events?.find((e: any) => e.index === idx + 1);
        return {
          ...event,
          shouldSync: analysis?.shouldSync ?? true,
          relevantTo: analysis?.relevantTo ?? familyMembers.map(m => m.name),
          relevanceReason: analysis?.reason ?? 'Default: included',
        };
      });
    } catch (error) {
      console.warn('[ICS] AI filtering failed, falling back to rules:', error);
      return this.filterBatchWithRules(events, familyMembers);
    }
  }

  /**
   * Rule-based filtering fallback
   */
  private filterBatchWithRules(
    events: ParsedCalendarEvent[],
    familyMembers: FamilyMember[]
  ): FilteredEvent[] {
    return events.map(event => {
      const text = `${event.summary} ${event.description || ''}`.toLowerCase();

      // Check for grade-specific mentions
      const relevantTo: string[] = [];
      let shouldSync = false;
      let reason = '';

      for (const member of familyMembers) {
        // Check if event mentions this member's name
        if (member.aliases?.some(alias => text.includes(alias.toLowerCase()))) {
          relevantTo.push(member.name);
          shouldSync = true;
          reason = `Mentions ${member.name}`;
          continue;
        }

        // Check if event mentions this member's grade
        if (member.gradeAliases?.some(alias => text.includes(alias.toLowerCase()))) {
          relevantTo.push(member.name);
          shouldSync = true;
          reason = `Matches grade: ${member.grade}`;
          continue;
        }
      }

      // If no specific match, check for "all school" or "lower school" patterns
      if (relevantTo.length === 0) {
        if (text.includes('all school') || text.includes('lower school') || text.includes('early release')) {
          relevantTo.push(...familyMembers.map(m => m.name));
          shouldSync = true;
          reason = 'School-wide event';
        }
      }

      // Exclude events for grades not in family
      const excludePatterns = ['class iii', 'class iv', 'class v', '3rd grade', '4th grade', '5th grade', 'upper school', 'middle school'];
      if (excludePatterns.some(p => text.includes(p)) && relevantTo.length === 0) {
        shouldSync = false;
        reason = 'Grade not applicable';
      }

      // Default: if no specific filtering, include it
      if (relevantTo.length === 0 && !reason) {
        relevantTo.push(...familyMembers.map(m => m.name));
        shouldSync = true;
        reason = 'No specific grade mentioned - including by default';
      }

      return {
        ...event,
        shouldSync,
        relevantTo,
        relevanceReason: reason,
      };
    });
  }

  /**
   * Sync events to the database for dashboard display
   */
  async syncEventsToDatabase(events: FilteredEvent[]): Promise<number> {
    let synced = 0;

    for (const event of events) {
      if (!event.shouldSync) continue;

      try {
        // Check if we've already processed this event
        const existing = this.db.getConnection().prepare(
          'SELECT id FROM ics_calendar_events WHERE uid = ?'
        ).get(event.uid);

        if (existing) {
          // Update existing event
          this.db.getConnection().prepare(`
            UPDATE ics_calendar_events
            SET summary = ?, description = ?, location = ?, start_date = ?, end_date = ?,
                all_day = ?, relevant_to = ?, relevance_reason = ?, updated_at = datetime('now')
            WHERE uid = ?
          `).run(
            event.summary,
            event.description || null,
            event.location || null,
            event.startDate.toISOString(),
            event.endDate.toISOString(),
            event.allDay ? 1 : 0,
            JSON.stringify(event.relevantTo),
            event.relevanceReason,
            event.uid
          );
        } else {
          // Insert new event
          this.db.getConnection().prepare(`
            INSERT INTO ics_calendar_events
            (uid, summary, description, location, start_date, end_date, all_day,
             source_calendar, relevant_to, relevance_reason, should_sync, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            event.uid,
            event.summary,
            event.description || null,
            event.location || null,
            event.startDate.toISOString(),
            event.endDate.toISOString(),
            event.allDay ? 1 : 0,
            event.sourceCalendar,
            JSON.stringify(event.relevantTo),
            event.relevanceReason,
            event.shouldSync ? 1 : 0
          );
          synced++;
        }
      } catch (error) {
        console.error(`[ICS] Error syncing event ${event.uid}:`, error);
      }
    }

    console.log(`[ICS] Synced ${synced} new events to database`);
    return synced;
  }

  /**
   * Full sync: fetch, filter, and store events from all configured calendars
   */
  async syncAllCalendars(
    calendars: ExternalCalendar[],
    familyMembers: FamilyMember[]
  ): Promise<{ fetched: number; synced: number }> {
    let totalFetched = 0;
    let totalSynced = 0;

    for (const calendar of calendars) {
      if (!calendar.enabled) {
        console.log(`[ICS] Skipping disabled calendar: ${calendar.name}`);
        continue;
      }

      try {
        const events = await this.fetchCalendar(calendar);
        totalFetched += events.length;

        let filtered: FilteredEvent[];
        if (calendar.filterByGrade) {
          filtered = await this.filterEventsByRelevance(events, familyMembers);
        } else {
          // No filtering - mark all as relevant
          filtered = events.map(e => ({
            ...e,
            shouldSync: true,
            relevantTo: familyMembers.map(m => m.name),
            relevanceReason: 'No filtering applied',
          }));
        }

        const synced = await this.syncEventsToDatabase(filtered);
        totalSynced += synced;
      } catch (error) {
        console.error(`[ICS] Failed to sync calendar ${calendar.name}:`, error);
      }
    }

    return { fetched: totalFetched, synced: totalSynced };
  }
}
