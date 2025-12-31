/**
 * Event Extractor
 * Extracts event intents from emails (ICS + text)
 */

import ICAL from 'ical.js';
import type { EventIntent, ExtractedEvent, ExtractionMetadata, ExtractionProvenance, ConfidenceReason } from '../types/index.js';
import type { GmailMessage, GmailAttachment } from './gmail-connector.js';
import { FingerprintGenerator } from '../utils/fingerprint.js';

export class EventExtractor {
  /**
   * Extract events from a Gmail message
   * Prioritizes ICS attachments, falls back to text parsing
   */
  async extractEvents(
    message: GmailMessage,
    messageBody: { text?: string; html?: string },
    attachments: GmailAttachment[],
    packId: string,
    preferIcs: boolean = true
  ): Promise<ExtractedEvent[]> {
    const events: ExtractedEvent[] = [];

    // Try ICS first if preferred
    if (preferIcs) {
      const icsAttachments = attachments.filter(
        (a) => a.mimeType === 'text/calendar' || a.filename.endsWith('.ics')
      );

      for (const attachment of icsAttachments) {
        try {
          const extracted = this.extractFromICS(message.id, attachment.data, packId);
          events.push(...extracted);
        } catch (error) {
          console.warn(`Failed to parse ICS attachment: ${attachment.filename}`, error);
        }
      }
    }

    // If no ICS events found, try text extraction (v1: basic placeholder)
    if (events.length === 0 && messageBody.text) {
      const textEvent = this.extractFromText(message.id, messageBody.text, packId);
      if (textEvent) {
        events.push(textEvent);
      }
    }

    return events;
  }

  /**
   * Extract events from ICS attachment
   */
  private extractFromICS(
    messageId: string,
    icsData: string,
    packId: string
  ): ExtractedEvent[] {
    const decoded = Buffer.from(icsData, 'base64').toString('utf-8');
    const jcalData = ICAL.parse(decoded);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    return vevents.map((vevent) => {
      const event = new ICAL.Event(vevent);
      
      // Get timezone - try multiple approaches as ical.js API varies
      let tzid = 'UTC';
      try {
        const dtstart = vevent.getFirstProperty('dtstart');
        if (dtstart) {
          const value = dtstart.getFirstValue();
          // Check if value has zone property (it's a Time object)
          if (value && typeof value === 'object' && 'zone' in value && value.zone) {
            tzid = (value.zone as any).tzid || 'UTC';
          }
        }
      } catch {
        // Fall back to UTC if timezone extraction fails
        tzid = 'UTC';
      }

      const eventIntent: EventIntent = {
        title: event.summary || 'Untitled Event',
        description: event.description || undefined,
        location: event.location || undefined,
        startDateTime: event.startDate.toJSDate().toISOString(),
        endDateTime: event.endDate.toJSDate().toISOString(),
        allDay: event.startDate.isDate,
        timezone: tzid,
      };

      const fingerprint = FingerprintGenerator.generate(messageId, eventIntent);

      // Build confidence reasons
      const confidenceReasons: ConfidenceReason[] = [
        {
          factor: 'ics_attachment',
          weight: 0.4,
          value: true,
          description: 'Event extracted from ICS calendar file',
        },
        {
          factor: 'explicit_time',
          weight: 0.3,
          value: !event.startDate.isDate,
          description: event.startDate.isDate ? 'All-day event' : 'Specific time provided',
        },
        {
          factor: 'has_location',
          weight: 0.1,
          value: !!event.location,
          description: event.location ? `Location: ${event.location}` : 'No location specified',
        },
        {
          factor: 'date_in_future',
          weight: 0.2,
          value: event.startDate.toJSDate() > new Date(),
          description: event.startDate.toJSDate() > new Date() ? 'Future event' : 'Past event',
        },
      ];

      const confidence = this.calculateConfidenceFromReasons(confidenceReasons);

      // Build assumptions
      const assumptions: string[] = [];
      if (!event.location) {
        assumptions.push('No location specified in ICS');
      }
      if (tzid === 'UTC') {
        assumptions.push('Timezone: UTC (from ICS data)');
      } else {
        assumptions.push(`Timezone: ${tzid}`);
      }
      if (!event.description) {
        assumptions.push('No description provided');
      }

      // Build provenance
      const provenance: ExtractionProvenance = {
        method: 'ics',
        confidence,
        confidenceReasons,
        assumptions,
        sourceEmailPermalink: `https://mail.google.com/mail/#inbox/${messageId}`,
        extractedAt: new Date().toISOString(),
      };

      const metadata: ExtractionMetadata = {
        extractedAt: new Date().toISOString(),
        extractorVersion: '1.0.0',
        rawData: decoded,
        confidenceFactors: {
          hasIcsAttachment: 0.95,
          clearDateTime: event.startDate.isDate ? 0.8 : 1.0,
        },
      };

      return {
        fingerprint,
        sourceMessageId: messageId,
        sourcePack: packId,
        extractionMethod: 'ics',
        confidence,
        event: eventIntent,
        metadata,
        provenance,
      };
    });
  }

  /**
   * Extract event from plain text (v1: basic implementation)
   * This is a placeholder - production would use NLP/LLM
   */
  private extractFromText(
    messageId: string,
    text: string,
    packId: string
  ): ExtractedEvent | null {
    // v1: Return null - text extraction deferred
    // Production: Use date/time regex, NLP, or LLM extraction
    return null;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(factors: Record<string, number>): number {
    const values = Object.values(factors);
    if (values.length === 0) return 0.5;

    // Weighted average (can be customized per factor)
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Math.min(sum / values.length, 1.0);
  }

  /**
   * Calculate confidence from ConfidenceReason array
   */
  private calculateConfidenceFromReasons(reasons: ConfidenceReason[]): number {
    if (reasons.length === 0) return 0.5;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const reason of reasons) {
      totalWeight += reason.weight;
      const value = typeof reason.value === 'boolean' ? (reason.value ? 1 : 0) : Number(reason.value);
      weightedSum += reason.weight * value;
    }

    return totalWeight > 0 ? Math.min(weightedSum / totalWeight, 1.0) : 0.5;
  }
}
