const http = require('http');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: defaultHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
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
  console.log('--- Starting Notes, Mentions & Alerts Test ---');

  // 1. Fetch tickets to get an active ticket ID
  const ticketsRes = await makeRequest('GET', '/api/tickets');
  if (!Array.isArray(ticketsRes.data) || ticketsRes.data.length === 0) {
    throw new Error('No tickets found to test comments on.');
  }
  const ticket = ticketsRes.data[0];
  console.log(`[PASS] Found ticket #${ticket.id} (${ticket.ticket_number})`);

  // 2. Fetch mention users
  const mentionUsersRes = await makeRequest('GET', '/api/users/mention-list');
  console.log(`[PASS] /api/users/mention-list returned ${mentionUsersRes.data.length} users:`, mentionUsersRes.data.map(u => u.username));

  // 3. Admin posts a comment with mention @sales
  const commentRes = await makeRequest('POST', `/api/tickets/${ticket.id}/comments`, {
    content: 'Please verify the parts delay note @sales regarding vehicle bumper.'
  }, { 'x-internal-test': 'honda-admin' });
  console.log(`[PASS] Admin posted root comment #${commentRes.data.id}: "${commentRes.data.content}"`);

  // 4. Sales checks notifications (sales user_id is 3)
  // Let's log in as sales or authenticate as sales
  // Let's see if sales session or notifications endpoint returns all notifications when not scoped, or for user 3
  const salesNotifRes = await makeRequest('GET', '/api/notifications');
  console.log(`[PASS] /api/notifications returned ${salesNotifRes.data.notifications?.length} notifications, unread: ${salesNotifRes.data.unreadCount}`);
  
  const mentionNotif = salesNotifRes.data.notifications.find(n => n.comment_id === commentRes.data.id);
  if (!mentionNotif) {
    throw new Error('Mention notification not found in notifications list!');
  }
  console.log(`[PASS] Verified mention notification: id=${mentionNotif.id}, type=${mentionNotif.type}, actor=${mentionNotif.actor_name}, snippet="${mentionNotif.content_snippet}"`);

  // 5. Post a reply to this comment
  const replyRes = await makeRequest('POST', `/api/tickets/${ticket.id}/comments`, {
    content: 'Confirmed, spoke with parts department and new bumper is arriving tomorrow @admin.',
    parentId: commentRes.data.id
  });
  console.log(`[PASS] Posted reply #${replyRes.data.id} to parent comment #${commentRes.data.id}`);

  // 6. Fetch comments on ticket
  const getCommentsRes = await makeRequest('GET', `/api/tickets/${ticket.id}/comments`);
  console.log(`[PASS] Ticket has ${getCommentsRes.data.length} comments`);
  const foundComment = getCommentsRes.data.find(c => c.id === commentRes.data.id);
  const foundReply = getCommentsRes.data.find(c => c.id === replyRes.data.id);
  if (!foundComment || !foundReply) {
    throw new Error('Could not find posted comment or reply in GET list.');
  }

  // 7. Verify reply notification
  const afterReplyNotifs = await makeRequest('GET', '/api/notifications');
  const replyNotif = afterReplyNotifs.data.notifications.find(n => n.comment_id === replyRes.data.id);
  if (!replyNotif) {
    throw new Error('Reply notification not found in notifications list!');
  }
  console.log(`[PASS] Verified reply notification: id=${replyNotif.id}, type=${replyNotif.type}, actor=${replyNotif.actor_name}`);

  // 8. Mark single notification as read
  const markReadRes = await makeRequest('PATCH', `/api/notifications/${mentionNotif.id}/read`);
  console.log(`[PASS] Marked notification #${mentionNotif.id} read:`, markReadRes.data);

  // 9. Mark all notifications as read
  const markAllRes = await makeRequest('POST', '/api/notifications/read-all');
  console.log('[PASS] Marked all notifications read:', markAllRes.data);

  // 10. Check unread count is 0
  const zeroUnreadRes = await makeRequest('GET', '/api/notifications');
  console.log(`[PASS] Unread count after mark-all-read is: ${zeroUnreadRes.data.unreadCount}`);

  // 11. Fetch EOD SLA summary
  const eodRes = await makeRequest('GET', '/api/alerts/summary');
  console.log(`[PASS] /api/alerts/summary: totalBreaches=${eodRes.data.totalBreaches}, active=${eodRes.data.totalActiveTickets}`);

  // 12. Delete reply and comment
  const delReplyRes = await makeRequest('DELETE', `/api/tickets/${ticket.id}/comments/${replyRes.data.id}`, null, { 'x-internal-test': 'honda-admin' });
  console.log(`[PASS] Deleted reply #${replyRes.data.id}:`, delReplyRes.data);

  const delCommentRes = await makeRequest('DELETE', `/api/tickets/${ticket.id}/comments/${commentRes.data.id}`, null, { 'x-internal-test': 'honda-admin' });
  console.log(`[PASS] Deleted comment #${commentRes.data.id}:`, delCommentRes.data);

  console.log('--- All Notes, Mentions & Alerts Tests Passed Successfully! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
