const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

async function testParse(filePath) {
  console.time('parseXlsx');
  const sharedStrings = [];
  let sheetStream = null;

  const directory = await unzipper.Open.file(filePath);
  
  // 1. Read shared strings
  const ssFile = directory.files.find(d => d.path === 'xl/sharedStrings.xml');
  if (ssFile) {
    const buffer = await ssFile.buffer();
    const content = buffer.toString('utf8');
    // Extract <t> text using regex or fast scanner
    const regex = /<t[^>]*>(.*?)<\/t>/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      // decode basic XML entities
      let val = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      sharedStrings.push(val);
    }
  }
  console.log('Shared strings count:', sharedStrings.length);

  // 2. Read sheet1.xml
  const sheetFile = directory.files.find(d => d.path === 'xl/worksheets/sheet1.xml');
  if (!sheetFile) throw new Error('sheet1.xml not found in XLSX');

  const stream = sheetFile.stream();
  const readline = require('readline');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let rowCount = 0;
  const rows = [];
  const partMap = new Map();

  let xmlChunk = '';
  for await (const line of rl) {
    xmlChunk += line;
    // process complete <row ... </row>
    let rowStart;
    while ((rowStart = xmlChunk.indexOf('<row')) !== -1) {
      let rowEnd = xmlChunk.indexOf('</row>', rowStart);
      if (rowEnd === -1) break;
      const rowXml = xmlChunk.substring(rowStart, rowEnd + 6);
      xmlChunk = xmlChunk.substring(rowEnd + 6);
      rowCount++;
      if (rowCount === 1) continue; // skip header row

      // Parse cells in row
      // <c r="B2" t="s"><v>123</v></c>
      const cellRegex = /<c\s+r="([A-Z]+)\d+"(?:[^>]*?t="([a-z]+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
      let cellMatch;
      const rowObj = {};
      while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
        const col = cellMatch[1];
        const type = cellMatch[2];
        let val = cellMatch[3];
        if (val !== undefined) {
          if (type === 's') {
            const idx = parseInt(val, 10);
            val = sharedStrings[idx] || '';
          }
          rowObj[col] = val;
        }
      }

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
      rows.push(item);

      if (!partMap.has(partNo)) {
        partMap.set(partNo, {
          part_code: partNo,
          part_name: desc,
          total_qty: 0,
          prices: new Set(),
          locators: new Set(),
          batches: []
        });
      }
      const pGroup = partMap.get(partNo);
      pGroup.total_qty += qty;
      if (price > 0) pGroup.prices.add(price);
      if (loc1 && loc1 !== '0') pGroup.locators.add(loc1);
      if (loc2 && loc2 !== '0') pGroup.locators.add(loc2);
      pGroup.batches.push({
        qty,
        price,
        locator_1: loc1,
        locator_2: loc2,
        availability: avail
      });
    }
  }

  console.timeEnd('parseXlsx');
  console.log(`Parsed ${rows.length} rows successfully.`);
  console.log(`Unique grouped parts: ${partMap.size}`);
  
  // Sample grouped entry
  const sampleKey = Array.from(partMap.keys())[21];
  console.log('Sample group:', sampleKey, JSON.stringify(partMap.get(sampleKey), (k, v) => v instanceof Set ? Array.from(v) : v, 2));
}

testParse(path.resolve(__dirname, '../STOCK_FILE.xlsx')).catch(console.error);
