/**
 * AI Email Classifier
 *
 * Uses Claude to classify emails as obligations or announcements
 * and extract relevant dates for scheduling visibility.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ClassificationResult {
  itemType: 'obligation' | 'announcement';
  obligationDate: string | null;  // ISO date string if there's a relevant future date
  confidence: number;
  reasoning: string;
}

export interface EmailToClassify {
  subject: string;
  snippet: string;
  fromName?: string;
  fromEmail?: string;
  bodyText?: string;
  bodyHtml?: string;
}

export class EmailClassifier {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Classify an email and extract relevant dates
   */
  async classifyEmail(email: EmailToClassify, currentDate: Date = new Date()): Promise<ClassificationResult> {
    const emailContent = this.buildEmailContent(email);
    const dateContext = currentDate.toISOString().split('T')[0];

    const prompt = `You are classifying a school/activity email for a family. Today's date is ${dateContext}.

EMAIL:
Subject: ${email.subject}
From: ${email.fromName || email.fromEmail || 'Unknown'}
${emailContent}

CLASSIFY THIS EMAIL:

1. **Type**: Is this an OBLIGATION or an ANNOUNCEMENT?
   - OBLIGATION: Requires parent/child ACTION or ATTENDANCE (concerts, lessons, deadlines, permission slips, appointments, events to attend, forms to submit, RSVPs needed, waivers to sign)
   - ANNOUNCEMENT: Informational only, no action required (newsletters, class updates, "what we learned this week")

2. **Date Extraction**: ALWAYS extract any specific date mentioned for events, lessons, deadlines, etc.
   - Look carefully at the subject line for dates like "@ Sat Jan 31, 2026" or "January 15th"
   - Include the date even if it's in the past - we need it for categorization
   - Return null ONLY if there is truly no date mentioned

Respond in this exact JSON format:
{
  "itemType": "obligation" or "announcement",
  "obligationDate": "YYYY-MM-DD" or null,
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation"
}

Only output the JSON, nothing else.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[Classifier] Could not parse response, defaulting to announcement');
        return this.defaultClassification();
      }

      const result = JSON.parse(jsonMatch[0]);

      // Validate and normalize the result
      return {
        itemType: result.itemType === 'obligation' ? 'obligation' : 'announcement',
        obligationDate: this.validateDate(result.obligationDate, currentDate),
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.7,
        reasoning: result.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error('[Classifier] Error classifying email:', error);
      return this.defaultClassification();
    }
  }

  /**
   * Classify multiple emails in batch (more efficient)
   */
  async classifyEmails(emails: EmailToClassify[], currentDate: Date = new Date()): Promise<Map<string, ClassificationResult>> {
    const results = new Map<string, ClassificationResult>();

    // Process in parallel with a concurrency limit
    const batchSize = 5;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const promises = batch.map(async (email, idx) => {
        const key = email.subject || `email-${i + idx}`;
        const result = await this.classifyEmail(email, currentDate);
        return { key, result };
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ key, result }) => results.set(key, result));
    }

    return results;
  }

  private buildEmailContent(email: EmailToClassify): string {
    // Prefer body text, fall back to snippet
    if (email.bodyText && email.bodyText.length > 0) {
      // Truncate to reasonable length for classification
      return email.bodyText.substring(0, 2000);
    }
    if (email.bodyHtml && email.bodyHtml.length > 0) {
      // Strip HTML tags for classification
      const stripped = email.bodyHtml
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return stripped.substring(0, 2000);
    }
    return email.snippet || '';
  }

  private validateDate(dateStr: string | null, currentDate: Date): string | null {
    if (!dateStr) return null;

    try {
      const date = new Date(dateStr);
      // Check if it's a valid date
      if (isNaN(date.getTime())) return null;

      // Allow dates within reasonable range (1 year past to 1 year future)
      // We store past dates too so we can properly categorize them
      const oneYearAgo = new Date(currentDate);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const oneYearFromNow = new Date(currentDate);
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      if (date < oneYearAgo) {
        // Date is too far in the past, likely a parsing error
        return null;
      }
      if (date > oneYearFromNow) {
        // Date is too far in the future, might be a parsing error
        return null;
      }

      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  private defaultClassification(): ClassificationResult {
    return {
      itemType: 'announcement',
      obligationDate: null,
      confidence: 0.5,
      reasoning: 'Default classification due to processing error',
    };
  }
}
