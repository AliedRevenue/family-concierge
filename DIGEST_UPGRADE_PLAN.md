# Digest Upgrade Plan: Parent-Facing Summary & Presentation

## Goal
Transform digest from internal debug output to parent-friendly weekly overview that answers: "What's going on?" and "What matters?"

---

## 1. "This Week at a Glance" Algorithm

### Input
Approved items from database with fields:
- `subject`: Email subject
- `snippet`: Email preview text (0-500 chars)
- `primary_category`: Categorization (school, sports, medical, etc.)
- `from_name`, `from_email`: Sender

### Algorithm: Summary Generation

```
SUMMARIZE_ITEMS(items: ApprovedItem[]): string[] {
  1. Group items by primary_category
  2. For each category:
     a. Count items: K = count(items)
     b. Extract key facts from subjects + snippets
     c. Generate ONE human sentence per category
  3. Sort categories by relevance (priority order, not alphabetically)
  4. Cap output to 4–7 bullets
  5. Return plain-language facts, no sender names
}
```

### Category Priority Order (Relevance)
1. **Medical** – Highest urgency
2. **School** – Core activities
3. **Events & Performances** – Singular important events
4. **Sports/Activities** – Regular engagement
5. **Newsletters** – Awareness updates
6. **Administrative/Forms** – Housekeeping
7. **Other** – Edge cases

### Fact Extraction Heuristics

**Input:** Subject + first 300 chars of snippet

**Rules:**
- Extract concrete nouns + verbs
- No speculation, no inference
- Use patterns from database (categories already assigned)
- Avoid: sender names, email metadata, timestamps
- Prefer: events, activities, deadlines, media availability

**Examples:**

| Subject | Snippet | Extracted Fact |
|---------|---------|----------------|
| "Class group photos available" | "Dear Parents, We have uploaded the class photos from..." | "Class photos are available to view" |
| "Winter Concert – Dec 20" | "Please join us for our annual winter concert..." | "Winter concert scheduled" |
| "Kindergarten Newsletter Jan 5-9" | "This week we learned about..." | "Kindergarten newsletter for Jan 5–9" |
| "Medical form due Jan 15" | "Please complete the attached medical history form by..." | "Medical form due Jan 15" |
| "Permission slip for field trip" | "We will be taking a trip to..." | "Field trip permission slip required" |

### Deduplication

If multiple items match the same fact, merge them:
- Newsletter + reminder about same date → 1 bullet
- Multiple emails about winter concert → 1 bullet
- Duplicate subjects → 1 bullet (use latest)

**Strategy:** Normalize subjects to canonical forms
```
"Winter Concert – Dec 20"
"Winter Concert 12/20"
"Winter Concert - 20 Dec"
→ All map to: "Winter concert scheduled"
```

### Edge Cases

- **Zero items:** Don't show summary block
- **Many items (20+):** "This week at a glance: 5 key updates" + count by category
- **All newsletters:** "5 newsletters shared"
- **Mixed categories:** Show highest 4–7 priorities

---

## 2. Enhanced Individual Item Display

### Layout per Item

```
📧 CLASS GROUP PHOTOS
Summary: Class I group photos available to view and download.

From: Veracross (Andi Pieper)  |  School  |  99% confident

[Open email] · [View excerpt]
```

### Fields

| Field | Source | Rules |
|-------|--------|-------|
| **Title** | `subject` | Plain, no truncation yet |
| **Summary** | Derived from snippet | 1 sentence, 50–150 chars |
| **From** | `from_name` (fallback: `from_email`) | "Name (email domain)" |
| **Category** | `primary_category` | Human-readable label |
| **Confidence** | `relevance_score * 100` | % or omit if 95%+ |
| **Excerpt** | First 300–500 chars of snippet | Safe HTML escaping |
| **Link** | Gmail deep link using messageId | Click to open in Gmail |

### Gmail Deep Link Construction

**Safe approach (RFC 2392):**
```
https://mail.google.com/mail/u/0/#search/rfc822msgid:%3C{messageId}%3E
```

