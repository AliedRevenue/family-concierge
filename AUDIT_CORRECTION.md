# Configuration Audit & Correction

**Version:** 1.0  
**Purpose:** Verify system understanding and enable explicit correction

---

## Core Question

**"Show me what you believe matters to my family."**

The audit command answers this question by surfacing:
- What the system is watching
- What it has caught
- What it has missed
- What needs correction

---

## Audit Command

### Basic Usage

```bash
npx tsx src/index.ts audit <person>
```

**Examples:**
```bash
npx tsx src/index.ts audit emma
npx tsx src/index.ts audit james
npx tsx src/index.ts audit all
```

---

## Audit Output Structure

### Example Output

```
================================================================================
FAMILY CONCIERGE AUDIT — Emma
Generated: January 1, 2026 2:30pm
================================================================================

📧 EMAIL DOMAINS WATCHED
  ✓ School:
    • veracross.com → Calendar + Digest
    • school.edu → Calendar + Digest
    
  ✗ Sports:
    • coachesbox.com NOT CONFIGURED
    • sportsengine.com NOT CONFIGURED
    [3 emails from coachesbox.com found in last 7 days]
    
  ✓ Medical:
    [No medical sources configured]

🔑 KEYWORDS RECOGNIZED
  ✓ School: "test", "quiz", "exam", "project", "homework", "permission slip"
  ✓ Sports: [not configured]
  ✓ Medical: [not configured]

📅 CALENDAR INTEGRATION
  ✓ Connected: Family Calendar > Emma
  ✓ Write access: Confirmed
  • Events created this month: 7
  • Events updated: 2
  • Events deferred: 1

⏳ DEFERRED ITEMS (need attention)
  1. ? Emma's Soccer Game - This Friday
     Missing: Time, location
     Waiting since: Dec 28, 3pm (4 days ago)
     Escalates in: 3 days
     Source: coach@coachesbox.com
     
     → ISSUE: coachesbox.com is not in your configuration
     → Suggest: npx tsx src/index.ts audit emma --add-domain coachesbox.com sports

📨 RECENT DECISIONS (last 7 days)
  ✓ Created: Math test - Jan 7, 2pm (from teacher@school.edu)
  ✓ Created: Science project due - Jan 10 (from veracross.com)
  — Skipped: School newsletter (no events)
  ? Deferred: Soccer game Friday (missing time/location)

❌ POTENTIAL MISSES (manual forwards)
  • 3 emails forwarded from coachesbox.com in last 7 days
  • Reason: Domain not in configuration
  
  → This suggests you care about soccer emails but system isn't watching
  → Fix: npx tsx src/index.ts audit emma --add-domain coachesbox.com sports

✅ FALSE POSITIVES (flagged but not valued)
  [None detected]
  
  If system is catching things you don't care about:
  → Use: npx tsx src/index.ts audit emma --exclude-keyword "birthday"

================================================================================
NEXT ACTIONS
================================================================================

To add missing domain:
  npx tsx src/index.ts audit emma --add-domain coachesbox.com sports

To review deferred item:
  npx tsx src/index.ts dismiss <item-id> "reason"

To reprocess last 7 days with new config:
  npx tsx src/index.ts audit emma --reprocess-last-7d

To see full configuration:
  cat config/agent-config.yaml
```

---

## Bidirectional Correction Commands

### 1. Add Domain

**Command:**
```bash
npx tsx src/index.ts audit <person> --add-domain <domain> <category>
```

**Example:**
```bash
npx tsx src/index.ts audit emma --add-domain coachesbox.com sports
```

**System Response:**
```
✓ Added coachesbox.com to Emma's sports sources
  
Configuration updated:
  packs.sports.sources:
    - coachesbox.com (Emma)
    
⚠ IMPORTANT: This change applies FORWARD ONLY
  
Found 3 recent emails from coachesbox.com (last 7 days) that would now match:
  • Dec 28: "Practice schedule update"
  • Dec 30: "Game this Friday"
  • Jan 1: "Team roster"
  
Would you like to reprocess these?
  npx tsx src/index.ts audit emma --reprocess-last-7d
```

**What Happens:**
1. Config file updated (`config/agent-config.yaml`)
2. Change logged with timestamp and reason
3. System surfaces recent emails that would now match
4. Parent chooses whether to retroactively process

**Forbidden:**
- Silent retroactive reprocessing
- Auto-applying to all family members
- Changing past decisions' confidence scores

---

### 2. Add Keyword

**Command:**
```bash
npx tsx src/index.ts audit <person> --add-keyword <keyword> <category>
```

**Example:**
```bash
npx tsx src/index.ts audit emma --add-keyword "recital" school
```

**System Response:**
```
✓ Added "recital" to Emma's school keywords
  
Now watching for: "recital" in emails from:
  • veracross.com
  • school.edu
  
This change applies FORWARD ONLY.
```

---

### 3. Exclude Keyword (False Positive Fix)

**Command:**
```bash
npx tsx src/index.ts audit <person> --exclude-keyword <keyword>
```

**Example:**
```bash
npx tsx src/index.ts audit emma --exclude-keyword "birthday party"
```

