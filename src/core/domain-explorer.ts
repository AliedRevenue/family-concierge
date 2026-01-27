/**
 * Domain Explorer
 * Periodically scans Gmail for emails mentioning kids from unknown domains
 * Builds suggestions for parent review
 */

import { v4 as uuid } from 'uuid';
import type { DatabaseClient } from '../database/client.js';
import type { GmailConnector, GmailMessage } from './gmail-connector.js';
import type { ConfigUpdater } from './config-updater.js';
import type {
  DomainExplorerConfig,
  DomainSuggestion,
} from '../types/index.js';
import { Logger } from '../utils/logger.js';

interface DomainStats {
  domain: string;
  emailCount: number;
  matchedKeywords: Set<string>;
  messageIds: string[];
  sampleSubjects: string[];
}

export class DomainExplorer {
  private logger: Logger;

  constructor(
    private db: DatabaseClient,
    private gmail: GmailConnector,
    private configUpdater: ConfigUpdater,
    logger?: Logger
  ) {
    this.logger = logger || new Logger(db);
  }

  /**
   * Run exploration for a pack
   * Called by scheduler (e.g., daily at 2am) or manually via API
   */
  async explore(config: DomainExplorerConfig): Promise<DomainSuggestion[]> {
    const runId = uuid();
    const startTime = Date.now();

    // Record run start
    this.db.insertExplorationRun({
      id: runId,
      packId: config.packId,
      runAt: new Date().toISOString(),
      queryUsed: config.keywords.join(' OR '),
      emailsScanned: 0,
      newDomainsFound: 0,
      suggestionsCreated: 0,
      status: 'running',
    });

    try {
      // Build keyword-only query (no domain filter)
      const query = this.buildExplorationQuery(config);
      this.logger.info('DomainExplorer', 'exploration_started', { packId: config.packId, query });

      // Fetch matching emails
      const messageIds = await this.gmail.listMessages(query, 200);
      this.logger.info('DomainExplorer', 'messages_fetched', { count: messageIds.length });

      // Analyze domains
      const domainStats = await this.analyzeDomains(
        messageIds,
        config.watchedDomains,
        config.keywords,
        config.packId
      );

      // Filter to suggestions
      const suggestions = this.filterToSuggestions(
        domainStats,
        config.minEmailsForSuggestion,
        config.minConfidence,
        config.packId
      );

      // Persist suggestions
      for (const suggestion of suggestions) {
        this.persistSuggestion(config.packId, suggestion);
      }

      // Update run stats
      this.db.updateExplorationRun(runId, {
        status: 'completed',
        emailsScanned: messageIds.length,
        newDomainsFound: domainStats.size,
        suggestionsCreated: suggestions.length,
        durationMs: Date.now() - startTime,
      });

      this.logger.info('DomainExplorer', 'exploration_completed', {
        packId: config.packId,
        emailsScanned: messageIds.length,
        domainsFound: domainStats.size,
        suggestions: suggestions.length,
        durationMs: Date.now() - startTime,
      });

      return suggestions;
    } catch (error) {
      this.db.updateExplorationRun(runId, {
        status: 'failed',
        error: (error as Error).message,
        durationMs: Date.now() - startTime,
      });

      this.logger.error('DomainExplorer', 'exploration_failed', {
        packId: config.packId,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Build exploration query - keywords only, no domain filter
   */
  private buildExplorationQuery(config: DomainExplorerConfig): string {
    const date = new Date();
    date.setDate(date.getDate() - config.lookbackDays);
    const dateFilter = `after:${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

    // Build OR query for kid names
    const keywordQuery = config.keywords.map((k) => `"${k}"`).join(' OR ');

    // Exclude emails from self
    return `${dateFilter} (${keywordQuery}) -from:me`;
  }

  /**
   * Analyze domains from fetched messages
   */
  private async analyzeDomains(
    messageIds: string[],
    watchedDomains: string[],
    keywords: string[],
    packId: string
  ): Promise<Map<string, DomainStats>> {
    const stats = new Map<string, DomainStats>();

    for (const messageId of messageIds) {
      const message = await this.gmail.getMessage(messageId);
      if (!message) continue;

      const from = this.gmail.getHeader(message, 'From') || '';
      const subject = this.gmail.getHeader(message, 'Subject') || '';
      const domain = this.extractDomain(from);

      if (!domain) continue;

      // Skip if already watched
      if (this.isWatchedDomain(domain, watchedDomains)) continue;

      // Skip if rejected
      if (this.db.isRejectedDomain(packId, domain)) continue;

      // Find which keywords matched
      const text = `${from} ${subject} ${message.snippet || ''}`.toLowerCase();
      const matched = keywords.filter((k) => text.includes(k.toLowerCase()));

      if (matched.length === 0) continue;

      // Accumulate stats
      if (!stats.has(domain)) {
        stats.set(domain, {
          domain,
          emailCount: 0,
          matchedKeywords: new Set(),
          messageIds: [],
          sampleSubjects: [],
        });
      }

      const domainStats = stats.get(domain)!;
      domainStats.emailCount++;
      matched.forEach((k) => domainStats.matchedKeywords.add(k));
      domainStats.messageIds.push(messageId);
      if (domainStats.sampleSubjects.length < 3) {
        domainStats.sampleSubjects.push(subject.substring(0, 80));
      }
    }

    return stats;
  }

  /**
   * Filter domains to actionable suggestions
   */
  private filterToSuggestions(
    domainStats: Map<string, DomainStats>,
    minEmails: number,
    minConfidence: number,
    packId: string
  ): DomainSuggestion[] {
    const suggestions: DomainSuggestion[] = [];

    for (const [domain, stats] of domainStats.entries()) {
      // Require minimum email count
      if (stats.emailCount < minEmails) continue;

      // Calculate confidence
      const confidence = this.calculateConfidence(stats);
      if (confidence < minConfidence) continue;

      // Skip if already suggested and pending
      const existing = this.db.getSuggestedDomainByDomain(packId, domain);
      if (existing && existing.status === 'pending') {
        // Update existing suggestion with new data
        this.db.updateSuggestedDomain(existing.id, {
          emailCount: stats.emailCount,
          matchedKeywords: Array.from(stats.matchedKeywords),
          evidenceMessageIds: stats.messageIds.slice(0, 5),
          sampleSubjects: stats.sampleSubjects,
          confidence,
          lastSeenAt: new Date().toISOString(),
        });
        continue;
      }

      // Skip if already approved
      if (existing && existing.status === 'approved') continue;

      suggestions.push({
        domain,
        emailCount: stats.emailCount,
        matchedKeywords: Array.from(stats.matchedKeywords),
        evidenceMessageIds: stats.messageIds.slice(0, 5),
        confidence,
        sampleSubjects: stats.sampleSubjects,
      });
    }

    return suggestions;
  }

  /**
   * Calculate confidence for a domain suggestion
   */
  private calculateConfidence(stats: DomainStats): number {
    let confidence = 0.5;

    // More emails = higher confidence (up to +0.2)
    confidence += Math.min(0.2, stats.emailCount * 0.05);

    // Multiple kid names matched = higher confidence (up to +0.2)
    confidence += Math.min(0.2, (stats.matchedKeywords.size - 1) * 0.1);

    // Cap at 0.95
    return Math.min(0.95, confidence);
  }

  /**
   * Persist a suggestion to database
   */
  private persistSuggestion(packId: string, suggestion: DomainSuggestion): void {
    const existing = this.db.getSuggestedDomainByDomain(packId, suggestion.domain);

    if (existing) {
      // Update existing (shouldn't happen due to filter, but safe)
      this.db.updateSuggestedDomain(existing.id, {
        emailCount: suggestion.emailCount,
        matchedKeywords: suggestion.matchedKeywords,
        evidenceMessageIds: suggestion.evidenceMessageIds,
        sampleSubjects: suggestion.sampleSubjects,
        confidence: suggestion.confidence,
        lastSeenAt: new Date().toISOString(),
      });
    } else {
      // Insert new
      this.db.insertSuggestedDomain({
        id: uuid(),
        packId,
        domain: suggestion.domain,
        emailCount: suggestion.emailCount,
        matchedKeywords: suggestion.matchedKeywords,
        evidenceMessageIds: suggestion.evidenceMessageIds,
        sampleSubjects: suggestion.sampleSubjects,
        confidence: suggestion.confidence,
      });
    }
  }

  /**
   * Approve a suggested domain - adds to config
   */
  async approveDomain(suggestionId: string): Promise<boolean> {
    const suggestion = this.db.getSuggestedDomainById(suggestionId);
    if (!suggestion) {
      this.logger.warn('DomainExplorer', 'approve_failed_not_found', { suggestionId });
      return false;
    }

    // Add domain to config
    const success = await this.configUpdater.addDomain(
      suggestion.pack_id,
      suggestion.domain
    );

    if (success) {
      this.db.approveSuggestedDomain(suggestionId);
      this.logger.info('DomainExplorer', 'domain_approved', {
        domain: suggestion.domain,
        packId: suggestion.pack_id,
      });
    } else {
      this.logger.error('DomainExplorer', 'domain_approve_config_failed', {
        domain: suggestion.domain,
        packId: suggestion.pack_id,
      });
    }

    return success;
  }

  /**
   * Reject a suggested domain
   */
  rejectDomain(suggestionId: string, reason: string, permanent: boolean = true): void {
    const suggestion = this.db.getSuggestedDomainById(suggestionId);
    if (!suggestion) {
      this.logger.warn('DomainExplorer', 'reject_failed_not_found', { suggestionId });
      return;
    }

    this.db.rejectSuggestedDomain(suggestionId, reason, permanent);

    this.logger.info('DomainExplorer', 'domain_rejected', {
      domain: suggestion.domain,
      packId: suggestion.pack_id,
      reason,
      permanent,
    });
  }

  /**
   * Get pending suggestions for a pack
   */
  getPendingSuggestions(packId: string): any[] {
    return this.db.getSuggestedDomains(packId, 'pending');
  }

  // Helper methods

  private extractDomain(email: string): string | null {
    const match = email.match(/@([a-zA-Z0-9.-]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  private isWatchedDomain(domain: string, watchedDomains: string[]): boolean {
    return watchedDomains.some((watched) => {
      if (watched.includes('*')) {
        // Convert glob pattern to regex
        const pattern = watched.replace(/\./g, '\\.').replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`, 'i').test(domain);
      }
      return domain.toLowerCase() === watched.toLowerCase();
    });
  }
}
