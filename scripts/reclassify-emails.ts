/**
 * Re-classify existing emails using AI
 * Run with: npx tsx scripts/reclassify-emails.ts
 */

import Database from 'better-sqlite3';
import { EmailClassifier } from '../src/core/email-classifier.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const db = new Database('./data/fca.db');
  const classifier = new EmailClassifier(apiKey);

  // Get obligations missing dates (likely have dates in subject we can extract)
  const emails = db.prepare(`
    SELECT id, subject, snippet, from_name, from_email, email_body_text, email_body_html
    FROM pending_approvals
    WHERE item_type = 'obligation' AND obligation_date IS NULL
  `).all() as any[];

  console.log(`Found ${emails.length} emails to classify\n`);

  const updateStmt = db.prepare(`
    UPDATE pending_approvals
    SET item_type = ?, obligation_date = ?, classification_confidence = ?, classification_reasoning = ?, classified_at = ?
    WHERE id = ?
  `);

  let obligations = 0;
  let announcements = 0;

  for (const email of emails) {
    console.log(`📧 ${email.subject}`);

    try {
      const result = await classifier.classifyEmail({
        subject: email.subject,
        snippet: email.snippet,
        fromName: email.from_name,
        fromEmail: email.from_email,
        bodyText: email.email_body_text,
        bodyHtml: email.email_body_html,
      });

      updateStmt.run(
        result.itemType,
        result.obligationDate,
        result.confidence,
        result.reasoning,
        new Date().toISOString(),
        email.id
      );

      const emoji = result.itemType === 'obligation' ? '📅' : '📰';
      console.log(`   ${emoji} ${result.itemType}${result.obligationDate ? ` (${result.obligationDate})` : ''}`);
      console.log(`   💭 ${result.reasoning}\n`);

      if (result.itemType === 'obligation') obligations++;
      else announcements++;

    } catch (error) {
      console.error(`   ❌ Error:`, error);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   📅 Obligations: ${obligations}`);
  console.log(`   📰 Announcements: ${announcements}`);

  db.close();
}

main().catch(console.error);
