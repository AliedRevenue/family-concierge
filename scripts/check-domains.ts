/**
 * Check domains in discovered items and find Appassionata emails
 */

import Database from 'better-sqlite3';

const db = new Database('./data/fca.db');

// Get all unique sender domains from pending_approvals
console.log('=== All unique sender domains in pending_approvals ===');
const domains = db.prepare(`
  SELECT DISTINCT
    LOWER(SUBSTR(from_email, INSTR(from_email, '@') + 1)) as domain,
    COUNT(*) as count
  FROM pending_approvals
  WHERE from_email IS NOT NULL
  GROUP BY domain
  ORDER BY count DESC
`).all() as { domain: string; count: number }[];
domains.forEach(d => console.log(`  ${d.domain}: ${d.count} emails`));

console.log('');
console.log('=== Emails containing "appassionata" in any field ===');
const appassionata = db.prepare(`
  SELECT id, from_email, from_name, subject
  FROM pending_approvals
  WHERE LOWER(from_email) LIKE '%appassionata%'
     OR LOWER(from_name) LIKE '%appassionata%'
     OR LOWER(subject) LIKE '%appassionata%'
`).all() as { id: string; from_email: string; from_name: string; subject: string }[];
console.log(`Found: ${appassionata.length}`);
appassionata.forEach(e => console.log(`  From: ${e.from_email} | ${e.subject?.substring(0, 50)}`));

console.log('');
console.log('=== Emails containing "piano" in subject ===');
const piano = db.prepare(`
  SELECT id, from_email, from_name, subject
  FROM pending_approvals
  WHERE LOWER(subject) LIKE '%piano%'
`).all() as { id: string; from_email: string; from_name: string; subject: string }[];
console.log(`Found: ${piano.length}`);
piano.forEach(e => console.log(`  From: ${e.from_email} | ${e.subject?.substring(0, 50)}`));

console.log('');
console.log('=== Suggested domains (not yet tracked) ===');
const suggested = db.prepare(`
  SELECT domain, email_count, first_seen, suggested_at
  FROM suggested_domains
  ORDER BY email_count DESC
`).all() as { domain: string; email_count: number; first_seen: string; suggested_at: string }[];
console.log(`Found: ${suggested.length}`);
suggested.forEach(d => console.log(`  ${d.domain}: ${d.email_count} emails`));

db.close();
