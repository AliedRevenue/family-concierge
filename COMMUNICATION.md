# Communication & Digest Language

**Version:** 1.0  
**Purpose:** Define how system communicates decisions and transfers responsibility

---

## Core Principle

**Every digest item must answer: "Who is responsible for what now?"**

All language must:
- Transfer responsibility clearly
- Show provenance explicitly
- Indicate certainty honestly
- Avoid AI terminology
- Avoid probabilistic hedging

---

## Confidence Symbols (Fixed & Deterministic)

### ✓ Confirmed

**Definition:** Complete information from authoritative source

**Requirements:**
- Date is specific and unambiguous
- Time is present (or explicitly all-day)
- Location is specific
- Person assignment is deterministic
- Source is configured authoritative domain

**Example:**
```
✓ Emma's Math Test - Tuesday Jan 7, 2pm (Room 304)
  Source: teacher@school.edu
  Added to: Family Calendar > Emma
```

**Forbidden:**
- Using ✓ when any field is "TBA"
- Using ✓ when time is missing
- Using ✓ when location is vague ("the school", "practice field")

---

### ? Deferred

**Definition:** Partial information — details missing

**Requirements:**
- Must explicitly state what is missing
- Must indicate what system is waiting for
- Must show escalation timeline

**Example:**
```
? Emma's Soccer Game - This Friday
  Missing: Time, location
  Waiting for: Coach follow-up email with details
  Deferred since: Dec 28, 3pm (4 days ago)
  Escalates in: 3 days
```

**Forbidden:**
- Using ? without stating missing information
- Generic "details coming" without specifics
- Deferral without escalation timeline

---

### ⌀ Reviewed

**Definition:** Scanned, no action required

**When to use:**
- Newsletter emails with no event information
- Administrative updates with no calendar items
- Confirmation emails for already-processed events

**Example:**
```
⌀ School Newsletter - January 2026
  Source: admin@school.edu
  Reviewed: No event information found
```

---

### ⚠ Needs Decision

**Definition:** Ambiguous meaning requiring parent clarification

**When to use:**
- Conflicting information (two emails with different dates)
- Unclear context ("Friday" could mean this week or next)
- Uncertain person assignment (email mentions multiple children)

**Example:**
```
⚠ Basketball Game - "This Friday"
  Ambiguity: Email dated Dec 28 says "Friday"
  Could be: Jan 3 or Jan 10
  Action: Please clarify which Friday
  Source: coach@athletics.com
```

**Parent Action Required:**
- Dismiss if not relevant
- Create manually with correct details
- Wait for clarifying email

---

## Forbidden Language

### No AI Terminology
❌ "I think..."  
❌ "It appears..."  
❌ "Likely..."  
❌ "Probably..."  
❌ "AI detected..."  
❌ "Machine learning found..."  

### No Probabilistic Hedging
❌ "80% confident..."  
❌ "High confidence..."  
❌ "Possibly..."  
❌ "Might be..."  
❌ "Seems to be..."  

### No Numeric Confidence Scores
❌ "Confidence: 0.87"  
❌ "92% match"  
❌ "Score: 8/10"  

---

## Provenance Statements

Every item must show **where information came from**.

### Template
```
<Event> - <Date> <Time> (<Location>)
Source: <email address or platform>
Action: <what system did>
Reason: <why this action>
```

### Examples

**Created Event:**
```
✓ Emma's Math Test - Tuesday Jan 7, 2pm (Room 304)
  Source: teacher@school.edu
  Added to: Family Calendar > Emma
  Reason: Email contained complete event details
```

**Updated Event:**
```
✓ Updated: Emma's Math Test - Now 3pm (was 2pm)
  Source: teacher@school.edu
  Changed: Time updated from teacher email
  Original: Created Dec 30 from same source
```

**Deferred Item:**
```
? Emma's Soccer Game - This Friday
  Source: coach@coachesbox.com
  Missing: Time, location
  Reason: Email said "game Friday" with no time/place
  Waiting for: Coach follow-up with details
```

**Dismissed Item:**
```
⌀ Dismissed: Emma's Soccer Tryouts
  Source: coach@coachesbox.com
  Reason: Parent dismissed - "Not trying out this year"
  Dismissed: Jan 1, 2pm by parent command
```

---

## Responsibility Transfer Language

### Format

**WHO DID WHAT + WHO IS RESPONSIBLE NOW**

### System-Executed Actions

✓ System created event → **You can trust it's on your calendar**

