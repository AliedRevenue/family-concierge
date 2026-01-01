# Reconciliation View

**Version:** 1.0  
**Purpose:** Close the trust loop with periodic understanding verification

---

## Core Question

**"Do I understand your family?"**

The Reconciliation View is not a per-email ledger.  
It is a periodic report that verifies system understanding and invites correction.

**Frequency:**
- Daily digest: 6am, covers last 24 hours
- Weekly reconciliation: Sunday 8pm, covers last 7 days

**Goal:** Parent can read in under 2 minutes and know:
- What system is watching
- What it caught
- What needs attention
- What to correct

---

## Weekly Reconciliation Example

```
================================================================================
FAMILY CONCIERGE — WEEKLY RECONCILIATION
Week of December 25, 2025 - January 1, 2026
================================================================================

Hi there,

Here's what I understood about your family this week.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 WHAT I'M WATCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA (School + Sports)
  ✓ Watching: veracross.com, school.edu
  ✗ NOT watching: coachesbox.com, sportsengine.com
  
JAMES (School)
  ✓ Watching: veracross.com, school.edu
  
COLIN (School + Activities)
  ✓ Watching: veracross.com, school.edu, activityhero.com
  
HENRY (School)
  ✓ Watching: veracross.com, preschool.edu


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ WHAT I CAUGHT THIS WEEK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  ✓ Math test - Tuesday Jan 7, 2pm (Room 304)
    Source: teacher@school.edu
    Added to calendar
  
  ✓ Science project due - Friday Jan 10
    Source: veracross.com
    Added to calendar

JAMES
  ✓ Basketball practice - Every Tuesday 4pm (Gym)
    Source: athletics@school.edu
    Added to calendar
  
  ✓ Parent-teacher conference - Thursday Jan 9, 3pm
    Source: teacher@school.edu
    Added to calendar

COLIN
  ✓ Swim class - Every Wednesday 5pm (YMCA)
    Source: info@activityhero.com
    Added to calendar

HENRY
  ⌀ School newsletter - No events
    Source: admin@preschool.edu
    Reviewed, no action needed


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ WHAT NEEDS YOUR ATTENTION (deferred)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  ? Soccer game - This Friday
    Missing: Time, location
    Waiting for: Coach follow-up email
    Deferred since: Dec 28, 3pm (4 days ago)
    Escalates in: 3 days
    
    → If not relevant: npx tsx src/index.ts dismiss <item-id> "not doing soccer"
    → If you have details: Add manually to calendar


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⌀ WHAT WAS DISMISSED THIS WEEK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JAMES
  ⌀ Basketball tournament tryouts
    Reason: "James not trying out this year"
    Dismissed: Dec 30


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ WHAT I MIGHT HAVE MISSED (your manual forwards)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  • 3 emails from coachesbox.com forwarded manually
    Reason: Domain not in my configuration
    
    → This suggests soccer emails matter to you
    → Fix: npx tsx src/index.ts audit emma --add-domain coachesbox.com sports


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ FALSE POSITIVES (flagged but you didn't care)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[None detected this week]

If I'm catching things you don't care about, you can:
  → Exclude keywords: npx tsx src/index.ts audit <person> --exclude-keyword "birthday"
  → Remove domains: npx tsx src/index.ts audit <person> --remove-domain <domain>


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Events created: 6
Events deferred: 1 (needs attention)
Events dismissed: 1
Emails reviewed: 42
Emails skipped: 15 (newsletters, no events)

Configuration issues detected: 1
  → Emma's soccer emails not being caught


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 NEXT ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Review deferred item: Emma's soccer game (expires in 3 days)
2. Fix configuration: Add coachesbox.com for Emma's soccer
   → npx tsx src/index.ts audit emma --add-domain coachesbox.com sports

To verify my understanding of your family:
  npx tsx src/index.ts audit all

Questions? Email support or check DOCTRINE.md for what I do and don't promise.

—
Family Concierge
"If it happened, it's handled. No guessing."
```

---

## Daily Digest Example

