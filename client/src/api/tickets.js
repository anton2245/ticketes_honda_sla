import { request } from './client.js';

export async function fetchTickets(params = {}) {
  const query = new URLSearchParams();
  if (params.outletId) query.set('outletId', params.outletId);
  if (params.search) query.set('search', params.search);
  const qs = query.toString();
  return request(`/api/tickets${qs ? `?${qs}` : ''}`);
}

export async function fetchTicket(id) {
  return request(`/api/tickets/${id}`);
}

export async function createTicket(payload) {
  return request('/api/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTicket(id, payload) {
  return request(`/api/tickets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteTicket(id) {
  return request(`/api/tickets/${id}`, {
    method: 'DELETE',
  });
}

export async function advanceTicketStage(id, payload) {
  return request(`/api/tickets/${id}/advance`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function rollbackTicketStage(id, payload) {
  return request(`/api/tickets/${id}/rollback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchStageLogs(id) {
  return request(`/api/tickets/${id}/stage-logs`);
}

export async function fetchTicketComments(id) {
  return request(`/api/tickets/${id}/comments`);
}

export async function addTicketComment(id, comment) {
  return request(`/api/tickets/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content: comment, comment }),
  });
}

export async function fetchTicketParts(id) {
  return request(`/api/tickets/${id}/parts`);
}
