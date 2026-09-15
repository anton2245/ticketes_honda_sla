const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('RUNNING AUTH & 13-STAGE PERMISSION TESTS');
  console.log('========================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${testName}`);
      process.exitCode = 1;
    }
  }

  // 1. Default Admin Login (admin / admin)
  console.log('--- Test Group 1: Default Admin Login ---');
  const adminLogin = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin'
  });
  assert(adminLogin.statusCode === 200, 'Admin login succeeds with status 200');
  assert(adminLogin.body.token && adminLogin.body.user.role === 'admin', 'Admin token returned with role "admin"');
  assert(adminLogin.body.user.permissions.length === 13, 'Admin has full 13 stage permissions');
  const adminToken = adminLogin.body.token;

  // 2. Bad password fails
  const badLogin = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'wrong_password'
  });
  assert(badLogin.statusCode === 401, 'Invalid password fails with 401');

  // 3. GET /api/auth/me
  const meRes = await request('GET', '/api/auth/me', null, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(meRes.statusCode === 200 && meRes.body.user.username === 'admin', '/api/auth/me returns valid admin');

  // 4. Admin creates standard user with custom stage permissions
  console.log('\n--- Test Group 2: User Creation & Custom Stage Permissions ---');
  const testUsername = `advisor_${Date.now()}`;
  const customPermissions = [
    { stage_id: 1, can_read: 1, can_write: 1, can_delete: 0 },
    { stage_id: 2, can_read: 1, can_write: 1, can_delete: 0 },
    { stage_id: 3, can_read: 1, can_write: 0, can_delete: 0 },
    { stage_id: 4, can_read: 1, can_write: 0, can_delete: 0 },
    { stage_id: 5, can_read: 1, can_write: 0, can_delete: 0 },
    // Stages 6-13: can_read: 0, can_write: 0, can_delete: 0
    { stage_id: 6, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 7, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 8, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 9, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 10, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 11, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 12, can_read: 0, can_write: 0, can_delete: 0 },
    { stage_id: 13, can_read: 0, can_write: 0, can_delete: 0 }
  ];

  const createUserRes = await request('POST', '/api/users', {
    username: testUsername,
    password: 'advisor_password',
    displayName: 'Test Service Advisor',
    role: 'user',
    permissions: customPermissions
  }, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(createUserRes.statusCode === 201, 'Admin can create new user');
  const testUserId = createUserRes.body.user.id;

  // 5. Standard user logs in
  const userLogin = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'advisor_password'
  });
  assert(userLogin.statusCode === 200 && userLogin.body.user.role === 'user', 'Standard user logs in successfully');
  const userToken = userLogin.body.token;

  // 6. Standard user cannot access admin endpoints
  console.log('\n--- Test Group 3: Admin Endpoint Protection ---');
  const forbiddenUsersList = await request('GET', '/api/users', null, {
    'Authorization': `Bearer ${userToken}`
  });
  assert(forbiddenUsersList.statusCode === 403, 'Standard user blocked from GET /api/users with 403');

  // 7. Stage Permission Enforcement
  console.log('\n--- Test Group 4: Stage Permissions (Read, Write, Delete) ---');
  // Get an outlet ID
  const branches = await request('GET', '/api/branches');
  const outletId = branches.body[0].id;

  // User creates ticket at Stage 1 (permitted)
  const ticketCreateRes = await request('POST', '/api/tickets', {
    branchId: outletId,
    customerName: 'Auth Test Customer',
    customerPhone: '+91 99988 77766',
    vehicleNo: `AUTH-${Date.now().toString().slice(-4)}`,
    vehicleName: 'Honda City ZX',
    model: 'City'
  }, {
    'Authorization': `Bearer ${userToken}`
  });
  assert(ticketCreateRes.statusCode === 201, 'User with Stage 1 write can create ticket');
  const ticketId = ticketCreateRes.body.id;

  // User advances to Stage 2 (permitted: user has write on Stage 1 and Stage 2)
  const advanceTo2 = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 2,
    estimatedCost: 15000
  }, {
    'Authorization': `Bearer ${userToken}`
  });
  assert(advanceTo2.statusCode === 200 && advanceTo2.body.current_stage_id === 2, 'User with Stage 2 write can advance to Stage 2');

  // User attempts to advance to Stage 3 (forbidden: user lacks write on Stage 3)
  const advanceTo3 = await request('POST', `/api/tickets/${ticketId}/advance`, {
    targetStageId: 3,
    insuranceCompany: 'HDFC ERGO'
  }, {
    'Authorization': `Bearer ${userToken}`
  });
  assert(advanceTo3.statusCode === 403, 'User without Stage 3 write blocked with 403');

  // User attempts to delete ticket in Stage 2 (forbidden: user has can_delete: 0)
  const deleteForbidden = await request('DELETE', `/api/tickets/${ticketId}`, null, {
    'Authorization': `Bearer ${userToken}`
  });
  assert(deleteForbidden.statusCode === 403, 'User without delete permission blocked with 403');

  // Admin advances to Stage 13
  const adminAdvance = await request('POST', `/api/tickets/${ticketId}/bypass`, {
    reason: 'Customer direct settlement',
    confirmText: 'CONFIRM'
  }, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(adminAdvance.statusCode === 200, 'Admin can bypass/advance to closed stage');

  // User attempts to read Stage 13 ticket (forbidden: user has can_read: 0 on Stage 13)
  const readForbidden = await request('GET', `/api/tickets/${ticketId}`, null, {
    'Authorization': `Bearer ${userToken}`
  });
  assert(readForbidden.statusCode === 403, 'User without Stage 13 read permission blocked with 403');

  // Admin deletes ticket (permitted)
  const adminDelete = await request('DELETE', `/api/tickets/${ticketId}`, null, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(adminDelete.statusCode === 200, 'Admin can delete ticket in any stage');

  // 8. User Management: Reset password & Deactivation
  console.log('\n--- Test Group 5: Admin Password Reset & Deactivation ---');
  const resetRes = await request('POST', `/api/users/${testUserId}/reset-password`, {
    newPassword: 'new_advisor_pass'
  }, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(resetRes.statusCode === 200, 'Admin can reset user password');

  // Old password now fails
  const oldPassLogin = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'advisor_password'
  });
  assert(oldPassLogin.statusCode === 401, 'Old password rejected after reset');

  // New password works
  const newPassLogin = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'new_advisor_pass'
  });
  assert(newPassLogin.statusCode === 200, 'New password login succeeds');

  // Deactivate user
  const deactRes = await request('POST', `/api/users/${testUserId}/toggle-active`, {
    isActive: 0
  }, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(deactRes.statusCode === 200 && deactRes.body.user.is_active === 0, 'Admin can deactivate user');

  // Deactivated user cannot log in
  const deactLogin = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'new_advisor_pass'
  });
  assert(deactLogin.statusCode === 403, 'Deactivated user blocked from logging in with 403');

  // Delete user
  const delUserRes = await request('DELETE', `/api/users/${testUserId}`, null, {
    'Authorization': `Bearer ${adminToken}`
  });
  assert(delUserRes.statusCode === 200, 'Admin can delete user account');

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passed} / ${total} PASSED`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
