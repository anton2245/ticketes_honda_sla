const fs = require('fs');
const readline = require('readline');

/**
 * Ensure parts_master table exists in PostgreSQL
 */
async function ensurePartsMasterSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS parts_master (
        id BIGSERIAL PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        part_name TEXT NOT NULL,
        category_code TEXT,
        category_label TEXT,
        mrp NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_parts_master_sku ON parts_master(sku);
      CREATE INDEX IF NOT EXISTS idx_parts_master_category ON parts_master(category_code);
    `);

    // Try to add trigram index for fast ILIKE search — may fail if pg_trgm not available
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_parts_master_name_trgm ON parts_master USING gin(part_name gin_trgm_ops);`);
    } catch (e) {
      // pg_trgm might not be available; ILIKE still works fine at 58K rows
    }

    console.log('✓ parts_master schema verified.');
  } catch (err) {
    console.error('Error ensuring parts_master schema:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Parse MRP string like "Rs.9,940.00" or "Rs.53.00" → numeric value
 */
function parseMrp(mrpStr) {
  if (!mrpStr || typeof mrpStr !== 'string') return 0;
  // Strip "Rs.", commas, quotes, whitespace
  const cleaned = mrpStr.replace(/Rs\./gi, '').replace(/,/g, '').replace(/"/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.round(val * 100) / 100;
}

/**
 * Parse category string like "ACC - Accessory" → { code: "ACC", label: "Accessory" }
 */
function parseCategory(catStr) {
  if (!catStr || typeof catStr !== 'string') return { code: null, label: null };
  const trimmed = catStr.trim();
  const dashIdx = trimmed.indexOf(' - ');
  if (dashIdx > 0) {
    return {
      code: trimmed.substring(0, dashIdx).trim(),
      label: trimmed.substring(dashIdx + 3).trim()
    };
  }
  return { code: trimmed, label: trimmed };
}

/**
 * Parse a single CSV line handling quoted fields with commas
 * e.g.: 008F7-K3R-D00,COMFORT MATT,ACC - Accessory,"Rs.9,940.00"
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Stream-parse inventorymaster.csv and return array of parsed rows
 * Columns: Product, Description Text, Part Category, MRP
 */
async function parseMasterCsv(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`Master CSV file not found: ${filePath}`));
    }

    const rows = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    let headerParsed = false;
    let colMap = { sku: 0, name: 1, category: 2, mrp: 3 };

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (!headerParsed) {
        headerParsed = true;
        // Detect column mapping from header
        const fields = parseCsvLine(trimmed);
        fields.forEach((f, idx) => {
          const lower = f.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (lower === 'product' || lower === 'sku' || lower === 'partnumber') colMap.sku = idx;
          else if (lower === 'descriptiontext' || lower === 'description' || lower === 'partname') colMap.name = idx;
          else if (lower === 'partcategory' || lower === 'category') colMap.category = idx;
          else if (lower === 'mrp' || lower === 'price' || lower === 'retailprice') colMap.mrp = idx;
        });
        return;
      }

      const fields = parseCsvLine(trimmed);
      if (fields.length < 2) return;

      const sku = (fields[colMap.sku] || '').trim();
      const name = (fields[colMap.name] || '').trim();
      if (!sku || !name) return;

      const cat = parseCategory(fields[colMap.category] || '');
      const mrp = parseMrp(fields[colMap.mrp] || '');

      rows.push({
        sku,
        part_name: name,
        category_code: cat.code,
        category_label: cat.label,
        mrp
      });
    });

    rl.on('close', () => resolve(rows));
    rl.on('error', (err) => reject(err));
  });
}

/**
 * Bulk UPSERT parsed rows into parts_master table
 * Uses chunked inserts (500 per batch) for performance
 */
