/**
 * desktopNotification.js — Native OS Desktop Notifications for Honda Service Desk App
 */

/**
 * Prompt user for native desktop notification permissions
 */
export function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }
}

/**
 * Trigger an OS-level native desktop notification banner
 * @param {Object} params
 * @param {string} params.title - Main headline
 * @param {string} [params.body] - Subtitle / content snippet
 * @param {number|string} [params.ticketId] - Ticket ID
 * @param {string} [params.type] - Notification type
 * @param {Function} [params.onClick] - Click handler that brings window to front and opens ticket
 */
export function triggerDesktopNotification({ title, body, ticketId, type, onClick }) {
  // 1. Electron Desktop App native notification via IPC
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.showDesktopNotification === 'function') {
    try {
      window.electronAPI.showDesktopNotification({ title, body, ticketId, type });
      return true;
    } catch (e) {
      console.warn('Electron desktop notification dispatch error:', e);
    }
  }

  // 2. Standard Web Browser HTML5 Notification API
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  const show = () => {
    try {
      const n = new Notification(title, {
        body: body || 'Click to view ticket details in Honda Bodyshop App',
        icon: '/favicon.svg',
        silent: false,
      });

      if (onClick) {
        n.onclick = (e) => {
          e.preventDefault();
          try {
            window.focus();
          } catch (_) {}
          onClick();
          try {
            n.close();
          } catch (_) {}
        };
      }

      // Automatically close after 8 seconds if not interacted with
      setTimeout(() => {
        try { n.close(); } catch (_) {}
      }, 8000);

      return n;
    } catch (err) {
      console.warn('Desktop Notification error:', err);
      return null;
    }
  };

  if (Notification.permission === 'granted') {
    return show();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        show();
      }
    }).catch(() => {});
  }

  return null;
}
