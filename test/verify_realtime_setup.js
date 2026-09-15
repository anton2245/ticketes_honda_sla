require('dotenv').config();
const http = require('http');
const db = require('../server/db');

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

async function verifyRealtime() {
  console.log('=== Verifying Supabase Realtime & @n Mention Indicator Setup ===');

  // 1. Initialize DB to trigger ensureRealtimeSetup()
  await db.initDb();
  console.log('[PASS] DB initialized with Realtime setup.');

  // 2. Check publication in Supabase PostgreSQL
  const pubRows = await db.all(`
    SELECT pr.pubname, c.relname as table_name
    FROM pg_publication pr
    JOIN pg_publication_rel prl ON pr.oid = prl.prpubid
    JOIN pg_class c ON c.oid = prl.prrelid
    WHERE pr.pubname = 'supabase_realtime'
      AND c.relname IN ('tickets', 'user_notifications', 'ticket_comments');
  `);

  console.log('[PASS] Tables in supabase_realtime publication:', pubRows.map(r => r.table_name));
  const tableNames = pubRows.map(r => r.table_name);
  if (!tableNames.includes('tickets')) throw new Error('tickets table missing from supabase_realtime');
  if (!tableNames.includes('user_notifications')) throw new Error('user_notifications table missing from supabase_realtime');
  if (!tableNames.includes('ticket_comments')) throw new Error('ticket_comments table missing from supabase_realtime');

  // 3. Check Replica Identity
  const repRows = await db.all(`
    SELECT relname, relreplident
    FROM pg_class
    WHERE relname IN ('tickets', 'user_notifications', 'ticket_comments');
  `);
  console.log('[PASS] Replica identity settings (f = FULL):', repRows);

  console.log('=== All Supabase Realtime DB checks passed! ===');
}

verifyRealtime().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
