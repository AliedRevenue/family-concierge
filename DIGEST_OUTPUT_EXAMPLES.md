# Digest Output Examples

## Real Example: School Pack Digest

Based on current approved items in database (7 items, Dec 23-30, 2025)

### HTML Email Version

```html
<!DOCTYPE html>
<html>
<head>
  <title>Family Ops Digest</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; ... }
    .summary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .item-summary { font-style: italic; color: #374151; }
    .excerpt-details { margin-top: 8px; }
    .excerpt-details summary { color: #2563eb; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Family Ops Digest</h1>
    <div class="period">Week of 12/23/2025 - 12/30/2025</div>

    <div class="summary">
      <div class="summary-title">📚 This Week at a Glance</div>
      <ul class="summary-list">
        <li>Class I group photos are available to view and download</li>
        <li>Winter concert recording available Dec 21</li>
        <li>Kindergarten newsletter for Jan 5–9</li>
        <li>Medical form due Jan 15</li>
      </ul>
    </div>

    <!-- SCHOOL UPDATES SECTION -->
    <div class="section">
      <div class="section-title">🏫 School Updates (3)</div>

      <div class="item">
        <div class="item-title">Class group pictures – finally!</div>
        <div class="item-summary">Class I group photos are available to view and download.</div>
        <div class="item-meta">
          Veracross (Andi Pieper) | School Updates
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CCAYxKp24sxqWzPg%40gmail.com%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>Dear Parents, We have uploaded the class group photos to Veracross. 
               You can download them for free. The photos are organized by grade and 
               individual classroom. If you have any questions...</p>
          </details>
        </div>
      </div>

      <div class="item">
        <div class="item-title">Winter Concert – Recording Now Available</div>
        <div class="item-summary">Winter concert recording will be available on Dec 21.</div>
        <div class="item-meta">
          School Events (no name) | School Updates
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CCAbc123%40gmail.com%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>Dear Families, Thank you for attending our winter concert! 
               The recording will be available on our portal starting Dec 21. 
               Use your login to access the video...</p>
          </details>
        </div>
      </div>

      <div class="item">
        <div class="item-title">Kindergarten Weekly Newsletter (Jan 5-9)</div>
        <div class="item-summary">Kindergarten newsletter for Jan 5–9 shared.</div>
        <div class="item-meta">
          Ms. Johnson (classroom@school.edu) | School Updates
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CKinder456%40school.edu%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>This week we focused on winter themes and learning letters M-O. 
               The children enjoyed our snowflake art project. Please practice 
               these letters at home...</p>
          </details>
        </div>
      </div>
    </div>

    <!-- MEDICAL SECTION -->
    <div class="section">
      <div class="section-title">🏥 Medical (1)</div>

      <div class="item">
        <div class="item-title">Annual Medical Update Form Due Jan 15</div>
        <div class="item-summary">Medical form due Jan 15.</div>
        <div class="item-meta">
          School Nurse (nurse@school.edu) | Medical | 92% confident
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CMed789%40school.edu%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>Dear Parents, Please complete and return the annual medical update 
               form by Jan 15. This form must be on file for your child to attend 
               school. The form is attached and also available...</p>
          </details>
        </div>
      </div>
    </div>

    <!-- ADMINISTRATIVE SECTION -->
    <div class="section">
      <div class="section-title">📋 Administrative / Forms (3)</div>

      <div class="item">
        <div class="item-title">Permission Slip – Winter Field Trip (Jan 10)</div>
        <div class="item-summary">Permission slip required for winter field trip.</div>
        <div class="item-meta">
          Field Trip Coordinator (trips@school.edu) | Administrative / Forms
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CTrip123%40school.edu%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>We will be visiting the science museum on Jan 10. This is a field 
               trip within district, so standard permission slip applies. Deadline 
               to return: Jan 8. Please sign and return...</p>
          </details>
        </div>
      </div>

      <div class="item">
        <div class="item-title">Photo Permission Form Update Required</div>
        <div class="item-summary">Photo consent form needs to be updated or reconfirmed.</div>
        <div class="item-meta">
          Communications Office (comms@school.edu) | Administrative / Forms
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CPhoto456%40school.edu%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>We update photo permissions annually. Please log into the parent 
               portal and confirm or modify your photo consent preferences by Jan 12...</p>
          </details>
        </div>
      </div>

      <div class="item">
        <div class="item-title">Lunch Menu – January 2026</div>
        <div class="item-summary">January lunch menu and allergy information available.</div>
        <div class="item-meta">
          Food Services (food@school.edu) | Administrative / Forms
        </div>
        <div class="item-actions">
          <a href="https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CLunch789%40school.edu%3E">
            Open email
          </a> · 
          <details class="excerpt-details">
            <summary>View excerpt</summary>
            <p>The January menu is attached. Please note that we've updated our 
               allergy protocols. Contact food@school.edu with any questions...</p>
          </details>
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stats-title">📊 This Week's Stats</div>
      <div class="stats-grid">
        <div class="stat-item">Emails Processed: 500</div>
        <div class="stat-item">Approved & Discovered: 7</div>
        <div class="stat-item">Categories Detected: 4</div>
        <div class="stat-item">Average Confidence: 94%</div>
      </div>
    </div>

    <div class="footer">
      <p>
        <a href="http://localhost:5000/dashboard">View Dashboard</a> | 
        <a href="http://localhost:5000/settings">Manage Settings</a>
      </p>
      <p>Family Concierge Agent – Keeping your family organized</p>
    </div>
  </div>
</body>
</html>
```

