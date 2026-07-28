import * as Location from 'expo-location';
import { debugLog, debugError } from '../utils/debugLog';

// A one-shot GPS fix can stay pending indefinitely on Android, so every await of one is
// bounded by this.
export const GPS_FIX_TIMEOUT_MS = 12000;

/**
 * How recent a position must be to count as the user's CURRENT location.
 *
 * Android's location APIs may hand back a replay of an older fix — `watchPositionAsync`
 * commonly emits the provider's last value as its first callback. Those frames are
 * rejected here, so a position is only ever accepted if the device actually produced it
 * within this window. At 200m of geofence a 30s-old fix is at most ~40m of walking
 * drift, and anything older is discarded rather than used.
 */
const MAX_FIX_AGE_MS = 30_000;

export type FixSource = 'watch' | 'current' | 'none';

export interface Fix {
  coords: { latitude: number; longitude: number } | null;
  source: FixSource;
  ageMs: number | null;
  accuracy: number | null;
}

const NO_FIX: Fix = { coords: null, source: 'none', ageMs: null, accuracy: null };

function toFix(loc: Location.LocationObject, source: FixSource): Fix {
  return {
    coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
    source,
    ageMs: Math.max(0, Date.now() - loc.timestamp),
    accuracy: loc.coords.accuracy ?? null,
  };
}

/**
 * Obtain the user's CURRENT position for a location-gated feature.
 *
 * WHY THIS EXISTS. Check-in, "events near me" and the reserve gate each called
 * `getCurrentPositionAsync` alone, bounded by a timeout, and reported failure when it
 * did not settle. The map did not fail in the same conditions — and the reason is the
 * mechanism, not luck: useLocation runs a `watchPositionAsync` SUBSCRIPTION, which the
 * OS feeds as the GPS/network produces fixes, whereas `getCurrentPositionAsync` asks for
 * a single cold fix and routinely does not settle indoors. Hence a device drawing its
 * own marker on the map while every other location feature insisted it could not find
 * the user — reported from the field, then reproduced.
 *
 * So this acquires a position the way the map does: it opens the live subscription AND
 * issues the one-shot call in parallel, and takes whichever REAL fix arrives first.
 * Both sources are live device positions.
 *
 * It deliberately does NOT consult `getLastKnownPositionAsync`: a cached position is not
 * where the user is now, and these features gate on physical presence. Any frame older
 * than MAX_FIX_AGE_MS is discarded even when it comes from the live stream, so a stale
 * replay cannot stand in for a current fix — if nothing current arrives within the
 * timeout, this reports failure rather than approving on old data.
 *
 * @param scope  debugLog scope of the calling feature, so failures are attributable.
 */
export async function acquireFix(
  scope: string,
  timeoutMs: number = GPS_FIX_TIMEOUT_MS,
): Promise<Fix> {
  let sub: Location.LocationSubscription | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  try {
    return await new Promise<Fix>((resolve) => {
      const finish = (f: Fix) => {
        if (settled) return;
        settled = true;
        resolve(f);
      };

      // Neither source is guaranteed to produce anything, so the wait is bounded and
      // failure is explicit — a hung GPS must never strand the caller's in-flight guard.
      timer = setTimeout(() => {
        debugLog(scope, 'FAIL fix: no live position within timeout', { timeoutMs, maxAgeMs: MAX_FIX_AGE_MS });
        finish(NO_FIX);
      }, timeoutMs);

      // Reject a frame the device did not just produce. Returning (rather than
      // resolving) leaves the race open so a genuinely current fix can still win.
      const accept = (loc: Location.LocationObject, source: FixSource): void => {
        // Both sources usually deliver. Bail before logging once the race is decided, so
        // a "fix: live (…)" line always names the position that was actually USED — these
        // logs are the tool for diagnosing this feature, and one that reports a fix the
        // caller never received is worse than no line at all.
        if (settled) return;
        const ageMs = Date.now() - loc.timestamp;
        if (ageMs > MAX_FIX_AGE_MS) {
          debugLog(scope, `fix: discarding stale ${source} frame`, { ageMs, maxAgeMs: MAX_FIX_AGE_MS });
          return;
        }
        debugLog(scope, `fix: live (${source})`, { ageMs, accuracy: loc.coords.accuracy ?? null });
        finish(toFix(loc, source));
      };

      // The live stream — the mechanism that keeps the map working. distanceInterval 0
      // so a stationary user still receives updates; without it a device that is not
      // moving may never emit a second frame.
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
        loc => accept(loc, 'watch'),
      ).then(s => {
        // The race can finish before the subscription resolves; drop it immediately in
        // that case, since the `finally` below has already run and will not see it.
        if (settled) { s.remove(); return; }
        sub = s;
      }).catch(e => debugError(scope, 'watchPositionAsync', e));

      // The one-shot call, in parallel. It wins outright when a fix is readily
      // available, which keeps the common case as fast as it was.
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(loc => accept(loc, 'current'))
        .catch(e => debugError(scope, 'getCurrentPositionAsync', e, { timeoutMs }));
    });
  } finally {
    if (timer !== null) clearTimeout(timer);
    if (sub) (sub as Location.LocationSubscription).remove();
  }
}
