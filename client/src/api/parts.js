import { request } from './client.js';

export async function lookupParts(query = '') {
  return request(`/api/lookup/parts?q=${encodeURIComponent(query)}`);
}

export async function lookupPartLocators(code = '', name = '') {
  const q = new URLSearchParams();
  if (code) q.set('code', code);
  if (name) q.set('name', name);
  return request(`/api/lookup/part-locators?${q.toString()}`);
}

export async function lookupInsurers(query = '') {
  return request(`/api/lookup/insurers?q=${encodeURIComponent(query)}`);
}

export async function lookupSurveyors(query = '', insurerName = '') {
  const q = new URLSearchParams();
  if (query) q.set('q', query);
  if (insurerName) q.set('insurerName', insurerName);
  return request(`/api/lookup/surveyors?${q.toString()}`);
}

export async function fetchPartStockBatches(partNumber) {
  return request(`/api/stock/batches/${encodeURIComponent(partNumber)}`);
}
