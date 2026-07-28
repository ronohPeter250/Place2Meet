import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Location from 'expo-location';
import { debugLog } from '../../src/utils/debugLog';
let MapView: any;
let Marker: any;
let MapCircle: any;
let PROVIDER_GOOGLE: any;
try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  MapCircle = maps.Circle;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  debugLog('MAP', 'rn-maps module loaded', { hasMapView: !!MapView, hasMarker: !!Marker, hasCircle: !!MapCircle, provider: PROVIDER_GOOGLE });
} catch (e) {
  MapView = null;
  Marker = null;
  MapCircle = null;
  PROVIDER_GOOGLE = undefined;
  debugLog('MAP', 'rn-maps require FAILED', { error: String(e) });
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilterModal, FilterValues } from '../../src/components/ui/FilterModal';
import { VenuePopup } from '../../src/components/ui/VenuePopup';
import { useLocation } from '../../src/hooks/useLocation';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllMapVenues, Venue } from '../../src/services/venues';
import { checkInToVenue, subscribeAllActiveCheckinCounts } from '../../src/services/checkin';
import { acquireFix } from '../../src/services/location';
import { updateUserLocation, getUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { LocationPinIcon, FilterIcon } from '../../src/components/ui/SvgIcons';
import { darkMapStyle } from '../../src/constants/mapStyle';
import { colors } from '../../src/theme';
import Constants from 'expo-constants';

const DEFAULT_FILTERS: FilterValues = { genders: [], ageRange: [18, 25], relationshipTypes: [] };

// Radar sweep: rings expand from the user outward and fade as they go. Metres, so the
// sweep keeps a real-world size and scales correctly with the map's zoom.
const RADAR_RINGS = 3;
const RADAR_MIN_M = 40;
const RADAR_MAX_M = 280;
// Frames per full sweep, and the tick between them. `phase` must advance through MANY
// more frames than there are rings: with frames == rings the per-ring offsets are just
// a rotation of the same fixed set, so every tick renders a pixel-identical frame and
// the "animation" is four motionless circles. Radius/alpha are pure functions of t, so
// only a t that genuinely changes over time produces movement.
const RADAR_FRAMES = 16;
const RADAR_TICK_MS = 200;

// The animation lives in its OWN memoised component, and the tick state with it.
// If the phase were MapScreen state, every tick would re-render the entire map —
// re-running the render-time debugLog, which in a diagnostics build is a Firestore
// WRITE. At ~1.1 Hz that is a continuous write stream for as long as the map is open.
// Isolating it here means a tick re-renders only these four circles.
// The interval is started and stopped by useFocusEffect, so it does not keep running
// (or drawing) once the user moves to another tab.
const RadarRings = React.memo(function RadarRings({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [phase, setPhase] = useState(0);
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setPhase(p => (p + 1) % RADAR_FRAMES), RADAR_TICK_MS);
      return () => clearInterval(id);
    }, []),
  );
  if (!MapCircle) return null;
  return (
    <>
      {Array.from({ length: RADAR_RINGS }).map((_, i) => {
        // Position in the sweep for THIS ring: the frame counter advances t on every
        // tick (so each ring genuinely grows and fades), while the per-ring offset
        // spaces the rings out so they trail one another. t wraps to 0, which snaps the
        // ring back to the centre to start the next sweep.
        const t = ((phase / RADAR_FRAMES) + i / RADAR_RINGS) % 1;
        return (
          <MapCircle
            key={`radar_${i}`}
            center={{ latitude, longitude }}
            radius={RADAR_MIN_M + t * (RADAR_MAX_M - RADAR_MIN_M)}
            strokeWidth={2}
            strokeColor={`rgba(255,107,53,${(0.5 * (1 - t)).toFixed(3)})`}
            fillColor={`rgba(255,107,53,${(0.08 * (1 - t)).toFixed(3)})`}
            zIndex={1}
          />
        );
      })}
    </>
  );
});
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

