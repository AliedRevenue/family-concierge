/**
 * Main Entry Point
 * Initialize and run the Family Concierge Agent
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
dotenv.config({ path: resolve(process.cwd(), '.env') });
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { startOAuthServer } from './auth/oauth-server.js';
import { DatabaseClient } from './database/client.js';
import { MigrationRunner } from './database/migrate.js';
import { Logger } from './utils/logger.js';
import { ConfigLoader } from './core/config-loader.js';
import { PackRegistry } from './core/pack-registry.js';
import { GmailConnector } from './core/gmail-connector.js';
import { CalendarWriter } from './core/calendar-writer.js';
import { EventExtractor } from './core/event-extractor.js';
import { DiscoveryEngine } from './core/discovery-engine.js';
import { AgentOrchestrator } from './core/agent-orchestrator.js';
import { DigestBuilder } from './core/digest-builder.js';
import { EmailSender } from './core/email-sender.js';
import { BackfillCommand } from './backfill.js';
import { SchoolPack } from './packs/index.js';
import { WebServer } from './web/web-server.js';
import type { AgentMode } from './types/index.js';

const TOKEN_PATH = './oauth-tokens/token.json';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * Main application
 */
async function main(): Promise<void> {
  console.log('🚀 Family Concierge Agent - Starting...\n');

  // 1. Initialize database
  const dbPath = process.env.DATABASE_PATH || './data/fca.db';
  ensureDirectoryExists(dbPath);

  console.log('📦 Initializing database...');
  console.log('   DB PATH:', resolve(dbPath));
  const db = new DatabaseClient(dbPath);
  db.healCategoryPreferencesSchema(); // Auto-fix FK constraint if present
  const migrationRunner = new MigrationRunner(db.getConnection());
  migrationRunner.migrate();
  migrationRunner.close();
  const logger = new Logger(db);

  // 2. Load configuration
  const configPath = process.env.CONFIG_PATH || './config/agent-config.yaml';
  let config;

  console.log('📋 Loading configuration...');
  console.log('   CONFIG PATH:', resolve(configPath));
  
  if (!existsSync(configPath)) {
    console.log('⚠️  No config found. Creating default config...');
    config = ConfigLoader.createDefault();
    // In production, you'd guide user through setup/discovery here
  } else {
    try {
      config = ConfigLoader.load(configPath);
    } catch (e) {
      console.error('❌ Failed to load config:', e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }
  
  console.log('   Config loaded:', !!config, '| Digests:', !!config?.digests, '| Notifications:', !!config?.notifications);

  // Get packs from config for use in various commands
  const packs = config?.packs || [];

  // 3. Setup OAuth
  console.log('🔐 Setting up OAuth...');
  const auth = await getAuthClient();

  // 4. Initialize components
  console.log('🔧 Initializing components...');
  const gmail = new GmailConnector(auth);
  const gmailApi = google.gmail({ version: 'v1', auth });
  const calendar = new CalendarWriter(auth);
  const extractor = new EventExtractor();

  // 5. Register packs
  const packRegistry = new PackRegistry();
  packRegistry.register(SchoolPack);
  console.log(`📦 Registered ${packRegistry.count()} pack(s)`);

  // 5b. Create digest builder and email sender (used by both web server and commands)
  const digestBuilder = new DigestBuilder(db);
  const emailSender = new EmailSender(gmailApi);

  // 6. Determine mode
  const mode = (process.env.AGENT_MODE as AgentMode) || 'copilot';
  console.log(`🤖 Running in ${mode.toUpperCase()} mode\n`);

  // 7. Check command
  const command = process.argv[2];

  if (command === 'discover') {
    // Discovery mode
    const packId = process.argv[3] || 'school';
    const pack = packRegistry.get(packId);

    if (!pack) {
      console.error(`❌ Pack not found: ${packId}`);
      process.exit(1);
    }

    // Find user's config for this pack
    const userPackConfig = config.packs?.find((p: any) => p.packId === packId);

    console.log(`🔍 Running discovery for pack: ${pack.name}\n`);

    const discoveryEngine = new DiscoveryEngine(gmail, db, logger);
    const session = await discoveryEngine.runDiscovery(pack, config.processing.lookbackDays, userPackConfig?.config);

    console.log('\n✅ Discovery completed!');
    console.log('\n📊 Stats:');
    console.log(`   Emails scanned: ${session.output.stats.totalEmailsScanned}`);
    console.log(`   Relevant emails: ${session.output.stats.relevantEmailsFound}`);
    console.log(`   Unique senders: ${session.output.stats.uniqueSendersFound}`);
    console.log(`   Unique domains: ${session.output.stats.uniqueDomainsFound}`);
    console.log(`   ICS attachments: ${session.output.stats.icsAttachmentsFound}`);
    console.log(`   Avg confidence: ${session.output.stats.averageConfidence.toFixed(2)}`);

    console.log('\n💡 Proposed configuration:');
    console.log(`   Sources: ${session.output.proposedConfig.sources.length}`);
    console.log(`   Keywords: ${session.output.proposedConfig.keywords.length}`);
    console.log(`   Platforms: ${session.output.proposedConfig.platforms.length}`);

    console.log('\n👉 Review discovery results in database and update your config.');
  } else if (command === 'digest') {
    // Generate and send digest
    const mode = process.argv[3] === 'weekly' ? 'weekly' : 'daily';
    console.log(`📧 Generating ${mode} digest...\n`);

    const digestBuilder = new DigestBuilder(db);
    const emailSender = new EmailSender(gmailApi);

    // Get date range (default: last 7 days)
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    // Generate digest based on mode
    const digest = mode === 'weekly' 
      ? await digestBuilder.generateWeeklyReconciliation(from, to, packs, baseUrl)
      : await digestBuilder.generateDigest(from, to, baseUrl);

    // Check if digest has content
    if (!digest.sections || digest.sections.length === 0) {
      console.log('⚠️  No events or approved items found for this period.\n');
      console.log('Run discovery first to populate the database:');
      console.log('   npx tsx src/index.ts discover school\n');
      console.log('Then approve some items from the discovery results.\n');
      process.exit(0);
    }

    const htmlContent = digestBuilder.generateHTML(digest, baseUrl);
    const textContent = digestBuilder.generatePlainText(digest, baseUrl);

    // Show digest summary
    console.log(`📊 Digest Summary (${from} to ${to}):`);
    console.log(`   Mode: ${digest.mode || 'daily'}`);
    console.log(`   Events Created: ${digest.stats.eventsCreated}`);
    console.log(`   Pending Review: ${digest.stats.eventsPending}`);
    console.log(`   Approved & Discovered: ${digest.summary.approvedPending ?? 0}`);
    console.log(`   Emails Forwarded: ${digest.stats.emailsForwarded}`);
    console.log(`   Errors: ${digest.stats.errors}`);
    console.log(`   Emails Scanned: ${digest.stats.emailsScanned}\n`);

    // Get recipients from database (who have digest notifications enabled)
    const recipients = db.getRecipientsByNotificationType('digests');

    // Fallback to config if no database recipients set up yet
    if (recipients.length === 0) {
      const fallbackRecipients = 
        config?.digests?.recipients ?? 
        (config?.digests?.recipient ? [config.digests.recipient] : undefined) ??
        (config?.notifications?.email ? [config.notifications.email] : undefined) ??
        [];

      if (fallbackRecipients.length === 0) {
        console.error('❌ No recipients configured for digest.');
        console.error('   Set recipients via /recipients-page or in config.digests.recipients');
        process.exit(1);
      }

      console.log(`📧 Using recipients from config (no database recipients yet)...`);
      await emailSender.sendDigest(digest, fallbackRecipients, textContent, htmlContent);
      console.log(`✅ Digest sent to ${fallbackRecipients.join(', ')}`);
    } else {
      await emailSender.sendDigest(digest, recipients, textContent, htmlContent);
      console.log(`✅ Digest sent to ${recipients.join(', ')}`);
    }
  } else if (command === 'dismiss') {
    // Dismiss an item (deferred or pending approval)
    const itemId = process.argv[3];
    const reason = process.argv.slice(4).join(' ');

    if (!itemId) {
      console.error('❌ Error: Item ID required');
      console.error('Usage: npx tsx src/index.ts dismiss <item-id> <reason>');
      console.error('Example: npx tsx src/index.ts dismiss abc123 "not doing soccer this season"');
      process.exit(1);
    }

    if (!reason) {
      console.error('❌ Error: Dismissal reason required');
      console.error('Usage: npx tsx src/index.ts dismiss <item-id> <reason>');
      process.exit(1);
    }

    // Check if item exists in pending_approvals
    const pendingItem = db.getPendingApprovalById(itemId);
    
    if (pendingItem) {
      // Dismiss pending approval item
      db.dismissItem(itemId, reason, {
        itemType: 'pending_approval',
        originalSubject: pendingItem.subject,
        originalFrom: pendingItem.from_email,
        originalDate: pendingItem.discovered_at,
        person: pendingItem.person,
        packId: pendingItem.pack_id,
      });

      // Delete from pending approvals
      db.deletePendingApproval(itemId);

      console.log(`\n⌀ Dismissed: ${pendingItem.subject}`);
      console.log(`   Reason: ${reason}`);
      console.log(`   Person: ${pendingItem.person || 'unassigned'}`);
      console.log(`   Action: Removed from pending queue\n`);
    } else {
      console.error(`❌ Error: Item ${itemId} not found in pending approvals`);
      console.error('   Run digest to see available items with IDs');
      process.exit(1);
    }
  } else if (command === 'audit') {
    // Configuration audit command
    const person = process.argv[3];
    
    if (!person) {
      console.error('❌ Error: Person name required');
      console.error('Usage: npx tsx src/index.ts audit <person>');
      console.error('Example: npx tsx src/index.ts audit emma');
      process.exit(1);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`FAMILY CONCIERGE AUDIT — ${person.charAt(0).toUpperCase() + person.slice(1)}`);
    console.log(`Generated: ${new Date().toLocaleString()}`);
    console.log('='.repeat(80));

    // Get pack configuration for this person
    const schoolPack = packs.find((p: any) => p.packId === 'school');
    
    console.log('\n📧 EMAIL DOMAINS WATCHED');
    if (schoolPack && schoolPack.config?.sources && schoolPack.config.sources.length > 0) {
      console.log('  ✓ School:');
      schoolPack.config.sources.forEach((source: any) => {
        const domains = source.fromDomains || [source.name || source];
        domains.forEach((domain: string) => {
          console.log(`    • ${domain} → Calendar + Digest`);
        });
      });
    } else {
      console.log('  ⚠️  No school sources configured');
    }

    // Show deferred items
    console.log('\n⏳ DEFERRED ITEMS (need attention)');
    const pendingItems = db.getPendingApprovals('school');
    const personItems = pendingItems.filter((item: any) => 
      item.person?.toLowerCase() === person.toLowerCase() && !item.approved
    );

    if (personItems.length === 0) {
      console.log('  [None]');
    } else {
      personItems.forEach((item: any, index: number) => {
        const deferredDays = Math.floor(
          (Date.now() - new Date(item.discovered_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        console.log(`  ${index + 1}. ? ${item.subject}`);
        console.log(`     Deferred since: ${new Date(item.discovered_at).toLocaleDateString()} (${deferredDays} days ago)`);
        console.log(`     Item ID: ${item.id}`);
        console.log(`     Dismiss: npx tsx src/index.ts dismiss ${item.id} "reason"`);
        console.log('');
      });
    }

    // Show dismissed items (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dismissedItems = db.getDismissedItemsByPerson(person.toLowerCase(), sevenDaysAgo);
    
    console.log('\n⌀ DISMISSED THIS WEEK');
    if (dismissedItems.length === 0) {
      console.log('  [None]');
    } else {
      dismissedItems.forEach((item: any) => {
        console.log(`  ⌀ ${item.original_subject || 'Unknown item'}`);
        console.log(`    Reason: "${item.reason}"`);
        console.log(`    Dismissed: ${new Date(item.dismissed_at).toLocaleDateString()}`);
        console.log('');
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('NEXT ACTIONS');
    console.log('='.repeat(80));
    console.log('\nTo dismiss an item:');
    console.log('  npx tsx src/index.ts dismiss <item-id> "reason"');
    console.log('\nTo see full configuration:');
    console.log('  cat config/agent-config.yaml\n');
  } else if (command === 'backfill') {
    // Backfill historical events
    const backfillCmd = new BackfillCommand(
      new AgentOrchestrator(config, mode, db, gmail, calendar, extractor, packRegistry, logger),
      logger
    );

    const options = BackfillCommand.parseArgs(process.argv.slice(3));
    await backfillCmd.execute(options);
  } else {
    // Normal agent run - start web server for dashboard
    console.log('🏃 Starting agent run...\n');

    // Start web server (dashboard + approvals)
    const webServer = new WebServer(db, digestBuilder, emailSender, 5000);
    await webServer.start();

    const orchestrator = new AgentOrchestrator(
      config,
      mode,
      db,
      gmail,
      calendar,
      extractor,
      packRegistry,
      logger
    );

    await orchestrator.run();

    console.log('\n✅ Agent run completed!');
  }

  console.log('\n👋 Done!\n');
}

/**
 * Get OAuth2 client (handles token refresh)
 */
async function getAuthClient(): Promise<OAuth2Client> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Load token if exists
  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  // Need to authorize - start OAuth server
  console.log('\n⚠️  No OAuth token found. Starting authorization flow...');
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  // Extract port from redirect URI
  const portMatch = redirectUri?.match(/:(\d+)/);
  const port = portMatch ? parseInt(portMatch[1], 10) : 3000;

  ensureDirectoryExists(TOKEN_PATH);

  // Start OAuth server (auto-opens browser, captures code, saves token)
  const authorizedClient = await startOAuthServer({
    oauth2Client,
    authUrl,
    tokenPath: TOKEN_PATH,
    port,
  });

  console.log('✅ Authorization complete! Continuing...\n');

  return authorizedClient;
}

/**
 * Ensure directory exists for a file path
 */
function ensureDirectoryExists(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Run
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
