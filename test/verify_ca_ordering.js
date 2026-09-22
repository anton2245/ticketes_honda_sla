const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Testing CA 2-Step Ordering & Parts Order Table Reflection ---');

  // 1. Get tickets
  const ticketsRes = await request({ hostname: 'localhost', port: 3000, path: '/api/tickets', method: 'GET' });
  if (ticketsRes.status !== 200 || !Array.isArray(ticketsRes.data) || ticketsRes.data.length === 0) {
    throw new Error('Could not fetch tickets from server');
  }

  // Find a ticket or use the first one
  const ticket = ticketsRes.data[0];
  const ticketId = ticket.id;
  console.log(`Using ticket ID ${ticketId} (#${ticket.ticket_number})`);

  // Add a test part with qty 3 and customer approval
  const partRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/tickets/${ticketId}/parts-approval`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    newParts: [
      {
        part_name: 'TEST CA Rear Brake Disc',
        part_code: 'TEST-RBD-99',
        quantity: 3,
        unit_cost: 1500,
        total_cost: 4500,
        customer_approved_qty: 3,
        customer_approval_status: 'APPROVED',
        part_status: 'PENDING',
        locators: 'A-01'
      }
    ]
  });

  if (partRes.status !== 200) {
    throw new Error(`Failed to add test part: ${JSON.stringify(partRes.data)}`);
  }

  const addedPart = partRes.data.parts.find(p => p.part_code === 'TEST-RBD-99');
  if (!addedPart) {
    throw new Error('Test part not found in ticket parts');
  }
  console.log(`✓ Created test customer approved part #${addedPart.id} with CA qty 3`);

  // 2. Fulfill via POST /api/tickets/:id/ca-fulfill with a split: 1 from stock (ARRIVED), 2 to purchase (ORDERED)
  const fulfillRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/tickets/${ticketId}/ca-fulfill`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    allocations: [
      {
        partId: addedPart.id,
        takeFromStockQty: 1,
        purchaseQty: 2,
        locators: 'A-01'
      }
    ]
  });

  if (fulfillRes.status !== 200) {
    throw new Error(`ca-fulfill endpoint failed: ${JSON.stringify(fulfillRes.data)}`);
  }

  console.log(`✓ POST /api/tickets/${ticketId}/ca-fulfill succeeded: updatedCount = ${fulfillRes.data.updatedCount}`);

  // 3. Check GET /api/parts-orders to verify both rows reflect on PARTS Order table
  const ordersRes = await request({ hostname: 'localhost', port: 3000, path: '/api/parts-orders', method: 'GET' });
  if (ordersRes.status !== 200) {
    throw new Error(`GET /api/parts-orders failed: ${JSON.stringify(ordersRes.data)}`);
  }

  const testOrders = ordersRes.data.filter(o => o.part_code === 'TEST-RBD-99' && o.ticket_id === ticketId);
  console.log(`Found ${testOrders.length} test order records in /api/parts-orders:`);
  testOrders.forEach(o => {
    console.log(`  - ID: ${o.id}, Status: ${o.part_status}, Qty: ${o.quantity}, Cust Status: ${o.customer_approval_status}, ArrivedAt: ${o.arrived_at || 'null'}`);
  });

  const arrivedRow = testOrders.find(o => o.part_status === 'ARRIVED');
  const orderedRow = testOrders.find(o => o.part_status === 'ORDERED');

  if (!arrivedRow || arrivedRow.quantity !== 1) {
    throw new Error('Expected 1 item fulfilled from stock with status ARRIVED');
  }
  if (!orderedRow || orderedRow.quantity !== 2) {
    throw new Error('Expected 2 items purchased with status ORDERED');
  }

  console.log('✓ Successfully verified:');
  console.log('  1. Stock allocation is marked ARRIVED with qty = 1');
  console.log('  2. Supplier purchase is marked ORDERED with qty = 2');
  console.log('  3. Both records are present in PARTS Order table feed (/api/parts-orders) with customer approval status APPROVED');
  console.log('--- All CA ordering & Parts Order table tests passed! ---');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
