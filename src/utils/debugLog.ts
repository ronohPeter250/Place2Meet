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

// Firestore can't store undefined, functions, or circular refs, and a security
// rule cannot bound the size of an arbitrary map. Coerce to a JSON-safe, length-
// bounded STRING so the debug_logs rule can cap payload size and block a client
// from flooding the collection with ~1 MiB documents (denial-of-wallet).
const MAX_PAYLOAD_CHARS = 4000;
function safeSerialize(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  let s: string | undefined;
  try {
    s = typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    s = undefined;  // circular refs etc.
  }
  if (s === undefined) {
    // JSON.stringify returns undefined for functions/symbols; last-resort coerce.
    try { s = String(v); } catch { s = '[unserializable]'; }
  }
  return s.length > MAX_PAYLOAD_CHARS ? s.slice(0, MAX_PAYLOAD_CHARS) + '…[truncated]' : s;
}
