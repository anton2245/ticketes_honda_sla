/**
 * networkStatus.js — Real-time Connection & Network Safeguard Manager
 * 
 * Protects users from working in isolated local state when internet or server connectivity is lost.
 * Integrates browser offline events, heartbeat checks, and API failure interceptors.
 */

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isServerReachable = true;
let consecutiveFailures = 0;
const subscribers = new Set();
let pingInterval = null;

function notifySubscribers() {
  const status = {
    isConnected: isOnline && isServerReachable,
    isOnline,
    isServerReachable,
    consecutiveFailures,
  };
  subscribers.forEach((fn) => {
    try {
      fn(status);
    } catch (err) {
      console.error('Network status listener error:', err);
    }
  });
}

/**
 * Ping backend health endpoint to verify end-to-end network & server reachability
 */
export async function checkConnectivity() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    isOnline = false;
    isServerReachable = false;
    notifySubscribers();
    return false;
  }

  isOnline = true;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch('/api/health?_t=' + Date.now(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const wasDisconnected = !isServerReachable || !isOnline;
      isServerReachable = true;
      consecutiveFailures = 0;
      notifySubscribers();
      return true;
    } else {
      isServerReachable = false;
      consecutiveFailures++;
      notifySubscribers();
      return false;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    isServerReachable = false;
    consecutiveFailures++;
    notifySubscribers();
    return false;
  }
}

/**
 * Called by API client when a fetch request throws network error (e.g. Failed to fetch)
 */
export function reportNetworkError() {
  consecutiveFailures++;
  if (consecutiveFailures >= 1) {
    isServerReachable = false;
    notifySubscribers();
    // Verify in background
    checkConnectivity();
  }
}

/**
 * Called by API client when a request succeeds
 */
export function reportNetworkSuccess() {
  if (!isServerReachable || consecutiveFailures > 0) {
    isServerReachable = true;
    isOnline = true;
    consecutiveFailures = 0;
    notifySubscribers();
  }
}

/**
 * Subscribe to network status changes
 * @param {Function} callback receives { isConnected, isOnline, isServerReachable, consecutiveFailures }
 * @returns {Function} unsubscribe cleanup
 */
export function subscribeNetworkStatus(callback) {
  subscribers.add(callback);
  // Send current state immediately
  callback({
    isConnected: isOnline && isServerReachable,
    isOnline,
    isServerReachable,
    consecutiveFailures,
  });

  return () => {
    subscribers.delete(callback);
  };
}

// Attach browser online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    checkConnectivity();
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    isServerReachable = false;
    consecutiveFailures++;
    notifySubscribers();
  });

  // Periodic heartbeat ping every 20 seconds
  pingInterval = setInterval(() => {
    checkConnectivity();
  }, 20000);
}
