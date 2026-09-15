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
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    }).on('error', reject);
  });
}

async function runEndpointTests() {
  console.log('=== Testing Server Realtime Endpoints ===');
  const srv = await startServer(3000);

  try {
    // 1. Check /api/config/supabase-client
    const configRes = await fetchHttp('/api/config/supabase-client');
    console.log('[PASS] /api/config/supabase-client:', configRes.status, configRes.data);
    if (!configRes.data.supabaseUrl) throw new Error('Missing supabaseUrl');
    if (!configRes.data.supabaseAnonKey) throw new Error('Missing supabaseAnonKey');

    // 2. Check /js/vendor/supabase.js
    const vendorRes = await fetchHttp('/js/vendor/supabase.js');
    console.log('[PASS] /js/vendor/supabase.js:', vendorRes.status, 'Content-Type:', vendorRes.headers['content-type'], 'Length:', vendorRes.data?.length);
    if (vendorRes.status !== 200) throw new Error(`Unexpected status ${vendorRes.status}`);

    console.log('=== All Server Realtime Endpoints verified successfully! ===');
  } finally {
    await stopServer();
  }
}

runEndpointTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