async function importMasterToDb(pool, rows) {
  const startTime = Date.now();

  // Deduplicate rows by SKU (keeping latest) to avoid Postgres "ON CONFLICT DO UPDATE cannot affect row a second time" error
  const skuMap = new Map();
  for (const r of rows) {
    if (r.sku) skuMap.set(r.sku, r);
  }
  const uniqueRows = Array.from(skuMap.values());

  const client = await pool.connect();
  const chunkSize = 500;
  let upsertedCount = 0;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < uniqueRows.length; i += chunkSize) {
      const chunk = uniqueRows.slice(i, i + chunkSize);
      const valueStrings = [];
      const params = [];
      let pIdx = 1;

      for (const row of chunk) {
        valueStrings.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(
          row.sku,
          row.part_name,
          row.category_code,
          row.category_label,
          row.mrp
        );
      }

      const sql = `
        INSERT INTO parts_master (sku, part_name, category_code, category_label, mrp)
        VALUES ${valueStrings.join(', ')}
        ON CONFLICT (sku)
        DO UPDATE SET
          part_name = EXCLUDED.part_name,
          category_code = EXCLUDED.category_code,
          category_label = EXCLUDED.category_label,
          mrp = EXCLUDED.mrp,
          updated_at = CURRENT_TIMESTAMP;
      `;
      await client.query(sql, params);
      upsertedCount += chunk.length;
    }

    await client.query('COMMIT');

    const durationMs = Date.now() - startTime;

    // Gather category stats
    const catStats = await pool.query(`
      SELECT category_code, category_label, COUNT(*) as count
      FROM parts_master
      GROUP BY category_code, category_label
      ORDER BY count DESC;
    `);

    return {
      success: true,
      totalRows: rows.length,
      upsertedCount,
      durationMs,
      categories: catStats.rows
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Full import pipeline: parse CSV file → upsert into parts_master
 */
async function importMasterCsv(pool, filePath) {
  console.log(`Importing parts master from: ${filePath}`);
  const rows = await parseMasterCsv(filePath);
  console.log(`  Parsed ${rows.length} master catalog rows from CSV.`);
  const result = await importMasterToDb(pool, rows);
  console.log(`  ✓ Master import complete: ${result.upsertedCount} parts upserted in ${result.durationMs}ms.`);
  return result;
}

/**
 * Search parts_master with LEFT JOIN to aggregated stock from physical_stock_entries
 * Returns master catalog items with stock quantities, locators, and batch price info
 */
async function searchMasterParts(pool, { query = '', category = '', inStockOnly = false, limit = 50, offset = 0 }) {
  const cleanQ = (query || '').trim();
  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (cleanQ) {
    conditions.push(`(pm.sku ILIKE $${pIdx} OR pm.part_name ILIKE $${pIdx})`);
    params.push(`%${cleanQ}%`);
    pIdx++;
  }

  if (category && category !== 'ALL') {
    conditions.push(`pm.category_code = $${pIdx}`);
    params.push(category);
    pIdx++;
  }

  if (inStockOnly) {
    conditions.push(`COALESCE(stock.total_qty, 0) > 0`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matches
  const countSql = `
    SELECT COUNT(*) as total
    FROM parts_master pm
    LEFT JOIN (
      SELECT part_number, SUM(quantity) AS total_qty
      FROM physical_stock_entries
      GROUP BY part_number
    ) stock ON stock.part_number = pm.sku
    ${whereClause};
  `;
  const countRes = await pool.query(countSql, params);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  // Fetch paginated data
  const dataParams = [...params, limit, offset];
  const dataSql = `
    SELECT
      pm.id,
      pm.sku,
      pm.part_name,
      pm.category_code,
      pm.category_label,
      pm.mrp,
      COALESCE(stock.total_qty, 0) AS stock_qty,
      COALESCE(stock.max_price, 0) AS batch_price,
      stock.locators,
      stock.batch_count
    FROM parts_master pm
    LEFT JOIN (
      SELECT
        part_number,
        SUM(quantity) AS total_qty,
        MAX(unit_price) AS max_price,
        STRING_AGG(DISTINCT NULLIF(TRIM(locator_1), ''), ', ') AS locators,
        COUNT(*) AS batch_count
      FROM physical_stock_entries
      GROUP BY part_number
    ) stock ON stock.part_number = pm.sku
    ${whereClause}
    ORDER BY
      CASE WHEN COALESCE(stock.total_qty, 0) > 0 THEN 0 ELSE 1 END,
      pm.sku ASC
    LIMIT $${pIdx++} OFFSET $${pIdx++};
  `;
  const dataRes = await pool.query(dataSql, dataParams);

  return {
    total,
    parts: dataRes.rows,
    limit,
    offset
  };
}

module.exports = {
  ensurePartsMasterSchema,
  parseMasterCsv,
  importMasterToDb,
  importMasterCsv,
  searchMasterParts
};
