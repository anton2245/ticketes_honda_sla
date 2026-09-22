import { request } from './client.js';

export async function fetchInsurers() {
  return request('/api/insurers');
}

export async function fetchInsurer(id) {
  return request(`/api/insurers/${id}`);
}

export async function createInsurer(payload) {
  return request('/api/insurers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInsurer(id, payload) {
  return request(`/api/insurers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteInsurer(id) {
  return request(`/api/insurers/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchSurveyors() {
  return request('/api/surveyors');
}

export async function fetchSurveyor(id) {
  return request(`/api/surveyors/${id}`);
}

export async function createSurveyor(payload) {
  return request('/api/surveyors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSurveyor(id, payload) {
  return request(`/api/surveyors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSurveyor(id) {
  return request(`/api/surveyors/${id}`, {
    method: 'DELETE',
  });
}
