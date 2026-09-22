/**
 * localDb.js — Local Database Cache (IndexedDB)
 * 
 * Provides persistent, zero-latency local caching for master & reference data:
 * - Master Stages
 * - Outlets
 * - Parts Catalog & Categories
 * - UI Settings / Preferences
 * 
 * NOTE: Per architecture design, Kanban tickets are intentionally NOT cached locally
 * to ensure 100% strict real-time accuracy and eliminate stale board states.
 */

const DB_NAME = 'honda_service_local_cache';
const DB_VERSION = 1;

let dbPromise = null;
const memoryFallback = new Map();

function openDatabase() {
  if (dbPromise) return dbPromise;

  if (typeof window === 'undefined' || !window.indexedDB) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('stages')) {
          db.createObjectStore('stages', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outlets')) {
          db.createObjectStore('outlets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('parts_cache')) {
          db.createObjectStore('parts_cache', { keyPath: 'sku' });
        }
        if (!db.objectStoreNames.contains('keyval')) {
          db.createObjectStore('keyval');
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error, using memory fallback:', event.target?.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB initialization failed, using memory fallback:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

// Generic Store Helpers
async function getAllFromStore(storeName) {
  const db = await openDatabase();
  if (!db) return memoryFallback.get(storeName) || [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve(memoryFallback.get(storeName) || []);
    } catch {
      resolve(memoryFallback.get(storeName) || []);
    }
  });
}

async function setAllInStore(storeName, items) {
  if (!Array.isArray(items)) return;
  memoryFallback.set(storeName, items);

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const item of items) {
        if (item) store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getKeyValue(key) {
  const db = await openDatabase();
  if (!db) return memoryFallback.get(`kv_${key}`);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('keyval', 'readonly');
      const store = tx.objectStore('keyval');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result !== undefined ? req.result : memoryFallback.get(`kv_${key}`));
      req.onerror = () => resolve(memoryFallback.get(`kv_${key}`));
    } catch {
      resolve(memoryFallback.get(`kv_${key}`));
    }
  });
}

async function setKeyValue(key, val) {
  memoryFallback.set(`kv_${key}`, val);
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      store.put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Master Stages
export async function getCachedStages() {
  return getAllFromStore('stages');
}

export async function saveCachedStages(stages) {
  return setAllInStore('stages', stages);
}

// Outlets
export async function getCachedOutlets() {
  return getAllFromStore('outlets');
}

export async function saveCachedOutlets(outlets) {
  return setAllInStore('outlets', outlets);
}

// Master Categories
export async function getCachedCategories() {
  return getKeyValue('master_categories');
}

export async function saveCachedCategories(cats) {
  return setKeyValue('master_categories', cats);
}

// Clear all cached local data
export async function clearLocalDbCache() {
  memoryFallback.clear();
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['stages', 'outlets', 'parts_cache', 'keyval'], 'readwrite');
      tx.objectStore('stages').clear();
      tx.objectStore('outlets').clear();
      tx.objectStore('parts_cache').clear();
      tx.objectStore('keyval').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
