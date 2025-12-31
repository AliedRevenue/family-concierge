# Family Ops - Complete System Design

**Version:** 0.2.0  
**Date:** December 28, 2025  
**Status:** Phase 2 Complete (Digest & Approval System)

---

## 🎯 Executive Summary

**Family Ops** is a configuration-first, email-driven automation system that keeps parents organized across their kids' schools, sports, activities, and communications.

**Core Promise:**
> Set it once. Get a weekly briefing. Never miss an important date or note again.

**How it works:**
1. **Parent configures** what to watch (one-time, web UI)
2. **Agent runs silently** (automated, background)
3. **Parent receives digest** (weekly email, all the intel)
4. **Parent approves** if needed (email links, one-click)
5. **Calendar syncs** (events appear in Google Calendar)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FAMILY OPS SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                    ┌──────────────┐          │
│  │ Gmail Inbox  │◄──────────────────►│   Calendar   │          │
│  │   (Email)    │  (Read/Forward)    │   (Events)   │          │
│  └──────────────┘                    └──────────────┘          │
│         ▲                                    ▲                  │
│         │                                    │                  │
│         └────────────┬─────────────────────┬┘                  │
│                      │                     │                   │
│              ┌───────▼─────────┐    ┌──────▼──────────┐       │
│              │   Gmail API     │    │  Calendar API   │       │
│              │   Connector     │    │    Writer       │       │
│              └───────┬─────────┘    └──────┬──────────┘       │
│                      │                     │                   │
│         ┌────────────┼─────────────────────┼──────────┐       │
│         │            │                     │          │        │
│    ┌────▼───┐  ┌─────▼──────────┐  ┌──────▼────┐ ┌──▼───┐   │
│    │ Event  │  │ Forwarding     │  │ Digest    │ │ Logs │   │
│    │Extract │  │ Engine         │  │ Builder   │ │      │   │
│    └────┬───┘  └─────┬──────────┘  └──────┬────┘ └──┬───┘   │
│         │            │                    │         │        │
│         └────────────┼────────┬───────────┘         │        │
│                      │        │                     │        │
│              ┌───────▼────────▼──────────┐          │        │
│              │   Agent Orchestrator      │          │        │
│              │   (Main Workflow Engine)  │          │        │
│              └───────┬────────────────────┘          │        │
│                      │                               │        │
│         ┌────────────▼────────────────────────────┐ │        │
│         │         SQLite Database                │ │        │
│         ├────────────────────────────────────────┤ │        │
│         │ • Events                               │ │        │
│         │ • Processed Messages                   │ │        │
│         │ • Calendar Operations                  │ │        │
│         │ • Forwarded Messages                   │ │        │
│         │ • Config Versions                      │ │        │
│         │ • Discovery Sessions                   │ │        │
│         │ • Exceptions / Errors                  │ │        │
│         │ • Audit Logs                           │ │        │
│         └───────────────────────────────────────┬┘ │        │
│                                                 │   │        │
│    ┌────────────────────────────────────────┐  │   │        │
│    │     Email Sender (Gmail API)           │  │   │        │
│    │  • Digests                             │  │   │        │
│    │  • Approval Notifications              │◄─┴───┘        │
│    │  • Forwarded Emails                    │               │
│    └────────────────────────────────────────┘               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  INTERFACES (Web + Email)                                │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ • Config UI (localhost:3000/setup)                       │ │
│  │ • Parent Dashboard (localhost:3000/dashboard)           │ │
│  │ • Approval Links (email click → approve)               │ │
│  │ • Digest Emails (weekly briefing)                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Core Modules

### 1. **Agent Orchestrator** (✅ Exists)
- Main workflow engine
- Coordinates all other modules
- Respects three modes: Copilot, Autopilot, Dry-run
- Handles unit-of-work (per-email) processing
- Implements invariants: no duplicates, deduplication window, confidence gating

**Key Methods:**
- `run()` - Main agent loop
- `processPack()` - Process one pack
- `processMessage()` - Process one email
- `processExtractedEvent()` - Create/update/flag event
- `handleForwarding()` - Forward non-event emails
- `executeOperation()` - Write to calendar

---

### 2. **Pack System** (✅ Exists)
- **PackRegistry** - Manages available packs
- **Individual Packs** - Curated presets (Kids Calendar, Sports, etc.)

**Pack Structure:**
```
Pack {
  id: "kids-calendar"
  name: "Kids Calendar"
  version: "1.0.0"
  priority: 80
  
  discoveryRules: {
    senderPatterns: [...],
    keywordSets: [...],
    platformDetectors: [...],
  }
  
  defaultConfig: {
    sources: [...],
    extractionHints: {...},
    eventDefaults: {...},
    forwarding: {...}
  }
}
```

---

### 3. **Gmail Connector** (✅ Exists + Forwarding Added)
Handles all email operations:
- List messages with queries
- Fetch full message details
- Extract headers, body, attachments
- Parse ICS files
- **Forward emails** (new)
- Apply labels
- Read/send emails

---

### 4. **Calendar Writer** (✅ Exists)
Handles all calendar operations:
- Create events
- Update events
- Detect manual edits
- List events in date range
- Delete events (future)

**Critical Safety Setting:**
- **Default `sendUpdates: 'none'`** on all operations
- Prevents surprise notifications to teachers/coaches/other attendees
- User can opt-in to notifications via pack config: `notifyGuests: true`
- This is a commercial-critical UX decision: unexpected notifications = immediate uninstall

---

