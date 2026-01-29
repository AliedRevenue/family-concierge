/**
 * Re-assign existing discovered items with updated person assignment rules
 *
 * This script re-runs the person assignment logic on all discovered items
 * using the latest config, and updates any items where the assignment changes.
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';
import { createPersonAssignerFromConfig } from '../src/utils/person-assignment.js';
import { embeddedConfig } from '../config/agent-config-embedded.js';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!
});

async function run() {
  console.log('=== Re-assigning Discovered Items ===\n');

  // Create person assigner from embedded config
  const personAssigner = createPersonAssignerFromConfig(embeddedConfig);

  // Get all discovered items
  const items = await client.execute(`
    SELECT id, subject, snippet, from_email, from_name, body_text, assigned_to, source_name
    FROM discovered_items
    ORDER BY discovered_at DESC
  `);

  console.log(`Found ${items.rows.length} items to process\n`);

  let updated = 0;
  let unchanged = 0;
  const changes: Array<{ subject: string; from: string; to: string; reason: string }> = [];

  for (const row of items.rows) {
    const id = row.id as string;
    const subject = (row.subject as string) || '';
    const snippet = (row.snippet as string) || '';
    const fromEmail = (row.from_email as string) || '';
    const fromName = (row.from_name as string) || '';
    const bodyText = (row.body_text as string) || '';
    const currentAssignment = row.assigned_to as string;

    // Run person assignment with new rules
    const assignment = personAssigner.assign(
      subject,
      snippet.slice(0, 500),
      fromEmail,
      fromName,
      bodyText.slice(0, 2000)
    );

    if (assignment.person !== currentAssignment) {
      // Update the item
      await client.execute({
        sql: `UPDATE discovered_items SET assigned_to = ? WHERE id = ?`,
        args: [assignment.person, id]
      });

      changes.push({
        subject: subject.substring(0, 50),
        from: currentAssignment,
        to: assignment.person,
        reason: assignment.reason
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);

  if (changes.length > 0) {
    console.log(`\n=== Changes Made ===\n`);
    for (const change of changes.slice(0, 20)) {
      console.log(`  "${change.subject}..."`);
      console.log(`    ${change.from} → ${change.to} (${change.reason})`);
      console.log('');
    }
    if (changes.length > 20) {
      console.log(`  ... and ${changes.length - 20} more changes`);
    }
  }

  // Show new distribution
  console.log(`\n=== New Assignment Distribution ===\n`);
  const distribution = await client.execute(`
    SELECT assigned_to, COUNT(*) as count
    FROM discovered_items
    GROUP BY assigned_to
    ORDER BY count DESC
  `);
  distribution.rows.forEach(row => {
    console.log(`  ${row.assigned_to}: ${row.count}`);
  });
}

run().catch(console.error);
