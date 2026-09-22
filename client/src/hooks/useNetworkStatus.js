import { useState, useEffect } from 'react';
import { subscribeNetworkStatus, checkConnectivity } from '../services/networkStatus.js';

/**
 * React hook to observe network and server connectivity status
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState({
    isConnected: true,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isServerReachable: true,
    consecutiveFailures: 0,
  });
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const retry = async () => {
    setIsRetrying(true);
    try {
      const ok = await checkConnectivity();
      return ok;
    } finally {
      setIsRetrying(false);
    }
  };

  return {
    ...status,
    isRetrying,
    retry,
  };
}