### 5. **Event Extractor** (✅ Exists)
Extracts event intents from emails:
- **ICS parsing** (primary, v1)
- **Text extraction** (placeholder, future)
- Fingerprinting
- Confidence scoring
- **Extraction reasoning** (stores why this event was created)

**Provenance Tracking:**
For every extracted event, store:
```typescript
ExtractionProvenance {
  method: 'ics' | 'text' | 'manual'
  confidence: number
  confidenceReasons: [
    { factor: 'explicit_time', weight: 0.3, value: true },
    { factor: 'ics_attachment', weight: 0.4, value: true },
    { factor: 'date_in_future', weight: 0.2, value: true }
  ]
  assumptions: ['Used default duration 60 min', 'Timezone from config']
  sourceEmailPermalink: string
  extractedAt: ISO string
}
```
This enables "Why does this event exist?" debugging and builds user trust.

---

### 6. **Discovery Engine** (✅ Exists)
Read-only analysis that proposes configuration:
- Scans lookback period (14 days default)
- Identifies sender patterns
- Extracts frequent keywords
- Detects platforms
- Produces ProposedConfigPatch with evidence

---

### 7. **Config Loader** (✅ Exists)
- Loads YAML/JSON config
- Validates with Zod schema
- Creates default config
- Config versioning

---

### 8. **Digest Builder** (✅ Implemented - Phase 2)
Creates weekly email summaries:
- Groups events by status (created, pending, flagged, forwarded, errors)
- Includes forwarded email summaries
- Statistics (emails scanned, events created, pending approvals)
- Action links (one-click approval URLs)
- HTML + plain text versions
- Responsive email design with CSS
- Date range queries with configurable period

```typescript
Digest {
  id: uuid
  generatedAt: ISO string
  period: { startDate, endDate }
  
  sections: [
    {
      title: "✅ Events Created (3)",
      items: [
        { eventTitle, date, source, confidence }
      ]
    },
    {
      title: "⚠️ Pending Review (1)",
      items: [...]
    },
    {
      title: "📧 Forwarded Emails (5)",
      items: [
        { subject, from, snippet, forwardedTo }
      ]
    }
  ],
  
  stats: {
    emailsScanned: 47,
    eventsCreated: 3,
    eventsPending: 1,
    emailsForwarded: 5,
    errors: 0
  }
}
```

---

### 9. **Email Sender** (✅ Implemented - Phase 2)
Sends emails via Gmail API:
- Digest emails (weekly)
- Approval notifications (as needed)
- Forwarded emails (per config)
- Error alerts (critical issues)
- Multi-part MIME (HTML + plain text)
- Base64 encoding for Gmail API

Uses Gmail API to send, not SMTP. Respects OAuth scopes (gmail.send).

---

### 10. **Approval Handler** (✅ Implemented - Phase 2)
Manages approval workflow:
- Generate short-lived tokens (2 hours default, configurable)
- Handle one-click approval links (Web UI in Phase 3)
- Validate approvals (expiry check, operation existence)
- Execute pending operations (approve() method)
- Clean up expired tokens (>30 days old)
- Stores approval metadata (approved_at, used flag)

```typescript
ApprovalToken {
  id: uuid
  operationId: uuid
  createdAt: ISO
  expiresAt: ISO (2 hours)
  familyId: string
  approved: boolean
  approvedAt?: ISO
}
```

---

### 11. **Scheduler** (✅ Implemented - Phase 2)
Runs agent on schedule:
- Cron-based agent runs (configurable via agent-config.yaml)
- Digest scheduling (weekly, specific day/time)
- Cleanup scheduling (expired tokens, old data)
- Graceful shutdown handling (SIGTERM, SIGINT)
- Error recovery and logging

Current implementation:
- Node.js process with node-cron
- Configuration via YAML (schedule.agentRuns, schedule.digests, schedule.cleanup)
- Future: Docker container, AWS Lambda, etc.

---

### 12. **Database Client** (✅ Exists)
Typed SQLite wrapper with methods for:
- Insert/update/query all domain objects
- Transactional operations
- Migration management

---

### 13. **Logger** (✅ Exists)
Structured logging:
- Winston for console/file
- Audit log to database
- Contextual fields (messageId, fingerprint, etc.)

---

## 🗄️ Database Schema

### Tables (8 total)

#### 1. **processed_messages**
```
message_id (PK)  |  processed_at  |  pack_id  |  extraction_status
events_extracted |  fingerprints  |  error  |  provenance (JSON)
```
Tracks which emails have been processed, prevents duplicate processing.
**Provenance** stores source metadata: message snippet, subject, sender, timestamp.

#### 2. **events**
```
id (PK)  |  fingerprint (UNIQUE)  |  source_message_id  |  pack_id
calendar_event_id  |  event_intent (JSON)  |  confidence  |  status
created_at  |  updated_at  |  last_synced_at  |  manually_edited  |  error
provenance (JSON, nullable)
```
All extracted events with their state.
**Provenance** (added in migration 003) tracks: source_type, message_id, subject, from, snippet, processed_at.

#### 3. **calendar_operations**
```
id (PK)  |  type (create/update/flag)  |  event_fingerprint
event_intent (JSON)  |  reason  |  requires_approval  |  created_at
executed_at  |  status (pending/approved/executed/failed)
error  |  calendar_event_id
```
Queue of operations to perform on calendar.

#### 4. **forwarded_messages**
```
id (PK)  |  source_message_id  |  forwarded_at  |  forwarded_to (JSON)
pack_id  |  reason  |  conditions (JSON)  |  success  |  error
```
Audit trail of forwarded emails.