```
================================================================================
FAMILY CONCIERGE — DAILY DIGEST
Wednesday, January 1, 2026
================================================================================

Good morning,

Here's what I handled yesterday (Dec 31).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ YESTERDAY'S EVENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  ✓ Updated: Math test moved to Tuesday Jan 7, 3pm (was 2pm)
    Source: teacher@school.edu
    Reason: Teacher sent schedule update

JAMES
  ✓ Created: Basketball game - Saturday Jan 4, 10am (Home gym)
    Source: athletics@school.edu
    Added to calendar


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ PENDING ITEMS (still waiting)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  ? Soccer game - This Friday
    Missing: Time, location
    Waiting since: Dec 28 (5 days ago)
    Escalates in: 2 days


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 EMAILS REVIEWED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Emails scanned: 8
  ✓ Events created/updated: 2
  ⌀ Newsletters (no events): 3
  — Skipped (duplicate): 2
  ? Deferred: 1


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YOUR CALENDAR TODAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  • 9am: School (all day)
  • 3pm: Math test (Room 304)

JAMES
  • 9am: School (all day)
  • 4pm: Basketball practice (Gym)

COLIN
  • 9am: School (all day)
  • 5pm: Swim class (YMCA)

HENRY
  • 9am: Preschool (all day)


—
Family Concierge
Next weekly reconciliation: Sunday, Jan 5, 8pm
```

---

## "Nothing Happened" Digest Example

```
================================================================================
FAMILY CONCIERGE — DAILY DIGEST
Friday, January 3, 2026
================================================================================

Good morning,

Yesterday (Jan 2) was quiet.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ WHAT HAPPENED YESTERDAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⌀ No new events
⌀ No updates to existing events
⌀ No items deferred

I reviewed 6 emails:
  • 4 newsletters (no event information)
  • 2 duplicates (already in your calendar)

Everything scheduled remains on track.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ STILL WATCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  ? Soccer game - Friday Jan 3 (today!)
    Missing: Time, location
    Deferred since: Dec 28 (6 days ago)
    Escalates: Tomorrow
    
    ⚠️ This is today but details still missing.
    → If not happening: npx tsx src/index.ts dismiss <item-id> "not relevant"
    → If you have details: Add manually to calendar


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YOUR CALENDAR TODAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EMMA
  • 9am: School (all day)

JAMES
  • 9am: School (all day)

COLIN
  • 9am: School (all day)

HENRY
  • 9am: Preschool (all day)


—
Family Concierge
Quiet days are good days.
```

**Key Phrase:** "Quiet days are good days."

This reinforces:
- Absence of events is not a failure
- System is working correctly
- Parent can trust the silence

---

## Time Boundaries

### Daily Digest
- **When:** 6am every day
- **Covers:** Previous 24 hours
- **Contents:**
  - Events created/updated
  - Items deferred
  - Emails reviewed summary
  - Today's calendar preview

### Weekly Reconciliation
- **When:** Sunday 8pm
- **Covers:** Last 7 days
- **Contents:**
  - Full understanding verification
  - Configuration issues detected
  - Misses inferred from manual forwards
  - False positives detected
  - Deferred items summary
  - Dismissed items log
  - Suggested corrections

### Deferred Item Visibility
- **When:** Within 2 hours of deferral
- **Where:** Next digest (daily or weekly, whichever comes first)
- **Contents:**
  - What's missing
  - Why deferred
  - When it escalates

### Escalation Notices
- **When:** 7 days after deferral
- **Where:** Next digest
- **Action required:** Parent must acknowledge or dismiss

---

## Read-Only with Correction Paths

Reconciliation View is **read-only** by design.

It does NOT include:
- Tuning sliders
- Confidence adjustments
- Category toggles
- Inline editing

**Corrections are explicit commands:**
```bash
# Add missing domain
npx tsx src/index.ts audit emma --add-domain coachesbox.com sports

# Dismiss irrelevant item
npx tsx src/index.ts dismiss <item-id> "reason"

# Exclude false positive keyword
npx tsx src/index.ts audit emma --exclude-keyword "birthday"
```

**Rationale:**
- No accidental changes
- Every correction logged
- Deterministic behavior
- Parent maintains full control

---

## Trust Loop Closure

The reconciliation answers three questions:

1. **"Do you understand my family?"**
   → Shows what system is watching and why

2. **"Did you catch what matters?"**
   → Shows what was caught, missed, and deferred

3. **"How do I correct you?"**
   → Provides explicit correction commands

**Success criteria:**
Parent reads weekly reconciliation and either:
- "Yes, you got it right" (no action)
- "Here's what you missed" (runs correction command)

No ongoing monitoring required.
No anxiety about "did it work?"

**If the reconciliation view doesn't change your behavior, it's working perfectly.**

---

## Digest Language Rules

See [COMMUNICATION.md](COMMUNICATION.md) for:
- Symbol definitions (✓, ?, ⌀, ⚠)
- Responsibility transfer language
- Provenance statements
- Confidence rules
