// Ablage im Browser: die Blätter liegen in der IndexedDB des Geräts,
// die Einstellungen im lokalen Speicher. Nichts davon verlässt den
// Rechner – es gibt keinen Server, der mitschreibt.

const DB_NAME = 'arbeitsblatt';
const DB_VERSION = 1;
const STORE = 'sheets';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('kind', 'kind');
        store.createIndex('modifiedAt', 'modifiedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx(mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    try { result = run(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function allItems() {
  const items = await tx('readonly', (store) => store.getAll());
  return (items || []).sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

export async function itemsOfKind(kind) {
  return (await allItems()).filter((item) => item.kind === kind);
}

export async function getItem(id) {
  return await tx('readonly', (store) => store.get(id));
}

export async function saveItem(item) {
  const stored = { ...item, modifiedAt: new Date().toISOString() };
  await tx('readwrite', (store) => store.put(stored));
  return stored;
}

export async function deleteItem(id) {
  await tx('readwrite', (store) => store.delete(id));
}

export async function duplicateItem(item) {
  const copy = {
    ...structuredClone(item),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  copy.sheet.topic = `${item.sheet.topic} (Kopie)`;
  return await saveItem(copy);
}

// MARK: - Einstellungen

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privater Modus */ }
}

export function loadKey(provider) {
  try { return localStorage.getItem(`ai.key.${provider}`) || ''; } catch { return ''; }
}

export function saveKey(provider, key) {
  try {
    if (key) localStorage.setItem(`ai.key.${provider}`, key);
    else localStorage.removeItem(`ai.key.${provider}`);
  } catch { /* privater Modus */ }
}
