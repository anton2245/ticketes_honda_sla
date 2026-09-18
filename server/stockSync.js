const unzipper = require('unzipper');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

/**
 * Ensure database schema for physical stock entries and stock sync logging
 */
async function ensureStockSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS physical_stock_entries (
        id BIGSERIAL PRIMARY KEY,
        part_number TEXT NOT NULL,
        description TEXT,
        quantity NUMERIC DEFAULT 0,
        unit_price NUMERIC DEFAULT 0,
        locator_1 TEXT,
        locator_2 TEXT,
        availability TEXT DEFAULT 'On Hand',
        upload_batch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_physical_stock_part_no ON physical_stock_entries(part_number);
      CREATE INDEX IF NOT EXISTS idx_physical_stock_loc1 ON physical_stock_entries(locator_1);

      -- Extend parts table for multi-locator, price variants and stock synchronization
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parts' AND column_name = 'locators') THEN
          ALTER TABLE parts ADD COLUMN locators TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parts' AND column_name = 'price_variants') THEN
          ALTER TABLE parts ADD COLUMN price_variants JSONB;
        END IF;
      END $$;

      -- Remove legacy unique constraint on part_name if present, so parts can share descriptions
      ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_part_name_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_parts_part_code_unique ON parts(part_code) WHERE part_code IS NOT NULL AND part_code != '';

      CREATE TABLE IF NOT EXISTS stock_sync_logs (
        id BIGSERIAL PRIMARY KEY,
        filename TEXT,
        total_rows INTEGER,
        unique_parts INTEGER,
        in_stock_parts INTEGER,
        total_quantity NUMERIC,
        duration_ms INTEGER,
        sync_mode TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Physical stock & sync schema verified.');
  } catch (err) {
    console.error('Error ensuring physical stock schema:', err.message);
  } finally {
    client.release();
  }
}

/**
 * High-performance streaming XLSX parser for STOCK_FILE.xlsx
 * Processes 20,000+ rows directly from buffer in ~2 seconds
 */
async function parseXlsxBuffer(buffer) {
  const startTime = Date.now();
  const directory = await unzipper.Open.buffer(buffer);

  // 1. Read shared strings by <si> tags to maintain exact 1:1 index alignment
  const sharedStrings = [];
  const ssFile = directory.files.find(f => f.path === 'xl/sharedStrings.xml');
  if (ssFile) {
    const ssBuffer = await ssFile.buffer();
    const content = ssBuffer.toString('utf8');
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRegex.exec(content)) !== null) {
      const siContent = siMatch[1];
      const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch;
      let fullText = '';
      while ((tMatch = tRegex.exec(siContent)) !== null) {
        fullText += tMatch[1];
      }
      fullText = fullText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      sharedStrings.push(fullText);
    }
  }

  // 2. Stream worksheet rows
  const sheetFile = directory.files.find(f => f.path === 'xl/worksheets/sheet1.xml') ||
                    directory.files.find(f => f.path.startsWith('xl/worksheets/sheet') && f.path.endsWith('.xml'));
  if (!sheetFile) {
    throw new Error('No valid worksheet XML found in the uploaded XLSX file.');
  }

  const stream = sheetFile.stream();
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let rowCount = 0;
  const entries = [];
  const groupedMap = new Map();

  let xmlChunk = '';
  for await (const line of rl) {
    xmlChunk += line;
    let rowStart;
    while ((rowStart = xmlChunk.indexOf('<row')) !== -1) {
      let rowEnd = xmlChunk.indexOf('</row>', rowStart);
      if (rowEnd === -1) break;
      const rowXml = xmlChunk.substring(rowStart, rowEnd + 6);
      xmlChunk = xmlChunk.substring(rowEnd + 6);
      rowCount++;
      if (rowCount === 1) continue; // Skip header row

      const cellRegex = /<c\s+r="([A-Z]+)\d+"(?:[^>]*?t="([a-z]+)")?[^>]*>(?:<is><t>([\s\S]*?)<\/t><\/is>|<v>([\s\S]*?)<\/v>)?<\/c>/g;
      let cellMatch;
      const rowObj = {};
      while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
        const col = cellMatch[1];
        const type = cellMatch[2];
        let inlineVal = cellMatch[3];
        let valVal = cellMatch[4];
        let val = inlineVal !== undefined ? inlineVal : valVal;

        if (val !== undefined) {
          if (type === 's') {
            const idx = parseInt(val, 10);
            val = sharedStrings[idx] || '';
          }
          rowObj[col] = val;
        }
      }

      // Column mapping:
      // A: Availability, B: Part Number, C: Quantity, D: Description, E: Unit Price, F: Locator 1, G: Locator 2
      const partNo = (rowObj.B || '').trim();
      if (!partNo) continue;

      const desc = (rowObj.D || '').trim();
      const qty = Math.max(0, parseFloat(rowObj.C) || 0);
      const price = Math.max(0, parseFloat(rowObj.E) || 0);
      const loc1 = (rowObj.F || '').trim();
      const loc2 = (rowObj.G || '').trim();
      const avail = (rowObj.A || 'On Hand').trim();

      const item = {
        part_number: partNo,
        description: desc,
        quantity: qty,
        unit_price: price,
        locator_1: loc1,
        locator_2: loc2,
        availability: avail
      };
      entries.push(item);

      if (!groupedMap.has(partNo)) {
        groupedMap.set(partNo, {
          part_code: partNo,
          part_name: desc || partNo,
          stock_qty: 0,
          latest_price: 0,
          prices: new Map(), // price -> qty
          locators: new Set(),
          batches: []
        });
      }

      const pGroup = groupedMap.get(partNo);
      pGroup.stock_qty += qty;
      if (price > 0) {
        pGroup.latest_price = price;
        pGroup.prices.set(price, (pGroup.prices.get(price) || 0) + qty);
      }
      if (loc1 && loc1 !== '0' && loc1 !== '-') pGroup.locators.add(loc1);
      if (loc2 && loc2 !== '0' && loc2 !== '-') pGroup.locators.add(loc2);

      pGroup.batches.push({
        quantity: qty,
        unit_price: price,
        locator_1: loc1,
        locator_2: loc2,
        availability: avail
      });
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    entries,
    groupedMap,
    rowCount: entries.length,
    uniquePartsCount: groupedMap.size,
    durationMs
  };
}

