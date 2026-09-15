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
  console.log('--- Testing Multiple Branch Tagging For Customers ---');

  // 1. Create a customer tagged to multiple branches (e.g. Branch 1 and 2)
  console.log('1. Testing POST /api/customers with multiple branchIds [1, 2]...');
  const createRes = await request('POST', '/api/customers', {
    name: 'Vikramaditya Hegde',
    primaryPhone: '+91 91234 56789',
    altPhones: '91234 00000',
    branchIds: [1, 2],
    notes: 'Visits both Koramangala Hub and Whitefield Express'
  });
  assert.strictEqual(createRes.status, 201, 'Expected 201 on create customer');
  const custId = createRes.body.id;
  console.log(`✓ Created customer ID #${custId} with branchIds [1, 2]`);

  // 2. Fetch customer dossier and verify branches array contains both outlets
  console.log('2. Testing GET /api/customers/:id to verify branches array...');
  const getRes = await request('GET', `/api/customers/${custId}`);
  assert.strictEqual(getRes.status, 200);
  assert.ok(Array.isArray(getRes.body.branches), 'Expected branches to be an array');
  assert.strictEqual(getRes.body.branches.length, 2, 'Expected 2 tagged branches');
  
  const branchIds = getRes.body.branches.map(b => b.id).sort();
  assert.deepStrictEqual(branchIds, [1, 2], 'Expected branch IDs 1 and 2');
  console.log(`✓ Customer dossier verified: branches: ${JSON.stringify(getRes.body.branches.map(b => b.name))}`);

  // 3. Update customer branches to [2, 3] via PUT /api/customers/:id
  console.log('3. Testing PUT /api/customers/:id updating branchIds to [2, 3]...');
  const putRes = await request('PUT', `/api/customers/${custId}`, {
    name: 'Vikramaditya Hegde',
    primaryPhone: '+91 91234 56789',
    branchIds: [2, 3],
    notes: 'Relocated to Indiranagar, tags updated to [2, 3]'
  });
  assert.strictEqual(putRes.status, 200, 'Expected 200 on customer update');

  const getAfterPut = await request('GET', `/api/customers/${custId}`);
  assert.strictEqual(getAfterPut.status, 200);
  assert.strictEqual(getAfterPut.body.branches.length, 2);
  const updatedBranchIds = getAfterPut.body.branches.map(b => b.id).sort();
  assert.deepStrictEqual(updatedBranchIds, [2, 3], 'Expected updated branch IDs 2 and 3');
  console.log(`✓ Updated customer dossier verified with branches: ${JSON.stringify(getAfterPut.body.branches.map(b => b.name))}`);

  // 4. Verify GET /api/customers includes branches array in master list
  console.log('4. Testing GET /api/customers list contains enriched branches...');
  const listRes = await request('GET', '/api/customers');
  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.find(c => c.id === custId);
  assert.ok(found, 'Customer must be in master list');
  assert.ok(Array.isArray(found.branches), 'Customer in list must have branches array');
  assert.strictEqual(found.branches.length, 2, 'Customer in list must have 2 branches');
  console.log(`✓ Customer master list includes branches array: ${JSON.stringify(found.branches)}`);

  console.log('\n========================================');
  console.log('✓ All Multiple Branch Tagging Tests Passed!');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
