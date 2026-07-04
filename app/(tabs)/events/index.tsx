import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { EventCard } from '../../../src/components/ui/EventCard';
import { Button } from '../../../src/components/ui/Button';
import { CalendarPlusIcon } from '../../../src/components/ui/SvgIcons';
import { getEvents, registerForEvent, getMyRegisteredEventIds, AppEvent } from '../../../src/services/events';
import { getAllMapVenues } from '../../../src/services/venues';
import { colors, typography, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

type Coords = { latitude: number; longitude: number };
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
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('time');
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [venueCoords, setVenueCoords] = useState<Map<string, Coords>>(new Map());
  const [locating, setLocating] = useState(false);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const locatingRef = useRef(false);

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

  const handleRegister = useCallback(async () => {
    if (!selectedEvent || registering) return;

    setRegistering(true);
    try {
      await registerForEvent(selectedEvent.id);
      // Mark registered immediately so the card stops offering "reserve".
      setRegisteredIds(prev => new Set(prev).add(selectedEvent.id));
      Alert.alert('נרשמת בהצלחה!', 'ההרשמה לאירוע אושרה.');
      setShowConfirm(false);
      // Refresh events so the count reflects the new registration — but a failed
      // REFRESH must not surface as a registration error (the register succeeded).
      try {
        const data = await getEvents();
        setEvents(data);
      } catch { /* count refresh is best-effort */ }
    } catch (err: unknown) {
      const message = (err as Error).message;
      if (message === 'Event is full') {
        Alert.alert('האירוע מלא', 'אין מקומות פנויים באירוע זה.');
      } else if (message === 'Already registered') {
        Alert.alert('כבר רשום', 'אתה כבר רשום לאירוע זה.');
      } else {
        Alert.alert('שגיאה', 'לא ניתן להירשם כרגע. נסה שוב.');
      }
    } finally {
      setRegistering(false);
    }
  }, [selectedEvent, registering]);

  const handleCancelConfirm = useCallback(() => {
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('נדרשת גישה למיקום', 'אפשר גישה למיקום כדי לסנן אירועים לפי קרבה אליך.');
        return;
      }
      const [pos, venues] = await Promise.all([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        getAllMapVenues(),
      ]);
      const coords = new Map<string, Coords>();
      for (const v of venues) {
        if (v.location) {
          coords.set(v.id, { latitude: v.location.latitude, longitude: v.location.longitude });
        }
      }
      setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setVenueCoords(coords);
      setSortBy('distance');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לקבל מיקום כרגע. נסה שוב.');
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
    />
  ), [handleEventPress, registeredIds]);

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
