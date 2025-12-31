/**
 * School Pack
 * Reference Pack implementation for kid/school events
 */

import type { Pack } from '../types/index.js';

export const SchoolPack: Pack = {
  id: 'school',
  name: 'School',
  version: '1.0.0',
  description: 'Extracts school events, early releases, conferences, and activities',
  priority: 80, // High priority for conflicts

  discoveryRules: {
    // Sender patterns to detect during discovery
    senderPatterns: [
      {
        type: 'domain',
        pattern: 'schoolloop.com',
        confidence: 0.95,
        description: 'SchoolLoop communication platform',
      },
      {
        type: 'domain',
        pattern: 'parentsquare.com',
        confidence: 0.95,
        description: 'ParentSquare school messaging',
      },
      {
        type: 'domain',
        pattern: 'remindhq.com',
        confidence: 0.9,
        description: 'Remind app notifications',
      },
      {
        type: 'domain',
        pattern: '.edu',
        confidence: 0.7,
        description: 'Educational institution domains',
      },
      {
        type: 'domain',
        pattern: 'k12',
        confidence: 0.75,
        description: 'K-12 school systems',
      },
      {
        type: 'regex',
        pattern: 'principal|teacher|school|district',
        confidence: 0.6,
        description: 'School personnel in sender name',
      },
    ],

    // Keyword sets to detect during discovery
    keywordSets: [
      {
        category: 'event_types',
        keywords: [
          'early release',
          'early dismissal',
          'parent-teacher conference',
          'field trip',
          'school assembly',
          'picture day',
          'back to school',
          'open house',
          'school play',
          'science fair',
          'spelling bee',
          'sports day',
          'winter concert',
          'spring concert',
          'graduation',
          'orientation',
          'school closure',
          'minimum day',
          'half day',
        ],
        context: 'all',
        confidence: 0.85,
      },
      {
        category: 'time_indicators',
        keywords: [
          'dismissal',
          'pickup',
          'drop-off',
          'starts at',
          'begins at',
          'ends at',
          'due date',
          'deadline',
          'rsvp by',
        ],
        context: 'body',
        confidence: 0.75,
      },
      {
        category: 'action_required',
        keywords: [
          'sign up',
          'permission slip',
          'forms due',
          'register',
          'enrollment',
          'volunteer',
          'rsvp',
          'confirmation required',
        ],
        context: 'all',
        confidence: 0.8,
      },
    ],

    // Platform detectors
    platformDetectors: [
      {
        name: 'SignupGenius',
        indicators: {
          domains: ['signupgenius.com'],
          bodyPatterns: ['SignUpGenius', 'sign up genius'],
        },
        confidence: 0.95,
      },
      {
        name: 'ParentSquare',
        indicators: {
          domains: ['parentsquare.com'],
          headers: { 'X-Mailer': 'ParentSquare' },
        },
        confidence: 0.95,
      },
      {
        name: 'SchoolMessenger',
        indicators: {
          domains: ['schoolmessenger.com', 'westnotification.com'],
        },
        confidence: 0.9,
      },
      {
        name: 'Remind',
        indicators: {
          domains: ['remindhq.com', 'remind.com'],
        },
        confidence: 0.9,
      },
      {
        name: 'Konstella',
        indicators: {
          domains: ['konstella.com'],
        },
        confidence: 0.9,
      },
    ],

    // Attachment indicators
    attachmentIndicators: [
      {
        type: 'ics',
        mimeTypes: ['text/calendar'],
        filenamePatterns: ['*.ics'],
        extractable: true,
      },
      {
        type: 'pdf',
        mimeTypes: ['application/pdf'],
        filenamePatterns: ['*.pdf'],
        extractable: false, // v1: deferred
      },
    ],
  },

  defaultConfig: {
    sources: [
      {
        name: 'School Communications',
        type: 'email',
        fromDomains: [], // Populated by discovery
        keywords: [], // Populated by discovery
        enabled: true,
        label: 'School/Events',
      },
    ],

    extractionHints: {
      preferIcsOverText: true,
      defaultDuration: 60, // 1 hour
      fallbackTime: '09:00', // 9 AM if time not specified
      requireExplicitTime: false, // Allow time inference
    },

    eventDefaults: {
      durationMinutes: 60,
      reminderMinutes: [1440, 60], // 1 day before and 1 hour before
      color: '10', // Google Calendar color ID for green
    },

    forwarding: {
      enabled: true,
      forwardTo: [], // Populated by user
      conditions: [
        {
          type: 'no_event_found',
          excludePatterns: ['fundraiser', 'donation request', 'volunteer opportunity'],
        },
        {
          type: 'keyword_match',
          value: ['grade report', 'progress report', 'behavior notice', 'important'],
        },
      ],
      includeOriginal: true,
      subjectPrefix: '[School Info] ',
    },
  },
};
