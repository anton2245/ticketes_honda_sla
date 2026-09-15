const http = require('http');
const assert = require('assert');

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTest() {
  console.log('--- Testing Optional Chassis Number / VIN Creation ---');

  // 1. Create a ticket WITHOUT chassisNumber
  const payload = {
    outletId: 1,
    customerName: 'Test No Chassis User',
    customerPhone: '9876543210',
    vehicleName: 'Honda Activa 6G',
    model: 'Activa 6G',
    color: 'Matte Axis Gray',
    vehicleNo: 'KA-04-XX-9999'
    // chassisNumber omitted!
  };

  const createRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/tickets',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, payload);

  assert(createRes.status === 200 || createRes.status === 201, `Expected 200 or 201, got ${createRes.status}`);
  const ticket = createRes.data;
  assert(ticket.id, 'Ticket ID should be returned');
  assert(ticket.ticket_number, 'Ticket number should be generated');
  console.log(`✓ Ticket created successfully without Chassis No: ${ticket.ticket_number} (ID: ${ticket.id})`);

  // 2. Fetch the created ticket
  const getRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/tickets/${ticket.id}`,
    method: 'GET'
  });

  assert.strictEqual(getRes.status, 200, `Expected 200, got ${getRes.status}`);
  const fetched = getRes.data;
  assert.strictEqual(fetched.customer_name, 'Test No Chassis User');
  assert.strictEqual(fetched.vehicle_name, 'Honda Activa 6G');
  console.log(`✓ Fetched ticket details; chassis_number is safely: "${fetched.chassis_number}"`);

  // 3. Clean up test ticket
  const delRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/tickets/${ticket.id}`,
    method: 'DELETE'
  });
  console.log(`✓ Cleaned up test ticket: ${ticket.ticket_number}`);

  // Also clean up any leftover ticket 50 if needed
  await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/tickets/50',
    method: 'DELETE'
  }).catch(() => {});

  console.log('\n--- All Optional Chassis tests PASSED! ---');
}

runTest().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
