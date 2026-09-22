import { request } from './client.js';

/**
 * Fetch notifications for current user (or all if not logged in)
 * Returns { notifications: Array, unreadCount: Number }
 */
export async function fetchNotifications() {
  return request('/api/notifications');
}

/**
 * Mark a single notification as read
 */
export async function markNotificationRead(id) {
  return request(`/api/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead() {
  return request('/api/notifications/read-all', {
    method: 'POST',
  });
}

/**
 * Delete a single notification
 */
export async function deleteNotification(id) {
  return request(`/api/notifications/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Fetch candidate users for @mention autocomplete and assignment
 * Returns array of { id, username, display_name, role }
 */
export async function fetchMentionUsers() {
  return request('/api/users/mention-list');
}
