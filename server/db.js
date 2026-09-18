require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
const { Pool, types } = require('pg');

// Parse PostgreSQL BIGINT (OID 20) and NUMERIC (OID 1700) as JS numbers
types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));
types.setTypeParser(1700, val => (val === null ? null : parseFloat(val)));

// Determine primary database URL and fallback pooler URL
const DIRECT_URL = process.env.DATABASE_URL || 'postgresql://postgres:9074137499aA%23@db.kjoeprnucqabgfkwbqdg.supabase.co:5432/postgres';
const POOLER_URL = process.env.SUPABASE_POOLER_URL || 'postgresql://postgres.kjoeprnucqabgfkwbqdg:9074137499aA%23@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

let poolInstance = null;
let poolInitPromise = null;

function createPool(connectionString) {
  const p = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  p.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err.message);
  });

  return p;
}

/**
 * Thread-safe singleton pool resolver
 * Checks if DIRECT_URL host resolves via DNS; otherwise seamlessly uses POOLER_URL
 */
async function getPool() {
  if (poolInstance) return poolInstance;
  if (poolInitPromise) return poolInitPromise;

  poolInitPromise = (async () => {
    const rawUrl = process.env.DATABASE_URL || DIRECT_URL;

    // If already pointing to the pooler or localhost, use directly
    if (rawUrl.includes('pooler.supabase.com') || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
      poolInstance = createPool(rawUrl);
      return poolInstance;
    }

    try {
      const parsed = new URL(rawUrl);
      // Test IPv4 DNS lookup for the direct host
      await dns.promises.lookup(parsed.hostname);
      const testPool = createPool(rawUrl);
      await testPool.query('SELECT 1;');
      poolInstance = testPool;
      return poolInstance;
    } catch (err) {
      console.log('ℹ Direct host unreachable on this network; switching connection to Supabase pooler gateway...');
      poolInstance = createPool(POOLER_URL);
      return poolInstance;
    }
  })();

  return poolInitPromise;
}

/**
 * Normalizes SQL queries from SQLite syntax to PostgreSQL standard
 */
function convertSql(sql) {
  if (!sql) return '';
  let s = sql.trim();

  // Convert SQLite PRAGMA into safe no-op
  if (/^\s*PRAGMA/i.test(s)) {
    return 'PRAGMA_NOOP';
  }

  // Convert SQLite datetime('now') / datetime("now") into PostgreSQL CURRENT_TIMESTAMP
  s = s.replace(/datetime\s*\(\s*["']now["']\s*\)/gi, 'CURRENT_TIMESTAMP');

  // Convert SQLite GROUP_CONCAT(col, delim) to PostgreSQL STRING_AGG(col::text, delim)
  s = s.replace(/group_concat\s*\(\s*([^,\)]+?)\s*,\s*([^)]+?)\s*\)/gi, 'STRING_AGG($1::text, $2)');
  s = s.replace(/group_concat\s*\(\s*([^,\)]+?)\s*\)/gi, "STRING_AGG($1::text, ', ')");

  // Replace double-quoted literals in expressions (e.g. WHERE name != "CASH WORK") with single-quoted literals
  s = s.replace(/([!=<>\s])"([^"]+)"/g, "$1'$2'");

  // Convert INSERT OR IGNORE INTO <table> ... to INSERT INTO <table> ... ON CONFLICT DO NOTHING
  if (/^\s*insert\s+or\s+ignore\s+into/i.test(s)) {
    s = s.replace(/^\s*insert\s+or\s+ignore\s+into/i, 'INSERT INTO');
    if (!/on\s+conflict/i.test(s)) {
      s = s.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING;';
    }
  }

  // Convert INSERT OR REPLACE INTO user_stage_permissions ...
  if (/^\s*insert\s+or\s+replace\s+into\s+user_stage_permissions/i.test(s)) {
    s = s.replace(/^\s*insert\s+or\s+replace\s+into\s+user_stage_permissions/i, 'INSERT INTO user_stage_permissions');
    if (!/on\s+conflict/i.test(s)) {
      s = s.replace(/;\s*$/, '') + ' ON CONFLICT (user_id, stage_id) DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write, can_delete = EXCLUDED.can_delete;';
    }
  }

  // Replace '?' parameter placeholders with '$1', '$2', '$3', ...
  let index = 1;
  s = s.replace(/\?/g, () => `$${index++}`);

  return s;
}

/**
 * Execute a query using the thread-safe connection pool
 */
async function executeQuery(queryText, params = []) {
  const p = await getPool();
  return await p.query(queryText, params);
}

/**
 * Execute DML (INSERT, UPDATE, DELETE)
 * Returns { lastID, changes }
 */
