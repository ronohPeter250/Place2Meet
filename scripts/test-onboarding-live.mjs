// LIVE end-to-end data-layer test: runs the REAL onboarding create + photo-upload
// sequences (user + business) against the Firestore + Auth + Storage emulators,
// using the Firebase CLIENT SDK and the exact payloads the app writes. This is the
// live verification that static rule tests + tsc do NOT give: it proves account
// creation and image upload actually succeed end-to-end at the data layer.
//
// Run: firebase emulators:exec --only firestore,auth,storage "node scripts/test-onboarding-live.mjs"
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, getDoc,
  writeBatch, serverTimestamp, GeoPoint,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes } from 'firebase/storage';

const PROJECT = 'place2meet-rules-test';
const app = initializeApp({ projectId: PROJECT, apiKey: 'fake-api-key', storageBucket: `${PROJECT}.appspot.com` });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const storage = getStorage(app);
connectStorageEmulator(storage, '127.0.0.1', 9199);

// Minimal valid 1x1 JPEG (mirrors a downscaled ImageManipulator output).
const JPEG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==';
const jpeg = Uint8Array.from(Buffer.from(JPEG_B64, 'base64'));

let pass = 0, fail = 0;
async function step(name, fn) {
  try { await fn(); console.log('  PASS   ', name); pass++; }
  catch (e) { console.log('  FAIL   ', name, '->', e?.code || e?.message || String(e)); fail++; }
}
const now = () => Date.now();

const HOURS = { sunday: { open: '09:00', close: '17:00', closed: false }, monday: { open: '09:00', close: '17:00', closed: false }, tuesday: { open: '09:00', close: '17:00', closed: false }, wednesday: { open: '09:00', close: '17:00', closed: false }, thursday: { open: '09:00', close: '17:00', closed: false }, friday: { open: '09:00', close: '14:00', closed: false }, saturday: { open: '00:00', close: '00:00', closed: true } };

console.log('\n[USER onboarding — create + upload]');
const userCred = await createUserWithEmailAndPassword(auth, `u${now()}@test.com`, 'password123');
const uid = userCred.user.uid;
await step('createUserProfile (first write, {name})', () => setDoc(doc(db, 'users', uid), { name: 'בדיקה', uid, profileComplete: false, createdAt: serverTimestamp(), lastActive: serverTimestamp() }, { merge: true }));
await step('update city', () => updateDoc(doc(db, 'users', uid), { city: 'תל אביב', lastActive: serverTimestamp() }));
await step('update gender', () => updateDoc(doc(db, 'users', uid), { gender: 'male', lastActive: serverTimestamp() }));
await step('update datingPreference', () => updateDoc(doc(db, 'users', uid), { datingPreference: ['female'], lastActive: serverTimestamp() }));
await step('update relationshipType', () => updateDoc(doc(db, 'users', uid), { relationshipType: ['serious'], lastActive: serverTimestamp() }));
await step('uploadUserPhoto #0 (storage)', () => uploadBytes(ref(storage, `users/${uid}/photos/photo_0_${now()}.jpg`), jpeg, { contentType: 'image/jpeg' }));
await step('uploadUserPhoto #1 (storage)', () => uploadBytes(ref(storage, `users/${uid}/photos/photo_1_${now()}.jpg`), jpeg, { contentType: 'image/jpeg' }));
await step('update photos', () => updateDoc(doc(db, 'users', uid), { photos: ['https://x/1', 'https://x/2'], lastActive: serverTimestamp() }));
await step('completeProfile (profileComplete=true + birthday)', () => updateDoc(doc(db, 'users', uid), { profileComplete: true, birthday: '2000-01-01', lastActive: serverTimestamp() }));
await signOut(auth);

console.log('\n[BUSINESS onboarding — create + upload]');
const bizCred = await createUserWithEmailAndPassword(auth, `b${now()}@test.com`, 'password123');
const bid = bizCred.user.uid;
await step('createBusinessProfile (contact-name: public + private PII)', async () => {
  const b = writeBatch(db);
  b.set(doc(db, 'businesses', bid), { uid: bid, profileComplete: false, createdAt: serverTimestamp(), lastActive: serverTimestamp() }, { merge: true });
  b.set(doc(db, 'businesses', bid, 'private', 'contact'), { contactName: 'בעל העסק' }, { merge: true });
  await b.commit();
});
await step('update businessName', () => { const b = writeBatch(db); b.update(doc(db, 'businesses', bid), { businessName: 'העסק שלי', lastActive: serverTimestamp() }); return b.commit(); });
await step('update email (routed to private PII)', () => { const b = writeBatch(db); b.update(doc(db, 'businesses', bid), { lastActive: serverTimestamp() }); b.set(doc(db, 'businesses', bid, 'private', 'contact'), { email: 'e@e.com' }, { merge: true }); return b.commit(); });
await step('update location + coordinates', () => { const b = writeBatch(db); b.update(doc(db, 'businesses', bid), { location: 'רחוב 1, תל אביב', coordinates: new GeoPoint(32.07, 34.78), lastActive: serverTimestamp() }); return b.commit(); });
await step('update about', () => { const b = writeBatch(db); b.update(doc(db, 'businesses', bid), { about: 'תיאור', lastActive: serverTimestamp() }); return b.commit(); });
await step('update hours', () => { const b = writeBatch(db); b.update(doc(db, 'businesses', bid), { hours: HOURS, lastActive: serverTimestamp() }); return b.commit(); });
await step('uploadBusinessPhoto (storage)', () => uploadBytes(ref(storage, `businesses/${bid}/photos/photo_0_${now()}.jpg`), jpeg, { contentType: 'image/jpeg' }));
await step('uploadBusinessLogo (storage)', () => uploadBytes(ref(storage, `businesses/${bid}/logo_${now()}.jpg`), jpeg, { contentType: 'image/jpeg' }));
await step('update photos + logo', () => { const b = writeBatch(db); b.update(doc(db, 'businesses', bid), { photos: ['https://x/1', 'https://x/2'], logo: 'https://x/logo', lastActive: serverTimestamp() }); return b.commit(); });
await step('completeBusinessProfile (profileComplete=true)', () => updateDoc(doc(db, 'businesses', bid), { profileComplete: true, lastActive: serverTimestamp() }));

console.log(`\nLIVE ONBOARDING RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
