import { request } from './client.js';

export async function fetchOutlets() {
  return request('/api/outlets');
}