---

### Plain Text Email Version

```
FAMILY OPS DIGEST
Week of 12/23/2025 - 12/30/2025
============================================================

📚 THIS WEEK AT A GLANCE
• Class I group photos are available to view and download
• Winter concert recording available Dec 21
• Kindergarten newsletter for Jan 5–9
• Medical form due Jan 15

🏫 SCHOOL UPDATES (3)
============================================================

• Class group pictures – finally!
  Summary: Class I group photos are available to view and download.
  From: Veracross (Andi Pieper)
  Category: School Updates
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CCAYxKp24sxqWzPg%40gmail.com%3E

• Winter Concert – Recording Now Available
  Summary: Winter concert recording will be available on Dec 21.
  From: School Events
  Category: School Updates
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CCAbc123%40gmail.com%3E

• Kindergarten Weekly Newsletter (Jan 5-9)
  Summary: Kindergarten newsletter for Jan 5–9 shared.
  From: Ms. Johnson (classroom@school.edu)
  Category: School Updates
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CKinder456%40school.edu%3E

🏥 MEDICAL (1)
============================================================

• Annual Medical Update Form Due Jan 15
  Summary: Medical form due Jan 15.
  From: School Nurse (nurse@school.edu)
  Category: Medical
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CMed789%40school.edu%3E

📋 ADMINISTRATIVE / FORMS (3)
============================================================

• Permission Slip – Winter Field Trip (Jan 10)
  Summary: Permission slip required for winter field trip.
  From: Field Trip Coordinator (trips@school.edu)
  Category: Administrative / Forms
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CTrip123%40school.edu%3E

• Photo Permission Form Update Required
  Summary: Photo consent form needs to be updated or reconfirmed.
  From: Communications Office (comms@school.edu)
  Category: Administrative / Forms
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CPhoto456%40school.edu%3E

• Lunch Menu – January 2026
  Summary: January lunch menu and allergy information available.
  From: Food Services (food@school.edu)
  Category: Administrative / Forms
  [Open in Gmail]: https://mail.google.com/mail/u/0/#search/rfc822msgid:%3CLunch789%40school.edu%3E

============================================================
THIS WEEK'S STATS
============================================================

Emails Processed: 500
Events Created: 0
Pending Approval: 0
Emails Forwarded: 0
Errors: 0

============================================================
View Dashboard: http://localhost:5000/dashboard
Manage Settings: http://localhost:5000/settings
```

---

## Comparison: Before vs After

### BEFORE: Internal Debug Format

```
📋 Discovered & Approved (7)

• Class group pictures – finally!
  From: Veracross (Andi Pieper) | Category: school | Relevance: 94%

• Winter Concert – Recording Now Available
  From: School Events | Category: school | Relevance: 89%

• Kindergarten Weekly Newsletter (Jan 5-9)
  From: Ms. Johnson (classroom@school.edu) | Category: school | Relevance: 95%

• Annual Medical Update Form Due Jan 15
  From: School Nurse (nurse@school.edu) | Category: medical_health | Relevance: 92%

[... continues flat list ...]
```

**Problems:**
- ❌ No summary – must read all items to understand week
- ❌ Flat list – all items equal importance
- ❌ Diagnostic language – "Relevance: 94%"
- ❌ No action affordances – how do I reply/view full email?
- ❌ Hard to scan – all items identical formatting

---

### AFTER: Parent-Friendly Format

```
📚 THIS WEEK AT A GLANCE
• Class I group photos are available to view and download
• Winter concert recording available Dec 21
• Kindergarten newsletter for Jan 5–9
• Medical form due Jan 15

🏫 SCHOOL UPDATES (3)
  → Class group pictures (with link + excerpt)
  → Winter Concert (with link + excerpt)
  → Kindergarten Newsletter (with link + excerpt)

🏥 MEDICAL (1)
  → Medical Update Form (with link + excerpt)

📋 ADMINISTRATIVE / FORMS (3)
  → Permission Slip (with link + excerpt)
  → Photo Permission Form (with link + excerpt)
  → Lunch Menu (with link + excerpt)
```

**Benefits:**
- ✅ Summary first – understand week in 30 seconds
- ✅ Grouped by meaning – see what's important
- ✅ Human language – "photos available to download"
- ✅ Easy access – [Open email] directly in Gmail
- ✅ Scannable – quick visual hierarchy

---

## Edge Case Examples

### When No Summary Available

**Input:** Item with unparseable subject

```
Subject: "fyi"
Snippet: "Just wanted to let you know about the thing on Friday"
```

**Output (Fallback):**
```
• Just wanted to let you know about the thing on Friday
  [Opens email to see context]
```

---

### When MessageId Missing