#### 5. **config_versions**
```
id (PK)  |  version (UNIQUE)  |  config (JSON)  |  created_at
created_by (system/user/discovery)  |  previous_version_id
```
Configuration history for rollback/audit.

#### 6. **discovery_sessions**
```
id (PK)  |  pack_id  |  started_at  |  completed_at
emails_scanned  |  status (running/completed/failed)  |  output (JSON)  |  error
```
Discovery results for configuration proposal.

#### 7. **exceptions**
```
id (PK)  |  timestamp  |  type  |  severity  |  message
context (JSON)  |  resolved  |  resolved_at
```
Error tracking and debugging.

#### 8. **approval_tokens** (✅ Added in Phase 2)
```
id (PK, UUID)  |  operation_id (FK → calendar_operations)
created_at  |  expires_at  |  approved  |  approved_at  |  used
```
Short-lived tokens for one-click approvals via email links.
- Default expiry: 2 hours after creation
- `used` flag prevents replay attacks
- Cleaned up after 30 days

### Additional Tables (Planned):
- **audit_logs** (for detailed action logging)
- **manual_edit_flags** (for detecting calendar edits)
- **discovery_evidence** (linked to discovery sessions)

---

## 👥 User Interfaces

### UI 1: Config Setup (Web)
**URL:** `localhost:3000/setup`

**Purpose:** One-time configuration (5-10 minutes)

**Flow:**
```
1. Select Pack
   → "Kids Calendar"
   
2. See Discovery Results
   → Proposed senders: example.edu, parentsquare.com, ...
   → Proposed keywords: Colin, Henry, early release, ...
   → Evidence: "Found in 23 emails"
   
3. Approve/Edit
   □ example.edu (12 emails) - CHECKED
   □ parentsquare.com (8 emails) - CHECKED
   □ @example.k12 (3 emails) - UNCHECKED
   
4. Configure Forwarding
   Forward to: [parent1@email.com] [parent2@email.com]
   Conditions:
     □ No event found
     □ Keywords: grade report, behavior notice
   Exclude: fundraiser, PTA volunteer
   
5. Save Config
   → Config stored, agent ready
```

**UI Elements:**
- Checkbox grids (senders, keywords)
- Email input (forwarding recipients)
- Toggle switches (enable/disable)
- Progress bar (1-2-3-4-5 steps)
- Save/Preview buttons

---

### UI 2: Parent Dashboard (Web)
**URL:** `localhost:3000/dashboard`

**Purpose:** Check-in on system status, approve events, view history

**Sections:**

#### Section A: This Week Snapshot
```
┌─────────────────────────────────────┐
│ 📊 This Week at a Glance            │
├─────────────────────────────────────┤
│                                     │
│ 📅 7 Events Created                 │
│ 📧 23 Emails Processed              │
│ 🎯 1 Pending Approval               │
│ ✅ 0 Errors                         │
│                                     │
└─────────────────────────────────────┘
```

#### Section B: Pending Approvals (Copilot Mode Only)
```
┌────────────────────────────────────────┐
│ ⚠️ Pending Review (1)                  │
├────────────────────────────────────────┤
│                                        │
│ Spring Concert - May 10, 7:00 PM      │
│ Confidence: 71% | From: Ms. Johnson   │
│ Body: "Spring concert on..."          │
│                                        │
│ [Approve] [Review] [Skip]              │
│                                        │
└────────────────────────────────────────┘
```

#### Section C: Upcoming Calendar (Next 14 Days)
```
┌────────────────────────────────────────┐
│ 📅 Upcoming Events                     │
├────────────────────────────────────────┤
│                                        │
│ Mon, Dec 30                            │
│  □ Early Release (2:30 PM)             │
│  □ Soccer Practice (4:30 PM)           │
│                                        │
│ Tue, Dec 31                            │
│  (No events)                           │
│                                        │
│ Wed, Jan 1                             │
│  □ New Year                            │
│                                        │
│ ... (more days)                        │
│                                        │
└────────────────────────────────────────┘
```

#### Section D: Recent School Communications (Last 7 Days)
```
┌────────────────────────────────────────┐
│ 💬 Recent Communications               │
├────────────────────────────────────────┤
│                                        │
│ Dec 27 - Ms. Johnson                   │
│ "Colin's making great progress!"      │
│ [View] [Archive]                       │
│                                        │
│ Dec 26 - Soccer League                 │
│ "Spring registration now open"         │
│ [View] [Archive]                       │
│                                        │
│ Dec 25 - PTA                           │
│ "Thanks for joining our party!"       │
│ [View] [Archive]                       │
│                                        │
└────────────────────────────────────────┘
```

#### Section E: Digest History & Archive
```
┌────────────────────────────────────────┐
│ 📋 Digest Archive                      │
├────────────────────────────────────────┤
│                                        │
│ Dec 27 (Weekly) - 7 events, 5 notes   │
│ [View in Email] [Delete]               │
│                                        │
│ Dec 20 (Weekly) - 5 events, 3 notes   │
│ [View in Email] [Delete]               │
│                                        │
│ Dec 13 (Weekly) - 9 events, 8 notes   │
│ [View in Email] [Delete]               │
│                                        │
└────────────────────────────────────────┘
```

#### Section F: Pack Management (Settings)
```
┌────────────────────────────────────────┐
│ ⚙️ Family Ops Packs                    │
├────────────────────────────────────────┤
│                                        │
│ ✅ Kids Calendar                       │
│    Last Discovery: Dec 27              │
│    Events This Month: 12               │
│    Forwarding: parent1@ex.com          │
│    [Edit Config] [Run Discovery]       │
│                                        │
│ ❌ Sports & Activities                 │
│    [Enable & Configure]                │
│                                        │
│ ❌ Health & Medical                    │
│    [Enable & Configure]                │
│                                        │
└────────────────────────────────────────┘
```

