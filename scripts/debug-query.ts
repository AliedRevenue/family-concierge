/**
 * Debug the exact getObligationItems query
 */

import Database from 'better-sqlite3';

const db = new Database('./data/fca.db');

console.log('=== Running exact getObligationItems query ===');
const sql = `
  SELECT
    pa.id,
    pa.message_id,
    pa.pack_id,
    pa.subject,
    pa.from_name,
    pa.from_email,
    pa.snippet,
    pa.person,
    pa.created_at,
    pa.item_type,
    pa.obligation_date,
    pa.classification_reasoning,
    COALESCE(pa.email_body_html, pa.email_body_text) as email_body,
    e.event_intent,
    json_extract(e.event_intent, '$.title') as event_title,
    COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) as effective_date,
    CASE
      WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+7 days') THEN 'this_week'
      WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+14 days') THEN 'next_week'
      WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+30 days') THEN 'this_month'
      ELSE 'later'
    END as time_group,
    CASE
      WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+7 days') THEN 1
      WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+14 days') THEN 2
      WHEN COALESCE(pa.obligation_date, json_extract(e.event_intent, '$.startDateTime')) <= date('now', '+30 days') THEN 3
      ELSE 4
    END as time_group_order
  FROM pending_approvals pa
  LEFT JOIN events e ON e.source_message_id = pa.message_id
  LEFT JOIN dismissed_items di ON di.item_id = pa.id
  WHERE di.id IS NULL
    AND (
      -- AI classified as obligation with future date (or no date but recently classified)
      (pa.item_type = 'obligation' AND (
        pa.obligation_date >= date('now', '-1 day')
        OR (pa.obligation_date IS NULL AND pa.created_at >= datetime('now', '-7 days'))
      ))
      -- OR has associated future event
      OR (e.id IS NOT NULL AND json_extract(e.event_intent, '$.startDateTime') >= datetime('now', '-1 day'))
    )
  ORDER BY time_group_order ASC, effective_date ASC, pa.created_at DESC
`;

const items = db.prepare(sql).all() as any[];
console.log('Results:', items.length);
items.forEach((item: any) => {
  console.log(
    'Pack:', item.pack_id.padEnd(12),
    '| Date:', (item.obligation_date || 'NULL').padEnd(12),
    '| Time Group:', item.time_group?.padEnd(10) || 'NULL',
    '| Subject:', (item.subject || '').substring(0, 30)
  );
});

console.log('\n=== Check dismissed_items ===');
const dismissed = db.prepare('SELECT COUNT(*) as c FROM dismissed_items').get() as any;
console.log('Dismissed count:', dismissed.c);

db.close();