**Input:** Item from forwarded email, messageId is null

```
Subject: "Important deadline"
No messageId available
Snippet: "Form due by Jan 15"
```

**Output:**
```
<a href="javascript:void(0)" title="Email not directly linkable">
  (Source email not available - view excerpt)
</a>

<details>
  <summary>View excerpt</summary>
  <p>Form due by Jan 15...</p>
</details>
```

---

### When Many Similar Items (Deduplication)

**Input:** 5 emails about same newsletter

```
1. Subject: "Weekly Newsletter"   Snippet: "Dec 26-30..."
2. Subject: "Newsletter - Week 1" Snippet: "Dec 26-30..."
3. Subject: "FW: Weekly Update"   Snippet: "Dec 26-30..."
4. Subject: "Reminder: Newsletter" Snippet: "Don't forget Dec 26-30..."
5. Subject: "Last Chance - Newsletter" Snippet: "Sign up for Dec 26-30..."
```

**Algorithm:**
- Extract fact from each: "Newsletter for Dec 26-30" (appears 5 times)
- Deduplicate: Count = 5, keep latest
- Summary: "Weekly newsletter for Dec 26-30" (single bullet)
- Display: Latest item with note "(+4 similar)"

**Output:**
```
📰 NEWSLETTERS (1)
  • Weekly Newsletter for Dec 26-30 (+4 similar)
    [Open latest email]
```

---

### When Low Confidence Item

**Input:** Medical email with 72% confidence

```
Subject: "Appointment Reminder"
Confidence: 0.72
```

**Output:**
```
From: Health Provider | Medical | 72% confident

[Parents see the confidence flag and can verify if relevant]
```

---

### When Very Long Subject

**Input:** Subject with 150+ chars

```
Subject: "Important: 2025 Annual Physical Exam and Immunization Requirements Update - Please Complete by Jan 31 or Your Child Will Not Be Able to Attend School"
```

**Summary Output:** (Truncated)
```
Medical form due Jan 31...
```

**Item Title:** (Full subject preserved)
```
Important: 2025 Annual Physical Exam and Immunization Requirements Update...
```

---

## Summary Generation Examples

### Pattern Recognition in Action

| Input Emails | Extracted Fact | Summary Bullet |
|--------------|---|---|
| "Group photos available" | "Photos available to view" | ✓ Shown |
| "Winter Concert Dec 20 recording" | "Winter concert recording available" | ✓ Shown |
| "Jan 5-9 Newsletter" | "Newsletter for Jan 5-9" | ✓ Shown |
| "Medical form due Jan 15" | "Medical form due Jan 15" | ✓ Shown |
| "Permission slip for field trip" | "Permission slip required" | ✓ Shown |
| "Lunch menu Jan 2026" | "Lunch menu or food information shared" | ✓ Shown (merged with allergy update) |
| "Class update - new seating" | "Class updates" | ✗ Too generic, not shown |
| "FYI" | "Class update" (fallback to subject) | ✗ Unparseable, use subject |

**Result:** 5-6 unique facts per week → 4-7 summary bullets

---

## Success Indicators

When a parent reads this digest, they should be able to answer:

**Q: What's important this week?**
- A: Read the "This Week at a Glance" (30 seconds)
- ✅ Photos, concert, newsletter, medical form

**Q: Do I need to do anything?**
- A: Scan category headers (1 minute)
- ✅ Yes: permission slip, medical form by deadline

**Q: Where do I find the original email?**
- A: Click [Open email] (instant)
- ✅ Direct link opens Gmail with message

**Q: What exactly did they say?**
- A: Click [View excerpt] (10 seconds)
- ✅ Shows snippet without opening Gmail

**Overall time to process:** 3-5 minutes (vs 20+ minutes without summary)

---

## Integration Points

This digest format works seamlessly with:

✅ **Email clients** (Gmail, Outlook, Apple Mail)
- HTML rendering with embedded styles
- Plain text fallback for text-only readers
- Deep links resolve in all clients

✅ **Dashboard**
- Can display summary facts as cards
- Show excerpt before final approval
- Track which summaries were helpful

✅ **Future per-child summaries**
- Same grouping/summary logic
- Filtered by `person` field
- "Emma: 3 school updates, 1 medical form"

✅ **Notifications**
- Summary facts can be SMS/push notification
- "4 updates: photos, concert, newsletter, form"
- Full digest in email

---

## Next Iteration: Per-Child Summaries

Once digest is working well, implement per-child grouping:

```
📧 DIGEST FOR EMMA
🏫 School Updates (3)
  → Class photos
  → Winter concert
  → Permission slip

🏥 Medical (1)
  → Medical form

---

📧 DIGEST FOR JAMES
🏫 School Updates (2)
  → Newsletter
  → Calendar update

⚽ Sports & Activities (1)
  → Soccer practice reminder

---

📧 FAMILY / SHARED
🏫 School Updates (1)
  → General school closure notice

💰 Administrative (2)
  → Lunch menu
  → Billing statement
```

**Infrastructure ready:**
- Person field already in database
- Category grouping logic already exists
- Would reuse all summary/rendering code
- Just filter by person before grouping
