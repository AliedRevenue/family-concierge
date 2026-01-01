# Decision State Matrix

**Version:** 1.0  
**Purpose:** Define all allowed terminal states and transition rules

---

## State Overview

Every input (email, attachment, calendar event) must reach exactly one terminal state:

| State | Symbol | Responsibility | SLA |
|-------|--------|----------------|-----|
| CREATED | ✓ | System executed | None (complete) |
| UPDATED | ✓ | System executed | None (complete) |
| DEFERRED | ? | System tracking | 7 days → escalate |
| DISMISSED | ⌀ | Parent closed | None (terminal) |
| SKIPPED | — | System rejected | None (terminal) |
| FORWARDED | ↗ | Parent reviewing | Config dependent |
| OUT_OF_SCOPE | ∅ | System ignored | None (terminal) |

---

## State Definitions

### 1. CREATED

**Definition:** A new calendar event was created based on complete information.

**Allowed When:**
- Email contains complete event details:
  - Date (specific, unambiguous)
  - Time (start time minimum)
  - Location (specific venue or address)
  - Person assignment (deterministic match to family member)
- Source is from configured domain
- No conflicting event exists
- Confidence score ≥ threshold (configured per pack)

**Forbidden When:**
- Any required field is missing or ambiguous
- Date is "TBA" or relative without clear reference ("next week" without context)
- Time is missing
- Location is vague ("the field", "school")
- Person cannot be deterministically assigned

**Evidence Required:**
- Original email message ID
- Extracted fields (date, time, location, person)
- Confidence score and reasoning
- Pack configuration reference

**Parent Sees:**
```
✓ Emma's Math Test - Tuesday Jan 7, 2pm
  Source: teacher@school.edu
  Added to: Family Calendar > Emma
  Confidence: High (explicit date/time from school email)
```

**Logged Internally:**
```json
{
  "state": "CREATED",
  "timestamp": "2026-01-01T14:32:00Z",
  "message_id": "abc123@veracross.com",
  "event": {
    "date": "2026-01-07",
    "time": "14:00",
    "location": "Room 304",
    "person": "emma",
    "title": "Math Test"
  },
  "confidence": 0.92,
  "reasoning": "Explicit date and time in teacher email",
  "pack": "school"
}
```

**Responsibility:** System  
**SLA:** None (action complete)

---

### 2. UPDATED

**Definition:** An existing calendar event was modified based on new information.

**Allowed When:**
- Event already exists in calendar
- New email provides updated information (date/time/location change)
- Change is from authoritative source
- No conflict with parent-created events

**Forbidden When:**
- No existing event to update
- Update source is less authoritative than original
- Update would require parent decision (e.g., time conflict)
- Update removes required fields

**Evidence Required:**
- Original event ID
- New information source
- Changed fields (before/after)
- Conflict resolution reasoning

**Parent Sees:**
```
✓ Updated: Emma's Soccer Game
  Was: Saturday 10am → Now: Saturday 2pm
  Source: coach@coachesbox.com
  Reason: Coach sent schedule change email
```

**Logged Internally:**
```json
{
  "state": "UPDATED",
  "timestamp": "2026-01-01T16:45:00Z",
  "event_id": "evt_123",
  "changes": {
    "time": {"from": "10:00", "to": "14:00"}
  },
  "source_message_id": "xyz789@coachesbox.com",
  "reasoning": "Authoritative source confirmed time change"
}
```

**Responsibility:** System  
**SLA:** None (action complete)

---

### 3. DEFERRED

**Definition:** Item requires more information or clarification before action can be taken.

**DEFERRAL IS NOT A FAILURE STATE. It is the correct, deliberate response to incomplete information.**

**Allowed When:**
- Email mentions event but lacks required fields
- Date is ambiguous ("Friday" without context of which week)
- Time is "TBA" or "details coming"
- Location is missing or vague
- Parent assignment is uncertain
- Email says "tentative" or "pending confirmation"

