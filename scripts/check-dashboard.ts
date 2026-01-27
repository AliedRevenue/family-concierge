/**
 * Check all dashboard API responses
 */

async function main() {
  // Check obligations
  const obligationsRes = await fetch('http://localhost:5000/api/dashboard/obligations');
  const obligations = await obligationsRes.json();
  console.log('=== UPCOMING EVENTS ===');
  console.log('Total:', obligations.total);
  for (const item of obligations.items) {
    console.log(`  ${item.effectiveDate} | ${item.subject?.substring(0, 45)}`);
  }
  console.log('Summary:', obligations.summary?.summary?.substring(0, 100) + '...');

  // Check tasks
  const tasksRes = await fetch('http://localhost:5000/api/dashboard/tasks');
  const tasks = await tasksRes.json();
  console.log('\n=== TASKS ===');
  console.log('Total:', tasks.total);
  for (const item of tasks.items) {
    console.log(`  ${item.daysSinceReceived} days ago | ${item.subject?.substring(0, 45)}`);
  }
  console.log('Summary:', tasks.summary?.summary?.substring(0, 100) + '...');

  // Check announcements
  const announcementsRes = await fetch('http://localhost:5000/api/dashboard/announcements');
  const announcements = await announcementsRes.json();
  console.log('\n=== ANNOUNCEMENTS ===');
  console.log('Total:', announcements.total);

  // Check catch-up
  const catchupRes = await fetch('http://localhost:5000/api/dashboard/catchup');
  const catchup = await catchupRes.json();
  console.log('\n=== WEEKLY CATCH-UP ===');
  console.log('Total:', catchup.total);
  for (const item of catchup.items.slice(0, 5)) {
    console.log(`  ${item.effectiveDate || 'no date'} | ${item.subject?.substring(0, 45)}`);
  }
}

main().catch(console.error);
