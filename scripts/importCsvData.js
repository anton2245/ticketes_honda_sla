require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../server/db');
const slaEngine = require('../server/slaEngine');

const CSV_FILE = path.join(__dirname, '..', 'data_import.csv');

/**
 * Standard CSV Parser handling multiline fields and quotes
 */
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(c => c.length > 0)) rows.push(currentRow);
  }
  return rows;
}

/**
 * Parse various date formats from the CSV into ISO strings
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.trim();
  if (!s) return null;

  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  // Match: 10-Jun-26 or 10-Jun-2026 or 10/Jun/26
  const dMonYMatch = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (dMonYMatch) {
    let day = dMonYMatch[1].padStart(2, '0');
    let mon = months[dMonYMatch[2].toLowerCase()];
    let yr = dMonYMatch[3];
    if (yr.length === 2) yr = '20' + yr;
    if (mon) return `${yr}-${mon}-${day}T09:00:00.000Z`;
  }

  // Match: 06-08-2026 or 20/8/26 or 01-09-26
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmyMatch) {
    let day = dmyMatch[1].padStart(2, '0');
    let mon = dmyMatch[2].padStart(2, '0');
    let yr = dmyMatch[3];
    if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${mon}-${day}T09:00:00.000Z`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }

  return null;
}

/**
 * Extract date mentioned inside remarks (e.g. "APPROVED ON 17/8/26", "DONE ON 20/8/26", "RECEIVED ON 21/8/26")
 */
function extractDateFromRemarks(remarks) {
  if (!remarks) return null;
  const match = remarks.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (match) {
    let day = match[1].padStart(2, '0');
    let mon = match[2].padStart(2, '0');
    let yr = match[3];
    if (yr.length === 2) yr = '20' + yr;
    return `${yr}-${mon}-${day}T09:00:00.000Z`;
  }
  return null;
}

/**
 * Standardize Insurance Company Name
 */
function standardizeInsurer(rawName) {
  if (!rawName) return 'Cash Work';
  const upper = rawName.toUpperCase().trim();
  if (upper.includes('NEW INDIA')) return 'The New India Assurance';
  if (upper.includes('NATIONAL')) return 'National Insurance';
  if (upper.includes('UNITED')) return 'United India Insurance';
  if (upper.includes('INDUSIND')) return 'IndusInd General Insurance';
  if (upper.includes('CHOLAMANDALAM')) return 'Cholamandalam MS General Insurance';
  if (upper.includes('SHRIRAM')) return 'Shriram General Insurance';
  if (upper.includes('ORIENTAL')) return 'The Oriental Insurance Company';
  if (upper.includes('GODIGIT')) return 'Go Digit General Insurance';
  if (upper.includes('KSHEMA')) return 'Kshema General Insurance';
  if (upper.includes('CASH WORK') || upper.includes('CASH')) return 'Cash Work';
  return rawName.trim();
}

/**
 * Clean phone number to digits
 */
function cleanPhone(rawPhone) {
  if (!rawPhone) return '9999999999';
  const digits = rawPhone.replace(/[^0-9]/g, '');
  return digits.length >= 7 ? digits : '9999999999';
}

