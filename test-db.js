import Database from 'better-sqlite3';

const db = new Database('data/concierge.db');

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

// Check category_preferences table
const catPrefs = db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='category_preferences'").get();
console.log('category_preferences exists:', catPrefs.cnt > 0);

// Try inserting a test record
try {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO category_preferences (id, pack_id, enabled_categories, sensitivity_map, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run('test-prefs', 'test-pack', '["school"]', '{"school": "balanced"}', new Date().toISOString());
  console.log('Insert successful!');
} catch (e) {
  console.error('Insert failed:', e.message);
}