**Key Features:**
- Read-only (except approvals and settings)
- Responsive (works on phone for quick checks)
- No login required (local only, or token-based)
- Auto-refreshes (or manual refresh button)

---

### UI 3: Email Digest (Weekly)
**Sent:** Sunday 9:00 AM (or configurable)

**Format:** HTML + Plain Text

```
┌─────────────────────────────────────┐
│ 📋 Family Ops Digest                │
│ Week of Dec 28 - Jan 3              │
├─────────────────────────────────────┤
│                                     │
│ ✅ Events Created (7)               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ Mon, Dec 30                         │
│ • Early Release - 2:30 PM           │
│   From: Classroom Dojo              │
│                                     │
│ Wed, Jan 1                          │
│ • New Year - All Day                │
│   From: Calendar                    │
│                                     │
│ Thu, Jan 2                          │
│ • Soccer Practice - 4:30 PM         │
│   From: Soccer League Email         │
│   Confidence: 95%                   │
│                                     │
│ ... (more events)                   │
│                                     │
├─────────────────────────────────────┤
│ ⚠️ Pending Review (1)               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ Spring Concert - May 10, 7:00 PM   │
│ Confidence: 71%                     │
│ From: Ms. Johnson                   │
│                                     │
│ [APPROVE EVENT]                     │
│ https://localhost:3000/approve/... │
│                                     │
├─────────────────────────────────────┤
│ 📧 Emails Forwarded (3)             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ Dec 28 - School Supply List         │
│ "Please bring tissues and hand      │
│  sanitizer for the classroom..."    │
│ From: example.edu                   │
│                                     │
│ Dec 27 - Grade Report Available     │
│ "Colin's report card is now..."     │
│ From: StudentPortal                 │
│                                     │
│ ... (more)                          │
│                                     │
├─────────────────────────────────────┤
│ 📊 This Week's Stats                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ Emails Processed: 47                │
│ Events Extracted: 7                 │
│ Emails Forwarded: 3                 │
│ Pending Approval: 1                 │
│ Errors: 0                           │
│                                     │
├─────────────────────────────────────┤
│ 🔧 Manage Your Settings             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ [Edit Pack Configuration]           │
│ [View Dashboard]                    │
│ [Manage Digest Frequency]           │
│                                     │
│ Questions? Contact support.         │
│                                     │
└─────────────────────────────────────┘
```

---

### UI 4: One-Click Approval (Email Link)
**URL:** `localhost:3000/approve/:token`

**Purpose:** Fast approval from email (2-second process)

**Flow:**
```
1. User clicks [APPROVE EVENT] link in digest email
2. Page loads: "Approving Spring Concert..."
3. Event approved in database
4. Calendar event created
5. Page shows: "✅ Approved! Calendar updated."
6. Closes in 3 seconds (or user can navigate back)
```

**Code:** `ApprovalHandler` generates 2-hour tokens, validates them, marks operations as approved.

---

### UI 5: Event Provenance Page (Web)
**URL:** `localhost:3000/event/:fingerprint/provenance`

**Purpose:** Explain why an event exists (trust-building + debugging)

**Layout:**
```
┌────────────────────────────────────────┐
│ 🔍 Event Provenance                    │
├────────────────────────────────────────┤
│                                        │
│ Early Release - Dec 30, 2:30 PM       │
│                                        │
│ 📧 Source Email                        │
│ From: teacher@example.edu              │
│ Subject: "Early dismissal Friday"     │
│ Date: Dec 27, 2025                     │
│ [View Original Email]                  │
│                                        │
│ 🎯 Extraction Method                   │
│ • ICS Attachment (calendar.ics)        │
│ • Confidence: 95%                      │
│                                        │
│ ⚖️ Confidence Breakdown                │
│ ✅ ICS attachment found (+40%)         │
│ ✅ Explicit time specified (+30%)      │
│ ✅ Date in future (+20%)               │
│ ✅ Known sender domain (+5%)           │
│                                        │
│ 📝 Assumptions Made                    │
│ • Duration: 60 min (default)           │
│ • Timezone: America/Los_Angeles        │
│ • Color: #10 (pack default)            │
│                                        │
│ 📅 Calendar Status                     │
│ • Created: Dec 27, 9:15 AM             │
│ • Last Synced: Dec 27, 9:15 AM         │
│ • Manually Edited: No                  │
│ • Calendar Event ID: abc123xyz         │
│                                        │
│ [Edit Event] [Delete Event]            │
│                                        │
└────────────────────────────────────────┘
```

**Access:**
- Linked from digest emails ("Why this event?")  
- Linked from dashboard event list
- Direct URL with fingerprint

---

## 🔄 User Workflows

### Workflow 1: Initial Setup (Day 1)
```
User Creates Google Cloud Project
    ↓
User Configures OAuth in .env
    ↓
User Runs: npm run dev
    ↓
Browser Opens: localhost:3000/setup
    ↓
Discovery Engine Scans 14 Days of Email
    ↓
User Sees Proposed Config:
  • Senders: example.edu, parentsquare.com
  • Keywords: Colin, Henry, early release
  • Platforms: SignupGenius, ParentSquare
    ↓
User Checks Boxes:
  ✅ example.edu
  ✅ parentsquare.com
  ❌ parent-volunteer.example.edu
    ↓
User Enters Forwarding Recipients:
  parent1@email.com
  parent2@email.com
    ↓
User Clicks "Save & Start"
    ↓
Database Stores Config
    ↓
User Returns to Email
    ↓
✅ Done
```

