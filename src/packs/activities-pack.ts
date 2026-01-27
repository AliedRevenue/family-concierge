/**
 * Activities Pack
 * Handles extracurricular activities: sports, music, clubs, etc.
 */

import type { Pack } from '../types/index.js';

export const ActivitiesPack: Pack = {
  id: 'activities',
  name: 'Activities',
  version: '1.0.0',
  description: 'Extracts extracurricular activity events: sports, music lessons, clubs, etc.',
  priority: 70,

  discoveryRules: {
    senderPatterns: [
      {
        type: 'domain',
        pattern: 'swimschool',
        confidence: 0.9,
        description: 'Swim school communications',
      },
      {
        type: 'domain',
        pattern: 'music',
        confidence: 0.8,
        description: 'Music school/lessons',
      },
      {
        type: 'domain',
        pattern: 'piano',
        confidence: 0.85,
        description: 'Piano lessons',
      },
      {
        type: 'domain',
        pattern: 'dance',
        confidence: 0.85,
        description: 'Dance school',
      },
      {
        type: 'domain',
        pattern: 'soccer',
        confidence: 0.85,
        description: 'Soccer club',
      },
      {
        type: 'domain',
        pattern: 'sports',
        confidence: 0.8,
        description: 'Sports organizations',
      },
      {
        type: 'domain',
        pattern: 'club',
        confidence: 0.7,
        description: 'Club activities',
      },
    ],

    keywordSets: [
      {
        category: 'activity_types',
        keywords: [
          'lesson',
          'class',
          'practice',
          'recital',
          'performance',
          'game',
          'match',
          'tournament',
          'competition',
          'rehearsal',
          'swim',
          'swimming',
          'piano',
          'music',
          'dance',
          'soccer',
          'basketball',
          'baseball',
          'gymnastics',
          'martial arts',
          'karate',
          'ballet',
        ],
        context: 'all',
        confidence: 0.8,
      },
      {
        category: 'time_indicators',
        keywords: [
          'lesson time',
          'class time',
          'practice time',
          'starts at',
          'begins at',
          'schedule',
          'canceled',
          'cancelled',
          'rescheduled',
          'makeup',
          'make-up',
        ],
        context: 'body',
        confidence: 0.75,
      },
      {
        category: 'action_required',
        keywords: [
          'sign up',
          'register',
          'enroll',
          'registration',
          'payment due',
          'tuition',
          'recital tickets',
          'costume',
          'uniform',
        ],
        context: 'all',
        confidence: 0.8,
      },
    ],

    platformDetectors: [],

    attachmentIndicators: [
      {
        type: 'ics',
        mimeTypes: ['text/calendar'],
        filenamePatterns: ['*.ics'],
        extractable: true,
      },
    ],
  },

  defaultConfig: {
    sources: [
      {
        name: 'Activities',
        type: 'email',
        fromDomains: [],
        keywords: [],
        enabled: true,
        label: 'Activities',
      },
    ],

    extractionHints: {
      preferIcsOverText: true,
      defaultDuration: 60,
      fallbackTime: '15:00', // 3 PM default for after-school activities
      requireExplicitTime: false,
    },

    eventDefaults: {
      durationMinutes: 60,
      reminderMinutes: [60, 30],
      color: '7', // Google Calendar color ID
    },

    forwarding: {
      enabled: true,
      forwardTo: [],
      conditions: [
        {
          type: 'no_event_found',
          excludePatterns: [],
        },
      ],
      includeOriginal: true,
      subjectPrefix: '[Activity] ',
    },
  },
};