```
✓ Emma's Math Test - Tuesday Jan 7, 2pm (Room 304)
  Added to Family Calendar > Emma
  
→ YOU are responsible for: Showing up
→ SYSTEM is responsible for: Reminder the day before
```

✓ System updated event → **Change is reflected in your calendar**

```
✓ Updated: Emma's Math Test - Now 3pm (was 2pm)
  Changed in Family Calendar > Emma
  
→ YOU are responsible for: Noting the new time
→ SYSTEM is responsible for: Tracking future updates
```

### Parent-Review Actions

? System deferred → **You need to decide when details arrive**

```
? Emma's Soccer Game - This Friday
  Missing: Time, location
  
→ YOU are responsible for: 
  - Checking your email for coach follow-up
  - Adding manually if you get details
  - Dismissing if not relevant
  
→ SYSTEM is responsible for:
  - Watching for follow-up email
  - Surfacing details when they arrive
  - Escalating in 7 days if unresolved
```

⚠ System needs clarification → **You must decide**

```
⚠ Basketball Game - "This Friday"
  Unclear: Jan 3 or Jan 10?
  
→ YOU are responsible for:
  - Determining correct date
  - Creating event manually if needed
  - Or waiting for clarifying email
  
→ SYSTEM is responsible for:
  - Not guessing which Friday
  - Escalating ambiguity to you
```

### Parent-Executed Actions

⌀ Parent dismissed → **System stopped watching**

```
⌀ Dismissed: Emma's Soccer Tryouts
  Reason: "Not trying out this year"
  
→ YOU decided: Not relevant
→ SYSTEM stopped: Watching for soccer tryout updates
→ NOTE: Other soccer emails will still be caught
```

---

## Weekly Digest Examples

