/**
 * Web Server - Dashboard and approval endpoints
 * 
 * Serves the parent dashboard, approval links, and configuration UI
 * Runs on port 5000 (separate from OAuth on 3000)
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseClient } from '../database/client.js';
import { DigestBuilder } from '../core/digest-builder.js';
import { EmailSender } from '../core/email-sender.js';
import { GmailConnector } from '../core/gmail-connector.js';
import { ChatHandler, ChatConfig } from '../core/chat-handler.js';
import { AISummaryGenerator, SummaryConfig } from '../core/summary-generator-ai.js';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CATEGORY_PREFERENCES, AgentConfig } from '../types/index.js';
import { generateDashboardV2HTML } from './dashboard-v2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to safely extract string params (Express 5 types params as string | string[])
function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

interface ApprovalSession {
  id: string;
  messageId: string;
  parentEmail: string;
  packId: string;
  createdAt: string;
  approvedAt?: string;
  action?: 'approve' | 'reject';
}

export class WebServer {
  private app: express.Application;
  private port: number;
  private db: DatabaseClient;
  private digestBuilder: DigestBuilder;
  private emailSender: EmailSender;
  private gmail?: GmailConnector;
  private agentConfig?: AgentConfig;
  private chatHandler?: ChatHandler;
  private summaryGenerator?: AISummaryGenerator;
  private approvalSessions = new Map<string, ApprovalSession>();

  constructor(
    db: DatabaseClient,
    digestBuilder: DigestBuilder,
    emailSender: EmailSender,
    port: number = 5000,
    gmail?: GmailConnector,
    agentConfig?: AgentConfig,
    chatConfig?: ChatConfig
  ) {
    this.app = express();
    this.port = port;
    this.db = db;
    this.digestBuilder = digestBuilder;
    this.emailSender = emailSender;
    this.gmail = gmail;
    this.agentConfig = agentConfig;

    // Initialize chat handler if configured
    if (chatConfig?.enabled && gmail && agentConfig) {
      try {
        this.chatHandler = new ChatHandler(chatConfig, db, gmail, agentConfig);
        console.log('💬 Chat handler initialized');
      } catch (error) {
        console.warn('⚠️ Chat handler not initialized:', (error as Error).message);
      }
    }

    // Initialize AI summary generator if API key available
    if (chatConfig?.apiKey) {
      try {
        this.summaryGenerator = new AISummaryGenerator(
          { apiKey: chatConfig.apiKey, model: chatConfig.model },
          db
        );
        console.log('📊 AI Summary generator initialized');
      } catch (error) {
        console.warn('⚠️ Summary generator not initialized:', (error as Error).message);
      }
    }

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Static files
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // CORS for dashboard requests
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  private setupRoutes() {
    // Dashboard home
    this.app.get('/', async (req: Request, res: Response) => {
      res.send(await this.dashboardPage());
    });

    // API: Get pending emails
    this.app.get('/api/pending', async (_req: Request, res: Response) => {
      try {
        // Get pending approvals from database (default to 'school' pack for now)
        const pending = await this.db.getPendingApprovals('school');
        
        // Format for dashboard display
        const formatted = pending.map((approval: any) => ({
          id: approval.id,
          messageId: approval.message_id,
          packId: approval.pack_id,
          relevanceScore: approval.relevance_score,
          fromEmail: approval.from_email,
          fromName: approval.from_name,
          subject: approval.subject,
          snippet: approval.snippet,
          createdAt: approval.created_at,
          person: approval.person,
        }));

        res.json({
          pending: formatted,
          total: formatted.length,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending emails' });
      }
    });

    // API: Get deferred items (pending without action, excluding newsletters)
    this.app.get('/api/deferred', async (_req: Request, res: Response) => {
      try {
        const pending = await this.db.getPendingApprovals('school');
        // Filter out newsletters - they belong in Weekly Catch-Up, not Needs Your Attention
        const deferred = pending.filter((item: any) =>
          !item.approved &&
          (!item.action || item.action === '') &&
          item.primary_category !== 'newsletter'
        );

        const formatted = deferred.map((item: any) => {
          const createdAt = new Date(item.created_at);
          const now = new Date();
          const daysPending = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          const escalated = daysPending >= 7;

          return {
            id: item.id,
            subject: item.subject,
            fromEmail: item.from_email,
            fromName: item.from_name,
            snippet: item.snippet,
            person: item.person,
            daysPending,
            escalated,
            symbol: escalated ? '🚨' : '?',
            stateExplanation: escalated
              ? `URGENT: Pending for ${daysPending} days. Missing complete information.`
              : `Pending for ${daysPending} day(s). Missing complete information to create calendar event.`,
            createdAt: item.created_at,
          };
        });

        res.json(formatted);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch deferred items' });
      }
    });

    // API: Get dismissed items (last 7 days)
    this.app.get('/api/dismissed', async (_req: Request, res: Response) => {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const dismissed = await this.db.getDismissedItems(sevenDaysAgo);

        const formatted = dismissed.map((item: any) => ({
          id: item.id,
          subject: item.original_subject,
          fromEmail: item.original_from,
          person: item.person,
          reason: item.reason,
          dismissedAt: item.dismissed_at,
          dismissedBy: item.dismissed_by,
        }));

        res.json(formatted);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dismissed items' });
      }
    });

    // API: Dismiss an item
    this.app.post('/api/dismiss', async (req: Request, res: Response) => {
      try {
        const { itemId, reason } = req.body;

        if (!itemId || !reason) {
          return res.status(400).json({ error: 'Item ID and reason required' });
        }

        // Get item details
        const item = await this.db.getPendingApprovalById(itemId);
        if (!item) {
          return res.status(404).json({ error: 'Item not found' });
        }

        // Dismiss the item
        await this.db.dismissItem(itemId, reason, {
          itemType: 'pending_approval',
          originalSubject: item.subject,
          originalFrom: item.from_email,
          originalDate: item.discovered_at,
          person: item.person,
          packId: item.pack_id,
        });

        // Delete from pending approvals
        await this.db.deletePendingApproval(itemId);

        return res.json({ success: true, message: 'Item dismissed successfully' });
      } catch (error) {
        return res.status(500).json({ error: 'Failed to dismiss item' });
      }
    });

    // API: Reclassify an item (e.g., mark as newsletter)
    this.app.post('/api/pending/:id/classify', async (req: Request, res: Response): Promise<void> => {
      try {
        const id = getParam(req.params.id);
        const { category } = req.body;

        if (!category) {
          res.status(400).json({ error: 'Category is required' });
          return;
        }

        // Get item details
        const item = await this.db.getPendingApprovalById(id);
        if (!item) {
          res.status(404).json({ error: 'Item not found' });
          return;
        }

        // Update the category
        await this.db.execute(
          'UPDATE pending_approvals SET primary_category = ? WHERE id = ?',
          [category, id]
        );

        res.json({ success: true, message: `Item reclassified as ${category}` });
      } catch (error) {
        console.error('[API] Error reclassifying item:', error);
        res.status(500).json({ error: 'Failed to reclassify item' });
      }
    });

    // Approve email via token
    this.app.get('/approve/:token', async (req: Request, res: Response): Promise<void> => {
      try {
        const token = getParam(req.params.token);
        const approval = await this.db.getPendingApprovalById(token);

        if (!approval) {
          res.status(404).send(this.errorPage('Approval link expired or invalid'));
          return;
        }

        if (approval.approved) {
          res.status(400).send(this.errorPage('This email has already been approved'));
          return;
        }

        // Mark as approved in database
        const now = new Date().toISOString();
        await this.db.updatePendingApproval(token, {
          approved: true,
          approvedAt: now,
          action: 'approve',
        });

        // Trigger digest building and sending for this pack
        this.buildAndSendDigest(approval.pack_id).catch(error => {
          console.error('Failed to send digest:', error);
        });

        res.send(this.successPage('Email approved! Your digest is being prepared...'));
      } catch (error) {
        res.status(500).send(this.errorPage('Error processing approval'));
      }
    });

    // Reject email via token
    this.app.get('/reject/:token', async (req: Request, res: Response): Promise<void> => {
      try {
        const token = getParam(req.params.token);
        const approval = await this.db.getPendingApprovalById(token);

        if (!approval) {
          res.status(404).send(this.errorPage('Rejection link expired or invalid'));
          return;
        }

        if (approval.approved) {
          res.status(400).send(this.errorPage('This email has already been processed'));
          return;
        }

        // Mark as rejected in database
        const now = new Date().toISOString();
        await this.db.updatePendingApproval(token, {
          approved: false,
          approvedAt: now,
          action: 'reject',
        });

        res.send(this.successPage('Email rejected. Removed from digest.'));
      } catch (error) {
        res.status(500).send(this.errorPage('Error processing rejection'));
      }
    });

    // Config API: Get current config
    this.app.get('/api/config', (_req: Request, res: Response) => {
      try {
        // Load from agent-config.yaml
        const _config = require('../../config/agent-config');
        res.json(_config);
      } catch (error) {
        res.status(500).json({ error: 'Failed to load configuration' });
      }
    });

    // Config API: Save updated config
    this.app.post('/api/config', (req: Request, res: Response) => {
      try {
        const { config } = req.body;

        // TODO: Validate and save config
        // This would write back to agent-config.yaml or database

        res.json({ success: true, message: 'Configuration saved' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to save configuration' });
      }
    });

    // Metrics API: Mark an email as false negative (missed by discovery)
    this.app.post('/api/mark-missed', async (req: Request, res: Response) => {
      try {
        const { messageId, packId, fromEmail, fromName, subject, snippet, reason } = req.body;

        if (!messageId || !packId) {
          res.status(400).json({ error: 'Missing messageId or packId' });
          return;
        }

        // Insert into discovery_false_negatives table
        await this.db.insertDiscoveryFalseNegative({
          id: uuidv4(),
          messageId,
          packId,
          fromEmail,
          fromName,
          subject,
          snippet,
          reason: reason || 'user_marked',
        });

        res.json({ success: true, message: 'Email marked as missed (false negative)' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to mark email as missed' });
      }
    });

    // Metrics API: Get discovery metrics for a pack
    this.app.get('/api/discovery-metrics/:packId', async (req: Request, res: Response) => {
      try {
        const packId = getParam(req.params.packId);

        // Get latest run stats
        const runStats = await this.db.getDiscoveryRunStats(packId, 1);
        const latestRun = runStats.length > 0 ? runStats[0] : null;

        // Get false negatives count
        const falseNegatives = await this.db.getDiscoveryFalseNegatives(packId);

        if (!latestRun) {
          res.json({
            packId,
            hasData: false,
            message: 'No discovery metrics yet',
          });
          return;
        }

        // Calculate metrics
        const discoveryYield = latestRun.scanned_count > 0
          ? Math.round((latestRun.flagged_count / latestRun.scanned_count) * 1000) / 10
          : 0;

        const histogramTotal = latestRun.histogram_very_low +
          latestRun.histogram_low +
          latestRun.histogram_medium +
          latestRun.histogram_high +
          latestRun.histogram_very_high;

        const _approvalRate = latestRun.flagged_count > 0
          ? Math.round((latestRun.flagged_count / histogramTotal) * 1000) / 10
          : 0;

        res.json({
          packId,
          hasData: true,
          metrics: {
            lastRun: latestRun.run_timestamp,
            scanned: latestRun.scanned_count,
            flagged: latestRun.flagged_count,
            discoveryYield: `${discoveryYield}%`,
            sampledForReview: latestRun.sampled_for_review,
            falseNegativesCount: falseNegatives.length,
            histogram: {
              veryLow: latestRun.histogram_very_low,
              low: latestRun.histogram_low,
              medium: latestRun.histogram_medium,
              high: latestRun.histogram_high,
              veryHigh: latestRun.histogram_very_high,
            },
            rejectionReasons: {
              domain: latestRun.rejection_reason_domain,
              keywordNoMatch: latestRun.rejection_reason_keyword_no_match,
              lowScore: latestRun.rejection_reason_low_score,
              duplicate: latestRun.rejection_reason_duplicate,
              other: latestRun.rejection_reason_other,
            },
          },
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch discovery metrics' });
      }
    });

    // Category API: Get available categories and current preferences
    this.app.get('/api/categories/:packId', async (req: Request, res: Response) => {
      try {
        const packId = getParam(req.params.packId);

        // Get saved preferences or defaults
        const saved = await this.db.getCategoryPreferences(packId);
        const currentPreferences = saved || DEFAULT_CATEGORY_PREFERENCES;

        // List of available categories with descriptions
        const available = [
          {
            id: 'school',
            label: 'School',
            description: 'Classes, field trips, parent conferences, grades',
            default: true,
          },
          {
            id: 'sports_activities',
            label: 'Sports & Activities',
            description: 'Team practices, games, tournaments, sports schedules',
            default: true,
          },
          {
            id: 'medical_health',
            label: 'Medical & Health',
            description: 'Doctor appointments, vaccinations, health updates',
            default: true,
          },
          {
            id: 'logistics',
            label: 'Logistics & Travel',
            description: 'Carpool coordination, reservations, travel bookings',
            default: true,
          },
          {
            id: 'forms_admin',
            label: 'Forms & Admin',
            description: 'Permission slips, registration forms, deadlines',
            default: true,
          },
          {
            id: 'friends_social',
            label: 'Friends & Social',
            description: 'Playdates, birthday invitations, social events',
            default: false,
          },
          {
            id: 'financial_billing',
            label: 'Billing & Financial',
            description: 'Invoices, tuition payments, account statements',
            default: false,
          },
          {
            id: 'community_optional',
            label: 'Community Groups',
            description: 'PTA/PTO, church, scouts, neighborhood groups',
            default: false,
          },
        ];

        res.json({
          packId,
          available,
          currentPreferences,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
      }
    });

    // Category API: Save category preferences
    this.app.post('/api/categories/:packId', async (req: Request, res: Response) => {
      try {
        const packId = getParam(req.params.packId);
        const { enabled, sensitivity } = req.body;

        console.log(`[API] POST /api/categories/${packId}`, { enabled, sensitivity });

        if (!enabled || !sensitivity) {
          console.log('[API] Validation failed: missing fields');
          res.status(400).json({ error: 'Missing enabled or sensitivity fields' });
          return;
        }

        await this.db.saveCategoryPreferences(packId, { enabled, sensitivity });
        console.log(`[API] Preferences saved for ${packId}`);

        res.json({
          success: true,
          message: 'Category preferences saved',
          preferences: { enabled, sensitivity },
        });
      } catch (error) {
        console.error(`[API] Error saving preferences:`, error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Recipient Management API

    // GET /api/recipients - List all recipients
    this.app.get('/api/recipients', async (_req: Request, res: Response) => {
      try {
        const recipients = await this.db.getAllRecipients();
        res.json(recipients);
      } catch (error) {
        console.error('[API] Error fetching recipients:', error);
        res.status(500).json({ error: 'Failed to fetch recipients' });
      }
    });

    // POST /api/recipients - Add new recipient
    this.app.post('/api/recipients', async (req: Request, res: Response) => {
      try {
        const { email, name, receiveDigests, receiveForwarding, receiveErrors, receiveApprovals } = req.body;

        if (!email) {
          res.status(400).json({ error: 'Email is required' });
          return;
        }

        if (await this.db.recipientExists(email)) {
          res.status(400).json({ error: 'Recipient already exists' });
          return;
        }

        await this.db.addRecipient(email, name || '', {
          receiveDigests: receiveDigests ?? true,
          receiveForwarding: receiveForwarding ?? true,
          receiveErrors: receiveErrors ?? true,
          receiveApprovals: receiveApprovals ?? false,
        });

        res.json({ success: true, email });
      } catch (error) {
        console.error('[API] Error adding recipient:', error);
        res.status(500).json({ error: 'Failed to add recipient' });
      }
    });

    // PUT /api/recipients/:email - Update recipient preferences
    this.app.put('/api/recipients/:email', async (req: Request, res: Response) => {
      try {
        const email = getParam(req.params.email);
        const { name, receiveDigests, receiveForwarding, receiveErrors, receiveApprovals } = req.body;

        const preferences: any = {};
        if (name !== undefined) preferences.name = name;
        if (receiveDigests !== undefined) preferences.receiveDigests = receiveDigests;
        if (receiveForwarding !== undefined) preferences.receiveForwarding = receiveForwarding;
        if (receiveErrors !== undefined) preferences.receiveErrors = receiveErrors;
        if (receiveApprovals !== undefined) preferences.receiveApprovals = receiveApprovals;

        await this.db.updateRecipient(email, preferences);
        res.json({ success: true, email });
      } catch (error) {
        console.error('[API] Error updating recipient:', error);
        res.status(500).json({ error: 'Failed to update recipient' });
      }
    });

    // DELETE /api/recipients/:email - Delete recipient
    this.app.delete('/api/recipients/:email', async (req: Request, res: Response) => {
      try {
        const email = getParam(req.params.email);
        await this.db.deleteRecipient(email);
        res.json({ success: true, email });
      } catch (error) {
        console.error('[API] Error deleting recipient:', error);
        res.status(500).json({ error: 'Failed to delete recipient' });
      }
    });

    // POST /api/cache/clear - Clear summary cache
    this.app.post('/api/cache/clear', async (_req: Request, res: Response) => {
      try {
        await this.db.invalidateSummaryCache();
        console.log('[API] Summary cache cleared');
        res.json({ success: true, message: 'Summary cache cleared' });
      } catch (error) {
        console.error('[API] Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
      }
    });

    // GET /recipients-page - Recipient management UI
    this.app.get('/recipients-page', (_req: Request, res: Response) => {
      res.send(this.recipientManagementPage());
    });

    // GET /audit - Audit page (configuration verification and corrections)
    this.app.get('/audit', async (_req: Request, res: Response) => {
      res.send(await this.auditPage());
    });

    // ========================================
    // Smart Domain Discovery Endpoints
    // ========================================

    // GET /api/suggested-domains - Get pending domain suggestions
    this.app.get('/api/suggested-domains', async (req: Request, res: Response) => {
      try {
        const packId = (req.query.packId as string) || 'school';
        const suggestions = await this.db.getSuggestedDomains(packId, 'pending');

        const formatted = suggestions.map((s: any) => ({
          id: s.id,
          domain: s.domain,
          emailCount: s.email_count,
          matchedKeywords: JSON.parse(s.matched_keywords || '[]'),
          sampleSubjects: JSON.parse(s.sample_subjects || '[]'),
          confidence: s.confidence,
          firstSeenAt: s.first_seen_at,
          lastSeenAt: s.last_seen_at,
        }));

        res.json(formatted);
      } catch (error) {
        console.error('[API] Error fetching suggested domains:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
      }
    });

    // POST /api/suggested-domains/:id/approve - Approve a domain suggestion
    this.app.post('/api/suggested-domains/:id/approve', async (req: Request, res: Response) => {
      try {
        const id = getParam(req.params.id);

        // Get the suggestion
        const suggestion = await this.db.getSuggestedDomainById(id);
        if (!suggestion) {
          return res.status(404).json({ error: 'Suggestion not found' });
        }

        // Mark as approved in database
        await this.db.approveSuggestedDomain(id);

        // Note: Config update would be handled by DomainExplorer.approveDomain()
        // For now, just update the database status
        console.log(`[API] Domain approved: ${suggestion.domain} for pack ${suggestion.pack_id}`);

        return res.json({
          success: true,
          message: `Domain ${suggestion.domain} approved. Run exploration to add to config.`,
          domain: suggestion.domain
        });
      } catch (error) {
        console.error('[API] Error approving domain:', error);
        return res.status(500).json({ error: 'Failed to approve domain' });
      }
    });

    // POST /api/suggested-domains/:id/reject - Reject a domain suggestion
    this.app.post('/api/suggested-domains/:id/reject', async (req: Request, res: Response) => {
      try {
        const id = getParam(req.params.id);
        const { reason, permanent } = req.body;

        if (!reason) {
          return res.status(400).json({ error: 'Reason is required' });
        }

        // Get the suggestion first
        const suggestion = await this.db.getSuggestedDomainById(id);
        if (!suggestion) {
          return res.status(404).json({ error: 'Suggestion not found' });
        }

        // Reject with reason
        await this.db.rejectSuggestedDomain(id, reason, permanent ?? true);

        console.log(`[API] Domain rejected: ${suggestion.domain} - Reason: ${reason}`);

        return res.json({
          success: true,
          message: 'Domain rejected',
          domain: suggestion.domain
        });
      } catch (error) {
        console.error('[API] Error rejecting domain:', error);
        return res.status(500).json({ error: 'Failed to reject domain' });
      }
    });

    // GET /api/rejected-domains - Get rejected domains (for audit)
    this.app.get('/api/rejected-domains', async (req: Request, res: Response) => {
      try {
        const packId = (req.query.packId as string) || 'school';
        const rejected = await this.db.getRejectedDomains(packId);
        res.json(rejected);
      } catch (error) {
        console.error('[API] Error fetching rejected domains:', error);
        res.status(500).json({ error: 'Failed to fetch rejected domains' });
      }
    });

    // ========================================
    // Upcoming Events & Worth Reading Endpoints
    // ========================================

    // GET /api/upcoming - Get upcoming events and emails worth reading
    this.app.get('/api/upcoming', async (req: Request, res: Response) => {
      try {
        const days = parseInt(req.query.days as string) || 14;
        const summary = await this.digestBuilder.getUpcomingSummary(days);
        res.json(summary);
      } catch (error) {
        console.error('[API] Error fetching upcoming summary:', error);
        res.status(500).json({ error: 'Failed to fetch upcoming summary' });
      }
    });

    // POST /api/send-upcoming-digest - Email the upcoming summary to recipients
    this.app.post('/api/send-upcoming-digest', async (req: Request, res: Response) => {
      try {
        const days = parseInt(req.body.days as string) || 14;

        // Generate digest content
        const htmlContent = await this.digestBuilder.generateUpcomingDigestHTML(days, 'http://localhost:5000');
        const textContent = await this.digestBuilder.generateUpcomingDigestText(days, 'http://localhost:5000');

        // Get recipients
        const allRecipients = await this.db.getAllRecipients();
        const recipients = allRecipients.filter((r: any) => r.is_active && r.receive_digests);

        if (recipients.length === 0) {
          return res.status(400).json({ error: 'No active recipients configured' });
        }

        // Build date range for subject
        const now = new Date();
        const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const startStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Send to each recipient
        const recipientEmails = recipients.map((r: any) => r.email);
        await this.emailSender.sendCustomEmail(
          recipientEmails,
          `📅 What's Coming Up (${startStr} - ${endStr})`,
          textContent,
          htmlContent
        );

        console.log(`[API] Upcoming digest sent to ${recipientEmails.length} recipient(s)`);

        return res.json({
          success: true,
          message: `Digest sent to ${recipientEmails.length} recipient(s)`,
          recipients: recipientEmails
        });
      } catch (error) {
        console.error('[API] Error sending upcoming digest:', error);
        return res.status(500).json({ error: 'Failed to send digest' });
      }
    });

    // ========================================
    // Dashboard Summary Endpoints (NEW)
    // ========================================

    // GET /api/dashboard/obligations - Get upcoming obligations with AI summary
    this.app.get('/api/dashboard/obligations', async (req: Request, res: Response) => {
      try {
        const packId = req.query.packId as string | undefined;
        const person = req.query.person as string | undefined;
        const items = await this.db.getUpcomingObligations(packId, person);

        // Format items for display
        const formatted = items.map((item: any) => ({
          id: item.id,
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          person: item.person,
          eventTitle: item.event_title,
          effectiveDate: item.effective_date,
          timeGroup: item.time_group,
          createdAt: item.created_at,
          messageId: item.message_id,
          gmailLink: item.message_id ? `https://mail.google.com/mail/u/0/#inbox/${item.message_id}` : null,
          emailBody: item.email_body,
          classificationReasoning: item.classification_reasoning,
        }));

        // Generate AI summary if available (pass packId for pack-specific caching)
        let summary = null;
        if (this.summaryGenerator) {
          try {
            summary = await this.summaryGenerator.generateObligationsSummary(items, packId);
          } catch (error) {
            console.warn('[API] Summary generation failed:', error);
          }
        }

        res.json({
          items: formatted,
          total: formatted.length,
          summary: summary || {
            summary: formatted.length === 0
              ? "All clear! No upcoming obligations."
              : `You have ${formatted.length} upcoming obligation${formatted.length === 1 ? '' : 's'}.`,
            generatedAt: new Date().toISOString(),
            itemCount: formatted.length,
            fromCache: false,
          },
        });
      } catch (error) {
        console.error('[API] Error fetching obligations:', error);
        res.status(500).json({ error: 'Failed to fetch obligations' });
      }
    });

    // GET /api/dashboard/tasks - Get action items without specific dates
    this.app.get('/api/dashboard/tasks', async (req: Request, res: Response) => {
      try {
        const packId = req.query.packId as string | undefined;
        const person = req.query.person as string | undefined;
        const items = await this.db.getTaskItems(packId, person);

        // Format items for display
        const formatted = items.map((item: any) => ({
          id: item.id,
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          person: item.person,
          daysSinceReceived: item.days_since_received,
          createdAt: item.created_at,
          messageId: item.message_id,
          gmailLink: item.message_id ? `https://mail.google.com/mail/u/0/#inbox/${item.message_id}` : null,
          emailBody: item.email_body,
          classificationReasoning: item.classification_reasoning,
        }));

        // Generate AI summary if available
        let summary = null;
        if (this.summaryGenerator) {
          try {
            summary = await this.summaryGenerator.generateTasksSummary(items);
          } catch (error) {
            console.warn('[API] Tasks summary generation failed:', error);
          }
        }

        res.json({
          items: formatted,
          total: formatted.length,
          summary: summary || {
            summary: formatted.length === 0
              ? "No pending tasks - you're all caught up!"
              : `${formatted.length} task${formatted.length === 1 ? '' : 's'} to take care of.`,
            generatedAt: new Date().toISOString(),
            itemCount: formatted.length,
            fromCache: false,
          },
        });
      } catch (error) {
        console.error('[API] Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
      }
    });

    // GET /api/dashboard/announcements - Get announcements with AI summary
    this.app.get('/api/dashboard/announcements', async (req: Request, res: Response) => {
      try {
        const packId = req.query.packId as string | undefined;
        const _includeRead = req.query.includeRead === 'true';
        // Use getUpdatesItems which includes announcements
        const items = await this.db.getUpdatesItems(packId);

        // Format items for display
        const formatted = items.map((item: any) => ({
          id: item.id,
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          person: item.person,
          daysAgo: item.days_ago,
          timeGroup: item.time_group,
          createdAt: item.created_at,
          messageId: item.message_id,
          gmailLink: item.message_id ? `https://mail.google.com/mail/u/0/#inbox/${item.message_id}` : null,
          emailBody: item.email_body,
          classificationReasoning: item.classification_reasoning,
        }));

        // Generate AI summary if available (pass packId for pack-specific caching)
        let summary = null;
        if (this.summaryGenerator) {
          try {
            summary = await this.summaryGenerator.generateAnnouncementsSummary(items, packId);
          } catch (error) {
            console.warn('[API] Summary generation failed:', error);
          }
        }

        res.json({
          items: formatted,
          total: formatted.length,
          unreadCount: formatted.filter((i: any) => !i.isRead).length,
          summary: summary || {
            summary: formatted.length === 0
              ? "No new announcements this week."
              : `${formatted.length} announcement${formatted.length === 1 ? '' : 's'} to catch up on.`,
            generatedAt: new Date().toISOString(),
            itemCount: formatted.length,
            fromCache: false,
          },
        });
      } catch (error) {
        console.error('[API] Error fetching announcements:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
      }
    });

    // GET /api/item/:id - Get a single item by ID for viewing email
    console.log('[WebServer] Registering GET /api/item/:id route');
    this.app.get('/api/item/:id', async (req: Request, res: Response) => {
      console.log(`[API] GET /api/item/${req.params.id} - handler entered`);
      try {
        const itemId = getParam(req.params.id);
        const result = await this.db.execute(`
          SELECT
            id,
            message_id,
            pack_id,
            subject,
            from_name,
            from_email,
            snippet,
            person,
            created_at,
            item_type,
            obligation_date,
            COALESCE(email_body_html, email_body_text) as email_body
          FROM pending_approvals
          WHERE id = ?
        `, [itemId]);
        const item = result.rows[0] as any;

        if (!item) {
          res.status(404).json({ error: 'Item not found' });
          return;
        }

        let emailBody = item.email_body;

        // Debug: log the conditions for on-demand fetch
        console.log(`[API] Item ${itemId}: emailBody=${!!emailBody}, message_id=${item.message_id}, gmail=${!!this.gmail}`);

        // If no email body stored, try to fetch from Gmail on-demand
        if (!emailBody && item.message_id && this.gmail) {
          try {
            console.log(`[API] Fetching email body from Gmail for message ${item.message_id}`);
            const message = await this.gmail.getMessage(item.message_id);
            if (message) {
              const body = this.gmail.getBody(message);
              emailBody = body.html || body.text || null;

              // Cache the body back to the database for future requests
              if (emailBody) {
                await this.db.execute(
                  `UPDATE pending_approvals SET email_body_html = ?, email_body_text = ? WHERE id = ?`,
                  [body.html || null, body.text || null, itemId]
                );
                console.log(`[API] Cached email body for item ${itemId}`);
              }
            }
          } catch (gmailError) {
            console.error(`[API] Failed to fetch email body from Gmail:`, gmailError);
            // Continue without the body - user can still use "Open in Gmail" link
          }
        }

        res.json({
          id: item.id,
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          person: item.person,
          packId: item.pack_id,
          itemType: item.item_type,
          obligationDate: item.obligation_date,
          createdAt: item.created_at,
          messageId: item.message_id,
          gmailLink: item.message_id ? `https://mail.google.com/mail/u/0/#inbox/${item.message_id}` : null,
          emailBody: emailBody,
        });
      } catch (error) {
        console.error('[API] Error fetching item:', error);
        res.status(500).json({ error: 'Failed to fetch item' });
      }
    });

    // GET /api/dashboard/catchup - Get past items with AI summary
    this.app.get('/api/dashboard/catchup', async (req: Request, res: Response) => {
      try {
        const packId = req.query.packId as string | undefined;
        const _daysBack = parseInt(req.query.daysBack as string) || 7;
        // Use getUpdatesItems which includes past items
        const items = await this.db.getUpdatesItems(packId);

        // Format items for display
        const formatted = items.map((item: any) => ({
          id: item.id,
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          person: item.person,
          eventTitle: item.event_title,
          eventDate: item.event_start,
          status: item.catch_up_status || 'completed',
          createdAt: item.created_at,
          readAt: item.read_at,
          messageId: item.message_id,
          gmailLink: item.message_id ? `https://mail.google.com/mail/u/0/#inbox/${item.message_id}` : null,
          emailBody: item.email_body,
          viewToken: item.view_token,
        }));

        // Generate AI summary if available
        let summary = null;
        if (this.summaryGenerator) {
          try {
            summary = await this.summaryGenerator.generateCatchupSummary(items);
          } catch (error) {
            console.warn('[API] Summary generation failed:', error);
          }
        }

        res.json({
          items: formatted,
          total: formatted.length,
          summary: summary || {
            summary: formatted.length === 0
              ? "Nothing to catch up on from last week."
              : `${formatted.length} item${formatted.length === 1 ? '' : 's'} from last week.`,
            generatedAt: new Date().toISOString(),
            itemCount: formatted.length,
            fromCache: false,
          },
        });
      } catch (error) {
        console.error('[API] Error fetching catchup:', error);
        res.status(500).json({ error: 'Failed to fetch catchup items' });
      }
    });

    // GET /api/dashboard/updates - Combined announcements and past items
    this.app.get('/api/dashboard/updates', async (req: Request, res: Response) => {
      try {
        const packId = req.query.packId as string | undefined;
        const person = req.query.person as string | undefined;
        const items = await this.db.getUpdatesItems(packId, person);

        // Format items for display
        const formatted = items.map((item: any) => ({
          id: item.id,
          subject: item.subject,
          fromName: item.from_name,
          fromEmail: item.from_email,
          snippet: item.snippet,
          person: item.person,
          daysAgo: item.days_ago,
          updateType: item.update_type,
          obligationDate: item.obligation_date,
          createdAt: item.created_at,
          messageId: item.message_id,
          gmailLink: item.message_id ? `https://mail.google.com/mail/u/0/#inbox/${item.message_id}` : null,
          emailBody: item.email_body,
          classificationReasoning: item.classification_reasoning,
        }));

        // Generate AI summary if available
        let summary = null;
        if (this.summaryGenerator) {
          try {
            summary = await this.summaryGenerator.generateUpdatesSummary(items);
          } catch (error) {
            console.warn('[API] Updates summary generation failed:', error);
          }
        }

        res.json({
          items: formatted,
          total: formatted.length,
          summary: summary || {
            summary: formatted.length === 0
              ? "No updates to share - all quiet on the home front!"
              : `${formatted.length} update${formatted.length === 1 ? '' : 's'} to catch up on.`,
            generatedAt: new Date().toISOString(),
            itemCount: formatted.length,
            fromCache: false,
          },
        });
      } catch (error) {
        console.error('[API] Error fetching updates:', error);
        res.status(500).json({ error: 'Failed to fetch updates' });
      }
    });

    // ========================================
    // Weekly Catch-Up Endpoints
    // ========================================

    // GET /api/catch-up - Get newsletters and class updates
    this.app.get('/api/catch-up', async (req: Request, res: Response) => {
      try {
        const showRead = req.query.showRead === 'true';
        const limit = parseInt(req.query.limit as string) || 20;

        const newsletters = showRead
          ? await this.db.getNewsletters(limit)
          : await this.db.getUnreadNewsletters(limit);

        const formatted = newsletters.map((n: any) => ({
          id: n.id,
          subject: n.subject,
          fromName: n.from_name,
          fromEmail: n.from_email,
          snippet: n.snippet,
          person: n.person,
          packId: n.pack_id,
          daysAgo: n.days_ago,
          isRead: !!n.is_read,
          createdAt: n.created_at,
          gmailLink: `https://mail.google.com/mail/u/0/#inbox/${n.message_id}`,
        }));

        res.json({
          newsletters: formatted,
          total: formatted.length,
          unreadCount: formatted.filter((n: any) => !n.isRead).length,
        });
      } catch (error) {
        console.error('[API] Error fetching catch-up:', error);
        res.status(500).json({ error: 'Failed to fetch newsletters' });
      }
    });

    // POST /api/catch-up/:id/read - Mark a newsletter as read
    this.app.post('/api/catch-up/:id/read', async (req: Request, res: Response) => {
      try {
        const id = getParam(req.params.id);
        await this.db.markAsRead(id, 'parent');

        console.log(`[API] Marked newsletter as read: ${id}`);
        res.json({ success: true, id });
      } catch (error) {
        console.error('[API] Error marking as read:', error);
        res.status(500).json({ error: 'Failed to mark as read' });
      }
    });

    // POST /api/catch-up/mark-all-read - Mark all newsletters as read
    this.app.post('/api/catch-up/mark-all-read', async (req: Request, res: Response) => {
      try {
        const newsletters = await this.db.getUnreadNewsletters(100);
        let count = 0;

        for (const n of newsletters) {
          await this.db.markAsRead(n.id, 'parent');
          count++;
        }

        console.log(`[API] Marked ${count} newsletters as read`);
        res.json({ success: true, count });
      } catch (error) {
        console.error('[API] Error marking all as read:', error);
        res.status(500).json({ error: 'Failed to mark all as read' });
      }
    });

    // POST /api/chat - Handle chat questions
    this.app.post('/api/chat', async (req: Request, res: Response) => {
      try {
        if (!this.chatHandler) {
          res.status(503).json({
            error: 'Chat is not enabled. Set ANTHROPIC_API_KEY and enable chat in config.',
          });
          return;
        }

        const { question, context } = req.body;

        if (!question || typeof question !== 'string') {
          res.status(400).json({ error: 'Question is required' });
          return;
        }

        console.log(`[Chat] Question: "${question}"`);
        const response = await this.chatHandler.handleQuestion(question, context?.timezone);
        console.log(`[Chat] Tokens used: ${response.tokens?.input || 0} in, ${response.tokens?.output || 0} out`);

        res.json(response);
      } catch (error) {
        console.error('[API] Chat error:', error);
        res.status(500).json({
          error: 'Failed to process chat question',
          answer: 'Sorry, I encountered an error processing your question.',
          sources: [],
          actions: [],
        });
      }
    });

    // GET /api/chat/status - Check if chat is available
    this.app.get('/api/chat/status', (_req: Request, res: Response) => {
      res.json({
        enabled: !!this.chatHandler,
        model: this.chatHandler ? 'claude-sonnet-4-20250514' : null,
      });
    });

    // GET /api/email/:id/body - Get full email body for a pending approval
    this.app.get('/api/email/:id/body', async (req: Request, res: Response): Promise<void> => {
      try {
        const id = getParam(req.params.id);
        const body = await this.db.getEmailBody(id);

        if (!body) {
          res.status(404).json({ error: 'Email not found' });
          return;
        }

        res.json({
          id,
          text: body.text,
          html: body.html,
        });
      } catch (error) {
        console.error('Error fetching email body:', error);
        res.status(500).json({ error: 'Failed to fetch email body' });
      }
    });

    // GET /view/:token - Read-only dashboard for family members
    this.app.get('/view/:token', async (req: Request, res: Response): Promise<void> => {
      try {
        const token = getParam(req.params.token);
        const recipient = await this.db.validateViewToken(token);

        if (!recipient) {
          res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Invalid or Expired Link</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>🔒 Access Denied</h1>
              <p>This link is invalid or has expired.</p>
              <p>Please contact the account owner for a new link.</p>
            </body>
            </html>
          `);
          return;
        }

        // Serve read-only dashboard
        res.send(this.readOnlyDashboardPage(recipient.name || recipient.email));
      } catch (error) {
        console.error('Error validating view token:', error);
        res.status(500).send('An error occurred');
      }
    });

    // POST /api/view-token - Create a view token for a recipient (admin only)
    this.app.post('/api/view-token', async (req: Request, res: Response): Promise<void> => {
      try {
        const { email, expiresInDays = 30 } = req.body;

        if (!email) {
          res.status(400).json({ error: 'Email is required' });
          return;
        }

        // Find or create recipient
        const recipient = await this.db.getRecipientByEmail(email);
        if (!recipient) {
          res.status(404).json({ error: 'Recipient not found. Add them first via /api/recipients' });
          return;
        }

        // Create view token
        const token = await this.db.createViewToken(recipient.id, expiresInDays);
        const viewUrl = `${req.protocol}://${req.get('host')}/view/${token}`;

        res.json({
          success: true,
          token,
          viewUrl,
          expiresInDays,
          recipient: {
            email: recipient.email,
            name: recipient.name,
          },
        });
      } catch (error) {
        console.error('Error creating view token:', error);
        res.status(500).json({ error: 'Failed to create view token' });
      }
    });

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString(), chat: !!this.chatHandler });
    });
  }

  /**
   * Create an approval token for an email
   */
  public createApprovalToken(messageId: string, parentEmail: string, packId: string): string {
    const token = uuidv4();
    const session: ApprovalSession = {
      id: token,
      messageId,
      parentEmail,
      packId,
      createdAt: new Date().toISOString(),
    };

    this.approvalSessions.set(token, session);
    return token;
  }

  /**
   * Build digest from approved emails and send to configured recipients
   */
  private async buildAndSendDigest(packId: string): Promise<void> {
    try {
      // Build digest from approved emails
      const digest = await this.digestBuilder.buildDigestFromApprovedEmails(packId);

      if (!digest.sections || digest.sections.length === 0) {
        console.log('No approved emails to send in digest');
        return;
      }

      // Generate HTML and text versions with summary
      const htmlContent = this.digestBuilder.generateHTML(digest, 'http://localhost:5000');
      const textContent = this.digestBuilder.generatePlainText(digest);

      // Get recipients from config - support multiple recipients
      // Default to environment variable(s) or hardcoded list
      const recipientEnv = process.env.DIGEST_RECIPIENTS || process.env.DIGEST_RECIPIENT || 'ian.lp.fitzgerald@gmail.com';
      const recipients = recipientEnv
        .split(',')
        .map(r => r.trim())
        .filter(r => r.length > 0);

      // Send digest to all recipients
      await this.emailSender.sendDigest(digest, recipients, textContent, htmlContent);

      console.log(`✓ Digest sent to ${recipients.length} recipient(s): ${recipients.join(', ')}`);
    } catch (error) {
      console.error('Error building/sending digest:', error);
    }
  }

  /**
   * Get approval session details
   */
  public getApprovalSession(token: string): ApprovalSession | undefined {
    return this.approvalSessions.get(token);
  }

  private async dashboardPage(): Promise<string> {
    // Get family members from config
    const configVersion = await this.db.getLatestConfig();
    const familyMembers = configVersion?.config?.family?.members || [
      { name: 'Colin' },
      { name: 'Henry' }
    ];

    return generateDashboardV2HTML(familyMembers);
  }

  // Keep old dashboard as backup - can be removed later
  private dashboardPageOld(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Family Concierge - Dashboard</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #334155;
            min-height: 100vh;
          }

          header {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            padding: 1.5rem 2rem;
            box-shadow: 0 2px 10px rgba(99, 102, 241, 0.2);
          }

          header h1 {
            font-size: 1.75rem;
            margin-bottom: 0.25rem;
            font-weight: 600;
          }

          header p {
            opacity: 0.9;
            font-size: 0.9rem;
          }

          .header-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 1rem;
          }

          .header-nav a {
            color: white;
            text-decoration: none;
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
            font-weight: 500;
            transition: background 0.2s;
          }

          .header-nav a:hover {
            background: rgba(255,255,255,0.3);
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
          }

          .section {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            border-left: 4px solid #6366f1;
          }

          .section h2 {
            margin-bottom: 1rem;
            color: #1e293b;
            font-size: 1.1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.025em;
          }

          .section-symbol {
            font-size: 1.25rem;
          }

          .empty-state {
            text-align: center;
            padding: 2rem;
            background: #f0fdf4;
            border-radius: 8px;
            border: 1px solid #86efac;
          }

          .empty-state-icon {
            font-size: 2.5rem;
            margin-bottom: 0.75rem;
          }

          .empty-state-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 0.25rem;
            color: #166534;
          }

          .empty-state-text {
            font-size: 0.9rem;
            color: #15803d;
          }

          .item {
            border-left: 4px solid #6366f1;
            padding: 1rem 1.25rem;
            margin-bottom: 0.75rem;
            background: #fafafa;
            border-radius: 8px;
            transition: background 0.2s;
          }

          .item:hover {
            background: #f5f5f5;
          }

          .item.escalated {
            border-left-color: #ef4444;
            background: #fef2f2;
          }

          .item.deferred {
            border-left-color: #f59e0b;
            background: #fffbeb;
          }

          .item.dismissed {
            border-left-color: #9ca3af;
            opacity: 0.7;
          }

          .item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
          }

          .item-symbol {
            font-size: 1.5rem;
            margin-right: 0.75rem;
            cursor: help;
          }

          .item-title-row {
            display: flex;
            align-items: flex-start;
            flex: 1;
          }

          .item-title {
            flex: 1;
            font-size: 1.05rem;
            font-weight: 600;
            color: #333;
          }

          .item-meta {
            font-size: 0.85rem;
            color: #6b7280;
            margin-top: 0.5rem;
          }

          .item-state {
            padding: 0.75rem;
            background: #fef3c7;
            border-radius: 4px;
            border-left: 3px solid #f59e0b;
            margin: 1rem 0;
            font-size: 0.9rem;
          }

          .item-state.escalated {
            background: #fee2e2;
            border-left-color: #ef4444;
            font-weight: 500;
          }

          .item-actions {
            display: flex;
            gap: 0.75rem;
            margin-top: 1rem;
          }

          .btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 6px;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 0.2s;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
          }

          .btn:hover {
            opacity: 0.9;
          }

          .btn-dismiss {
            background: #6b7280;
            color: white;
          }

          .btn-dismiss:hover {
            background: #4b5563;
          }

          .btn-forward {
            background: #3b82f6;
            color: white;
          }

          .btn-forward:hover {
            background: #2563eb;
          }

          .btn-approve {
            background: #10b981;
            color: white;
          }

          .btn-approve:hover {
            background: #059669;
          }

          .loading {
            text-align: center;
            padding: 2rem;
            color: #6b7280;
          }

          /* Chat Widget Styles */
          .chat-toggle {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            transition: transform 0.2s, box-shadow 0.2s;
            z-index: 999;
          }

          .chat-toggle:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5);
          }

          .chat-toggle.disabled {
            background: #6b7280;
            cursor: not-allowed;
            box-shadow: none;
          }

          .chat-panel {
            position: fixed;
            bottom: 96px;
            right: 24px;
            width: 380px;
            max-height: 500px;
            background: #1e293b;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            display: none;
            flex-direction: column;
            z-index: 1000;
            overflow: hidden;
          }

          .chat-panel.open {
            display: flex;
          }

          .chat-header {
            padding: 16px;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .chat-close {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 20px;
            padding: 0;
            line-height: 1;
          }

          .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            max-height: 300px;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .chat-message {
            padding: 10px 14px;
            border-radius: 12px;
            max-width: 85%;
            line-height: 1.4;
            font-size: 14px;
          }

          .chat-message.user {
            background: #3b82f6;
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
          }

          .chat-message.assistant {
            background: #334155;
            color: #e2e8f0;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
          }

          .chat-message.error {
            background: #dc2626;
            color: white;
          }

          .chat-sources {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(255,255,255,0.1);
            font-size: 12px;
          }

          .chat-source-link {
            color: #60a5fa;
            text-decoration: none;
            display: block;
            margin-top: 4px;
          }

          .chat-source-link:hover {
            text-decoration: underline;
          }

          .chat-input-area {
            padding: 12px;
            border-top: 1px solid #334155;
            display: flex;
            gap: 8px;
          }

          .chat-input {
            flex: 1;
            padding: 10px 14px;
            border: 1px solid #475569;
            border-radius: 8px;
            background: #0f172a;
            color: white;
            font-size: 14px;
            outline: none;
          }

          .chat-input:focus {
            border-color: #6366f1;
          }

          .chat-input::placeholder {
            color: #64748b;
          }

          .chat-send {
            padding: 10px 16px;
            background: #6366f1;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.2s;
          }

          .chat-send:hover {
            background: #4f46e5;
          }

          .chat-send:disabled {
            background: #475569;
            cursor: not-allowed;
          }

          .chat-typing {
            display: flex;
            gap: 4px;
            padding: 10px 14px;
            background: #334155;
            border-radius: 12px;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
          }

          .chat-typing span {
            width: 8px;
            height: 8px;
            background: #64748b;
            border-radius: 50%;
            animation: typing 1.4s infinite ease-in-out;
          }

          .chat-typing span:nth-child(2) { animation-delay: 0.2s; }
          .chat-typing span:nth-child(3) { animation-delay: 0.4s; }

          @keyframes typing {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-4px); }
          }

          /* Modal styles */
          .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            align-items: center;
            justify-content: center;
          }

          .modal.show {
            display: flex;
          }

          .modal-content {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          }

          .modal-header {
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #333;
          }

          .modal-body {
            margin-bottom: 1.5rem;
          }

          .modal-body label {
            display: block;
            margin-bottom: 0.5rem;
            color: #6b7280;
            font-size: 0.9rem;
          }

          .modal-body input,
          .modal-body textarea {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 0.95rem;
            font-family: inherit;
          }

          .modal-body textarea {
            min-height: 100px;
            resize: vertical;
          }

          .modal-examples {
            font-size: 0.85rem;
            color: #6b7280;
            margin-top: 0.5rem;
            line-height: 1.6;
          }

          .modal-footer {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
          }

          .btn-cancel {
            background: #e5e7eb;
            color: #374151;
          }

          .btn-cancel:hover {
            background: #d1d5db;
          }

          .btn-confirm {
            background: #667eea;
            color: white;
          }

          .btn-confirm:hover {
            background: #5568d3;
          }

          .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: #667eea;
            color: white;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: 500;
          }

          .badge.urgent {
            background: #ef4444;
          }

          /* Upcoming section styles */
          .upcoming-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
          }

          .upcoming-header h2 {
            margin-bottom: 0;
          }

          .btn-email-me {
            background: #667eea;
            color: white;
            border: none;
            padding: 0.6rem 1.2rem;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
          }

          .btn-email-me:hover {
            background: #5568d3;
          }

          .btn-email-me:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }

          .date-group {
            background: #f9fafb;
            border-radius: 8px;
            padding: 1rem 1.5rem;
            margin-bottom: 1rem;
          }

          .date-group-header {
            font-weight: 600;
            color: #374151;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid #e5e7eb;
            margin-bottom: 0.75rem;
          }

          .event-row {
            display: flex;
            align-items: flex-start;
            padding: 0.5rem 0;
          }

          .event-status {
            font-size: 1.1rem;
            margin-right: 0.75rem;
            cursor: help;
          }

          .event-details {
            flex: 1;
          }

          .event-title {
            font-weight: 500;
            color: #333;
          }

          .event-location {
            color: #667eea;
            font-size: 0.9rem;
          }

          .event-time {
            color: #6b7280;
            font-size: 0.85rem;
            min-width: 80px;
            text-align: right;
          }

          .event-person {
            font-size: 0.85rem;
            color: #6b7280;
          }

          .worth-reading-section {
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e5e7eb;
          }

          .worth-reading-header {
            font-weight: 600;
            color: #374151;
            margin-bottom: 1rem;
          }

          .email-card {
            background: #fafafa;
            border-left: 4px solid #6366f1;
            padding: 1rem 1.25rem;
            margin-bottom: 0.75rem;
            border-radius: 0 8px 8px 0;
            transition: background 0.2s;
          }

          .email-card:hover {
            background: #f5f5f5;
          }

          .email-subject {
            font-weight: 500;
            color: #1e293b;
            margin-bottom: 0.25rem;
            font-size: 0.95rem;
          }

          .email-from {
            font-size: 0.85rem;
            color: #6b7280;
            margin-bottom: 0.5rem;
          }

          .email-snippet {
            font-size: 0.9rem;
            color: #6b7280;
            font-style: italic;
          }

          .email-actions {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.75rem;
          }

          .btn-small {
            padding: 0.4rem 0.8rem;
            font-size: 0.85rem;
          }

          .category-badge {
            display: inline-block;
            padding: 0.15rem 0.5rem;
            background: #e0e7ff;
            color: #4338ca;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 500;
            margin-left: 0.5rem;
          }

          .email-body-container {
            display: none;
            margin-top: 1rem;
            padding: 1rem;
            background: #f9fafb;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            max-height: 400px;
            overflow-y: auto;
          }

          .email-body-container.show {
            display: block;
          }

          .email-body-container img {
            max-width: 100%;
            height: auto;
          }

          .btn-expand {
            background: #6366f1;
            color: white;
          }

          .btn-expand:hover {
            background: #4f46e5;
          }

          /* Tab Styles for Dashboard Sections */
          .section-tabs {
            display: flex;
            gap: 0;
            margin-bottom: 1rem;
            border-bottom: 2px solid #e5e7eb;
          }

          .tab-btn {
            padding: 0.75rem 1.25rem;
            background: none;
            border: none;
            font-size: 0.9rem;
            font-weight: 500;
            color: #6b7280;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
          }

          .tab-btn:hover {
            color: #6366f1;
          }

          .tab-btn.active {
            color: #6366f1;
          }

          .tab-btn.active::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            right: 0;
            height: 2px;
            background: #6366f1;
          }

          .tab-content {
            display: none;
          }

          .tab-content.active {
            display: block;
          }

          /* Summary Card Styles */
          .summary-card {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid #bae6fd;
          }

          .summary-text {
            font-size: 1.1rem;
            line-height: 1.6;
            color: #0c4a6e;
            margin-bottom: 1rem;
          }

          .summary-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.8rem;
            color: #64748b;
          }

          .summary-meta span {
            display: flex;
            align-items: center;
            gap: 0.25rem;
          }

          .summary-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 2rem;
            color: #64748b;
          }

          .summary-loading::before {
            content: '';
            width: 20px;
            height: 20px;
            border: 2px solid #e2e8f0;
            border-top-color: #6366f1;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          /* Section colors */
          .section.obligations {
            border-left-color: #f59e0b;
          }

          .section.announcements {
            border-left-color: #06b6d4;
          }

          .section.catchup {
            border-left-color: #10b981;
          }

          .obligations .summary-card {
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
            border-color: #fcd34d;
          }

          .obligations .summary-text {
            color: #78350f;
          }

          .announcements .summary-card {
            background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
            border-color: #67e8f9;
          }

          .announcements .summary-text {
            color: #164e63;
          }

          .catchup .summary-card {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border-color: #86efac;
          }

          .catchup .summary-text {
            color: #14532d;
          }

          /* Collapsible sections */
          .section-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
          }

          .section-toggle {
            background: none;
            border: none;
            font-size: 1.25rem;
            cursor: pointer;
            transition: transform 0.2s;
          }

          .section.collapsed .section-toggle {
            transform: rotate(-90deg);
          }

          .section.collapsed .section-body {
            display: none;
          }

          /* Time Group Headers */
          .time-group-header {
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            padding: 0.75rem 0 0.5rem 0;
            margin-top: 0.5rem;
            border-bottom: 1px solid #e2e8f0;
          }

          .time-group-header:first-child {
            margin-top: 0;
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>📧 Family Concierge</h1>
            <p>If it happened, it's handled. No guessing. No silent failures. No false confidence.</p>
          </div>
          <div class="header-nav">
            <a href="/audit">📊 Audit</a>
            <a href="/recipients-page">👥 Recipients</a>
          </div>
        </header>

        <div class="container">
          <!-- UPCOMING OBLIGATIONS Section -->
          <div class="section obligations">
            <div class="section-header-row" onclick="toggleSectionCollapse(this.parentElement)">
              <h2><span class="section-symbol">📅</span> UPCOMING OBLIGATIONS</h2>
              <button class="section-toggle">▼</button>
            </div>
            <div class="section-body">
              <div class="section-tabs">
                <button class="tab-btn active" onclick="switchTab('obligations', 'summary', this)">Summary</button>
                <button class="tab-btn" onclick="switchTab('obligations', 'emails', this)">Emails</button>
              </div>
              <div id="obligations-summary" class="tab-content active">
                <div class="summary-loading">Generating summary...</div>
              </div>
              <div id="obligations-emails" class="tab-content">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>

          <!-- TASKS Section -->
          <div class="section tasks">
            <div class="section-header-row" onclick="toggleSectionCollapse(this.parentElement)">
              <h2><span class="section-symbol">✅</span> TASKS</h2>
              <button class="section-toggle">▼</button>
            </div>
            <div class="section-body">
              <div class="section-tabs">
                <button class="tab-btn active" onclick="switchTab('tasks', 'summary', this)">Summary</button>
                <button class="tab-btn" onclick="switchTab('tasks', 'emails', this)">Items</button>
              </div>
              <div id="tasks-summary" class="tab-content active">
                <div class="summary-loading">Generating summary...</div>
              </div>
              <div id="tasks-emails" class="tab-content">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>

          <!-- UPDATES Section (combined announcements + past items) -->
          <div class="section updates">
            <div class="section-header-row" onclick="toggleSectionCollapse(this.parentElement)">
              <h2><span class="section-symbol">📰</span> UPDATES</h2>
              <button class="section-toggle">▼</button>
            </div>
            <div class="section-body">
              <div class="section-tabs">
                <button class="tab-btn active" onclick="switchTab('updates', 'summary', this)">Summary</button>
                <button class="tab-btn" onclick="switchTab('updates', 'emails', this)">Items</button>
              </div>
              <div id="updates-summary" class="tab-content active">
                <div class="summary-loading">Generating summary...</div>
              </div>
              <div id="updates-emails" class="tab-content">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>

          <!-- Incomplete Events Section (collapsed by default) -->
          <div class="section collapsed">
            <div class="section-header-row" onclick="toggleSectionCollapse(this.parentElement)">
              <h2><span class="section-symbol">📝</span> INCOMPLETE EVENTS</h2>
              <button class="section-toggle">▼</button>
            </div>
            <div class="section-body">
              <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 1rem;">Emails with event info that need details filled in</p>
              <div id="deferred-container">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>

          <!-- Recently Dismissed Section (collapsed by default) -->
          <div class="section collapsed">
            <div class="section-header-row" onclick="toggleSectionCollapse(this.parentElement)">
              <h2><span class="section-symbol">⌀</span> RECENTLY DISMISSED</h2>
              <button class="section-toggle">▼</button>
            </div>
            <div class="section-body">
              <div id="dismissed-container">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>

          <!-- Suggested Domains Section (collapsed by default) -->
          <div class="section collapsed">
            <div class="section-header-row" onclick="toggleSectionCollapse(this.parentElement)">
              <h2><span class="section-symbol">🔍</span> SUGGESTED DOMAINS</h2>
              <button class="section-toggle">▼</button>
            </div>
            <div class="section-body">
              <div id="suggested-domains-container">
                <div class="loading">Loading...</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dismissal Modal -->
        <div id="dismissModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">Dismiss Item</div>
            <div class="modal-body">
              <p style="margin-bottom: 1rem; color: #6b7280;">Why is this not relevant?</p>
              <textarea id="dismissReason" placeholder="Enter reason (required)"></textarea>
              <div class="modal-examples">
                <strong>Examples:</strong><br>
                • Not doing soccer this season<br>
                • Already handled manually<br>
                • Not our responsibility
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-cancel" onclick="closeDismissModal()">Cancel</button>
              <button class="btn btn-confirm" onclick="confirmDismiss()">Dismiss</button>
            </div>
          </div>
        </div>

        <!-- Reject Domain Modal -->
        <div id="rejectDomainModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">Reject Domain</div>
            <div class="modal-body">
              <p id="rejectDomainName" style="font-weight: bold; margin-bottom: 1rem;"></p>
              <p style="margin-bottom: 1rem; color: #6b7280;">Why should we ignore emails from this domain?</p>
              <textarea id="rejectDomainReason" placeholder="Enter reason (required)"></textarea>
              <div class="modal-examples">
                <strong>Examples:</strong><br>
                • Not related to my kids<br>
                • Marketing/promotional emails<br>
                • One-time event, already passed<br>
                • Wrong "Colin" (different person)
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-cancel" onclick="closeRejectDomainModal()">Cancel</button>
              <button class="btn btn-confirm" onclick="confirmRejectDomain()">Reject Domain</button>
            </div>
          </div>
        </div>

        <!-- Chat Widget -->
        <button class="chat-toggle" id="chatToggle" onclick="toggleChat()" title="Ask about your schedule">
          💬
        </button>

        <div class="chat-panel" id="chatPanel">
          <div class="chat-header">
            <span>💬 Ask About Your Schedule</span>
            <button class="chat-close" onclick="toggleChat()">×</button>
          </div>
          <div class="chat-messages" id="chatMessages">
            <div class="chat-message assistant">
              Hi! I can help you find information about your family's schedule. Try asking:
              <br><br>
              • "What's happening this week?"<br>
              • "When is swim lesson?"<br>
              • "What newsletters did I get?"<br>
              • "Any events for Colin?"
            </div>
          </div>
          <div class="chat-input-area">
            <input type="text" class="chat-input" id="chatInput" placeholder="Type a question..." onkeypress="handleChatKeypress(event)">
            <button class="chat-send" id="chatSend" onclick="sendChat()">Send</button>
          </div>
        </div>

        <script>
          let currentDismissId = null;
          let currentRejectDomainId = null;
          let currentRejectDomainName = null;

          // ========================================
          // Tab and Section Functions
          // ========================================

          function switchTab(section, tabName, btn) {
            // Update tab buttons
            const tabContainer = btn.parentElement;
            tabContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update tab content
            const sectionEl = btn.closest('.section');
            sectionEl.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(\`\${section}-\${tabName}\`).classList.add('active');
          }

          function toggleSectionCollapse(sectionEl) {
            sectionEl.classList.toggle('collapsed');
          }

          // ========================================
          // Dashboard Summary Loaders
          // ========================================

          async function loadObligations() {
            try {
              const response = await fetch('/api/dashboard/obligations');
              const data = await response.json();

              // Render summary
              const summaryContainer = document.getElementById('obligations-summary');
              if (data.summary) {
                const cacheIndicator = data.summary.fromCache ? '(cached)' : '';
                summaryContainer.innerHTML = \`
                  <div class="summary-card">
                    <div class="summary-text">\${data.summary.summary}</div>
                    <div class="summary-meta">
                      <span>\${data.summary.itemCount} item\${data.summary.itemCount !== 1 ? 's' : ''}</span>
                      <span>\${cacheIndicator}</span>
                    </div>
                  </div>
                \`;
              }

              // Render emails list grouped by time
              const emailsContainer = document.getElementById('obligations-emails');
              if (data.items.length === 0) {
                emailsContainer.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-title">No upcoming obligations</div>
                    <div class="empty-state-text">Nothing requiring action right now!</div>
                  </div>
                \`;
              } else {
                // Group items by time_group
                const groups = {
                  this_week: { label: 'This Week', items: [] },
                  next_week: { label: 'Next Week', items: [] },
                  this_month: { label: 'This Month', items: [] },
                  later: { label: 'Later', items: [] }
                };

                data.items.forEach(item => {
                  const group = item.timeGroup || 'later';
                  if (groups[group]) {
                    groups[group].items.push(item);
                  } else {
                    groups.later.items.push(item);
                  }
                });

                let html = '';
                for (const [key, group] of Object.entries(groups)) {
                  if (group.items.length > 0) {
                    html += \`<div class="time-group-header">\${group.label}</div>\`;
                    html += group.items.map(item => \`
                      <div class="item" id="obligation-\${item.id}">
                        <div class="item-header">
                          <div class="item-title-row">
                            <span class="item-symbol">📅</span>
                            <div style="flex: 1;">
                              <div class="item-title">\${item.eventTitle || item.subject || 'No subject'}</div>
                              <div class="item-meta">
                                \${item.effectiveDate ? new Date(item.effectiveDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' • ' : ''}
                                \${item.person || 'Family'}
                                \${item.fromName ? ' • From: ' + item.fromName : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="item-actions">
                          <button class="btn btn-small btn-expand" onclick="toggleEmailBody('obligation-\${item.id}', this)">📖 View Email</button>
                          \${item.gmailLink ? \`<a href="\${item.gmailLink}" target="_blank" class="btn btn-forward btn-small">Open in Gmail</a>\` : ''}
                          <button class="btn btn-small btn-dismiss" onclick="openDismissModal('\${item.id}')">✕ Dismiss</button>
                        </div>
                        <div class="email-body-container" id="body-obligation-\${item.id}" data-email-body="\${encodeURIComponent(item.emailBody || '')}"></div>
                      </div>
                    \`).join('');
                  }
                }
                emailsContainer.innerHTML = html;
              }
            } catch (error) {
              console.error('Error loading obligations:', error);
              document.getElementById('obligations-summary').innerHTML = '<div style="color: #ef4444; padding: 1rem;">Error loading obligations</div>';
            }
          }

          async function loadUpdates() {
            try {
              const response = await fetch('/api/dashboard/updates');
              const data = await response.json();

              // Render summary
              const summaryContainer = document.getElementById('updates-summary');
              if (data.summary) {
                const cacheIndicator = data.summary.fromCache ? '(cached)' : '';
                summaryContainer.innerHTML = \`
                  <div class="summary-card">
                    <div class="summary-text">\${data.summary.summary}</div>
                    <div class="summary-meta">
                      <span>\${data.summary.itemCount} update\${data.summary.itemCount !== 1 ? 's' : ''}</span>
                      <span>\${cacheIndicator}</span>
                    </div>
                  </div>
                \`;
              }

              // Render emails list
              const emailsContainer = document.getElementById('updates-emails');
              if (data.items.length === 0) {
                emailsContainer.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div class="empty-state-title">No updates</div>
                    <div class="empty-state-text">No recent updates or past events to show.</div>
                  </div>
                \`;
              } else {
                emailsContainer.innerHTML = data.items.map(item => \`
                  <div class="item \${item.isRead ? 'read' : ''}" id="update-\${item.id}">
                    <div class="item-header">
                      <div class="item-title-row">
                        <span class="item-symbol">\${item.updateType === 'past_event' ? '✓' : (item.isRead ? '✓' : '📰')}</span>
                        <div style="flex: 1;">
                          <div class="item-title">\${item.subject || 'No subject'}</div>
                          <div class="item-meta">
                            \${item.updateType === 'past_event' && item.obligationDate ? 'Event: ' + new Date(item.obligationDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' • ' : ''}
                            \${item.person || 'General'}
                            \${item.daysAgo !== undefined ? ' • ' + item.daysAgo + ' day' + (item.daysAgo !== 1 ? 's' : '') + ' ago' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="item-actions">
                      <button class="btn btn-small btn-expand" onclick="toggleEmailBody('update-\${item.id}', this)">📖 View Email</button>
                      \${item.gmailLink ? \`<a href="\${item.gmailLink}" target="_blank" class="btn btn-forward btn-small">Open in Gmail</a>\` : ''}
                      \${!item.isRead && item.updateType !== 'past_event' ? \`<button class="btn btn-small" style="background: #10b981; color: white;" onclick="markUpdateRead('\${item.id}')">✓ Mark Read</button>\` : ''}
                    </div>
                    <div class="email-body-container" id="body-update-\${item.id}" data-email-body="\${encodeURIComponent(item.emailBody || '')}"></div>
                  </div>
                \`).join('');
              }
            } catch (error) {
              console.error('Error loading updates:', error);
              document.getElementById('updates-summary').innerHTML = '<div style="color: #ef4444; padding: 1rem;">Error loading updates</div>';
            }
          }

          async function loadTasks() {
            try {
              const response = await fetch('/api/dashboard/tasks');
              const data = await response.json();

              // Render summary
              const summaryContainer = document.getElementById('tasks-summary');
              if (data.summary) {
                const cacheIndicator = data.summary.fromCache ? '(cached)' : '';
                summaryContainer.innerHTML = \`
                  <div class="summary-card">
                    <div class="summary-text">\${data.summary.summary}</div>
                    <div class="summary-meta">
                      <span>\${data.summary.itemCount} task\${data.summary.itemCount !== 1 ? 's' : ''}</span>
                      <span>\${cacheIndicator}</span>
                    </div>
                  </div>
                \`;
              }

              // Render tasks list
              const tasksContainer = document.getElementById('tasks-emails');
              if (data.items.length === 0) {
                tasksContainer.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-title">No pending tasks</div>
                    <div class="empty-state-text">You're all caught up!</div>
                  </div>
                \`;
              } else {
                tasksContainer.innerHTML = data.items.map(item => \`
                  <div class="item" id="task-\${item.id}">
                    <div class="item-header">
                      <div class="item-title-row">
                        <span class="item-symbol">☐</span>
                        <div style="flex: 1;">
                          <div class="item-title">\${item.subject || 'No subject'}</div>
                          <div class="item-meta">
                            From: \${item.fromName || item.fromEmail || 'Unknown'} •
                            Received \${item.daysSinceReceived || 0} day\${item.daysSinceReceived !== 1 ? 's' : ''} ago
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="item-actions">
                      <button class="btn btn-small btn-expand" onclick="toggleEmailBody('task-\${item.id}', this)">📖 View Details</button>
                      \${item.gmailLink ? \`<a href="\${item.gmailLink}" target="_blank" class="btn btn-forward btn-small">Open in Gmail</a>\` : ''}
                      <button class="btn btn-small" style="background: #10b981; color: white;" onclick="dismissItem('\${item.id}', 'task')">✓ Done</button>
                    </div>
                    <div class="email-body-container" id="body-task-\${item.id}" data-email-body="\${encodeURIComponent(item.emailBody || '')}"></div>
                  </div>
                \`).join('');
              }
            } catch (error) {
              console.error('Error loading tasks:', error);
              document.getElementById('tasks-summary').innerHTML = '<div style="color: #ef4444; padding: 1rem;">Error loading tasks</div>';
            }
          }

          async function markUpdateRead(id) {
            try {
              const response = await fetch(\`/api/catch-up/\${id}/read\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              if (response.ok) {
                loadUpdates(); // Refresh the updates
              }
            } catch (error) {
              console.error('Error marking as read:', error);
            }
          }

          // ========================================
          // Existing Functions
          // ========================================

          async function loadDeferred() {
            try {
              const response = await fetch('/api/deferred');
              const items = await response.json();
              const container = document.getElementById('deferred-container');

              if (items.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-title">No incomplete events</div>
                    <div class="empty-state-text">All events have been processed or sorted.</div>
                  </div>
                \`;
                return;
              }

              container.innerHTML = items.map(item => {
                const timeLabel = item.daysPending === 0 ? 'Just arrived' :
                                  item.daysPending === 1 ? '1 day ago' :
                                  \`\${item.daysPending} days ago\`;
                return \`
                <div class="item \${item.escalated ? 'escalated' : 'deferred'}" id="item-\${item.id}">
                  <div class="item-header">
                    <div class="item-title-row">
                      <span class="item-symbol" title="Missing details needed to create calendar event">\${item.escalated ? '🚨' : '📝'}</span>
                      <div style="flex: 1;">
                        <div class="item-title">\${item.subject || 'No subject'}</div>
                        <div class="item-meta">
                          From: \${item.fromName || item.fromEmail || 'Unknown'} •
                          \${item.person ? item.person + ' • ' : ''}
                          \${timeLabel}
                        </div>
                      </div>
                    </div>
                    \${item.escalated ? '<span class="badge urgent">NEEDS ACTION</span>' : ''}
                  </div>
                  <div class="item-actions">
                    <button class="btn btn-small btn-approve" onclick="alert('Create Event feature coming soon!')">
                      ➕ Create Event
                    </button>
                    <button class="btn btn-small btn-expand" onclick="toggleEmailBody('\${item.id}', this)">
                      📖 View Email
                    </button>
                    <button class="btn btn-small" style="background: #9ca3af; color: white;" onclick="moveToNewsletter('\${item.id}')">
                      📰 It's a Newsletter
                    </button>
                    <button class="btn btn-small btn-dismiss" onclick="openDismissModal('\${item.id}')">
                      ✕ Dismiss
                    </button>
                  </div>
                  <div class="email-body-container" id="body-\${item.id}"></div>
                </div>
              \`}).join('');
            } catch (error) {
              document.getElementById('deferred-container').innerHTML = \`
                <div style="color: #ef4444; padding: 1rem;">Error loading items</div>
              \`;
            }
          }

          async function loadDismissed() {
            try {
              const response = await fetch('/api/dismissed');
              const items = await response.json();
              const container = document.getElementById('dismissed-container');

              if (items.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">⌀</div>
                    <div class="empty-state-title">Nothing dismissed this week</div>
                    <div class="empty-state-text">Items you dismiss will appear here for 7 days</div>
                  </div>
                \`;
                return;
              }

              container.innerHTML = items.map(item => \`
                <div class="item dismissed">
                  <div class="item-title-row">
                    <span class="item-symbol">⌀</span>
                    <div style="flex: 1;">
                      <div class="item-title">\${item.subject || 'No subject'}</div>
                      <div class="item-meta">
                        Reason: "\${item.reason}" | 
                        Dismissed: \${new Date(item.dismissedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              \`).join('');
            } catch (error) {
              document.getElementById('dismissed-container').innerHTML = \`
                <div style="color: #ef4444; padding: 1rem;">Error loading dismissed items</div>
              \`;
            }
          }

          function openDismissModal(itemId) {
            currentDismissId = itemId;
            document.getElementById('dismissModal').classList.add('show');
            document.getElementById('dismissReason').value = '';
            document.getElementById('dismissReason').focus();
          }

          function closeDismissModal() {
            currentDismissId = null;
            document.getElementById('dismissModal').classList.remove('show');
          }

          async function confirmDismiss() {
            const reason = document.getElementById('dismissReason').value.trim();
            
            if (!reason) {
              alert('Please enter a reason (required for audit trail)');
              return;
            }

            try {
              const response = await fetch('/api/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  itemId: currentDismissId,
                  reason: reason
                })
              });

              if (response.ok) {
                closeDismissModal();
                loadDeferred();
                loadDismissed();
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
              }
            } catch (error) {
              alert('Failed to dismiss item');
            }
          }

          // ========================================
          // Suggested Domains Functions
          // ========================================

          async function loadSuggestedDomains() {
            try {
              const response = await fetch('/api/suggested-domains');
              const suggestions = await response.json();
              const container = document.getElementById('suggested-domains-container');

              if (suggestions.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">✓</div>
                    <div class="empty-state-title">No new domains discovered</div>
                    <div class="empty-state-text">We'll notify you when we find emails from new sources mentioning your kids.</div>
                  </div>
                \`;
                return;
              }

              container.innerHTML = suggestions.map(s => \`
                <div class="item">
                  <div class="item-header">
                    <div class="item-title-row">
                      <span class="item-symbol" title="Suggested new domain">💡</span>
                      <div style="flex: 1;">
                        <div class="item-title">\${s.domain}</div>
                        <div class="item-meta">
                          \${s.emailCount} email(s) mentioning: \${s.matchedKeywords.join(', ')} |
                          First seen: \${new Date(s.firstSeenAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span class="badge" style="background: #10b981;">\${Math.round(s.confidence * 100)}% confidence</span>
                  </div>
                  <div class="item-state">
                    We found \${s.emailCount} email(s) from <strong>\${s.domain}</strong> mentioning <strong>\${s.matchedKeywords.join(', ')}</strong>.
                    \${s.sampleSubjects && s.sampleSubjects.length > 0 ? '<br><em>Example: "' + s.sampleSubjects[0] + '"</em>' : ''}
                  </div>
                  <div class="item-actions">
                    <button class="btn btn-approve" onclick="approveDomain('\${s.id}', '\${s.domain}')">✓ Add Domain</button>
                    <button class="btn btn-dismiss" onclick="openRejectDomainModal('\${s.id}', '\${s.domain}')">Ignore</button>
                  </div>
                </div>
              \`).join('');
            } catch (error) {
              document.getElementById('suggested-domains-container').innerHTML = \`
                <div style="color: #ef4444; padding: 1rem;">Error loading suggestions</div>
              \`;
            }
          }

          async function approveDomain(id, domain) {
            try {
              const response = await fetch(\`/api/suggested-domains/\${id}/approve\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });

              if (response.ok) {
                alert(\`Domain \${domain} approved! It will be added to your watch list.\`);
                loadSuggestedDomains();
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
              }
            } catch (error) {
              alert('Failed to approve domain');
            }
          }

          function openRejectDomainModal(id, domain) {
            currentRejectDomainId = id;
            currentRejectDomainName = domain;
            document.getElementById('rejectDomainName').textContent = \`Reject: \${domain}\`;
            document.getElementById('rejectDomainModal').classList.add('show');
            document.getElementById('rejectDomainReason').value = '';
            document.getElementById('rejectDomainReason').focus();
          }

          function closeRejectDomainModal() {
            currentRejectDomainId = null;
            currentRejectDomainName = null;
            document.getElementById('rejectDomainModal').classList.remove('show');
          }

          async function confirmRejectDomain() {
            const reason = document.getElementById('rejectDomainReason').value.trim();

            if (!reason) {
              alert('Please enter a reason (required for audit trail)');
              return;
            }

            try {
              const response = await fetch(\`/api/suggested-domains/\${currentRejectDomainId}/reject\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason, permanent: true })
              });

              if (response.ok) {
                closeRejectDomainModal();
                loadSuggestedDomains();
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
              }
            } catch (error) {
              alert('Failed to reject domain');
            }
          }

          // ========================================
          // What's Coming Up Functions
          // ========================================

          async function loadUpcoming() {
            try {
              const response = await fetch('/api/upcoming?days=14');
              const data = await response.json();
              const container = document.getElementById('upcoming-container');

              // Check if there's anything to show
              if ((!data.events || data.events.length === 0) && (!data.emailsWorthReading || data.emailsWorthReading.length === 0)) {
                container.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">📅</div>
                    <div class="empty-state-title">All clear for the next 2 weeks</div>
                    <div class="empty-state-text">No upcoming events or pending emails to review.</div>
                  </div>
                \`;
                return;
              }

              let html = '';

              // Group events by date
              if (data.events && data.events.length > 0) {
                const eventsByDate = {};
                data.events.forEach(event => {
                  const date = new Date(event.startDateTime).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  });
                  if (!eventsByDate[date]) {
                    eventsByDate[date] = [];
                  }
                  eventsByDate[date].push(event);
                });

                // Render date groups
                for (const [date, events] of Object.entries(eventsByDate)) {
                  html += \`
                    <div class="date-group">
                      <div class="date-group-header">\${date}</div>
                      \${events.map(event => {
                        const time = new Date(event.startDateTime).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        });
                        const symbol = event.status === 'created' ? '✓' : '⚠';
                        const title = symbol === '⚠' ? 'Pending approval' : 'Added to calendar';
                        return \`
                          <div class="event-row">
                            <span class="event-status" title="\${title}">\${symbol}</span>
                            <div class="event-details">
                              <div class="event-title">
                                \${event.title}
                                \${event.location ? '<span class="event-location"> - ' + event.location + '</span>' : ''}
                              </div>
                              <div class="event-person">
                                \${event.person || 'All'} • \${event.pack || 'General'}
                              </div>
                            </div>
                            <div class="event-time">\${time}</div>
                          </div>
                        \`;
                      }).join('')}
                    </div>
                  \`;
                }
              }

              // Emails worth reading section
              if (data.emailsWorthReading && data.emailsWorthReading.length > 0) {
                html += \`
                  <div class="worth-reading-section">
                    <div class="worth-reading-header">📬 WORTH READING (\${data.emailsWorthReading.length} email\${data.emailsWorthReading.length > 1 ? 's' : ''})</div>
                    \${data.emailsWorthReading.map(email => \`
                      <div class="email-card" id="email-\${email.id}">
                        <div class="email-subject">
                          \${email.subject}
                          <span class="category-badge">\${email.category || 'general'}</span>
                        </div>
                        <div class="email-from">
                          From: \${email.fromName || email.fromEmail} • \${email.daysAgo} day\${email.daysAgo !== 1 ? 's' : ''} ago
                        </div>
                        <div class="email-snippet">"\${email.snippet}"</div>
                        <div class="email-actions">
                          <button class="btn btn-small btn-expand" onclick="toggleEmailBody('\${email.id}', this)">📖 View Email</button>
                          <button class="btn btn-dismiss btn-small" onclick="dismissEmail('\${email.id}')">Dismiss</button>
                          \${email.gmailLink ? \`<a href="\${email.gmailLink}" target="_blank" class="btn btn-forward btn-small">Open in Gmail</a>\` : ''}
                        </div>
                        <div class="email-body-container" id="body-\${email.id}"></div>
                      </div>
                    \`).join('')}
                  </div>
                \`;
              }

              container.innerHTML = html;
            } catch (error) {
              console.error('Error loading upcoming:', error);
              document.getElementById('upcoming-container').innerHTML = \`
                <div style="color: #ef4444; padding: 1rem;">Error loading upcoming events</div>
              \`;
            }
          }

          async function sendUpcomingDigest() {
            const btn = document.getElementById('emailMeBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Sending...';

            try {
              const response = await fetch('/api/send-upcoming-digest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: 14 })
              });

              if (response.ok) {
                const result = await response.json();
                btn.innerHTML = '✓ Sent!';
                setTimeout(() => {
                  btn.innerHTML = originalText;
                  btn.disabled = false;
                }, 2000);
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
                btn.innerHTML = originalText;
                btn.disabled = false;
              }
            } catch (error) {
              alert('Failed to send digest');
              btn.innerHTML = originalText;
              btn.disabled = false;
            }
          }

          async function dismissEmail(emailId) {
            // Open the dismiss modal for email
            openDismissModal(emailId);
          }

          // ========================================
          // Weekly Catch-Up Functions
          // ========================================

          async function loadCatchUp() {
            try {
              const response = await fetch('/api/catch-up?showRead=false');
              const data = await response.json();
              const container = document.getElementById('catch-up-container');

              if (!data.newsletters || data.newsletters.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    <div class="empty-state-icon">📰</div>
                    <div class="empty-state-title">All caught up!</div>
                    <div class="empty-state-text">No new newsletters or class updates to review.</div>
                  </div>
                \`;
                document.getElementById('markAllReadBtn').style.display = 'none';
                return;
              }

              document.getElementById('markAllReadBtn').style.display = 'block';

              container.innerHTML = data.newsletters.map(newsletter => \`
                <div class="email-card" id="newsletter-\${newsletter.id}">
                  <div class="email-subject">
                    \${newsletter.subject}
                    \${newsletter.person ? '<span class="category-badge">' + newsletter.person + '</span>' : ''}
                  </div>
                  <div class="email-from">
                    From: \${newsletter.fromName || newsletter.fromEmail} • \${newsletter.daysAgo} day\${newsletter.daysAgo !== 1 ? 's' : ''} ago
                  </div>
                  <div class="email-snippet">"\${newsletter.snippet}"</div>
                  <div class="email-actions">
                    <button class="btn btn-small btn-expand" onclick="toggleEmailBody('\${newsletter.id}', this)">
                      📖 Read Full Email
                    </button>
                    <button class="btn btn-small" style="background: #10b981; color: white;" onclick="markRead('\${newsletter.id}')">
                      ✓ Mark Read
                    </button>
                    <a href="\${newsletter.gmailLink}" target="_blank" class="btn btn-forward btn-small">
                      Open in Gmail
                    </a>
                  </div>
                  <div class="email-body-container" id="body-\${newsletter.id}"></div>
                </div>
              \`).join('');
            } catch (error) {
              console.error('Error loading catch-up:', error);
              document.getElementById('catch-up-container').innerHTML = \`
                <div style="color: #ef4444; padding: 1rem;">Error loading newsletters</div>
              \`;
            }
          }

          async function markRead(newsletterId) {
            try {
              const response = await fetch(\`/api/catch-up/\${newsletterId}/read\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });

              if (response.ok) {
                // Fade out and remove the newsletter card
                const card = document.getElementById(\`newsletter-\${newsletterId}\`);
                if (card) {
                  card.style.opacity = '0.5';
                  card.style.transition = 'opacity 0.3s';
                  setTimeout(() => {
                    loadCatchUp(); // Reload to update the list
                  }, 300);
                }
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
              }
            } catch (error) {
              alert('Failed to mark as read');
            }
          }

          async function markAllRead() {
            const btn = document.getElementById('markAllReadBtn');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Marking...';

            try {
              const response = await fetch('/api/catch-up/mark-all-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });

              if (response.ok) {
                const result = await response.json();
                btn.innerHTML = \`✓ Marked \${result.count}!\`;
                setTimeout(() => {
                  btn.innerHTML = originalText;
                  btn.disabled = false;
                  loadCatchUp();
                }, 1500);
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
                btn.innerHTML = originalText;
                btn.disabled = false;
              }
            } catch (error) {
              alert('Failed to mark all as read');
              btn.innerHTML = originalText;
              btn.disabled = false;
            }
          }

          async function moveToNewsletter(itemId) {
            if (!confirm('Move this to Weekly Catch-Up as a newsletter?')) return;

            try {
              const response = await fetch(\`/api/pending/\${itemId}/classify\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: 'newsletter' })
              });

              if (response.ok) {
                // Reload both sections
                loadDeferred();
                loadCatchUp();
              } else {
                const error = await response.json();
                alert('Error: ' + error.error);
              }
            } catch (error) {
              alert('Failed to reclassify item');
            }
          }

          async function toggleEmailBody(id, btn) {
            const bodyEl = document.getElementById('body-' + id);

            // If already showing, hide it
            if (bodyEl.classList.contains('show')) {
              bodyEl.classList.remove('show');
              btn.innerHTML = '📖 View Email';
              return;
            }

            // Check if we have pre-loaded email body in data attribute
            const preloadedBody = bodyEl.getAttribute('data-email-body');
            if (preloadedBody) {
              const decoded = decodeURIComponent(preloadedBody);
              if (decoded) {
                bodyEl.innerHTML = decoded;
                bodyEl.classList.add('show');
                btn.innerHTML = '📕 Hide Email';
                return;
              }
            }

            // Load the email body from API
            btn.innerHTML = '⏳ Loading...';
            btn.disabled = true;

            // Extract actual item ID (remove prefix like 'obligation-', 'announcement-', etc.)
            const actualId = id.includes('-') ? id.split('-').slice(1).join('-') : id;

            try {
              const response = await fetch('/api/email/' + actualId + '/body');
              const data = await response.json();

              if (data.html) {
                bodyEl.innerHTML = data.html;
              } else if (data.text) {
                bodyEl.innerHTML = '<pre style="white-space: pre-wrap; font-family: inherit;">' +
                  data.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
              } else {
                bodyEl.innerHTML = '<em style="color: #6b7280;">Email content not available. Try "Open in Gmail" instead.</em>';
              }

              bodyEl.classList.add('show');
              btn.innerHTML = '📕 Hide Email';
            } catch (error) {
              console.error('Error loading email body:', error);
              bodyEl.innerHTML = '<em style="color: #ef4444;">Failed to load email content.</em>';
              bodyEl.classList.add('show');
              btn.innerHTML = '📕 Hide Email';
            }

            btn.disabled = false;
          }

          // Close modals on escape
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              closeDismissModal();
              closeRejectDomainModal();
              const chatPanel = document.getElementById('chatPanel');
              if (chatPanel.classList.contains('open')) {
                toggleChat();
              }
            }
          });

          // Chat functionality
          let chatEnabled = false;

          async function checkChatStatus() {
            try {
              const response = await fetch('/api/chat/status');
              const data = await response.json();
              chatEnabled = data.enabled;
              const toggle = document.getElementById('chatToggle');
              if (!chatEnabled) {
                toggle.classList.add('disabled');
                toggle.title = 'Chat not available - ANTHROPIC_API_KEY not set';
              }
            } catch (error) {
              console.error('Failed to check chat status:', error);
            }
          }

          function toggleChat() {
            if (!chatEnabled) {
              alert('Chat is not enabled. Please set the ANTHROPIC_API_KEY environment variable.');
              return;
            }
            const panel = document.getElementById('chatPanel');
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) {
              document.getElementById('chatInput').focus();
            }
          }

          function handleChatKeypress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendChat();
            }
          }

          async function sendChat() {
            const input = document.getElementById('chatInput');
            const sendBtn = document.getElementById('chatSend');
            const messages = document.getElementById('chatMessages');
            const question = input.value.trim();

            if (!question) return;

            // Add user message
            messages.innerHTML += \`
              <div class="chat-message user">\${escapeHtml(question)}</div>
            \`;

            // Clear input and disable
            input.value = '';
            sendBtn.disabled = true;
            input.disabled = true;

            // Add typing indicator
            const typingId = 'typing-' + Date.now();
            messages.innerHTML += \`
              <div class="chat-typing" id="\${typingId}">
                <span></span><span></span><span></span>
              </div>
            \`;
            messages.scrollTop = messages.scrollHeight;

            try {
              const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  question,
                  context: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
                })
              });

              const data = await response.json();

              // Remove typing indicator
              document.getElementById(typingId)?.remove();

              // Build response HTML
              let responseHtml = \`<div class="chat-message assistant">\${escapeHtml(data.answer)}\`;

              // Add sources if any
              if (data.sources && data.sources.length > 0) {
                responseHtml += '<div class="chat-sources"><strong>Sources:</strong>';
                for (const source of data.sources) {
                  if (source.gmailLink) {
                    responseHtml += \`<a href="\${source.gmailLink}" target="_blank" class="chat-source-link">📧 \${escapeHtml(source.title)}</a>\`;
                  } else {
                    responseHtml += \`<span class="chat-source-link">📅 \${escapeHtml(source.title)}</span>\`;
                  }
                }
                responseHtml += '</div>';
              }

              responseHtml += '</div>';
              messages.innerHTML += responseHtml;

            } catch (error) {
              // Remove typing indicator
              document.getElementById(typingId)?.remove();
              messages.innerHTML += \`
                <div class="chat-message assistant error">Sorry, I encountered an error. Please try again.</div>
              \`;
            }

            // Re-enable input
            sendBtn.disabled = false;
            input.disabled = false;
            input.focus();
            messages.scrollTop = messages.scrollHeight;
          }

          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }

          // Check chat status on load
          checkChatStatus();

          // Load data on page load
          loadObligations();
          loadTasks();
          loadUpdates();
          loadDeferred();
          loadDismissed();
          loadSuggestedDomains();

          // Refresh every 60 seconds (less frequent for AI summaries)
          setInterval(() => {
            loadObligations();
            loadTasks();
            loadUpdates();
            loadDeferred();
            loadDismissed();
            loadSuggestedDomains();
          }, 60000);
        </script>
      </body>
      </html>
    `;
  }

  private async auditPage(): Promise<string> {
    const configVersion = await this.db.getLatestConfig();
    const config = configVersion?.config;
    const packs = config?.packs || [];
    
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Audit - Family Concierge</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            color: #333;
          }

          header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }

          header h1 {
            font-size: 1.8rem;
            margin-bottom: 0.5rem;
          }

          header p {
            opacity: 0.9;
            font-size: 0.95rem;
          }

          .header-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 1rem;
          }

          .header-nav a {
            color: white;
            text-decoration: none;
            padding: 0.5rem 1rem;
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
            font-weight: 500;
            transition: background 0.2s;
          }

          .header-nav a:hover {
            background: rgba(255,255,255,0.3);
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
          }

          .section {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }

          .section h2 {
            margin-bottom: 1.5rem;
            color: #667eea;
            font-size: 1.3rem;
          }

          .config-list {
            display: grid;
            gap: 0.75rem;
          }

          .config-item {
            padding: 1rem;
            background: #f9fafb;
            border-radius: 4px;
            border-left: 4px solid #667eea;
          }

          .config-item-text {
            font-size: 0.95rem;
            color: #333;
            font-weight: 600;
          }

          .config-item-meta {
            font-size: 0.85rem;
            color: #6b7280;
            margin-top: 0.25rem;
          }

          .correction-section {
            background: #f0f9ff;
            border: 2px solid #bfdbfe;
            border-radius: 8px;
            padding: 1.5rem;
            margin-top: 2rem;
          }

          .correction-header {
            font-size: 1.1rem;
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 1rem;
          }

          .notice {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 1rem;
            border-radius: 4px;
            font-size: 0.9rem;
            color: #78350f;
            line-height: 1.6;
          }

          .empty-state {
            text-align: center;
            padding: 3rem 2rem;
            color: #9ca3af;
          }

          .empty-state-text {
            font-size: 0.95rem;
          }

          code {
            background: #f3f4f6;
            padding: 0.2rem 0.4rem;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
          }

          ul {
            margin: 1rem 0 1rem 1.5rem;
          }

          li {
            margin-bottom: 0.5rem;
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>📊 Configuration Audit</h1>
            <p>View email sources and make corrections using CLI commands</p>
          </div>
          <div class="header-nav">
            <a href="/">← Dashboard</a>
            <a href="/recipients-page">👥 Recipients</a>
          </div>
        </header>

        <div class="container">
          <!-- Packs Section -->
          <div class="section">
            <h2>Email Packs</h2>
            ${packs.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-text">No packs configured</div>
              </div>
            ` : `
              <div class="config-list">
                ${packs.map((pack: any) => `
                  <div class="config-item">
                    <div class="config-item-text">${pack.packId}</div>
                    <div class="config-item-meta">Priority: ${pack.priority} | Sources: ${pack.config?.sources?.length || 0}</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Correction Actions Section -->
          <div class="section">
            <div class="correction-section">
              <div class="correction-header">Configuration Corrections via CLI</div>
              <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 1.5rem;">
                To make configuration corrections, use the CLI audit commands. These commands update the configuration and can reprocess past items.
              </p>
              
              <div class="notice">
                <strong>Available CLI Commands:</strong>
                <ul>
                  <li><code>npm run cli -- audit</code> - Verify configuration</li>
                  <li><code>npm run cli -- audit --add-domain school.org Emma</code> - Add domain to watch</li>
                  <li><code>npm run cli -- audit --exclude-keyword newsletter</code> - Exclude false positives</li>
                  <li><code>npm run cli -- reprocess --last-7d</code> - Reprocess with updated config</li>
                  <li><code>npm run cli -- reprocess --last-7d --dry-run</code> - Preview changes</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private recipientManagementPage(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recipient Management</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 2rem;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 2rem;
          }
          h1 { color: #333; margin-bottom: 2rem; font-size: 1.8rem; }
          
          .add-recipient {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 1.5rem;
            margin-bottom: 2rem;
          }
          .form-group {
            margin-bottom: 1rem;
            display: flex;
            gap: 1rem;
            align-items: flex-end;
          }
          .form-group input {
            flex: 1;
            padding: 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 0.95rem;
          }
          .form-group input::placeholder { color: #9ca3af; }
          button {
            padding: 0.75rem 1.5rem;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.2s;
          }
          button:hover { background: #5568d3; }
          button.delete { background: #ef4444; padding: 0.5rem 1rem; font-size: 0.85rem; }
          button.delete:hover { background: #dc2626; }

          .recipients-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 2rem;
          }
          .recipients-table thead {
            background: #f9fafb;
            border-bottom: 2px solid #e5e7eb;
          }
          .recipients-table th {
            text-align: left;
            padding: 1rem;
            color: #374151;
            font-weight: 600;
            font-size: 0.9rem;
          }
          .recipients-table td {
            padding: 1rem;
            border-bottom: 1px solid #e5e7eb;
          }
          .recipients-table tr:hover { background: #f9fafb; }

          .checkbox-group {
            display: flex;
            gap: 0.5rem;
            align-items: center;
          }
          .checkbox-group label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            user-select: none;
          }
          .checkbox-group input[type="checkbox"] {
            cursor: pointer;
            width: 18px;
            height: 18px;
          }

          .action-buttons {
            display: flex;
            gap: 0.5rem;
          }

          .message {
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            display: none;
          }
          .message.show { display: block; }
          .message.success { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
          .message.error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

          .empty-state {
            text-align: center;
            padding: 3rem;
            color: #9ca3af;
          }

          .back-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            margin-bottom: 1rem;
            display: inline-block;
          }
          .back-link:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <a href="/" class="back-link">← Back to Dashboard</a>
          <h1>📧 Recipient Management</h1>
          
          <div id="message" class="message"></div>

          <div class="add-recipient">
            <h3 style="margin-bottom: 0.5rem; color: #374151;">Add New Recipient</h3>
            <p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 1rem;">Add family members who should receive updates about upcoming events.</p>
            <div class="form-group">
              <input type="email" id="newEmail" placeholder="Email address (required)" required />
              <input type="text" id="newName" placeholder="Name (optional)" />
              <button onclick="addRecipient()">+ Add Recipient</button>
            </div>
          </div>

          <h3 style="color: #374151; margin-bottom: 0.5rem;">Recipients</h3>
          <p style="color: #6b7280; font-size: 0.85rem; margin-bottom: 1rem;">Control what each person receives. Hover over column headers for details.</p>
          <table class="recipients-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th title="Receive daily/weekly email digest summaries with upcoming events">Digests <span style="cursor: help; color: #9ca3af;">ⓘ</span></th>
                <th title="Receive individual emails forwarded from the system">Forwarding <span style="cursor: help; color: #9ca3af;">ⓘ</span></th>
                <th title="Receive notifications about processing errors or issues">Errors <span style="cursor: help; color: #9ca3af;">ⓘ</span></th>
                <th title="Receive notifications when items need review or approval">Approvals <span style="cursor: help; color: #9ca3af;">ⓘ</span></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="recipientsList">
              <tr><td colspan="7" style="text-align: center; color: #9ca3af; padding: 2rem;">Loading...</td></tr>
            </tbody>
          </table>
        </div>

        <script>
          const API_BASE = '/api/recipients';

          async function loadRecipients() {
            try {
              const response = await fetch(API_BASE);
              const recipients = await response.json();
              
              const tbody = document.getElementById('recipientsList');
              if (recipients.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No recipients yet. Add one above.</td></tr>';
                return;
              }

              tbody.innerHTML = recipients.map(r => \`
                <tr>
                  <td><strong>\${r.email}</strong></td>
                  <td>\${r.name || '-'}</td>
                  <td><input type="checkbox" \${r.receive_digests ? 'checked' : ''} onchange="updateRecipient('\${r.email}', 'receiveDigests', this.checked)" /></td>
                  <td><input type="checkbox" \${r.receive_forwarding ? 'checked' : ''} onchange="updateRecipient('\${r.email}', 'receiveForwarding', this.checked)" /></td>
                  <td><input type="checkbox" \${r.receive_errors ? 'checked' : ''} onchange="updateRecipient('\${r.email}', 'receiveErrors', this.checked)" /></td>
                  <td><input type="checkbox" \${r.receive_approvals ? 'checked' : ''} onchange="updateRecipient('\${r.email}', 'receiveApprovals', this.checked)" /></td>
                  <td><button class="delete" onclick="deleteRecipient('\${r.email}')">Delete</button></td>
                </tr>
              \`).join('');
            } catch (error) {
              showMessage('Failed to load recipients', 'error');
            }
          }

          async function addRecipient() {
            const email = document.getElementById('newEmail').value.trim();
            const name = document.getElementById('newName').value.trim();

            if (!email) {
              showMessage('Email is required', 'error');
              return;
            }

            try {
              const response = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name: name || '' })
              });

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error);
              }

              showMessage('Recipient added successfully', 'success');
              document.getElementById('newEmail').value = '';
              document.getElementById('newName').value = '';
              loadRecipients();
            } catch (error) {
              showMessage(error.message, 'error');
            }
          }

          async function updateRecipient(email, field, value) {
            try {
              const body = {};
              body[field] = value;
              
              const response = await fetch(\`\${API_BASE}/\${email}\`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
              });

              if (!response.ok) {
                throw new Error('Failed to update recipient');
              }

              showMessage('Recipient updated', 'success');
            } catch (error) {
              showMessage(error.message, 'error');
              loadRecipients(); // Reload to reset checkboxes
            }
          }

          async function deleteRecipient(email) {
            if (!confirm(\`Delete \${email}?\`)) return;

            try {
              const response = await fetch(\`\${API_BASE}/\${email}\`, { method: 'DELETE' });
              if (!response.ok) throw new Error('Failed to delete');
              
              showMessage('Recipient deleted', 'success');
              loadRecipients();
            } catch (error) {
              showMessage(error.message, 'error');
            }
          }

          function showMessage(msg, type) {
            const el = document.getElementById('message');
            el.textContent = msg;
            el.className = 'message show ' + type;
            setTimeout(() => el.classList.remove('show'), 4000);
          }

          // Load on page load
          loadRecipients();
        </script>
      </body>
      </html>
    `;
  }

  private successPage(message: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Success</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          }
          h1 { color: #10b981; margin-bottom: 1rem; }
          p { color: #666; margin-bottom: 2rem; }
          a { color: #667eea; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ ${message}</h1>
          <p>You can close this window or return to the <a href="/">dashboard</a></p>
        </div>
      </body>
      </html>
    `;
  }

  private errorPage(message: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          }
          h1 { color: #ef4444; margin-bottom: 1rem; }
          p { color: #666; margin-bottom: 2rem; }
          a { color: #667eea; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✗ Error</h1>
          <p>${message}</p>
          <p>Return to <a href="/">dashboard</a></p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Read-only dashboard page for family members
   */
  private readOnlyDashboardPage(viewerName: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Family Concierge - ${viewerName}'s View</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
            color: #333;
            min-height: 100vh;
          }
          header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1.5rem 2rem;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
          }
          header h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
          header p { opacity: 0.9; font-size: 0.95rem; }
          .read-only-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.8rem;
            margin-top: 0.5rem;
          }
          main { max-width: 1200px; margin: 0 auto; padding: 2rem; }
          .section {
            background: white;
            border-radius: 16px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
          }
          .section-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1rem;
            padding-bottom: 0.75rem;
            border-bottom: 2px solid #f0f0f0;
          }
          .section-header h2 { font-size: 1.25rem; color: #333; }
          .section-icon { font-size: 1.5rem; }
          .item {
            padding: 1rem;
            border-radius: 12px;
            margin-bottom: 0.75rem;
            background: #f8f9fc;
            border-left: 4px solid #667eea;
          }
          .item-header { font-weight: 600; color: #333; margin-bottom: 0.25rem; }
          .item-meta { font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; }
          .item-snippet { font-size: 0.9rem; color: #555; line-height: 1.5; }
          .expand-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 0.4rem 0.8rem;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            margin-top: 0.5rem;
          }
          .expand-btn:hover { background: #5a6fd6; }
          .email-body {
            display: none;
            margin-top: 1rem;
            padding: 1rem;
            background: white;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
            max-height: 400px;
            overflow-y: auto;
          }
          .email-body.show { display: block; }
          .gmail-link {
            display: inline-block;
            margin-top: 0.5rem;
            color: #667eea;
            text-decoration: none;
            font-size: 0.85rem;
          }
          .gmail-link:hover { text-decoration: underline; }
          .empty { text-align: center; padding: 2rem; color: #888; }
          .loading { text-align: center; padding: 2rem; color: #666; }
        </style>
      </head>
      <body>
        <header>
          <h1>📅 Family Concierge</h1>
          <p>Welcome, ${viewerName}</p>
          <span class="read-only-badge">👁️ View Only</span>
        </header>
        <main>
          <div class="section">
            <div class="section-header">
              <span class="section-icon">📅</span>
              <h2>What's Coming Up</h2>
            </div>
            <div id="upcoming" class="loading">Loading upcoming events...</div>
          </div>

          <div class="section">
            <div class="section-header">
              <span class="section-icon">📬</span>
              <h2>Weekly Catch-Up</h2>
            </div>
            <div id="newsletters" class="loading">Loading newsletters...</div>
          </div>

          <div class="section">
            <div class="section-header">
              <span class="section-icon">📧</span>
              <h2>Emails Worth Reading</h2>
            </div>
            <div id="emails" class="loading">Loading emails...</div>
          </div>
        </main>

        <script>
          async function loadData() {
            // Load upcoming events
            try {
              const upcomingRes = await fetch('/api/upcoming');
              const upcomingData = await upcomingRes.json();
              renderUpcoming(upcomingData);
            } catch (e) {
              document.getElementById('upcoming').innerHTML = '<div class="empty">Unable to load events</div>';
            }

            // Load newsletters
            try {
              const nlRes = await fetch('/api/newsletters');
              const newsletters = await nlRes.json();
              renderNewsletters(newsletters);
            } catch (e) {
              document.getElementById('newsletters').innerHTML = '<div class="empty">Unable to load newsletters</div>';
            }

            // Load worth-reading emails
            try {
              const emailRes = await fetch('/api/worth-reading');
              const emails = await emailRes.json();
              renderEmails(emails);
            } catch (e) {
              document.getElementById('emails').innerHTML = '<div class="empty">Unable to load emails</div>';
            }
          }

          function renderUpcoming(data) {
            const container = document.getElementById('upcoming');
            if (!data.events || data.events.length === 0) {
              container.innerHTML = '<div class="empty">No upcoming events</div>';
              return;
            }

            container.innerHTML = data.events.map(event => \`
              <div class="item">
                <div class="item-header">\${event.symbol || '📅'} \${event.title}</div>
                <div class="item-meta">
                  \${new Date(event.startDateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  at \${new Date(event.startDateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  \${event.location ? '• ' + event.location : ''}
                  \${event.person ? '• ' + event.person : ''}
                </div>
              </div>
            \`).join('');
          }

          function renderNewsletters(newsletters) {
            const container = document.getElementById('newsletters');
            if (!newsletters || newsletters.length === 0) {
              container.innerHTML = '<div class="empty">No newsletters this week</div>';
              return;
            }

            container.innerHTML = newsletters.map(nl => \`
              <div class="item">
                <div class="item-header">\${nl.subject}</div>
                <div class="item-meta">From: \${nl.from_name || nl.from_email} • \${nl.days_ago} days ago</div>
                <div class="item-snippet">\${nl.snippet || ''}</div>
                <button class="expand-btn" onclick="toggleEmailBody('\${nl.id}', this)">Read Full Email</button>
                <div class="email-body" id="body-\${nl.id}"></div>
                \${nl.message_id ? \`<a class="gmail-link" href="https://mail.google.com/mail/u/0/#inbox/\${nl.message_id}" target="_blank">Open in Gmail →</a>\` : ''}
              </div>
            \`).join('');
          }

          function renderEmails(emails) {
            const container = document.getElementById('emails');
            if (!emails || emails.length === 0) {
              container.innerHTML = '<div class="empty">No emails to show</div>';
              return;
            }

            container.innerHTML = emails.map(email => \`
              <div class="item">
                <div class="item-header">\${email.subject}</div>
                <div class="item-meta">From: \${email.from_name || email.from_email} • \${email.days_ago} days ago</div>
                <div class="item-snippet">\${email.snippet || ''}</div>
                <button class="expand-btn" onclick="toggleEmailBody('\${email.id}', this)">Read Full Email</button>
                <div class="email-body" id="body-\${email.id}"></div>
                \${email.message_id ? \`<a class="gmail-link" href="https://mail.google.com/mail/u/0/#inbox/\${email.message_id}" target="_blank">Open in Gmail →</a>\` : ''}
              </div>
            \`).join('');
          }

          async function toggleEmailBody(id, btn) {
            const bodyEl = document.getElementById('body-' + id);
            if (bodyEl.classList.contains('show')) {
              bodyEl.classList.remove('show');
              btn.textContent = 'Read Full Email';
              return;
            }

            btn.textContent = 'Loading...';
            try {
              const res = await fetch('/api/email/' + id + '/body');
              const data = await res.json();
              if (data.html) {
                bodyEl.innerHTML = data.html;
              } else if (data.text) {
                bodyEl.innerHTML = '<pre style="white-space: pre-wrap;">' + data.text + '</pre>';
              } else {
                bodyEl.innerHTML = '<em>No content available</em>';
              }
              bodyEl.classList.add('show');
              btn.textContent = 'Hide Email';
            } catch (e) {
              bodyEl.innerHTML = '<em>Failed to load email content</em>';
              bodyEl.classList.add('show');
              btn.textContent = 'Hide Email';
            }
          }

          loadData();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Start the web server
   */
  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`\n🌐 Web server started on http://localhost:${this.port}`);
        resolve();
      });
    });
  }
}
