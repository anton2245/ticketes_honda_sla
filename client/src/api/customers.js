import { request } from './client.js';

export async function fetchCustomers(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.branchId) query.set('branchId', params.branchId);
  const qs = query.toString();
  return request(`/api/customers${qs ? `?${qs}` : ''}`);
}

export async function fetchCustomer(id) {
  return request(`/api/customers/${id}`);
}

export async function createCustomer(payload) {
  return request('/api/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCustomer(id, payload) {
  return request(`/api/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCustomer(id) {
  return request(`/api/customers/${id}`, {
    method: 'DELETE',
  });
}

export async function addCustomerVehicle(customerId, payload) {
  return request(`/api/customers/${customerId}/vehicles`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function lookupCustomers(q = '') {
  return request(`/api/lookup/customers?q=${encodeURIComponent(q)}`);
}
