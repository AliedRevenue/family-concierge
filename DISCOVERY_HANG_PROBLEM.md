# Discovery & Digest Pipeline - Current Status

## Overall Status: FIXED & ENHANCED ✅

### ✅ FIXED: Discovery Engine Hanging (Regression Resolved)
The recent regression caused by person assignment has been completely fixed. Discovery now processes all 500 messages successfully with person assignment enabled.

**What was broken:**
- Regex-based person matching had potential for catastrophic backtracking
- Word boundary regexes on unescaped aliases could hang on certain inputs
- Not clear if issue was regex itself or passing too much text to regex engine

**Solution implemented:**
- Replaced regex matching with **token-based deterministic matching**
- Split search text into tokens, use Set membership checks (O(1) lookups)
- Eliminated all regex patterns - no backtracking possible
- Truncate snippet to 500 chars max before assignment (bounded input)
- Added feature flag `PERSON_ASSIGNMENT_ENABLED` for quick isolation
- Added step-level timing logs to track each phase

**Evidence of success:**
```
[492/500] before assignPerson
   [492/500] after assignPerson (0ms) → Family/Shared
   [492/500] before insertPendingApproval
   [492/500] after insertPendingApproval (0ms)

📊 Discovery Summary:
   Messages Processed: 500
   Messages Skipped: 0
   Success Rate: 100.0%
   Evidence Found: 14
   Unique Senders: 205
   Unique Domains: 138
```

### ✅ IMPLEMENTED: Person Assignment to Family Members

**How it works:**
1. **Config-driven** - Family members and aliases defined in `agent-config.yaml`
2. **Three-tier matching**:
   - Exact: Token membership checks (e.g., "Emma" appears as word)
   - Alias: Substring match on longer aliases
   - Group: Team/classroom name matching
   - Fallback: "Family/Shared" if no match
3. **Assignment tracking** - Each item records:
   - `person`: Which family member it was assigned to
   - `assignment_reason`: How it was assigned (exact, alias, group, shared_default)
4. **No LLM** - Pure deterministic logic, fully explainable

**Config example:**
```yaml
family:
  members:
    - name: "Emma"
      aliases: ["Emma", "E.", "Emma Fitzgerald"]
      groupAliases: ["Emma's class", "Emma's team"]
    - name: "James"
      aliases: ["James", "J.", "James Fitzgerald"]
      groupAliases: ["James's class"]
  defaultAssignmentFallback: "Family/Shared"
```

**Performance:**
- Token-based matching: O(1) per alias (constant time set lookups)
- No regex compilation or backtracking
- Assignment completes in <1ms per email

---

## Next Phase: Per-Child Summaries in Digest 🎯

Now that person assignment is working reliably, we can implement the digest summaries:

**Expected output format:**
```
👧 Emma
  • 3 school-related emails 
  • 2 sports updates
  
👦 James  
  • 4 sports emails
  • 2 activity updates

Family/Shared
  • 2 administrative emails
```

**Implementation plan:**
1. Modify digest-builder to group approved pending approvals by person
2. Count items per category per person
3. Generate concise summary bullets
4. Show full email details below

---

## Fixed Issues (From Earlier This Session)

✅ **Discovery Hanging** - Timeout wrapper + logging fixed the original hang
✅ **Digest Query Date Filter** - ISO string formatting fixed the range query
✅ **Rejected Items Showing** - Fixed `/reject` endpoint to set `approved=false`
✅ **Email Rendering** - Added support for `approved_pending` section type in digest

---

## Files Modified in This Session

**New files:**
- `src/utils/person-assignment.ts` - Token-based family member matching

**Modified files:**
- `migrations/007_person_assignment.sql` - New migration for person fields
- `config/agent-config.yaml` - Added family member definitions
- `src/core/discovery-engine.ts` - Integrated person assignment with detailed logging
- `src/database/client.ts` - Updated insertPendingApproval to handle person fields

**Key changes:**
- Replaced regex with token-based matching (no backtracking risks)
- Added step-level timing logs (`before assignPerson`, `after assignPerson (Xms)`)
- Feature flag support: `PERSON_ASSIGNMENT_ENABLED` env var for quick isolation
- Truncate snippet to safe size before assignment

---

## Success Criteria ✅

Discovery:
- ✅ Processes all 500 messages without hanging
- ✅ Person assignment completes in <1ms per email
- ✅ Assigns items to family members correctly
- ✅ Falls back to "Family/Shared" safely

Digest (next):
- ⏳ Group items by person
- ⏳ Generate per-person summaries
- ⏳ Show meaningful digest email to parents


4. ✅ Updated DigestItem type to support approved pending approval fields
5. ❌ But the method still returns empty array even though data exists

### Root Cause (Investigation In Progress)
The issue is in `src/core/digest-builder.ts` method `getApprovedPendingApprovals()`:
- It queries for `WHERE pack_id = 'school' AND approved = 1 AND created_at >= ? AND created_at <= ?`
- But returns empty array even though verified 22 rows exist with `approved=1`

**Possible causes:**
1. The `pack_id` stored in pending_approvals might not be 'school'
2. The date range comparison might be off (created_at might use different format)
3. The database connection access via `this.db.getConnection()` might not be working properly
4. The query might be using wrong table or column names

### Code Location
**File:** `src/core/digest-builder.ts` lines 246-262

```typescript
private getApprovedPendingApprovals(startDate: string, endDate: string): any[] {
  try {
    const conn = this.db.getConnection();
    const stmt = conn.prepare(`
      SELECT * FROM pending_approvals 
      WHERE pack_id = 'school' AND approved = 1 
      AND created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `);
    return stmt.all(startDate, endDate);
  } catch (error) {
    console.error('Error fetching approved pending approvals:', error);
    return [];
  }
}
```

### Next Steps
Need to debug:
1. Check what `pack_id` values actually exist in pending_approvals table
2. Check the date format of `created_at` field
3. Verify the date range being passed to the query
4. Consider adding logging/debug output to the query
5. Simplify the query to remove date filtering temporarily to see if data is found

### Files Modified in This Session
- `src/utils/timeout.ts` (new) - Timeout wrapper utilities
- `src/core/discovery-engine.ts` - Added timeout logging, error handling, summary stats
- `src/core/digest-builder.ts` - Added approved pending approvals fallback
- `src/types/index.ts` - Updated DigestSection and DigestItem types
- `src/index.ts` - Fixed web server hanging, updated digest command logic
- `src/database/client.ts` - Added schema healing, getAllEvents() method

### Success Criteria
Once fixed, the digest should show:
```
📊 Digest Summary:
   📋 Discovered & Approved (13)
     - Subject 1 | Category: SCHOOL
     - Subject 2 | Category: MEDICAL
     ... etc
   Events Created: 0
   Pending Review: 0
```

