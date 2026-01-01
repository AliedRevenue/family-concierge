# Failure & Error Handling

**Version:** 1.0  
**Purpose:** Define how system behaves when things go wrong

---

## Core Principle

**Escalation replaces guessing.**

When the system cannot determine the correct action:
- It must NOT guess
- It must NOT silently fail
- It MUST escalate to parent with context

---

## Error Categories

### 1. Parsing Failures

**Definition:** System cannot extract information from email/attachment

**Examples:**
- Corrupted PDF attachment
- Malformed email HTML
- Unreadable image
- Non-standard date format that fails parsing

**Required Behavior:**

✅ **DO:**
- Log the parsing error with full context
- Surface error in next digest
- Provide parent access to original email
- Continue processing other emails

❌ **DO NOT:**
- Guess at missing information
- Skip silently
- Retry indefinitely without notifying parent
- Mark as "handled" when parsing failed

**Parent Notification:**
```
⚠️ ERROR - Could Not Process Email

Email: "Team schedule update" from coach@athletics.com
Date: Jan 8, 2pm
Error: PDF attachment corrupted or unreadable

ACTION REQUIRED:
  → Review original email manually
  → Or contact sender for re-send
  → Or forward corrected info to me

This email has been logged but not processed.
```

**Logged Internally:**
```json
{
  "state": "ERROR",
  "type": "parsing_failure",
  "timestamp": "2026-01-08T14:00:00Z",
  "message_id": "err123@athletics.com",
  "error": "PDF parsing failed: InvalidPDFError",
  "notified_parent": true,
  "notification_sent": "2026-01-09T06:00:00Z"
}
```

---

### 2. Malformed Data

**Definition:** Data exists but is unusable or nonsensical

**Examples:**
- Date is "00/00/0000"
- Time is "99:99"
- Location is empty string or null
- Event title is gibberish or encoding error

**Required Behavior:**

✅ **DO:**
- Treat as deferred (missing information)
- Surface to parent with explanation
- Log malformed data for debugging

❌ **DO NOT:**
- Attempt to "fix" malformed data
- Use default values (e.g., "12:00" for missing time)
- Treat as valid and create event

**Parent Notification:**
```
? Emma's Math Test - Date unclear
  Source: teacher@school.edu
  Issue: Email listed date as "13/32/2026" (invalid)
  
  ACTION REQUIRED:
    → Check original email for correct date
    → Or contact teacher for clarification
```

---

### 3. Conflicting Information

**Definition:** Multiple sources provide different details for same event

**Examples:**
- Email 1: "Game Saturday 10am"
- Email 2: "Game Saturday 11am" (same sender, different time)
- Two teachers send different test dates

**Required Behavior:**

✅ **DO:**
- Create event with first-received information
- Mark as "conflict detected"
- Notify parent of discrepancy
- Log both sources

❌ **DO NOT:**
- Choose "most recent" automatically
- Average the times
- Ignore second email
- Update without notifying parent

**Parent Notification:**
```
⚠️ CONFLICT DETECTED

Event: Basketball game - Saturday Jan 11
Source 1 (Jan 5): 10am (athletics@school.edu)
Source 2 (Jan 8): 11am (athletics@school.edu)

CURRENT IN CALENDAR: 10am (from first email)

ACTION REQUIRED:
  → Verify which time is correct
  → Update calendar manually if 11am is correct
  
Both emails logged for reference.
```

**Logged Internally:**
```json
{
  "state": "CONFLICT",
  "timestamp": "2026-01-08T14:00:00Z",
  "event_id": "evt_123",
  "conflict": {
    "field": "time",
    "value_1": "10:00",
    "source_1": "msg_001@athletics.com",
    "date_1": "2026-01-05",
    "value_2": "11:00",
    "source_2": "msg_002@athletics.com",
    "date_2": "2026-01-08"
  },
  "resolution": "kept_first",
  "notified_parent": true
}
```

---

### 4. Ambiguous Context

**Definition:** Information is present but meaning is unclear