### Example 1: Active Week

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THIS WEEK (December 25, 2025 - January 1, 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ HANDLED (you can stop thinking about these)

EMMA
  ✓ Math test - Tuesday Jan 7, 2pm (Room 304)
    Source: teacher@school.edu
    YOU: Show up prepared
    ME: Reminder on Monday night
  
  ✓ Science project due - Friday Jan 10
    Source: veracross.com
    YOU: Submit project
    ME: Reminder on Thursday

JAMES
  ✓ Basketball practice - Every Tuesday 4pm (Gym)
    Source: athletics@school.edu
    YOU: Pick up after practice
    ME: Weekly reminders

⏳ NEEDS YOUR ATTENTION (action required)

EMMA
  ? Soccer game - This Friday (Jan 3)
    Missing: Time, location
    YOU: Check email or dismiss if not happening
    ME: Watching for coach follow-up
    Escalates: Tomorrow (7-day mark)

📊 SUMMARY
  Events created: 3
  Events deferred: 1
  Emails reviewed: 28
  
→ One item needs attention (Emma's soccer game)
```

---

### Example 2: Quiet Week

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THIS WEEK (January 8-14, 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⌀ QUIET WEEK

I reviewed 18 emails this week:
  • 12 newsletters (no events)
  • 4 already on your calendar
  • 2 duplicates

No new events created.
No items deferred.
Everything scheduled remains on track.

✅ UPCOMING (already on your calendar)

EMMA
  • Tuesday 2pm: Math test (Room 304)
  • Friday: Science project due

JAMES
  • Tuesday 4pm: Basketball practice (Gym)

📊 SUMMARY
  Emails reviewed: 18
  Events created: 0
  Events deferred: 0
  
→ Nothing needs your attention.

Quiet weeks are good weeks.
```

---

### Example 3: Configuration Issue Detected

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THIS WEEK (January 15-21, 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ HANDLED

JAMES
  ✓ Basketball game - Saturday Jan 25, 10am (Home gym)
    Source: athletics@school.edu
    Added to calendar

COLIN
  ✓ Swim class - Every Wednesday 5pm (YMCA)
    Source: activityhero.com
    Added to calendar

❌ POTENTIAL MISSES DETECTED

EMMA
  I noticed you forwarded 4 emails from coachesbox.com this week.
  
  These emails contained:
    • "Practice schedule update" (Jan 15)
    • "Game this Friday" (Jan 17)
    • "Uniform requirements" (Jan 19)
    • "Team photos Saturday" (Jan 20)
  
  → This suggests soccer emails matter to you
  → But I'm not configured to watch coachesbox.com
  
  TO FIX:
    npx tsx src/index.ts audit emma --add-domain coachesbox.com sports
  
  After fixing, I can reprocess these emails:
    npx tsx src/index.ts audit emma --reprocess-last-7d

📊 SUMMARY
  Events created: 2
  Potential misses: 4 (Emma's soccer)
  Configuration issues: 1
  
→ Fix Emma's soccer configuration to avoid future misses
```

---

## Daily Digest Examples

### Example 1: Active Day

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOD MORNING - Wednesday, January 8, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ YESTERDAY (January 7)

EMMA
  ✓ Created: Math test - Friday Jan 10, 2pm (Room 304)
    Source: teacher@school.edu
    Added to your calendar

JAMES
  ✓ Updated: Basketball game - Now 11am (was 10am)
    Source: athletics@school.edu
    Updated in your calendar

📧 EMAILS REVIEWED: 6
  ✓ Events created: 1
  ✓ Events updated: 1
  ⌀ Newsletters: 3
  — Duplicates: 1

📅 TODAY'S CALENDAR

EMMA
  • 9am-3pm: School
  • 3pm: Math test (Room 304)

JAMES
  • 9am-3pm: School
  • 4pm: Basketball practice (Gym)

COLIN
  • 9am-3pm: School
  • 5pm: Swim class (YMCA)

→ Nothing needs your attention today.
```

---

### Example 2: Quiet Day

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOD MORNING - Thursday, January 9, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⌀ YESTERDAY (January 8) - Quiet Day

I reviewed 4 emails:
  • 3 newsletters (no events)
  • 1 already on your calendar

No new events.
No updates.
Everything on track.

📅 TODAY'S CALENDAR

EMMA
  • 9am-3pm: School

JAMES
  • 9am-3pm: School
  • 3pm: Parent-teacher conference (Room 201)

COLIN
  • 9am-3pm: School

→ Quiet days are good days.
```

---

### Example 3: Escalation Day

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOD MORNING - Saturday, January 4, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ URGENT - Action Required

EMMA
  ? Soccer game - TODAY (Friday Jan 3)
    Missing: Time, location
    Deferred since: Dec 28 (7 days)
    
    → This was deferred a week ago and is now today
    → No follow-up details received
    
    YOUR OPTIONS:
    1. Dismiss if not happening:
       npx tsx src/index.ts dismiss <item-id> "game cancelled"
    
    2. Add manually if you have details:
       Check your email or team app
    
    3. Ignore this notice:
       Item will remain deferred (not recommended)

✅ YESTERDAY (January 3)

JAMES
  ✓ Created: Basketball tournament - Next Saturday 9am
    Source: athletics@school.edu
    Added to calendar

📅 TODAY'S CALENDAR

EMMA
  • No scheduled events (but see soccer game above)

JAMES
  • 10am: Basketball game (Home gym)

→ One urgent item needs your decision (Emma's soccer game)
```

---

## "Nothing Happened" is a Positive Outcome

**Goal:** Reduce anxiety when nothing actionable occurs.

### Language Patterns

**Instead of:**
❌ "No events found"  
❌ "Nothing to report"  
❌ "Empty week"

**Use:**
✅ "Quiet week"  
✅ "Everything on track"  
✅ "No changes needed"  
✅ "Quiet days are good days"

### Framing

Silence = System working correctly

**Examples:**
```
⌀ QUIET WEEK
  I reviewed 18 emails.
  Everything already on your calendar.
  No changes needed.
  
→ This is exactly what you want.
```

```
⌀ NO NEW EVENTS
  I scanned 6 emails yesterday.
  All newsletters or duplicates.
  
→ Quiet days are good days.
```

---

## Error Communication

### Parsing Failures

```
⚠️ ERROR - Could Not Process Email

Email: "Team schedule update" from coach@athletics.com
Date: Jan 8, 2pm
Error: Attachment corrupted (PDF could not be read)

ACTION REQUIRED:
  → Please review original email manually
  → Or contact coach for re-send

This email has been logged but not processed.
```

### Conflicting Information

```
⚠️ CONFLICT DETECTED

Email 1 (Jan 1): Basketball game Saturday 10am
Email 2 (Jan 3): Basketball game Saturday 11am

Both from athletics@school.edu

ACTION REQUIRED:
  → Check which time is correct
  → I've created event with first time (10am)
  → Update manually if second time (11am) is correct
```

---

## Summary

**Every digest item must:**
1. Use deterministic symbols (✓, ?, ⌀, ⚠)
2. Show provenance (where information came from)
3. Transfer responsibility (who does what now)
4. Avoid AI/probabilistic language
5. Make absence of events positive ("quiet days are good days")

**Parents should finish reading and know:**
- What system handled (✓)
- What needs their attention (?, ⚠)
- What they can ignore (⌀)
- Who is responsible for what next