// Haversine metres — used to throttle how often the live GPS is PERSISTED to
// Firestore (the visual marker still follows every update).
function distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
const PERSIST_MIN_METERS = 75;
const PERSIST_MIN_MS = 45000;

export default function MapScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { latitude, longitude, loading: locationLoading, error: locationError, granted } = useLocation();

  // `initialRegion` is applied ONCE, at mount. When the first fix fails/times out the
  // map mounts on useLocation's seeded default, so a real position arriving later would
  // otherwise leave the camera parked on a city the user isn't in, with their marker
  // (once un-suppressed) off-screen. Recenter explicitly the first time a real fix lands.
  const mapRef = useRef<any>(null);
  const recenteredRef = useRef(false);

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showVenuePopup, setShowVenuePopup] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  // The profile-derived defaults are applied at most once per mount; after that the
  // user's own filter choices win, including deliberately clearing everything.
  const filtersSeededRef = useRef(false);

  const [loadingVenues, setLoadingVenues] = useState(true);
  const [checkinCounts, setCheckinCounts] = useState<Map<string, number>>(new Map());
  const [myPhoto, setMyPhoto] = useState<string | undefined>(undefined);
  const [venuePng, setVenuePng] = useState<Map<string, string>>(new Map());
  const [userPng, setUserPng] = useState<string | undefined>(undefined);
  // Bumped on every tab focus and woven into the marker keys, so returning to the
  // Map tab REMOUNTS the native markers. react-native-screens detaches the MapView
  // on blur (dropping marker rasterisation) and tracksViewChanges={false} means the
  // markers won't repaint on their own — remounting forces the PNG icons to paint
  // again, fixing the "venue photos + my location marker vanish after leaving and
  // coming back" bug.
  const [focusEpoch, setFocusEpoch] = useState(0);
  // Dimension nudge: toggling the map height by 1px forces a native re-layout
  // that re-rasterises markers, WITHOUT reloading tiles (unlike a full remount).
  const [nudge, setNudge] = useState(0);
  const mounted = useRef(true);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngNudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the Map tab is currently focused — location is only PERSISTED while
  // focused, so a backgrounded tab doesn't keep writing. And the last-persisted
  // point, to throttle writes by distance/time (the visual marker still updates
  // live regardless of these — this only bounds Firestore write volume).
  const focusedRef = useRef(true);
  const lastPersist = useRef<{ lat: number; lng: number; t: number } | null>(null);

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

  // On every focus (returning to the Map tab), remount markers (focusEpoch feeds
  // their keys) and nudge the map so the pre-rendered marker PNGs re-rasterise.
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setFocusEpoch(e => e + 1);
      doNudge('focus');
      return () => { focusedRef.current = false; };
    }, [doNudge]),
  );

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

  // Subscribe to LIVE check-in PRESENCE counts (how many people are AT each venue
  // right now). Fires immediately and again on every check-in/-out, so the marker
  // badge moves the moment someone taps "אני במקום". Previously the marker was wired
  // to event REGISTRATIONS, so marking presence never changed the number.
  useEffect(() => {
    if (!user) return;
    debugLog('MAP', 'subscribe venue presence counts');
    const unsub = subscribeAllActiveCheckinCounts((counts) => {
      debugLog('MAP', 'venue presence update', { entries: counts.size });
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
        if (cancelled) return;
        setMyPhoto(profile?.photos?.[0]);
        // Seed the map filter from the user's own profile rather than a hardcoded
        // default: who they are looking for, and what kind of relationship, is already
        // stated in onboarding. Applied ONCE (filtersSeeded) so it can never overwrite
        // a selection the user has since made by hand.
        setFilters(prev => {
          if (filtersSeededRef.current) return prev;
          filtersSeededRef.current = true;
          const genders = (profile?.datingPreference ?? []) as FilterValues['genders'];
          const relationshipTypes = (profile?.relationshipType ?? []) as FilterValues['relationshipTypes'];
          if (!genders.length && !relationshipTypes.length) return prev;
          return { ...prev, genders, relationshipTypes };
        });
        debugLog('MAP', 'profile loaded', {
          hasPhoto: !!profile?.photos?.[0],
          seededGenders: profile?.datingPreference ?? null,
          seededTypes: profile?.relationshipType ?? null,
        });
      } catch (err) { debugLog('MAP', 'profile fetch FAILED', { error: String(err) }); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    // Only persist a REAL fix: require permission granted AND no fetch error —
    // otherwise a granted-but-GPS-failed session would still write useLocation's
    // default Tel Aviv coordinate as the user's location.
    if (!(user && granted && !locationError && latitude != null && longitude != null && !locationLoading)) return;
    // Only persist while the Map tab is focused (no background write stream), and
    // throttle by distance/time so the live watch (which delivers every ~10m) does
    // NOT amplify into ~2 Firestore writes per 10m travelled. The visual marker
    // still follows every update — this bounds writes, not the display.
    // `focusEpoch` is a dependency (not just the ref) so that RETURNING to the tab
    // re-runs this and persists the position we reached while blurred. Without it a
    // fix that arrived off-tab was dropped permanently: refocus changes only a ref,
    // so nothing re-triggered the effect and the stale coordinate stuck for the rest
    // of the session unless the user happened to move again while focused.
    if (!focusedRef.current) return;
    const last = lastPersist.current;
    const now = Date.now();
    if (last && distMeters(last.lat, last.lng, latitude, longitude) < PERSIST_MIN_METERS && (now - last.t) < PERSIST_MIN_MS) return;
    const attempt = { lat: latitude, lng: longitude, t: now };
    lastPersist.current = attempt;
    updateUserLocation(user.uid, latitude, longitude)
      .catch((err) => {
        // Only revert if no newer persist has since superseded us — otherwise a
        // slow-failing write would discard a newer successful checkpoint.
        if (lastPersist.current === attempt) lastPersist.current = last;
        debugLog('MAP', 'location update failed', { error: String(err) });
      });
  }, [user, granted, locationError, latitude, longitude, locationLoading, focusEpoch]);

  // First REAL fix after the map already mounted on the seeded default: move the camera
  // to it once. Guarded by a ref so this never fights the user's own panning afterwards.
  useEffect(() => {
    if (recenteredRef.current) return;
    if (locationError || locationLoading || !granted) return;
    if (latitude == null || longitude == null) return;
    recenteredRef.current = true;
    mapRef.current?.animateToRegion?.(
      { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      500,
    );
  }, [latitude, longitude, locationError, locationLoading, granted]);

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
      // Presence must come from a real device position — NOT this screen's own
      // coordinates, which useLocation seeds with a Tel Aviv default before the first
      // real fix and which would let someone check in near a TLV venue prematurely.
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        debugLog('MAP', 'FAIL check-in: permission not granted', { venueId });
        Alert.alert('נדרש מיקום', 'כדי לסמן נוכחות יש לאפשר גישה למיקום ולהיות פיזית במקום.');
        return;
      }
      // acquireFix rather than a bare getCurrentPositionAsync. The one-shot call made
      // check-in fail on devices that were drawing their own marker on this very screen,
      // because that marker is fed by a LIVE watch subscription while the one-shot asks
      // for a cold fix that often never settles — see src/services/location.ts. It
      // returns only a genuinely current position (never a cached one), and its timeout
      // keeps a hung GPS from stranding the in-flight guard.
      const fix = await acquireFix('MAP');
      if (!fix.coords) {
        Alert.alert('בעיה במיקום', 'לא הצלחנו לקבל את המיקום שלך. ודא שהמיקום פעיל ונסה שוב מהמקום.');
        return;
      }
      debugLog('MAP', 'check-in fix', { venueId, source: fix.source, ageMs: fix.ageMs, accuracy: fix.accuracy });
      await checkInToVenue(venueId, { lat: fix.coords.latitude, lng: fix.coords.longitude });
      Alert.alert('נרשמת בהצלחה!', 'אתה רשום כנוכח במקום.');
      setShowVenuePopup(false);
    } catch (e) {
      const reason = (e as { reason?: string })?.reason;
      if (reason === 'TOO_FAR') {
        Alert.alert('רחוק מדי מהמקום', 'אפשר לסמן נוכחות רק כאשר אתה נמצא פיזית במקום.');
      } else if (reason === 'LOCATION_REQUIRED' || reason === 'VENUE_NO_LOCATION') {
        Alert.alert('בעיה במיקום', 'לא הצלחנו לאמת את המיקום שלך. ודא שהמיקום פעיל ונסה שוב מהמקום.');
      } else {
        Alert.alert('שגיאה', 'לא ניתן להירשם כרגע. נסה שוב.');
      }
    } finally {
      checkInFlightRef.current = false;
    }
  }, []);
  const handleFilterApply = useCallback((f: FilterValues) => {
    // Claim the filter for the user. The seed guard alone was not enough: it only
    // prevented a SECOND seed, so a profile fetch that resolved after the user had
    // already applied filters still overwrote their choice (and, with the modal open,
    // reset the chips mid-edit).
    filtersSeededRef.current = true;
    setFilters(f);
    setShowFilter(false);
  }, []);
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
      {/* Permission granted but no usable fix (hung/failed GPS). The map still renders
          on the default region so venues are browsable, but the user must be told their
          own position is unknown — otherwise the default coordinate reads as "you are
          here". The blocking error screen above only covers the permission-denied case. */}
      {granted && !!locationError && (
        // Positioned below BOTH the notch/status bar and the filter button (which sits
        // at insets.top + 16, right-aligned) — a banner at a raw top offset is drawn
        // under the system bar on notched devices, i.e. the only signal that the
        // position is unknown would be invisible.
        <View style={[styles.locationBanner, { top: insets.top + 76 }]} pointerEvents="none">
          <Text style={styles.locationBannerText}>{locationError}</Text>
        </View>
      )}

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
        ref={mapRef}
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
            When the styled view-shot PNG is ready, use it (keyed by uri so a
            re-captured png remounts and the native icon actually swaps). Until
            then — or if the capture never succeeds — fall back to the NATIVE
            default pin (pinColor). We deliberately do NOT use a custom child-View
            marker here: this file documents that child-View / in-place icon
            markers are unreliable on New-Arch Android (the whole reason markers
            are pre-rendered to PNGs), so a View fallback could itself not paint.
            The native pin always renders. */}
        {/* Radar sweep under the user's own marker, so a stationary avatar still reads
            as "live". Suppressed together with the marker whenever the position is not
            a real fix, so it can never imply presence at the seeded default. */}
        {!locationError && <RadarRings latitude={latitude} longitude={longitude} />}

        {/* ...but ONLY when the coordinate is a real fix. With permission granted and
            the fix failed/timed out, latitude/longitude still hold useLocation's seeded
            Tel Aviv default — drawing the user there would place them ~90km from where
            they are, among real nearby-venue markers, with nothing indicating the fix
            failed. No marker (plus the banner above) is the honest rendering. */}
        {locationError ? null : userPng ? (
          <Marker
            key={`user_${userPng}_${focusEpoch}`}
            coordinate={{ latitude, longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={1000}
            image={{ uri: userPng }}
            tracksViewChanges={false}
          />
        ) : (
          <Marker
            key={`user_fallback_${focusEpoch}`}
            coordinate={{ latitude, longitude }}
            zIndex={1000}
            pinColor={colors.primary}
          />
        )}

        {venuesWithCoords.map((venue) => {
          const png = venuePng.get(venue.id);
          if (!png) { debugLog('MAP', 'venue marker SKIP (no png)', { id: venue.id }); return null; }
          return (
            <Marker
              key={`${venue.id}_${png}_${focusEpoch}`}
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
  locationBanner: { position: 'absolute', left: 12, right: 80, zIndex: 50, backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  locationBannerText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  filterButton: {
    position: 'absolute', right: 16, width: 48, height: 48, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  venueMarkerImg: { width: VENUE_W, height: VENUE_H },
  userMarkerImg: { width: USER_SIZE, height: USER_SIZE },
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
