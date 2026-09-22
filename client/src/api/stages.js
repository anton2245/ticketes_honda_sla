import { request } from './client.js';

export async function fetchStages() {
  return request('/api/stages');
}

export async function updateStageSlaLimits(stages) {
  return request('/api/settings/stages-sla', {
    method: 'PUT',
    body: JSON.stringify({ stages }),
  });
}
