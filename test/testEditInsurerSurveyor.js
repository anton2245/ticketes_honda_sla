const assert = require('assert');
const http = require('http');

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTest() {
  console.log('Testing Insurer and Surveyor Edit endpoints...');

  // 1. Get an existing insurer
  const insList = await request('GET', '/api/insurers');
  assert(Array.isArray(insList.body) && insList.body.length > 0, 'Should have insurers');
  const targetIns = insList.body[0];

  // Edit insurer
  const updatedInsName = targetIns.name + ' (Updated)';
  const editInsRes = await request('PUT', `/api/insurers/${targetIns.id}`, {
    name: updatedInsName,
    contact_info: '1800-EDITED / claims-updated@test.com'
  });
  assert.strictEqual(editInsRes.status, 200, 'PUT /api/insurers/:id should succeed');
  assert.strictEqual(editInsRes.body.name, updatedInsName);
  console.log('✓ Insurer edit successful:', editInsRes.body);

  // Restore insurer
  await request('PUT', `/api/insurers/${targetIns.id}`, {
    name: targetIns.name,
    contact_info: targetIns.contact_info || ''
  });
  console.log('✓ Insurer restored');

  // 2. Get an existing surveyor
  const survList = await request('GET', '/api/surveyors');
  assert(Array.isArray(survList.body) && survList.body.length > 0, 'Should have surveyors');
  const targetSurv = survList.body[0];

  // Edit surveyor
  const updatedSurvName = targetSurv.name + ' (Edited)';
  const editSurvRes = await request('PUT', `/api/surveyors/${targetSurv.id}`, {
    name: updatedSurvName,
    phone: '9998887776'
  });
  assert.strictEqual(editSurvRes.status, 200, 'PUT /api/surveyors/:id should succeed');
  assert.strictEqual(editSurvRes.body.name, updatedSurvName);
  assert.strictEqual(editSurvRes.body.phone, '9998887776');
  console.log('✓ Surveyor edit successful:', editSurvRes.body);

  // Restore surveyor
  await request('PUT', `/api/surveyors/${targetSurv.id}`, {
    name: targetSurv.name,
    phone: targetSurv.phone
  });
  console.log('✓ Surveyor restored');

  console.log('All insurer and surveyor edit API tests passed!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
