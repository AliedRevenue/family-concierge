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
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CATEGORY_PREFERENCES } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  private approvalSessions = new Map<string, ApprovalSession>();

  constructor(db: DatabaseClient, digestBuilder: DigestBuilder, emailSender: EmailSender, port: number = 5000) {
    this.app = express();
    this.port = port;
    this.db = db;
    this.digestBuilder = digestBuilder;
    this.emailSender = emailSender;

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
    this.app.get('/', (req: Request, res: Response) => {
      res.send(this.dashboardPage());
    });

    // API: Get pending emails
    this.app.get('/api/pending', (_req: Request, res: Response) => {
      try {
        // Get pending approvals from database (default to 'school' pack for now)
        const pending = this.db.getPendingApprovals('school');
        
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
        }));

        res.json({
          pending: formatted,
          total: formatted.length,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending emails' });
      }
    });

    // Approve email via token
    this.app.get('/approve/:token', (req: Request, res: Response): void => {
      try {
        const { token } = req.params;
        const approval = this.db.getPendingApprovalById(token);

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
        this.db.updatePendingApproval(token, {
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
    this.app.get('/reject/:token', (req: Request, res: Response): void => {
      try {
        const { token } = req.params;
        const approval = this.db.getPendingApprovalById(token);

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
        this.db.updatePendingApproval(token, {
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
    this.app.post('/api/mark-missed', (req: Request, res: Response) => {
      try {
        const { messageId, packId, fromEmail, fromName, subject, snippet, reason } = req.body;

        if (!messageId || !packId) {
          res.status(400).json({ error: 'Missing messageId or packId' });
          return;
        }

        // Insert into discovery_false_negatives table
        this.db.insertDiscoveryFalseNegative({
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
    this.app.get('/api/discovery-metrics/:packId', (req: Request, res: Response) => {
      try {
        const { packId } = req.params;

        // Get latest run stats
        const runStats = this.db.getDiscoveryRunStats(packId, 1);
        const latestRun = runStats.length > 0 ? runStats[0] : null;

        // Get false negatives count
        const falseNegatives = this.db.getDiscoveryFalseNegatives(packId);

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
    this.app.get('/api/categories/:packId', (req: Request, res: Response) => {
      try {
        const { packId } = req.params;

        // Get saved preferences or defaults
        const saved = this.db.getCategoryPreferences(packId);
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
    this.app.post('/api/categories/:packId', (req: Request, res: Response) => {
      try {
        const { packId } = req.params;
        const { enabled, sensitivity } = req.body;

        console.log(`[API] POST /api/categories/${packId}`, { enabled, sensitivity });

        if (!enabled || !sensitivity) {
          console.log('[API] Validation failed: missing fields');
          res.status(400).json({ error: 'Missing enabled or sensitivity fields' });
          return;
        }

        this.db.saveCategoryPreferences(packId, { enabled, sensitivity });
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
    this.app.get('/api/recipients', (_req: Request, res: Response) => {
      try {
        const recipients = this.db.getAllRecipients();
        res.json(recipients);
      } catch (error) {
        console.error('[API] Error fetching recipients:', error);
        res.status(500).json({ error: 'Failed to fetch recipients' });
      }
    });

    // POST /api/recipients - Add new recipient
    this.app.post('/api/recipients', (req: Request, res: Response) => {
      try {
        const { email, name, receiveDigests, receiveForwarding, receiveErrors, receiveApprovals } = req.body;

        if (!email) {
          res.status(400).json({ error: 'Email is required' });
          return;
        }

        if (this.db.recipientExists(email)) {
          res.status(400).json({ error: 'Recipient already exists' });
          return;
        }

        this.db.addRecipient(email, name || '', {
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
    this.app.put('/api/recipients/:email', (req: Request, res: Response) => {
      try {
        const { email } = req.params;
        const { name, receiveDigests, receiveForwarding, receiveErrors, receiveApprovals } = req.body;

        const preferences: any = {};
        if (name !== undefined) preferences.name = name;
        if (receiveDigests !== undefined) preferences.receiveDigests = receiveDigests;
        if (receiveForwarding !== undefined) preferences.receiveForwarding = receiveForwarding;
        if (receiveErrors !== undefined) preferences.receiveErrors = receiveErrors;
        if (receiveApprovals !== undefined) preferences.receiveApprovals = receiveApprovals;

        this.db.updateRecipient(email, preferences);
        res.json({ success: true, email });
      } catch (error) {
        console.error('[API] Error updating recipient:', error);
        res.status(500).json({ error: 'Failed to update recipient' });
      }
    });

    // DELETE /api/recipients/:email - Delete recipient
    this.app.delete('/api/recipients/:email', (req: Request, res: Response) => {
      try {
        const { email } = req.params;
        this.db.deleteRecipient(email);
        res.json({ success: true, email });
      } catch (error) {
        console.error('[API] Error deleting recipient:', error);
        res.status(500).json({ error: 'Failed to delete recipient' });
      }
    });

    // GET /recipients-page - Recipient management UI
    this.app.get('/recipients-page', (_req: Request, res: Response) => {
      res.send(this.recipientManagementPage());
    });

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  private dashboardPage(): string {
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

          .email-item {
            border-left: 4px solid #667eea;
            padding: 1.5rem;
            margin-bottom: 1rem;
            background: #f9fafb;
            border-radius: 4px;
            transition: all 0.2s;
          }

          .email-item:hover {
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
          }

          .email-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 0.5rem;
          }

          .email-from {
            font-weight: 600;
            color: #667eea;
          }

          .email-date {
            font-size: 0.85rem;
            color: #999;
          }

          .email-subject {
            font-size: 1rem;
            margin: 0.5rem 0;
            color: #333;
          }

          .email-snippet {
            font-size: 0.9rem;
            color: #666;
            margin: 1rem 0;
            line-height: 1.5;
          }

          .email-actions {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
          }

          .btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 4px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-approve {
            background: #10b981;
            color: white;
          }

          .btn-approve:hover {
            background: #059669;
          }

          .btn-reject {
            background: #ef4444;
            color: white;
          }

          .btn-reject:hover {
            background: #dc2626;
          }

          .btn-missed {
            background: #f59e0b;
            color: white;
          }

          .btn-missed:hover {
            background: #d97706;
          }

          .empty-state {
            text-align: center;
            padding: 3rem 1rem;
            color: #999;
          }

          .empty-state svg {
            width: 80px;
            height: 80px;
            margin-bottom: 1rem;
            opacity: 0.3;
          }

          .loading {
            text-align: center;
            padding: 2rem;
            color: #667eea;
          }

          .error {
            background: #fee;
            color: #c33;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
          }

          .success {
            background: #efe;
            color: #3c3;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
          }

          .category-section {
            margin-bottom: 2rem;
          }

          .category-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
          }

          .category-item {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 1rem;
            background: #fafafa;
          }

          .category-item label {
            display: flex;
            align-items: center;
            font-weight: 600;
            margin-bottom: 0.5rem;
            cursor: pointer;
          }

          .category-item input[type="checkbox"] {
            margin-right: 0.75rem;
            cursor: pointer;
            width: 18px;
            height: 18px;
          }

          .category-item select {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 0.9rem;
            margin-top: 0.5rem;
          }

          .category-help {
            font-size: 0.85rem;
            color: #666;
            margin-top: 0.5rem;
            line-height: 1.4;
          }

          .save-button {
            background: #667eea;
            color: white;
            padding: 0.75rem 2rem;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.95rem;
            margin-top: 1.5rem;
          }

          .save-button:hover {
            background: #5568d3;
          }
        </style>
      </head>
      <body>
        <header>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h1>📧 Family Concierge</h1>
              <p>Manage email categories and approve emails for your digest</p>
            </div>
            <a href="/recipients-page" style="background: rgba(255,255,255,0.2); color: white; padding: 0.75rem 1.5rem; border-radius: 4px; text-decoration: none; font-weight: 500; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">👥 Recipients</a>
          </div>
        </header>

        <div class="container">
          <!-- Category Selection Section -->
          <div class="section category-section">
            <h2>📂 Email Categories</h2>
            <p style="margin-bottom: 1.5rem; color: #666;">Choose which types of emails to include and how strict to filter them.</p>
            <div id="category-container" class="category-list">
              <div class="loading">Loading categories...</div>
            </div>
            <button class="save-button" onclick="saveCategories()">Save Preferences</button>
          </div>

          <!-- Pending Emails Section -->
          <div class="section">
            <h2>Pending Emails</h2>
            <div id="pending-container">
              <div class="loading">Loading emails...</div>
            </div>
          </div>
        </div>

        <script>
          let categoryPreferences = {};

          async function loadCategories() {
            try {
              const response = await fetch('/api/categories/school');
              const data = await response.json();

              categoryPreferences = data.currentPreferences;
              const container = document.getElementById('category-container');

              container.innerHTML = data.available.map(cat => \`
                <div class="category-item">
                  <label>
                    <input type="checkbox" name="cat-\${cat.id}" \${data.currentPreferences.enabled.includes(cat.id) ? 'checked' : ''}>
                    \${cat.label}
                  </label>
                  <select name="sens-\${cat.id}">
                    <option value="conservative" \${data.currentPreferences.sensitivity[cat.id] === 'conservative' ? 'selected' : ''}>Conservative (≥0.85)</option>
                    <option value="balanced" \${data.currentPreferences.sensitivity[cat.id] === 'balanced' ? 'selected' : ''}>Balanced (≥0.75)</option>
                    <option value="broad" \${data.currentPreferences.sensitivity[cat.id] === 'broad' ? 'selected' : ''}>Broad (≥0.65)</option>
                    <option value="off" \${data.currentPreferences.sensitivity[cat.id] === 'off' ? 'selected' : ''}>Off (disabled)</option>
                  </select>
                  <div class="category-help">\${cat.description}</div>
                </div>
              \`).join('');
            } catch (error) {
              document.getElementById('category-container').innerHTML = \`
                <div class="error">Error loading categories: \${error.message}</div>
              \`;
            }
          }

          async function saveCategories() {
            try {
              const enabled = [];
              const sensitivity = {};

              document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                const catId = checkbox.name.replace('cat-', '');
                if (checkbox.checked) {
                  enabled.push(catId);
                }
              });

              document.querySelectorAll('select').forEach(select => {
                const catId = select.name.replace('sens-', '');
                sensitivity[catId] = select.value;
              });

              const response = await fetch('/api/categories/school', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled, sensitivity })
              });

              if (response.ok) {
                alert('Category preferences saved!');
                categoryPreferences = { enabled, sensitivity };
              } else {
                alert('Failed to save preferences');
              }
            } catch (error) {
              alert('Error saving preferences: ' + error.message);
            }
          }

          async function loadPendingEmails() {
            try {
              const response = await fetch('/api/pending');
              const data = await response.json();

              const container = document.getElementById('pending-container');

              if (data.pending.length === 0) {
                container.innerHTML = \`
                  <div class="empty-state">
                    <p>✓ All caught up!</p>
                    <p>No pending emails to review.</p>
                  </div>
                \`;
                return;
              }

              container.innerHTML = data.pending.map(email => \`
                <div class="email-item">
                  <div class="email-header">
                    <div class="email-from">\${email.fromName || email.fromEmail || 'Unknown Sender'}</div>
                    <div class="email-date">\${new Date(email.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div class="email-subject">\${email.subject || 'No subject'}</div>
                  <div class="email-snippet">\${email.snippet || '(no preview)'}</div>
                  <div class="email-actions">
                    <button class="btn btn-approve" onclick="approveEmail('\${email.id}')">
                      ✓ Approve
                    </button>
                    <button class="btn btn-reject" onclick="rejectEmail('\${email.id}')">
                      ✗ Reject
                    </button>
                    <button class="btn btn-missed" onclick="markAsMissed('\${email.id}', '\${email.packId}', '\${email.fromEmail}', '\${email.fromName}', '\${email.subject}', '\${email.snippet}')">
                      ! Missed by discovery
                    </button>
                  </div>
                </div>
              \`).join('');
            } catch (error) {
              document.getElementById('pending-container').innerHTML = \`
                <div class="error">Error loading emails: \${error.message}</div>
              \`;
            }
          }

          async function approveEmail(token) {
            try {
              const response = await fetch(\`/approve/\${token}\`);
              if (response.ok) {
                alert('Email approved! ✓');
                loadPendingEmails();
              }
            } catch (error) {
              alert('Error approving email');
            }
          }

          async function rejectEmail(token) {
            try {
              const response = await fetch(\`/reject/\${token}\`);
              if (response.ok) {
                alert('Email rejected! ✗');
                loadPendingEmails();
              }
            } catch (error) {
              alert('Error rejecting email');
            }
          }

          async function markAsMissed(id, packId, fromEmail, fromName, subject, snippet) {
            try {
              const response = await fetch('/api/mark-missed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  messageId: id,
                  packId: packId,
                  fromEmail: fromEmail,
                  fromName: fromName,
                  subject: subject,
                  snippet: snippet,
                  reason: 'user_marked_from_dashboard'
                })
              });
              if (response.ok) {
                alert('Thanks! This helps us improve discovery.');
                loadPendingEmails();
              }
            } catch (error) {
              alert('Error marking email as missed');
            }
          }

          // Load categories and emails on page load and refresh emails every 5 seconds
          loadCategories();
          loadPendingEmails();
          setInterval(loadPendingEmails, 5000);

          // Refresh every 30 seconds
          setInterval(loadPendingEmails, 30000);
        </script>
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
            <h3 style="margin-bottom: 1rem; color: #374151;">Add New Recipient</h3>
            <div class="form-group">
              <input type="email" id="newEmail" placeholder="Email address" />
              <input type="text" id="newName" placeholder="Name (optional)" />
              <button onclick="addRecipient()">Add Recipient</button>
            </div>
          </div>

          <h3 style="color: #374151; margin-bottom: 1rem;">Recipients</h3>
          <table class="recipients-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Digests</th>
                <th>Forwarding</th>
                <th>Errors</th>
                <th>Approvals</th>
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
