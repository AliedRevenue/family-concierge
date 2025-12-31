# Save For Later - Future Improvements

**Purpose:** Track valuable ideas that are premature for v1 but worth revisiting once we have real usage data.

**Review Cadence:** Re-evaluate after:
- 5+ households using the system
- 3+ months of real-world data
- Clear pain points or patterns emerge

---

## 🟢 High Priority (Revisit in v1.1)

### 1. Pack Analytics & Health Metrics
**What:** Track success metrics per pack to improve configuration and pricing

**Metrics to Track:**
- Events created per pack per week
- Approval acceptance rate (% of pending events approved)
- False positive rate (% of events user manually deletes)
- Time-to-trust (days until user switches to Autopilot mode)
- Top sources (which sender domains create most events)
- Extraction method breakdown (ICS vs text percentages)

**Why Deferred:**
- Need 5+ households to see meaningful patterns
- Single household (yours) won't reveal optimization opportunities
- Telemetry needs privacy considerations (even if local-only)

**Implementation Notes:**
```typescript
// Add to database schema:
CREATE TABLE pack_metrics (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  events_created INTEGER,
  events_approved INTEGER,
  events_rejected INTEGER,
  events_manually_edited INTEGER,
  emails_scanned INTEGER,
  confidence_distribution JSON, -- { high: 23, medium: 5, low: 2 }
  top_sources JSON, -- [ { domain, count }, ... ]
  created_at TEXT NOT NULL
);
```

**Success Criteria for Adding:**
- Have data from 5+ distinct households
- Can identify specific pack improvements from metrics
- Privacy model defined for optional telemetry

---

### 2. Preview Mode in Config UI
**What:** Show "Would create X events this week" after discovery

**UX Flow:**
```
Discovery Complete
    ↓
User sees proposed config (as now)
    ↓
New: [Preview Impact] button
    ↓
System runs discovery query on last 7 days
    ↓
Shows: "Would have created 5 events:"
  • Soccer practice (Wed, 4:30 PM) - 95%
  • Early release (Fri, 2:30 PM) - 88%
  • Field trip (Mon, 9:00 AM) - 72% (pending approval)
  ...
    ↓
User adjusts confidence thresholds or sources
    ↓
Re-runs preview
    ↓
Satisfied → Saves config
```

**Why Deferred:**
- Config UI not built yet (Phase 3)
- Discovery already shows evidence (email counts)
- Nice-to-have for trust, not blocking

**Implementation Effort:** ~2 hours (reuse discovery logic)

**Success Criteria for Adding:**
- Config UI exists
- Users report confusion about what will happen after setup
- Support tickets about "too many events" or "not enough events"

---

## 🟡 Medium Priority (Revisit in v1.2+)

### 3. Per-Source Trust Scores
**What:** Track which sender domains produce reliable events vs false positives

**Model:**
```typescript
SourceTrustScore {
  domain: string
  packId: string
  eventsCreated: number
  eventsApproved: number
  eventsRejected: number
  manualEdits: number
  trustScore: number // 0.0-1.0, calculated
  confidenceMultiplier: number // adjust extraction confidence
}

// Example:
// example.edu: 23 events, 23 approved, 0 rejected → trust 1.0 → confidence +5%
// spam-newsletter.com: 5 events, 1 approved, 4 rejected → trust 0.2 → confidence -20%
```

**Why Deferred:**
- Need months of data to establish trust patterns
- Overlaps with existing confidence scoring + pack priority
- Risk: Over-fitting to one household's preferences

**Success Criteria for Adding:**
- Have 3+ months of event history
- Can identify specific sources with consistent false positives
- User manually adjusts confidence thresholds frequently

---

### 4. Config Suggestions Based on Pack Performance
**What:** Recommend config adjustments based on observed behavior

**Example Notifications:**
```
"We noticed you always reject events from 'pta-newsletter@example.edu'.
Would you like to add this to your exclusion list?"

"Events from 'soccer-coach@league.com' are 100% approved.
Would you like to increase auto-create confidence for this source?"

"You've manually edited 3 events to change their duration.
Would you like to adjust the default duration in your config?"
```

**Why Deferred:**
- Requires analytics infrastructure
- Need user behavior patterns (months of data)
- UX for recommendations needs design

**Success Criteria for Adding:**
- Pack analytics exist
- Identify 3+ common config adjustment patterns
- Have mechanism to deliver recommendations (digest, dashboard banner)

---

## 🔴 Low Priority (Revisit in v2.0+ or Never)

### 5. User Lifecycle State Machine
**What:** Automatic progression NEW → LEARNING → TRUSTED → AUTOPILOT

