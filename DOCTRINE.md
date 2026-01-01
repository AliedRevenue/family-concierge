# Family Concierge Decision Doctrine

**Version:** 1.0  
**Last Updated:** January 1, 2026

## Core Promise

**If it happened, it's handled.**  
No guessing. No silent failures. No false confidence.

This promise must remain true even when information is incomplete, ambiguous, contradictory, or irrelevant.

---

## SCOPE

### What Family Concierge Processes

**Explicitly Configured Inputs Only:**
- Emails from domains listed in pack configuration
- Calendar events from integrated Google Calendar accounts
- Attachments (PDFs, images) from configured email sources

**By Domain (Explicit Configuration Required):**
- School communications (e.g., veracross.com, school.edu)
- Sports team updates (when configured)
- Medical appointments (when configured)
- Administrative forms and permissions

### What Family Concierge Ignores by Default

- Social invitations (unless explicitly configured)
- Marketing emails
- Personal correspondence
- Financial/billing emails (unless explicitly configured)
- Community group emails (unless explicitly configured)

### Platforms Explicitly Excluded

- Text messages (SMS, iMessage, WhatsApp)
- Social media (Facebook, Instagram, etc.)
- Phone calls or voicemails
- Paper mail or physical documents
- Verbal communications
- Mobile apps (team apps, school portals) unless email integration exists

**Rationale:** We only process what we can verify and log. Platforms without audit trails are out of scope.

---

## RESPONSIBILITY

### What the System Takes Responsibility For

1. **Processing configured email domains** within defined rules
2. **Creating calendar events** when complete information exists (date, time, location, person)
3. **Deferring items** when information is incomplete
4. **Logging every decision** with timestamp, reason, and evidence
5. **Escalating uncertainty** when rules cannot determine action
6. **Surfacing deferred items** within 2 hours of deferral
7. **Generating digests** on configured schedules (daily 6am, weekly Sunday 8pm)

### What Always Remains Parent Responsibility

1. **Verifying important information** in original sources
2. **Responding to time-sensitive requests** (we inform, you act)
3. **Managing RSVP deadlines** (we surface, you respond)
4. **Interpreting ambiguous context** we cannot access
5. **Deciding what matters** for your specific family
6. **Correcting configuration** when we miss or over-catch
7. **Dismissing irrelevant items** explicitly

### What the System Will NEVER Do

- Contact schools, coaches, or organizations on your behalf
- Make financial decisions or payments
- Respond to emails as you
- Guess at missing details (date, time, location)
- Infer intent from ambiguous language
- Change calendar events without your approval process
- Auto-tune configuration based on your behavior
- Share family data with third parties

---

## CONFIDENCE & UNCERTAINTY

### Explicit Refusals

**We Refuse to Guess:**
- If an email says "game Friday" without specifying which Friday, we defer
- If time is missing, we defer
- If location is ambiguous ("the field" without context), we defer

**We Refuse to Infer Intent:**
- "Let me know if you're interested" → We surface it, we don't assume
- "Details coming soon" → We defer until details arrive
- "Tentative date" → We mark as uncertain, not confirmed

**We Refuse to Present Incomplete as Complete:**
- Events must have: date, time, location, assigned person
- If any field is missing, the event is deferred, not created with "TBA"
- Deferred items show exactly what is missing

### Uncertainty as a First-Class State

**DEFERRED is not a failure.** It is the correct response when:
- Information is partial
- Meaning is ambiguous
- Confirmation is pending

Deferred items are:
- Visible within 2 hours
- Tracked with SLA (7 days before escalation)
- Logged with reason for deferral

---

## FORBIDDEN BEHAVIORS (VIOLATIONS)

These behaviors are **violations of the core promise** and must never occur:

### 1. Silent Deferral
**Violation:** Deferring an item without surfacing it to parent within 2 hours  
**Impact:** Parent thinks it's handled when it isn't  
**Prevention:** Automated SLA check on deferral visibility

### 2. False Completeness
**Violation:** Creating calendar event with "TBA" or missing details and marking as ✓ Confirmed  
**Impact:** Parent assumes it's complete; discovers missing info later  
**Prevention:** Validation rules enforce all required fields before CREATED state

### 3. Undocumented Decisions
**Violation:** Any action taken without logged reasoning  
**Impact:** Breaks auditability; parent cannot verify understanding  
**Prevention:** Every state transition requires logged evidence and reason

### 4. Indefinite Unresolved States
**Violation:** Deferred items remaining unresolved >7 days without escalation  
**Impact:** Parent forgets about it; critical info missed  
**Prevention:** Automated escalation at 7-day mark requires parent action (acknowledge or dismiss)

### 5. Confidence Without Evidence
**Violation:** Using ✓ symbol or "confirmed" language without authoritative source  
**Impact:** Parent trusts false confidence  
**Prevention:** Symbol definitions are deterministic (see COMMUNICATION.md)

### 6. Silent Failures
**Violation:** Parsing error or system failure without parent notification  
**Impact:** Parent assumes system is working; events missed  
**Prevention:** All errors escalate to digest or immediate notification

### 7. Auto-Dismissal
**Violation:** System dismissing deferred items without explicit parent action  
**Impact:** Important items removed from tracking without parent awareness  
**Prevention:** DISMISSED state requires explicit parent command with reason

### 8. Retroactive Confidence Changes
**Violation:** Changing past decision confidence after the fact  
**Impact:** Breaks audit trail; undermines trust  
**Prevention:** All decisions are immutable; corrections create new entries

---

## Enforcement Mechanisms

This doctrine is enforceable through:

1. **Code Reviews:** PRs must cite doctrine sections when adding decision logic
2. **Copy Validation:** All user-facing text must pass doctrine compliance check
3. **Automated Tests:** State transition tests verify forbidden behaviors are blocked
4. **Audit Logs:** Every decision must reference doctrine rules

---

## When to Update This Doctrine

This doctrine may be updated only when:
- New pack domains are added (with explicit scope definition)
- Critical trust violations are discovered and need prevention rules
- Parent feedback reveals systematic misunderstanding

Updates require:
- Version increment
- Changelog entry
- Review by all engineers
- User communication of any behavior changes
