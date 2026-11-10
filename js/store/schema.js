/* ==========================================================================
   Collection schema shared by every storage adapter.
   Every document has a string `id`. `indexes` are equality-queryable fields.

   Adapter contract (all methods return Promises):
     init()
     get(collection, id)                 -> doc | undefined
     getAll(collection)                  -> doc[]
     getByIndex(collection, field, val)  -> doc[]   (equality match)
     put(collection, doc)                -> doc     (upsert by doc.id)
     bulkPut(collection, docs[])         -> void
     remove(collection, id)              -> void
     clear(collection)                   -> void
   ========================================================================== */

export const DB_NAME = 'fittrack-db';
export const DB_VERSION = 2;

export const SCHEMA = {
  settings:  { keyPath: 'id', indexes: [] },               // single doc: { id: 'user', ... }
  exercises: { keyPath: 'id', indexes: ['category'] },     // exercise library (built-in + custom)
  workouts:  { keyPath: 'id', indexes: ['date', 'startedAt'] }, // completed sessions
  foodLog:   { keyPath: 'id', indexes: ['date'] },         // nutrition entries
  staples:   { keyPath: 'id', indexes: [] },               // saved quick-add foods
  splits:    { keyPath: 'id', indexes: [] },               // training split definitions
  overrides: { keyPath: 'id', indexes: [] },               // per-date plan overrides (id = YYYY-MM-DD)
  water:     { keyPath: 'id', indexes: ['date'] },         // daily water intake (id = YYYY-MM-DD)
  meta:      { keyPath: 'id', indexes: [] },               // device-local state (active workout, flags)
};

/** Collections included in JSON export/import (meta is device-local only). */
export const BACKUP_COLLECTIONS = ['settings', 'exercises', 'workouts', 'foodLog', 'staples', 'splits', 'overrides', 'water'];
