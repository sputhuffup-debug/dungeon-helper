/** Plain IndexedDB helpers shared by the asset store and the campaign index. */

export function requireIndexedDB(): IDBFactory {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) {
    throw new Error("IndexedDB is not available in this environment; persistence needs a browser or fake-indexeddb.");
  }
  return idb;
}

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openDb(name: string, store: string, options?: IDBObjectStoreParameters): Promise<IDBDatabase> {
  const idb = requireIndexedDB();
  const req = idb.open(name, 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, options);
  };
  return request(req);
}

export function deleteDb(name: string): Promise<void> {
  const idb = requireIndexedDB();
  return request(idb.deleteDatabase(name)).then(() => undefined);
}
