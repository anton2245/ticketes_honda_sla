// Verification test for Parts & Vehicles APIs
const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Parts & Vehicles API Verification ---');
  let passed = 0;
  let failed = 0;

  // 1. GET /api/parts
  try {
    const res = await request({ hostname: 'localhost', port: 3000, path: '/api/parts', method: 'GET' });
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✓ GET /api/parts returned ${res.data.length} parts`);
      passed++;
    } else {
      console.error('✗ GET /api/parts failed', res);
      failed++;
    }
  } catch (e) {
    console.error('✗ GET /api/parts error', e);
    failed++;
  }

  // 2. POST /api/parts (create test part)
  let testPartId = null;
  const testPartName = 'Verification Spark Plug ' + Date.now();
  try {
    const res = await request({
      hostname: 'localhost', port: 3000, path: '/api/parts', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      part_name: testPartName,
      part_code: 'TEST-SPK-99',
      default_cost: 450,
      stock_qty: 10
    });
    if (res.status === 201 && res.data.id) {
      testPartId = res.data.id;
      console.log(`✓ POST /api/parts created part ID ${testPartId} (${testPartName})`);
      passed++;
    } else {
      console.error('✗ POST /api/parts failed', res);
      failed++;
    }
  } catch (e) {
    console.error('✗ POST /api/parts error', e);
    failed++;
  }

  // 3. GET /api/parts/:id
  if (testPartId) {
    try {
      const res = await request({ hostname: 'localhost', port: 3000, path: `/api/parts/${testPartId}`, method: 'GET' });
      if (res.status === 200 && res.data.part_name === testPartName && res.data.stock_qty === 10) {
        console.log(`✓ GET /api/parts/:id verified part details and stock_status: ${res.data.stock_status}`);
        passed++;
      } else {
        console.error('✗ GET /api/parts/:id failed', res);
        failed++;
      }
    } catch (e) {
      console.error('✗ GET /api/parts/:id error', e);
      failed++;
    }

    // 4. PUT /api/parts/:id (update stock and cost)
    try {
      const res = await request({
        hostname: 'localhost', port: 3000, path: `/api/parts/${testPartId}`, method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      }, {
        part_name: testPartName,
        part_code: 'TEST-SPK-99-REV',
        default_cost: 520,
        stock_qty: 2 // Should be low stock
      });
      if (res.status === 200 && res.data.stock_qty === 2 && res.data.default_cost === 520) {
        console.log(`✓ PUT /api/parts/:id updated stock to ${res.data.stock_qty} and cost to ₹${res.data.default_cost}`);
        passed++;
      } else {
        console.error('✗ PUT /api/parts/:id failed', res);
        failed++;
      }
    } catch (e) {
      console.error('✗ PUT /api/parts/:id error', e);
      failed++;
    }
  }

  // 5. GET /api/parts-orders
  let firstOrderId = null;
  let firstOrderStatus = null;
  try {
    const res = await request({ hostname: 'localhost', port: 3000, path: '/api/parts-orders', method: 'GET' });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      firstOrderId = res.data[0].id;
      firstOrderStatus = res.data[0].part_status;
      console.log(`✓ GET /api/parts-orders returned ${res.data.length} ordered parts across tickets`);
      passed++;
    } else {
      console.error('✗ GET /api/parts-orders failed', res);
      failed++;
    }
  } catch (e) {
    console.error('✗ GET /api/parts-orders error', e);
    failed++;
  }

  // 6. POST /api/parts-orders/:id/status
  if (firstOrderId) {
    try {
      const newStatus = firstOrderStatus === 'ARRIVED' ? 'ORDERED' : 'ARRIVED';
      const res = await request({
        hostname: 'localhost', port: 3000, path: `/api/parts-orders/${firstOrderId}/status`, method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { status: newStatus });
      if (res.status === 200 && res.data.part_status === newStatus) {
        console.log(`✓ POST /api/parts-orders/:id/status toggled status to ${newStatus}`);
        passed++;
        // Revert back
        await request({
          hostname: 'localhost', port: 3000, path: `/api/parts-orders/${firstOrderId}/status`, method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, { status: firstOrderStatus });
      } else {
        console.error('✗ POST /api/parts-orders/:id/status failed', res);
        failed++;
      }
    } catch (e) {
      console.error('✗ POST /api/parts-orders/:id/status error', e);
      failed++;
    }
  }

  // 7. GET /api/vehicles
  try {
    const res = await request({ hostname: 'localhost', port: 3000, path: '/api/vehicles', method: 'GET' });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      console.log(`✓ GET /api/vehicles returned ${res.data.length} vehicles with owner & ticket metrics`);
      passed++;
    } else {
      console.error('✗ GET /api/vehicles failed', res);
      failed++;
    }
  } catch (e) {
    console.error('✗ GET /api/vehicles error', e);
    failed++;
  }

  // 8. POST /api/vehicles (create test vehicle)
  let testVehId = null;
  const testPlate = 'KL' + Math.floor(10 + Math.random() * 89) + 'TX' + Math.floor(1000 + Math.random() * 8999);
  try {
    const res = await request({
      hostname: 'localhost', port: 3000, path: '/api/vehicles', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      customer_id: 1,
      model: 'CB350 Hness Custom',
      color: 'Precious Red Metallic',
      vehicle_no: testPlate,
      chassis_no: 'VIN' + Date.now()
    });
    if (res.status === 201 && res.data.id) {
      testVehId = res.data.id;
      console.log(`✓ POST /api/vehicles registered vehicle ID ${testVehId} with plate ${testPlate}`);
      passed++;
    } else {
      console.error('✗ POST /api/vehicles failed', res);
      failed++;
    }
  } catch (e) {
    console.error('✗ POST /api/vehicles error', e);
    failed++;
  }

  // 9. GET /api/vehicles/:id
  if (testVehId) {
    try {
      const res = await request({ hostname: 'localhost', port: 3000, path: `/api/vehicles/${testVehId}`, method: 'GET' });
      if (res.status === 200 && res.data.vehicle_no === testPlate && Array.isArray(res.data.tickets)) {
        console.log(`✓ GET /api/vehicles/:id loaded vehicle profile and service ticket history array`);
        passed++;
      } else {
        console.error('✗ GET /api/vehicles/:id failed', res);
        failed++;
      }
    } catch (e) {
      console.error('✗ GET /api/vehicles/:id error', e);
      failed++;
    }

    // 10. PUT /api/vehicles/:id
    try {
      const res = await request({
        hostname: 'localhost', port: 3000, path: `/api/vehicles/${testVehId}`, method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      }, {
        model: 'CB350 Hness Special Edition',
        color: 'Matte Marshall Green',
        vehicle_no: testPlate,
        customer_id: 1
      });
      if (res.status === 200 && res.data.model === 'CB350 Hness Special Edition' && res.data.color === 'Matte Marshall Green') {
        console.log(`✓ PUT /api/vehicles/:id updated model and color successfully`);
        passed++;
      } else {
        console.error('✗ PUT /api/vehicles/:id failed', res);
        failed++;
      }
    } catch (e) {
      console.error('✗ PUT /api/vehicles/:id error', e);
      failed++;
    }
  }

  console.log(`\n--- Verification Results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
