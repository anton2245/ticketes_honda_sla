const { initDb, all, get, run } = require('../server/db');
const http = require('http');

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

async function testPartsNote() {
  console.log('--- Testing Parts Delay & Paint Job Note Functionality ---');
  await initDb();

  const ticket = await get('SELECT id, ticket_number, current_stage_id, parts_status_note FROM tickets LIMIT 1');
  if (!ticket) {
    throw new Error('No ticket found in database');
  }
  console.log(`Found sample ticket: ${ticket.ticket_number} (ID: ${ticket.id}, Stage: #${ticket.current_stage_id})`);

  // 1. Direct DB test: update parts_status_note
  const testNote = '🎨 Sent for Paint Job: Front cowl and bumper at booth';
  await run('UPDATE tickets SET parts_status_note = ? WHERE id = ?', [testNote, ticket.id]);
  const verifyDb = await get('SELECT parts_status_note FROM tickets WHERE id = ?', [ticket.id]);
  if (verifyDb.parts_status_note !== testNote) {
    throw new Error(`DB note mismatch! Expected: "${testNote}", got: "${verifyDb.parts_status_note}"`);
  }
  console.log('✓ DB persistence for parts_status_note verified');

  // 2. HTTP API test: POST /api/tickets/:id/parts-note
  const setRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: `/api/tickets/${ticket.id}/parts-note`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { note: '⏳ Vendor / Transit Delay: Waiting on side mirrors' });

  if (setRes.status !== 200 || setRes.data.parts_status_note !== '⏳ Vendor / Transit Delay: Waiting on side mirrors') {
    throw new Error(`API set note failed: status ${setRes.status}, data: ${JSON.stringify(setRes.data)}`);
  }
  console.log('✓ POST /api/tickets/:id/parts-note successfully updated note:', setRes.data.parts_status_note);

  // 3. Clear note via API
  const clearRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: `/api/tickets/${ticket.id}/parts-note`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { note: '' });

  if (clearRes.status !== 200 || clearRes.data.parts_status_note !== null) {
    throw new Error(`API clear note failed: status ${clearRes.status}, data: ${JSON.stringify(clearRes.data)}`);
  }
  console.log('✓ Clearing note via API successfully set parts_status_note to null');

  console.log('\n--- All Parts Note tests PASSED! ---');
}

testPartsNote().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
