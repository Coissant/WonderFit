/* IndexedDB implementation of the storage adapter contract (see schema.js). */
import { DB_NAME, DB_VERSION, SCHEMA } from './schema.js';

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const tx2p = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
});

export class IndexedDBAdapter {
  name = 'IndexedDB';

  async init() {
    if (!('indexedDB' in window)) throw new Error('IndexedDB not supported');
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, cfg] of Object.entries(SCHEMA)) {
          const os = db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: cfg.keyPath });
          for (const idx of cfg.indexes) {
            if (!os.indexNames.contains(idx)) os.createIndex(idx, idx, { unique: false });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    });
    this.db.onversionchange = () => { this.db.close(); location.reload(); };
  }

  _os(collection, mode = 'readonly') {
    return this.db.transaction(collection, mode).objectStore(collection);
  }

  get(collection, id) {
    return req2p(this._os(collection).get(id));
  }

  getAll(collection) {
    return req2p(this._os(collection).getAll());
  }

  async getByIndex(collection, field, value) {
    const os = this._os(collection);
    if (os.indexNames.contains(field)) return req2p(os.index(field).getAll(value));
    return (await req2p(os.getAll())).filter((d) => d[field] === value);
  }

  async put(collection, doc) {
    const tx = this.db.transaction(collection, 'readwrite');
    tx.objectStore(collection).put(doc);
    await tx2p(tx);
    return doc;
  }

  async bulkPut(collection, docs) {
    const tx = this.db.transaction(collection, 'readwrite');
    const os = tx.objectStore(collection);
    docs.forEach((d) => os.put(d));
    await tx2p(tx);
  }

  async remove(collection, id) {
    const tx = this.db.transaction(collection, 'readwrite');
    tx.objectStore(collection).delete(id);
    await tx2p(tx);
  }

  async clear(collection) {
    const tx = this.db.transaction(collection, 'readwrite');
    tx.objectStore(collection).clear();
    await tx2p(tx);
  }
}
