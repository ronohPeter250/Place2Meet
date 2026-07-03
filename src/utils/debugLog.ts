import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// Remote (Firestore) logging is OFF in production. It ships to Firestore ONLY in
// a dev build, or when explicitly opted in via EXPO_PUBLIC_DEBUG_LOGS=1 (e.g. to
// debug a release build). This prevents hundreds of Firestore writes per session
// (the map alone fires ~28× incl. on every pan/render) and avoids logging UIDs /
// data to a collection in production.
const REMOTE_LOGS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_DEBUG_LOGS === '1';

// Fire-and-forget logger. Always mirrors to the console; ships to the Firestore
// `debug_logs` collection only when REMOTE_LOGS_ENABLED. Failures are swallowed —
// diagnostic instrumentation must never crash the user's session.
export function debugLog(scope: string, message: string, payload?: unknown): void {
  // Mirror to console for adb-level access too
  try { console.log(`[${scope}]`, message, payload ?? ''); } catch {}

  if (!REMOTE_LOGS_ENABLED) return;

  try {
    void addDoc(collection(db, 'debug_logs'), {
      scope,
      message,
      payload: safeSerialize(payload),
      uid: auth.currentUser?.uid ?? null,
      timestamp: serverTimestamp(),
    }).catch(() => { /* swallow — diagnostics should never break flow */ });
  } catch {
    // collection() can throw if Firebase isn't initialised — ignore.
  }
}

// Firestore can't store undefined, functions, or circular refs. Coerce to a
// JSON-safe shape; fall back to a string on failure.
function safeSerialize(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    try { return String(v); } catch { return '[unserializable]'; }
  }
}
