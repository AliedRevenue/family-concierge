/**
 * Check the dashboard API responses
 */

async function main() {
  const obligationsRes = await fetch('http://localhost:5000/api/dashboard/obligations');
  const obligations = await obligationsRes.json();

  console.log('=== UPCOMING OBLIGATIONS ===');
  console.log('Total:', obligations.total);
  console.log('');

  for (const item of obligations.items) {
    console.log(`${item.timeGroup?.padEnd(10) || 'no_date'} | ${item.effectiveDate || 'NULL'} | ${item.subject?.substring(0, 45)}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(obligations.summary?.summary || 'No summary');

  // Check announcements
  const announcementsRes = await fetch('http://localhost:5000/api/dashboard/announcements');
  const announcements = await announcementsRes.json();

  console.log('\n=== ANNOUNCEMENTS ===');
  console.log('Total:', announcements.total);
}

main().catch(console.error);