**Where:**
- `messageId`: Exact value from Gmail API (e.g., `<CAYxKp24sxqWzPg@gmail.com>`)
- Wrap in `%3C` and `%3E` (URL-encoded angle brackets)
- Fallback if messageId missing: Show excerpt instead

**Example:**
```
Original messageId: <CAYxKp24sxqWzPg@gmail.com>
URL: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CCAYxKp24sxqWzPg@gmail.com%3E
```

### Excerpt Presentation

```html
<div class="item-excerpt">
  <details>
    <summary>View excerpt</summary>
    <p>Hi Parents, We have uploaded the class group photos...</p>
  </details>
</div>
```

**Rules:**
- Truncate to 300–500 chars (safe boundary)
- Escape HTML entities (`&`, `<`, `>`, `"`)
- Replace multiple spaces/newlines with single space
- No metadata, timestamps, or footers

---

## 3. Grouping Strategy

### Replace Flat List with Categorized List

**Old Output:**
```
📋 Discovered & Approved (7)
  – Class group photos...
  – Winter concert details...
  – Kindergarten newsletter...
  – Medical pickup reminder...
```

**New Output:**
```
SCHOOL UPDATES (4)
  – Class group photos available
  – Kindergarten newsletter for Jan 5–9
  – Winter concert details and recordings

MEDICAL (1)
  – Pickup reminder required

ADMINISTRATIVE (2)
  – Permission slip for field trip
  – Updated photo consent form
```

### Group Names (Derived from primary_category)

| Database Category | Group Name | Icon |
|-------------------|-----------|------|
| school | School Updates | 🏫 |
| sports_activities | Sports & Activities | ⚽ |
| medical_health | Medical | 🏥 |
| events_performances | Events & Performances | 🎭 |
| logistics | Logistics | 📦 |
| forms_admin | Administrative / Forms | 📋 |
| community_optional | Community | 🤝 |

### Sort Order

By relevance (not alphabetically):
1. Medical
2. School Updates
3. Events & Performances
4. Sports & Activities
5. Logistics
6. Administrative / Forms
7. Community

**Only show non-empty groups**

---

## 4. Implementation Approach

### Phase 1: Core Utilities (Non-Breaking)

New file: `src/utils/summary-generator.ts`

```typescript
interface SummaryFact {
  category: string;
  fact: string;      // "Class photos available"
  itemCount: number;
  items: ApprovedItem[];
}

function generateSummaryFacts(items: ApprovedItem[]): SummaryFact[] {
  // Group by category
  // Extract key facts per category
  // Deduplicate similar facts
  // Return max 7 facts
}

function extractFact(subject: string, snippet: string): string {
  // Parse subject + snippet
  // Generate 1-sentence plain-English fact
  // Return fact or null if unparseable
}

function groupItemsByCategory(items: ApprovedItem[]): Map<string, ApprovedItem[]> {
  // Return items grouped by primary_category
}

function categoryToGroupName(cat: string): { name: string; icon: string } {
  // Map database category → human group name + icon
}
```

### Phase 2: Update DigestBuilder

File: `src/core/digest-builder.ts`

**New method:** `generateSummaryBlock(items: ApprovedItem[]): string`
- Calls `generateSummaryFacts()`
- Returns HTML/plain text bullet list

**Modified method:** `generateHTML()`
- Add summary block at top (if items exist)
- Group items by category in sections
- Update item rendering with new fields

**Modified method:** `generatePlainText()`
- Same grouping + summary as HTML

### Phase 3: Update Types

File: `src/types/index.ts`

**New fields on DigestItem:**
```typescript
interface DigestItem {
  // Existing
  id?: string;
  source?: string;
  
  // Enhanced
  summaryFact?: string;        // "Class photos available"
  fromName?: string;           // "Andi Pieper"
  fromEmail?: string;          // "noreply@veracross.com"
  category?: string;           // "school"
  categoryGroup?: string;       // "School Updates"
  confidence?: number;         // 0.99
  excerpt?: string;            // First 300 chars
  gmailLink?: string;          // Deep link
  messageId?: string;          // For link construction
}

interface DigestSection {
  // Existing
  type: 'created' | 'pending_approval' | 'forwarded' | 'errors' | 'approved_pending';
  items: DigestItem[];
  
  // New for grouping
  groupKey?: string;           // "school_updates" for sorting
  groupOrder?: number;         // 1-7 for sort priority
}
```

