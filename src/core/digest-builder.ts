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

    // Section 1: Events Created
    if (createdEvents.length > 0) {
      sections.push({
        title: `✅ Events Created (${createdEvents.length})`,
        type: 'created',
        items: createdEvents.map(event => this.eventToDigestItem(event)),
      });
    }

    // Section 2: Pending Approval
    if (pendingEvents.length > 0) {
      sections.push({
        title: `⚠️  Pending Review (${pendingEvents.length})`,
        type: 'pending_approval',
        items: pendingEvents.map(event => this.eventToDigestItem(event, baseUrl)),
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

    // Section 4: Errors
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
  private eventToDigestItem(event: PersistedEvent, baseUrl?: string): DigestItem {
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

    if (item.title) {
      html += `  <div class="item-title">${this.escapeHTML(item.title)}</div>\n`;
    }

    if (item.summaryFact) {
      html += `  <div class="item-summary">${this.escapeHTML(item.summaryFact)}</div>\n`;
    }

    // Metadata line: From | Category | Confidence
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

    if (metaParts.length > 0) {
      html += `  <div class="item-meta">${metaParts.join(' | ')}</div>\n`;
    }

    // Actions: Open email link + excerpt
    if (item.gmailLink || item.excerpt) {
      html += '  <div class="item-actions">\n';
      if (item.gmailLink) {
        html += `    <a href="${item.gmailLink}" class="action-link">Open email</a>\n`;
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
        // Use enhanced rendering for approved_pending items
        if (section.type === 'approved_pending' && item.title && item.gmailLink) {
          text += `• ${item.title}\n`;
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
          text += `• ${item.eventTitle}\n`;
          text += `  ${item.eventDate || ''} | Confidence: ${Math.round((item.confidence || 0) * 100)}%\n`;
          
          if (item.approvalToken) {
            text += `  Approve: ${baseUrl}/approve/${item.approvalToken}\n`;
          }
          text += `\n`;
        } else if (item.subject) {
          text += `• ${item.subject}\n`;
          text += `  ${item.snippet || ''}\n`;
          text += `  Forwarded to: ${item.forwardedTo?.join(', ') || ''}\n\n`;
        } else if (item.title) {
          text += `• ${item.title}\n`;
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
}
