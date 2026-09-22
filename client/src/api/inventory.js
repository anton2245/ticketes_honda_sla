import { request } from './client.js';

export async function fetchInventoryParts(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.limit) query.set('limit', params.limit);
  if (params.offset !== undefined) query.set('offset', params.offset);
  if (params.inStock) query.set('inStock', 'true');
  if (params.category && params.category !== 'ALL') query.set('category', params.category);
  const qs = query.toString();
  return request(`/api/parts${qs ? `?${qs}` : ''}`);
}

export async function fetchInventoryPart(id) {
  return request(`/api/parts/${id}`);
}

export async function createInventoryPart(payload) {
  return request('/api/parts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInventoryPart(id, payload) {
  return request(`/api/parts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryPart(id) {
  return request(`/api/parts/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchPartsOrders(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();
  return request(`/api/parts-orders${qs ? `?${qs}` : ''}`);
}

export async function updatePartsOrderStatus(id, status) {
  return request(`/api/parts-orders/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export async function bulkPartsOrdersAction(action, orderIds) {
  return request('/api/parts-orders/bulk-action', {
    method: 'POST',
    body: JSON.stringify({ action, orderIds }),
  });
}

export async function uploadStockXlsx(binaryData, filename = 'stock.xlsx') {
  const res = await fetch(`/api/stock/upload-xlsx?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: binaryData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchStockSummary() {
  return request('/api/stock/summary');
}

export async function fetchMasterCategories() {
  return request('/api/master/categories');
}

export async function importMasterCsv(csvData) {
  const res = await fetch('/api/master/import-csv', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: csvData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Import failed: ${res.statusText}`);
  }
  return res.json();
}
