/**
 * Fingerprinting Utility
 * Creates deterministic event fingerprints for deduplication
 */

import { createHash } from 'crypto';
import type { EventIntent, EventFingerprint } from '../types/index.js';

export class FingerprintGenerator {
  /**
   * Generate fingerprint from event intent
   * Based on: messageId + normalized title + date + time
   */
  static generate(messageId: string, event: EventIntent): string {
    const components: EventFingerprint = {
      messageId,
      titleNormalized: this.normalizeTitle(event.title),
      dateKey: this.extractDateKey(event.startDateTime),
      timeKey: event.allDay ? 'allday' : this.extractTimeKey(event.startDateTime),
    };

    const payload = JSON.stringify(components);
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Normalize title for comparison
   * - Lowercase
   * - Trim whitespace
   * - Remove special characters
   * - Collapse multiple spaces
   */
  private static normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Extract date key (YYYY-MM-DD)
   */
  private static extractDateKey(dateTime: string): string {
    return dateTime.split('T')[0];
  }

  /**
   * Extract time key (HH:mm)
   */
  private static extractTimeKey(dateTime: string): string {
    const timePart = dateTime.split('T')[1];
    if (!timePart) return '00:00';
    return timePart.substring(0, 5); // HH:mm
  }

  /**
   * Check if two fingerprints are similar enough to be considered duplicates
   * (Currently exact match, but could be extended with fuzzy matching)
   */
  static areSimilar(fp1: string, fp2: string): boolean {
    return fp1 === fp2;
  }
}
