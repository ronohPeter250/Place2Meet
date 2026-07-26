import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';

// A one-shot GPS fix can hang indefinitely on Android. Awaits of it inside THIS hook
// are bounded by this, so a stuck fix degrades to "use the default region" instead of
// an infinite spinner. Matches the check-in timeout in app/(tabs)/map.tsx. (Callers
// outside this hook must bound their own calls — this constant does not reach them.)
export const GPS_FIX_TIMEOUT_MS = 12000;
const INITIAL_FIX_TIMEOUT_MS = GPS_FIX_TIMEOUT_MS;

interface LocationState {
  latitude: number;
  longitude: number;
  loading: boolean;
  error: string | null;
  granted: boolean;
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: 32.0853,
    longitude: 34.7818,
    loading: true,
    error: null,
    granted: false,
  });

  const refreshLocation = useCallback(async () => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), INITIAL_FIX_TIMEOUT_MS); }),
      ]);
      if (!location) {
        setState(prev => ({ ...prev, loading: false, error: 'לא ניתן לקבל מיקום' }));
        return;
      }
      setState(prev => ({
        ...prev,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        loading: false,
        error: null,
      }));
    } catch {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'לא ניתן לקבל מיקום',
      }));
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    // Whether a REAL coordinate has landed from either source. The watch and the
    // one-shot race independently, and the watch frequently wins in exactly the
    // conditions the one-shot timeout exists for — so the timeout must never report
    // failure over a position we actually have. Doing so would set `error` on good
    // state and silently disable location persistence in map.tsx for the session.
    let gotRealFix = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== 'granted') {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'נדרשת גישה למיקום',
          granted: false,
        }));
        return;
      }

      setState(prev => ({ ...prev, granted: true }));

      // FOLLOW the user live (Waze-style) so the marker moves with them instead of
      // freezing at the first fix. Updates on ~10m movement / 4s. This is started
      // independently of — not sequenced behind — the one-shot fix below, because a
      // getCurrentPositionAsync that never settles must not also cost us the watch.
      const watching = (async () => {
        try {
          const s = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 10 },
            (loc) => {
              if (cancelled) return;
              gotRealFix = true;
              setState(prev => ({
                ...prev,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                loading: false,
                error: null,
                granted: true,
              }));
            },
          );
          // If the component unmounted while awaiting the subscription, drop it now.
          if (cancelled) { s.remove(); return; }
          sub = s;
        } catch {
          // watch unavailable — the one-shot fix below still stands.
        }
      })();

      // Fast initial fix so the map centres immediately. BOUNDED: on Android
      // getCurrentPositionAsync can stay pending forever when location services are
      // on but no fix is obtainable (cold start indoors, no GNSS + no network fix).
      // Unbounded, that would pin `loading` true and strand the map on its spinner.
      try {
        const initial = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>(resolve => { initialTimer = setTimeout(() => resolve(null), INITIAL_FIX_TIMEOUT_MS); }),
        ]);
        if (cancelled) return;
        if (initial) {
          gotRealFix = true;
          setState(prev => ({
            ...prev,
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
            loading: false,
            error: null,
          }));
        } else if (!gotRealFix) {
          // Timed out with no position from either source. `error` MUST be set:
          // latitude/longitude still hold the seeded Tel Aviv default, and consumers
          // (app/(tabs)/map.tsx) gate "is this a REAL fix worth persisting" on
          // `!error`. Clearing `loading` alone would publish a coordinate the user has
          // never been to as their location of record.
          setState(prev => ({ ...prev, loading: false, error: 'לא ניתן לקבל מיקום' }));
        } else {
          // The live watch already delivered a real position — just drop the spinner.
          setState(prev => ({ ...prev, loading: false }));
        }
      } catch {
        // Same rule as the timeout branch: never report failure over a real fix the
        // watch has already supplied.
        if (!cancelled && !gotRealFix) {
          setState(prev => ({ ...prev, loading: false, error: 'לא ניתן לקבל מיקום' }));
        }
      }

      await watching;
    })();

    return () => {
      cancelled = true;
      if (initialTimer) clearTimeout(initialTimer);
      if (sub) sub.remove();
    };
  }, []);

  return { ...state, refreshLocation };
}
