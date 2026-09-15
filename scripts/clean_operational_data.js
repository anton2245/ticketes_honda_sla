require('dotenv').config();
const db = require('../server/db');

async function cleanOperationalData() {
  console.log('=== Cleaning Operational Data (Tickets, Logs, Alerts, Comments, Notifications) ===');

  await db.initDb();

  // 1. Delete rows in dependent child tables first
  console.log('- Deleting ticket comments...');
  await db.run('DELETE FROM ticket_comments;');

  console.log('- Deleting user notifications...');
  await db.run('DELETE FROM user_notifications;');

  console.log('- Deleting ticket parts...');
  await db.run('DELETE FROM ticket_parts;');

  console.log('- Deleting stage logs...');
  await db.run('DELETE FROM stage_logs;');

  console.log('- Deleting SLA alerts...');
  await db.run('DELETE FROM sla_alerts;');

  console.log('- Deleting tickets...');
  await db.run('DELETE FROM tickets;');

  // 2. Reset identity sequences for operational tables to 1
  console.log('- Resetting sequences back to 1...');
  const opTables = ['tickets', 'stage_logs', 'ticket_parts', 'sla_alerts', 'ticket_comments', 'user_notifications'];
  for (const table of opTables) {
    try {
      const seqRes = await db.all(`SELECT pg_get_serial_sequence($1, 'id') as seq;`, [table]);
      const seqName = seqRes[0]?.seq;
      if (seqName) {
        await db.run(`SELECT setval('${seqName}', 1, false);`);
        console.log(`  ✓ Reset sequence ${seqName} to 1`);
      }
    } catch (e) {
      console.warn(`  ! Notice resetting sequence for ${table}:`, e.message);
    }
  }

  // 3. Verify counts
  const counts = await db.all(`
    SELECT
      (SELECT COUNT(*) FROM tickets) as tickets,
      (SELECT COUNT(*) FROM stage_logs) as stage_logs,
      (SELECT COUNT(*) FROM ticket_parts) as ticket_parts,
      (SELECT COUNT(*) FROM sla_alerts) as sla_alerts,
      (SELECT COUNT(*) FROM ticket_comments) as ticket_comments,
      (SELECT COUNT(*) FROM user_notifications) as user_notifications,
      (SELECT COUNT(*) FROM customers) as customers,
      (SELECT COUNT(*) FROM vehicles) as vehicles,
      (SELECT COUNT(*) FROM outlets) as outlets,
      (SELECT COUNT(*) FROM parts) as parts,
      (SELECT COUNT(*) FROM users) as users;
  `);

  console.log('\n=== Cleanup Summary ===');
  console.log('Operational Data (Cleaned):', {
    tickets: Number(counts[0].tickets),
    stage_logs: Number(counts[0].stage_logs),
    ticket_parts: Number(counts[0].ticket_parts),
    sla_alerts: Number(counts[0].sla_alerts),
    ticket_comments: Number(counts[0].ticket_comments),
    user_notifications: Number(counts[0].user_notifications)
  });
  console.log('Master Catalogs & Users (Preserved):', {
    customers: Number(counts[0].customers),
    vehicles: Number(counts[0].vehicles),
    outlets: Number(counts[0].outlets),
    parts: Number(counts[0].parts),
    users: Number(counts[0].users)
  });

  console.log('\n✓ Database is now completely clean and ready for new tickets starting at #1!');
}

cleanOperationalData().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