async function run(sql, params = []) {
  const converted = convertSql(sql);
  if (converted === 'PRAGMA_NOOP') {
    return { lastID: null, changes: 0 };
  }

  let queryText = converted;
  const isInsert = /^\s*insert\s+into\s+([a-zA-Z0-9_"]+)/i.test(queryText);

  if (isInsert && !/returning/i.test(queryText)) {
    const match = queryText.match(/^\s*insert\s+into\s+([a-zA-Z0-9_"]+)/i);
    const tableName = match ? match[1].replace(/["']/g, '').toLowerCase() : '';
    const tablesWithoutSingleId = ['customer_branches', 'surveyor_insurance_map'];

    if (!tablesWithoutSingleId.includes(tableName)) {
      try {
        const withReturning = queryText.replace(/;\s*$/, '') + ' RETURNING id;';
        const res = await executeQuery(withReturning, params);
        const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? res.rows[0].id : null;
        return { lastID, changes: res.rowCount };
      } catch (err) {
        if (err.message && err.message.includes('column "id" does not exist')) {
          // Fall through to query without RETURNING id
        } else {
          throw err;
        }
      }
    }
  }

  const res = await executeQuery(queryText, params);
  return { lastID: null, changes: res.rowCount };
}

/**
 * Fetch a single row (equivalent to SQLite db.get)
 */
async function get(sql, params = []) {
  const converted = convertSql(sql);
  if (converted === 'PRAGMA_NOOP') return null;

  const res = await executeQuery(converted, params);
  return res.rows && res.rows.length > 0 ? res.rows[0] : null;
}

/**
 * Fetch all matching rows (equivalent to SQLite db.all)
 */
async function all(sql, params = []) {
  const converted = convertSql(sql);
  if (converted === 'PRAGMA_NOOP') return [];

  const res = await executeQuery(converted, params);
  return res.rows || [];
}

/**
 * Backwards compatibility db object
 */
const db = {
  run,
  get,
  all,
  query: executeQuery
};

/**
 * Check Supabase PostgreSQL connectivity and status
 */
async function checkSupabaseStatus() {
  try {
    const res = await executeQuery('SELECT current_database(), count(*) as outlet_count FROM outlets;');
    console.log(`✓ Connected to Supabase PostgreSQL [${res.rows[0].current_database}]. Outlets: ${res.rows[0].outlet_count}`);
    return true;
  } catch (err) {
    console.error('! Supabase PostgreSQL connection error:', err.message);
    return false;
  }
}

/**
 * Synchronize PostgreSQL identity sequences to MAX(id) for tables
 */
async function syncSequences() {
  const tables = [
    'outlets', 'customers', 'customer_phones', 'vehicles', 'parts',
    'insurance_companies', 'surveyors', 'tickets', 'stage_logs',
    'ticket_parts', 'sla_alerts', 'users', 'ticket_comments', 'user_notifications'
  ];
  for (const table of tables) {
    try {
      const seqRes = await executeQuery(`SELECT pg_get_serial_sequence($1, 'id') as seq;`, [table]);
      const seqName = seqRes.rows[0]?.seq;
      if (seqName) {
        await executeQuery(`
          SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM ${table}), 1), true);
        `);
      }
    } catch (e) { }
  }
}

/**
 * Ensure ticket_comments and user_notifications tables exist
 */
async function ensureCommentAndNotificationTables() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        parent_id BIGINT REFERENCES ticket_comments(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        user_name TEXT NOT NULL,
        user_role TEXT,
        content TEXT NOT NULL,
        mentions TEXT[],
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_comments_parent ON ticket_comments(parent_id);

      CREATE TABLE IF NOT EXISTS user_notifications (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        type TEXT NOT NULL,
        ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
        ticket_number TEXT,
        comment_id BIGINT REFERENCES ticket_comments(id) ON DELETE CASCADE,
        content_snippet TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, is_read);
    `);
  } catch (err) {
    console.error('Error ensuring comments/notifications tables:', err.message);
  }
}

/**
 * Ensure ticket_parts and tickets have customer approval and exemption columns
 */
async function ensurePartsApprovalSchema() {
  try {
    await executeQuery(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_parts' AND column_name = 'insurance_approved') THEN
          ALTER TABLE ticket_parts ADD COLUMN insurance_approved INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_parts' AND column_name = 'company_approved') THEN
          ALTER TABLE ticket_parts ADD COLUMN company_approved INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_parts' AND column_name = 'customer_approval_status') THEN
          ALTER TABLE ticket_parts ADD COLUMN customer_approval_status TEXT DEFAULT 'PENDING';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_parts' AND column_name = 'is_critical_to_start') THEN
          ALTER TABLE ticket_parts ADD COLUMN is_critical_to_start INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_parts' AND column_name = 'picked_locators') THEN
          ALTER TABLE ticket_parts ADD COLUMN picked_locators TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'customer_approval_exempt') THEN
          ALTER TABLE tickets ADD COLUMN customer_approval_exempt INTEGER DEFAULT 0;
        END IF;

        -- Normalize premature ORDERED status for tickets that have not reached Parts Order (Stage 6)
        UPDATE ticket_parts
        SET part_status = 'PENDING_ORDER'
        WHERE ticket_id IN (SELECT id FROM tickets WHERE current_stage_id < 6)
          AND (UPPER(COALESCE(part_status, '')) = 'ORDERED' OR part_status IS NULL);
      END $$;
    `);
    console.log('✓ Parts approval & customer exemption schema verified.');
  } catch (err) {
    console.warn('Note on ensurePartsApprovalSchema:', err.message);
  }
}

/**
 * Initialize database and check essential tables
 */
async function initDb() {
  const isConnected = await checkSupabaseStatus();
  if (!isConnected) {
    throw new Error('Could not connect to Supabase PostgreSQL database.');
  }

  await ensureCommentAndNotificationTables();
  await ensurePartsApprovalSchema();
  await ensureRealtimeSetup();
  await syncSequences();
  await seedDefaultAdminIfMissing();
  await seedMasterDataIfEmpty();
}

/**
 * Enable Supabase Realtime Publication and Replica Identity
 */
async function ensureRealtimeSetup() {
  try {
    // 1. Ensure REPLICA IDENTITY FULL on real-time tables so full row payloads are delivered
    await executeQuery(`
      ALTER TABLE tickets REPLICA IDENTITY FULL;
      ALTER TABLE user_notifications REPLICA IDENTITY FULL;
      ALTER TABLE ticket_comments REPLICA IDENTITY FULL;
    `);

    // 2. Add tables to supabase_realtime publication if not already present
    await executeQuery(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
          EXCEPTION WHEN duplicate_object THEN END;
          BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
          EXCEPTION WHEN duplicate_object THEN END;
          BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE ticket_comments;
          EXCEPTION WHEN duplicate_object THEN END;
        END IF;
      END $$;
    `);
    console.log('✓ Supabase Realtime publication & replica identity verified for tickets, user_notifications, ticket_comments.');
  } catch (err) {
    console.warn('Note on ensureRealtimeSetup:', err.message);
  }
}

/**
 * Seed initial master data if database is empty
 */
async function seedMasterDataIfEmpty() {
  // Only auto-seed if explicitly configured; keep empty database clean
  if (process.env.SEED_DEFAULT_MASTER_DATA !== 'true') {
    return;
  }
  try {
    const outletCount = await get(`SELECT COUNT(*) as count FROM outlets;`);
    if (outletCount && Number(outletCount.count) > 0) {
      return; // Already populated
    }

    await run(`
      INSERT INTO outlets (name, code, location) VALUES
      ('Honda Central Bodyshop', 'HC-01', 'Downtown Hub, 45 Central Ave'),
      ('Honda North Express Service', 'HN-02', 'North Ring Road, Plot 12'),
      ('Honda West Body & Paint', 'HW-03', 'Western Auto Corridor, Bay 7');
    `);

    await run(`
      INSERT INTO parts (part_code, part_name, default_cost, stock_qty) VALUES
      ('HD-BMP-F01', 'Front Bumper Assembly', 8500, 12),
      ('HD-BMP-R01', 'Rear Bumper Assembly', 7800, 8),
      ('HD-HL-L02', 'Front Headlamp (Left) - LED', 14200, 5),
      ('HD-HL-R02', 'Front Headlamp (Right) - LED', 14200, 6),
      ('HD-BNT-001', 'Bonnet / Engine Hood Panel', 16500, 3),
      ('HD-FND-L01', 'Front Fender (Left)', 5400, 10),
      ('HD-FND-R01', 'Front Fender (Right)', 5400, 9),
      ('HD-RAD-003', 'Radiator Grille Chrome', 4200, 15),
      ('HD-WND-F01', 'Front Windshield Laminated Glass', 9800, 4),
      ('HD-MRR-R01', 'Side Mirror Assembly with Turn Signal (Right)', 3600, 11),
      ('HD-DR-FL01', 'Front Left Door Shell', 18900, 2),
      ('HD-BRK-F01', 'Front Disc Brake Pads Kit', 3200, 25);
    `);

    await run(`
      INSERT INTO insurance_companies (name, contact_info) VALUES
      ('ICICI Lombard General Insurance', 'claims@icicilombard.com | 1800-2666'),
      ('HDFC ERGO General Insurance', 'care@hdfcergo.com | 022-62346234'),
      ('Bajaj Allianz General Insurance', 'claims@bajajallianz.co.in | 1800-209-5858'),
      ('Tata AIG General Insurance', 'customersupport@tataaig.com | 1800-266-7780'),
      ('New India Assurance Co.', 'claims@newindia.co.in | 1800-209-1415');
    `);

    await run(`
      INSERT INTO surveyors (name, phone) VALUES
      ('Rajesh Sharma', '+91 98201 44552'),
      ('Vikram Malhotra', '+91 98450 33211'),
      ('Anand Swamy', '+91 97112 88990'),
      ('Prakash Nair', '+91 99001 77665'),
      ('Suresh Verma', '+91 98190 22334');
    `);

    await run(`
      INSERT INTO surveyor_insurance_map (surveyor_id, insurance_company_id) VALUES
      (1, 1), (1, 2),
      (2, 2), (2, 3),
      (3, 3), (3, 4),
      (4, 1), (4, 5),
      (5, 4), (5, 5)
      ON CONFLICT DO NOTHING;
    `);
  } catch (e) {
    console.warn('Notice in seedMasterDataIfEmpty:', e.message);
  }
}

/**
 * Reciprocal Autocomplete Lookups for Customers
 */
async function searchCustomers(q) {
  if (!q || q.trim().length === 0) {
    return [];
  }
  const term = `%${q.trim()}%`;

  const rows = await all(`
    SELECT DISTINCT
      c.id as customer_id,
      c.name as customer_name,
      c.primary_phone,
      v.id as vehicle_id,
      v.vehicle_no,
      v.vehicle_name,
      v.model,
      v.color,
      v.chassis_no
    FROM customers c
    LEFT JOIN customer_phones cp ON cp.customer_id = c.id
    LEFT JOIN vehicles v ON v.customer_id = c.id
    WHERE c.name ILIKE ?
       OR c.primary_phone ILIKE ?
       OR cp.phone ILIKE ?
       OR v.vehicle_no ILIKE ?
       OR v.vehicle_name ILIKE ?
       OR v.model ILIKE ?
       OR v.color ILIKE ?
       OR v.chassis_no ILIKE ?
    LIMIT 10;
  `, [term, term, term, term, term, term, term, term]);

  return rows;
}

/**
 * Vehicle Models & Color Typeahead Lookups
 */
async function searchVehicleModels(q, customerPhone = null) {
  const results = [];
  const qClean = (q || '').trim();
  const qLower = qClean.toLowerCase();

  // 1. If customer phone provided, find vehicles already owned by this customer
  if (customerPhone && customerPhone.trim().length >= 4) {
    const pTerm = `%${customerPhone.trim()}%`;
    const custVehicles = await all(`
      SELECT DISTINCT
        v.id as vehicle_id,
        COALESCE(NULLIF(v.model, ''), v.vehicle_name) as model,
        v.vehicle_no,
        v.color,
        v.chassis_no
      FROM vehicles v
      JOIN customers c ON c.id = v.customer_id
      LEFT JOIN customer_phones cp ON cp.customer_id = c.id
      WHERE c.primary_phone ILIKE ? OR cp.phone ILIKE ?
      LIMIT 5;
    `, [pTerm, pTerm]);

    for (const cv of custVehicles) {
      if (!cv.model) continue;
      if (!qLower || cv.model.toLowerCase().includes(qLower) || (cv.vehicle_no && cv.vehicle_no.toLowerCase().includes(qLower))) {
        results.push({
          is_customer_vehicle: true,
          model: cv.model,
          vehicle_no: cv.vehicle_no || '',
          color: cv.color || '',
          chassis_no: cv.chassis_no || '',
          category: "Customer's Registered Vehicle"
        });
      }
    }
  }

  // 2. Query distinct models and their colors from the database
  let dbRows = [];
  if (qClean.length > 0) {
    const term = `%${qClean}%`;
    dbRows = await all(`
      SELECT 
        COALESCE(NULLIF(model, ''), vehicle_name) as model,
        color,
        COUNT(*) as count
      FROM vehicles
      WHERE (model ILIKE ? OR vehicle_name ILIKE ?)
        AND COALESCE(NULLIF(model, ''), vehicle_name) IS NOT NULL
      GROUP BY COALESCE(NULLIF(model, ''), vehicle_name), color
      ORDER BY count DESC;
    `, [term, term]);
  } else {
    dbRows = await all(`
      SELECT 
        COALESCE(NULLIF(model, ''), vehicle_name) as model,
        color,
        COUNT(*) as count
      FROM vehicles
      WHERE COALESCE(NULLIF(model, ''), vehicle_name) IS NOT NULL
      GROUP BY COALESCE(NULLIF(model, ''), vehicle_name), color
      ORDER BY count DESC
      LIMIT 40;
    `);
  }

  const modelMap = new Map();
  for (const row of dbRows) {
    if (!row.model) continue;
    const cleanModel = row.model.trim();
    const key = cleanModel.toUpperCase();
    if (!modelMap.has(key)) {
      modelMap.set(key, {
        model: cleanModel,
        colors: [],
        count: 0
      });
    }
    const item = modelMap.get(key);
    item.count += Number(row.count) || 1;
    if (row.color && row.color.trim() && !item.colors.includes(row.color.trim())) {
      item.colors.push(row.color.trim());
    }
  }

  // Standard Honda Catalog Models for comprehensive lookup
  const standardHondaModels = [
    { model: 'Activa 6G', family: 'Honda Activa', category: 'Scooter', colors: ['Mat Axis Gray Metallic', 'Pearl Siren Blue', 'Decent Blue Metallic', 'Rebel Red Metallic', 'Black'] },
    { model: 'Activa 125', family: 'Honda Activa', category: 'Scooter', colors: ['Pearl Siren Blue', 'Rebel Red Metallic', 'Heavy Gray Metallic', 'Midnight Blue Metallic'] },
    { model: 'Activa DLX', family: 'Honda Activa', category: 'Scooter', colors: ['Mat Axis Gray Metallic', 'Pearl Siren Blue', 'Black'] },
    { model: 'Activa 125 DISC OBD2B', family: 'Honda Activa', category: 'Scooter', colors: ['Rebel Red Metallic 2', 'P Black', 'Pearl Deep Ground Gray'] },
    { model: 'Dio 125', family: 'Honda Dio', category: 'Scooter', colors: ['Sports Red 2', 'Mat Marvel Blue Metallic', 'Pearl Deep Ground Gray'] },
    { model: 'Dio BS-VI', family: 'Honda Dio', category: 'Scooter', colors: ['Sports Red 2', 'Mat Axis Gray Metallic', 'Dazzle Yellow Metallic'] },
    { model: 'SP125 OBD2B', family: 'Honda SP 125', category: 'Motorcycle', colors: ['Black', 'Matte Axis Grey Metallic', 'Imperial Red Metallic', 'Pearl Siren Blue'] },
    { model: 'Shine 100 OBD2B', family: 'Honda Shine', category: 'Motorcycle', colors: ['Black with Red Stripes', 'Black with Blue Stripes', 'Black with Gold Stripes'] },
    { model: 'Shine 125', family: 'Honda Shine', category: 'Motorcycle', colors: ['Black', 'Geny Grey Metallic', 'Rebel Red Metallic', 'Decent Blue Metallic'] },
    { model: 'Unicorn OBD2B', family: 'Honda Unicorn', category: 'Motorcycle', colors: ['Pearl Igneous Black', 'Imperial Red Metallic', 'Mat Axis Gray Metallic'] },
    { model: 'CB350 H\'ness', family: 'Honda CB350', category: 'Motorcycle', colors: ['Matte Marshall Green Metallic', 'Precious Red Metallic', 'Pearl Nightstar Black'] },
    { model: 'CB350RS', family: 'Honda CB350RS', category: 'Motorcycle', colors: ['Matte Massive Grey Metallic', 'Athletic Blue Metallic', 'Radiant Red Metallic'] },
    { model: 'Hornet 2.0', family: 'Honda Hornet', category: 'Motorcycle', colors: ['Matte Axis Grey Metallic', 'Matte Marvel Blue Metallic', 'Pearl Igneous Black'] },
    { model: 'CB200X', family: 'Honda CB200X', category: 'Motorcycle', colors: ['Decent Blue Metallic', 'Pearl Nightstar Black', 'Sports Red'] },
    { model: 'Honda Elevate V', family: 'Honda Elevate', category: 'SUV', colors: ['Phoenix Orange Pearl', 'Obsidian Blue Pearl', 'Radiant Red Metallic', 'Platinum White Pearl'] },
    { model: 'Honda City ZX', family: 'Honda City', category: 'Sedan', colors: ['Platinum White Pearl', 'Lunar Silver Metallic', 'Meteoroid Grey Metallic', 'Golden Brown Metallic'] },
    { model: 'Honda Amaze', family: 'Honda Amaze', category: 'Sedan', colors: ['Platinum White Pearl', 'Meteoroid Grey Metallic', 'Radiant Red Metallic'] }
  ];

  for (const std of standardHondaModels) {
    const key = std.model.toUpperCase();
    if (!modelMap.has(key)) {
      if (!qLower || std.model.toLowerCase().includes(qLower) || std.family.toLowerCase().includes(qLower)) {
        modelMap.set(key, {
          model: std.model,
          family: std.family,
          category: std.category,
          colors: std.colors,
          count: 0
        });
      }
    } else {
      const existing = modelMap.get(key);
      existing.family = std.family;
      existing.category = std.category;
      std.colors.forEach(c => {
        if (!existing.colors.includes(c)) existing.colors.push(c);
      });
    }
  }

  const modelList = Array.from(modelMap.values()).map(m => {
    let family = m.family;
    let category = m.category;
    if (!family || !category) {
      const u = m.model.toUpperCase();
      if (u.includes('ACTIVA')) { family = 'Honda Activa'; category = 'Scooter'; }
      else if (u.includes('DIO')) { family = 'Honda Dio'; category = 'Scooter'; }
      else if (u.includes('UNICORN')) { family = 'Honda Unicorn'; category = 'Motorcycle'; }
      else if (u.includes('SHINE')) { family = 'Honda Shine'; category = 'Motorcycle'; }
      else if (u.includes('SP125') || u.includes('SP 125')) { family = 'Honda SP 125'; category = 'Motorcycle'; }
      else if (u.includes('CB350') || u.includes('HNESS')) { family = 'Honda CB350'; category = 'Motorcycle'; }
      else if (u.includes('CITY')) { family = 'Honda City'; category = 'Sedan'; }
      else if (u.includes('ELEVATE')) { family = 'Honda Elevate'; category = 'SUV'; }
      else if (u.includes('AMAZE')) { family = 'Honda Amaze'; category = 'Sedan'; }
      else if (u.includes('CD 110') || u.includes('CD110')) { family = 'Honda CD 110'; category = 'Motorcycle'; }
      else { family = 'Honda'; category = 'Two-Wheeler'; }
    }
    return {
      is_customer_vehicle: false,
      model: m.model,
      family: family,
      category: category,
      common_colors: m.colors,
      count: m.count
    };
  });

  modelList.sort((a, b) => (b.count - a.count) || a.model.localeCompare(b.model));
  results.push(...modelList.slice(0, 15));
  return results;
}

async function getVehicleColors(model = null) {
  const colors = new Set();

  if (model && model.trim().length > 0) {
    const term = `%${model.trim()}%`;
    const rows = await all(`
      SELECT DISTINCT color FROM vehicles 
      WHERE (model ILIKE ? OR vehicle_name ILIKE ?) AND color IS NOT NULL AND color != ''
      LIMIT 15;
    `, [term, term]);
    rows.forEach(r => {
      if (r.color && r.color.trim()) colors.add(r.color.trim());
    });
  }

  if (colors.size < 5) {
    const fleetColors = await all(`
      SELECT color, COUNT(*) as c FROM vehicles 
      WHERE color IS NOT NULL AND color != '' 
      GROUP BY color ORDER BY c DESC LIMIT 10;
    `);
    fleetColors.forEach(r => {
      if (r.color && r.color.trim()) colors.add(r.color.trim());
    });
  }

  return Array.from(colors);
}

async function searchParts(q) {
  if (!q || q.trim().length === 0) {
    return all(`
      SELECT * FROM parts 
      ORDER BY CASE WHEN stock_qty > 0 THEN 0 ELSE 1 END, part_code ASC, part_name ASC 
      LIMIT 30;
    `);
  }
  const term = `%${q.trim()}%`;
  return all(`
    SELECT * FROM parts 
    WHERE part_name ILIKE ? OR part_code ILIKE ? OR COALESCE(locators, '') ILIKE ?
    ORDER BY CASE WHEN stock_qty > 0 THEN 0 ELSE 1 END, part_code ASC, part_name ASC 
    LIMIT 30;
  `, [term, term, term]);
}

/**
 * Fetch physical warehouse locators with positive stock (quantity > 0) for a part
 */
async function getPartLocators(partCode, partName = '') {
  let rows = [];
  const cleanCode = (partCode || '').trim();
  const cleanName = (partName || '').trim();

  if (cleanCode) {
    rows = await all(`
      SELECT id, part_number, description, quantity, unit_price, locator_1, locator_2, availability
      FROM physical_stock_entries
      WHERE part_number ILIKE ? AND quantity > 0
      ORDER BY quantity DESC, unit_price ASC;
    `, [cleanCode]);
  }
  if (rows.length === 0 && cleanName) {
    rows = await all(`
      SELECT id, part_number, description, quantity, unit_price, locator_1, locator_2, availability
      FROM physical_stock_entries
      WHERE description ILIKE ? AND quantity > 0
      ORDER BY quantity DESC, unit_price ASC;
    `, [cleanName]);
  }

  return rows.map(r => {
    const locNames = [r.locator_1, r.locator_2]
      .map(l => (l || '').trim())
      .filter(l => l && l !== '0' && l !== '-')
      .join(' / ') || 'Warehouse Floor';
    return {
      id: r.id,
      part_code: r.part_number,
      description: r.description,
      locator: locNames,
      locator_1: r.locator_1,
      locator_2: r.locator_2,
      available_qty: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      availability: r.availability || 'On Hand'
    };
  });
}


async function searchInsurers(q) {
  if (!q || q.trim().length === 0) {
    return all(`SELECT * FROM insurance_companies ORDER BY name ASC LIMIT 10;`);
  }
  const term = `%${q.trim()}%`;
  return all(`SELECT * FROM insurance_companies WHERE name ILIKE ? ORDER BY name ASC LIMIT 10;`, [term]);
}

async function searchSurveyors(q, insurerName = null) {
  if (insurerName) {
    const rows = await all(`
      SELECT s.*, ic.name as insurer_name
      FROM surveyors s
      JOIN surveyor_insurance_map sim ON sim.surveyor_id = s.id
      JOIN insurance_companies ic ON ic.id = sim.insurance_company_id
      WHERE ic.name ILIKE ?
      ORDER BY s.name ASC;
    `, [`%${insurerName.trim()}%`]);
    if (rows.length > 0) return rows;
  }

  if (!q || q.trim().length === 0) {
    return all(`SELECT * FROM surveyors ORDER BY name ASC LIMIT 10;`);
  }
  const term = `%${q.trim()}%`;
  return all(`SELECT * FROM surveyors WHERE name ILIKE ? OR phone ILIKE ? ORDER BY name ASC LIMIT 10;`, [term, term]);
}

/**
 * Non-invasive auto-learning helper: Customer & Vehicle
 */
async function syncCustomerAndVehicle({ customerName, customerPhone, vehicleNo, vehicleName, model, color, chassisNumber }) {
  if (!customerName || !customerPhone) return;

  const resolvedModel = model?.trim() || vehicleName?.trim() || 'Honda Vehicle';
  const resolvedVehicleName = vehicleName?.trim() || resolvedModel;
  const resolvedColor = color?.trim() || null;

  // 1. Check if customer exists by phone or name
  let customer = await get(`
    SELECT c.* FROM customers c
    LEFT JOIN customer_phones cp ON cp.customer_id = c.id
    WHERE c.primary_phone = ? OR cp.phone = ? OR c.name = ?
    LIMIT 1;
  `, [customerPhone.trim(), customerPhone.trim(), customerName.trim()]);

  let customerId;
  if (!customer) {
    const res = await run(`
      INSERT INTO customers (name, primary_phone) VALUES (?, ?);
    `, [customerName.trim(), customerPhone.trim()]);
    customerId = res.lastID;
    await run(`INSERT INTO customer_phones (customer_id, phone) VALUES (?, ?);`, [customerId, customerPhone.trim()]);
  } else {
    customerId = customer.id;
    const phoneExists = await get(`SELECT id FROM customer_phones WHERE customer_id = ? AND phone = ?;`, [customerId, customerPhone.trim()]);
    if (!phoneExists) {
      await run(`INSERT INTO customer_phones (customer_id, phone) VALUES (?, ?);`, [customerId, customerPhone.trim()]);
    }
  }

  // 2. Check if vehicle exists
  if (chassisNumber || vehicleNo) {
    const vehicle = await get(`
      SELECT id FROM vehicles 
      WHERE (chassis_no = ? AND chassis_no IS NOT NULL AND chassis_no != '')
         OR (vehicle_no = ? AND vehicle_no IS NOT NULL AND vehicle_no != '')
      LIMIT 1;
    `, [chassisNumber?.trim() || '', vehicleNo?.trim() || '']);

    if (!vehicle) {
      await run(`
        INSERT INTO vehicles (customer_id, vehicle_no, vehicle_name, model, color, chassis_no)
        VALUES (?, ?, ?, ?, ?, ?);
      `, [customerId, vehicleNo?.trim() || null, resolvedVehicleName, resolvedModel, resolvedColor, chassisNumber?.trim() || null]);
    } else {
      await run(`
        UPDATE vehicles 
        SET customer_id = ?, 
            vehicle_name = COALESCE(?, vehicle_name),
            model = COALESCE(?, model),
            color = COALESCE(?, color)
        WHERE id = ?;
      `, [customerId, resolvedVehicleName, resolvedModel, resolvedColor, vehicle.id]);
    }
  }

  return customerId;
}

/**
 * Non-invasive auto-learning helper: Insurer & Surveyor
 */
async function syncInsurerAndSurveyor(insurerName, surveyorName, surveyorPhone) {
  if (!insurerName && !surveyorName) return;

  let insurerId = null;
  if (insurerName && insurerName.trim()) {
    let insurer = await get(`SELECT id FROM insurance_companies WHERE name = ?;`, [insurerName.trim()]);
    if (!insurer) {
      const res = await run(`INSERT INTO insurance_companies (name) VALUES (?);`, [insurerName.trim()]);
      insurerId = res.lastID;
    } else {
      insurerId = insurer.id;
    }
  }

  let surveyorId = null;
  if (surveyorName && surveyorName.trim()) {
    let surveyor = await get(`SELECT id FROM surveyors WHERE name = ?;`, [surveyorName.trim()]);
    if (!surveyor) {
      const res = await run(`INSERT INTO surveyors (name, phone) VALUES (?, ?);`, [surveyorName.trim(), surveyorPhone?.trim() || '']);
      surveyorId = res.lastID;
    } else {
      surveyorId = surveyor.id;
      if (surveyorPhone && surveyorPhone.trim()) {
        await run(`UPDATE surveyors SET phone = ? WHERE id = ?;`, [surveyorPhone.trim(), surveyorId]);
      }
    }
  }

  if (insurerId && surveyorId) {
    await run(`
      INSERT INTO surveyor_insurance_map (surveyor_id, insurance_company_id)
      VALUES (?, ?)
      ON CONFLICT DO NOTHING;
    `, [surveyorId, insurerId]);
  }
}

/**
 * Non-invasive auto-learning helper: Parts
 */
async function syncPart(partName, cost) {
  if (!partName || !partName.trim()) return;
  const existing = await get(`SELECT id FROM parts WHERE part_name = ?;`, [partName.trim()]);
  if (!existing) {
    await run(`INSERT INTO parts (part_name, default_cost, stock_qty) VALUES (?, ?, 1) ON CONFLICT DO NOTHING;`, [partName.trim(), cost || 0]);
  }
}

/**
 * Synchronize parts master record stock_qty and locators from physical_stock_entries
 */
async function syncPartMasterStock(partCode, partName, fallbackDeductQty = 0) {
  const cleanCode = (partCode || '').trim();
  const cleanName = (partName || '').trim();

  if (cleanCode) {
    const physSummary = await get(`
      SELECT COALESCE(SUM(quantity), 0) AS total_qty,
             STRING_AGG(DISTINCT NULLIF(TRIM(locator_1), ''), ', ') AS loc1,
             STRING_AGG(DISTINCT NULLIF(TRIM(locator_2), ''), ', ') AS loc2,
             COUNT(*) AS entry_count
      FROM physical_stock_entries
      WHERE part_number ILIKE ?;
    `, [cleanCode]);

    if (physSummary && Number(physSummary.entry_count) > 0) {
      const totalQty = Math.max(0, Number(physSummary.total_qty) || 0);
      const allLocs = [physSummary.loc1, physSummary.loc2]
        .filter(Boolean)
        .join(', ')
        .split(',')
        .map(s => s.trim())
        .filter((val, idx, self) => val && val !== '0' && val !== '-' && self.indexOf(val) === idx)
        .join(', ') || null;

      await run(`
        UPDATE parts
        SET stock_qty = ?, locators = COALESCE(?, locators)
        WHERE part_code ILIKE ?;
      `, [totalQty, allLocs, cleanCode]);
      return;
    }
  }

  // Fallback for non-catalog or description-only parts
  if (cleanCode) {
    await run(`
      UPDATE parts
      SET stock_qty = GREATEST(0, stock_qty - ?)
      WHERE part_code ILIKE ?;
    `, [fallbackDeductQty, cleanCode]);
  } else if (cleanName) {
    await run(`
      UPDATE parts
      SET stock_qty = GREATEST(0, stock_qty - ?)
      WHERE part_name ILIKE ?;
    `, [fallbackDeductQty, cleanName]);
  }
}

/**
 * Deduct part quantity from physical_stock_entries and parts master table
 * @param {Object} param0
 * @param {string} param0.partCode
 * @param {string} param0.partName
 * @param {number} param0.quantity
 * @param {Array|string} param0.pickedLocators
 * @returns {Promise<Array>} Array of allocated picked locators
 */
async function deductPartInventory({ partCode, partName, quantity, pickedLocators }) {
  const reqQty = Math.max(0, Number(quantity) || 0);
  if (reqQty <= 0) return [];

  const cleanCode = (partCode || '').trim();
  const cleanName = (partName || '').trim();

  let locList = [];
  if (Array.isArray(pickedLocators)) {
    locList = pickedLocators;
  } else if (typeof pickedLocators === 'string') {
    try {
      locList = JSON.parse(pickedLocators);
    } catch (e) {
      locList = [];
    }
  }

  const allocated = [];
  let remainingToDeduct = reqQty;
  const processedEntryIds = new Set();

  // 1. If user explicitly picked specific locators with positive pick_qty
  if (Array.isArray(locList) && locList.length > 0) {
    for (const loc of locList) {
      const pQty = Number(loc.pick_qty || loc.quantity) || 0;
      const entryId = loc.id;
      if (entryId && pQty > 0) {
        const toTake = Math.min(remainingToDeduct, pQty);
        await run(`
          UPDATE physical_stock_entries
          SET quantity = GREATEST(0, quantity - ?)
          WHERE id = ?;
        `, [toTake, entryId]);

        processedEntryIds.add(entryId);
        remainingToDeduct -= toTake;
        allocated.push({
          id: entryId,
          locator: loc.locator || 'Warehouse',
          locator_1: loc.locator_1 || null,
          locator_2: loc.locator_2 || null,
          pick_qty: toTake,
          unit_price: Number(loc.unit_price) || 0
        });
        if (remainingToDeduct <= 0) break;
      }
    }
  }

  // 2. If there is still quantity to deduct (either not picked or partial pick)
  if (remainingToDeduct > 0) {
    let availableRows = [];
    if (cleanCode) {
      availableRows = await all(`
        SELECT id, part_number, description, quantity, unit_price, locator_1, locator_2
        FROM physical_stock_entries
        WHERE part_number ILIKE ? AND quantity > 0
        ORDER BY quantity DESC, unit_price ASC;
      `, [cleanCode]);
    }
    if (availableRows.length === 0 && cleanName) {
      availableRows = await all(`
        SELECT id, part_number, description, quantity, unit_price, locator_1, locator_2
        FROM physical_stock_entries
        WHERE description ILIKE ? AND quantity > 0
        ORDER BY quantity DESC, unit_price ASC;
      `, [cleanName]);
    }

    for (const row of availableRows) {
      if (processedEntryIds.has(row.id)) continue;
      const rowQty = Number(row.quantity) || 0;
      if (rowQty <= 0) continue;

      const take = Math.min(remainingToDeduct, rowQty);
      await run(`
        UPDATE physical_stock_entries
        SET quantity = GREATEST(0, quantity - ?)
        WHERE id = ?;
      `, [take, row.id]);

      const locName = [row.locator_1, row.locator_2]
        .map(l => (l || '').trim())
        .filter(l => l && l !== '0' && l !== '-')
        .join(' / ') || 'Warehouse Floor';

      allocated.push({
        id: row.id,
        locator: locName,
        locator_1: row.locator_1,
        locator_2: row.locator_2,
        pick_qty: take,
        unit_price: Number(row.unit_price) || 0
      });

      remainingToDeduct -= take;
      if (remainingToDeduct <= 0) break;
    }
  }

  // 3. Synchronize master parts table stock_qty
  await syncPartMasterStock(cleanCode, cleanName, reqQty);

  return allocated;
}

/**
 * Restore part quantity back to physical_stock_entries and parts master table
 * @param {Object} partItem ticket_parts row
 */
async function restorePartInventory(partItem) {
  if (!partItem) return;
  const qtyToRestore = Math.max(0, Number(partItem.quantity) || 0);
  if (qtyToRestore <= 0) return;

  const cleanCode = (partItem.part_code || '').trim();
  const cleanName = (partItem.part_name || '').trim();

  let locList = [];
  if (Array.isArray(partItem.picked_locators)) {
    locList = partItem.picked_locators;
  } else if (typeof partItem.picked_locators === 'string') {
    try {
      locList = JSON.parse(partItem.picked_locators);
    } catch (e) {
      locList = [];
    }
  }

  let remainingToRestore = qtyToRestore;

  // 1. If specific physical_stock_entries were recorded in picked_locators
  if (Array.isArray(locList) && locList.length > 0) {
    for (const loc of locList) {
      const pQty = Number(loc.pick_qty || loc.quantity) || 0;
      const entryId = loc.id;
      if (entryId && pQty > 0) {
        const toAdd = Math.min(remainingToRestore, pQty);
        await run(`
          UPDATE physical_stock_entries
          SET quantity = quantity + ?
          WHERE id = ?;
        `, [toAdd, entryId]);
        remainingToRestore -= toAdd;
        if (remainingToRestore <= 0) break;
      }
    }
  }

  // 2. If remaining quantity, restore to primary matching physical stock entry
  if (remainingToRestore > 0) {
    let targetEntry = null;
    if (cleanCode) {
      targetEntry = await get(`
        SELECT id FROM physical_stock_entries
        WHERE part_number ILIKE ?
        ORDER BY quantity DESC, id ASC LIMIT 1;
      `, [cleanCode]);
    }
    if (!targetEntry && cleanName) {
      targetEntry = await get(`
        SELECT id FROM physical_stock_entries
        WHERE description ILIKE ?
        ORDER BY quantity DESC, id ASC LIMIT 1;
      `, [cleanName]);
    }

    if (targetEntry) {
      await run(`
        UPDATE physical_stock_entries
        SET quantity = quantity + ?
        WHERE id = ?;
      `, [remainingToRestore, targetEntry.id]);
    } else {
      // If no physical stock entry exists, increment parts table directly
      if (cleanCode) {
        await run(`UPDATE parts SET stock_qty = stock_qty + ? WHERE part_code ILIKE ?;`, [remainingToRestore, cleanCode]);
      } else if (cleanName) {
        await run(`UPDATE parts SET stock_qty = stock_qty + ? WHERE part_name ILIKE ?;`, [remainingToRestore, cleanName]);
      }
    }
  }

  // 3. Synchronize master parts table stock_qty
  await syncPartMasterStock(cleanCode, cleanName);
}

/**
 * Get row-by-row parts for a specific ticket
 */
async function getTicketParts(ticketId) {
  if (!ticketId) return [];
  return all(`
    SELECT * FROM ticket_parts WHERE ticket_id = ? ORDER BY id ASC;
  `, [ticketId]);
}

/**
 * Save row-by-row parts for a ticket and calculate total cost
 */
async function saveTicketParts(ticketId, partsArray = []) {
  if (!ticketId) return { totalCost: 0, parts: [], summary: '' };

  const ticket = await get(`SELECT current_stage_id FROM tickets WHERE id = ?;`, [ticketId]);
  const isStage6OrAbove = ticket ? Number(ticket.current_stage_id) >= 6 : false;

  // Restore inventory for any existing parts on this ticket before replacing
  const previousParts = await getTicketParts(ticketId);
  for (const prev of previousParts) {
    try {
      await restorePartInventory(prev);
    } catch (err) {
      console.error('Error restoring inventory for part prior to update:', err.message);
    }
  }

  await run(`DELETE FROM ticket_parts WHERE ticket_id = ?;`, [ticketId]);

  let calculatedSum = 0;
  let savedParts = [];
  let partSummaryNames = [];

  for (const p of partsArray) {
    const pName = (p.part_name || p.name || '').trim();
    if (!pName) continue;
    const pCode = (p.part_code || p.code || '').trim() || null;
    const pQty = Math.max(1, Number(p.quantity || p.qty) || 1);
    const pCost = Math.max(0, Number(p.unit_cost || p.cost) || 0);
    const pTotal = Number(p.total_cost || p.total) || (pQty * pCost);

    // Deduct stock from physical inventory and record allocated locators
    let allocatedLocators = [];
    try {
      allocatedLocators = await deductPartInventory({
        partCode: pCode,
        partName: pName,
        quantity: pQty,
        pickedLocators: p.picked_locators
      });
    } catch (err) {
      console.error('Error deducting part inventory:', err.message);
    }

    const pickedLocatorsStr = (allocatedLocators && allocatedLocators.length > 0)
      ? JSON.stringify(allocatedLocators)
      : (p.picked_locators ? (typeof p.picked_locators === 'string' ? p.picked_locators : JSON.stringify(p.picked_locators)) : null);

    let rawStatus = (p.part_status || p.status || '').trim().toUpperCase();
    let pStatus = 'PENDING_ORDER';
    if (rawStatus === 'ARRIVED') {
      pStatus = 'ARRIVED';
    } else if (rawStatus === 'ORDERED' && isStage6OrAbove) {
      pStatus = 'ORDERED';
    } else if (rawStatus && rawStatus !== 'ORDERED') {
      pStatus = rawStatus;
    } else if (isStage6OrAbove) {
      pStatus = 'ORDERED';
    }
    const pNotes = (p.notes || '').trim() || null;
    const pArrivedAt = p.arrived_at || (pStatus === 'ARRIVED' ? new Date().toISOString() : null);

    const insAppr = (p.insurance_approved !== undefined)
      ? (p.insurance_approved ? 1 : 0)
      : (p.company_approved !== undefined ? (p.company_approved ? 1 : 0) : 0);
    const compAppr = insAppr;
    let custAppr = (p.customer_approval_status || '').trim().toUpperCase();
    if (!custAppr) {
      custAppr = insAppr ? 'NONE' : 'PENDING';
    }
    const isCrit = p.is_critical_to_start ? 1 : 0;

    calculatedSum += pTotal;
    partSummaryNames.push(`${pName} (x${pQty})`);

    const res = await run(`
      INSERT INTO ticket_parts (
        ticket_id, part_name, part_code, quantity, unit_cost, total_cost,
        part_status, notes, arrived_at, insurance_approved, company_approved,
        customer_approval_status, is_critical_to_start, picked_locators
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [ticketId, pName, pCode, pQty, pCost, pTotal, pStatus, pNotes, pArrivedAt, insAppr, compAppr, custAppr, isCrit, pickedLocatorsStr]);

    savedParts.push({
      id: res.lastID,
      ticket_id: ticketId,
      part_name: pName,
      part_code: pCode,
      quantity: pQty,
      unit_cost: pCost,
      total_cost: pTotal,
      part_status: pStatus,
      notes: pNotes,
      arrived_at: pArrivedAt,
      insurance_approved: insAppr,
      company_approved: compAppr,
      customer_approval_status: custAppr,
      is_critical_to_start: isCrit,
      picked_locators: pickedLocatorsStr
    });

    syncPart(pName, pCost).catch(() => { });
  }

  return {
    totalCost: calculatedSum,
    summary: partSummaryNames.join(', '),
    parts: savedParts
  };
}

/**
 * Add a single part item to a ticket
 */
async function addTicketPart(ticketId, partData = {}) {
  const pName = (partData.part_name || partData.name || '').trim();
  if (!pName) throw new Error('Part name is required');
  const pCode = (partData.part_code || partData.code || '').trim() || null;
  const pQty = Math.max(1, Number(partData.quantity || partData.qty) || 1);
  const pCost = Math.max(0, Number(partData.unit_cost || partData.cost) || 0);
  const pTotal = Number(partData.total_cost || partData.total) || (pQty * pCost);

  const ticket = await get(`SELECT current_stage_id FROM tickets WHERE id = ?;`, [ticketId]);
  const isStage6OrAbove = ticket ? Number(ticket.current_stage_id) >= 6 : false;

  let rawStatus = ((partData.part_status || partData.status || '') + '').trim().toUpperCase();
  let pStatus = 'PENDING_ORDER';
  if (rawStatus === 'ARRIVED') {
    pStatus = 'ARRIVED';
  } else if (rawStatus === 'ORDERED' && isStage6OrAbove) {
    pStatus = 'ORDERED';
  } else if (rawStatus && rawStatus !== 'ORDERED') {
    pStatus = rawStatus;
  } else if (isStage6OrAbove) {
    pStatus = 'ORDERED';
  }
  const pNotes = (partData.notes || '').trim() || null;
  const pArrivedAt = partData.arrived_at || (pStatus === 'ARRIVED' ? new Date().toISOString() : null);

  const insAppr = (partData.insurance_approved !== undefined)
    ? (partData.insurance_approved ? 1 : 0)
    : (partData.company_approved !== undefined ? (partData.company_approved ? 1 : 0) : 0);
  const compAppr = insAppr;
  let custAppr = (partData.customer_approval_status || '').trim().toUpperCase();
  if (!custAppr) {
    custAppr = insAppr ? 'NONE' : 'PENDING';
  }
  const isCrit = partData.is_critical_to_start ? 1 : 0;

  // Deduct inventory
  let allocatedLocators = [];
  try {
    allocatedLocators = await deductPartInventory({
      partCode: pCode,
      partName: pName,
      quantity: pQty,
      pickedLocators: partData.picked_locators
    });
  } catch (err) {
    console.error('Error deducting part inventory on addTicketPart:', err.message);
  }

  const pickedLocatorsStr = (allocatedLocators && allocatedLocators.length > 0)
    ? JSON.stringify(allocatedLocators)
    : (partData.picked_locators ? (typeof partData.picked_locators === 'string' ? partData.picked_locators : JSON.stringify(partData.picked_locators)) : null);

  const res = await run(`
    INSERT INTO ticket_parts (
      ticket_id, part_name, part_code, quantity, unit_cost, total_cost,
      part_status, notes, arrived_at, insurance_approved, company_approved,
      customer_approval_status, is_critical_to_start, picked_locators
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `, [ticketId, pName, pCode, pQty, pCost, pTotal, pStatus, pNotes, pArrivedAt, insAppr, compAppr, custAppr, isCrit, pickedLocatorsStr]);

  await refreshTicketPartsSummary(ticketId);
  syncPart(pName, pCost).catch(() => { });

  return {
    id: res.lastID,
    ticket_id: ticketId,
    part_name: pName,
    part_code: pCode,
    quantity: pQty,
    unit_cost: pCost,
    total_cost: pTotal,
    part_status: pStatus,
    notes: pNotes,
    arrived_at: pArrivedAt,
    insurance_approved: insAppr,
    company_approved: compAppr,
    customer_approval_status: custAppr,
    is_critical_to_start: isCrit,
    picked_locators: pickedLocatorsStr
  };
}

/**
 * Update approval status for a single ticket part
 */
async function updateTicketPartApproval(ticketId, partId, approvalData = {}) {
  const updates = [];
  const params = [];

  if (approvalData.insurance_approved !== undefined || approvalData.company_approved !== undefined) {
    const val = (approvalData.insurance_approved !== undefined)
      ? (approvalData.insurance_approved ? 1 : 0)
      : (approvalData.company_approved ? 1 : 0);
    updates.push('insurance_approved = ?', 'company_approved = ?');
    params.push(val, val);
  }

  if (approvalData.customer_approval_status !== undefined) {
    updates.push('customer_approval_status = ?');
    params.push(String(approvalData.customer_approval_status).toUpperCase().trim());
  }

  if (approvalData.is_critical_to_start !== undefined) {
    updates.push('is_critical_to_start = ?');
    params.push(approvalData.is_critical_to_start ? 1 : 0);
  }

  if (approvalData.part_status !== undefined) {
    updates.push('part_status = ?');
    params.push(String(approvalData.part_status).toUpperCase().trim());
  }

  if (approvalData.notes !== undefined) {
    updates.push('notes = ?');
    params.push(approvalData.notes);
  }

  if (updates.length === 0) {
    return get(`SELECT * FROM ticket_parts WHERE id = ?;`, [partId]);
  }

  params.push(partId, ticketId);
  await run(`
    UPDATE ticket_parts
    SET ${updates.join(', ')}
    WHERE id = ? AND ticket_id = ?;
  `, params);

  return get(`SELECT * FROM ticket_parts WHERE id = ?;`, [partId]);
}

/**
 * Bulk update parts approval for a ticket
 */
async function bulkUpdateTicketPartsApproval(ticketId, partsList = []) {
  for (const item of partsList) {
    if (!item || !item.id) continue;
    await updateTicketPartApproval(ticketId, item.id, item);
  }
  return getTicketParts(ticketId);
}

/**
 * Toggle ticket customer approval exemption
 */
async function setTicketCustomerApprovalExempt(ticketId, isExempt) {
  const val = isExempt ? 1 : 0;
  await run(`UPDATE tickets SET customer_approval_exempt = ? WHERE id = ?;`, [val, ticketId]);
  return get(`SELECT id, customer_approval_exempt FROM tickets WHERE id = ?;`, [ticketId]);
}

/**
 * Compute parts approval and delivery summary statistics for a ticket
 */
async function getTicketPartsStats(ticketId) {
  const ticket = await get(`SELECT current_stage_id FROM tickets WHERE id = ?;`, [ticketId]);
  const stageId = ticket ? Number(ticket.current_stage_id) || 1 : 1;
  const isAfterApproval = stageId > 5;
  const parts = await all(`SELECT * FROM ticket_parts WHERE ticket_id = ?;`, [ticketId]);
  let insuranceApprovedCount = 0;
  let pcaCount = 0;
  let caCount = 0;
  let podCount = 0;
  let arrivedCount = 0;

  for (const p of parts) {
    const isIns = Number(p.insurance_approved || p.company_approved) === 1;
    if (isIns) insuranceApprovedCount++;

    const custStatus = (p.customer_approval_status || '').toUpperCase();
    if (isAfterApproval) {
      if (custStatus === 'PENDING') {
        pcaCount++;
      } else if (custStatus === 'APPROVED') {
        caCount++;
      }
    }

    if (p.part_status === 'ARRIVED') {
      arrivedCount++;
    } else if (p.part_status === 'ORDERED' && stageId >= 6) {
      podCount++;
    }
  }

  return {
    totalParts: parts.length,
    insuranceApprovedCount,
    pcaCount,
    caCount,
    podCount,
    arrivedCount,
    isAfterApproval
  };
}

/**
 * Update single part status and arrival timestamp
 */
async function updateTicketPartStatus(ticketId, partId, status, arrivedAt = null) {
  const normalizedStatus = (status || 'ORDERED').toUpperCase() === 'ARRIVED' ? 'ARRIVED' : 'ORDERED';
  const timestamp = normalizedStatus === 'ARRIVED' ? (arrivedAt || new Date().toISOString()) : null;

  await run(`
    UPDATE ticket_parts
    SET part_status = ?, arrived_at = ?
    WHERE id = ? AND ticket_id = ?;
  `, [normalizedStatus, timestamp, partId, ticketId]);

  return get(`SELECT * FROM ticket_parts WHERE id = ?;`, [partId]);
}

/**
 * Mark all parts as arrived for a ticket
 */
async function markAllTicketPartsArrived(ticketId) {
  const nowIso = new Date().toISOString();
  await run(`
    UPDATE ticket_parts
    SET part_status = 'ARRIVED', arrived_at = COALESCE(arrived_at, ?)
    WHERE ticket_id = ?;
  `, [nowIso, ticketId]);

  return getTicketParts(ticketId);
}

/**
 * Delete a part item from a ticket
 */
async function deleteTicketPart(ticketId, partId) {
  const existing = await get(`SELECT * FROM ticket_parts WHERE id = ? AND ticket_id = ?;`, [partId, ticketId]);
  if (existing) {
    try {
      await restorePartInventory(existing);
    } catch (err) {
      console.error('Error restoring inventory on deleteTicketPart:', err.message);
    }
  }
  await run(`DELETE FROM ticket_parts WHERE id = ? AND ticket_id = ?;`, [partId, ticketId]);
  await refreshTicketPartsSummary(ticketId);
}

/**
 * Recalculate summary string of parts on tickets table
 */
async function refreshTicketPartsSummary(ticketId) {
  const parts = await getTicketParts(ticketId);
  const totalCost = parts.reduce((sum, p) => sum + (Number(p.total_cost) || 0), 0);
  const summary = parts.map(p => `${p.part_name} (x${p.quantity})`).join(', ');

  await run(`
    UPDATE tickets
    SET damaged_parts = ?
    WHERE id = ?;
  `, [summary || null, ticketId]);

  return { totalCost, summary, parts };
}

// ==========================================
// AUTHENTICATION & USER MANAGEMENT
// ==========================================

async function seedDefaultAdminIfMissing() {
  const adminUser = await get(`SELECT id FROM users WHERE username = 'admin';`);
  if (!adminUser) {
    const adminHash = hashPassword('admin');
    const result = await run(`
      INSERT INTO users (username, password_hash, display_name, role, is_active)
      VALUES ('admin', ?, 'Administrator', 'admin', 1)
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash]);

    const adminId = result.lastID || (await get(`SELECT id FROM users WHERE username = 'admin';`)).id;
    for (let s = 1; s <= 13; s++) {
      await run(`
        INSERT INTO user_stage_permissions (user_id, stage_id, can_read, can_write, can_delete)
        VALUES (?, ?, 1, 1, 1)
        ON CONFLICT (user_id, stage_id) DO NOTHING;
      `, [adminId, s]);
    }
    console.log('✓ Default admin user seeded successfully (username: admin, password: admin).');
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId, daysValid = 7) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString();
  await run(`
    INSERT INTO user_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?);
  `, [token, userId, expiresAt]);
  return { token, expiresAt };
}

async function deleteSession(token) {
  if (!token) return;
  await run(`DELETE FROM user_sessions WHERE token = ?;`, [token]);
}

async function getUserStagePermissions(userId, role = null) {
  if (role === 'admin') {
    const perms = [];
    for (let s = 1; s <= 13; s++) {
      perms.push({ stage_id: s, can_read: 1, can_write: 1, can_delete: 1 });
    }
    return perms;
  }

  const rows = await all(`
    SELECT stage_id, can_read, can_write, can_delete
    FROM user_stage_permissions
    WHERE user_id = ?
    ORDER BY stage_id ASC;
  `, [userId]);

  const map = {};
  for (const r of rows) {
    map[r.stage_id] = r;
  }

  const fullPerms = [];
  for (let s = 1; s <= 13; s++) {
    if (map[s]) {
      fullPerms.push({
        stage_id: s,
        can_read: map[s].can_read ? 1 : 0,
        can_write: map[s].can_write ? 1 : 0,
        can_delete: map[s].can_delete ? 1 : 0
      });
    } else {
      fullPerms.push({
        stage_id: s,
        can_read: 1,
        can_write: 0,
        can_delete: 0
      });
    }
  }
  return fullPerms;
}

async function setUserStagePermissions(userId, permissions = []) {
  await run(`DELETE FROM user_stage_permissions WHERE user_id = ?;`, [userId]);
  if (Array.isArray(permissions)) {
    for (const p of permissions) {
      const sId = parseInt(p.stage_id, 10);
      if (sId >= 1 && sId <= 13) {
        await run(`
          INSERT INTO user_stage_permissions (user_id, stage_id, can_read, can_write, can_delete)
          VALUES (?, ?, ?, ?, ?);
        `, [
          userId,
          sId,
          p.can_read ? 1 : 0,
          p.can_write ? 1 : 0,
          p.can_delete ? 1 : 0
        ]);
      }
    }
  }
  return getUserStagePermissions(userId);
}

async function validateSession(token) {
  if (!token) return null;
  const nowIso = new Date().toISOString();
  const session = await get(`
    SELECT s.token, s.user_id, s.expires_at, u.id, u.username, u.display_name, u.role, u.is_active
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1;
  `, [token, nowIso]);

  if (!session) return null;

  const permissions = await getUserStagePermissions(session.user_id, session.role);
  return {
    id: session.user_id,
    username: session.username,
    displayName: session.display_name || session.username,
    role: session.role,
    isActive: session.is_active === 1,
    permissions
  };
}

async function getUserById(id) {
  const user = await get(`SELECT id, username, display_name, role, is_active, created_at, updated_at FROM users WHERE id = ?;`, [id]);
  if (!user) return null;
  user.permissions = await getUserStagePermissions(user.id, user.role);
  return user;
}

async function getUserByUsername(username) {
  return get(`SELECT * FROM users WHERE username = ?;`, [username.trim()]);
}

async function getAllUsers() {
  const users = await all(`
    SELECT id, username, display_name, role, is_active, created_at, updated_at
    FROM users
    ORDER BY role ASC, username ASC;
  `);

  for (const u of users) {
    u.permissions = await getUserStagePermissions(u.id, u.role);
  }
  return users;
}

async function createUser({ username, password, displayName, role = 'user', isActive = 1, permissions = [] }) {
  if (!username || !password) {
    throw new Error('Username and password are required.');
  }
  const cleanUsername = username.trim().toLowerCase();
  const existing = await getUserByUsername(cleanUsername);
  if (existing) {
    throw new Error(`Username "${cleanUsername}" is already taken.`);
  }

  const validRole = role === 'admin' ? 'admin' : 'user';
  const passHash = hashPassword(password);
  const res = await run(`
    INSERT INTO users (username, password_hash, display_name, role, is_active)
    VALUES (?, ?, ?, ?, ?);
  `, [cleanUsername, passHash, (displayName || cleanUsername).trim(), validRole, isActive ? 1 : 0]);

  const newUserId = res.lastID;

  if (validRole === 'admin') {
    for (let s = 1; s <= 13; s++) {
      await run(`
        INSERT INTO user_stage_permissions (user_id, stage_id, can_read, can_write, can_delete)
        VALUES (?, ?, 1, 1, 1)
        ON CONFLICT (user_id, stage_id) DO NOTHING;
      `, [newUserId, s]);
    }
  } else if (Array.isArray(permissions) && permissions.length > 0) {
    await setUserStagePermissions(newUserId, permissions);
  } else {
    const defaultPerms = [];
    for (let s = 1; s <= 13; s++) {
      defaultPerms.push({ stage_id: s, can_read: 1, can_write: 0, can_delete: 0 });
    }
    await setUserStagePermissions(newUserId, defaultPerms);
  }

  return getUserById(newUserId);
}

async function updateUser(id, { displayName, role, isActive }) {
  const user = await get(`SELECT * FROM users WHERE id = ?;`, [id]);
  if (!user) throw new Error('User not found.');

  if (user.role === 'admin' && (role === 'user' || isActive === 0)) {
    const adminCount = await get(`SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?;`, [id]);
    if (!adminCount || Number(adminCount.count) === 0) {
      throw new Error('Cannot demote or deactivate the last remaining administrator.');
    }
  }

  const newDisplayName = displayName !== undefined ? displayName.trim() : user.display_name;
  const newRole = role !== undefined ? (role === 'admin' ? 'admin' : 'user') : user.role;
  const newIsActive = isActive !== undefined ? (isActive ? 1 : 0) : user.is_active;

  await run(`
    UPDATE users
    SET display_name = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?;
  `, [newDisplayName, newRole, newIsActive, id]);

  if (newIsActive === 0) {
    await run(`DELETE FROM user_sessions WHERE user_id = ?;`, [id]);
  }

  return getUserById(id);
}

async function resetUserPassword(id, newPassword) {
  if (!newPassword || newPassword.trim().length === 0) {
    throw new Error('Password cannot be empty.');
  }
  const user = await get(`SELECT * FROM users WHERE id = ?;`, [id]);
  if (!user) throw new Error('User not found.');

  const newHash = hashPassword(newPassword.trim());
  await run(`
    UPDATE users
    SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?;
  `, [newHash, id]);

  await run(`DELETE FROM user_sessions WHERE user_id = ?;`, [id]);
  return true;
}

async function deleteUser(id) {
  const user = await get(`SELECT * FROM users WHERE id = ?;`, [id]);
  if (!user) throw new Error('User not found.');

  if (user.username === 'admin') {
    throw new Error('The primary default admin account cannot be deleted.');
  }

  if (user.role === 'admin') {
    const adminCount = await get(`SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?;`, [id]);
    if (!adminCount || Number(adminCount.count) === 0) {
      throw new Error('Cannot delete the last remaining administrator.');
    }
  }

  await run(`DELETE FROM user_sessions WHERE user_id = ?;`, [id]);
  await run(`DELETE FROM user_stage_permissions WHERE user_id = ?;`, [id]);
  await run(`DELETE FROM users WHERE id = ?;`, [id]);
  return true;
}

async function toggleUserActive(id, isActive) {
  return updateUser(id, { isActive: isActive ? 1 : 0 });
}

module.exports = {
  db,
  get pool() { return poolInstance; },
  getPool,
  run,
  get,
  all,
  initDb,
  searchCustomers,
  searchVehicleModels,
  getVehicleColors,
  searchParts,
  getPartLocators,
  searchInsurers,
  searchSurveyors,
  syncCustomerAndVehicle,
  syncInsurerAndSurveyor,
  syncPart,
  getTicketParts,
  saveTicketParts,
  addTicketPart,
  deductPartInventory,
  restorePartInventory,
  syncPartMasterStock,
  updateTicketPartStatus,
  updateTicketPartApproval,
  bulkUpdateTicketPartsApproval,
  setTicketCustomerApprovalExempt,
  getTicketPartsStats,
  markAllTicketPartsArrived,
  deleteTicketPart,
  refreshTicketPartsSummary,
  // Auth & User Management
  hashPassword,
  verifyPassword,
  generateSessionToken,
  createSession,
  deleteSession,
  validateSession,
  getUserStagePermissions,
  setUserStagePermissions,
  getUserById,
  getUserByUsername,
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  toggleUserActive,
  checkSupabaseStatus
};