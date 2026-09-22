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
  console.log('=== STARTING STAGE 7 & ARRIVAL PROGRESS TEST ===\n');

  // 1. Create a test ticket
  const createRes = await request('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      vehicle_plate: 'TEST-ARR-777',
      vehicle_model: 'Civic RS Turbo',
      customer_name: 'Arrival Test Customer',
      customer_phone: '03001234567',
      outlet_id: 1,
      claim_type: 'INSURANCE'
    }
  });

  if (createRes.status !== 201) {
    throw new Error(`Failed to create ticket: ${JSON.stringify(createRes.data)}`);
  }
  const ticketId = createRes.data.id;
  console.log(`1. Created test ticket #${ticketId}`);

  // 2. Add 3 parts to the ticket
  const part1 = await request(`/api/tickets/${ticketId}/parts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { part_name: 'Front Bumper Cover', part_code: '71101-TEA-Z00', quantity: 1, unit_cost: 15000, part_status: 'ORDERED' }
  });
  const part2 = await request(`/api/tickets/${ticketId}/parts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { part_name: 'Left Headlight Assy', part_code: '33150-TEA-Z01', quantity: 1, unit_cost: 45000, part_status: 'ORDERED' }
  });
  const part3 = await request(`/api/tickets/${ticketId}/parts/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { part_name: 'Fog Light Bezel', part_code: '71103-TEA-Z00', quantity: 1, unit_cost: 5000, part_status: 'ORDERED' }
  });

  const p1Id = part1.data.part.id;
  const p2Id = part2.data.part.id;
  const p3Id = part3.data.part.id;
  console.log(`2. Added 3 ordered parts: IDs [${p1Id}, ${p2Id}, ${p3Id}]`);

  // Move ticket to Stage 6 first
  const db = require('../server/db');
  await db.run('UPDATE tickets SET current_stage_id = 6 WHERE id = ?;', [ticketId]);
  console.log('3. Moved ticket to Stage 6 (Parts Order)');

  // 3. Advance to Stage 7 with PARTIAL ARRIVAL (only 1 out of 3 parts arrived: p1Id)
  console.log('4. Advancing to Stage 7 with partial arrival: partId', p1Id);
  const advanceRes = await request(`/api/tickets/${ticketId}/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      nextStageId: 7,
      arrivedPartIds: [p1Id],
      notes: 'Partial arrival received: Front bumper arrived'
    }
  });

  if (advanceRes.status !== 200) {
    throw new Error(`Failed to advance with partial arrival: status ${advanceRes.status} - ${JSON.stringify(advanceRes.data)}`);
  }
  console.log('✓ Stage advance to Stage 7 SUCCEEDED with partial arrival (1 of 3)!');

  // 4. Check ticket stats
  const ticketsRes = await request(`/api/tickets?search=TEST-ARR-777`);
  const ticket = ticketsRes.data.find(t => t.id === ticketId);
  console.log(`5. Ticket stats from GET /api/tickets:`);
  console.log(`   - Current Stage: ${ticket.current_stage_id} (Expected: 7)`);
  console.log(`   - Total Parts: ${ticket.total_parts_count} (Expected: 3)`);
  console.log(`   - Arrived Parts: ${ticket.arrived_parts_count} (Expected: 1)`);

  if (Number(ticket.total_parts_count) !== 3 || Number(ticket.arrived_parts_count) !== 1) {
    throw new Error('Stats mismatch for partial arrival 1/3!');
  }
  console.log('✓ Verified 1/3 arrival representation!');

  // 5. Test Shortcut (More > Arrival -> batch-arrival) to mark remaining parts arrived
  console.log('6. Testing More > Arrival batch-arrival shortcut to mark remaining 2 parts arrived...');
  const batchRes = await request(`/api/tickets/${ticketId}/parts/batch-arrival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      partIds: [p1Id, p2Id, p3Id],
      syncAll: true,
      notes: 'Remaining 2 parts arrived via context menu shortcut'
    }
  });

  if (batchRes.status !== 200) {
    throw new Error(`Batch arrival failed: ${JSON.stringify(batchRes.data)}`);
  }
  console.log('✓ Batch arrival shortcut succeeded!');
  console.log(`   - Updated arrived_parts_count: ${batchRes.data.ticket.arrived_parts_count} / ${batchRes.data.ticket.total_parts_count}`);

  if (Number(batchRes.data.ticket.arrived_parts_count) !== 3) {
    throw new Error('Expected 3/3 arrived parts after shortcut!');
  }
  console.log('✓ Verified 3/3 full arrival (full green bar)!');

  // 6. Clean up test ticket
  await db.run('DELETE FROM ticket_parts WHERE ticket_id = ?;', [ticketId]);
  await db.run('DELETE FROM ticket_comments WHERE ticket_id = ?;', [ticketId]);
  try {
    await db.run('DELETE FROM ticket_stage_timelines WHERE ticket_id = ?;', [ticketId]);
  } catch (_) {}
  await db.run('DELETE FROM tickets WHERE id = ?;', [ticketId]);
  console.log(`7. Cleaned up test ticket #${ticketId}`);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
