/**
 * Summary Generator
 * Generates human-readable summaries from approved emails
 */

export interface ApprovedItem {
  id: string;
  subject: string;
  snippet: string;
  from_name?: string;
  from_email: string;
  primary_category: string;
  secondary_categories?: string;
  relevance_score: number;
  message_id?: string;
  created_at: string;
}

export interface SummaryFact {
  category: string;
  groupName: string;
  groupIcon: string;
  fact: string;
  itemCount: number;
  items: ApprovedItem[];
}

/**
 * Map email category to human-readable group name + icon
 */
export function categoryToGroupName(category: string): { name: string; icon: string } {
  const mapping: Record<string, { name: string; icon: string }> = {
    school: { name: 'School Updates', icon: '🏫' },
    sports_activities: { name: 'Sports & Activities', icon: '⚽' },
    medical_health: { name: 'Medical', icon: '🏥' },
    events_performances: { name: 'Events & Performances', icon: '🎭' },
    logistics: { name: 'Logistics', icon: '📦' },
    forms_admin: { name: 'Administrative / Forms', icon: '📋' },
    community_optional: { name: 'Community', icon: '🤝' },
  };

  return mapping[category] || { name: 'Other', icon: '📌' };
}

/**
 * Get category priority for sorting (lower = higher priority)
 */
export function getCategoryPriority(category: string): number {
  const priority: Record<string, number> = {
    medical_health: 1,
    school: 2,
    events_performances: 3,
    sports_activities: 4,
    logistics: 5,
    forms_admin: 6,
    community_optional: 7,
  };
  return priority[category] || 99;
}

/**
 * Extract key fact from subject + snippet
 * Returns plain-English one-liner (50–150 chars) or empty string if not parseable
 */
export function extractFact(subject: string, snippet: string): string {
  const text = `${subject} ${snippet}`.toLowerCase();

  // Heuristic patterns: [pattern, extracted fact template]
  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string | null]> = [
    // Photos/media availability
    [
      /(?:photos?|pictures?|images?|videos?|recordings?)[^.]*(available|uploaded|shared|ready)/i,
      () => 'Photos and materials available to view',
    ],
    [
      /group (?:photos?|pictures?)[^.]*(available|ready|view)/i,
      () => 'Group photos available to view',
    ],

    // Events/concerts
    [
      /(?:concert|performance|show|event)[^.]*(?:on|scheduled?|date)[:\s]*(\w+\s+\d+)/i,
      (m) => `Event scheduled for ${m[1]}`,
    ],
    [
      /winter concert/i,
      () => 'Winter concert coming up',
    ],

    // Newsletters
    [
      /newsletter[^.]*(?:for|week)[:\s]*(\w+\s+\d+[^.]*)/i,
      (m) => `Newsletter for ${m[1]}`,
    ],
    [
      /weekly newsletter/i,
      () => 'Weekly newsletter shared',
    ],

    // Medical/forms
    [
      /(?:medical|health|doctor|appointment|vaccination|form)[^.]*(?:due|required|needed)[:\s]*(\w+\s+\d+)?/i,
      (m) => `Medical form or appointment ${m[1] ? 'due ' + m[1] : 'required'}`,
    ],
    [
      /permission slip/i,
      () => 'Permission slip required',
    ],
    [
      /(?:lunch|lunch menu|snack|allergy)/i,
      () => 'Lunch menu or food information shared',
    ],

    // Pickup/logistics
    [
      /(?:pickup|pick-up|dismissal|early release|cancell?ed|reschedul)/i,
      (m) => 'Schedule update for pickup or class time',
    ],

    // Reminders/announcements
    [
      /reminder[^.]*(deadline|due)[:\s]*(\w+\s+\d+)?/i,
      (m) => `Reminder: deadline ${m[2] || 'coming up'}`,
    ],

    // Class announcements
    [
      /(?:class announcement|update from|message from teacher)/i,
      () => 'Teacher announcement or class update',
    ],

    // Field trips
    [
      /field trip|excursion/i,
      () => 'Field trip information and permission slip',
    ],

    // Generic: if nothing matches but has concrete keywords
    [
      /(?:update|announcement|available|reminder|event)/i,
      () => null, // Let fallback handle it
    ],
  ];

  // Try patterns in order
  for (const [pattern, factory] of patterns) {
    const match = text.match(pattern);
    if (match) {
      const fact = factory(match);
      if (fact) return fact;
    }
  }

  // Fallback: extract first sentence of snippet
  if (snippet) {
    const sentences = snippet.match(/[^.!?]+[.!?]+/);
    if (sentences && sentences[0]) {
      let fact = sentences[0].trim();
      // Remove "Dear Parents," or similar greetings
      fact = fact.replace(/^(?:dear\s+\w+,?\s*|hi\s+\w+,?\s*)/i, '');
      // Capitalize
      fact = fact.charAt(0).toUpperCase() + fact.slice(1);
      // Truncate if too long
      if (fact.length > 150) {
        fact = fact.substring(0, 147) + '...';
      }
      return fact.length > 20 ? fact : '';
    }
  }

  return subject || '';
}

/**
 * Deduplicate similar facts by grouping
 */
interface FactGroup {
  canonical: string;
  facts: Array<{ fact: string; items: ApprovedItem[] }>;
}