---

### Workflow 2: Daily/Weekly Operation (Automated)
```
[Scheduler Trigger] Every Day at 6 AM
    ↓
Agent Runs (Copilot/Autopilot mode)
    ↓
For Each Enabled Pack:
  ├─ Build Gmail query
  ├─ Fetch emails (last 14 days, unprocessed)
  ├─ For each email:
  │   ├─ Extract events (ICS or text)
  │   ├─ Check for duplicates
  │   ├─ Create operation (create/update/flag)
  │   ├─ If high confidence: execute (Autopilot)
  │   ├─ If low confidence: queue for approval (Copilot)
  │   ├─ If no event: check forwarding conditions
  │   └─ If forward: send to recipients
  │
  └─ Mark message processed
    ↓
Digest Generator Creates Summary
    ↓
Digest Sent via Email (if scheduled)
    ↓
✅ Done, await next run
```

---

### Workflow 3: Weekly Digest Reception & Action
```
Parent Receives Digest Email (Sunday 9 AM)
    ↓
Parent Reads:
  ✅ 7 Events Created (calendar updated automatically)
  ⚠️ 1 Event Pending Review (71% confidence)
  📧 3 Emails Forwarded
    ↓
Parent Has 3 Options:
  
  Option A: Click [APPROVE EVENT] in email
    → One-click approval
    → Calendar updated
    → Done ✅
  
  Option B: Click [View Dashboard]
    → Opens localhost:3000/dashboard
    → Reviews all pending items
    → Approves/rejects as needed
    → Done ✅
  
  Option C: Do nothing
    → Event stays pending
    → Included in next digest
    → Parent can approve later
    ↓
✅ Done
```

---

### Workflow 4: Add New Pack (Sports)
```
Parent Logs Into Dashboard
    ↓
Sees: "Sports & Activities [Enable & Configure]"
    ↓
Clicks "Enable & Configure"
    ↓
Browser Navigates to Setup UI for Sports Pack
    ↓
Runs Discovery on Sports Emails
    ↓
Shows Results:
  • Senders: soccer-league.com, coachmail.com
  • Keywords: soccer, practice, game, tournament
  • Platforms: TeamSnap, LeagueGear
    ↓
Parent Checks Boxes
    ↓
Parent Specifies Forwarding:
  Forward to: coach-group@slack.com (if integrated)
  Or just: parent1@email.com
    ↓
Parent Clicks "Save"
    ↓
✅ Sports Pack Now Active
```

---

### Workflow 5: Safe Backfill (Historical Events)
```
Parent Wants to Backfill Jan-Mar Events
    ↓
Parent Runs: npm run backfill -- --from 2025-01-01 --to 2025-03-31
    ↓
System: "Backfill must run in dry-run mode first"
System: "Use: npm run backfill -- --from 2025-01-01 --to 2025-03-31 --dry-run"
    ↓
Parent Runs with --dry-run
    ↓
System Analyzes:
  • Scans 90 days of email
  • Finds 47 potential events
  • Groups by confidence:
    - High (>85%): 32 events
    - Medium (70-85%): 10 events
    - Low (<70%): 5 events
    ↓
System Shows Summary:
┌─────────────────────────────────┐
│ Backfill Preview (Dry Run)      │
├─────────────────────────────────┤
│ Date Range: Jan 1 - Mar 31      │
│ Emails Scanned: 143             │
│ Events Found: 47                │
│                                 │
│ Would Create:                   │
│ ✅ 32 high-confidence events    │
│ ⚠️  10 medium-confidence events │
│ ❌ 5 low-confidence events      │
│                                 │
│ [View Details] [Export CSV]     │
└─────────────────────────────────┘
    ↓
Parent Reviews Details (optional)
    ↓
Parent Decides to Proceed
    ↓
Parent Runs: npm run backfill -- --from 2025-01-01 --to 2025-03-31 --confirm
    ↓
System Confirms:
  "This will create 47 events in your calendar."
  "High-confidence events will be created immediately."
  "Medium/low-confidence events will be queued for approval."
  "Continue? (y/N)"
    ↓
Parent Types: y
    ↓
System Processes:
  ├─ Creates 32 high-confidence events
  ├─ Queues 15 for approval (next digest)
  └─ Logs all actions to audit trail
    ↓
System Reports:
  "✅ Backfill complete"
  "32 events created"
  "15 events pending approval"
  "Check your calendar and next digest"
    ↓
✅ Done
```

**Safety Features:**
- Always dry-run first (enforced, no bypass)
- Cap at 100 events per run (prevents calendar bomb)
- Confidence gating (only high-confidence auto-created)
- Full preview before execution
- Audit trail of all backfill operations
- Rollback command: `npm run backfill -- --rollback <backfill-id>`

---

## 🎛️ Operating Modes

### Mode 1: Copilot (Default)
**Philosophy:** Propose → Approve → Act

```
Email comes in
    ↓
Event extracted (confidence 71%)
    ↓
Confidence below threshold (auto_create: 85%)
    ↓
Operation queued as PENDING
    ↓
Next digest includes pending event
    ↓
Parent clicks [APPROVE] in digest
    ↓
Operation executes (calendar event created)
    ↓
✅ Event created with parent approval
```

**Use case:** Conservative, parent wants to review

---

### Mode 2: Autopilot
**Philosophy:** Auto-create high-confidence only

