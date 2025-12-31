#!/usr/bin/env node
/**
 * One-time cleanup script for rejected items
 * 
 * Before the fix, the /reject endpoint was incorrectly setting approved=1
 * This script finds all items where action='reject' and sets approved=0
 * 
 * Run once: node cleanup-rejections.cjs
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'data/fca.db');
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);

try {
  console.log('\n🔍 Checking for rejected items with approved=1...\n');
  
  // Find rejected items
  const rejectedRows = db.prepare(`
    SELECT id, subject, action, approved, created_at
    FROM pending_approvals
    WHERE action = 'reject' AND approved = 1
    ORDER BY created_at DESC
  `).all();
  
  console.log(`Found ${rejectedRows.length} rejected items with approved=1\n`);
  
  if (rejectedRows.length > 0) {
    console.log('Sample rows to be fixed:');
    rejectedRows.slice(0, 5).forEach((row, i) => {
      console.log(`  ${i + 1}. "${row.subject}" | action=${row.action} | approved=${row.approved}`);
    });
    if (rejectedRows.length > 5) {
      console.log(`  ... and ${rejectedRows.length - 5} more\n`);
    }
    
    // Update them
    const updateStmt = db.prepare(`
      UPDATE pending_approvals
      SET approved = 0
      WHERE action = 'reject'
    `);
    
    const result = updateStmt.run();
    console.log(`✅ Fixed ${result.changes} rejected items\n`);
    
    // Verify
    const stillWrong = db.prepare(`
      SELECT COUNT(*) as count
      FROM pending_approvals
      WHERE action = 'reject' AND approved = 1
    `).get();
    
    if (stillWrong.count === 0) {
      console.log('✅ Verification successful - no rejected items with approved=1');
    } else {
      console.log(`⚠️ Warning: ${stillWrong.count} items still have approved=1 after update`);
    }
  } else {
    console.log('✅ No rejected items found with approved=1 (already clean)\n');
  }
  
  console.log('\nCleanup complete!');
  process.exit(0);
} catch (error) {
  console.error('❌ Error during cleanup:', error);
  process.exit(1);
} finally {
  db.close();
}
