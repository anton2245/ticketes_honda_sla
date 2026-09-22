import { request } from './client.js';

export async function login({ username, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  try {
    return await request('/api/auth/logout', {
      method: 'POST',
    });
  } catch {
    // If session was already invalid or network failed, ignore
    return null;
  }
}

export async function fetchMe() {
  return request('/api/auth/me');
}

export async function changePassword({ currentPassword, newPassword }) {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// Admin User Management
export async function fetchUsers() {
  return request('/api/users');
}

export async function fetchUserById(id) {
  return request(`/api/users/${id}`);
}

export async function createUser(userData) {
  return request('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export async function updateUser(id, userData) {
  return request(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData),
  });
}

export async function deleteUser(id) {
  return request(`/api/users/${id}`, {
    method: 'DELETE',
  });
}

export async function resetUserPassword(id, newPassword) {
  return request(`/api/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

export async function toggleUserActive(id, isActive) {
  return request(`/api/users/${id}/toggle-active`, {
    method: 'POST',
    body: JSON.stringify({ isActive }),
  });
}

export async function fetchUserPermissions(id) {
  return request(`/api/users/${id}/permissions`);
}

export async function updateUserPermissions(id, permissions) {
  return request(`/api/users/${id}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
}

export async function fetchMentionUsers() {
  return request('/api/users/mention-list');
}
