import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Modal, ScrollView, Image, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../src/config/firebase';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Button } from '../../../src/components/ui/Button';
import { BusinessEventCard } from '../../../src/components/ui/BusinessEventCard';
import { EmptyEventsIcon, CloseModalIcon, EditEventIcon, GenderMaleSmallIcon, GenderFemaleSmallIcon, GenderOtherSmallIcon } from '../../../src/components/ui/SvgIcons';
import { getEventsByCreator, AppEvent } from '../../../src/services/events';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

const HEBREW_DAYS = ['יום א', 'יום ב', 'יום ג', 'יום ד', 'יום ה', 'יום ו', 'שבת'];

function formatEventDate(dateTime: any): string {
  if (!dateTime?.toDate) return '';
  const date = dateTime.toDate();
  const dayName = HEBREW_DAYS[date.getDay()];
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear().toString().slice(2);
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${dayName}, ${d}.${m}.${y}, ${h}:${min}`;
}

export default function BusinessEventsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
  const [businessAddress, setBusinessAddress] = useState('');
  const [error, setError] = useState(false);

  // Responsive layout — cover ~50% of screen so details card starts lower
  const cardOverlap = 30;
  const coverHeight = useMemo(
    () => Math.min(Math.max(Math.round(screenHeight * 0.5), 300), 480),
    [screenHeight],
  );
  const orangeGradientH = useMemo(
    () => Math.round(coverHeight * 0.48),
    [coverHeight],
  );
  // Card always reaches at least the bottom of the screen
  const minCardHeight = useMemo(
    () => screenHeight - coverHeight + cardOverlap,
    [screenHeight, coverHeight],
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      (async () => {
        try {
          // allSettled so a business-doc (logo/address) read failure can't blank
          // the owner's real events — only an events-fetch failure is an error.
          const [evRes, bizRes] = await Promise.allSettled([
            getEventsByCreator(user.uid),
            getDoc(doc(db, 'businesses', user.uid)),
          ]);
          if (!cancelled) {
            if (evRes.status === 'fulfilled') {
              setEvents(evRes.value);
              setError(false);
            } else {
              console.error('[BusinessEventsScreen] events fetch failed:', evRes.reason);
              setError(true);
            }
            if (bizRes.status === 'fulfilled' && bizRes.value.exists()) {
              const data = bizRes.value.data();
              setBusinessLogo(data?.logo ?? data?.photos?.[0] ?? null);
              setBusinessAddress(data?.location ?? '');
            }
            setLoading(false);
          }
        } catch (err) {
          console.error('[BusinessEventsScreen] fetch failed:', err);
          if (!cancelled) { setError(true); setLoading(false); }
        }
      })();
      return () => { cancelled = true; };
    }, [user]),
  );

  const handleNewEvent = useCallback(() => {
    router.push('/(business)/events/new');
  }, [router]);

  const renderItem = useCallback(({ item }: { item: AppEvent }) => (
    <BusinessEventCard
      title={item.title}
      description={item.description}
      coverImage={item.venuePhoto}
      dateTime={item.dateTime}
      onPress={() => setSelectedEvent(item)}
    />
  ), []);

  const keyExtractor = useCallback((item: AppEvent) => item.id, []);

  const handleEditEvent = useCallback(() => {
    const id = selectedEvent?.id;
    setSelectedEvent(null);
    if (id) {
      requestAnimationFrame(() => {
        router.push(`/(business)/events/new?eventId=${id}`);
      });
    }
  }, [selectedEvent, router]);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleNewEvent} activeOpacity={0.7}>
          <Text style={styles.newEventLink}>אירוע חדש</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>אירועים קרובים</Text>
      </View>

      {error && events.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <EmptyEventsIcon size={76} color="#FF7043" />
          <Text style={styles.emptyTitle}>שגיאה בטעינת האירועים</Text>
          <Text style={styles.emptySubtext}>בדוק את החיבור לאינטרנט ונסה שוב.</Text>
        </View>
      ) : events.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <EmptyEventsIcon size={76} color="#FF7043" />
          <Text style={styles.emptyTitle}>{he.events.noEvents}</Text>
          <Text style={styles.emptySubtext}>{he.events.noEventsSubtext}</Text>
          <View style={styles.createButtonContainer}>
            <Button
              title="צור אירוע"
              onPress={handleNewEvent}
              variant="primary"
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={events}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Event Profile Modal — fully responsive */}
      <Modal visible={!!selectedEvent} animationType="slide" onRequestClose={() => setSelectedEvent(null)}>
        <View style={styles.modalContainer}>
          <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: insets.bottom }}>
            {/* Cover Image Section — responsive height */}
            <View style={{ height: coverHeight, position: 'relative' }}>
              {selectedEvent?.venuePhoto ? (
                <Image source={{ uri: selectedEvent.venuePhoto }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceLight }]} />
              )}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
              <LinearGradient
                colors={['transparent', '#23201E']}
                locations={[0.72, 1]}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['transparent', '#FF7043']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: orangeGradientH }}
              />
              <TouchableOpacity
                style={{ position: 'absolute', top: insets.top + 16, right: 16 }}
                onPress={() => setSelectedEvent(null)}
                activeOpacity={0.7}
              >
                <CloseModalIcon size={40} />
              </TouchableOpacity>
              <TouchableOpacity
                style={{ position: 'absolute', top: insets.top + 16, left: 16 }}
                onPress={handleEditEvent}
                activeOpacity={0.7}
              >
                <EditEventIcon size={40} />
              </TouchableOpacity>
            </View>

            {/* Profile Details Card — minHeight ensures it always reaches screen bottom */}
            <View style={[styles.profileCard, { minHeight: minCardHeight }]}>
              <View style={styles.profileContent}>
                {/* Venue Row */}
                <View style={styles.venueRow}>
                  <View style={styles.venueTextCol}>
                    <Text style={styles.venueName}>{selectedEvent?.venueName}</Text>
                    <Text style={styles.venueAddress}>{selectedEvent?.venueAddress || businessAddress}</Text>
                  </View>
                  {businessLogo ? (
                    <Image source={{ uri: businessLogo }} style={styles.venueLogo} />
                  ) : (
                    <View style={styles.venueLogoPlaceholder} />
                  )}
                </View>

                {/* Event Title + Date Badge */}
                <View style={styles.eventTitleSection}>
                  <Text style={styles.eventTitle}>{selectedEvent?.title}</Text>
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeText}>{formatEventDate(selectedEvent?.dateTime)}</Text>
                  </View>
                </View>

                {/* About */}
                {selectedEvent?.description ? (
                  <View style={styles.aboutSection}>
                    <Text style={styles.aboutTitle}>אודות</Text>
                    <Text style={styles.aboutText}>{selectedEvent.description}</Text>
                  </View>
                ) : null}

                {/* Capacity + Gender */}
                <View style={styles.capacitySection}>
                  <Text style={styles.capacityText}>
                    מקומות <Text style={styles.capacityNumbers}>{selectedEvent?.attendeeCount}/{selectedEvent?.capacity}</Text>
                  </Text>
                  {selectedEvent?.attendeeCounts && (
                    <View style={styles.genderRow}>
                      {(() => {
                        const otherActive = (selectedEvent.attendeeCounts.other ?? 0) > 0;
                        return (
                          <View style={styles.genderBox}>
                            <View style={styles.genderIconWrap}>
                              <GenderOtherSmallIcon size={19} color={otherActive ? colors.primary : colors.white} />
                            </View>
                            <View style={styles.genderTextCol}>
                              <Text style={[styles.genderCount, otherActive && styles.genderAccent]}>{selectedEvent.attendeeCounts.other}</Text>
                              <Text style={[styles.genderLabel, otherActive && styles.genderAccent]}>{he.map.other}</Text>
                            </View>
                          </View>
                        );
                      })()}
                      {(() => {
                        const femaleActive = (selectedEvent.attendeeCounts.female ?? 0) > 0;
                        return (
                          <View style={styles.genderBox}>
                            <View style={styles.genderIconWrap}>
                              <GenderFemaleSmallIcon size={20} color={femaleActive ? colors.primary : colors.white} />
                            </View>
                            <View style={styles.genderTextCol}>
                              <Text style={[styles.genderCount, femaleActive && styles.genderAccent]}>{selectedEvent.attendeeCounts.female}</Text>
                              <Text style={[styles.genderLabel, femaleActive && styles.genderAccent]}>{he.map.women}</Text>
                            </View>
                          </View>
                        );
                      })()}
                      {(() => {
                        const maleActive = (selectedEvent.attendeeCounts.male ?? 0) > 0;
                        return (
                          <View style={styles.genderBox}>
                            <View style={styles.genderIconWrap}>
                              <GenderMaleSmallIcon size={30} color={maleActive ? colors.primary : colors.white} />
                            </View>
                            <View style={styles.genderTextCol}>
                              <Text style={[styles.genderCount, maleActive && styles.genderAccent]}>{selectedEvent.attendeeCounts.male}</Text>
                              <Text style={[styles.genderLabel, maleActive && styles.genderAccent]}>{he.map.men}</Text>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  )}
                </View>

              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 22,
    color: colors.text,
    textAlign: 'right',
  },
  newEventLink: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.primary,
    textDecorationLine: 'underline' as const,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  emptyTitle: {
    width: '100%',
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    width: '100%',
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  createButtonContainer: {
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 24,
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  /* ─── Modal styles — responsive ─── */
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
  },
  profileContent: {
    paddingHorizontal: 16,
    paddingTop: 32,
    gap: 24,
    alignItems: 'flex-end' as const,
    paddingBottom: 40,
  },
  venueRow: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
    gap: 8,
    width: '100%' as const,
  },
  venueTextCol: {
    alignItems: 'flex-end' as const,
    gap: 4,
  },
  venueLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.1,
    borderColor: colors.white,
  },
  venueLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1.1,
    borderColor: colors.white,
  },
  venueName: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    color: colors.white,
    textAlign: 'right' as const,
  },
  venueAddress: {
    fontFamily: 'Rubik_300Light',
    fontSize: 14,
    color: '#A7A7A7',
    textAlign: 'right' as const,
  },
  eventTitleSection: {
    alignItems: 'flex-end' as const,
    width: '100%' as const,
    gap: 8,
  },
  eventTitle: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 22,
    color: colors.white,
    textAlign: 'right' as const,
    width: '100%' as const,
  },
  dateBadge: {
    backgroundColor: '#FF9777',
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateBadgeText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.white,
  },
  aboutSection: {
    width: '100%' as const,
    gap: 8,
  },
  aboutTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.white,
    textAlign: 'right' as const,
  },
  aboutText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 19,
    color: colors.white,
    textAlign: 'right' as const,
  },
  capacitySection: {
    width: '100%' as const,
    alignItems: 'flex-end' as const,
    gap: 16,
  },
  capacityText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.white,
    textAlign: 'right' as const,
  },
  capacityNumbers: {
    color: colors.primary,
  },
  genderRow: {
    flexDirection: 'row' as const,
    gap: 7,
    width: '100%' as const,
    justifyContent: 'center' as const,
  },
  genderBox: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    borderWidth: 1,
    borderColor: '#A7A7A7',
    borderRadius: 6,
    backgroundColor: colors.background,
    paddingVertical: 12,
  },
  genderIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  genderTextCol: {
    alignItems: 'center' as const,
  },
  genderCount: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    lineHeight: 17.5,
    color: colors.white,
    textAlign: 'center' as const,
  },
  genderLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    lineHeight: 17.5,
    color: colors.white,
    textAlign: 'center' as const,
  },
  genderAccent: {
    color: colors.primary,
  },
});
