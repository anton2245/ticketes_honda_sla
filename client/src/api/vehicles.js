import { request } from './client.js';

export async function fetchVehicles(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  const qs = query.toString();
  return request(`/api/vehicles${qs ? `?${qs}` : ''}`);
}

export async function fetchVehicle(id) {
  return request(`/api/vehicles/${id}`);
}

export async function fetchVehicleModels(q = '') {
  return request(`/api/vehicle-models${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export async function createVehicle(payload) {
  return request('/api/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateVehicle(id, payload) {
  return request(`/api/vehicles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteVehicle(id) {
  return request(`/api/vehicles/${id}`, {
    method: 'DELETE',
  });
}

export async function lookupVehicleModels(q = '') {
  return request(`/api/lookup/vehicle-models?q=${encodeURIComponent(q)}`);
}

export async function lookupVehicleColors(q = '') {
  return request(`/api/lookup/vehicle-colors?q=${encodeURIComponent(q)}`);
}
