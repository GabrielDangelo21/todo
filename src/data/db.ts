import { defaultAreas, defaultPrefs } from '../domain/defaults';
import { LIST_STORES, type Changes, type Data, type Prefs, type StoreName } from '../domain/types';

export const DB_NAME = 'constancia';
const DB_VERSION = 1;
const ALL_STORES: StoreName[] = [...LIST_STORES, 'prefs'];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ALL_STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

export function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  return p ? p.then((db) => db.close()) : Promise.resolve();
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transação cancelada'));
  });
}

function getAll<T>(tx: IDBTransaction, store: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Loads everything; seeds default areas and preferences on first run. */
export async function loadAll(nowIso = new Date().toISOString()): Promise<Data> {
  const db = await openDb();
  const tx = db.transaction(ALL_STORES, 'readonly');
  const [areas, tasks, occurrences, sessions, reminders, prefsList] = await Promise.all([
    getAll<Data['areas'][number]>(tx, 'areas'),
    getAll<Data['tasks'][number]>(tx, 'tasks'),
    getAll<Data['occurrences'][number]>(tx, 'occurrences'),
    getAll<Data['sessions'][number]>(tx, 'sessions'),
    getAll<Data['reminders'][number]>(tx, 'reminders'),
    getAll<Prefs>(tx, 'prefs'),
  ]);
  await done(tx);

  let prefs = prefsList[0];
  if (!prefs) {
    prefs = defaultPrefs(nowIso);
    const seed: Changes = { put: { prefs } };
    if (areas.length === 0) {
      const seeded = defaultAreas(nowIso);
      seed.put!.areas = seeded;
      areas.push(...seeded);
    }
    await applyChanges(seed);
  }
  return { areas, tasks, occurrences, sessions, reminders, prefs };
}

export async function applyChanges(changes: Changes): Promise<void> {
  const touched = new Set<StoreName>();
  for (const k of Object.keys(changes.put ?? {})) touched.add(k as StoreName);
  for (const k of Object.keys(changes.del ?? {})) touched.add(k as StoreName);
  if (touched.size === 0) return;
  const db = await openDb();
  const tx = db.transaction([...touched], 'readwrite');
  for (const [store, ids] of Object.entries(changes.del ?? {})) {
    const os = tx.objectStore(store);
    for (const id of ids as string[]) os.delete(id);
  }
  for (const [store, value] of Object.entries(changes.put ?? {})) {
    const os = tx.objectStore(store);
    if (store === 'prefs') os.put(value);
    else for (const rec of value as { id: string }[]) os.put(rec);
  }
  await done(tx);
}

/** Full replacement in a single transaction, so a failed import leaves the old data intact. */
export async function replaceAll(data: Data): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ALL_STORES, 'readwrite');
  for (const store of ALL_STORES) tx.objectStore(store).clear();
  for (const store of LIST_STORES) {
    const os = tx.objectStore(store);
    for (const rec of data[store]) os.put(rec);
  }
  tx.objectStore('prefs').put(data.prefs);
  await done(tx);
}
