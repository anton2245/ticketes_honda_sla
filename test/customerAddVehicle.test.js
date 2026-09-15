const http = require('http');
const assert = require('assert');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runVehicleTests() {
  console.log('--- Starting Customer Add Vehicle Integration Test ---');

  // 1. Create a test customer
  const custRes = await request('POST', '/api/customers', {
    name: 'Vikram Malhotra',
    primaryPhone: '9845012345',
    notes: 'Premium customer test'
  });
  assert.strictEqual(custRes.status, 201, 'Customer creation should return 201');
  const customerId = custRes.data.id;
  console.log(`✓ Customer created with ID: ${customerId}`);

  // 2. Add vehicle to customer garage
  const vehRes = await request('POST', `/api/customers/${customerId}/vehicles`, {
    model: 'CB350RS',
    color: 'Matte Massive Grey',
    vehicleNo: 'KA-05-EX-9988',
    chassisNo: 'ME4JF5048N1234567'
  });
  assert.strictEqual(vehRes.status, 201, 'Adding vehicle should return 201');
  assert.strictEqual(vehRes.data.model, 'CB350RS');
  assert.strictEqual(vehRes.data.vehicleNo, 'KA-05-EX-9988');
  assert.strictEqual(vehRes.data.color, 'Matte Massive Grey');
  console.log('✓ Vehicle successfully added to customer garage');

  // 3. Verify Customer Dossier has this vehicle
  const dossierRes = await request('GET', `/api/customers/${customerId}`);
  assert.strictEqual(dossierRes.status, 200, 'Customer dossier should return 200');
  assert.ok(Array.isArray(dossierRes.data.vehicles), 'Dossier should contain vehicles array');
  const foundVeh = dossierRes.data.vehicles.find(v => v.vehicle_no === 'KA-05-EX-9988');
  assert.ok(foundVeh, 'Added vehicle should appear in customer dossier');
  assert.strictEqual(foundVeh.model, 'CB350RS');
  assert.strictEqual(foundVeh.chassis_no, 'ME4JF5048N1234567');
  console.log('✓ Verified added vehicle in customer dossier GET response');

  // 4. Add a second vehicle (multi-vehicle garage test)
  const veh2Res = await request('POST', `/api/customers/${customerId}/vehicles`, {
    model: 'Activa 6G',
    color: 'Pearl Siren Blue',
    vehicleNo: 'KA-05-SC-1122'
  });
  assert.strictEqual(veh2Res.status, 201, 'Adding second vehicle should return 201');

  const dossier2Res = await request('GET', `/api/customers/${customerId}`);
  assert.strictEqual(dossier2Res.data.vehicles.length, 2, 'Customer should now have 2 vehicles in garage');
  console.log('✓ Verified multi-vehicle garage has 2 vehicles');

  console.log('--- All Add Vehicle Tests Passed Successfully! ---');
}

runVehicleTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
