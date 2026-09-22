import { reportNetworkError, reportNetworkSuccess } from '../services/networkStatus.js';

export async function request(url, options = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('honda_auth_token') : null;
  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  };

  let res;
  try {
    res = await fetch(url, config);
  } catch (netErr) {
    reportNetworkError();
    const err = new Error('Network error: Unable to communicate with Honda Service server. Check your internet connection.');
    err.isNetworkError = true;
    throw err;
  }

  if (!res.ok) {
    // 502, 503, 504 are server gateway/offline errors
    if ([502, 503, 504].includes(res.status)) {
      reportNetworkError();
    }

    let errorMsg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && (data.error || data.message)) {
        errorMsg = data.error || data.message;
      }
    } catch {
      // response wasn't json
    }
    const err = new Error(errorMsg);
    err.status = res.status;
    throw err;
  }

  reportNetworkSuccess();

  // If 204 No Content
  if (res.status === 204) return null;
  return res.json();
}
