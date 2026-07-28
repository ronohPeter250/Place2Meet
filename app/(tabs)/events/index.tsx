import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { EventCard } from '../../../src/components/ui/EventCard';
import { Button } from '../../../src/components/ui/Button';
import { CalendarPlusIcon } from '../../../src/components/ui/SvgIcons';
import { getEvents, registerForEvent, getMyRegisteredEventIds, getEventAttendeeIds, AppEvent } from '../../../src/services/events';
import { getUserProfile, UserProfile } from '../../../src/services/users';
import { getAllMapVenues } from '../../../src/services/venues';
import { CHECKIN_RADIUS_METERS, getVenueGeo } from '../../../src/services/checkin';
import { GPS_FIX_TIMEOUT_MS } from '../../../src/hooks/useLocation';
import { debugLog, debugError } from '../../../src/utils/debugLog';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { colors, typography, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

type Coords = { latitude: number; longitude: number };

// Is the user physically at the event's venue? Uses the SAME radius as check-in so a
// person who can mark presence can also reserve, and a fresh bounded GPS fix rather
// than any cached coordinate (a stale one would let someone reserve from anywhere they
// had previously been).
type GateReason = 'venue_lookup_failed' | 'no_venue_coords' | 'permission_denied' | 'no_fix' | 'too_far';
type VenueGate = { ok: true } | { ok: false; reason: GateReason; metres?: number };

async function assertAtEventVenue(event: AppEvent): Promise<VenueGate> {
  // Direct doc lookup via getVenueGeo — NOT the map listing. getAllMapVenues() is
  // capped at 200 docs per collection and filtered to profileComplete businesses, so
  // resolving through it would make an event permanently un-reservable once the
  // platform passes that many venues, while telling the user to "contact the business
  // owner" about a venue that is configured perfectly well.
  let geo: { lat: number; lng: number } | null;
  try {
    geo = await getVenueGeo(event.venueId);
  } catch {
    // A failed READ is not a misconfigured venue — keep the two apart so the user is
    // not told to phone the business over a dropped connection.
    return { ok: false, reason: 'venue_lookup_failed' };
  }
  if (!geo) return { ok: false, reason: 'no_venue_coords' };

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { ok: false, reason: 'permission_denied' };

  // getCurrentPositionAsync REJECTS (it does not resolve null) when location services
  // are switched off or the provider is unavailable — the single most common real
  // failure. Unhandled, that rejection escaped this gate entirely and surfaced as a
  // generic "cannot register" with no mention of location.
  let pos: Location.LocationObject | null = null;
  try {
    pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), GPS_FIX_TIMEOUT_MS)),
    ]);
  } catch {
    return { ok: false, reason: 'no_fix' };
  }
  if (!pos) return { ok: false, reason: 'no_fix' };

  const metres = distanceKm(
    { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
    { latitude: geo.lat, longitude: geo.lng },
  ) * 1000;
  return metres <= CHECKIN_RADIUS_METERS ? { ok: true } : { ok: false, reason: 'too_far', metres };
}

// Each reason gets its own text: an instruction the user cannot act on ("enable GPS"
// when the real blocker is a revoked app permission) is worse than no instruction.
const GATE_MESSAGE: Record<GateReason, string> = {
  venue_lookup_failed: 'לא ניתן לטעון את פרטי העסק כרגע. בדוק את החיבור לאינטרנט ונסה שוב.',
  no_venue_coords: 'לא ניתן לאמת את מיקום העסק. פנה לבעל העסק.',
  permission_denied: 'נדרשת גישה למיקום כדי לשריין מקום. אפשר גישה למיקום בהגדרות המכשיר.',
  no_fix: 'לא ניתן לקבל את המיקום שלך כרגע. ודא ששירותי המיקום פעילים ונסה שוב.',
  too_far: '',  // built with the distance below
};

// allSettled, not all: one unreadable profile (suspended/deleted account) must not
// blank the whole attendee list.
async function fetchAttendeeProfiles(ids: string[]): Promise<UserProfile[]> {
  const results = await Promise.allSettled(ids.map(id => getUserProfile(id)));
  return results.flatMap(r => (r.status === 'fulfilled' && r.value ? [r.value] : []));
}
type SortMode = 'time' | 'distance';

