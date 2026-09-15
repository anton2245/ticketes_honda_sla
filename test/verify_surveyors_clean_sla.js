const { startServer, stopServer } = require('../server/server');
const http = require('http');

function fetchHttp(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: 3000,
      path: urlPath
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', reject);
  });
}

async function verifySurveyors() {
  console.log('=== Verifying Surveyor SLA Output When No Tickets Exist ===');
  let startedSrv = await startServer(3005);
  const port = 3005;

  try {
    // 1. Fetch surveyors list
    const res = await new Promise((resolve, reject) => {
      http.get({ hostname: 'localhost', port, path: '/api/surveyors' }, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(d) }));
      }).on('error', reject);
    });
    console.log(`[PASS] /api/surveyors returned ${res.data.length} surveyors`);

    res.data.forEach(s => {
      console.log(`Surveyor: ${s.name} | Total Claims: ${s.total_claims} | SLA Rating: ${s.sla_rating} | Avg Days: ${s.avg_sla_days_wd} | Adherence: ${s.sla_adherence_pct}`);
      if (s.total_claims === 0) {
        if (s.sla_rating !== null) throw new Error(`Surveyor ${s.name} has 0 claims but sla_rating is ${s.sla_rating}`);
        if (s.avg_sla_days_wd !== null) throw new Error(`Surveyor ${s.name} has 0 claims but avg_sla_days_wd is ${s.avg_sla_days_wd}`);
        if (s.sla_adherence_pct !== null) throw new Error(`Surveyor ${s.name} has 0 claims but sla_adherence_pct is ${s.sla_adherence_pct}`);
      }
    });

    // 2. Fetch single surveyor detail
    if (res.data.length > 0) {
      const singleRes = await new Promise((resolve, reject) => {
        http.get({ hostname: 'localhost', port, path: `/api/surveyors/${res.data[0].id}` }, (r) => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(d) }));
        }).on('error', reject);
      });
      const s = singleRes.data;
      console.log(`\nSingle Surveyor Detail (#${s.id} ${s.name}):`);
      console.log(`- total_claims: ${s.total_claims}`);
      console.log(`- sla_rating: ${s.sla_rating}`);
      console.log(`- avg_show_up_wd: ${s.avg_show_up_wd}`);
      console.log(`- show_up_adherence_pct: ${s.show_up_adherence_pct}`);
      console.log(`- avg_sla_days_wd: ${s.avg_sla_days_wd}`);

      if (s.total_claims === 0) {
        if (s.sla_rating !== null) throw new Error(`Surveyor detail has 0 claims but sla_rating is ${s.sla_rating}`);
        if (s.avg_show_up_wd !== null) throw new Error(`Surveyor detail has 0 claims but avg_show_up_wd is ${s.avg_show_up_wd}`);
      }
    }

    console.log('\n[PASS] All Surveyor SLA checks passed: 0 claims correctly produce null / empty SLAs without phantom numbers.');
  } finally {
    await stopServer();
  }
}

verifySurveyors().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
