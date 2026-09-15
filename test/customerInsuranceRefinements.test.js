const http = require('http');
const assert = require('assert');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Customer & Insurance Refinements & Features ---');

  // 1. Create a customer without vehicle, with branch tag and notes
  console.log('1. Testing POST /api/customers without vehicle (branch & notes)...');
  const createRes = await request('POST', '/api/customers', {
    name: 'Ananya Deshmukh',
    primaryPhone: '+91 99001 22334',
    altPhones: '98888 11111',
    branchId: 1,
    notes: 'VIP customer. Prefers evening delivery and spotless polish.'
  });
  assert.strictEqual(createRes.status, 201, 'Expected 201 on create customer');
  const custId = createRes.body.id;
  console.log(`✓ Created customer ID #${custId}`);

  // 2. Fetch customer dossier and verify branch & notes
  console.log('2. Testing GET /api/customers/:id to verify branch & notes...');
  const getRes = await request('GET', `/api/customers/${custId}`);
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.name, 'Ananya Deshmukh');
  assert.strictEqual(getRes.body.branch_id, 1);
  assert.strictEqual(getRes.body.notes, 'VIP customer. Prefers evening delivery and spotless polish.');
  assert.strictEqual(getRes.body.vehicles.length, 0, 'Should have 0 vehicles');
  console.log(`✓ Customer dossier verified: Branch ID ${getRes.body.branch_id}, Notes: "${getRes.body.notes}"`);

  // 3. Edit customer profile via PUT /api/customers/:id
  console.log('3. Testing PUT /api/customers/:id (edit profile)...');
  const putRes = await request('PUT', `/api/customers/${custId}`, {
    name: 'Ananya Deshmukh-Rao',
    primaryPhone: '+91 99001 22334',
    altPhones: '97777 00000',
    branchId: 2,
    notes: 'Updated: VIP client, request water wash only.'
  });
  assert.strictEqual(putRes.status, 200);
  const getAfterPut = await request('GET', `/api/customers/${custId}`);
  assert.strictEqual(getAfterPut.body.name, 'Ananya Deshmukh-Rao');
  assert.strictEqual(getAfterPut.body.branch_id, 2);
  assert.strictEqual(getAfterPut.body.notes, 'Updated: VIP client, request water wash only.');
  console.log(`✓ Customer updated successfully: Name "${getAfterPut.body.name}", Branch ID ${getAfterPut.body.branch_id}`);

  // 4. Fast Note Update via PATCH /api/customers/:id/notes
  console.log('4. Testing PATCH /api/customers/:id/notes...');
  const patchRes = await request('PATCH', `/api/customers/${custId}/notes`, {
    notes: 'Quick remark: handle rear mirror carefully.'
  });
  assert.strictEqual(patchRes.status, 200);
  const getAfterPatch = await request('GET', `/api/customers/${custId}`);
  assert.strictEqual(getAfterPatch.body.notes, 'Quick remark: handle rear mirror carefully.');
  console.log(`✓ Fast note update verified: "${getAfterPatch.body.notes}"`);

  // 5. Test Surveyor Performance endpoint
  console.log('5. Testing GET /api/surveyors (performance & SLA turnaround)...');
  const survRes = await request('GET', '/api/surveyors');
  assert.strictEqual(survRes.status, 200);
  assert(Array.isArray(survRes.body), 'Expected array of surveyors');
  assert(survRes.body.length > 0, 'Expected at least 1 surveyor');
  const sampleSurv = survRes.body[0];
  assert('avg_sla_days_wd' in sampleSurv, 'Expected avg_sla_days_wd field');
  assert('sla_adherence_pct' in sampleSurv, 'Expected sla_adherence_pct field');
  assert('sla_rating' in sampleSurv, 'Expected sla_rating field');
  console.log(`✓ Surveyor performance verified: ${survRes.body.length} surveyors. Sample: ${sampleSurv.name}, Avg SLA: ${sampleSurv.avg_sla_days_wd} WD, Rating: ${sampleSurv.sla_rating}`);

  // 6. Test Unmapping / Removing Surveyor from an Insurer
  console.log('6. Testing surveyor assignment and unmapping...');
  // First map a surveyor
  const assignRes = await request('POST', '/api/insurers/1/surveyors', {
    name: 'Temporary Surveyor',
    phone: '+91 91234 56789'
  });
  assert.strictEqual(assignRes.status, 201);
  const tempSurvId = assignRes.body.id;
  console.log(`✓ Assigned Temporary Surveyor ID #${tempSurvId} to Insurer #1`);

  // Now delete the mapping via DELETE /api/insurers/:id/surveyors/:surveyorId
  const deleteRes = await request('DELETE', `/api/insurers/1/surveyors/${tempSurvId}`);
  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.body.success, true);
  console.log(`✓ Successfully unmapped surveyor #${tempSurvId} from Insurer #1`);

  // Verify insurer #1 does not list this surveyor
  const insDetail = await request('GET', '/api/insurers/1');
  const hasSurv = (insDetail.body.surveyors || []).some(s => s.id === tempSurvId);
  assert.strictEqual(hasSurv, false, 'Temporary surveyor should no longer be mapped to Insurer #1');
  console.log('✓ Verified surveyor is absent from insurer dossier');

  console.log('\n--- All Customer & Insurance Refinement Tests PASSED! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