function deduplicateFacts(
  facts: Array<{ category: string; fact: string; items: ApprovedItem[] }>
): Array<{ category: string; fact: string; items: ApprovedItem[] }> {
  // Simple deduplication: normalize facts by category, keep unique
  const seen = new Map<string, typeof facts[0]>();

  for (const item of facts) {
    const key = `${item.category}|${item.fact}`.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, item);
    } else {
      // Merge items into existing entry
      const existing = seen.get(key)!;
      existing.items = [...existing.items, ...item.items];
    }
  }

  return Array.from(seen.values());
}

/**
 * Generate summary facts from approved items
 * Returns 4–7 bullets representing distinct life facts
 */
export function generateSummaryFacts(items: ApprovedItem[]): SummaryFact[] {
  if (items.length === 0) return [];

  // Step 1: Group items by category
  const byCategory = new Map<string, ApprovedItem[]>();
  for (const item of items) {
    const cat = item.primary_category || 'other';
    if (!byCategory.has(cat)) {
      byCategory.set(cat, []);
    }
    byCategory.get(cat)!.push(item);
  }

  // Step 2: Extract facts per category
  const facts: Array<{ category: string; fact: string; items: ApprovedItem[] }> = [];
  for (const [category, categoryItems] of byCategory) {
    // Extract facts from each item
    const categoryFacts: Array<{ fact: string; item: ApprovedItem }> = [];
    for (const item of categoryItems) {
      const fact = extractFact(item.subject, item.snippet || '');
      if (fact) {
        categoryFacts.push({ fact, item });
      }
    }

    // If no facts extracted, use first subject as fallback
    if (categoryFacts.length === 0 && categoryItems.length > 0) {
      const firstSubject = categoryItems[0].subject || '(No subject)';
      categoryFacts.push({
        fact: firstSubject,
        item: categoryItems[0],
      });
    }

    // Group facts by canonical form (dedup within category)
    const grouped = new Map<string, ApprovedItem[]>();
    for (const { fact, item } of categoryFacts) {
      const key = fact.toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    // Add to facts list (one per unique fact)
    for (const [fact, factItems] of grouped) {
      facts.push({ category, fact: fact.trim() || 'Update available', items: factItems });
    }
  }

  // Step 3: Sort by category priority
  facts.sort((a, b) => getCategoryPriority(a.category) - getCategoryPriority(b.category));

  // Step 4: Cap at 7 facts, preferring diversity of categories
  const selected: Array<{ category: string; fact: string; items: ApprovedItem[] }> = [];
  const seenCategories = new Set<string>();

  // First pass: one fact per category (in priority order)
  for (const fact of facts) {
    if (selected.length >= 7) break;
    if (!seenCategories.has(fact.category)) {
      selected.push(fact);
      seenCategories.add(fact.category);
    }
  }

  // Second pass: add remaining facts if under limit
  for (const fact of facts) {
    if (selected.length >= 7) break;
    if (!selected.includes(fact)) {
      selected.push(fact);
    }
  }

  // Step 5: Convert to SummaryFact format
  return selected.map((item) => ({
    category: item.category,
    groupName: categoryToGroupName(item.category).name,
    groupIcon: categoryToGroupName(item.category).icon,
    fact: item.fact,
    itemCount: item.items.length,
    items: item.items,
  }));
}

/**
 * Format summary facts as HTML bullet list
 */
export function formatSummaryFactsAsHTML(facts: SummaryFact[]): string {
  if (facts.length === 0) return '';

  let html = '<div class="summary">\n';
  html += '  <div class="summary-title">📚 This Week at a Glance</div>\n';
  html += '  <ul class="summary-list">\n';

  for (const fact of facts) {
    html += `    <li>${escapeHTML(fact.fact)}</li>\n`;
  }

  html += '  </ul>\n';
  html += '</div>\n';

  return html;
}

/**
 * Format summary facts as plain text
 */
export function formatSummaryFactsAsPlainText(facts: SummaryFact[]): string {
  if (facts.length === 0) return '';

  let text = '📚 THIS WEEK AT A GLANCE\n';
  for (const fact of facts) {
    text += `• ${fact.fact}\n`;
  }
  text += '\n';

  return text;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate Gmail deep link from messageId
 * Handles both with/without angle brackets
 */
export function generateGmailLink(messageId?: string): string | null {
  if (!messageId) return null;

  // Ensure angle brackets for RFC 2392 format
  let id = messageId.trim();
  if (!id.startsWith('<')) id = '<' + id;
  if (!id.endsWith('>')) id = id + '>';

  // URL encode angle brackets
  id = id.replace(/</g, '%3C').replace(/>/g, '%3E');

  return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${id}`;
}

/**
 * Truncate and safe-escape snippet for display
 */
export function formatSnippet(snippet: string | null, maxChars: number = 300): string {
  if (!snippet) return '(No preview available)';

  let text = snippet.trim();

  // Replace multiple spaces/newlines with single space
  text = text.replace(/\s+/g, ' ');

  // Remove greeting phrases
  text = text.replace(/^(?:dear\s+\w+,?\s*|hi\s+\w+,?\s*)/i, '');

  // Truncate
  if (text.length > maxChars) {
    text = text.substring(0, maxChars).trim() + '...';
  }

  return escapeHTML(text);
}