**Forbidden When:**
- All required information is present (must create instead)
- Information is permanently unavailable (must skip or escalate)
- Same item has been deferred >7 days without new information

**Evidence Required:**
- Original email
- Which fields are missing
- Why deferral was chosen
- Expected resolution path

**Parent Sees (within 2 hours):**
```
? Emma's Soccer Game - This Friday
  Missing: Time, location
  Waiting for: Coach follow-up email with details
  Action: Will create event when details arrive
  Status: Watching for updates (expires in 7 days)
```

**Logged Internally:**
```json
{
  "state": "DEFERRED",
  "timestamp": "2026-01-01T12:00:00Z",
  "message_id": "def456@coachesbox.com",
  "missing_fields": ["time", "location"],
  "reason": "Email mentioned 'game Friday' but no time or location provided",
  "watching_for": "Follow-up email from coach@coachesbox.com",
  "escalation_at": "2026-01-08T12:00:00Z"
}
```

**Responsibility:** System (tracking) + Parent (aware and can intervene)  
**SLA:** 
- Surface to parent within 2 hours
- Escalate after 7 days if unresolved

---

### DEFERRAL RULES (Mandatory)

#### When System MUST Defer

1. **Missing Date:** Email mentions event but no specific date
2. **Missing Time:** Date present but time is "TBA" or absent
3. **Ambiguous Date:** "Friday" without clear week reference, "next week" without date
4. **Missing Location:** No venue or address specified
5. **Tentative Status:** Email explicitly says "tentative" or "pending"
6. **Awaiting Confirmation:** Email asks for RSVP before confirming

#### When System MAY Create with Partial Information

**Only if pack configuration explicitly allows:**
- All-day events (time = "00:00", duration = 24h)
- Events with "Virtual" location (for online meetings with link)
- Events with parent-defined default locations (e.g., "Home school pickup" = school address)

**Default:** MUST defer if any field missing

#### When System MUST Escalate Instead of Deferring

1. **Conflicting Information:** Multiple emails with different dates/times
2. **Urgent + Incomplete:** Email marked urgent but lacks details
3. **Past Due:** Referenced date has passed without resolution
4. **7-Day Timeout:** Deferred item unresolved for 7 days

**Escalation means:** Parent receives notification and must choose:
- Dismiss (not relevant)
- Manually create
- Continue waiting

---

### 4. DISMISSED

**Definition:** Parent explicitly marked item as not relevant or no longer needed.

**Allowed When:**
- Parent executes dismiss command with item ID
- Parent provides reason (logged for learning)

**Forbidden When:**
- System auto-dismisses based on inferred irrelevance
- Item dismissed without parent action
- Dismissed without logged reason

**Evidence Required:**
- Parent command timestamp
- Item ID
- Dismissal reason (free text)

**Parent Command:**
```bash
npx tsx src/index.ts dismiss def456 "We're not doing soccer this season"
```

**Parent Sees:**
```
⌀ Dismissed: Emma's Soccer Game
  Reason: Not doing soccer this season
  Action: Stopped watching for soccer updates
```

**Logged Internally:**
```json
{
  "state": "DISMISSED",
  "timestamp": "2026-01-01T18:00:00Z",
  "item_id": "def456",
  "parent_reason": "We're not doing soccer this season",
  "action": "Removed from deferred queue; stopped watching coachesbox.com for Emma"
}
```

**Responsibility:** Parent  
**SLA:** None (terminal state)

**Effect:**
- Item removed from deferred queue
- Future emails matching same pattern may still be caught (unless config updated)
- Dismissal does not change configuration (separate action)

---

### 5. SKIPPED

**Definition:** System determined item does not match configured criteria.

**Allowed When:**
- Email is from configured domain but confidence score below threshold
- Keywords present but context suggests irrelevant (e.g., "test" in "test results" vs "math test")
- Duplicate of existing event
- Already processed (message ID exists in database)

