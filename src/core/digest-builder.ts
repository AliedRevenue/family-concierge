/**
 * Digest Builder
 * Generates weekly email summaries of agent activity
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseClient } from '../database/client.js';
import type { Digest, DigestSection, DigestItem, DigestStats, PersistedEvent, ForwardedMessage } from '../types/index.js';
import {
  generateSummaryFacts,
  categoryToGroupName,
  getCategoryPriority,
  formatSummaryFactsAsHTML,
  formatSummaryFactsAsPlainText,
  formatSnippet,
  generateGmailLink,
  type ApprovedItem,
  type SummaryFact,
} from '../utils/summary-generator.js';

export class DigestBuilder {
  constructor(private db: DatabaseClient) {}

  /**
   * Generate a digest for a specific time period
   */
  async generateDigest(startDate: string, endDate: string, baseUrl: string = 'http://localhost:3000'): Promise<Digest> {
    const id = uuidv4();
    const generatedAt = new Date().toISOString();

    // Query database for events in period
    const createdEvents = this.getEventsByStatusAndPeriod('created', startDate, endDate);
    const pendingEvents = this.getEventsByStatusAndPeriod('pending_approval', startDate, endDate);
    const failedEvents = this.getEventsByStatusAndPeriod('failed', startDate, endDate);
    const forwardedMessages = this.getForwardedMessagesInPeriod(startDate, endDate);
    
    // Get deferred and dismissed items
    const deferredItems = this.getDeferredItems();
    const dismissedItems = this.db.getDismissedItems(startDate, endDate);
    
    // Count processed messages
    const processedCount = this.getProcessedMessageCount(startDate, endDate);

    // Build sections
    const sections: DigestSection[] = [];

    // If no events but there are approved pending approvals, show those instead
    const totalEvents = createdEvents.length + pendingEvents.length + failedEvents.length;
    let approvedPendingCount = 0;
    let approvedPendingItems: DigestItem[] = [];
    
    if (totalEvents === 0) {
      const approvedPending = this.getApprovedPendingApprovals(startDate, endDate);
      approvedPendingCount = approvedPending.length;
      
      if (approvedPending.length > 0) {
        // Convert to enhanced DigestItems with summaries and grouping
        approvedPendingItems = this.buildEnhancedApprovedItems(approvedPending);
        
        // Group items by category
        const groupedSections = this.groupItemsByCategory(approvedPendingItems);
        
        // Add summary block if items exist
        if (approvedPendingItems.length > 0) {
          const summaryFacts = generateSummaryFacts(approvedPending);
          if (summaryFacts.length > 0) {
            const summaryHTML = formatSummaryFactsAsHTML(summaryFacts);
            // Store summary in first section's title for now
            // (will be extracted in HTML/plain text generation)
          }
        }
        
        // Add grouped sections
        sections.push(...groupedSections);
      }
    }

    // Section 0: Deferred Items (NEEDS ATTENTION)
    if (deferredItems.length > 0) {
      sections.push({
        title: `⏳ NEEDS YOUR ATTENTION (${deferredItems.length})`,
        type: 'deferred',
        items: deferredItems,
      });
    }

    // Section 1: Events Created
    if (createdEvents.length > 0) {
      sections.push({
        title: `✅ Events Created (${createdEvents.length})`,
        type: 'created',
        items: createdEvents.map(event => this.eventToDigestItem(event, '✓')),
      });
    }

    // Section 2: Pending Approval
    if (pendingEvents.length > 0) {
      sections.push({
        title: `⚠️  Pending Review (${pendingEvents.length})`,
        type: 'pending_approval',
        items: pendingEvents.map(event => this.eventToDigestItem(event, '⚠', baseUrl)),
      });
    }

    // Section 3: Forwarded Emails
    if (forwardedMessages.length > 0) {
      sections.push({
        title: `📧 Emails Forwarded (${forwardedMessages.length})`,
        type: 'forwarded',
        items: forwardedMessages.map(msg => this.forwardedMessageToDigestItem(msg)),
      });
    }

    // Section 4: Dismissed This Week
    if (dismissedItems.length > 0) {
      sections.push({
        title: `⌀ DISMISSED THIS WEEK (${dismissedItems.length})`,
        type: 'dismissed',
        items: dismissedItems.map(item => this.dismissedItemToDigestItem(item)),
      });
    }

    // Section 5: Errors
    if (failedEvents.length > 0) {
      sections.push({
        title: `❌ Errors (${failedEvents.length})`,
        type: 'errors',
        items: failedEvents.map(event => this.eventToDigestItem(event)),
      });
    }

    // Calculate stats
    const stats: DigestStats = {
      emailsScanned: processedCount,
      eventsCreated: createdEvents.length,
      eventsPending: pendingEvents.length,
      emailsForwarded: forwardedMessages.length,
      errors: failedEvents.length,
    };

    return {
      id,
      generatedAt,
      period: { startDate, endDate },
      summary: {
        totalEmailsProcessed: processedCount,
        eventsExtracted: createdEvents.length + pendingEvents.length + approvedPendingCount,
        eventsCreated: createdEvents.length,
        eventsUpdated: 0, // TODO: Track updates separately
        pendingApproval: pendingEvents.length,
        emailsForwarded: forwardedMessages.length,
        errors: failedEvents.length,
        approvedPending: approvedPendingCount,
      },
      sections,
      stats,
      metadata: {
        approvedPendingRawItems: totalEvents === 0 ? this.getApprovedPendingApprovals(startDate, endDate) : [],
      },
    };
  }

  /**
   * Build a digest from approved emails (from pending_approvals table)
   * Used when parent approves emails from the dashboard
   */
  async buildDigestFromApprovedEmails(packId: string, baseUrl: string = 'http://localhost:5000'): Promise<Digest> {
    const id = uuidv4();
    const generatedAt = new Date().toISOString();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get approved emails from pending_approvals for this pack
    const approvedEmails = this.getApprovedEmailsByPack(packId, weekAgo.toISOString(), now.toISOString());

    const sections: DigestSection[] = [];
    
    if (approvedEmails.length > 0) {
      sections.push({
        title: `📧 Approved Emails (${approvedEmails.length})`,
        type: 'forwarded',
        items: approvedEmails.map(email => ({
          subject: email.subject,
          snippet: email.snippet,
          source: email.from_email || email.from_name || 'Unknown',
          confidence: email.relevance_score,
          date: new Date(email.created_at).toLocaleDateString(),
        })),
      });
    }

    const stats: DigestStats = {
      emailsScanned: approvedEmails.length,
      eventsCreated: 0,
      eventsPending: 0,
      emailsForwarded: approvedEmails.length,
      errors: 0,
    };

    return {
      id,
      generatedAt,
      period: { startDate: weekAgo.toISOString(), endDate: now.toISOString() },
      summary: {
        totalEmailsProcessed: approvedEmails.length,
        eventsExtracted: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        pendingApproval: 0,
        emailsForwarded: approvedEmails.length,
        errors: 0,
      },
      sections,
      stats,
    };
  }

  /**
   * Generate weekly reconciliation digest (Sunday 8pm format)
   * Shows what system is watching, caught, needs attention, dismissed, potential misses
   */
  async generateWeeklyReconciliation(startDate: string, endDate: string, packs: any[], baseUrl: string = 'http://localhost:3000'): Promise<Digest> {
    const id = uuidv4();
    const generatedAt = new Date().toISOString();
    
    // Reuse existing logic
    const digest = await this.generateDigest(startDate, endDate, baseUrl);
    digest.mode = 'weekly';
    
    // Add "What I'm Watching" section at the beginning
    const watchingSections: DigestSection[] = [];
    
    for (const pack of packs) {
      const config = pack.config;
      if (!config || !config.sources) continue;
      
      const watchedDomains: string[] = [];
      config.sources.forEach((source: any) => {
        if (source.fromDomains) {
          watchedDomains.push(...source.fromDomains);
        }
      });
      
      if (watchedDomains.length > 0) {
        watchingSections.push({
          title: `📧 WHAT I'M WATCHING - ${pack.person || 'Unknown'}`,
          type: 'approved_pending', // Reuse type
          items: watchedDomains.map(domain => ({
            title: `✓ Watching: ${domain}`,
            description: 'Calendar + Digest',
          })),
        });
      }
    }
    
    // Prepend watching sections
    digest.sections = [...watchingSections, ...digest.sections];
    
    return digest;
  }

  /**
   * Get approved emails for a pack from pending_approvals table
   */
  private getApprovedEmailsByPack(packId: string, startDate: string, endDate: string): any[] {
    // Query the database directly via prepared statement
    const stmt = (this.db as any).db.prepare(`
      SELECT id, message_id, pack_id, relevance_score, from_email, from_name, 
             subject, snippet, created_at
      FROM pending_approvals
      WHERE pack_id = ? AND approved = 1 AND action = 'approve'
      AND created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `);
    return stmt.all(packId, startDate, endDate) || [];
  }

  /**
   * Convert PersistedEvent to DigestItem
   */
  private eventToDigestItem(event: PersistedEvent, symbol?: string, baseUrl?: string): DigestItem {
    const eventDate = new Date(event.eventIntent.startDateTime);
    const formatted = this.formatDate(eventDate);

    const item: DigestItem = {
      eventTitle: event.eventIntent.title,
      eventDate: formatted,
      confidence: event.confidence,
      source: `Message ${event.sourceMessageId.substring(0, 8)}`,
      action: this.getActionText(event.status),
      calendarEventId: event.calendarEventId,
      error: event.error,
      symbol: symbol,
    };

    // Add approval token for pending events
    if (event.status === 'pending_approval' && baseUrl) {
      const operation = this.db.getCalendarOperationByFingerprint(event.fingerprint);
      if (operation) {
        const token = this.db.getApprovalTokenByOperation(operation.id);
        if (token) {
          item.approvalToken = token.id;
        }
      }
    }

    return item;
  }

  /**
   * Convert ForwardedMessage to DigestItem
   */
  private forwardedMessageToDigestItem(msg: ForwardedMessage): DigestItem {
    // Fetch original message details from processed_messages
    const processed = this.db.getProcessedMessage(msg.sourceMessageId);
    
    return {
      subject: `Message ${msg.sourceMessageId.substring(0, 8)}`,
      from: msg.packId,
      snippet: msg.reason,
      forwardedTo: msg.forwardedTo,
      source: msg.packId,
    };
  }

  /**
   * Get events by status within date range
   */
  private getEventsByStatusAndPeriod(status: PersistedEvent['status'], startDate: string, endDate: string): PersistedEvent[] {
    return this.db.getEventsByStatus(status).filter(event => {
      const created = new Date(event.createdAt);
      return created >= new Date(startDate) && created <= new Date(endDate);
    });
  }

  /**
   * Convert raw approved item to enhanced DigestItem with summaries
   */
  private buildEnhancedApprovedItems(items: any[]): DigestItem[] {
    return items.map(item => {
      const groupInfo = categoryToGroupName(item.primary_category || '');
      const snippet = item.snippet || '';
      const gmailLink = generateGmailLink(item.message_id);
      
      return {
        id: item.id,
        messageId: item.message_id,
        title: item.subject || 'No subject',
        summaryFact: this.extractFactFromItem(item.subject, snippet),
        fromName: item.from_name,
        fromEmail: item.from_email,
        category: item.primary_category || 'other',
        categoryGroup: groupInfo.name,
        categoryIcon: groupInfo.icon,
        excerpt: formatSnippet(snippet, 400),
        gmailLink: gmailLink || undefined,
        confidence: item.relevance_score,
        date: new Date(item.created_at).toLocaleDateString(),
        relevanceScore: item.relevance_score,
        metadata: {
          primaryCategory: item.primary_category,
          secondaryCategories: item.secondary_categories ? JSON.parse(item.secondary_categories) : [],
          savedReasons: item.save_reasons ? JSON.parse(item.save_reasons) : [],
        },
      };
    });
  }

  /**
   * Extract a fact from subject + snippet (helper)
   */
  private extractFactFromItem(subject: string, snippet: string): string {
    // Use existing extractFact or fallback to subject
    // For now, use subject as fact if extracting is complex
    return subject || '(No summary available)';
  }

  /**
   * Group items by category for display
   */
  private groupItemsByCategory(items: DigestItem[]): DigestSection[] {
    const groups = new Map<string, { name: string; icon: string; items: DigestItem[] }>();

    for (const item of items) {
      const key = item.category || 'other';
      if (!groups.has(key)) {
        const info = categoryToGroupName(key);
        groups.set(key, { name: info.name, icon: info.icon, items: [] });
      }
      groups.get(key)!.items.push(item);
    }

    // Sort by category priority
    const sorted = Array.from(groups.entries())
      .sort((a, b) => getCategoryPriority(a[0]) - getCategoryPriority(b[0]))
      .map(([catKey, group]) => ({
        title: `${group.icon} ${group.name} (${group.items.length})`,
        type: 'approved_pending' as const,
        items: group.items,
      }));

    return sorted;
  }

  /**
   * Format a DigestItem to HTML
   */
  private itemToHTML(item: DigestItem, baseUrl: string): string {
    let html = '<div class="item">\n';

    // Add symbol if present
    if (item.symbol) {
      html += `  <span class="item-symbol">${item.symbol}</span> `;
    }

    if (item.title) {
      html += `  <div class="item-title">${this.escapeHTML(item.title)}</div>\n`;
    }

    if (item.summaryFact) {
      html += `  <div class="item-summary">${this.escapeHTML(item.summaryFact)}</div>\n`;
    }

    // State explanation (for deferred/dismissed items)
    if (item.stateExplanation) {
      html += `  <div class="item-state">${this.escapeHTML(item.stateExplanation)}</div>\n`;
    }

    // Metadata line: From | Category | Confidence | Days Pending
    const metaParts: string[] = [];
    if (item.fromEmail) {
      const from = item.fromName ? `${item.fromName} (${item.fromEmail})` : item.fromEmail;
      metaParts.push(from);
    }
    if (item.categoryGroup) {
      metaParts.push(item.categoryGroup);
    }
    if (item.confidence && item.confidence < 0.95) {
      metaParts.push(`${Math.round(item.confidence * 100)}% confident`);
    }
    if (item.daysPending !== undefined) {
      metaParts.push(`${item.daysPending} day(s) pending`);
    }

    if (metaParts.length > 0) {
      html += `  <div class="item-meta">${metaParts.join(' | ')}</div>\n`;
    }

    // Actions: Open email link + excerpt + dismiss command
    if (item.gmailLink || item.excerpt || item.metadata?.dismissCommand) {
      html += '  <div class="item-actions">\n';
      if (item.gmailLink) {
        html += `    <a href="${item.gmailLink}" class="action-link">Open email</a>\n`;
      }
      if (item.metadata?.dismissCommand) {
        html += `    <code style="font-size: 11px; background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${this.escapeHTML(item.metadata.dismissCommand)}</code>\n`;
      }
      if (item.excerpt) {
        html += `    <details class="excerpt-details">\n`;
        html += `      <summary>View excerpt</summary>\n`;
        html += `      <p>${item.excerpt}</p>\n`;
        html += `    </details>\n`;
      }
      html += '  </div>\n';
    }

    html += '</div>\n';
    return html;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get approved pending approvals within date range
   */
  private getApprovedPendingApprovals(startDate: string, endDate: string): any[] {
    try {
      const conn = this.db.getConnection();

      // Convert date-only strings to ISO datetime boundaries
      // startDate "2025-12-23" → "2025-12-23T00:00:00.000Z"
      // endDate "2025-12-30" → "2025-12-30T23:59:59.999Z"
      const startISO = startDate.includes('T') 
        ? startDate 
        : `${startDate}T00:00:00.000Z`;
      
      const endISO = endDate.includes('T')
        ? endDate
        : `${endDate}T23:59:59.999Z`;

      const stmt = conn.prepare(`
        SELECT * FROM pending_approvals 
        WHERE pack_id = 'school' AND approved = 1 
        AND (action IS NULL OR action != 'reject')
        AND created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
      `);
      return stmt.all(startISO, endISO);
    } catch (error) {
      console.error('Error fetching approved pending approvals:', error);
      return [];
    }
  }



  /**
   * Get forwarded messages in period
   */
  private getForwardedMessagesInPeriod(startDate: string, endDate: string): ForwardedMessage[] {
    return this.db.getForwardedMessagesByDateRange(startDate, endDate);
  }

  /**
   * Get count of processed messages in period
   */
  private getProcessedMessageCount(startDate: string, endDate: string): number {
    const messages = this.db.getRecentProcessedMessages(1000); // TODO: Add date filter to query
    return messages.filter(msg => {
      const processed = new Date(msg.processedAt);
      return processed >= new Date(startDate) && processed <= new Date(endDate);
    }).length;
  }

  /**
   * Get deferred items (pending approvals with no action taken)
   * Shows items that need parent attention
   */
  private getDeferredItems(): DigestItem[] {
    try {
      const conn = this.db.getConnection();
      const stmt = conn.prepare(`
        SELECT * FROM pending_approvals
        WHERE approved = 0 AND (action IS NULL OR action = '')
        ORDER BY created_at ASC
      `);
      const items = stmt.all();
      
      return items.map((item: any) => {
        const createdAt = new Date(item.created_at);
        const now = new Date();
        const daysPending = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const escalated = daysPending >= 7;
        
        return {
          id: item.id,
          title: item.subject || 'No subject',
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          date: createdAt.toLocaleDateString(),
          daysPending,
          escalated,
          symbol: escalated ? '🚨' : '?',
          stateExplanation: escalated 
            ? `URGENT: Pending for ${daysPending} days. Please dismiss or forward.`
            : `Pending for ${daysPending} day(s). Missing complete information to create calendar event.`,
          gmailLink: item.message_id ? generateGmailLink(item.message_id) || undefined : undefined,
          metadata: {
            itemId: item.id,
            dismissCommand: `npx tsx src/index.ts dismiss ${item.id} "reason"`,
          },
        };
      });
    } catch (error) {
      console.error('Error fetching deferred items:', error);
      return [];
    }
  }

  /**
   * Convert dismissed item to DigestItem
   */
  private dismissedItemToDigestItem(item: any): DigestItem {
    const dismissedAt = new Date(item.dismissed_at);
    return {
      id: item.id,
      title: item.original_subject || 'No subject',
      subject: item.original_subject,
      fromEmail: item.original_from,
      date: item.original_date ? new Date(item.original_date).toLocaleDateString() : undefined,
      dismissedAt: item.dismissed_at,
      dismissedReason: item.reason,
      symbol: '⌀',
      stateExplanation: `Dismissed ${dismissedAt.toLocaleDateString()}: ${item.reason}`,
      metadata: {
        person: item.person,
        dismissedBy: item.dismissed_by,
      },
    };
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;

    return `${dayName}, ${monthName} ${day} at ${hour12}:${minutes} ${ampm}`;
  }

  /**
   * Get human-readable action text for event status
   */
  private getActionText(status: PersistedEvent['status']): string {
    switch (status) {
      case 'created':
        return 'Created in calendar';
      case 'pending_approval':
        return 'Awaiting approval';
      case 'approved':
        return 'Approved';
      case 'failed':
        return 'Failed to create';
      case 'flagged':
        return 'Flagged for review';
      case 'updated':
        return 'Updated in calendar';
      default:
        return 'Unknown';
    }
  }

  /**
   * Generate HTML version of digest
   */
  generateHTML(digest: Digest, baseUrl: string = 'http://localhost:3000'): string {
    const { period, sections, stats } = digest;
    const startDate = new Date(period.startDate).toLocaleDateString();
    const endDate = new Date(period.endDate).toLocaleDateString();

    // Get approved pending items for summary generation
    const approvedRawItems = (digest.metadata as any)?.approvedPendingRawItems || [];
    const summaryFacts = approvedRawItems.length > 0 ? generateSummaryFacts(approvedRawItems) : [];

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Family Ops Digest</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2563eb;
      margin-top: 0;
    }
    .period {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .summary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .summary-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .summary-text {
      font-size: 14px;
      line-height: 1.6;
    }
    .section {
      margin-bottom: 30px;
      border-top: 2px solid #e5e7eb;
      padding-top: 20px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #111827;
    }
    .item {
      margin-bottom: 15px;
      padding: 12px;
      background-color: #f9fafb;
      border-radius: 6px;
      border-left: 3px solid #2563eb;
    }
    .item-title {
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }
    .item-summary {
      font-size: 14px;
      color: #374151;
      margin-bottom: 8px;
      font-style: italic;
    }
    .item-meta {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .item-symbol {
      font-size: 16px;
      margin-right: 6px;
    }
    .item-state {
      font-size: 13px;
      color: #374151;
      margin-bottom: 8px;
      padding: 8px;
      background-color: #fef3c7;
      border-radius: 4px;
      border-left: 3px solid #f59e0b;
    }
    .item-actions {
      font-size: 13px;
      margin-top: 8px;
    }
    .action-link {
      color: #2563eb;
      text-decoration: none;
      margin-right: 12px;
    }
    .action-link:hover {
      text-decoration: underline;
    }
    .excerpt-details {
      margin-top: 8px;
      cursor: pointer;
    }
    .excerpt-details summary {
      color: #2563eb;
      font-size: 13px;
      cursor: pointer;
      user-select: none;
    }
    .excerpt-details summary:hover {
      text-decoration: underline;
    }
    .excerpt-details p {
      margin: 8px 0 0 0;
      padding: 8px;
      background-color: #f0f9ff;
      border-radius: 4px;
      font-size: 12px;
      color: #444;
      line-height: 1.5;
    }
    .summary-list {
      margin: 0;
      padding-left: 20px;
    }
    .summary-list li {
      margin-bottom: 6px;
      font-size: 14px;
      line-height: 1.5;
    }

    .approve-btn {
      display: inline-block;
      margin-top: 10px;
      padding: 8px 16px;
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 14px;
    }
    .approve-btn:hover {
      background-color: #1d4ed8;
    }
    .stats {
      background-color: #eff6ff;
      border-radius: 6px;
      padding: 20px;
      margin-top: 30px;
    }
    .stats-title {
      font-weight: 600;
      margin-bottom: 10px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .stat-item {
      font-size: 14px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Family Ops Digest</h1>
    <div class="period">Week of ${startDate} - ${endDate}</div>
`;

    // Add summary block from approved pending items
    if (summaryFacts.length > 0) {
      html += formatSummaryFactsAsHTML(summaryFacts);
    } else if (sections.length > 0 && sections.some(s => s.items.length > 0)) {
      // Fallback to old summary generation for non-approved-pending items
      const summary = this.generateSummary(sections);
      if (summary) {
        html += `
    <div class="summary">
      <div class="summary-title">📚 What's Going On This Week</div>
      <div class="summary-text">
        ${summary}
      </div>
    </div>
`;
      }
    }

    // Add sections
    for (const section of sections) {
      html += `    <div class="section">
      <div class="section-title">${section.title}</div>
`;
      
      for (const item of section.items) {
        // Use enhanced rendering for approved_pending items
        if (section.type === 'approved_pending' && item.title && item.gmailLink) {
          html += this.itemToHTML(item, baseUrl);
        } else if (item.eventTitle) {
          // Event items (calendar)
          html += `      <div class="item">
        <div class="item-title">${this.escapeHTML(item.eventTitle)}</div>
        <div class="item-meta">
          ${item.eventDate || ''} | Confidence: ${Math.round((item.confidence || 0) * 100)}%
        </div>
`;
          
          if (item.approvalToken) {
            html += `        <a href="${baseUrl}/approve/${item.approvalToken}" class="approve-btn">Approve Event</a>
`;
          }
          html += `      </div>
`;
        } else if (item.subject && item.forwardedTo) {
          // Forwarded email
          html += `      <div class="item">
        <div class="item-title">${this.escapeHTML(item.subject)}</div>
        <div class="item-meta">
          ${this.escapeHTML(item.snippet || '')}<br>
          Forwarded to: ${item.forwardedTo?.join(', ') || ''}
        </div>
      </div>
`;
        } else if (item.title && !item.gmailLink) {
          // Fallback for other approved items without enhanced fields
          html += `      <div class="item">
        <div class="item-title">${this.escapeHTML(item.title)}</div>
        <div class="item-meta">
          ${this.escapeHTML(item.description || '')}<br>
          Relevance: ${Math.round((item.relevanceScore || 0) * 100)}%
        </div>
      </div>
`;
        } else {
          // Generic item
          html += this.itemToHTML(item, baseUrl);
        }
      }
      
      html += `    </div>
`;
    }

    // Add stats
    html += `    <div class="stats">
      <div class="stats-title">📊 This Week's Stats</div>
      <div class="stats-grid">
        <div class="stat-item">Emails Processed: ${stats.emailsScanned}</div>
        <div class="stat-item">Events Created: ${stats.eventsCreated}</div>
        <div class="stat-item">Pending Approval: ${stats.eventsPending}</div>
        <div class="stat-item">Emails Forwarded: ${stats.emailsForwarded}</div>
      </div>
    </div>

    <div class="footer">
      <p><a href="${baseUrl}/dashboard">View Dashboard</a> | <a href="${baseUrl}/settings">Manage Settings</a></p>
      <p>Family Ops - Keeping your family organized</p>
    </div>
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * Generate a summary from approved emails
   */
  private generateSummary(sections: DigestSection[]): string {
    const activities: string[] = [];
    const schools: Set<string> = new Set();
    const eventCount = { school: 0, activities: 0, admin: 0 };

    for (const section of sections) {
      for (const item of section.items) {
        if (item.eventTitle) {
          // Extract what's happening
          const title = item.eventTitle.toLowerCase();
          if (title.includes('assembly') || title.includes('program') || title.includes('performance')) {
            activities.push('school performances and assemblies');
          }
          if (title.includes('field trip')) {
            activities.push('field trip');
          }
          if (title.includes('picture') || title.includes('photo')) {
            activities.push('picture day');
          }
          if (title.includes('break') || title.includes('early release') || title.includes('early dismissal')) {
            activities.push('schedule changes');
          }
          if (title.includes('conference') || title.includes('parent') || title.includes('meeting')) {
            activities.push('parent meetings');
          }
          if (title.includes('class')) {
            activities.push('class updates');
          }
          eventCount.school++;
        } else if (item.subject) {
          const subj = item.subject.toLowerCase();
          if (subj.includes('school')) eventCount.school++;
          else eventCount.activities++;
        }
      }
    }

    // Build summary text
    const uniqueActivities = [...new Set(activities)];
    if (uniqueActivities.length === 0) {
      return 'Several updates about the kids\' activities and schedules this week.';
    }

    const activitiesText = uniqueActivities.join(', ');
    return `This week includes ${activitiesText}. Make sure to check the details below for any action items or date changes.`;
  }

  /**
   * Generate plain text version of digest
   */
  generatePlainText(digest: Digest, baseUrl: string = 'http://localhost:3000'): string {
    const { period, sections, stats } = digest;
    const startDate = new Date(period.startDate).toLocaleDateString();
    const endDate = new Date(period.endDate).toLocaleDateString();

    // Get approved pending items for summary generation
    const approvedRawItems = (digest.metadata as any)?.approvedPendingRawItems || [];
    const summaryFacts = approvedRawItems.length > 0 ? generateSummaryFacts(approvedRawItems) : [];

    let text = `FAMILY OPS DIGEST\n`;
    text += `Week of ${startDate} - ${endDate}\n`;
    text += `${'='.repeat(60)}\n\n`;

    // Add summary block from approved pending items
    if (summaryFacts.length > 0) {
      text += formatSummaryFactsAsPlainText(summaryFacts);
    }

    // Add sections
    for (const section of sections) {
      text += `${section.title}\n`;
      text += `${'-'.repeat(60)}\n\n`;
      
      for (const item of section.items) {
        // Add symbol prefix
        const symbol = item.symbol || '';
        const prefix = symbol ? `${symbol} ` : '';
        
        // Deferred items
        if (section.type === 'deferred') {
          text += `${prefix}${item.title}\n`;
          if (item.stateExplanation) {
            text += `  ${item.stateExplanation}\n`;
          }
          if (item.fromEmail) {
            const from = item.fromName ? `${item.fromName} (${item.fromEmail})` : item.fromEmail;
            text += `  From: ${from}\n`;
          }
          if (item.daysPending !== undefined) {
            text += `  Days pending: ${item.daysPending}\n`;
          }
          if (item.gmailLink) {
            text += `  [Open in Gmail]: ${item.gmailLink}\n`;
          }
          if (item.metadata?.dismissCommand) {
            text += `  To dismiss: ${item.metadata.dismissCommand}\n`;
          }
          text += `\n`;
        }
        // Dismissed items
        else if (section.type === 'dismissed') {
          text += `${prefix}${item.title}\n`;
          if (item.stateExplanation) {
            text += `  ${item.stateExplanation}\n`;
          }
          if (item.fromEmail) {
            text += `  From: ${item.fromEmail}\n`;
          }
          text += `\n`;
        }
        // Use enhanced rendering for approved_pending items
        else if (section.type === 'approved_pending' && item.title && item.gmailLink) {
          text += `${prefix}${item.title}\n`;
          if (item.summaryFact) {
            text += `  Summary: ${item.summaryFact}\n`;
          }
          if (item.fromEmail) {
            const from = item.fromName ? `${item.fromName} (${item.fromEmail})` : item.fromEmail;
            text += `  From: ${from}\n`;
          }
          if (item.categoryGroup) {
            text += `  Category: ${item.categoryGroup}\n`;
          }
          if (item.confidence && item.confidence < 0.95) {
            text += `  Confidence: ${Math.round(item.confidence * 100)}%\n`;
          }
          if (item.gmailLink) {
            text += `  [Open in Gmail]: ${item.gmailLink}\n`;
          }
          text += `\n`;
        } else if (item.eventTitle) {
          text += `${prefix}${item.eventTitle}\n`;
          text += `  ${item.eventDate || ''} | Confidence: ${Math.round((item.confidence || 0) * 100)}%\n`;
          
          if (item.approvalToken) {
            text += `  Approve: ${baseUrl}/approve/${item.approvalToken}\n`;
          }
          text += `\n`;
        } else if (item.subject) {
          text += `${prefix}${item.subject}\n`;
          text += `  ${item.snippet || ''}\n`;
          text += `  Forwarded to: ${item.forwardedTo?.join(', ') || ''}\n\n`;
        } else if (item.title) {
          text += `${prefix}${item.title}\n`;
          text += `  ${item.description || ''}\n`;
          text += `  Relevance: ${Math.round((item.relevanceScore || 0) * 100)}%\n\n`;
        }
      }
      
      text += `\n`;
    }

    // Add stats
    text += `${'='.repeat(60)}\n`;
    text += `THIS WEEK'S STATS\n`;
    text += `${'='.repeat(60)}\n\n`;
    text += `Emails Processed: ${stats.emailsScanned}\n`;
    text += `Events Created: ${stats.eventsCreated}\n`;
    text += `Pending Approval: ${stats.eventsPending}\n`;
    text += `Emails Forwarded: ${stats.emailsForwarded}\n`;
    text += `Errors: ${stats.errors}\n\n`;

    text += `${'='.repeat(60)}\n`;
    text += `View Dashboard: ${baseUrl}/dashboard\n`;
    text += `Manage Settings: ${baseUrl}/settings\n`;

    return text;
  }

  /**
   * Generate upcoming summary for dashboard and email
   * Returns events for next N days + emails worth reading
   */
  getUpcomingSummary(days: number = 14): {
    events: Array<{
      id: string;
      title: string;
      startDateTime: string;
      endDateTime: string;
      location?: string;
      person?: string;
      pack: string;
      status: string;
      symbol: string;
      sourceMessageId?: string;
      gmailLink?: string;
    }>;
    emailsWorthReading: Array<{
      id: string;
      subject: string;
      fromName?: string;
      fromEmail: string;
      snippet?: string;
      category?: string;
      person?: string;
      daysAgo: number;
      gmailLink?: string;
    }>;
    summary: {
      eventsNext14Days: number;
      emailsWorthReading: number;
      generatedAt: string;
    };
  } {
    // Get upcoming events
    const upcomingEvents = this.db.getUpcomingEvents(days);

    // Format events for display
    const events = upcomingEvents.map((event) => {
      const intent = event.eventIntent;
      const symbol = event.status === 'created' ? '✓' :
                     event.status === 'pending_approval' ? '⚠' :
                     event.status === 'flagged' ? '?' : '•';

      return {
        id: event.id,
        title: intent.title,
        startDateTime: intent.startDateTime,
        endDateTime: intent.endDateTime,
        location: intent.location,
        person: undefined, // Would need to infer from pack/context
        pack: event.packId,
        status: event.status,
        symbol,
        sourceMessageId: event.sourceMessageId,
        gmailLink: event.sourceMessageId
          ? `https://mail.google.com/mail/u/0/#inbox/${event.sourceMessageId}`
          : undefined,
      };
    });

    // Get emails worth reading
    const worthReading = this.db.getEmailsWorthReading(undefined, 10);

    const emailsWorthReading = worthReading.map((email: any) => ({
      id: email.id,
      subject: email.subject,
      fromName: email.from_name,
      fromEmail: email.from_email,
      snippet: email.snippet,
      category: email.primary_category,
      person: email.person,
      daysAgo: email.days_ago || 0,
      gmailLink: email.message_id
        ? `https://mail.google.com/mail/u/0/#inbox/${email.message_id}`
        : undefined,
    }));

    return {
      events,
      emailsWorthReading,
      summary: {
        eventsNext14Days: events.length,
        emailsWorthReading: emailsWorthReading.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate plain text upcoming digest for email
   */
  generateUpcomingDigestText(days: number = 14, baseUrl: string = 'http://localhost:5000'): string {
    const { events, emailsWorthReading, summary } = this.getUpcomingSummary(days);

    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const startStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let text = `WHAT'S COMING UP (${startStr} - ${endStr})\n`;
    text += `${'='.repeat(50)}\n\n`;

    if (events.length === 0) {
      text += `No upcoming events found.\n\n`;
    } else {
      // Group events by date
      const eventsByDate = new Map<string, typeof events>();
      for (const event of events) {
        const dateKey = new Date(event.startDateTime).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        if (!eventsByDate.has(dateKey)) {
          eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey)!.push(event);
      }

      for (const [dateKey, dateEvents] of eventsByDate.entries()) {
        text += `${dateKey}\n`;
        text += `${'-'.repeat(dateKey.length)}\n`;
        for (const event of dateEvents) {
          const time = new Date(event.startDateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          const location = event.location ? ` - ${event.location}` : '';
          const person = event.person ? ` (${event.person})` : '';
          text += `${event.symbol} ${event.title}${location} @ ${time}${person}\n`;
        }
        text += `\n`;
      }
    }

    text += `\nEMAILS WORTH READING\n`;
    text += `${'='.repeat(50)}\n\n`;

    if (emailsWorthReading.length === 0) {
      text += `No emails need your attention.\n`;
    } else {
      for (let i = 0; i < emailsWorthReading.length; i++) {
        const email = emailsWorthReading[i];
        text += `${i + 1}. ${email.subject}\n`;
        const from = email.fromName ? `${email.fromName}` : email.fromEmail;
        text += `   From: ${from} • ${email.daysAgo} day(s) ago\n`;
        if (email.snippet) {
          text += `   "${email.snippet.substring(0, 100)}..."\n`;
        }
        if (email.gmailLink) {
          text += `   → Open: ${email.gmailLink}\n`;
        }
        text += `\n`;
      }
    }

    text += `\n${'='.repeat(50)}\n`;
    text += `View Dashboard: ${baseUrl}\n`;

    return text;
  }

  /**
   * Generate HTML upcoming digest for email
   */
  generateUpcomingDigestHTML(days: number = 14, baseUrl: string = 'http://localhost:5000'): string {
    const { events, emailsWorthReading, summary } = this.getUpcomingSummary(days);

    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const startStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 20px; border-radius: 0 0 8px 8px; }
    .date-group { margin-bottom: 20px; }
    .date-header { font-weight: bold; color: #667eea; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; }
    .event { padding: 10px; margin-bottom: 8px; background: #f9fafb; border-left: 3px solid #667eea; }
    .event.pending { border-left-color: #f59e0b; }
    .symbol { font-size: 1.2em; margin-right: 8px; }
    .email-item { padding: 15px; margin-bottom: 10px; background: #f9fafb; border-left: 3px solid #3b82f6; }
    .email-subject { font-weight: bold; margin-bottom: 5px; }
    .email-meta { color: #6b7280; font-size: 0.9em; }
    .email-snippet { font-style: italic; color: #4b5563; margin-top: 5px; }
    .btn { display: inline-block; padding: 8px 16px; background: #667eea; color: white; text-decoration: none; border-radius: 4px; margin-top: 10px; }
    .section-title { font-size: 1.1em; font-weight: bold; margin: 20px 0 10px; color: #333; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;">📅 What's Coming Up</h1>
    <p style="margin:5px 0 0;">${startStr} - ${endStr}</p>
  </div>
  <div class="content">`;

    if (events.length === 0) {
      html += `<p>No upcoming events found.</p>`;
    } else {
      // Group events by date
      const eventsByDate = new Map<string, typeof events>();
      for (const event of events) {
        const dateKey = new Date(event.startDateTime).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        if (!eventsByDate.has(dateKey)) {
          eventsByDate.set(dateKey, []);
        }
        eventsByDate.get(dateKey)!.push(event);
      }

      for (const [dateKey, dateEvents] of eventsByDate.entries()) {
        html += `<div class="date-group">
          <div class="date-header">${dateKey}</div>`;
        for (const event of dateEvents) {
          const time = new Date(event.startDateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          const isPending = event.status === 'pending_approval';
          const location = event.location ? ` - ${event.location}` : '';
          html += `<div class="event ${isPending ? 'pending' : ''}">
            <span class="symbol">${event.symbol}</span>
            <strong>${this.escapeHTML(event.title)}</strong>${location} @ ${time}
          </div>`;
        }
        html += `</div>`;
      }
    }

    html += `<div class="section-title">📬 Emails Worth Reading</div>`;

    if (emailsWorthReading.length === 0) {
      html += `<p>No emails need your attention.</p>`;
    } else {
      for (const email of emailsWorthReading) {
        const from = email.fromName || email.fromEmail;
        html += `<div class="email-item">
          <div class="email-subject">${this.escapeHTML(email.subject)}</div>
          <div class="email-meta">From: ${this.escapeHTML(from)} • ${email.daysAgo} day(s) ago</div>
          ${email.snippet ? `<div class="email-snippet">"${this.escapeHTML(email.snippet.substring(0, 100))}..."</div>` : ''}
          ${email.gmailLink ? `<a href="${email.gmailLink}" class="btn">Open in Gmail</a>` : ''}
        </div>`;
      }
    }

    html += `
    <p style="margin-top: 20px; text-align: center;">
      <a href="${baseUrl}" class="btn">View Dashboard</a>
    </p>
  </div>
</body>
</html>`;

    return html;
  }
}
