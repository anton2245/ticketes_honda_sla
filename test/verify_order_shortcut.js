const http = require('http');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3000${path}`, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function run() {
  console.log('=== STARTING ORDER SHORTCUT & TAB VERIFICATION ===\n');

  // 1. Create a test ticket
  const createRes = await request('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      vehicle_plate: 'TEST-ORD-999',
      vehicle_model: 'City VTEC',
      customer_name: 'Order Shortcut Customer',
      customer_phone: '03009998877',
      outlet_id: 1,
      claim_type: 'INSURANCE'
    }
  });

  if (createRes.status !== 201) {
    throw new Error(`Failed to create ticket: ${JSON.stringify(createRes.data)}`);
  }
  const ticketId = createRes.data.id;
  console.log(`1. Created test ticket #${ticketId}`);

  // 2. Add a Customer Approved part and a Pending part
  const part1 = await request(`/api/tickets/${ticketId}/parts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      part_name: 'Customer Approved Wing Mirror',
      part_code: '76200-T9A-Z01',
      quantity: 1,
      unit_cost: 8500,
      customer_approval_status: 'APPROVED',
      customer_approved_qty: 1
    }
  });

  const part2 = await request(`/api/tickets/${ticketId}/parts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      part_name: 'Pending Front Grill',
      part_code: '71121-T9A-000',
      quantity: 1,
      unit_cost: 6500,
      customer_approval_status: 'PENDING'
    }
  });

  const caPartId = part1.data.part.id;
  const pendingPartId = part2.data.part.id;
  console.log(`2. Added CA Part #${caPartId} and Pending Part #${pendingPartId}`);

  // 3. Test ordering the Customer Approved item
  const orderCaRes = await request(`/api/tickets/${ticketId}/parts/${caPartId}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      orderQty: 1,
      purchaseId: 'PO-CA-777',
      notes: 'Ordered via CA tab shortcut'
    }
  });

  if (orderCaRes.status !== 200) {
    throw new Error(`Failed to order CA part: ${JSON.stringify(orderCaRes.data)}`);
  }
  console.log(`3. Successfully ordered Customer Approved part #${caPartId} with PO-CA-777`);

  // 4. Test "New Order" tab: adding a brand new part and ordering it directly
  const addNewOrderRes = await request(`/api/tickets/${ticketId}/parts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      part_name: 'New Custom Fog Cover',
      part_code: 'NEW-FOG-99',
      quantity: 2,
      unit_cost: 1500,
      purchase_id: 'PO-NEW-888',
      part_status: 'ORDERED'
    }
  });

  if (addNewOrderRes.status !== 201) {
    throw new Error(`Failed to add new order item: ${JSON.stringify(addNewOrderRes.data)}`);
  }
  const newPartId = addNewOrderRes.data.part.id;
  console.log(`4. Successfully added and ordered brand new item #${newPartId} via New Order tab`);

  // 5. Verify ticket stats
  const ticketsRes = await request(`/api/tickets?search=TEST-ORD-999`);
  const ticket = ticketsRes.data.find(t => t.id === ticketId);
  console.log(`5. Verified ticket stats:`);
  console.log(`   - Total parts: ${ticket.total_parts_count}`);
  console.log(`   - Ordered parts: ${ticket.ordered_parts_count}`);
  console.log(`   - Customer approved: ${ticket.ca_count}`);

  if (Number(ticket.ordered_parts_count) < 2) {
    throw new Error(`Expected at least 2 ordered parts, got ${ticket.ordered_parts_count}`);
  }

  // 6. Cleanup
  const db = require('../server/db');
  await db.run('DELETE FROM ticket_parts WHERE ticket_id = ?;', [ticketId]);
  await db.run('DELETE FROM ticket_comments WHERE ticket_id = ?;', [ticketId]);
  try {
    await db.run('DELETE FROM ticket_stage_timelines WHERE ticket_id = ?;', [ticketId]);
  } catch (_) {}
  await db.run('DELETE FROM tickets WHERE id = ?;', [ticketId]);
  console.log(`6. Cleaned up test ticket #${ticketId}`);

  console.log('\n=== ALL ORDER SHORTCUT TESTS PASSED! ===');
  process.exit(0);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
