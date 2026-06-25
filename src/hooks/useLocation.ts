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

      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          loading: false,
          error: null,
        }));
      } catch {
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'לא ניתן לקבל מיקום',
        }));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { ...state, refreshLocation };
}