### Phase 4: Test & Iterate

- Generate digests with sample data
- Verify HTML rendering
- Check Gmail links resolve
- Validate plain text fallback
- Ensure no regression on existing digest functionality

---

## 5. Example Digest Output

### HTML

```html
<h2>📋 This Week at a Glance</h2>
<ul>
  <li>Class I group photos are available to view and download</li>
  <li>Winter concert recording will be available Dec 21</li>
  <li>Kindergarten newsletter for Jan 5–9</li>
  <li>Medical form due Jan 15</li>
</ul>

<h2>🏫 School Updates (3)</h2>

<div class="item">
  <div class="item-title">Class group pictures – finally!</div>
  <div class="item-summary">Class I group photos available to view.</div>
  <div class="item-meta">
    From: Veracross (Andi Pieper) | School | 99% confident
  </div>
  <div class="item-actions">
    <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3C...%3E">
      Open email
    </a> · 
    <details>
      <summary>View excerpt</summary>
      <p>Dear Parents, We have uploaded the class group photos...</p>
    </details>
  </div>
</div>

[more items...]

<h2>🏥 Medical (1)</h2>
[items...]
```

### Plain Text

```
📋 THIS WEEK AT A GLANCE
• Class I group photos available to view and download
• Winter concert recording available Dec 21
• Kindergarten newsletter for Jan 5–9
• Medical form due Jan 15

🏫 SCHOOL UPDATES (3)

Class group pictures – finally!
Summary: Class I group photos available to view.
From: Veracross (Andi Pieper) | School

[Open in Gmail]

---

[more items...]
```

---

## 6. Edge Cases & Handling

| Scenario | Behavior |
|----------|----------|
| **Zero approved items** | Omit summary block, show "No items this week" |
| **All items in one category** | Still group by category (consistency) |
| **Multiple items with same subject** | Deduplicate; show count or latest only |
| **No snippet/excerpt available** | Use subject as excerpt, show full text |
| **messageId missing** | Omit Gmail link, show full excerpt instead |
| **Very long subject** | Truncate at 80 chars + "..." |
| **Very long snippet** | Truncate at 300 chars + "..." |
| **Category unknown** | Map to "Other" or "Administrative" |
| **Confidence very low** | Still include (already approved), show % |
| **HTML rendering in snippet** | Escape all HTML, render as plaintext |

---

## 7. Trust & Transparency

### What We Show
✅ Only approved items (user or configuration decided)
✅ Actual email metadata (sender, subject, category confidence)
✅ Direct link back to Gmail (no email forwarding, no content replication)
✅ Category explanations (why this is "School")

### What We Don't Show
❌ Inference or speculation ("likely important because...")
❌ Aggregated sender info we didn't extract
❌ Private email content beyond excerpt
❌ Approval reasons (only binary approved/not)

---

## 8. Success Metrics

After reading summary: Parent says "I know what happened this week"
- ✅ Summary has 4–7 concrete facts
- ✅ No speculation or inference visible
- ✅ Can skip email details and understand week

After skimming grouped items: Parent says "I found what I need"
- ✅ Group names are clear ("Medical", "School Updates")
- ✅ Item titles + summaries are scannable
- ✅ Can click through to Gmail if needed

---

## Implementation Order

1. **src/utils/summary-generator.ts** – Core utilities for fact extraction
2. **src/types/index.ts** – Extend DigestItem with new fields
3. **src/core/digest-builder.ts** – Integrate summary generation + grouping
4. **Test & iterate** – Verify HTML, plain text, links
5. **Refinement** – Tune deduplication, category mapping

---

## Next Steps (Future Enhancements)

- **Per-child summaries:** Group items by `person` field + category
- **Daily digest option:** Generate daily instead of weekly
- **Confidence filtering:** Let parents set threshold
- **Custom group names:** Let parents rename "School Updates" → "Emma's School"
- **Snippet preview in web UI:** Show excerpt on dashboard before approval