**Forbidden When:**
- Email clearly matches pack criteria (must process or defer)
- Skipping would miss parent-configured intent

**Evidence Required:**
- Confidence score and breakdown
- Why score fell below threshold
- Which rules rejected it

**Parent Sees (in reconciliation view only):**
```
— Skipped: Weekly newsletter from school
  Reason: No event information found
  Category: Administrative
```

**Logged Internally:**
```json
{
  "state": "SKIPPED",
  "timestamp": "2026-01-01T10:00:00Z",
  "message_id": "skip123@school.edu",
  "confidence": 0.15,
  "reasoning": "Newsletter format; no calendar-worthy events mentioned",
  "category": "administrative"
}
```

**Responsibility:** System  
**SLA:** None (terminal state)

---

### 6. FORWARDED

**Definition:** Email forwarded to parent's inbox for manual review.

**Allowed When:**
- Pack configured with forwarding rules
- Email from configured domain but uncertain relevance
- Parent explicitly enabled "forward unknowns" mode

**Forbidden When:**
- Email clearly matches pack criteria (should process instead)
- Forwarding would create duplicate (already in parent's inbox)

**Evidence Required:**
- Forward timestamp
- Recipient email
- Reason for forwarding

**Parent Sees:**
```
↗ Forwarded: Update from coach
  To: wendy_tui@yahoo.com
  Reason: Contains schedule but unclear which child
  Action: Please review and let me know
```

**Logged Internally:**
```json
{
  "state": "FORWARDED",
  "timestamp": "2026-01-01T11:30:00Z",
  "message_id": "fwd789@coachesbox.com",
  "forwarded_to": "wendy_tui@yahoo.com",
  "reasoning": "Mentions 'practice' but no clear child assignment"
}
```

**Responsibility:** Parent (now reviewing)  
**SLA:** Configuration-dependent (e.g., parent reviews within 24h)

---

### 7. OUT_OF_SCOPE

**Definition:** Email source is not configured; system explicitly ignores.

**Allowed When:**
- Email from domain not in any pack configuration
- Email from excluded category (marketing, social)
- Platform not supported (SMS, social media)

**Forbidden When:**
- Email might be relevant but we're guessing (should escalate instead)

**Evidence Required:**
- Email metadata (from, subject)
- Why not in scope

**Parent Sees (never):**
- These are not surfaced (never entered system)

**Logged Internally (lightweight):**
```json
{
  "state": "OUT_OF_SCOPE",
  "timestamp": "2026-01-01T09:00:00Z",
  "from": "marketing@example.com",
  "reason": "Domain not in configured packs"
}
```

**Responsibility:** System  
**SLA:** None (ignored by design)

---

## State Transition Diagram

```
[Email Arrives]
    ↓
[In configured domain?] → NO → OUT_OF_SCOPE (terminal)
    ↓ YES
[Complete information?] → NO → DEFERRED
    ↓ YES                       ↓
[Confidence ≥ threshold?]    [Info arrives?] → YES → CREATED/UPDATED
    ↓ YES                       ↓ NO
[Event exists?] → YES → UPDATED  [7 days passed?] → YES → Escalate to parent
    ↓ NO                         ↓ NO
CREATED                          Continue waiting
                                 ↓
                                [Parent dismisses?] → YES → DISMISSED
```

---

## Escalation Rules

| Condition | Timing | Action |
|-----------|--------|--------|
| Deferred >7 days | Weekly digest Sunday 8pm | Parent must acknowledge or dismiss |
| Conflicting info | Immediate | Parent chooses correct version |
| Parsing failure | Next digest (6am or 8pm) | Parent reviews raw email |
| Urgent + incomplete | Within 1 hour | Notification to parent |

---

## Audit Trail Requirements

Every state transition must log:
- Timestamp (ISO 8601)
- Previous state
- New state
- Evidence (message IDs, field values)
- Reasoning (why this transition)
- Actor (system vs parent)

No decision may be taken without logged reasoning.
