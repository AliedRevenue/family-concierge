/**
 * Example Unit Test
 * Tests for FingerprintGenerator
 */

import { describe, it, expect } from 'vitest';
import { FingerprintGenerator } from '../utils/fingerprint.js';
import type { EventIntent } from '../types/index.js';

describe('FingerprintGenerator', () => {
  it('should generate consistent fingerprints for same inputs', () => {
    const messageId = 'msg123';
    const event: EventIntent = {
      title: 'Parent-Teacher Conference',
      startDateTime: '2025-05-15T14:00:00-07:00',
      endDateTime: '2025-05-15T15:00:00-07:00',
      allDay: false,
      timezone: 'America/Los_Angeles',
    };

    const fp1 = FingerprintGenerator.generate(messageId, event);
    const fp2 = FingerprintGenerator.generate(messageId, event);

    expect(fp1).toBe(fp2);
  });

  it('should generate different fingerprints for different titles', () => {
    const messageId = 'msg123';
    const event1: EventIntent = {
      title: 'Event A',
      startDateTime: '2025-05-15T14:00:00-07:00',
      endDateTime: '2025-05-15T15:00:00-07:00',
      allDay: false,
      timezone: 'America/Los_Angeles',
    };

    const event2: EventIntent = {
      ...event1,
      title: 'Event B',
    };

    const fp1 = FingerprintGenerator.generate(messageId, event1);
    const fp2 = FingerprintGenerator.generate(messageId, event2);

    expect(fp1).not.toBe(fp2);
  });

  it('should generate different fingerprints for different dates', () => {
    const messageId = 'msg123';
    const event1: EventIntent = {
      title: 'Event',
      startDateTime: '2025-05-15T14:00:00-07:00',
      endDateTime: '2025-05-15T15:00:00-07:00',
      allDay: false,
      timezone: 'America/Los_Angeles',
    };

    const event2: EventIntent = {
      ...event1,
      startDateTime: '2025-05-16T14:00:00-07:00',
      endDateTime: '2025-05-16T15:00:00-07:00',
    };

    const fp1 = FingerprintGenerator.generate(messageId, event1);
    const fp2 = FingerprintGenerator.generate(messageId, event2);

    expect(fp1).not.toBe(fp2);
  });

  it('should normalize titles (case insensitive)', () => {
    const messageId = 'msg123';
    const event1: EventIntent = {
      title: 'Parent-Teacher Conference',
      startDateTime: '2025-05-15T14:00:00-07:00',
      endDateTime: '2025-05-15T15:00:00-07:00',
      allDay: false,
      timezone: 'America/Los_Angeles',
    };

    const event2: EventIntent = {
      ...event1,
      title: 'PARENT-TEACHER CONFERENCE',
    };

    const fp1 = FingerprintGenerator.generate(messageId, event1);
    const fp2 = FingerprintGenerator.generate(messageId, event2);

    expect(fp1).toBe(fp2);
  });
});
