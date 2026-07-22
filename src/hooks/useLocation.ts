import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';

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
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
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
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

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

      // Fast initial fix so the map centres immediately...
      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          loading: false,
          error: null,
        }));
      } catch {
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: 'לא ניתן לקבל מיקום' }));
        }
      }

      // ...then FOLLOW the user live (Waze-style) so the marker moves with them
      // instead of freezing at the first fix. Updates on ~10m movement / 4s.
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 10 },
          (loc) => {
            if (cancelled) return;
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
        if (cancelled && sub) { sub.remove(); sub = null; }
      } catch {
        // watch unavailable — the one-shot fix above still stands.
      }
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, []);

  return { ...state, refreshLocation };
}
