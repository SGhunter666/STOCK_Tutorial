/**
 * IndexedDB persistence with a localStorage fallback so the game still boots in
 * restricted browser modes. Saves are plain JSON snapshots of simulation state.
 */
const DB_NAME = 'stock-market-academy';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const FALLBACK_PREFIX = 'sma.save.';

let dbPromise = null;

function hasIndexedDb() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function isOfflineMode() {
  try {
    return typeof window !== 'undefined' && Boolean(window.__SMA_OFFLINE__);
  } catch {
    return false;
  }
}

function openDb() {
  if (!hasIndexedDb()) return Promise.reject(new Error('indexeddb-unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb-open-failed'));
    request.onblocked = () => reject(new Error('indexeddb-blocked'));
  });
  return dbPromise;
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('indexeddb-write-failed'));
    tx.onabort = () => reject(tx.error || new Error('indexeddb-write-aborted'));
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('indexeddb-read-failed'));
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('indexeddb-delete-failed'));
  });
}

export async function saveSnapshot(key, snapshot) {
  const payload = JSON.parse(JSON.stringify(snapshot));
  if (isOfflineMode()) {
    if (hasLocalStorage()) {
      try {
        localStorage.setItem(FALLBACK_PREFIX + key, JSON.stringify(payload));
        return { ok: true, storage: 'localstorage' };
      } catch (err) {
        return { ok: false, error: err, storage: 'none' };
      }
    }
    return { ok: false, storage: 'none' };
  }
  try {
    await idbPut(key, payload);
    return { ok: true, storage: 'indexeddb' };
  } catch (err) {
    if (hasLocalStorage()) {
      try {
        localStorage.setItem(FALLBACK_PREFIX + key, JSON.stringify(payload));
        return { ok: true, storage: 'localstorage', degraded: true };
      } catch (inner) {
        return { ok: false, error: inner, storage: 'none' };
      }
    }
    return { ok: false, error: err, storage: 'none' };
  }
}

export async function loadSnapshot(key) {
  if (isOfflineMode()) {
    if (hasLocalStorage()) {
      try {
        const raw = localStorage.getItem(FALLBACK_PREFIX + key);
        if (raw) return { ok: true, data: JSON.parse(raw), storage: 'localstorage' };
      } catch {
        // ignore corrupt fallback
      }
    }
    return { ok: true, data: null, storage: 'none' };
  }
  try {
    const value = await idbGet(key);
    if (value) return { ok: true, data: value, storage: 'indexeddb' };
  } catch {
    // fall through to localStorage
  }
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(FALLBACK_PREFIX + key);
      if (raw) return { ok: true, data: JSON.parse(raw), storage: 'localstorage' };
    } catch {
      // ignore corrupt fallback
    }
  }
  return { ok: true, data: null, storage: 'none' };
}

export async function clearSnapshot(key) {
  if (!isOfflineMode()) {
    try {
      await idbDelete(key);
    } catch {
      // ignore
    }
  }
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(FALLBACK_PREFIX + key);
    } catch {
      // ignore
    }
  }
  return { ok: true };
}

export const SAVE_KEY = 'career-v1';
export const SANDBOX_KEY = 'sandbox-v1';