```
Email comes in
    ↓
Event extracted (confidence 95%)
    ↓
Confidence above threshold (auto_create: 85%)
    ↓
Operation executes IMMEDIATELY
    ↓
Calendar event created (no approval needed)
    ↓
Digest mentions: "✅ Event created automatically"
    ↓
✅ Parents see event in calendar, digest reports it
```

**Use case:** Trust the system, minimal friction

---

### Mode 3: Dry Run
**Philosophy:** Process without writing

```
Email comes in
    ↓
Event extracted (confidence 95%)
    ↓
Operations generated and logged
    ↓
Calendar write SKIPPED
    ↓
Digest generated with [DRY RUN] prefix
    ↓
Dashboard shows "Dry Run Mode"
    ↓
✅ Useful for testing new pack configurations
```

**Use case:** New config, want to validate before activating

---

## 📊 Data Flows

### Data Flow 1: Event Extraction
```
Gmail Email
    ↓
Attachments checked for ICS
    │
    ├─ Found ICS
    │   └─ Parse with ical.js
    │       └─ Extract: title, time, attendees, etc.
    │           └─ Score confidence: 95%
    │
    └─ No ICS
        └─ Text parsing (v1: placeholder)
            └─ Extract: (TBD in v1.1)
                └─ Score confidence: (TBD)
    ↓
EventFingerprint (messageId + normalized title + date + time)
    ↓
Check for duplicates (14-day window)
    ↓
Event stored in database
    ↓
Calendar operation created
```

---

### Data Flow 2: Forwarding Decision
```
Email matches pack sources
    ↓
Events extracted: 0
    ↓
Check forwarding enabled
    │
    └─ No → Skip forwarding
    
    └─ Yes → Evaluate conditions
        ├─ no_event_found: ✅ Match
        ├─ keyword_match: [grade report, behavior notice]
        │   └─ Does email contain keyword? YES
        └─ always: N/A
    ↓
All conditions met
    ↓
Check exclude_patterns: [fundraiser, donation]
    │
    └─ Email contains "fundraiser"? NO
    ↓
Forward email to recipients
    ↓
Record in forwarded_messages table
```

---

### Data Flow 3: Digest Generation
```
Query database for period (Sun-Sat)
    ↓
Events by status:
  ├─ created: 7 events
  ├─ pending_approval: 1 event
  ├─ failed: 0 events
    ↓
Forwarded emails: 3
    ↓
Stats:
  • emailsScanned: 47
  • eventsCreated: 7
  • emailsForwarded: 3
  • errors: 0
    ↓
Generate HTML:
  • Sections for each status
  • Action links for pending
  • Stats summary
    ↓
Generate Plain Text version
    ↓
Send via Gmail API to recipients
```

---

## 🔐 Security & Privacy Model

### OAuth Scopes (Minimal)
```
gmail.readonly      - Read emails only
gmail.send          - Send digests, forwards, notifications
calendar.events     - Create/update calendar events
```

