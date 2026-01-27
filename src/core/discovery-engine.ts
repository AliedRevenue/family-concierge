/**
 * Discovery Engine
 * Scans emails to propose configuration for a Pack
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  DiscoverySession,
  DiscoveryOutput,
  ProposedSource,
  ProposedKeyword,
  DetectedPlatform,
  Evidence,
  Pack,
  CategoryPreferences,
} from '../types/index.js';
import { DEFAULT_CATEGORY_PREFERENCES } from '../types/index.js';
import type { GmailConnector, GmailMessage } from './gmail-connector.js';
import type { DatabaseClient } from '../database/client.js';
import type { Logger } from '../utils/logger.js';
import { CategoryClassifier } from './category-classifier.js';
import { EmailClassifier } from './email-classifier.js';
import { withTimeoutAndLog } from '../utils/timeout.js';
import { createPersonAssignerFromConfig } from '../utils/person-assignment.js';

export class DiscoveryEngine {
  private emailClassifier?: EmailClassifier;

  constructor(
    private gmail: GmailConnector,
    private db: DatabaseClient,
    private logger: Logger,
    apiKey?: string
  ) {
    // Initialize email classifier if API key is available
    if (apiKey) {
      this.emailClassifier = new EmailClassifier(apiKey);
      console.log('📧 Email classifier initialized for AI-based classification');
    }
  }

  /**
   * Run discovery for a pack
   * TWO MODES:
   *   Mode A (Targeted): If userConfig sources exist, search those domains first
   *   Mode B (Anchored): If no sources or too few results, anchor on child names/keywords
   * Read-only: no events created, no calendar writes
   * 
   * @param pack - The pack definition (from registry)
   * @param lookbackDays - How many days back to scan
   * @param userConfig - Optional user-provided config with sources (from agent-config.yaml)
   */
  async runDiscovery(pack: Pack, lookbackDays: number, userConfig?: any): Promise<DiscoverySession> {
    const sessionId = uuidv4();
    const session: DiscoverySession = {
      id: sessionId,
      packId: pack.id,
      startedAt: new Date().toISOString(),
      emailsScanned: 0,
      status: 'running',
      output: {
        proposedConfig: {
          sources: [],
          keywords: [],
          platforms: [],
          suggestedLabels: [],
        },
        evidence: [],
        stats: {
          totalEmailsScanned: 0,
          relevantEmailsFound: 0,
          uniqueSendersFound: 0,
          uniqueDomainsFound: 0,
          icsAttachmentsFound: 0,
          averageConfidence: 0,
        },
      },
    };

    await this.db.insertDiscoverySession(session);

    this.logger.info('DiscoveryEngine', 'discovery_started', {
      sessionId,
      packId: pack.id,
      lookbackDays,
    });

    try {
      // Detect which mode to use - check USER config, not pack defaults
      const hasConfiguredSources = userConfig?.sources && userConfig.sources.length > 0;
      
      // Extract fromDomains for logging
      const fromDomains: string[] = [];
      if (hasConfiguredSources) {
        for (const source of userConfig.sources) {
          if (source.fromDomains) {
            fromDomains.push(...source.fromDomains);
          }
        }
      }
      
      // Build query - either targeted (Mode A) or anchored (Mode B)
      const query = this.buildDiscoveryQuery(pack, lookbackDays, hasConfiguredSources, userConfig);
      const discoveryMode = hasConfiguredSources ? 'targeted' : 'anchored';

      // === DIAGNOSTIC LOGGING #1: Query construction ===
      console.log('\n=== DISCOVERY DIAGNOSTIC ===');
      console.log(`TARGETED MODE: ${hasConfiguredSources}`);
      console.log(`FROM DOMAINS: ${JSON.stringify(fromDomains)}`);
      console.log(`FINAL QUERY: ${query}`);

      // Fetch messages
      const messageIds = await this.gmail.listMessages(query, 500);
      
      // === DIAGNOSTIC LOGGING #2: Gmail response ===
      console.log(`\nGMAIL RESPONSE:`);
      console.log(`MESSAGE COUNT: ${messageIds.length}`);
      console.log(`FIRST 10 MESSAGE IDS: ${messageIds.slice(0, 10).join(', ')}`);

      session.emailsScanned = messageIds.length;

      this.logger.info('DiscoveryEngine', 'messages_fetched', {
        sessionId,
        count: messageIds.length,
        mode: discoveryMode,
      });

      // Analyze messages
      const evidence: Evidence[] = [];
      const senderMap = new Map<string, number>();
      const domainMap = new Map<string, number>();
      const keywordMap = new Map<string, number>();
      const platformMap = new Map<string, string[]>();
      const relayDomainMap = new Map<string, number>(); // Track relay/platform domains
      let icsCount = 0;

      // Initialize person assigner once (reuse for all 500 messages)
      const personAssigner = createPersonAssignerFromConfig(userConfig);
      const PERSON_ASSIGNMENT_ENABLED = process.env.PERSON_ASSIGNMENT_ENABLED !== 'false';

      // === METRICS TRACKING ===
      const allMessageScores = new Map<string, number>(); // messageId -> score
      const rejectionReasons = new Map<string, string[]>(); // reason -> [messageIds]
      rejectionReasons.set('domain', []);
      rejectionReasons.set('keyword_no_match', []);
      rejectionReasons.set('low_score', []);
      rejectionReasons.set('duplicate', []);
      rejectionReasons.set('other', []);

      let processedCount = 0;
      let skippedCount = 0;

      for (const messageId of messageIds) {
        const msgNum = processedCount + skippedCount + 1;
        const totalMsgs = messageIds.length;
        
        try {
          // === STEP 1: GET MESSAGE WITH TIMEOUT ===
          const message = await withTimeoutAndLog(
            `[${msgNum}/${totalMsgs}] getMessage`,
            this.gmail.getMessage(messageId),
            15000
          );
          
          if (!message) {
            console.log(`   ⊘ Message not found (deleted?)`);
            skippedCount++;
            continue;
          }

          const from = this.gmail.getHeader(message, 'from') || '';
          const subject = this.gmail.getHeader(message, 'subject') || '';
          const date = this.gmail.getHeader(message, 'date') || '';

          // Extract domain
          const domain = this.extractDomain(from);
          if (domain) {
            domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
          }

          // Count senders
          senderMap.set(from, (senderMap.get(from) || 0) + 1);

          // === STEP 2: GET ATTACHMENTS WITH TIMEOUT ===
          const attachments = await withTimeoutAndLog(
            `[${msgNum}/${totalMsgs}] getAttachments`,
            this.gmail.getAttachments(message),
            15000
          );
          
          const hasIcs = attachments.some(
            (a) => a.mimeType === 'text/calendar' || a.filename.endsWith('.ics')
          );
          if (hasIcs) icsCount++;

          // Detect platforms
          const platform = this.detectPlatform(message, pack);
          if (platform) {
            if (!platformMap.has(platform)) {
              platformMap.set(platform, []);
            }
            platformMap.get(platform)!.push(messageId);
          }

          // Extract keywords from subject/body
          const body = this.gmail.getBody(message);
          const text = `${subject} ${body.text || ''}`;
          this.extractKeywords(text, pack, keywordMap);

          // Create evidence - calculate relevance with ICS boost
          const relevanceDetails = this.calculateRelevanceWithDetails(message, pack, fromDomains);
          let relevanceScore = relevanceDetails.score;
          
          // ICS attachment is STRONG signal - boost score significantly
          if (hasIcs && relevanceScore > 0) {
            relevanceScore = Math.min(1.0, relevanceScore + 0.3); // +30% for ICS
          } else if (hasIcs) {
            // ICS alone makes it relevant even if no other signals
            relevanceScore = 0.8;
          }
          
          // === METRICS: Track all scores ===
          allMessageScores.set(messageId, relevanceScore);
          
          // === RELAY DOMAIN DETECTION ===
          // If email is relevant AND domain is not in configured sources, track as relay candidate
          if (relevanceScore > 0 && domain && fromDomains && !fromDomains.some(d => {
            const pattern = d.replace(/\*/g, '');
            return domain.includes(pattern);
          })) {
            relayDomainMap.set(domain, (relayDomainMap.get(domain) || 0) + 1);
          }
          
          console.log(`   Score: ${relevanceScore.toFixed(2)} | From: ${from} | Subj: ${subject.substring(0, 40)}`);
          
          // === CATEGORIZATION ===
          // Classify email into categories (no new LLM calls)
          const categoryPrefs = pack.categoryPreferences || DEFAULT_CATEGORY_PREFERENCES;
          const classifier = new CategoryClassifier();
          const categorization = classifier.categorize(subject, from, body.text || '', categoryPrefs);

          // Decision: Flag for approval if:
          // 1. Old model: relevanceScore > 0, OR
          // 2. New model: email passes category thresholds
          const shouldFlag = relevanceScore > 0 || categorization.shouldSave;

          if (shouldFlag) {
            const evidenceId = uuidv4();
            evidence.push({
              id: evidenceId,
              messageId,
              subject,
              from,
              date,
              snippet: message.snippet || '',
              relevanceScore,
              matchedRules: [], // TODO: track which rules matched
            });

            // === ALSO ADD TO PENDING APPROVALS FOR DASHBOARD ===
            // Extract from display name if present
            const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || from.match(/^(.+)$/);
            const fromEmail = fromMatch?.[2] || fromMatch?.[1] || from;
            const fromName = fromMatch?.[1] || undefined;

            // Assign to a family member if possible (with logging to track hangs)
            console.log(`   [${msgNum}/${totalMsgs}] before assignPerson`);
            let personAssignment: any = { person: 'Family/Shared', reason: 'shared_default' };
            
            if (PERSON_ASSIGNMENT_ENABLED) {
              const tAssign = Date.now();
              try {
                // Pass body text for better refinement when multiple kids are assigned via source rules
                personAssignment = personAssigner.assign(subject, (message.snippet || '').slice(0, 500), fromEmail, fromName, (body.text || '').slice(0, 2000));
                const durAssign = Date.now() - tAssign;
                console.log(`   [${msgNum}/${totalMsgs}] after assignPerson (${durAssign}ms) → ${personAssignment.person}`);
              } catch (assignError) {
                console.error(`   [${msgNum}/${totalMsgs}] assignPerson threw error:`, assignError);
                personAssignment = { person: 'Family/Shared', reason: 'error_fallback' };
              }
            } else {
              console.log(`   [${msgNum}/${totalMsgs}] assignPerson disabled (PERSON_ASSIGNMENT_ENABLED=false)`);
            }

            // Classify email using AI (if available)
            let classification: {
              itemType: 'obligation' | 'announcement';
              obligationDate: string | null;
              confidence: number;
              reasoning: string;
            } = {
              itemType: 'announcement',
              obligationDate: null,
              confidence: 0.5,
              reasoning: 'No AI classifier available',
            };

            if (this.emailClassifier) {
              console.log(`   [${msgNum}/${totalMsgs}] before AI classification`);
              const tClassify = Date.now();
              try {
                classification = await this.emailClassifier.classifyEmail({
                  subject,
                  snippet: message.snippet || '',
                  fromName,
                  fromEmail,
                  bodyText: body.text,
                  bodyHtml: body.html,
                });
                const durClassify = Date.now() - tClassify;
                console.log(`   [${msgNum}/${totalMsgs}] after AI classification (${durClassify}ms) → ${classification.itemType}${classification.obligationDate ? ` on ${classification.obligationDate}` : ''}`);
              } catch (classifyError) {
                console.error(`   [${msgNum}/${totalMsgs}] AI classification error:`, classifyError);
              }
            }

            console.log(`   [${msgNum}/${totalMsgs}] before insertPendingApproval`);
            const tDb = Date.now();

            await this.db.insertPendingApproval({
              id: evidenceId,
              messageId,
              packId: pack.id,
              relevanceScore,
              fromEmail,
              fromName,
              subject,
              snippet: message.snippet || '',
              primaryCategory: categorization.primaryCategory,
              secondaryCategories: categorization.secondaryCategories,
              categoryScores: categorization.categoryScores,
              saveReasons: categorization.saveReasons,
              person: personAssignment.person,
              assignmentReason: personAssignment.reason,
              emailBodyText: body.text || '',
              emailBodyHtml: body.html || '',
              itemType: classification.itemType,
              obligationDate: classification.obligationDate,
              classificationConfidence: classification.confidence,
              classificationReasoning: classification.reasoning,
            });

            const durDb = Date.now() - tDb;
            console.log(`   [${msgNum}/${totalMsgs}] after insertPendingApproval (${durDb}ms)`);
          }
          processedCount++;
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`   ❌ SKIPPED: ${errorMsg}`);
          skippedCount++;
          
          // If it's a timeout, we need to track it so we can report it
          if (errorMsg.includes('TIMEOUT')) {
            console.error(`   🔴 CRITICAL: Message processing timeout on message ${msgNum}/${totalMsgs}`);
            console.error(`   This message will be skipped and discovery will continue...`);
          }
          
          // Continue to next message on any error
          continue;
        }
      }

      // Build proposed config
      const proposedSources = this.buildProposedSources(domainMap, senderMap, evidence);
      
      // Add relay domains as proposed sources (normalized by platform)
      const relaySourceProposals = this.buildRelayDomainProposals(relayDomainMap);
      const allProposedSources = [...proposedSources, ...relaySourceProposals];
      
      const proposedKeywords = this.buildProposedKeywords(keywordMap, evidence);
      const detectedPlatforms = this.buildDetectedPlatforms(platformMap);

      session.output = {
        proposedConfig: {
          sources: allProposedSources,
          keywords: proposedKeywords,
          platforms: detectedPlatforms,
          suggestedLabels: [`${pack.name}/Discovered`],
        },
        evidence,
        stats: {
          totalEmailsScanned: messageIds.length,
          relevantEmailsFound: evidence.length,
          uniqueSendersFound: senderMap.size,
          uniqueDomainsFound: domainMap.size,
          icsAttachmentsFound: icsCount,
          averageConfidence:
            evidence.reduce((sum, e) => sum + e.relevanceScore, 0) / evidence.length || 0,
        },
      };

      session.completedAt = new Date().toISOString();
      session.status = 'completed';

      await this.db.updateDiscoverySession(sessionId, session);

      // Log summary
      console.log(`\n📊 Discovery Summary:`);
      console.log(`   Messages Processed: ${processedCount}`);
      console.log(`   Messages Skipped: ${skippedCount}`);
      console.log(`   Success Rate: ${((processedCount / (processedCount + skippedCount)) * 100).toFixed(1)}%`);
      console.log(`   Evidence Found: ${evidence.length}`);
      console.log(`   Unique Senders: ${senderMap.size}`);
      console.log(`   Unique Domains: ${domainMap.size}`);
      console.log(`   ICS Attachments: ${icsCount}`);

      this.logger.info('DiscoveryEngine', 'discovery_completed', {
        sessionId,
        stats: session.output.stats,
      });

      // === RECORD METRICS ===
      // TODO: This tracks volume, histogram, rejection reasons, and samples rejected emails
      // Disabled temporarily as sampleRejectedEmails makes too many sequential Gmail API calls
      // await this.recordDiscoveryMetrics(
      //   sessionId,
      //   pack.id,
      //   messageIds,
      //   allMessageScores,
      //   rejectionReasons
      // );

      return session;
    } catch (error) {
      session.status = 'failed';
      await this.db.updateDiscoverySession(sessionId, { status: 'failed' });

      this.logger.error('DiscoveryEngine', 'discovery_failed', { sessionId }, error as Error);

      throw error;
    }
  }

  private buildDiscoveryQuery(pack: Pack, lookbackDays: number, isTargetedMode: boolean, userConfig?: any): string {
    const date = new Date();
    date.setDate(date.getDate() - lookbackDays);
    const dateFilter = `after:${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    
    // NEW STRATEGY: Relevance-gated discovery
    // Always use keyword-only search. Domain filtering happens in scoring, not in Gmail query.
    // This allows us to catch emails from unexpected senders that still match our criteria.
    
    // Extract keywords for search (typically child/family names)
    const anchors: string[] = [];
    if (userConfig?.sources) {
      for (const source of userConfig.sources) {
        if (source.keywords) {
          // Take first 3-5 keywords (usually names like "Colin", "Henry", "Fitzgerald")
          anchors.push(...source.keywords.slice(0, 5));
        }
      }
    }
    
    if (anchors.length > 0) {
      const anchorQuery = anchors
        .map(a => `"${a}"`)
        .join(' OR ');
      const finalQuery = `${dateFilter} (${anchorQuery})`;
      console.log(`RELEVANCE-GATED DISCOVERY: Using keyword-only search (domains are scoring features, not gates)`);
      console.log(`Keywords: ${anchors.join(', ')}`);
      return finalQuery;
    }
    
    // Fallback: just date range (scan everything)
    return dateFilter;
  }

  private extractDomain(email: string): string | null {
    const match = email.match(/@([a-zA-Z0-9.-]+)/);
    return match ? match[1] : null;
  }

  private detectPlatform(message: GmailMessage, pack: Pack): string | null {
    for (const detector of pack.discoveryRules.platformDetectors) {
      const from = this.gmail.getHeader(message, 'from') || '';

      // Check domains
      if (detector.indicators.domains) {
        for (const domain of detector.indicators.domains) {
          if (from.includes(domain)) {
            return detector.name;
          }
        }
      }

      // Check headers
      if (detector.indicators.headers) {
        for (const [key, value] of Object.entries(detector.indicators.headers)) {
          const header = this.gmail.getHeader(message, key);
          if (header?.includes(value)) {
            return detector.name;
          }
        }
      }
    }

    return null;
  }

  private extractKeywords(text: string, pack: Pack, keywordMap: Map<string, number>): void {
    const normalized = text.toLowerCase();

    for (const keywordSet of pack.discoveryRules.keywordSets) {
      for (const keyword of keywordSet.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          keywordMap.set(keyword, (keywordMap.get(keyword) || 0) + 1);
        }
      }
    }
  }

  private calculateRelevance(message: GmailMessage, pack: Pack, configuredFromDomains?: string[]): number {
    // THREE-STAGE MODEL: Scoring with domain bias (not gate)
    // Stage 1: Relevance gate (OR logic) - if ANY strong signal exists, it's relevant
    // Stage 2: Domain scoring - boost known domains, penalize unknown (but don't exclude)
    // Stage 3: Confidence score (additive) - rank by evidence strength
    
    const from = this.gmail.getHeader(message, 'from') || '';
    const subject = this.gmail.getHeader(message, 'subject') || '';
    const text = `${subject} ${message.snippet}`.toLowerCase();
    
    // Extract email address from From header (handles both "Name <email@domain>" and "email@domain" formats)
    const emailMatch = from.match(/<(.+?)>/) || [, from];
    const emailAddress = emailMatch[1] || from;
    
    let rawScore = 0;
    let gateReasons: string[] = [];
    
    // === STAGE 1: RELEVANCE GATE (OR logic) ===
    
    // Check 1: Trusted domain match (from configuredFromDomains parameter if provided)
    let configuredDomainMatched = false;
    if (configuredFromDomains && configuredFromDomains.length > 0) {
      for (const domain of configuredFromDomains) {
        // Handle wildcard patterns: *waterford*.org matches anything with waterford ending in .org
        let matches = false;
        if (domain.includes('*')) {
          // Convert wildcard pattern to regex: *waterford*.org → .*waterford.*\.org
          const regexPattern = '^' + domain.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
          matches = new RegExp(regexPattern).test(emailAddress.toLowerCase());
        } else {
          // Exact domain match
          matches = emailAddress.toLowerCase().includes(domain.toLowerCase());
        }
        
        if (matches) {
          configuredDomainMatched = true;
          rawScore += 0.95; // High confidence for configured domains
          gateReasons.push(`config-domain:${domain}`);
          break;
        }
      }
    }
    
    // Check 1b: Display name match (for relay domains like "Waterford School <m@mail4.veracross.com>")
    // If the display name contains keywords from configured sources, treat it as matching
    if (!configuredDomainMatched && configuredFromDomains) {
      const displayNameMatch = from.match(/^([^<]+)/);
      const displayName = displayNameMatch ? displayNameMatch[1].trim().toLowerCase() : '';
      
      if (displayName) {
        for (const domain of configuredFromDomains) {
          // Extract keywords from domain pattern (e.g., "waterford" from "*waterford*.org")
          const baseKeyword = domain.replace(/\*/g, '').replace(/\.[a-z]+/g, '').toLowerCase();
          if (baseKeyword && displayName.includes(baseKeyword)) {
            // Display name contains the configured domain keyword
            configuredDomainMatched = true;
            rawScore += 0.80; // High but slightly less confident than direct domain match
            gateReasons.push(`display-name:${baseKeyword}`);
            break;
          }
        }
      }
    }
    
    // DOMAIN PENALTY for unknown senders (relevance-gated model)
    // Unknown domains are NOT excluded, but penalized in score
    if (!configuredDomainMatched && configuredFromDomains && configuredFromDomains.length > 0) {
      rawScore -= 0.1; // Penalty for unknown domain (but not excluded)
      gateReasons.push('unknown-domain-penalty');
    }
    
    // Check 2: Known platform (SchoolLoop, ParentSquare, etc.)
    let platformMatched = false;
    let matchedGenericEdu = false;
    for (const pattern of pack.discoveryRules.senderPatterns) {
      // Skip generic .edu pattern if we already found configured domain
      if (configuredDomainMatched && pattern.pattern === '.edu') {
        continue;
      }
      
      if (pattern.type === 'domain' && from.toLowerCase().includes(pattern.pattern.toLowerCase())) {
        // Track if this is the generic .edu pattern
        if (pattern.pattern === '.edu') {
          matchedGenericEdu = true;
        }
        platformMatched = true;
        rawScore += 0.85; // High confidence for known platforms
        gateReasons.push(`platform:${pattern.pattern}`);
        break;
      }
    }
    
    // Check 3: Multiple high-signal keyword hits (action-required, event types)
    const eventKeywords = pack.discoveryRules.keywordSets
      .filter(ks => ks.category === 'event_types' || ks.category === 'action_required')
      .flatMap(ks => ks.keywords);
    
    let keywordHits = 0;
    let keywordScore = 0;
    const keywordCap = 0.6;
    
    for (const keyword of eventKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        keywordHits++;
        keywordScore = Math.min(keywordScore + 0.15, keywordCap);
      }
    }
    
    if (keywordHits >= 2) {
      rawScore += keywordScore;
      gateReasons.push(`keywords:${keywordHits}`);
    }
    
    // === STAGE 2: RELEVANCE GATE DECISION ===
    // If ANY strong signal matched, it's relevant
    const isRelevant = configuredDomainMatched || platformMatched || keywordHits >= 2;
    
    // Return 0 if not gated in, otherwise return confidence score
    if (!isRelevant) {
      return 0;
    }
    
    // Normalize to 0-1 range, but keep penalties in place
    const confidence = Math.max(0, Math.min(1.0, rawScore));
    
    return confidence;
  }

  private calculateRelevanceWithDetails(message: GmailMessage, pack: Pack, configuredFromDomains?: string[]): { score: number; configuredDomainMatched: boolean } {
    // Same as calculateRelevance but returns details for relay domain detection
    const score = this.calculateRelevance(message, pack, configuredFromDomains);
    
    // Re-check if configured domain matched (for relay domain tracking)
    const from = this.gmail.getHeader(message, 'from') || '';
    
    // Extract email address from From header (handles both "Name <email@domain>" and "email@domain" formats)
    const emailMatch = from.match(/<(.+?)>/) || [, from];
    const emailAddress = emailMatch[1] || from;
    
    let configuredDomainMatched = false;
    
    if (configuredFromDomains && configuredFromDomains.length > 0) {
      for (const domain of configuredFromDomains) {
        // Handle wildcard patterns: *waterford*.org matches anything with waterford ending in .org
        let matches = false;
        if (domain.includes('*')) {
          // Convert wildcard pattern to regex: *waterford*.org → .*waterford.*\.org
          const regexPattern = '^' + domain.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
          matches = new RegExp(regexPattern).test(emailAddress.toLowerCase());
        } else {
          // Exact domain match
          matches = emailAddress.toLowerCase().includes(domain.toLowerCase());
        }
        
        if (matches) {
          configuredDomainMatched = true;
          break;
        }
      }
    }
    
    return { score, configuredDomainMatched };
  }

  private buildRelayDomainProposals(relayDomainMap: Map<string, number>): ProposedSource[] {
    const proposals: ProposedSource[] = [];
    
    // Normalize relay domains by platform base domain
    const platformGroups = new Map<string, { domains: string[]; count: number }>();
    
    for (const [domain, count] of relayDomainMap.entries()) {
      // Extract base domain (e.g., "veracross.com" from "mail3.veracross.com")
      const parts = domain.split('.');
      const baseKey = parts.length >= 2 ? parts.slice(-2).join('.') : domain;
      
      if (!platformGroups.has(baseKey)) {
        platformGroups.set(baseKey, { domains: [], count: 0 });
      }
      
      const group = platformGroups.get(baseKey)!;
      group.domains.push(domain);
      group.count += count;
    }
    
    // Create proposals, preferring wildcards for platforms with multiple instances
    for (const [baseKey, { domains, count }] of platformGroups.entries()) {
      const domainPattern = domains.length > 1 ? `*.${baseKey}` : domains[0];
      proposals.push({
        suggested: true,
        name: domainPattern,
        type: 'email',
        fromDomains: [domainPattern],
        confidence: Math.min(1.0, 0.7 + (count * 0.1)), // Platform relay gets 0.7-0.9 confidence
        evidenceIds: [],
        userApproved: false,
      });
    }
    
    // Sort by count descending
    return proposals.sort((a, b) => {
      const aCount = relayDomainMap.get(a.name.replace('*.', '')) || relayDomainMap.get(a.name) || 0;
      const bCount = relayDomainMap.get(b.name.replace('*.', '')) || relayDomainMap.get(b.name) || 0;
      return bCount - aCount;
    });
  }


  private buildProposedSources(
    domainMap: Map<string, number>,
    senderMap: Map<string, number>,
    evidence: Evidence[]
  ): ProposedSource[] {
    const sources: ProposedSource[] = [];

    // Propose top domains
    const sortedDomains = Array.from(domainMap.entries()).sort((a, b) => b[1] - a[1]);

    for (const [domain, count] of sortedDomains.slice(0, 10)) {
      const relatedEvidence = evidence.filter((e) => e.from.includes(domain));
      const confidence = Math.min(count / 10, 1.0); // Simple heuristic

      sources.push({
        suggested: true,
        name: domain,
        type: 'email',
        fromDomains: [domain],
        confidence,
        evidenceIds: relatedEvidence.map((e) => e.id),
        userApproved: false,
      });
    }

    return sources;
  }

  private buildProposedKeywords(
    keywordMap: Map<string, number>,
    evidence: Evidence[]
  ): ProposedKeyword[] {
    const keywords: ProposedKeyword[] = [];

    const sortedKeywords = Array.from(keywordMap.entries()).sort((a, b) => b[1] - a[1]);

    for (const [keyword, frequency] of sortedKeywords.slice(0, 20)) {
      const confidence = Math.min(frequency / 20, 1.0);

      keywords.push({
        keyword,
        category: 'auto_detected',
        frequency,
        confidence,
        evidenceIds: [], // TODO: link to specific evidence
        userApproved: false,
      });
    }

    return keywords;
  }

  private buildDetectedPlatforms(platformMap: Map<string, string[]>): DetectedPlatform[] {
    return Array.from(platformMap.entries()).map(([name, messageIds]) => ({
      name,
      confidence: Math.min(messageIds.length / 10, 1.0),
      exampleMessageIds: messageIds.slice(0, 3),
    }));
  }

  /**
   * Record discovery metrics after a run completes
   * Tracks: volume, histogram, rejection reasons, and sampled rejected emails
   */
  private async recordDiscoveryMetrics(
    sessionId: string,
    packId: string,
    allMessageIds: string[],
    flaggedScores: Map<string, number>,
    rejectionReasons: Map<string, string[]>
  ): Promise<void> {
    const runStats = {
      id: uuidv4(),
      sessionId,
      packId,
      runTimestamp: new Date().toISOString(),
      scannedCount: allMessageIds.length,
      scoredCount: allMessageIds.length,
      flaggedCount: Array.from(flaggedScores.values()).filter(s => s > 0).length,
      sampledForReview: 0,
      histogramVeryLow: 0,
      histogramLow: 0,
      histogramMedium: 0,
      histogramHigh: 0,
      histogramVeryHigh: 0,
      rejectionReasonDomain: 0,
      rejectionReasonKeywordNoMatch: 0,
      rejectionReasonLowScore: 0,
      rejectionReasonDuplicate: 0,
      rejectionReasonOther: 0,
    };

    // Build histogram from all scored messages
    for (const [messageId, score] of flaggedScores.entries()) {
      if (score < 0.2) runStats.histogramVeryLow++;
      else if (score < 0.4) runStats.histogramLow++;
      else if (score < 0.6) runStats.histogramMedium++;
      else if (score < 0.8) runStats.histogramHigh++;
      else runStats.histogramVeryHigh++;
    }

    // Count rejection reasons
    for (const [reason, messageIds] of rejectionReasons.entries()) {
      const count = messageIds.length;
      if (reason === 'domain') runStats.rejectionReasonDomain = count;
      else if (reason === 'keyword_no_match') runStats.rejectionReasonKeywordNoMatch = count;
      else if (reason === 'low_score') runStats.rejectionReasonLowScore = count;
      else if (reason === 'duplicate') runStats.rejectionReasonDuplicate = count;
      else runStats.rejectionReasonOther = count;
    }

    // Insert run stats
    await this.db.insertDiscoveryRunStats(runStats);

    // Sample rejected emails (those that didn't meet threshold)
    await this.sampleRejectedEmails(sessionId, packId, flaggedScores, rejectionReasons);
  }

  /**
   * Sample just-below-threshold emails for later review
   * Strategy: top 20 near-threshold (0.50-0.70) + up to 10 random weak samples
   * Helps identify false negatives without manual review of all rejected emails
   */
  private async sampleRejectedEmails(
    sessionId: string,
    packId: string,
    allScores: Map<string, number>,
    rejectionReasons: Map<string, string[]>
  ): Promise<void> {
    // Default threshold is 0.75
    const FLAGGED_THRESHOLD = 0.75;
    const NEAR_THRESHOLD_RANGE = [0.50, 0.70]; // Near but below threshold
    const WEAK_SIGNAL_RANGE = [0.30, 0.50];
    const VERY_WEAK_RANGE = [0.10, 0.30];

    // Separate rejected emails into buckets
    const nearThreshold: [string, number][] = [];
    const weakSignal: [string, number][] = [];
    const veryWeak: [string, number][] = [];

    for (const [messageId, score] of allScores.entries()) {
      if (score >= FLAGGED_THRESHOLD) continue; // Skip flagged emails

      if (score >= NEAR_THRESHOLD_RANGE[0] && score < NEAR_THRESHOLD_RANGE[1]) {
        nearThreshold.push([messageId, score]);
      } else if (score >= WEAK_SIGNAL_RANGE[0] && score < WEAK_SIGNAL_RANGE[1]) {
        weakSignal.push([messageId, score]);
      } else if (score >= VERY_WEAK_RANGE[0] && score < VERY_WEAK_RANGE[1]) {
        veryWeak.push([messageId, score]);
      }
    }

    // Sort by score descending (closest to threshold first)
    nearThreshold.sort((a, b) => b[1] - a[1]);
    weakSignal.sort((a, b) => b[1] - a[1]);
    veryWeak.sort((a, b) => b[1] - a[1]);

    // Build sample list: top 20 near-threshold + 5 random weak + 5 random very weak
    const sampleList: [string, number, string][] = [];

    // Add top 20 near-threshold
    for (const [messageId, score] of nearThreshold.slice(0, 20)) {
      sampleList.push([messageId, score, 'near_threshold']);
    }

    // Add random weak samples
    const randomWeak = this.sampleRandomFromArray(weakSignal, 5);
    for (const [messageId, score] of randomWeak) {
      sampleList.push([messageId, score, 'weak_signal']);
    }

    // Add random very weak samples
    const randomVeryWeak = this.sampleRandomFromArray(veryWeak, 5);
    for (const [messageId, score] of randomVeryWeak) {
      sampleList.push([messageId, score, 'very_weak']);
    }

    // Fetch message details and insert samples into database
    for (const [messageId, score, category] of sampleList) {
      try {
        const message = await this.gmail.getMessage(messageId);
        if (!message) continue;

        const from = this.gmail.getHeader(message, 'from') || '';
        const subject = this.gmail.getHeader(message, 'subject') || '';

        // Extract from display name if present
        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || from.match(/^(.+)$/);
        const fromEmail = fromMatch?.[2] || fromMatch?.[1] || from;
        const fromName = fromMatch?.[1] || undefined;

        // Determine rejection reason
        const reasons = rejectionReasons.get(messageId) || ['other'];
        const rejectionReason = reasons[0];

        // Insert sample (expires in 30 days)
        await this.db.insertDiscoveryRejectedSample({
          id: uuidv4(),
          sessionId,
          messageId,
          fromEmail,
          fromName,
          subject,
          snippet: message.snippet || '',
          relevanceScore: score,
          sampleCategory: category,
          rejectionReason,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (error) {
        this.logger.warn('DiscoveryEngine', 'sample_fetch_failed', { messageId, error: String(error) });
      }
    }
  }

  /**
   * Randomly sample up to N items from an array
   */
  private sampleRandomFromArray<T>(array: T[], n: number): T[] {
    if (array.length <= n) return array;
    const result: T[] = [];
    const indices = new Set<number>();
    while (indices.size < n) {
      indices.add(Math.floor(Math.random() * array.length));
    }
    return Array.from(indices).map(i => array[i]);
  }
}
