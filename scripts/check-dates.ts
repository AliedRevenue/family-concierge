/**
 * Check obligation dates in pending_approvals
 */

import Database from 'better-sqlite3';

const db = new Database('./data/fca.db');

console.log('Today:', new Date().toISOString().split('T')[0]);
console.log('');

console.log('=== All obligations with their dates ===');
const obligations = db.prepare(`
  SELECT
    id,
    subject,
    obligation_date,
    created_at,
    CASE
      WHEN obligation_date IS NULL THEN 'no_date'
      WHEN obligation_date < date('now') THEN 'PAST'
      WHEN obligation_date <= date('now', '+7 days') THEN 'this_week'
      WHEN obligation_date <= date('now', '+14 days') THEN 'next_week'
      ELSE 'later'
    END as date_status
  FROM pending_approvals
  WHERE item_type = 'obligation'
  ORDER BY obligation_date ASC
`).all() as any[];

console.log('Total obligations:', obligations.length);
console.log('');

obligations.forEach((o: any) => {
  console.log(
    (o.date_status || 'unknown').padEnd(10),
    '|',
    (o.obligation_date || 'NULL').padEnd(12),
    '|',
    (o.subject || '').substring(0, 50)
  );
});

db.close();