**System Response:**
```
✓ Added "birthday party" to Emma's exclusion list
  
Emails containing "birthday party" will now be skipped.
This does not affect past decisions.
```

---

### 4. Remove Domain

**Command:**
```bash
npx tsx src/index.ts audit <person> --remove-domain <domain>
```

**Example:**
```bash
npx tsx src/index.ts audit emma --remove-domain oldschool.edu
```

**System Response:**
```
✓ Removed oldschool.edu from Emma's sources
  
This change applies FORWARD ONLY.
Existing events from oldschool.edu remain in calendar.
```

---

## Correction Propagation Rules

### Forward-Only Application

**Rule:** All configuration changes apply FORWARD ONLY by default.

**Rationale:**
- No silent retroactive changes
- Parent maintains control over past decisions
- Audit trail remains intact

**Example:**
```
Parent adds coachesbox.com on Jan 1
  → Future emails from coachesbox.com: Processed
  → Past emails from coachesbox.com: Unchanged (unless parent requests reprocessing)
```

---

### Explicit Reprocessing

**Command:**
```bash
npx tsx src/index.ts audit <person> --reprocess-last-7d
```

**What Happens:**
1. System scans last 7 days of emails
2. Applies current configuration
3. Surfaces items that would now be caught
4. Asks parent to confirm each action

**Example Flow:**
```
Reprocessing last 7 days with updated configuration...

Found 3 new matches:

1. Dec 28: "Practice schedule update" (coachesbox.com)
   → Would create: Emma's soccer practice - Every Tuesday 4pm
   [C]reate now | [D]efer | [S]kip

2. Dec 30: "Game this Friday" (coachesbox.com)
   → Would defer: Emma's soccer game (missing time/location)
   [C]reate now | [D]efer | [S]kip

3. Jan 1: "Team roster" (coachesbox.com)
   → Would skip: No calendar information
   [C]reate now | [D]efer | [S]kip
```

**Forbidden:**
- Auto-creating events without parent review
- Changing past event confidence
- Reprocessing without explicit parent command

---

### Retroactive Confidence Rewriting (FORBIDDEN)

**Scenario:**
```
Dec 28: Email from unknown@coachesbox.com
  → System skipped (domain not configured)
  → Confidence: 0.1 (unknown source)
  
Jan 1: Parent adds coachesbox.com to config

❌ FORBIDDEN: Retroactively change Dec 28 decision confidence to 0.9
✓ ALLOWED: Surface Dec 28 email in reprocessing queue with new confidence
```

**Rule:** Past decisions are immutable. Corrections create new entries.

---

## Misses Detection

### How Misses are Inferred

**Manual Forwards Indicate Misses:**

If parent forwards emails manually (from their inbox to themselves or others), system infers:
- "This was important to parent"
- "System didn't catch it"
- "Configuration may need updating"

**Detection Logic:**
```
Database: forwarded_messages table
  - message_id
  - from_email
  - forwarded_at
  - pack_id (if matched later)
  
Audit surfaces:
  "3 emails from coachesbox.com forwarded manually in last 7 days"
  "Reason: Domain not in configuration"
  "Suggest: Add coachesbox.com to Emma's sports sources"
```

---

## False Positives Detection

**How False Positives are Inferred:**

If parent consistently:
- Dismisses items from certain keywords
- Skips certain email types
- Never engages with specific categories

System surfaces in audit:
```
✅ FALSE POSITIVES DETECTED

Pattern: 5 emails with "birthday party" flagged but all dismissed
Suggest: Exclude keyword "birthday party"

Command:
  npx tsx src/index.ts audit emma --exclude-keyword "birthday party"
```

**Forbidden:**
- Auto-excluding without parent confirmation
- Inferring what parent cares about
- Changing configuration silently

---

## Audit Logging

Every audit action is logged:

```json
{
  "timestamp": "2026-01-01T14:30:00Z",
  "action": "audit_run",
  "person": "emma",
  "findings": {
    "domains_watched": 2,
    "domains_missing": 1,
    "deferred_items": 1,
    "potential_misses": 3,
    "false_positives": 0
  }
}
```

Every correction is logged:

```json
{
  "timestamp": "2026-01-01T14:35:00Z",
  "action": "add_domain",
  "person": "emma",
  "domain": "coachesbox.com",
  "category": "sports",
  "reason": "Parent command",
  "recent_matches": 3,
  "applies": "forward_only"
}
```

---

## Self-Healing is FORBIDDEN

**What Self-Healing Would Look Like (DO NOT IMPLEMENT):**
- "You dismissed 3 soccer emails, I'll stop watching soccer"
- "You always forward baseball, I'll add that domain automatically"
- "You never open newsletters, I'll skip those"

**Why It's Forbidden:**
- Breaks determinism
- Parent loses control
- Silent configuration changes
- Undermines trust

**Correct Approach:**
- Detect patterns
- Surface suggestions
- Require explicit parent action
- Log every correction

---

## Summary

**Audit Answers:**
"Do you understand my family?"

**Correction Enables:**
"Fix what you got wrong."

**Rules:**
- Explicit corrections only
- Forward-only by default
- Retroactive requires parent confirmation
- No self-healing
- All changes logged