// Great-circle distance in km (haversine) — used to order events by how close
// their venue is to the user.
function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function EventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registering, setRegistering] = useState(false);
  // `users: null` means still loading. Keyed by eventId so a late response can be
  // discarded rather than shown under a different event.
  const [attendees, setAttendees] = useState<{
    eventId: string; title: string; users: UserProfile[] | null; error: boolean;
    // How many ids the event actually listed, kept alongside the resolved profiles so
    // "nobody registered" can be told apart from "registered but unreadable".
    idCount: number;
  } | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>('time');
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [venueCoords, setVenueCoords] = useState<Map<string, Coords>>(new Map());
  const [locating, setLocating] = useState(false);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const locatingRef = useRef(false);
  // Monotonic reservation-attempt counter. A SHARED BOOLEAN cannot express this: with
  // one flag, starting a second attempt resets the first attempt's "cancelled" mark, so
  // the abandoned one falls through and registers an event the user explicitly declined.
  // Each attempt captures the counter at entry and only acts if it is still the current
  // one; cancelling or starting another attempt bumps it, invalidating everything older.
  const regAttemptRef = useRef(0);
  // Same generation pattern for the attendee modal. Keying only on eventId cannot tell
  // two in-flight requests for the SAME event apart: reopening a slow modal let the
  // first request's failure overwrite the second's loaded list, and because the success
  // setter spread `...prev` a stale `error: true` survived it and hid a list that had
  // actually arrived.
  const attendeesReqRef = useRef(0);

  // Reload on every focus so counts (and which events you're registered to)
  // are fresh when returning to the tab — not stale from the first mount.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [data, regIds] = await Promise.all([
            getEvents(),
            getMyRegisteredEventIds().catch(() => [] as string[]),
          ]);
          if (!cancelled) {
            setEvents(data);
            setRegisteredIds(new Set(regIds));
            setError(false);
          }
        } catch (err) {
          console.error('[EventsScreen] events fetch failed:', err);
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const handleEventPress = useCallback((event: AppEvent) => {
    setSelectedEvent(event);
    setShowConfirm(true);
  }, []);

  // "Who's coming" — loads the event's attendees and shows them. Keyed to the event
  // it was opened for, so a slow load that resolves after the user opened a different
  // event cannot render one event's attendees under another's name.
  const handleShowAttendees = useCallback(async (event: AppEvent) => {
    const req = ++attendeesReqRef.current;
    const isCurrent = () => attendeesReqRef.current === req;
    setAttendees({ eventId: event.id, title: event.title, users: null, error: false, idCount: 0 });
    try {
      const ids = await getEventAttendeeIds(event.id);
      const users = await fetchAttendeeProfiles(ids);
      if (!isCurrent()) return;
      debugLog('EVENTS', 'attendees resolved', { eventId: event.id, ids: ids.length, shown: users.length });
      // error:false explicitly — spreading `...prev` alone would carry a stale failure
      // through and render the error branch over a list that loaded fine.
      setAttendees(prev => (prev && prev.eventId === event.id ? { ...prev, users, idCount: ids.length, error: false } : prev));
    } catch (err) {
      if (!isCurrent()) return;
      debugError('EVENTS', 'attendees load', err, { eventId: event.id });
      setAttendees(prev => (prev && prev.eventId === event.id ? { ...prev, error: true } : prev));
    }
  }, []);

  // Closing invalidates any in-flight attendee request, so reopening starts clean.
  const closeAttendees = useCallback(() => {
    attendeesReqRef.current++;
    setAttendees(null);
  }, []);

  const handleRegister = useCallback(async () => {
    if (!selectedEvent || registering) return;

    // Already registered? Say so and stop, BEFORE the proximity gate. The card hides
    // its reserve button in this case, but the card body itself is still tappable and
    // reopens this dialog — and running the gate first told a user who already holds a
    // spot to travel to the venue ("you are 3000m away") for a reservation they have.
    // Only registerForEvent can detect this server-side, and the gate returns before
    // ever reaching it.
    if (registeredIds.has(selectedEvent.id)) {
      Alert.alert('כבר רשום', 'אתה כבר רשום לאירוע זה.');
      setShowConfirm(false);
      return;
    }

    const attempt = ++regAttemptRef.current;
    const isCurrent = () => regAttemptRef.current === attempt;
    setRegistering(true);
    try {
      // Reserving requires being AT the venue (client request, 2026-07-27). NOTE: this
      // also prevents reserving a spot in advance from home — say the word and the
      // block comes out; nothing else depends on it.
      const gate = await assertAtEventVenue(selectedEvent);
      // The gate can take up to GPS_FIX_TIMEOUT_MS, during which the dialog stays on
      // screen and cancellable. This check must come BEFORE the gate result is acted
      // on, not just before the write: placed after, a cancelled attempt still popped
      // "you are 3km away" over whatever screen the user had moved on to — and a
      // successful one still consumed a spot they had explicitly declined.
      if (!isCurrent()) {
        debugLog('EVENTS', 'register attempt superseded/cancelled during venue gate', { eventId: selectedEvent.id, gateOk: gate.ok });
        return;
      }
      if (!gate.ok) {
        debugLog('EVENTS', 'FAIL register: not at venue', { eventId: selectedEvent.id, reason: gate.reason, metres: gate.metres ?? null });
        Alert.alert(
          gate.reason === 'too_far' ? 'לא במיקום האירוע' : 'לא ניתן לשריין כרגע',
          gate.reason === 'too_far'
            ? `יש לשריין מקום מתוך העסק. אתה נמצא כ-${Math.round(gate.metres ?? 0)} מ׳ מהמקום.`
            : GATE_MESSAGE[gate.reason],
        );
        return;
      }
      await registerForEvent(selectedEvent.id);
      // Past this point the write HAS committed, so everything that reports it must run
      // regardless of whether the attempt was superseded or cancelled meanwhile: the
      // spot is taken either way, and staying silent would leave the user registered
      // for an event they believe they cancelled, looking at a stale attendee count.
      setRegisteredIds(prev => new Set(prev).add(selectedEvent.id));
      Alert.alert('נרשמת בהצלחה!', 'ההרשמה לאירוע אושרה.');
      // Close the dialog HERE, not after the refresh below: getEvents() is a range
      // query plus a getDoc per venue and can take seconds on a weak connection, and
      // leaving the modal up for that window kept a busy spinner on screen after the
      // app had already announced success — with a "ביטול" that would appear to cancel
      // an already-committed reservation. Still guarded, so a superseded attempt cannot
      // dismiss a NEWER event's dialog.
      if (isCurrent()) {
        setShowConfirm(false);
        // Release the busy flag HERE, not in the finally: the finally is sequenced
        // behind the best-effort refresh below, and getEvents() is a range query plus a
        // getDoc per venue. Leaving it set for that window made the NEXT event's
        // reserve button a dead, unpressable spinner claiming a reservation was in
        // progress — the same failure the cancel path already guards against.
        setRegistering(false);
      }
      // Refresh events so the count reflects the new registration — but a failed
      // REFRESH must not surface as a registration error (the register succeeded).
      try {
        const data = await getEvents();
        setEvents(data);
      } catch { /* count refresh is best-effort */ }
    } catch (err: unknown) {
      // A superseded attempt must not alert either — its error belongs to an event the
      // user has already moved on from.
      if (!isCurrent()) return;
      const message = (err as Error).message;
      if (message === 'Event is full') {
        Alert.alert('האירוע מלא', 'אין מקומות פנויים באירוע זה.');
      } else if (message === 'Already registered') {
        Alert.alert('כבר רשום', 'אתה כבר רשום לאירוע זה.');
      } else {
        Alert.alert('שגיאה', 'לא ניתן להירשם כרגע. נסה שוב.');
      }
    } finally {
      // Only the CURRENT attempt owns the busy flag — a stale one clearing it would
      // re-enable the button while a newer reservation is still running.
      if (isCurrent()) setRegistering(false);
    }
  }, [selectedEvent, registering, registeredIds]);

  const handleCancelConfirm = useCallback(() => {
    // Invalidate any in-flight attempt: it will see a newer counter and abandon itself.
    regAttemptRef.current++;
    // Release the busy flag too — the abandoned gate can still run for up to
    // GPS_FIX_TIMEOUT_MS, and leaving it set made the NEXT event's reserve button
    // render as a disabled spinner for ~12s, claiming a reservation was in progress.
    setRegistering(false);
    setShowConfirm(false);
    setSelectedEvent(null);
  }, []);

  // Sort by distance is opt-in: it lazily requests location permission (so the
  // events tab doesn't prompt on open) and loads venue coordinates once.
  const enableDistanceSort = useCallback(async () => {
    if (userCoords && venueCoords.size > 0) {
      setSortBy('distance');
      return;
    }
    if (locatingRef.current) return; // guard same-tick double-tap before disabled applies
    locatingRef.current = true;
    setLocating(true);
    try {
      debugLog('EVENTS', 'nearby sort start', {});
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        debugLog('EVENTS', 'FAIL nearby: location permission denied', { status });
        Alert.alert('נדרשת גישה למיקום', 'אפשר גישה למיקום כדי לסנן אירועים לפי קרבה אליך.');
        return;
      }
      // The GPS fix is bounded: getCurrentPositionAsync can hang forever on Android
      // when no fix is obtainable, which would leave this button spinning and disabled
      // with no way out for the rest of the session.
      const [pos, venues] = await Promise.all([
        Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>(resolve => setTimeout(() => resolve(null), GPS_FIX_TIMEOUT_MS)),
        ]),
        getAllMapVenues(),
      ]);
      if (!pos) {
        debugLog('EVENTS', 'FAIL nearby: GPS fix timed out', { timeoutMs: GPS_FIX_TIMEOUT_MS });
        Alert.alert('שגיאה', 'לא ניתן לקבל מיקום כרגע. נסה שוב.');
        return;
      }
      const coords = new Map<string, Coords>();
      for (const v of venues) {
        if (v.location) {
          coords.set(v.id, { latitude: v.location.latitude, longitude: v.location.longitude });
        }
      }
      // A venue with no coordinates can never be distance-sorted. Surfacing the split
      // makes "sorting looks wrong" diagnosable without reproducing it.
      debugLog('EVENTS', 'nearby sort ok', { venues: venues.length, withCoords: coords.size });
      setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setVenueCoords(coords);
      setSortBy('distance');
    } catch (err) {
      // This catch also covers getAllMapVenues() failing, which is NOT a location
      // problem — the old message blamed the GPS for what was often a Firestore read.
      debugError('EVENTS', 'nearby sort', err);
      Alert.alert('שגיאה', 'לא ניתן לטעון אירועים לפי קרבה כרגע. נסה שוב.');
    } finally {
      setLocating(false);
      locatingRef.current = false;
    }
  }, [userCoords, venueCoords]);

  // 'time' keeps the server order (soonest → latest). 'distance' orders by how
  // close each event's venue is, with un-located venues last, tie-broken by time.
  const sortedEvents = useMemo(() => {
    if (sortBy !== 'distance' || !userCoords) return events;
    return [...events].sort((a, b) => {
      const ca = venueCoords.get(a.venueId);
      const cb = venueCoords.get(b.venueId);
      const da = ca ? distanceKm(userCoords, ca) : Infinity;
      const dbDist = cb ? distanceKm(userCoords, cb) : Infinity;
      if (da !== dbDist) return da - dbDist;
      return (a.dateTime?.toMillis?.() ?? 0) - (b.dateTime?.toMillis?.() ?? 0);
    });
  }, [sortBy, userCoords, venueCoords, events]);

  const renderItem = useCallback(({ item }: { item: AppEvent }) => (
    <EventCard
      title={item.title}
      description={item.description}
      venueName={item.venueName}
      venueAddress={item.venueAddress}
      venueImage={item.venuePhoto}
      coverImage={item.venuePhoto}
      dateTime={item.dateTime}
      attendeeCount={item.attendeeCount}
      capacity={item.capacity}
      attendeeCounts={item.attendeeCounts}
      hideReserve={registeredIds.has(item.id)}
      onPress={() => handleEventPress(item)}
      onShowAttendees={() => handleShowAttendees(item)}
    />
  ), [handleEventPress, handleShowAttendees, registeredIds]);

  const keyExtractor = useCallback((item: AppEvent) => item.id, []);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>{he.events.title}</Text>
      </View>

      <View style={styles.sortRow}>
        <TouchableOpacity
          style={[styles.sortChip, sortBy === 'time' && styles.sortChipActive]}
          onPress={() => setSortBy('time')}
          activeOpacity={0.7}
        >
          <Text style={[styles.sortChipText, sortBy === 'time' && styles.sortChipTextActive]}>לפי זמן</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortBy === 'distance' && styles.sortChipActive]}
          onPress={enableDistanceSort}
          disabled={locating}
          activeOpacity={0.7}
        >
          <Text style={[styles.sortChipText, sortBy === 'distance' && styles.sortChipTextActive]}>
            {locating ? 'מאתר מיקום...' : 'קרוב אליי'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>שגיאה בטעינת האירועים</Text>
          <Text style={styles.emptySubtext}>בדוק את החיבור לאינטרנט ונסה שוב.</Text>
        </View>
      ) : events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>{he.events.noEvents}</Text>
          <Text style={styles.emptySubtext}>{he.events.noEventsSubtext}</Text>
        </View>
      ) : (
        <FlatList
          data={sortedEvents}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Registration confirmation modal */}
      {/* Who's coming to this event. Tapping a person opens their profile, where a
          like can be sent — so an event is a way to meet people, not just a booking. */}
      <Modal visible={!!attendees} transparent animationType="fade" onRequestClose={closeAttendees}>
        {/* Guarded on `attendees` and not just on Modal.visible: on iOS the Modal keeps
            its children mounted until the native dismiss animation finishes, so after
            closeAttendees() they re-render once with attendees === null. Every branch
            below reads optional-chained fields, which then fall through to the empty
            case — flashing "nobody has registered yet" over the list the user was just
            looking at. Rendering nothing during the fade-out is the honest frame. */}
        {attendees && (
        <View style={styles.modalOverlay}>
          <View style={styles.attendeesModal}>
            <Text style={styles.modalTitle} numberOfLines={2}>{attendees?.title ?? ''}</Text>
            {attendees?.users === null && !attendees?.error ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
            ) : attendees?.error ? (
              <Text style={styles.attendeeEmpty}>לא ניתן לטעון את הרשימה כרגע. נסה שוב.</Text>
            ) : (attendees?.users?.length ?? 0) === 0 ? (
              // "Nobody registered" and "registrations exist but none of them can be
              // shown" are different facts. The card's count comes from the event's
              // denormalised attendeeCount, so claiming nobody signed up directly under
              // a button reading "מי מגיע? (5)" would be a visible contradiction —
              // which is exactly what happens when every attendee has been moderated
              // off, or on a legacy event that predates the attendeeIds field.
              <Text style={styles.attendeeEmpty}>
                {(attendees?.idCount ?? 0) > 0
                  ? 'לא ניתן להציג את הנרשמים לאירוע הזה'
                  : 'עדיין אף אחד לא נרשם לאירוע הזה'}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }}>
                {attendees?.users?.map(u => (
                  <TouchableOpacity
                    key={u.uid}
                    style={styles.attendeeRow}
                    activeOpacity={0.7}
                    onPress={() => { closeAttendees(); router.push(`/(tabs)/user/${u.uid}`); }}
                  >
                    {u.photos?.[0] ? (
                      <CachedImage uri={u.photos[0]} style={styles.attendeeAvatar} />
                    ) : (
                      <View style={[styles.attendeeAvatar, { backgroundColor: colors.surfaceLight }]} />
                    )}
                    <Text style={styles.attendeeName} numberOfLines={1}>{u.name ?? ''}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.attendeeClose} onPress={closeAttendees}>
              <Text style={styles.attendeeCloseText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}
      </Modal>

      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={handleCancelConfirm}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <CalendarPlusIcon size={76} color="#FF7043" />
            <Text style={styles.modalTitle}>שריון מקום באירוע</Text>
            {selectedEvent && (
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {(() => {
                    const d = selectedEvent.dateTime?.toDate?.();
                    if (!d) return '';
                    const days = ['יום א', 'יום ב', 'יום ג', 'יום ד', 'יום ה', 'יום ו', 'שבת'];
                    const day = days[d.getDay()];
                    const dd = d.getDate().toString().padStart(2, '0');
                    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
                    const yy = d.getFullYear().toString().slice(2);
                    const hh = d.getHours().toString().padStart(2, '0');
                    const min = d.getMinutes().toString().padStart(2, '0');
                    return `${day}, ${dd}.${mm}.${yy}, ${hh}:${min}`;
                  })()}
                </Text>
              </View>
            )}
            <Text style={styles.modalWarning}>{he.events.reserveWarning}</Text>

            <Button
              title="שריון מקום"
              onPress={handleRegister}
              loading={registering}
              variant="primary"
            />
            <Text style={styles.cancelText} onPress={handleCancelConfirm}>ביטול</Text>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'right',
  },
  sortRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sortChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
  },
  sortChipTextActive: {
    color: colors.white,
    fontFamily: 'Rubik_600SemiBold',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingVertical: 12,
    paddingBottom: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  attendeesModal: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    width: '86%', maxWidth: 420, alignItems: 'stretch',
  },
  attendeeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 10 },
  attendeeAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface },
  attendeeName: { ...typography.body, color: colors.text, textAlign: 'right', flex: 1 },
  attendeeEmpty: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginVertical: 24 },
  attendeeClose: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  attendeeCloseText: { ...typography.body, color: colors.primary, fontFamily: 'Rubik_600SemiBold' },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  modalTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
  },
  dateBadge: {
    backgroundColor: '#FF9777',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateBadgeText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.white,
  },
  modalWarning: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
    textDecorationLine: 'underline' as const,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
