const assert = require('assert');
const slaEngine = require('../server/slaEngine');

console.log('--- Starting Honda Service Ticketing Test Suite ---\n');

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. Working Days Tests (Mon-Sat, Sunday excluded, Holidays excluded)
it('Should consider Monday through Saturday as working days and Sunday as non-working', () => {
  const holidays = new Set(['2026-01-26']); // Republic Day
  
  // 2026-09-07 is Monday
  const monday = new Date('2026-09-07T10:00:00Z');
  assert.strictEqual(slaEngine.isWorkingDay(monday, holidays), true, 'Monday should be a working day');

  // 2026-09-12 is Saturday
  const saturday = new Date('2026-09-12T10:00:00Z');
  assert.strictEqual(slaEngine.isWorkingDay(saturday, holidays), true, 'Saturday should be a working day');

  // 2026-09-13 is Sunday
  const sunday = new Date('2026-09-13T10:00:00Z');
  assert.strictEqual(slaEngine.isWorkingDay(sunday, holidays), false, 'Sunday should NOT be a working day');

  // Holiday
  const holidayDate = new Date('2026-01-26T10:00:00Z');
  assert.strictEqual(slaEngine.isWorkingDay(holidayDate, holidays), false, 'Holiday should NOT be a working day');
});

it('Should accurately calculate elapsed working days across weekend and normal days', () => {
  // Friday 2026-09-11 to Monday 2026-09-14:
  // Saturday 12 is working (1 WD), Sunday 13 is OFF, Monday 14 is working (2 WD)
  const startFri = new Date('2026-09-11T09:00:00Z');
  const endMon = new Date('2026-09-14T17:00:00Z');

  const wd = slaEngine.calculateWorkingDays(startFri, endMon);
  assert.strictEqual(wd, 2, 'Friday to Monday should count 2 working days (Sat + Mon)');
});

// 2. SLA Limits & Evaluation Tests
it('Should accurately flag SLA status based on stage limits', () => {
  // Stage 2 is Estimate Preparation: limit is 2 WD
  const entered = new Date('2026-09-07T09:00:00Z'); // Mon
  const onTimeEnd = new Date('2026-09-08T10:00:00Z'); // Tue (1 WD elapsed) -> Within SLA / Due Soon
  const eval1 = slaEngine.evaluateStageSLA(2, entered, null, onTimeEnd);
  assert.strictEqual(eval1.isBreached, false);
  assert.strictEqual(eval1.elapsedWD, 1);
  assert.strictEqual(eval1.remainingWD, 1);
  assert.strictEqual(eval1.status, 'DUE_SOON');

  // Breached: 4 working days elapsed (Mon to Fri) for 2 WD limit
  const lateEnd = new Date('2026-09-11T10:00:00Z'); // Fri (4 WD elapsed)
  const eval2 = slaEngine.evaluateStageSLA(2, entered, null, lateEnd);
  assert.strictEqual(eval2.isBreached, true);
  assert.strictEqual(eval2.status, 'BREACHED');
  assert.strictEqual(eval2.badge, '🔴');
});

it('Should branch next stage correctly when parts order is required or skipped', () => {
  // Stage 5 Approval -> If parts order required (true) -> Stage 6 Parts Order
  assert.strictEqual(slaEngine.getNextStageId(5, true, false), 6);

  // Stage 5 Approval -> If parts order NOT required (false) -> Stage 8 Work Start
  assert.strictEqual(slaEngine.getNextStageId(5, false, false), 8);

  // Stage 10 Invoice -> If resurvey required (true) -> Stage 11 Resurvey
  assert.strictEqual(slaEngine.getNextStageId(10, false, true), 11);

  // Stage 10 Invoice -> If resurvey NOT required (false) -> Stage 12 Customer Delivery
  assert.strictEqual(slaEngine.getNextStageId(10, false, false), 12);
});

// 4. Vite React SPA Serving Test
const http = require('http');
const { startServer, stopServer } = require('../server/server');

(async () => {
  try {
    const { port } = await startServer(3998);
    await new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', async () => {
          try {
            assert.strictEqual(res.statusCode, 200, 'Server should respond 200 OK');
            assert.strictEqual(body.includes('<div id="root"></div>'), true, 'Should serve React root div');
            assert.strictEqual(body.includes('Honda Service Ticket SLA'), true, 'Should serve React index page title');
            console.log('  ✓ Should serve compiled Vite + React production SPA');
            passed++;
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    // 5. Auth API Integration Test
    await new Promise((resolve, reject) => {
      const loginPayload = JSON.stringify({ username: 'admin', password: 'admin' });
      const req = http.request(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginPayload)
        }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', async () => {
          try {
            assert.strictEqual(res.statusCode, 200, 'Login should respond 200 OK');
            const json = JSON.parse(data);
            assert.strictEqual(json.success, true);
            assert.ok(json.token, 'Should return session token');
            assert.strictEqual(json.user.username, 'admin');
            assert.strictEqual(json.user.role, 'admin');

            // Verify /api/auth/me with Bearer token
            await new Promise((meResolve, meReject) => {
              http.get(`http://localhost:${port}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${json.token}` }
              }, (meRes) => {
                let meData = '';
                meRes.on('data', c => meData += c);
                meRes.on('end', () => {
                  try {
                    assert.strictEqual(meRes.statusCode, 200);
                    const meJson = JSON.parse(meData);
                    assert.strictEqual(meJson.user.username, 'admin');
                    meResolve();
                  } catch (err) {
                    meReject(err);
                  }
                });
              }).on('error', meReject);
            });

            // Verify logout
            await new Promise((logoutResolve, logoutReject) => {
              const logoutReq = http.request(`http://localhost:${port}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${json.token}` }
              }, (logoutRes) => {
                assert.strictEqual(logoutRes.statusCode, 200);
                logoutResolve();
              });
              logoutReq.on('error', logoutReject);
              logoutReq.end();
            });

            console.log('  ✓ Should login admin, verify /api/auth/me session token, and logout');
            passed++;
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('error', reject);
      req.write(loginPayload);
      req.end();
    });

    await stopServer();
  } catch (err) {
    console.error('  ✗ Auth and SPA integration tests failed');
    console.error(`    ${err.message}`);
    failed++;
  }

  console.log(`\n--- Test Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();

