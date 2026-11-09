/* ==========================================================================
   STORAGE BACKEND SELECTION
   --------------------------------------------------------------------------
   'indexeddb'    — default. Local, offline, large capacity.
   'localstorage' — simple fallback (auto-used if IndexedDB is unavailable).
   'firestore'    — cloud sync. Fill in FIREBASE_CONFIG below and see
                    js/store/firestore-adapter.js + README for setup.
   No other file needs to change when switching backends.
   ========================================================================== */

export const STORAGE_BACKEND = 'indexeddb';

// Paste your Firebase web config here when switching to 'firestore':
export const FIREBASE_CONFIG = null;
/* Example:
export const FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'your-app.firebaseapp.com',
  projectId: 'your-app',
  storageBucket: 'your-app.appspot.com',
  messagingSenderId: '...',
  appId: '...',
};
*/