/**
 * Ingests physical stock entries and updates master grouped parts in database
 * Accepts either raw Buffer (which it parses) or pre-parsed { entries, groupedMap }
 */
async function ingestStockSnapshot(pool, bufferOrParsed, options = {}) {
  const startTime = Date.now();
  let entries;
  let groupedMap;
  let filename = options.filename || 'uploaded_stock.xlsx';
  let syncMode = options.syncMode || 'XLSX_UPLOAD';

  if (Buffer.isBuffer(bufferOrParsed)) {
    const parsed = await parseXlsxBuffer(bufferOrParsed);
    entries = parsed.entries;
    groupedMap = parsed.groupedMap;
  } else if (bufferOrParsed && (bufferOrParsed.entries || bufferOrParsed.groupedMap)) {
    entries = bufferOrParsed.entries || [];
    groupedMap = bufferOrParsed.groupedMap || new Map();
    if (bufferOrParsed.filename) filename = bufferOrParsed.filename;
    if (bufferOrParsed.syncMode) syncMode = bufferOrParsed.syncMode;
  } else {
    throw new Error('Invalid input to ingestStockSnapshot: expected Buffer or parsed stock data');
  }

  if (!entries || entries.length === 0) {
    throw new Error('No valid stock entries found in file. Please ensure spreadsheet has columns: Availability, Part Number, Quantity, Description, Unit Price, Locator 1, Locator 2.');
  }

  const batchId = 'sync_' + Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Replace physical stock entries with the new day's physical count
    await client.query('TRUNCATE TABLE physical_stock_entries;');

    // Insert entries in chunks of 500 rows for high performance
    const chunkSize = 500;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const valueStrings = [];
      const params = [];
      let pIdx = 1;

      for (const row of chunk) {
        valueStrings.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(
          row.part_number,
          row.description,
          row.quantity,
          row.unit_price,
          row.locator_1 || null,
          row.locator_2 || null,
          row.availability || 'On Hand',
          batchId
        );
      }

      const insertSql = `
        INSERT INTO physical_stock_entries (
          part_number, description, quantity, unit_price, locator_1, locator_2, availability, upload_batch_id
        ) VALUES ${valueStrings.join(', ')};
      `;
      await client.query(insertSql, params);
    }

    // 2. Prepare grouped parts for parts master table
    const groupedList = [];
    let inStockCount = 0;
    let totalQuantity = 0;

    for (const [partCode, g] of groupedMap.entries()) {
      if (g.stock_qty > 0) inStockCount++;
      totalQuantity += g.stock_qty;

      // Format locators string
      const locatorsStr = Array.from(g.locators).join(', ') || null;

      // Format price variants array
      const variants = [];
      for (const [pPrice, pQty] of g.prices.entries()) {
        const matchingBatches = g.batches.filter(b => b.unit_price === pPrice);
        const bLocs = [...new Set(matchingBatches.map(b => b.locator_1 || b.locator_2).filter(Boolean))].join(', ');
        variants.push({
          price: pPrice,
          quantity: pQty,
          locators: bLocs
        });
      }

      // Determine default cost: latest non-zero price or average
      let defaultCost = g.latest_price;
      if (!defaultCost && variants.length > 0) {
        defaultCost = variants[0].price;
      }

      groupedList.push({
        part_code: partCode,
        part_name: g.part_name || partCode,
        default_cost: defaultCost || 0,
        stock_qty: Math.round(g.stock_qty),
        locators: locatorsStr,
        price_variants: JSON.stringify(variants.length > 0 ? variants : [{ price: defaultCost || 0, quantity: g.stock_qty, locators: locatorsStr || '' }]),
        batches_count: g.batches.length
      });
    }

    // Upsert into master parts table in chunks of 500
    for (let i = 0; i < groupedList.length; i += chunkSize) {
      const chunk = groupedList.slice(i, i + chunkSize);
      const valueStrings = [];
      const params = [];
      let pIdx = 1;

      for (const p of chunk) {
        valueStrings.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(
          p.part_code,
          p.part_name,
          p.default_cost,
          p.stock_qty,
          p.locators,
          p.price_variants
        );
      }

      const upsertSql = `
        INSERT INTO parts (
          part_code, part_name, default_cost, stock_qty, locators, price_variants
        ) VALUES ${valueStrings.join(', ')}
        ON CONFLICT (part_code) WHERE part_code IS NOT NULL AND part_code != ''
        DO UPDATE SET
          part_name = EXCLUDED.part_name,
          default_cost = CASE WHEN EXCLUDED.default_cost > 0 THEN EXCLUDED.default_cost ELSE parts.default_cost END,
          stock_qty = EXCLUDED.stock_qty,
          locators = EXCLUDED.locators,
          price_variants = EXCLUDED.price_variants;
      `;
      await client.query(upsertSql, params);
    }

    const durationMs = Date.now() - startTime;

    // 3. Log sync event
    await client.query(`
      INSERT INTO stock_sync_logs (
        filename, total_rows, unique_parts, in_stock_parts, total_quantity, duration_ms, sync_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7);
    `, [filename, entries.length, groupedList.length, inStockCount, totalQuantity, durationMs, syncMode]);

    await client.query('COMMIT');

    return {
      success: true,
      batchId,
      filename,
      totalRows: entries.length,
      uniqueParts: groupedList.length,
      inStockParts: inStockCount,
      totalQuantity,
      durationMs
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Searches physical stock entries and grouped master parts with locator & price breakdown
 */
async function searchPartsWithStock(pool, { query = '', inStockOnly = false, limit = 50, offset = 0 }) {
  const cleanQ = (query || '').trim();
  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (cleanQ) {
    conditions.push(`(p.part_code ILIKE $${pIdx} OR p.part_name ILIKE $${pIdx} OR p.locators ILIKE $${pIdx})`);
    params.push(`%${cleanQ}%`);
    pIdx++;
  }

  if (inStockOnly) {
    conditions.push(`p.stock_qty > 0`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countRes = await pool.query(`SELECT COUNT(*) as total FROM parts p ${whereClause};`, params);
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  // Fetch paginated results
  params.push(limit, offset);
  const dataSql = `
    SELECT p.id,
           p.part_code,
           p.part_name,
           p.default_cost,
           p.stock_qty,
           p.locators,
           p.price_variants,
           p.created_at,
           COALESCE((
             SELECT COUNT(*) FROM physical_stock_entries pse WHERE pse.part_number = p.part_code
           ), 0) AS entry_count
    FROM parts p
    ${whereClause}
    ORDER BY 
      CASE WHEN p.stock_qty > 0 THEN 0 ELSE 1 END,
      p.part_code ASC
    LIMIT $${pIdx++} OFFSET $${pIdx++};
  `;

  const dataRes = await pool.query(dataSql, params);

  return {
    total,
    parts: dataRes.rows,
    limit,
    offset
  };
}

/**
 * Fetches detailed physical stock batches for a given part number
 */
async function getPartStockBatches(pool, partNumber) {
  const res = await pool.query(`
    SELECT id, part_number, description, quantity, unit_price, locator_1, locator_2, availability, created_at
    FROM physical_stock_entries
    WHERE part_number = $1
    ORDER BY quantity DESC, unit_price ASC;
  `, [partNumber]);
  return res.rows;
}

/**
 * Retrieves the latest stock sync log and high-level inventory statistics
 */
async function getLatestStockSyncSummary(pool) {
  const logRes = await pool.query(`
    SELECT * FROM stock_sync_logs ORDER BY created_at DESC LIMIT 1;
  `);
  const countsRes = await pool.query(`
    SELECT 
      COUNT(*) AS total_parts,
      COUNT(CASE WHEN stock_qty > 0 THEN 1 END) AS in_stock_parts,
      COALESCE(SUM(stock_qty), 0) AS total_pieces,
      (SELECT COUNT(*) FROM physical_stock_entries) AS total_physical_entries
    FROM parts;
  `);
  return {
    latestLog: logRes.rows[0] || null,
    stats: countsRes.rows[0] || { total_parts: 0, in_stock_parts: 0, total_pieces: 0, total_physical_entries: 0 }
  };
}

module.exports = {
  ensureStockSchema,
  parseXlsxBuffer,
  ingestStockSnapshot,
  searchPartsWithStock,
  getPartStockBatches,
  getLatestStockSyncSummary
};
