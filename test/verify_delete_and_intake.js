const assert = require('assert');

async function runTests() {
  console.log('Testing Enriched Vehicle & Delete APIs...');

  // 1. Fetch vehicles
  const vRes = await fetch('http://localhost:3000/api/vehicles');
  assert.strictEqual(vRes.status, 200, 'GET /api/vehicles must return 200');
  const vehicles = await vRes.json();
  assert(vehicles.length > 0, 'Must have vehicles');

  const firstVeh = vehicles[0];
  console.log(`Checking vehicle #${firstVeh.id} (${firstVeh.model || firstVeh.vehicle_no})...`);

  // 2. Fetch enriched vehicle dossier
  const dRes = await fetch(`http://localhost:3000/api/vehicles/${firstVeh.id}`);
  assert.strictEqual(dRes.status, 200, 'GET /api/vehicles/:id must return 200');
  const dData = await dRes.json();
  assert(Array.isArray(dData.intake_people), 'intake_people must be an array');
  assert(Array.isArray(dData.tickets), 'tickets must be an array');
  console.log(`✓ Vehicle #${firstVeh.id} has ${dData.intake_people.length} intake people and ${dData.tickets.length} tickets`);
  if (dData.intake_people.length > 0) {
    console.log('Sample intake person:', dData.intake_people[0]);
  }

  // 3. Test Create & Delete Temporary Customer
  console.log('Testing Customer Delete...');
  const cCreate = await fetch('http://localhost:3000/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Temp Delete Test', primaryPhone: '9999900001' })
  });
  const cData = await cCreate.json();
  assert(cData.id, 'Customer creation must return id');
  const cDel = await fetch(`http://localhost:3000/api/customers/${cData.id}`, { method: 'DELETE' });
  assert.strictEqual(cDel.status, 200, 'DELETE /api/customers/:id must return 200');
  console.log('✓ Customer DELETE succeeded');

  // 4. Test Create & Delete Temporary Vehicle
  console.log('Testing Vehicle Delete...');
  const vCreate = await fetch('http://localhost:3000/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'Temp Activa 125', vehicle_no: 'DL99TEST01' })
  });
  const vCreated = await vCreate.json();
  assert(vCreated.id, 'Vehicle creation must return id');
  const vDel = await fetch(`http://localhost:3000/api/vehicles/${vCreated.id}`, { method: 'DELETE' });
  assert.strictEqual(vDel.status, 200, 'DELETE /api/vehicles/:id must return 200');
  console.log('✓ Vehicle DELETE succeeded');

  // 5. Test Create & Delete Temporary Part
  console.log('Testing Part Delete...');
  const pCreate = await fetch('http://localhost:3000/api/parts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ part_name: 'Temp Brake Shoe Test', default_cost: 450, stock_qty: 5 })
  });
  const pCreated = await pCreate.json();
  assert(pCreated.id, 'Part creation must return id');
  const pDel = await fetch(`http://localhost:3000/api/parts/${pCreated.id}`, { method: 'DELETE' });
  assert.strictEqual(pDel.status, 200, 'DELETE /api/parts/:id must return 200');
  console.log('✓ Part DELETE succeeded');

  // 6. Test Create & Delete Temporary Insurer
  console.log('Testing Insurer Delete...');
  const insCreate = await fetch('http://localhost:3000/api/insurers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Temp Insurance Corp', contact_info: '1800-999-000' })
  });
  const insCreated = await insCreate.json();
  assert(insCreated.id, 'Insurer creation must return id');
  const insDel = await fetch(`http://localhost:3000/api/insurers/${insCreated.id}`, { method: 'DELETE' });
  assert.strictEqual(insDel.status, 200, 'DELETE /api/insurers/:id must return 200');
  console.log('✓ Insurer DELETE succeeded');

  // 7. Test Create & Delete Temporary Surveyor
  console.log('Testing Surveyor Delete...');
  const sCreate = await fetch('http://localhost:3000/api/surveyors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Temp Surveyor Guy', phone: '9888877777' })
  });
  const sCreated = await sCreate.json();
  assert(sCreated.id, 'Surveyor creation must return id');
  const sDel = await fetch(`http://localhost:3000/api/surveyors/${sCreated.id}`, { method: 'DELETE' });
  assert.strictEqual(sDel.status, 200, 'DELETE /api/surveyors/:id must return 200');
  console.log('✓ Surveyor DELETE succeeded');

  console.log('\nALL 7 VERIFICATIONS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
