/**
 * Embedded configuration for serverless deployment
 * This file is bundled with the serverless function
 */

import type { AgentConfig } from '../src/types/index.js';

export const embeddedConfig: AgentConfig = {
  version: "1.0.0",
  createdAt: "2025-12-28T00:00:00.000Z",
  updatedAt: "2025-12-28T00:00:00.000Z",
  packs: [
    {
      packId: "school",
      priority: 80,
      config: {
        sources: [
          {
            name: "Waterford School",
            type: "email",
            fromDomains: [
              "waterfordschool.org",
              "*waterford*.org",
              "*waterford*.com",
              "mail1.veracross.com",
              "mail2.veracross.com",
              "mail3.veracross.com",
              "*veracross.com"
            ],
            keywords: [
              "Colin",
              "Henry",
              "Class II",
              "Second Grade",
              "Kindergarten",
              "Colin Fitzgerald",
              "Henry Fitzgerald",
              "early release",
              "early dismissal",
              "parent conference",
              "field trip",
              "assembly",
              "picture day",
              "school event",
              "class",
              "grade"
            ],
            enabled: true
          }
        ],
        extractionHints: {
          preferIcsOverText: true,
          defaultDuration: 60,
          fallbackTime: "09:00",
          requireExplicitTime: false
        },
        eventDefaults: {
          durationMinutes: 60,
          reminderMinutes: [60],
          color: "10"
        }
      }
    },
    {
      packId: "activities",
      priority: 70,
      config: {
        sources: [
          {
            name: "Kids Activities",
            type: "email",
            fromDomains: [
              "bigblueswimschool.com",
              "mymusicstaff.com"
            ],
            keywords: [
              "Colin",
              "Henry",
              "swim",
              "swimming",
              "piano",
              "lesson",
              "class",
              "practice",
              "recital",
              "performance"
            ],
            enabled: true
          }
        ],
        extractionHints: {
          preferIcsOverText: true,
          defaultDuration: 60,
          fallbackTime: "09:00",
          requireExplicitTime: false
        },
        eventDefaults: {
          durationMinutes: 60,
          reminderMinutes: [60],
          color: "7"
        }
      }
    }
  ],
  calendar: {
    calendarId: "primary",
    timezone: "America/Los_Angeles"
  },
  family: {
    members: [
      {
        name: "Colin",
        aliases: ["Colin", "C.", "Colin Fitzgerald"],
        groupAliases: ["Colin's class", "Colin's team", "Class II", "2nd Grade", "Second Grade"],
        grade: "2nd",
        gradeAliases: ["Class II", "2nd Grade", "Second Grade", "Grade 2"]
      },
      {
        name: "Henry",
        aliases: ["Henry", "H.", "Henry Fitzgerald"],
        groupAliases: ["Henry's class", "Henry's team", "Kindergarten", "Class K"],
        grade: "K",
        gradeAliases: ["Kindergarten", "Class K", "K", "Pre-1"]
      }
    ],
    defaultAssignmentFallback: "Family/Shared",
    sourceAssignments: [
      // School emails - assign to both, refine by grade context
      {
        match: { fromDomain: "*waterford*" },
        assignTo: ["Colin", "Henry"]
      },
      {
        match: { fromDomain: "*veracross*" },
        assignTo: ["Colin", "Henry"]
      },
      // Activities
      {
        match: { fromDomain: "bigblueswimschool.com" },
        assignTo: ["Colin", "Henry"]
      },
      {
        match: { fromDomain: "mymusicstaff.com" },
        assignTo: ["Colin", "Henry"]
      },
      {
        match: { fromDomain: "*appassionata*" },
        assignTo: ["Colin", "Henry"]
      }
    ]
  },
  externalCalendars: [
    {
      name: "School Household Calendar",
      url: "https://api.veracross.com/waterford/subscribe/04D7D2A7-C8FF-404B-95C2-53ED475FB0FD.ics?uid=CAA9422C-BE60-4AB2-9059-DFDF04A80A1E",
      type: "school",
      enabled: true,
      syncFrequency: "weekly",
      filterByGrade: true
    },
    {
      name: "School Assignments",
      url: "https://api.veracross.com/waterford/subscribe/41B491D0-FC29-4A18-B12F-53917EF1C1F3.ics?uid=8358DF34-F17A-4153-BF54-E4F0E2ACED10",
      type: "assignments",
      enabled: true,
      syncFrequency: "weekly",
      filterByGrade: true
    }
  ],
  invites: {
    defaultGuests: [],
    policy: "manual"
  },
  confidence: {
    autoCreate: 0.85,
    autoUpdate: 0.90,
    requireReviewBelow: 0.85
  },
  defaults: {
    eventDurationMinutes: 60,
    fallbackTime: "09:00",
    createIfTimeUnknown: false
  },
  processing: {
    maxEmailsPerRun: 50,
    lookbackDays: 21,
    deduplicationWindowDays: 14
  },
  notifications: {
    email: "ian.lp.fitzgerald@gmail.com",
    sendOnError: true,
    sendDigests: true
  },
  digests: {
    frequency: "weekly",
    recipients: ["ian.lp.fitzgerald@gmail.com", "Wendy_tui@yahoo.com"],
    includeForwarded: true,
    includePending: true
  }
};