async function runImport() {
  console.log('====================================================');
  console.log('IMPORTING DATA FROM data_import.csv INTO DATABASE');
  console.log('====================================================\n');

  await db.initDb();

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Error: File not found at ${CSV_FILE}`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(CSV_FILE, 'utf8');
  const parsed = parseCSV(rawContent);
  if (parsed.length < 2) {
    console.error('Error: CSV file contains no data rows.');
    process.exit(1);
  }

  const dataRows = parsed.slice(1);
  console.log(`Found ${dataRows.length} data rows in CSV.\n`);

  const pool = await db.getPool();

  // 1. Ensure Outlets / Branches
  console.log('--- Step 1: Ensuring Outlets ---');
  const outletDefinitions = [
    { code: 'MSR', name: 'Honda MSR Bodyshop', location: 'MSR Center, Main Road' },
    { code: 'ARR', name: 'Honda Aroor Bodyshop', location: 'Aroor Bypass Junction' },
    { code: 'MNR', name: 'Honda Mannar Bodyshop', location: 'Mannar Workshop Bay' }
  ];

  const outletMap = {};
  for (const o of outletDefinitions) {
    let existing = await db.get('SELECT * FROM outlets WHERE code = ?;', [o.code]);
    if (!existing) {
      await db.run('INSERT INTO outlets (name, code, location, is_active) VALUES (?, ?, ?, 1);', [o.name, o.code, o.location]);
      existing = await db.get('SELECT * FROM outlets WHERE code = ?;', [o.code]);
      console.log(`+ Created outlet: ${o.name} (${o.code}) [ID: ${existing.id}]`);
    } else {
      console.log(`= Existing outlet: ${existing.name} (${existing.code}) [ID: ${existing.id}]`);
    }
    outletMap[o.code] = existing;
  }

  // 2. Ensure Insurance Companies
  console.log('\n--- Step 2: Ensuring Insurance Companies ---');
  const insurerNames = [
    'National Insurance',
    'The New India Assurance',
    'United India Insurance',
    'IndusInd General Insurance',
    'Cholamandalam MS General Insurance',
    'Shriram General Insurance',
    'The Oriental Insurance Company',
    'Go Digit General Insurance',
    'Kshema General Insurance',
    'Cash Work'
  ];

  const insurerMap = {};
  for (const name of insurerNames) {
    let existing = await db.get('SELECT * FROM insurance_companies WHERE name = ?;', [name]);
    if (!existing) {
      await db.run('INSERT INTO insurance_companies (name, contact_info) VALUES (?, ?);', [name, 'Official Partner Portal']);
      existing = await db.get('SELECT * FROM insurance_companies WHERE name = ?;', [name]);
      console.log(`+ Created insurance company: ${name} [ID: ${existing.id}]`);
    } else {
      console.log(`= Existing insurance company: ${name} [ID: ${existing.id}]`);
    }
    insurerMap[name] = existing;
  }

  // 3. Ensure Surveyors & Mapping
  console.log('\n--- Step 3: Ensuring Surveyors ---');
  const surveyorMap = {};
  for (const row of dataRows) {
    let surveyorName = (row[12] || '').trim();
    let surveyorPhone = cleanPhone(row[13]);
    let insurerRaw = (row[10] || '').trim();

    // Anomaly fix row 5:
    if (row[9] === 'NEW INDIA' && row[10] === 'UNITED') {
      insurerRaw = 'UNITED';
    }
    const insurerStd = standardizeInsurer(insurerRaw);

    if (surveyorName && !surveyorMap[surveyorName]) {
      let existing = await db.get('SELECT * FROM surveyors WHERE LOWER(name) = LOWER(?);', [surveyorName]);
      if (!existing) {
        await db.run('INSERT INTO surveyors (name, phone) VALUES (?, ?);', [surveyorName, surveyorPhone]);
        existing = await db.get('SELECT * FROM surveyors WHERE LOWER(name) = LOWER(?);', [surveyorName]);
        console.log(`+ Created surveyor: ${surveyorName} (Phone: ${surveyorPhone}) [ID: ${existing.id}]`);
      }
      surveyorMap[surveyorName] = existing;

      // Map to insurance company if exists
      if (insurerMap[insurerStd]) {
        await db.run(`
          INSERT INTO surveyor_insurance_map (surveyor_id, insurance_company_id)
          VALUES (?, ?)
          ON CONFLICT (surveyor_id, insurance_company_id) DO NOTHING;
        `, [existing.id, insurerMap[insurerStd].id]);
      }
    }
  }

  // 4. Import Customers, Vehicles, and Tickets
  console.log('\n--- Step 4: Importing Customers, Vehicles & Tickets ---');
  let importedCount = 0;
  let skippedCount = 0;

  for (const row of dataRows) {
    let [
      slNo, arrivalDateRaw, nameRaw, regNoRaw, modelRaw, colourRaw,
      chassisRaw, contactRaw, branchRaw, estDateRaw, insurerRaw,
      surveyDateRaw, surveyorRaw, surveyorContactRaw, claimNoRaw, remarksRaw, workDoneDateRaw
    ] = row;

    const sl = parseInt(slNo, 10);
    const ticketNumber = `TKT-2026-${String(sl).padStart(4, '0')}`;
    const customerName = (nameRaw || '').trim();
    const customerPhone = cleanPhone(contactRaw);
    const vehicleNo = (regNoRaw || '').trim();
    const model = (modelRaw || 'Honda Vehicle').trim();
    const color = (colourRaw || '').trim();
    const chassisNo = (chassisRaw || `CHAS-${sl}-${Date.now()}`).trim();
    const remarks = (remarksRaw || '').trim();
    const claimNo = (claimNoRaw || '').trim();
    const surveyorName = (surveyorRaw || '').trim();
    const surveyorPhone = cleanPhone(surveyorContactRaw);

    // Correct column misalignment in row 5 if present
    if (estDateRaw === 'NEW INDIA' && insurerRaw === 'UNITED') {
      estDateRaw = '';
      insurerRaw = 'UNITED';
    }

    // Branch Mapping
    const bUpper = (branchRaw || '').toUpperCase().trim();
    let outlet = outletMap['MSR'];
    if (bUpper === 'AROOR' || bUpper === 'ARR') {
      outlet = outletMap['ARR'];
    } else if (bUpper === 'MANNAR' || bUpper === 'MNR') {
      outlet = outletMap['MNR'];
    }

    const insurerStd = standardizeInsurer(insurerRaw);

    // Parse all dates
    let arrivalDate = parseDate(arrivalDateRaw) || new Date().toISOString();
    let estDate = parseDate(estDateRaw);
    let surveyDate = parseDate(surveyDateRaw);
    let workDoneDate = parseDate(workDoneDateRaw);
    const dateFromRemarks = extractDateFromRemarks(remarks);

    // 4a. Create/Find Customer
    let customer = await db.get('SELECT * FROM customers WHERE primary_phone = ?;', [customerPhone]);
    if (!customer) {
      const custRes = await pool.query('INSERT INTO customers (name, primary_phone, branch_id, notes) VALUES ($1, $2, $3, $4) RETURNING *;', [
        customerName, customerPhone, outlet.id, `Imported from CSV SL #${sl}`
      ]);
      customer = custRes.rows[0];
      
      // Customer Phones & Branches
      await db.run('INSERT INTO customer_phones (customer_id, phone) VALUES (?, ?);', [customer.id, customerPhone]);
      await db.run('INSERT INTO customer_branches (customer_id, outlet_id) VALUES (?, ?) ON CONFLICT DO NOTHING;', [customer.id, outlet.id]);
    }

    // 4b. Create/Find Vehicle
    let vehicle = await db.get('SELECT * FROM vehicles WHERE chassis_no = ?;', [chassisNo]);
    if (!vehicle && vehicleNo) {
      vehicle = await db.get('SELECT * FROM vehicles WHERE vehicle_no = ?;', [vehicleNo]);
    }
    if (!vehicle) {
      const vehRes = await pool.query('INSERT INTO vehicles (customer_id, vehicle_no, vehicle_name, model, color, chassis_no) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;', [
        customer.id, vehicleNo, model, model, color, chassisNo
      ]);
      vehicle = vehRes.rows[0];
    }

    // 4c. Determine Stage, Status & Key Milestones
    const remUpper = remarks.toUpperCase();
    let stageId = 1;
    let status = 'OPEN';
    let approvalDate = null;
    let partsOrderDate = null;
    let workStartDate = null;
    let workCompleteDate = workDoneDate;
    let waitingDeliveryDate = null;
    let partsStatusNote = null;

    if (workDoneDate) {
      stageId = 10; // Invoice Stage
      workStartDate = surveyDate || estDate || arrivalDate;
      workCompleteDate = workDoneDate;
    } else if (remUpper.includes('TOTAL LOSS') || remUpper.includes('RETURN THE VEHICLE') || remUpper.includes('RETURNED THE VEHICLE')) {
      stageId = 12; // Waiting Customer Delivery / Vehicle Return
      waitingDeliveryDate = estDate || surveyDate || arrivalDate;
    } else if (remUpper.match(/SPARE\s+ORDERED/) || remUpper.match(/SHARED\s+TO\s+SPARE/) || remUpper.match(/SHARED\s+TO\s+THE\s+SPARE/) || remUpper.match(/SHARED\s+O\s+SPARE/)) {
      stageId = 6; // Parts Order
      partsStatusNote = remarks;
      partsOrderDate = dateFromRemarks || surveyDate || estDate || arrivalDate;
      if (remUpper.includes('APPROVED')) {
        approvalDate = dateFromRemarks || surveyDate || estDate || arrivalDate;
      }
    } else if (remUpper.includes('APPROVED')) {
      stageId = 5; // Approval
      approvalDate = dateFromRemarks || surveyDate || estDate || arrivalDate;
    } else if (surveyDate || remUpper.includes('SURVEY DONE') || remUpper.includes('ONLINE SURVEY DONE') || remUpper.includes('SURVEY APPROVAL PENDING')) {
      stageId = 5; // Approval (survey completed, awaiting approval)
    } else if (surveyorName || remUpper.includes('SURVEY') || remUpper.includes('DOCUMENTS SHARED')) {
      stageId = 4; // Survey
    } else if (estDate || remUpper.includes('ESTIMATION')) {
      stageId = 3; // Insurance Intimation / Estimation
    } else {
      stageId = 1; // Vehicle Arrival
    }

    status = stageId === 1 ? 'OPEN' : (stageId === 13 ? 'CLOSED' : 'IN_PROGRESS');

    const stageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === stageId) || { name: `Stage ${stageId}`, slaLimitWD: 2 };
    const currentStageEnteredAt = partsOrderDate || approvalDate || surveyDate || estDate || arrivalDate;

    // 4d. Check if ticket already exists
    const existingTicket = await db.get('SELECT id FROM tickets WHERE ticket_number = ? OR chassis_number = ?;', [ticketNumber, chassisNo]);
    if (existingTicket) {
      console.log(`- Skipping existing ticket: ${ticketNumber} (Chassis: ${chassisNo})`);
      skippedCount++;
      continue;
    }

    // 4e. Insert Ticket
    const ticketInsertSql = `
      INSERT INTO tickets (
        ticket_number, outlet_id, outlet_name, customer_id, vehicle_id,
        customer_name, customer_phone, vehicle_no, vehicle_name, model, color, chassis_number,
        current_stage_id, status, parts_order_required, resurvey_required,
        arrival_date, estimate_date, insurance_company, insurance_intimation_date,
        survey_date, surveyor_name, surveyor_phone, approval_date, parts_order_date,
        work_start_date, work_complete_date, waiting_delivery_date, parts_status_note,
        current_stage_entered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23, $24, $25,
        $26, $27, $28, $29,
        $30, $31, $32
      ) RETURNING id;
    `;

    const ticketParams = [
      ticketNumber, outlet.id, outlet.name, customer.id, vehicle.id,
      customerName, customerPhone, vehicleNo, model, model, color, chassisNo,
      stageId, status, stageId >= 6 ? 1 : 0, 0,
      arrivalDate, estDate, insurerStd, estDate || surveyDate || arrivalDate,
      surveyDate, surveyorName, surveyorPhone, approvalDate, partsOrderDate,
      workStartDate, workCompleteDate, waitingDeliveryDate, partsStatusNote,
      currentStageEnteredAt, arrivalDate, currentStageEnteredAt
    ];

    const insertRes = await pool.query(ticketInsertSql, ticketParams);
    const ticketId = insertRes.rows[0].id;

    // 4f. Generate Historical Stage Logs for smooth timeline visualization
    for (let sId = 1; sId <= stageId; sId++) {
      const sCfg = slaEngine.STAGE_CONFIG.find(s => s.id === sId) || { name: `Stage ${sId}`, slaLimitWD: 2 };
      let sEntered = arrivalDate;
      let sCompleted = null;

      if (sId === 1) {
        sEntered = arrivalDate;
        sCompleted = estDate || surveyDate || currentStageEnteredAt;
      } else if (sId === 2) {
        sEntered = estDate || arrivalDate;
        sCompleted = surveyDate || currentStageEnteredAt;
      } else if (sId === 3) {
        sEntered = estDate || arrivalDate;
        sCompleted = surveyDate || currentStageEnteredAt;
      } else if (sId === 4) {
        sEntered = surveyDate || estDate || arrivalDate;
        sCompleted = approvalDate || surveyDate || currentStageEnteredAt;
      } else if (sId === 5) {
        sEntered = approvalDate || surveyDate || currentStageEnteredAt;
        sCompleted = partsOrderDate || currentStageEnteredAt;
      } else if (sId === 6) {
        sEntered = partsOrderDate || currentStageEnteredAt;
        sCompleted = sId === stageId ? null : currentStageEnteredAt;
      } else {
        sEntered = currentStageEnteredAt;
        sCompleted = sId === stageId ? null : currentStageEnteredAt;
      }

      if (sId === stageId) {
        sCompleted = null;
      }

      const elapsedWD = sCompleted ? slaEngine.calculateWorkingDays(sEntered, sCompleted) : slaEngine.calculateWorkingDays(sEntered, new Date());
      const slaStatus = elapsedWD > sCfg.slaLimitWD ? 'BREACHED' : 'WITHIN_SLA';

      await db.run(`
        INSERT INTO stage_logs (
          ticket_id, stage_id, stage_name, entered_at, completed_at, sla_limit_wd, elapsed_wd, sla_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
      `, [ticketId, sId, sCfg.name, sEntered, sCompleted, sCfg.slaLimitWD, elapsedWD, slaStatus]);
    }

    // 4g. Insert Remarks as Ticket Comment
    if (remarks || claimNo) {
      const commentText = [
        claimNo ? `📋 Claim No: ${claimNo}` : '',
        remarks ? `📝 Notes: ${remarks}` : ''
      ].filter(Boolean).join('\n');

      await db.run(`
        INSERT INTO ticket_comments (
          ticket_id, user_name, user_role, content, created_at
        ) VALUES (?, ?, ?, ?, ?);
      `, [ticketId, 'System Importer', 'admin', commentText, arrivalDate]);
    }

    importedCount++;
    console.log(`✓ [${sl}/${dataRows.length}] Imported ${ticketNumber} | ${customerName} (${vehicleNo}) | ${outlet.name} | Stage ${stageId} (${stageConfig.name})`);
  }

  // 5. Sequence Sync
  console.log('\n--- Step 5: Synchronizing PostgreSQL Identity Sequences ---');
  const tables = [
    'outlets', 'customers', 'customer_phones', 'customer_branches', 'vehicles', 'parts',
    'insurance_companies', 'surveyors', 'tickets', 'stage_logs',
    'ticket_parts', 'sla_alerts', 'users', 'ticket_comments', 'user_notifications'
  ];
  for (const table of tables) {
    try {
      const seqRes = await pool.query(`SELECT pg_get_serial_sequence($1, 'id') as seq;`, [table]);
      const seqName = seqRes.rows[0]?.seq;
      if (seqName) {
        await pool.query(`
          SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM ${table}), 1), true);
        `);
      }
    } catch (e) {}
  }

  console.log('\n====================================================');
  console.log(`✓ IMPORT COMPLETE: ${importedCount} tickets imported, ${skippedCount} skipped.`);
  console.log('====================================================');
}

runImport().catch(err => {
  console.error('Import failed with error:', err);
  process.exit(1);
});
