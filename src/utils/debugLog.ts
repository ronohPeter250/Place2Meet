import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// Fire-and-forget logger that ships debug events to a Firestore collection so
// we can analyse runtime behaviour without needing adb / logcat / device
// access. Each event becomes one document under `debug_logs/{auto-id}` with
// a timestamp, the firing scope (e.g. 'MAP'), the human-readable message, and
// any structured payload. Failures are swallowed — we never want diagnostic
// instrumentation to crash the user's session.
export function debugLog(scope: string, message: string, payload?: unknown): void {
  // Mirror to console for adb-level access too
  try { console.log(`[${scope}]`, message, payload ?? ''); } catch {}

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
