const assert = require('assert');
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Parts Arrival Workflow automated tests...\n');

  // Step 1: Create a test ticket in Stage 1
  console.log('1. Creating a new ticket in Stage 1...');
  const createRes = await request('POST', '/api/tickets', {
    outletId: 1,
    customerName: 'Suresh Kumar',
    customerPhone: '+91 98765 43210',
    vehicleNo: 'KA01AB1234',
    vehicleName: 'Honda City ZX',
    model: 'Honda City',
    color: 'Radiant Red'
  });
  assert.strictEqual(createRes.status, 201, 'Ticket creation should return 201');
  const ticketId = createRes.data.id;
  console.log(`   ✓ Ticket created with ID: ${ticketId}, Number: ${createRes.data.ticket_number}`);

  // Step 2: Advance to Stage 2 (Estimate)
  console.log('2. Advancing to Stage 2 (Estimate Preparation)...');
  const adv2 = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 2,
    estimatedCost: 25000,
    parts: [
      { part_name: 'Front Bumper Cover', part_code: '04711-TG0-T00ZZ', quantity: 1, unit_cost: 12000, total_cost: 12000 },
      { part_name: 'Fog Lamp Left', part_code: '33950-TG0-T01', quantity: 1, unit_cost: 3500, total_cost: 3500 }
    ]
  });
  assert.strictEqual(adv2.status, 200, 'Advance to Stage 2 should succeed');
  assert.strictEqual(adv2.data.current_stage_id, 2);
  console.log('   ✓ Ticket advanced to Stage 2');

  // Step 3: Advance through stages 3, 4, 5
  console.log('3. Advancing through Stage 3, 4, 5...');
  await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 3,
    insuranceCompany: 'ICICI Lombard'
  });
  await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 4,
    surveyorName: 'Rajesh Verma',
    surveyorPhone: '+91 98111 22334'
  });
  const adv5 = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 5,
    partsOrderRequired: true
  });
  assert.strictEqual(adv5.data.current_stage_id, 5);
  console.log('   ✓ Ticket at Stage 5 with parts_order_required = 1');

  // Step 4: Advance to Stage 6 (Parts Order)
  console.log('4. Advancing to Stage 6 (Parts Order)...');
  const adv6 = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 6,
    notes: 'Parts order PO-8842 placed with Central Depot'
  });
  assert.strictEqual(adv6.status, 200);
  assert.strictEqual(adv6.data.current_stage_id, 6);
  console.log('   ✓ Ticket at Stage 6 (Parts Order)');

  // Step 5: Test Right-Click "Parts" option: Add extra part item via POST /api/tickets/:id/parts/add
  console.log('5. Testing Parts Option: Adding an extra part in Stage 6...');
  const addPartRes = await request('POST', `/api/tickets/${ticketId}/parts/add`, {
    part_name: 'Radiator Grille Chrome',
    part_code: '71121-TG0-T01',
    quantity: 1,
    unit_cost: 4500,
    total_cost: 4500
  });
  assert.strictEqual(addPartRes.status, 201, 'Adding part should return 201');
  assert.strictEqual(addPartRes.data.part.part_name, 'Radiator Grille Chrome');
  assert.strictEqual(addPartRes.data.part.part_status, 'ORDERED');
  console.log('   ✓ Extra part added successfully');

  // Verify all 3 parts exist
  const getPartsRes = await request('GET', `/api/tickets/${ticketId}/parts`);
  assert.strictEqual(getPartsRes.status, 200);
  assert.strictEqual(getPartsRes.data.length, 3, 'Should have exactly 3 parts');
  console.log(`   ✓ Retrieved 3 parts: ${getPartsRes.data.map(p => p.part_name).join(', ')}`);

  // Step 6: Attempt to advance to Stage 7 (Parts Arrival) without ticking/arriving parts
  console.log('6. Testing Enforced Gatekeeper: Advancing to Stage 7 while parts are pending arrival...');
  const adv7Fail = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 7
  });
  assert.strictEqual(adv7Fail.status, 400, 'Advancing to Stage 7 without arriving all parts must return 400');
  assert.ok(adv7Fail.data.error.includes('All parts must be ticked as arrived'), `Error message should explain requirement: ${adv7Fail.data.error}`);
  console.log(`   ✓ Gatekeeper correctly blocked advance: "${adv7Fail.data.error}"`);

  // Step 7: Mark only 1 part as arrived
  console.log('7. Marking 1 part as arrived and re-attempting advance...');
  const part1 = getPartsRes.data[0];
  const updateStatusRes = await request('POST', `/api/tickets/${ticketId}/parts/${part1.id}/status`, {
    status: 'ARRIVED'
  });
  assert.strictEqual(updateStatusRes.status, 200);
  assert.strictEqual(updateStatusRes.data.part.part_status, 'ARRIVED');
  assert.ok(updateStatusRes.data.part.arrived_at, 'arrived_at timestamp must be populated');
  console.log(`   ✓ Part 1 marked arrived at: ${updateStatusRes.data.part.arrived_at}`);

  // Re-attempt advance with 2 parts still unarrived
  const adv7Fail2 = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 7
  });
  assert.strictEqual(adv7Fail2.status, 400, 'Must still reject because 2 parts remain unarrived');
  console.log(`   ✓ Still blocked as expected: "${adv7Fail2.data.error}"`);

  // Step 8: Advance to Stage 7 passing remaining arrivedPartIds in advance payload (Checklist check)
  console.log('8. Advancing to Stage 7 with all parts checked as arrived in payload...');
  const remainingPartIds = getPartsRes.data.map(p => p.id);
  const adv7Success = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 7,
    arrivedPartIds: remainingPartIds,
    notes: 'All 3 parts physically received and verified in workshop bay 2'
  });
  assert.strictEqual(adv7Success.status, 200, 'Advancing to Stage 7 with all parts arrived must succeed');
  assert.strictEqual(adv7Success.data.current_stage_id, 7, 'Ticket current_stage_id must be 7');
  assert.ok(adv7Success.data.parts_arrival_date, 'parts_arrival_date must be set');
  console.log(`   ✓ Ticket successfully advanced to Stage 7! Arrival date: ${adv7Success.data.parts_arrival_date}`);

  // Step 9: Verify Parts Arrival Details
  console.log('9. Verifying Parts Arrival Details with logged timestamps...');
  const ticketDetailRes = await request('GET', `/api/tickets/${ticketId}`);
  assert.strictEqual(ticketDetailRes.status, 200);
  assert.strictEqual(ticketDetailRes.data.parts.length, 3);
  ticketDetailRes.data.parts.forEach(p => {
    assert.strictEqual(p.part_status, 'ARRIVED', `Part ${p.part_name} must be ARRIVED`);
    assert.ok(p.arrived_at, `Part ${p.part_name} must have arrival timestamp`);
    console.log(`   ✓ Part: "${p.part_name}" | Status: ${p.part_status} | Arrived: ${p.arrived_at}`);
  });

  // Verify Stage 7 stage_log snapshot
  const stage7Log = ticketDetailRes.data.logs.find(l => l.stage_id === 7);
  assert.ok(stage7Log, 'Stage 7 log must exist');
  const logData = JSON.parse(stage7Log.data_json || '{}');
  assert.ok(logData.partsArrival, 'Stage 7 log data_json must contain partsArrival snapshot');
  assert.strictEqual(logData.partsArrival.length, 3, 'partsArrival snapshot must contain 3 parts');
  console.log(`   ✓ Stage 7 audit log verified with logged timestamps for all ${logData.partsArrival.length} parts!`);

  console.log('\n🎉 ALL PARTS ARRIVAL WORKFLOW TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
