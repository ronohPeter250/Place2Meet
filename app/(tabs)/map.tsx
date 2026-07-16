import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Location from 'expo-location';
import { debugLog } from '../../src/utils/debugLog';
let MapView: any;
let Marker: any;
let PROVIDER_GOOGLE: any;
try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  debugLog('MAP', 'rn-maps module loaded', { hasMapView: !!MapView, hasMarker: !!Marker, provider: PROVIDER_GOOGLE });
} catch (e) {
  MapView = null;
  Marker = null;
  PROVIDER_GOOGLE = undefined;
  debugLog('MAP', 'rn-maps require FAILED', { error: String(e) });
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterModal, FilterValues } from '../../src/components/ui/FilterModal';
import { VenuePopup } from '../../src/components/ui/VenuePopup';
import { useLocation } from '../../src/hooks/useLocation';
import { getAllMapVenues, Venue } from '../../src/services/venues';
import { checkInToVenue } from '../../src/services/checkin';
import { subscribeVenueRegistrationCounts } from '../../src/services/events';
import { updateUserLocation, getUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { LocationPinIcon, FilterIcon } from '../../src/components/ui/SvgIcons';
import { darkMapStyle } from '../../src/constants/mapStyle';
import { colors } from '../../src/theme';
import Constants from 'expo-constants';

const DEFAULT_FILTERS: FilterValues = { genders: [], ageRange: [18, 25], relationshipTypes: [] };
// Prefer the inlined env var (local builds); fall back to app.json `extra` so a
// cloud/EAS build — which has no gitignored .env — still gets the cloud Map ID.
const GOOGLE_MAP_ID =
  process.env.EXPO_PUBLIC_GOOGLE_MAP_ID ??
  (Constants.expoConfig?.extra?.googleMapId as string | undefined);

const VENUE_W = 40;
const VENUE_H = 66;
const USER_SIZE = 100;

// ── Off-screen snapshot factories ────────────────────────────────────────────
// react-native-maps custom-View markers are broken on New Arch + Android
// (issue #5877, our exact stack). We snapshot each composite to a LOCAL png and
// feed it back as a Marker child image. Heavy logging traces every step.

function VenueCapture({ venue, count, onCaptured }: {
  venue: Venue; count: number; onCaptured: (id: string, uri: string) => void;
}) {
  const ref = useRef<View>(null);
  const imgReady = useRef(!venue.logo);     // no-logo markers are ready at once
  const countRef = useRef(count);           // always the latest count
  countRef.current = count;
  const appliedSig = useRef<string | null>(null);   // count string of published png
  const capturing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const mounted = useRef(true);

  // Robust model: always snapshot the CURRENT count. Publish, then if the count
  // moved while we were capturing, capture again. The marker can never get
  // stuck on a stale value because the only stop condition is
  // appliedSig === current count.
  const run = useCallback(() => {
    if (!mounted.current || !imgReady.current || capturing.current) return;
    const sig = String(countRef.current);
    if (appliedSig.current === sig) return;            // already up to date
    capturing.current = true;
    debugLog('MAP', 'VenueCapture run', { id: venue.id, count: sig });
    (async () => {
      try {
        const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
        capturing.current = false;
        if (!mounted.current) return;
        appliedSig.current = sig;
        retries.current = 0;
        debugLog('MAP', 'VenueCapture SUCCESS', { id: venue.id, count: sig, uriTail: uri.slice(-16) });
        onCaptured(venue.id, uri);
        if (String(countRef.current) !== sig) scheduleRef.current(); // moved meanwhile
      } catch (err) {
        capturing.current = false;
        debugLog('MAP', 'VenueCapture FAILED', { id: venue.id, error: String(err) });
        if (mounted.current && retries.current < 5) { retries.current += 1; scheduleRef.current(); }
      }
    })();
  }, [venue.id, onCaptured]);

  const runRef = useRef(run); runRef.current = run;
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Exponential backoff on repeated failures (a cold layout race can fail the
    // first few captures within a tight window) — 150ms → 2s cap.
    timer.current = setTimeout(() => runRef.current(), Math.min(150 * 2 ** retries.current, 2000));
  }, []);
  const scheduleRef = useRef(schedule); scheduleRef.current = schedule;

  // Re-capture whenever count changes.
  useEffect(() => { schedule(); }, [count, schedule]);

  // Mount-only safety net: if the logo Image never fires onLoad/onError, render anyway.
  useEffect(() => {
    if (imgReady.current) return;
    const t = setTimeout(() => { if (!imgReady.current) { imgReady.current = true; scheduleRef.current(); } }, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => {
    mounted.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <View ref={ref} collapsable={false} style={styles.captureVenue}>
      <View style={styles.markerPill}>
        <View style={styles.markerLogo}>
          {venue.logo ? (
            <Image
              source={{ uri: venue.logo }}
              style={styles.markerLogoImage}
              fadeDuration={0}
              onLoad={() => { imgReady.current = true; schedule(); }}
              onError={() => { imgReady.current = true; schedule(); }}
            />
          ) : (
            <LocationPinIcon size={20} color={colors.primary} />
          )}
        </View>
        <Text style={styles.markerCount}>{count}</Text>
      </View>
      <View style={styles.markerPointer} />
    </View>
  );
}

function UserCapture({ photo, onCaptured }: { photo?: string; onCaptured: (uri: string) => void; }) {
  const ref = useRef<View>(null);
  const imgReady = useRef(!photo);
  const photoRef = useRef(photo);
  photoRef.current = photo;
  const appliedSig = useRef<string | null>(null);
  const capturing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const mounted = useRef(true);

  const run = useCallback(() => {
    if (!mounted.current || !imgReady.current || capturing.current) return;
    const sig = photoRef.current ?? 'none';
    if (appliedSig.current === sig) return;
    capturing.current = true;
    debugLog('MAP', 'UserCapture run');
    (async () => {
      try {
        const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
        capturing.current = false;
        if (!mounted.current) return;
        appliedSig.current = sig;
        retries.current = 0;
        debugLog('MAP', 'UserCapture SUCCESS', { uriTail: uri.slice(-16) });
        onCaptured(uri);
        if ((photoRef.current ?? 'none') !== sig) scheduleRef.current();
      } catch (err) {
        capturing.current = false;
        debugLog('MAP', 'UserCapture FAILED', { error: String(err) });
        if (mounted.current && retries.current < 5) { retries.current += 1; scheduleRef.current(); }
      }
    })();
  }, [onCaptured]);

  const runRef = useRef(run); runRef.current = run;
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Exponential backoff on repeated failures (a cold layout race can fail the
    // first few captures within a tight window) — 150ms → 2s cap.
    timer.current = setTimeout(() => runRef.current(), Math.min(150 * 2 ** retries.current, 2000));
  }, []);
  const scheduleRef = useRef(schedule); scheduleRef.current = schedule;

  useEffect(() => { schedule(); }, [photo, schedule]);

  useEffect(() => {
    if (imgReady.current) return;
    const t = setTimeout(() => { if (!imgReady.current) { imgReady.current = true; scheduleRef.current(); } }, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => {
    mounted.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <View ref={ref} collapsable={false} style={styles.captureUser}>
      <View style={styles.userGlow1} />
      <View style={styles.userGlow2} />
      <View style={styles.userGlow3} />
      <View style={styles.userAvatarRing}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={styles.userAvatar}
            fadeDuration={0}
            onLoad={() => { imgReady.current = true; schedule(); }}
            onError={() => { imgReady.current = true; schedule(); }}
          />
        ) : (
          <View style={[styles.userAvatar, styles.userAvatarFallback]} />
        )}
      </View>
    </View>
  );
}

export default function MapScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { latitude, longitude, loading: locationLoading, error: locationError, granted } = useLocation();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showVenuePopup, setShowVenuePopup] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [checkinCounts, setCheckinCounts] = useState<Map<string, number>>(new Map());
  const [myPhoto, setMyPhoto] = useState<string | undefined>(undefined);
  const [venuePng, setVenuePng] = useState<Map<string, string>>(new Map());
  const [userPng, setUserPng] = useState<string | undefined>(undefined);
  // Dimension nudge: toggling the map height by 1px forces a native re-layout
  // that re-rasterises markers, WITHOUT reloading tiles (unlike a full remount).
  const [nudge, setNudge] = useState(0);
  const mounted = useRef(true);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngNudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocWrite = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    debugLog('MAP', '=== MapScreen MOUNTED ===');
    return () => {
      mounted.current = false;
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      if (pngNudgeTimer.current) clearTimeout(pngNudgeTimer.current);
      debugLog('MAP', '=== MapScreen UNMOUNTED ===');
    };
  }, []);

  const doNudge = useCallback((why: string) => {
    debugLog('MAP', 'nudge start', { why });
    setNudge(1);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => {
      if (mounted.current) setNudge(0);
      debugLog('MAP', 'nudge end', { why });
    }, 120);
  }, []);

  const onVenueCaptured = useCallback((id: string, uri: string) => {
    debugLog('MAP', 'onVenueCaptured -> state', { id });
    setVenuePng(prev => {
      if (prev.get(id) === uri) return prev;
      const next = new Map(prev); next.set(id, uri); return next;
    });
  }, []);

  const onUserCaptured = useCallback((uri: string) => {
    debugLog('MAP', 'onUserCaptured -> state');
    setUserPng(uri);
  }, []);

  // Load the venue list once.
  useEffect(() => {
    let cancelled = false;
    debugLog('MAP', 'fetch venues start');
    (async () => {
      try {
        const data = await getAllMapVenues();
        if (!cancelled) {
          setVenues(data); setLoadingVenues(false);
          debugLog('MAP', 'venues loaded', { count: data.length, ids: data.map(v => v.id), withLogo: data.filter(v => !!v.logo).length });
        }
      } catch (err) {
        debugLog('MAP', 'venues fetch FAILED', { error: String(err) });
        if (!cancelled) setLoadingVenues(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to LIVE registration counts. Fires immediately and again on every
  // change, so the marker badge updates without a tab-switch (fixes the
  // "shows 0 until you leave and come back" bug). Gated on auth — the events
  // read requires a signed-in user, and we must re-subscribe across auth
  // changes and tear down on sign-out (consistent with the other effects).
  useEffect(() => {
    if (!user) return;
    debugLog('MAP', 'subscribe venue counts');
    const unsub = subscribeVenueRegistrationCounts((counts) => {
      debugLog('MAP', 'venue counts update', { entries: counts.size });
      setCheckinCounts(counts);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await getUserProfile(user.uid);
        if (!cancelled) { setMyPhoto(profile?.photos?.[0]); debugLog('MAP', 'profile loaded', { hasPhoto: !!profile?.photos?.[0] }); }
      } catch (err) { debugLog('MAP', 'profile fetch FAILED', { error: String(err) }); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    // Only persist a REAL fix: require permission granted AND no fetch error —
    // otherwise a granted-but-GPS-failed session would still write useLocation's
    // default Tel Aviv coordinate as the user's location.
    if (user && granted && !locationError && latitude != null && longitude != null && !locationLoading) {
      // Skip redundant writes (e.g. when `user` gets a new reference on a token
      // refresh but the coordinates are unchanged).
      const key = `${user.uid}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
      if (lastLocWrite.current === key) return;
      // Dedup immediately so a re-render mid-flight doesn't fire a duplicate write,
      // but clear the key on failure so a same-coordinate retry can still happen.
      lastLocWrite.current = key;
      updateUserLocation(user.uid, latitude, longitude)
        .catch((err) => {
          lastLocWrite.current = null;
          debugLog('MAP', 'location update failed', { error: String(err) });
        });
    }
  }, [user, granted, locationError, latitude, longitude, locationLoading]);

  // Whenever a new marker png arrives, nudge the map so it re-rasterises and
  // the freshly-added marker actually paints on first entry.
  useEffect(() => {
    if (!userPng && venuePng.size === 0) return;
    // Debounce: coalesce a burst of marker-png arrivals into ONE nudge instead of
    // nudging (and re-rendering) once per captured marker.
    if (pngNudgeTimer.current) clearTimeout(pngNudgeTimer.current);
    pngNudgeTimer.current = setTimeout(() => doNudge('png-arrived'), 200);
    return () => { if (pngNudgeTimer.current) clearTimeout(pngNudgeTimer.current); };
  }, [userPng, venuePng, doNudge]);

  const handleMarkerPress = useCallback((venue: Venue) => { setSelectedVenue(venue); setShowVenuePopup(true); }, []);
  const handleClosePopup = useCallback(() => { setShowVenuePopup(false); setSelectedVenue(null); }, []);
  const checkInFlightRef = useRef(false);
  const handleCheckIn = useCallback(async (venueId: string) => {
    // Guard against a double-tap: two overlapping check-ins would each mint a
    // separate presence entry (the checkin doc collapses, the entries don't),
    // over-counting the venue until they expire.
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    try {
      // Presence requires a FRESH GPS fix at check-in time — NOT the map's cached/
      // default coordinates (useLocation seeds Tel Aviv before the first real fix,
      // which would let someone check in near a TLV venue prematurely). You can
      // only mark presence when you are physically at the venue.
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('נדרש מיקום', 'כדי לסמן נוכחות יש לאפשר גישה למיקום ולהיות פיזית במקום.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await checkInToVenue(venueId, { lat: pos.coords.latitude, lng: pos.coords.longitude });
      Alert.alert('נרשמת בהצלחה!', 'אתה רשום כנוכח במקום.');
      setShowVenuePopup(false);
    } catch (e) {
      const reason = (e as { reason?: string })?.reason;
      if (reason === 'TOO_FAR') {
        Alert.alert('רחוק מדי מהמקום', 'אפשר לסמן נוכחות רק כאשר אתה נמצא פיזית במקום.');
      } else if (reason === 'LOCATION_REQUIRED' || reason === 'VENUE_NO_LOCATION') {
        Alert.alert('נדרש מיקום', 'לא הצלחנו לאמת את המיקום שלך. ודא שהמיקום פעיל ונסה שוב מהמקום.');
      } else {
        Alert.alert('שגיאה', 'לא ניתן להירשם כרגע. נסה שוב.');
      }
    } finally {
      checkInFlightRef.current = false;
    }
  }, []);
  const handleFilterApply = useCallback((f: FilterValues) => { setFilters(f); setShowFilter(false); }, []);
  const handleFilterClose = useCallback(() => setShowFilter(false), []);
  const handleFilterOpen = useCallback(() => setShowFilter(true), []);

  if (locationLoading || loadingVenues) {
    return (<View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>);
  }
  if (!granted && locationError) {
    return (<View style={styles.loadingContainer}><LocationPinIcon size={48} color={colors.textMuted} /><Text style={styles.errorText}>{locationError}</Text></View>);
  }
  if (!MapView) {
    return (<View style={[styles.container, styles.center]}><Text style={styles.errorText}>Maps requires a development build</Text></View>);
  }
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return (<View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>);
  }

  const venuesWithCoords = venues.filter(v => v.location?.latitude != null && v.location?.longitude != null);

  debugLog('MAP', 'MapScreen render', {
    venues: venuesWithCoords.length,
    venuePngReady: venuePng.size,
    userPngReady: !!userPng,
    nudge,
    googleMapIdSet: !!GOOGLE_MAP_ID,
  });

  return (
    <View style={styles.container}>
      <View style={styles.offscreen} pointerEvents="none">
        {/* Key by photo so the undefined->URL transition (async profile fetch
            resolves after first render) remounts with imgReady=false and waits
            for the real photo to paint before snapshotting (else a blank avatar
            is captured and frozen). */}
        <UserCapture key={myPhoto ?? 'none'} photo={myPhoto} onCaptured={onUserCaptured} />
        {venuesWithCoords.map(v => (
          <VenueCapture key={v.id} venue={v} count={checkinCounts.get(v.id) ?? 0} onCaptured={onVenueCaptured} />
        ))}
      </View>

      <MapView
        provider={PROVIDER_GOOGLE}
        style={[styles.map, { marginBottom: nudge }]}
        initialRegion={{ latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        googleMapId={GOOGLE_MAP_ID || undefined}
        customMapStyle={GOOGLE_MAP_ID ? undefined : darkMapStyle}
        loadingEnabled
        loadingBackgroundColor={colors.background}
        onMapReady={() => debugLog('MAP', 'MapView onMapReady')}
        onMapLoaded={() => { debugLog('MAP', 'MapView onMapLoaded (tiles done)'); doNudge('mapLoaded'); }}
        onLayout={(e: any) => debugLog('MAP', 'MapView onLayout', e?.nativeEvent?.layout)}
        onRegionChangeComplete={() => debugLog('MAP', 'onRegionChangeComplete')}
      >
        {/* ALWAYS render the user marker so their location can never vanish.
            Use the captured PNG when ready (keyed by uri so a re-captured png
            remounts and the native icon actually swaps); until then fall back to
            a simple avatar dot rendered as a Marker child (tracksViewChanges so
            it paints). Previously this only rendered when userPng existed, so a
            failed/slow view-shot capture left the user with no marker at all. */}
        <Marker
          key={userPng ? `user_${userPng}` : 'user_fallback'}
          coordinate={{ latitude, longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={1000}
          {...(userPng
            ? { image: { uri: userPng }, tracksViewChanges: false }
            : { tracksViewChanges: true })}
        >
          {!userPng && (
            <View style={styles.userFallbackMarker}>
              <View style={styles.userFallbackDot} />
            </View>
          )}
        </Marker>

        {venuesWithCoords.map((venue) => {
          const png = venuePng.get(venue.id);
          if (!png) { debugLog('MAP', 'venue marker SKIP (no png)', { id: venue.id }); return null; }
          return (
            <Marker
              key={`${venue.id}_${png}`}
              coordinate={{ latitude: venue.location.latitude, longitude: venue.location.longitude }}
              onPress={() => handleMarkerPress(venue)}
              anchor={{ x: 0.5, y: 1 }}
              image={{ uri: png }}
              tracksViewChanges={false}
            />
          );
        })}
      </MapView>

      <LinearGradient colors={['rgba(0,0,0,0.85)', 'transparent']} style={styles.topFade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(108,54,0,0.8)']} locations={[0, 0.55, 1]} style={styles.bottomFade} pointerEvents="none" />

      <TouchableOpacity style={[styles.filterButton, { top: insets.top + 16 }]} onPress={handleFilterOpen}>
        <FilterIcon size={28} color={colors.text} />
      </TouchableOpacity>

      <FilterModal visible={showFilter} onClose={handleFilterClose} onApply={handleFilterApply} initialValues={filters} />
      <VenuePopup venue={selectedVenue} visible={showVenuePopup} onClose={handleClosePopup} onCheckIn={handleCheckIn} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  offscreen: { position: 'absolute', top: -9999, left: -9999, opacity: 1 },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0, height: '25%' },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },
  errorText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
  filterButton: {
    position: 'absolute', right: 16, width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  venueMarkerImg: { width: VENUE_W, height: VENUE_H },
  userMarkerImg: { width: USER_SIZE, height: USER_SIZE },
  // Fallback user-location marker shown until the styled view-shot png is ready
  // (or if it never captures) — guarantees the location dot is always visible.
  userFallbackMarker: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,188,121,0.28)' },
  userFallbackDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.white },
  captureVenue: { width: VENUE_W, height: VENUE_H, alignItems: 'center', backgroundColor: 'transparent' },
  captureUser: { width: USER_SIZE, height: USER_SIZE, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  markerPill: {
    width: 40, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.white,
    borderRadius: 24, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 4,
  },
  markerLogo: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  markerLogoImage: { width: 32, height: 32, borderRadius: 16 },
  markerCount: { fontFamily: 'Rubik_700Bold', fontSize: 12, lineHeight: 15, color: colors.primary, marginTop: 2 },
  markerPointer: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.white },
  userGlow1: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,188,121,0.10)' },
  userGlow2: { position: 'absolute', width: 75, height: 75, borderRadius: 38, backgroundColor: 'rgba(255,188,121,0.18)' },
  userGlow3: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,188,121,0.28)' },
  userAvatarRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.white, overflow: 'hidden' },
  userAvatar: { width: '100%', height: '100%' },
  userAvatarFallback: { backgroundColor: colors.primary },
});
