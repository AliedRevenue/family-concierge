import Database from 'better-sqlite3';

const db = new Database('data/concierge.db');

// Just create the category_preferences table directly
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS category_preferences (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL UNIQUE,
      enabled_categories TEXT NOT NULL,
      sensitivity_map TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Created category_preferences table');
} catch (e) {
  console.log('Table creation error:', e.message);
}

// Create the index
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_category_preferences_pack ON category_preferences(pack_id)
  `);
  console.log('✓ Created index');
} catch (e) {
  console.log('Index creation error:', e.message);
}

// Test insert
try {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO category_preferences (id, pack_id, enabled_categories, sensitivity_map, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run('school-prefs', 'school', '["school","sports_activities"]', '{"school": "balanced"}', new Date().toISOString());
  console.log('✓ Insert successful!');
  
  // Verify
  const result = db.prepare('SELECT * FROM category_preferences WHERE pack_id = ?').get('school');
  console.log('Saved preferences:', result);
} catch (e) {
  console.error('✗ Insert failed:', e.message);
}