**Examples:**
- "Friday" without specifying which Friday
- "The field" without specifying which field
- "Practice" when child has multiple activities
- Email mentions multiple children but unclear which one

**Required Behavior:**

✅ **DO:**
- Mark as ⚠ Needs Decision
- Explain ambiguity clearly
- Surface immediately (don't defer indefinitely)
- Provide context to help parent decide

❌ **DO NOT:**
- Guess which Friday
- Use "default" location
- Assign to first child mentioned
- Create event with ambiguous information

**Parent Notification:**
```
⚠ Basketball Game - "This Friday"
  Source: coach@athletics.com
  Email date: Dec 28, 2025
  
  Ambiguity: "Friday" could mean:
    • Jan 3, 2026 (this week)
    • Jan 10, 2026 (next week)
  
  Context: Email was sent on Saturday Dec 28.
  "This Friday" is ambiguous.
  
  ACTION REQUIRED:
    → Review original email
    → Determine correct date
    → Create event manually or dismiss
```

---

### 5. Missing Required Fields

**Definition:** Email mentions event but lacks required information

**Examples:**
- Date present, time missing
- Date and time present, location missing
- All fields present, person assignment unclear

**Required Behavior:**

✅ **DO:**
- Defer (this is correct behavior, not a failure)
- Explicitly state what's missing
- Set escalation timer (7 days)
- Watch for follow-up emails

❌ **DO NOT:**
- Create event with "TBA" fields
- Use default values
- Mark as handled
- Guess missing information

**Parent Notification:**
```
? Emma's Soccer Game - This Friday
  Source: coach@coachesbox.com
  
  Missing: Time, location
  Present: Date (Friday Jan 3)
  
  Waiting for: Coach follow-up with details
  Deferred since: Dec 28, 3pm
  Escalates in: 5 days
  
  ACTION:
    → System will watch for follow-up
    → Or dismiss if not relevant
    → Or add manually if you get details elsewhere
```

---

### 6. Urgent + Incomplete

**Definition:** Email marked urgent but lacks required information

**Examples:**
- Subject: "URGENT: Game tomorrow"
- Body: No time or location
- Sender: Authorized source

**Required Behavior:**

✅ **DO:**
- Escalate immediately (within 1 hour)
- Notify parent of urgency
- Explain missing information
- Surface in special "urgent" section

❌ **DO NOT:**
- Defer normally (7-day escalation too slow)
- Create event without details
- Skip due to missing info

**Parent Notification (Immediate):**
```
🚨 URGENT - Incomplete Information

Email: "URGENT: Game tomorrow"
From: coach@athletics.com
Date: Jan 7, 4pm

Email marked urgent but missing:
  • Time
  • Location
  
ACTION REQUIRED IMMEDIATELY:
  → Check your email for coach contact info
  → Reply asking for time/location
  → Or check team app/website
  
Event date: Tomorrow (Jan 8)
This cannot wait for normal escalation.
```

---

## System Failures

### Database Connection Failures

**Behavior:**
- Halt processing (do not continue without logging)
- Send alert to configured admin email
- Retry with exponential backoff
- Surface error to parent if persists

**Parent Notification (if persists >1 hour):**
```
⚠️ SYSTEM ERROR - Processing Paused

Family Concierge is temporarily unable to process emails.

Status: Database connection error
Started: Jan 8, 2pm
Duration: 1 hour

Your calendar is unchanged.
No emails have been lost.

I will retry automatically.
You'll receive confirmation when processing resumes.
```

---

### Gmail API Failures

**Behavior:**
- Retry with exponential backoff
- Log API error details
- Continue processing other emails if possible
- Surface error after 3 failed attempts

**Parent Notification:**
```
⚠️ EMAIL ACCESS ERROR

I was unable to access your Gmail account.

Possible causes:
  • Gmail API rate limit
  • Authentication expired
  • Gmail service outage

Action:
  → Check Gmail access in config
  → Re-authenticate if needed: npx tsx src/index.ts auth
  
Processing will resume automatically when access is restored.
```

---

### Calendar Write Failures

**Behavior:**
- Do NOT mark event as created
- Keep in deferred state
- Retry on next processing run
- Notify parent after 3 failures

**Parent Notification:**
```
⚠️ CALENDAR ERROR - Event Not Created

Event: Emma's Math Test - Friday Jan 10, 2pm
Source: teacher@school.edu
Issue: Unable to write to Google Calendar

Possible causes:
  • Calendar permissions changed
  • Calendar deleted
  • Google Calendar service issue

Action:
  → Check calendar integration: npx tsx src/index.ts audit emma
  → Or create event manually
  
Event details saved. Will retry automatically.
```

---

## Escalation Rules Summary

| Error Type | Timing | Action |
|------------|--------|--------|
| Parsing failure | Next digest (6am/8pm) | Parent reviews original |
| Malformed data | Next digest | Treated as deferred |
| Conflicting info | Next digest | Parent chooses correct version |
| Ambiguous context | Next digest | Parent clarifies meaning |
| Missing fields | 2 hours → Next digest | Deferred, escalate in 7 days |
| Urgent + incomplete | Within 1 hour | Immediate notification |
| System failure | 1 hour | Admin alert + parent notification |

---

## Forbidden Behaviors

### Silent Failures (NEVER)

❌ **Email skipped without log:**
```
Email arrives → Parse error → Nothing logged → Parent never knows
```

✅ **Correct:**
```
Email arrives → Parse error → Logged with full context → Parent notified in digest
```

---

### Silent Retries (NEVER)

❌ **Infinite retry loop without notification:**
```
Parse fails → Retry → Parse fails → Retry → (forever)
```

✅ **Correct:**
```
Parse fails → Retry (3x) → Log error → Notify parent → Stop retrying
```

---

### "Handled" Without Evidence (NEVER)

❌ **Event marked created but calendar write failed:**
```
Event processed → Calendar write fails → Database shows "created" → Parent thinks it's handled
```

✅ **Correct:**
```
Event processed → Calendar write fails → Database shows "deferred" → Parent notified of error
```

---

### Quiet Failure (NEVER)

❌ **System breaks but continues:**
```
Database connection lost → Continue processing in-memory → Restart → All data lost
```

✅ **Correct:**
```
Database connection lost → Halt processing → Log error → Retry → Notify admin if persists
```

---

## Error Logging Requirements

Every error must log:
- **Timestamp** (ISO 8601)
- **Error type** (parsing, conflict, ambiguity, system)
- **Context** (message ID, email details, stack trace)
- **Resolution attempted** (retry, escalate, defer)
- **Parent notification** (sent/pending/failed)

**Example Log Entry:**
```json
{
  "timestamp": "2026-01-08T14:30:00Z",
  "error_type": "parsing_failure",
  "message_id": "abc123@school.edu",
  "from": "teacher@school.edu",
  "subject": "Math test schedule",
  "attachment": "test-schedule.pdf",
  "error": "PDFReadError: Unexpected EOF",
  "stack_trace": "...",
  "resolution": "escalate_to_parent",
  "parent_notified": true,
  "notification_sent": "2026-01-09T06:00:00Z",
  "notification_digest": "daily"
}
```

---

## Recovery Procedures

### After Parsing Failure
1. Parent reviews original email manually
2. Parent can manually create event
3. Or parent can forward corrected information
4. System logs resolution for learning

### After Conflict
1. Parent verifies correct information
2. Parent updates calendar manually
3. System logs which source was correct
4. Future emails from that source get higher confidence

### After System Failure
1. System resumes processing automatically
2. Parent receives confirmation
3. No emails lost (reprocessed from last checkpoint)
4. Admin reviews logs for root cause

---

## Summary

**When system encounters error:**
1. **Never guess** → Always escalate
2. **Never fail silently** → Always log and notify
3. **Never pretend success** → Mark state accurately
4. **Always provide context** → Help parent decide

**Parent trust maintained through:**
- Honest error reporting
- Clear escalation paths
- No false confidence
- Verifiable audit trail
