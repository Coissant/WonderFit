/* Structured localStorage implementation of the storage adapter contract.
   Each collection is one key: "fittrack:<collection>" -> { [id]: doc } */
const PREFIX = 'fittrack:';

export class LocalStorageAdapter {
  name = 'localStorage';

  async init() {
    localStorage.setItem(`${PREFIX}__probe`, '1');
    localStorage.removeItem(`${PREFIX}__probe`);
  }

  _read(collection) {
    try { return JSON.parse(localStorage.getItem(PREFIX + collection)) || {}; }
    catch { return {}; }
  }

  _write(collection, map) {
    localStorage.setItem(PREFIX + collection, JSON.stringify(map));
  }

  async get(collection, id) { return this._read(collection)[id]; }
  async getAll(collection) { return Object.values(this._read(collection)); }
  async getByIndex(collection, field, value) {
    return Object.values(this._read(collection)).filter((d) => d[field] === value);
  }
  async put(collection, doc) {
    const map = this._read(collection);
    map[doc.id] = JSON.parse(JSON.stringify(doc));
    this._write(collection, map);
    return doc;
  }
  async bulkPut(collection, docs) {
    const map = this._read(collection);
    docs.forEach((d) => { map[d.id] = d; });
    this._write(collection, map);
  }
  async remove(collection, id) {
    const map = this._read(collection);
    delete map[id];
    this._write(collection, map);
  }
  async clear(collection) { localStorage.removeItem(PREFIX + collection); }
}