**ChatGPT's Proposal:**
- NEW: First 7 days, all approvals required
- LEARNING: Days 8-30, confidence thresholds gradually increase
- TRUSTED: After 30 days, high approval rate, some auto-create
- AUTOPILOT: After 60 days, >95% approval rate, full auto-create

**Why Likely Not Worth It:**
- We already have Copilot/Autopilot/Dry-run modes
- User can manually switch modes when comfortable
- Adds complexity (two layers of state)
- Assumes linear trust progression (may not be true)

**Counter-Argument:**
- Commercial products need to "get out of the way" over time
- Users forget to switch from Copilot to Autopilot

**Decision Criteria:**
- If 80%+ of users never switch to Autopilot: consider auto-progression
- If user complaints about "too many approvals" after weeks: consider
- Otherwise: keep manual mode switching

---

### 6. Distributed Lock with Heartbeat
**What:** Prevent multiple instances from writing to same calendar

**ChatGPT's Proposal:**
```typescript
// Add to database:
CREATE TABLE instance_locks (
  calendar_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

// On agent run:
if (canAcquireLock(calendarId, instanceId)) {
  // Run agent normally
  maintainHeartbeat();
} else {
  // Go into read-only mode (Dry Run)
  logWarning("Another instance owns this calendar");
}
```

**Why Almost Certainly Not Worth It:**
- You're running ONE instance per household
- Fingerprinting + messageId already prevents duplicates
- Docker/single-process deployment model (not distributed)
- Solving a problem that doesn't exist

**When to Reconsider:**
- If you build a SaaS version with horizontal scaling
- If users report running multiple instances accidentally
- If you add multi-device support (mobile app + server)

**Current Alternative:** Documentation says "Run one instance only"

---

### 7. Machine Learning Confidence Scoring
**What:** Replace rule-based confidence with ML model

**Current (Rule-Based):**
```typescript
confidence = 0;
if (hasIcsAttachment) confidence += 0.4;
if (hasExplicitTime) confidence += 0.3;
if (dateInFuture) confidence += 0.2;
if (knownSender) confidence += 0.1;
```

**ML Approach:**
```typescript
// Train on historical approved/rejected events
model = trainModel(historicalEvents);
confidence = model.predict(eventFeatures);
```

**Why Deferred:**
- Rule-based scoring works well for ICS events
- ML needs 1000+ labeled examples (don't have yet)
- Adds complexity (model training, versioning, deployment)
- Interpretability loss (can't explain confidence)

**Success Criteria:**
- Have 1000+ events with approval/rejection labels
- Rule-based scoring accuracy drops below 80%
- Can maintain model interpretability (SHAP values, etc.)

---

## 📊 Decision Framework

**When evaluating items from this list:**

### Add to Roadmap If:
- ✅ We have the data to make an informed decision
- ✅ Multiple users report the same pain point
- ✅ Measurable improvement to key metrics (approval rate, time saved, etc.)
- ✅ Implementation cost < 1 week
- ✅ Doesn't compromise core simplicity

### Keep Deferred If:
- ❌ Based on speculation, not evidence
- ❌ Solves a problem we haven't seen yet
- ❌ Adds complexity disproportionate to value
- ❌ Can be solved with configuration instead of code
- ❌ Only benefits edge cases

---

## 🎯 Current Focus (Don't Get Distracted)

**v1.0 Goal:** Ship working product for YOUR household  
**Success = You use it daily for 30 days without frustration**

Resist temptation to add:
- Analytics dashboards (you can query SQLite directly)
- ML models (rule-based works for ICS)
- Multi-tenant features (you're one household)
- Advanced trust models (confidence + pack priority sufficient)

**Stay Focused On:**
- ✅ Event extraction accuracy (ICS first, text later)
- ✅ Zero duplicates (fingerprinting)
- ✅ Email-first UX (digest quality)
- ✅ Safe calendar writes (sendUpdates=none, approval workflow)
- ✅ Explainability (provenance UI)

---

## 📅 Review Schedule

**v1.0 Launch:** Ship with provenance + backfill + sendUpdates (current plan)

**v1.1 Review (3 months later):**
- How many approvals per week? (consider Autopilot default)
- Any false positives? (consider per-source trust)
- Config adjustments needed? (consider suggestions)
- Preview helpful? (add to Config UI)

**v1.2 Review (6 months later):**
- Ready for second household? (consider analytics)
- Pack marketplace? (need health metrics)
- Text extraction accuracy? (may need ML)

**v2.0 Review (12 months later):**
- Multi-household? (need all analytics)
- Mobile app? (need different architecture)
- Commercial launch? (need all trust/safety features)

---

**Remember:** The best feature is the one you don't have to build. Solve problems with configuration and documentation first, code second.
