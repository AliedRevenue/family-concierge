/**
 * Audit script: Find all email senders mentioning your kids
 * Compare against watched domains to identify gaps
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';
import { GmailConnector } from '../dist/core/gmail-connector.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const TOKEN_PATH = join(__dirname, '..', 'oauth-tokens', 'token.json');

async function auditSources() {
  // Set up OAuth
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    console.error('Missing OAuth credentials in .env');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (!existsSync(TOKEN_PATH)) {
    console.error('No OAuth token found. Run the main app first to authorize.');
    process.exit(1);
  }

  const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
  oauth2Client.setCredentials(token);

  const gmail = new GmailConnector(oauth2Client);

  // Search for Colin/Henry emails in last 30 days, ANY sender
  const query = 'after:2024/12/24 ("Colin" OR "Henry") -from:me';
  console.log('Searching Gmail for:', query);
  console.log('');

  const messageIds = await gmail.listMessages(query, 100);
  console.log(`Found ${messageIds.length} messages\n`);

  // Extract unique sender domains
  const domains = new Map();
  for (const msgId of messageIds) {
    const full = await gmail.getMessage(msgId);
    if (!full) continue;

    const fromHeader = full.payload?.headers?.find(h => h.name === 'From');
    if (fromHeader) {
      const match = fromHeader.value.match(/@([a-zA-Z0-9.-]+)/);
      if (match) {
        const domain = match[1].toLowerCase();
        const subject = full.payload?.headers?.find(h => h.name === 'Subject')?.value || '(no subject)';
        if (!domains.has(domain)) {
          domains.set(domain, []);
        }
        domains.get(domain).push(subject.substring(0, 60));
      }
    }
  }

  // Sort by count
  const sorted = [...domains.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('=== DOMAINS SENDING EMAILS ABOUT YOUR KIDS (last 30 days) ===\n');
  const watched = ['waterfordschool.org', 'veracross.com', 'waterford'];

  for (const [domain, subjects] of sorted) {
    const isWatched = watched.some(w => domain.includes(w));
    const status = isWatched ? '✓ WATCHED' : '⚠ NOT WATCHED';
    console.log(`${status}: ${domain} (${subjects.length} emails)`);
    subjects.slice(0, 2).forEach(s => console.log(`   - ${s}`));
    console.log('');
  }

  // Summary
  const unwatched = sorted.filter(([d]) => !watched.some(w => d.includes(w)));
  console.log('=== SUMMARY ===');
  console.log(`Total domains: ${sorted.length}`);
  console.log(`Watched: ${sorted.length - unwatched.length}`);
  console.log(`NOT watched: ${unwatched.length}`);

  if (unwatched.length > 0) {
    console.log('\nUnwatched domains to review:');
    unwatched.forEach(([d, subjects]) => {
      console.log(`  - ${d} (${subjects.length} emails)`);
    });
  }
}

auditSources().catch(console.error);
