/* ==========================================================================
   Firebase Firestore implementation of the storage adapter contract.
   NOT loaded unless STORAGE_BACKEND = 'firestore' in config.js.

   Data layout:  users/{uid}/{collection}/{docId}
   Auth:         Anonymous sign-in by default (enable it in Firebase Console →
                 Authentication → Sign-in method). Swap for Google/Apple sign-in
                 to share data across devices.

   Suggested security rules:
     rules_version = '2';
     service cloud.firestore {
       match /databases/{db}/documents {
         match /users/{uid}/{document=**} {
           allow read, write: if request.auth != null && request.auth.uid == uid;
         }
       }
     }
   ========================================================================== */
const V = '10.12.2';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const {
  initializeFirestore, persistentLocalCache, doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, where, writeBatch,
} = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
const { getAuth, signInAnonymously, onAuthStateChanged } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);

// Firestore rejects `undefined` values — round-trip through JSON to strip them.
const sanitize = (o) => JSON.parse(JSON.stringify(o));

export class FirestoreAdapter {
  name = 'Firestore';

  constructor(config) {
    if (!config) throw new Error('FIREBASE_CONFIG missing in js/store/config.js');
    this.config = config;
  }

  async init() {
    const app = initializeApp(this.config);
    // Offline persistence so the app keeps working in the gym with no signal.
    this.db = initializeFirestore(app, { localCache: persistentLocalCache() });
    const auth = getAuth(app);
    const user = await new Promise((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        if (u) { unsub(); resolve(u); }
      }, reject);
      signInAnonymously(auth).catch(reject);
    });
    this.uid = user.uid;
  }

  _col(name) { return collection(this.db, 'users', this.uid, name); }

  async get(name, id) {
    const snap = await getDoc(doc(this._col(name), id));
    return snap.exists() ? snap.data() : undefined;
  }

  async getAll(name) {
    const snap = await getDocs(this._col(name));
    return snap.docs.map((d) => d.data());
  }

  async getByIndex(name, field, value) {
    const snap = await getDocs(query(this._col(name), where(field, '==', value)));
    return snap.docs.map((d) => d.data());
  }

  async put(name, data) {
    await setDoc(doc(this._col(name), String(data.id)), sanitize(data));
    return data;
  }

  async bulkPut(name, docs) {
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(this.db);
      docs.slice(i, i + 450).forEach((d) => batch.set(doc(this._col(name), String(d.id)), sanitize(d)));
      await batch.commit();
    }
  }

  async remove(name, id) {
    await deleteDoc(doc(this._col(name), String(id)));
  }

  async clear(name) {
    const snap = await getDocs(this._col(name));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(this.db);
      snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}
