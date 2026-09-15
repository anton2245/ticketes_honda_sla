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

async function runTests() {
  console.log('--- Testing Dedicated Customer & Insurance Panels API Endpoints ---');

  // 1. Fetch Customers List
  const custListRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/customers',
    method: 'GET'
  });
  assert.strictEqual(custListRes.status, 200, 'GET /api/customers should return 200');
  assert(Array.isArray(custListRes.data) && custListRes.data.length > 0, 'Customers should be an array with records');
  const sampleCustomer = custListRes.data[0];
  console.log(`✓ GET /api/customers returned ${custListRes.data.length} customers (sample: ${sampleCustomer.name})`);

  // 2. Fetch Single Customer Dossier with vehicles & tickets
  const custDetailRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/customers/${sampleCustomer.id}`,
    method: 'GET'
  });
  assert.strictEqual(custDetailRes.status, 200, 'GET /api/customers/:id should return 200');
  assert(custDetailRes.data.id === sampleCustomer.id, 'Customer ID must match');
  assert(Array.isArray(custDetailRes.data.vehicles), 'Dossier must include vehicles array');
  assert(Array.isArray(custDetailRes.data.tickets), 'Dossier must include tickets array');
  console.log(`✓ GET /api/customers/:id dossier returned: ${custDetailRes.data.name} with ${custDetailRes.data.vehicles.length} vehicle(s) and ${custDetailRes.data.tickets.length} ticket(s)`);

  // 3. Register New Customer with vehicle
  const newCustPayload = {
    name: 'Vikram Aditya',
    primaryPhone: '9880011223',
    altPhones: '9880011224, 9880011225',
    vehicleName: 'Honda CB350 Hness',
    model: 'CB350',
    color: 'Matte Marshall Green Metallic',
    vehicleNo: 'KA-01-EF-5566',
    chassisNo: 'ME4NC390JNA099881'
  };
  const createCustRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/customers',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, newCustPayload);
  assert.strictEqual(createCustRes.status, 201, 'POST /api/customers should return 201');
  assert(createCustRes.data.id, 'Created customer must have ID');
  const createdCustId = createCustRes.data.id;
  console.log(`✓ POST /api/customers created customer ID #${createdCustId}: ${newCustPayload.name}`);

  // Verify created customer dossier
  const createdCustDetailRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/customers/${createdCustId}`,
    method: 'GET'
  });
  assert.strictEqual(createdCustDetailRes.status, 200);
  assert.strictEqual(createdCustDetailRes.data.name, 'Vikram Aditya');
  assert(createdCustDetailRes.data.vehicles.length > 0, 'Created customer should have linked vehicle');
  assert.strictEqual(createdCustDetailRes.data.vehicles[0].vehicle_no, 'KA-01-EF-5566');
  console.log(`✓ Verified created customer dossier with Indian license plate: ${createdCustDetailRes.data.vehicles[0].vehicle_no}`);

  // 4. Fetch Insurers List
  const insListRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/insurers',
    method: 'GET'
  });
  assert.strictEqual(insListRes.status, 200, 'GET /api/insurers should return 200');
  assert(Array.isArray(insListRes.data) && insListRes.data.length > 0, 'Insurers should be an array');
  const sampleIns = insListRes.data[0];
  console.log(`✓ GET /api/insurers returned ${insListRes.data.length} partners (sample: ${sampleIns.name})`);

  // 5. Fetch Single Insurer Dossier with surveyors and claims tickets
  const insDetailRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/insurers/${sampleIns.id}`,
    method: 'GET'
  });
  assert.strictEqual(insDetailRes.status, 200, 'GET /api/insurers/:id should return 200');
  assert(insDetailRes.data.id === sampleIns.id, 'Insurer ID must match');
  assert(Array.isArray(insDetailRes.data.surveyors), 'Must include surveyors roster');
  assert(Array.isArray(insDetailRes.data.tickets), 'Must include claims tickets array');
  console.log(`✓ GET /api/insurers/:id dossier returned: ${insDetailRes.data.name} with ${insDetailRes.data.surveyors.length} surveyor(s) and ${insDetailRes.data.tickets.length} claims ticket(s)`);

  // 6. Assign / Add Surveyor to Insurer
  const addSurvRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/insurers/${sampleIns.id}/surveyors`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Anand Kulkarni',
    phone: '9944332211'
  });
  assert.strictEqual(addSurvRes.status, 201, 'POST /api/insurers/:id/surveyors should return 201');
  console.log(`✓ POST /api/insurers/:id/surveyors mapped surveyor Anand Kulkarni to ${sampleIns.name}`);

  console.log('\n--- All Dedicated Customer & Insurance API tests PASSED! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
