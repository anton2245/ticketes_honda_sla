const db = require('../server/db');

async function fixStatuses() {
  await db.initDb();
  const pool = await db.getPool();

  const updateRes = await pool.query(`
    UPDATE tickets 
    SET status = CASE 
      WHEN current_stage_id = 1 THEN 'OPEN'
      WHEN current_stage_id = 13 THEN 'CLOSED'
      ELSE 'IN_PROGRESS'
    END;
  `);

  console.log('✓ Successfully aligned ticket statuses with stages. Row count:', updateRes.rowCount);

  const statusSummary = await db.all('SELECT status, count(*) as count FROM tickets GROUP BY status;');
  console.log('\n--- Kanban Status Summary ---');
  statusSummary.forEach(s => console.log(`  - ${s.status}: ${s.count} tickets`));

  const stageSummary = await db.all(`
    SELECT current_stage_id, status, count(*) as count 
    FROM tickets 
    GROUP BY current_stage_id, status 
    ORDER BY current_stage_id;
  `);
  console.log('\n--- Stage & Kanban Column Breakdown ---');
  stageSummary.forEach(s => console.log(`  Stage ${s.current_stage_id} -> ${s.status}: ${s.count} tickets`));
}

fixStatuses().then(() => process.exit(0)).catch(err => {
  console.error('Error fixing statuses:', err);
  process.exit(1);
});
