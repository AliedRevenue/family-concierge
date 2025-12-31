import Database from 'better-sqlite3';

const db = new Database('./data/fca.db');

// Get latest discovery session
const session = db.prepare(`
  SELECT * FROM discovery_sessions 
  ORDER BY started_at DESC 
  LIMIT 1
`).get();

const output = JSON.parse(session.output);

console.log(`\n📊 Discovery Results:`);
console.log(`Emails Scanned: ${output.stats.totalEmailsScanned}`);
console.log(`Relevant Found: ${output.stats.relevantEmailsFound}`);
console.log(`Avg Confidence: ${output.stats.averageConfidence.toFixed(2)}\n`);

console.log(`🔍 The ${output.evidence.length} Relevant Emails Found:\n`);
output.evidence.forEach((item, i) => {
  console.log(`${i + 1}. [${item.relevanceScore.toFixed(2)}] ${item.from}`);
  console.log(`   Subject: ${item.subject}`);
  console.log(`   Domain: ${item.domain}`);
  console.log(`   Snippet: ${item.snippet.substring(0, 80)}...`);
  console.log();
});

console.log(`\n💡 Proposed Sources (top 5):`);
output.proposedConfig.sources.slice(0, 5).forEach((s, i) => {
  console.log(`${i + 1}. ${s.domain || s.pattern}`);
});

console.log(`\n💡 Proposed Keywords (top 5):`);
output.proposedConfig.keywords.slice(0, 5).forEach((k, i) => {
  console.log(`${i + 1}. "${k.keyword}"`);
});

db.close();