**NOT requested:**
- ❌ gmail.modify (can't delete user emails)
- ❌ calendar.readonly (full calendar access)
- ❌ directory.readonly
- ❌ contacts.readonly

---

### Data Storage
- ✅ Local SQLite only (no cloud)
- ✅ OAuth tokens in `./oauth-tokens/` (gitignored)
- ✅ No API keys in code
- ✅ All secrets in `.env` (gitignored)
- ✅ Audit trail for all operations
- ✅ No PII logged beyond messageId/fingerprint

---

### Approval Tokens
- 2-hour expiration
- Single-use (mark as used after approval)
- Cryptographically random (uuid v4)
- Scoped to specific operation

---

## 🚀 Deployment Architecture

### Local Development
```
npm run dev
  → Runs agent + web UI on localhost:3000
  → Uses local SQLite
  → OAuth server auto-opens browser for first-time auth
  → OAuth redirects to localhost:3000/oauth/callback
  → Automatic scheduling via node-cron (configurable in YAML)
```

**OAuth Flow (Automatic - Phase 2):**
1. First run: Agent detects no token exists
2. Starts temporary Express server on port 3000
3. Auto-opens browser to Google authorization page
4. User clicks "Allow"
5. Google redirects to `localhost:3000/oauth/callback`
6. Server captures code, exchanges for tokens
7. Browser shows "✅ Authorization Successful!"
8. Server shuts down, agent continues
9. Token saved to `oauth-tokens/token.json` (auto-refreshed)

### Self-Hosted (Docker)
```
docker build -t family-ops .
docker run -e GOOGLE_CLIENT_ID=... family-ops
  → Runs in container
  → Cron job runs agent hourly
  → Web UI exposed on :3000
  → Persistent volume for SQLite
```

### Serverless (Future)
```
AWS Lambda + EventBridge
  → Agent runs on schedule (CloudWatch trigger)
  → API Gateway for web UI
  → RDS/Aurora for database
  → Cognito for auth (if needed)
```

---

## 📦 Implementation Phases

### Phase 1: Foundation (✅ Complete)
- [x] Type definitions
- [x] Database schema & migrations
- [x] Core modules (Orchestrator, Connectors, Extractors)
- [x] Pack system
- [x] Forwarding system
- [x] OAuth setup (manual CLI flow)

### Phase 2: Digest & Approval System (✅ Complete)
- [x] DigestBuilder (format summaries with HTML/text)
- [x] EmailSender (send digests, approvals)
- [x] ApprovalHandler (token generation, validation, cleanup)
- [x] Scheduler (cron-based runs with node-cron)
- [x] Backfill command (historical email processing)
- [x] Provenance tracking (source metadata for events)
- [x] Migration 003 (approval_tokens table + provenance column)
- [x] Automatic OAuth flow (Express server, browser auto-open)
- [x] Testing infrastructure

**Status:** All core backend functionality complete. Digest generation, approval token creation, and scheduled runs working. Ready for Phase 3 web UIs.

### Phase 3: Web Interfaces (🚧 Next)
- [ ] Approval endpoint (GET /approve/:token)
- [ ] Parent dashboard (localhost:3000/dashboard)
- [ ] Config setup UI (localhost:3000/setup)
- [ ] Event provenance page (/event/:fingerprint/provenance)
- [ ] Static pages (landing, help)
- [ ] Responsive design (mobile-friendly)

### Phase 4: Testing & Refinement (Future)
- [ ] Test with real Gmail data (multiple households)
- [ ] Error handling & recovery improvements
- [ ] Rate limiting (API quota management)
- [ ] Logging & monitoring enhancements
- [ ] Docker setup
- [ ] Deploy to staging/prod

### Phase 5: Advanced Features (v2.0+)
- [ ] Text extraction (NLP/LLM for non-ICS events)
- [ ] Multi-child events (single email, multiple kids)
- [ ] Email reply commands ("approve", "skip", "delete")
- [ ] Additional packs (Sports, Medical, Activities)
- [ ] Mobile app (React Native)

---

## 🎯 Success Metrics

### v1.0 Goals (Phase 1-3)
- ✅ Extract 95%+ of ICS events correctly
- ✅ Zero duplicate events (fingerprint-based deduplication)
- ✅ < 5% false positives
- ✅ Setup time < 15 minutes (with automatic OAuth)
- ✅ Full audit trail (provenance tracking)

### v1.1 Goals
- Text extraction accuracy > 80%
- Digest comprehensibility (parent survey)
- < 2% approval required events

### v2.0 Goals
- Support 1000+ families
- 99.9% uptime
- < 5s p95 latency
- NPS > 50

---

## 📖 Configuration Example

```yaml
# Complete family-ops config
version: "1.0.0"
createdAt: "2025-12-28T00:00:00Z"
updatedAt: "2025-12-28T00:00:00Z"

packs:
  - packId: kids-calendar
    priority: 80
    config:
      sources:
        - name: "Elementary School"
          type: email
          fromDomains: [example.edu, parentsquare.com]
          keywords: [Colin, Henry, early release]
          enabled: true
          label: "Family Ops/School"

      extractionHints:
        preferIcsOverText: true
        defaultDuration: 60
        fallbackTime: "09:00"
        requireExplicitTime: false

      eventDefaults:
        durationMinutes: 60
        reminderMinutes: [1440, 60]
        color: "10"

      forwarding:
        enabled: true
        forwardTo: [parent1@email.com, parent2@email.com]
        conditions:
          - type: no_event_found
            excludePatterns: [fundraiser, PTA]
          - type: keyword_match
            value: [grade report, behavior]
        includeOriginal: true
        subjectPrefix: "[Family Info] "

calendar:
  calendarId: primary
  timezone: America/Los_Angeles

invites:
  defaultGuests: [parent1@email.com, parent2@email.com]
  policy: always

confidence:
  autoCreate: 0.85
  autoUpdate: 0.90
  requireReviewBelow: 0.85

defaults:
  eventDurationMinutes: 60
  fallbackTime: "09:00"
  createIfTimeUnknown: false

processing:
  maxEmailsPerRun: 50
  lookbackDays: 14
  deduplicationWindowDays: 14

digests:
  enabled: true
  sendTo: [parent1@email.com, parent2@email.com]
  frequency: weekly
  dayOfWeek: Sunday
  time: "09:00"
  includeStats: true
  includeForwarded: true
```

---

## 🗺️ System Diagram (Simplified)

```
SETUP PHASE
┌─────────────────────────────────────────┐
│ Parent Opens localhost:3000/setup       │
│ • Runs discovery on Kids Calendar pack  │
│ • Reviews proposed senders/keywords     │
│ • Checks boxes                          │
│ • Sets forwarding recipients            │
│ • Clicks "Save & Start"                 │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Config saved to database                │
│ Agent ready to run                      │
└────────┬────────────────────────────────┘

OPERATION PHASE (Runs on Schedule)
         │
         ▼
┌─────────────────────────────────────────┐
│ [Scheduler Trigger]                     │
│ Agent run starts (6 AM daily)           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ [Agent Orchestrator]                    │
│ For each pack:                          │
│ • Query Gmail for pack sources          │
│ • Process each email                    │
│ • Extract events                        │
│ • Forward non-event emails              │
│ • Create calendar operations            │
└────────┬────────────────────────────────┘
         │
         ▼
    ┌────┴────┐
    │ Copilot │ Autopilot    Dry-Run
    │         │
    ▼         ▼
Queue for  Execute
Approval   Immediately
    │         │
    └────┬────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ [Digest Builder]                        │
│ • Group events by status                │
│ • Include forwarded emails              │
│ • Generate approval links               │
│ • Create HTML + text versions           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ [Email Sender]                          │
│ • Send digest (Sunday 9 AM)             │
│ • Send pending approval notifications   │
│ • Forward info-only emails              │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Parent Receives Digest Email            │
│ • Review 7 new events                   │
│ • Review 1 pending approval             │
│ • Review 3 forwarded emails             │
│ • Click [APPROVE] for pending           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ [Approval Handler]                      │
│ Validates token → Marks approved        │
│ → Executes calendar operation           │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Parent's Google Calendar Updated        │
│ • Events appear in calendar             │
│ • Reminders sent per configuration      │
│ • Done ✅                               │
└─────────────────────────────────────────┘

DASHBOARD PHASE (On-Demand)
         │
         ▼
┌─────────────────────────────────────────┐
│ Parent Opens localhost:3000/dashboard   │
│ • See weekly snapshot                   │
│ • Review pending approvals              │
│ • View upcoming calendar                │
│ • Check recent communications           │
│ • Browse digest archive                 │
│ • Manage packs (enable/edit)            │
└─────────────────────────────────────────┘
```

---

## 🎬 Example: Complete User Journey (Day 1-7)

### Day 1 - Setup (5 minutes)
```
8:00 AM
User: Opens email setup link
User → Config UI (localhost:3000/setup)
System: Discovery runs, scans 14 days of email
System: Shows proposed config
User: Checks boxes (example.edu, parentsquare.com, not PTA)
User: Enters parent emails (parent1@ex.com, parent2@ex.com)
User: Clicks "Save & Start"
8:05 AM
✅ Family Ops configured and ready
```

### Day 2 - Silent Operation
```
6:00 AM
System: Agent runs automatically
System: Finds 15 school emails, extracts 3 events
System: Forwards 2 info-only emails to parents
System: Creates database records
6:05 AM
✅ Done, parents have no idea this happened
```

### Day 7 - First Digest
```
9:00 AM
System: DigestBuilder creates summary
System: Sends email to parent1@ex.com, parent2@ex.com

EMAIL DIGEST:
┌─────────────────────────┐
│ Family Ops Digest       │
│ Week of Dec 28 - Jan 3  │
├─────────────────────────┤
│                         │
│ ✅ 7 Events Created     │
│ • Early Release - 2:30  │
│ • Field Trip - 9:00 AM  │
│ ... (more)              │
│                         │
│ ⚠️ 1 Event Pending      │
│ • Spring Concert - 7PM  │
│ Confidence: 71%         │
│ [APPROVE] (link)        │
│                         │
│ 📧 3 Forwarded          │
│ • Grade report ready    │
│ • Supply list           │
│ • Nurse notice          │
│                         │
└─────────────────────────┘

Parent1: Skims digest (2 minutes)
Parent1: Sees pending Spring Concert
Parent1: Clicks [APPROVE]
  → Browser loads approval page
  → Shows event details
  → Parent confirms
  → Click [Confirm Approve]
  → Page shows "✅ Approved!"
Parent1: Checks calendar, sees all events synced
Parent1: Done ✅

Email also forwarded to Parent2 (optional)
Parent2: Reviews same digest, takes same action
```

### Day 8-14 - Dashboard Check
```
Parent1: Opens localhost:3000/dashboard
Dashboard: Shows
  • This week: 7 events created, 23 emails processed
  • Upcoming: Calendar for next 2 weeks
  • Recent comms: Teacher notes, coach updates
  • Archives: Digest from last week (searchable)
Parent1: Clicks [Edit Config] for Kids Calendar pack
Parent1: Adjusts forwarding recipients (add grandma)
Parent1: Saves
Parent1: Done ✅
```

---

## 📋 Summary Table

| Aspect | Design |
|--------|--------|
| **Primary Interface** | Email digests (weekly) |
| **Secondary Interface** | Web dashboard (check-in) |
| **Setup Interface** | Web config UI (one-time) |
| **Approval Mechanism** | One-click email links + dashboard |
| **Operating Modes** | Copilot (default), Autopilot, Dry-run |
| **Database** | SQLite (local) |
| **Authentication** | OAuth via Gmail |
| **Deployment** | Local/Docker/Serverless |
| **Update Frequency** | Daily (configurable) |
| **Digest Frequency** | Weekly (configurable) |
| **Packs Supported** | Kids Calendar (v1), Sports/Activities (v1.1+) |
| **User Effort** | 5 min setup, <1 min/digest |
| **Cognitive Load** | Minimal (email-first) |

---

## 🔍 Key Design Decisions Explained

### 1. Email-First (Not Dashboard-First)
**Why:** Parents already check email. No new habit formation needed. Dashboard is optional for power users.

### 2. Weekly Digest (Not Real-Time)
**Why:** Batch summaries reduce notification fatigue. Parent can review once/week at fixed time.

### 3. Forwarding (Not Just Extraction)
**Why:** "Keep up with admin" includes non-event communications (grades, behavior, updates).

### 4. One-Click Approvals
**Why:** Parents don't have time to log in. Approval must be < 5 seconds from email.

### 5. Local-First (SQLite, not cloud)
**Why:** Privacy, no vendor lock-in, works offline (scheduling still works), data in user's hands.

### 6. Config UI Separate from Dashboard
**Why:** Setup is rare (one-time). Dashboard is frequent check-in. Different use cases, different needs.

### 7. Packs System
**Why:** Reusable, versioned, scalable to sports/medical/etc. Can enable/disable independently.

### 8. Forwarding Conditions
**Why:** Not every email should forward. Conditions allow sophisticated rules without prompting.

---

## ✅ Completeness Check

This design covers:

- ✅ **Deterministic:** Same inputs → same outputs
- ✅ **Idempotent:** Processing same email twice → no duplicates
- ✅ **Auditable:** Every action logged with context
- ✅ **Privacy-First:** Minimal scopes, local data, no cloud
- ✅ **Config-Not-Prompts:** Checkboxes, not AI guessing
- ✅ **Safe:** Confidence gating, approval workflow
- ✅ **Scalable:** Pack system, multi-family ready
- ✅ **Low Friction:** Email digests, one-click approvals
- ✅ **Minimal Cognitive Load:** Set once, read weekly

---

**Ready to implement Phase 2 (DigestBuilder + EmailSender + ApprovalHandler)?**
