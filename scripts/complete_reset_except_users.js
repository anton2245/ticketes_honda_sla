require('dotenv').config();
const db = require('../server/db');

async function completeResetExceptUsers() {
  console.log('=== Initiating Complete Database Reset (Preserving Users) ===');

  await db.initDb();

  const tablesToClear = [
    'ticket_comments',
    'user_notifications',
    'ticket_parts',
    'parts_orders',
    'ticket_stage_logs',
    'stage_logs',
    'sla_alerts',
    'tickets',
    'surveyor_insurance_map',
    'surveyors',
    'insurance_companies',
    'customer_branches',
    'customer_phones',
    'vehicles',
    'customers',
    'parts',
    'outlets',
    'sla_stage_configs'
  ];

  console.log(`Clearing ${tablesToClear.length} tables...`);
  
  // Truncate all target tables with CASCADE and RESTART IDENTITY
  const truncateSql = `TRUNCATE TABLE ${tablesToClear.join(', ')} RESTART IDENTITY CASCADE;`;
  await db.run(truncateSql);
  console.log('✓ Successfully truncated all tables and reset identity sequences.');

  // Explicitly reset any sequence that might not have been touched by TRUNCATE
  for (const table of tablesToClear) {
    try {
      const seqRes = await db.all(`SELECT pg_get_serial_sequence($1, 'id') as seq;`, [table]);
      const seqName = seqRes[0]?.seq;
      if (seqName) {
        await db.run(`SELECT setval('${seqName}', 1, false);`);
      }
    } catch (e) {
      // Ignore if no identity/serial sequence
    }
  }

  // Verify counts across all public tables
  const rows = await db.all(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  console.log('\n=== Post-Reset Table Record Counts ===');
  const summary = {};
  for (const r of rows) {
    const countRes = await db.get(`SELECT COUNT(*) as count FROM ${r.table_name};`);
    summary[r.table_name] = Number(countRes.count);
    console.log(`- ${r.table_name.padEnd(25)}: ${countRes.count}`);
  }

  console.log('\n✓ Complete reset finished successfully. Only user accounts & permissions remain in the database.');
}

completeResetExceptUsers().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Reset failed:', err);
  process.exit(1);
});
