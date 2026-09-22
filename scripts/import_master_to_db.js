require('dotenv').config();
const path = require('path');
const db = require('../server/db');
const masterImport = require('../server/masterImport');

async function run() {
  console.log('Connecting to PostgreSQL database...');
  const pool = await db.getPool();
  console.log('✓ Connected to database.');

  console.log('Ensuring parts_master schema exists...');
  await masterImport.ensurePartsMasterSchema(pool);

  const csvPath = path.join(__dirname, '..', 'inventorymaster.csv');
  console.log(`Starting import from: ${csvPath}`);

  const result = await masterImport.importMasterCsv(pool, csvPath);
  console.log(`\n========================================`);
  console.log(`✓ IMPORT SUCCESSFUL!`);
  console.log(`Total Rows Parsed: ${result.totalRows}`);
  console.log(`Unique Parts Upserted: ${result.upsertedCount}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(`Categories found: ${result.categories.length}`);
  console.log(`========================================\n`);

  console.log('Top categories:');
  result.categories.slice(0, 10).forEach(c => {
    console.log(` - ${c.category_code || 'N/A'}: ${c.count} parts (${c.category_label || ''})`);
  });

  const countRes = await pool.query('SELECT COUNT(*) as total FROM parts_master;');
  console.log(`\nFinal parts_master table count in database: ${countRes.rows[0].total}`);

  process.exit(0);
}

run().catch(err => {
  console.error('Import failed with error:', err);
  process.exit(1);
});
