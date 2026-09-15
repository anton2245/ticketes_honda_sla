require('dotenv').config();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env');
  process.exitCode = 1;
  return;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const DB_PATH = path.join(__dirname, '..', 'data', 'tickets.db');
let sqliteDb = null;

function getSqliteDb() {
  if (!sqliteDb) {
    const sqlite3 = require('sqlite3');
    sqliteDb = new sqlite3.Database(DB_PATH);
  }
  return sqliteDb;
}

function querySqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    getSqliteDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function migrateTable(tableName, transformRow = null) {
  try {
    const rows = await querySqlite(`SELECT * FROM ${tableName}`);
    if (!rows || rows.length === 0) {
      console.log(`- ${tableName}: 0 rows found in SQLite`);
      return;
    }

    const transformed = transformRow ? rows.map(transformRow).filter(Boolean) : rows;

    const chunkSize = 100;
    let insertedCount = 0;
    for (let i = 0; i < transformed.length; i += chunkSize) {
      const chunk = transformed.slice(i, i + chunkSize);
      const { error } = await supabase.from(tableName).upsert(chunk);
      if (error) {
        console.error(`Error migrating chunk to ${tableName}:`, error.message);
        throw error;
      }
      insertedCount += chunk.length;
    }

    console.log(`✓ ${tableName}: successfully migrated ${insertedCount} rows`);
  } catch (err) {
    if (err.message && err.message.includes('Could not find the table')) {
      console.warn(`! Table "${tableName}" does not exist in Supabase yet.`);
    } else {
      console.error(`Failed to migrate ${tableName}:`, err.message);
    }
  }
}

async function runMigration() {
  console.log('====================================================');
  console.log('MIGRATING SQLITE (data/tickets.db) -> SUPABASE');
  console.log('Supabase Project:', SUPABASE_URL);
  console.log('====================================================\n');

  // Test Supabase connection
  const { error: testErr } = await supabase.from('outlets').select('id').limit(1);
  if (testErr && testErr.message.includes('Could not find the table')) {
    console.error('CRITICAL: Supabase tables have not been created yet.');
    console.error('Please run the SQL statements in "supabase_schema.sql" in your Supabase SQL Editor:');
    console.error('https://supabase.com/dashboard/project/kjoeprnucqabgfkwbqdg/sql/new\n');
    console.error('Once executed, re-run: node scripts/migrateToSupabase.js');
    process.exitCode = 1;
    return;
  }

  // 1. Outlets
  await migrateTable('outlets');

  // 2. Customers
  await migrateTable('customers');

  // 3. Customer Phones
  await migrateTable('customer_phones');

  // 4. Customer Branches
  await migrateTable('customer_branches');

  // 5. Vehicles
  await migrateTable('vehicles');

  // 6. Parts Catalog
  await migrateTable('parts');

  // 7. Insurance Companies
  await migrateTable('insurance_companies');

  // 8. Surveyors
  await migrateTable('surveyors');

  // 9. Surveyor Insurance Map (Filter orphan records where surveyor or insurer is missing)
  const validSurveyors = new Set((await querySqlite('SELECT id FROM surveyors')).map(s => s.id));
  const validInsurers = new Set((await querySqlite('SELECT id FROM insurance_companies')).map(i => i.id));
  await migrateTable('surveyor_insurance_map', row => {
    if (!validSurveyors.has(row.surveyor_id) || !validInsurers.has(row.insurance_company_id)) {
      return null;
    }
    return row;
  });

  // 10. Tickets
  await migrateTable('tickets');

  // 11. Ticket Stage Logs (stage_logs)
  await migrateTable('stage_logs');

  // 12. Ticket Parts
  await migrateTable('ticket_parts');

  // 13. SLA Alerts
  await migrateTable('sla_alerts');

  // 14. Users
  await migrateTable('users');

  // 15. User Sessions
  await migrateTable('user_sessions');

  // 16. User Stage Permissions
  await migrateTable('user_stage_permissions');

  console.log('\n====================================================');
  console.log('✓ Migration to Supabase Complete!');
  console.log('====================================================');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
