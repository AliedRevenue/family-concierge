/**
 * Debug obligations query
 */

import Database from 'better-sqlite3';

const db = new Database('./data/fca.db');

console.log('=== Obligations with item_type=obligation ===');
const obligations = db.prepare(`
  SELECT id, item_type, obligation_date, created_at, subject, from_email
  FROM pending_approvals
  WHERE item_type = 'obligation'
  ORDER BY created_at DESC
  LIMIT 15
`).all() as any[];

console.log('Count:', obligations.length);
obligations.forEach((o: any) => {
  console.log(
    'Date:', (o.obligation_date || 'NULL').padEnd(12),
    '| Created:', (o.created_at || '').substring(0, 16),
    '| Subject:', (o.subject || '').substring(0, 35)
  );
});

console.log('\n=== Check date comparisons ===');
const now = new Date().toISOString().split('T')[0];
console.log('Today:', now);

const dateCheck = db.prepare(`
  SELECT
    obligation_date,
    date('now') as today,
    date('now', '-1 day') as yesterday,
    datetime('now', '-7 days') as week_ago,
    obligation_date >= date('now', '-1 day') as is_future_date,
    created_at >= datetime('now', '-7 days') as is_recent
  FROM pending_approvals
  WHERE item_type = 'obligation'
  LIMIT 5
`).all() as any[];

dateCheck.forEach((d: any) => {
  console.log('Obligation date:', d.obligation_date, '| Is future:', d.is_future_date, '| Is recent:', d.is_recent);
});

db.close();
