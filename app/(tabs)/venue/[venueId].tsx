import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Header } from '../../../src/components/layout/Header';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { NavSwipesIcon } from '../../../src/components/ui/SvgIcons';
import {
  subscribeVenueActiveCounts,
  getVenuePresentUserIds,
  getCurrentUserCheckIn,
} from '../../../src/services/checkin';
import { getVenueRegisteredUserIds } from '../../../src/services/events';
import { getUserProfile, UserProfile } from '../../../src/services/users';
import { subscribeToChats } from '../../../src/services/chat';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography } from '../../../src/theme';

async function fetchProfiles(ids: string[]): Promise<UserProfile[]> {
  const results = await Promise.allSettled(ids.map(id => getUserProfile(id)));
  return results.flatMap(r => (r.status === 'fulfilled' && r.value ? [r.value] : []));
}

function UserGrid({ users, onPress, emptyText }: {
  users: UserProfile[]; onPress: (uid: string) => void; emptyText: string;
}) {
  if (users.length === 0) return <Text style={styles.emptyText}>{emptyText}</Text>;
  return (
    <View style={styles.grid}>
      {users.map(u => (
        <TouchableOpacity key={u.uid} style={styles.userCard} activeOpacity={0.8} onPress={() => onPress(u.uid)}>
          {u.photos?.[0] ? (
            <CachedImage uri={u.photos[0]} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <Text style={styles.userName} numberOfLines={1}>{u.name ?? ''}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function VenueDetailScreen() {
  const { venueId, name } = useLocalSearchParams<{ venueId?: string; name?: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [presence, setPresence] = useState<{ venueId: string; count: number } | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [loaded, setLoaded] = useState<{
    venueId: string;
    checkedInHere: boolean;
    presentUsers: UserProfile[];
    registeredCount: number;
    error: boolean;
  } | null>(null);

  // This screen is a bottom-TAB route (app/(tabs)/_layout.tsx registers it as a
  // Tabs.Screen with href:null) and expo-router downgrades push() to NAVIGATE for a
  // non-stack target, so tapping a second venue REUSES this instance with new params
  // instead of remounting. Everything venue-specific is therefore keyed to the venue
  // it was loaded for and goes stale in the SAME render — otherwise venue B's page
  // would assert that the people standing in venue A are here now.
  const current = loaded && loaded.venueId === venueId ? loaded : null;
  const loading = current === null;
  const error = current?.error ?? false;
  const checkedInHere = current?.checkedInHere ?? false;
  const presentUsers = current?.presentUsers ?? [];
  const registeredCount = current?.registeredCount ?? 0;
  const presentCount = presence && presence.venueId === venueId ? presence.count : 0;
  const selfPresent = checkedInHere;

  // Live "who's here now" count.
  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeVenueActiveCounts(venueId, (c) =>
      setPresence({ venueId, count: c.male + c.female + c.other }));
    return () => unsub();
  }, [venueId]);

  // Live match count (matches are the user's chats).
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToChats((chats) => setMatchCount(chats.length));
    return () => unsub();
  }, [user]);

  // Load the present + registered user lists on focus (so re-entering refreshes).
  useFocusEffect(
    useCallback(() => {
      if (!venueId) return;
      let cancelled = false;
      (async () => {
        try {
          // You may see WHO is present only if you are checked in HERE (co-presence
          // gate — the rules deny the present-list read otherwise).
          const myCheckin = await getCurrentUserCheckIn().catch(() => null);
          if (cancelled) return;
          const here = !!myCheckin && myCheckin.venueId === venueId;
          const [presentIds, registeredIds] = await Promise.all([
            here ? getVenuePresentUserIds(venueId) : Promise.resolve([] as string[]),
            getVenueRegisteredUserIds(venueId),
          ]);
          if (cancelled) return;
          const selfExcluded = (ids: string[]) => ids.filter(id => id !== user?.uid);
          const present = await fetchProfiles(selfExcluded(presentIds));
          if (cancelled) return;
          // Registered-for-events is surfaced as a COUNT ONLY, never as identities:
          // naming them would disclose where a specific person WILL be and when —
          // a predictive location leak that needs no check-in and no proximity claim,
          // which is strictly worse than the present-list this screen gates.
          setLoaded({
            venueId,
            checkedInHere: here,
            presentUsers: present,
            registeredCount: selfExcluded(registeredIds).length,
            error: false,
          });
        } catch (err) {
          console.error('[VenueDetailScreen] load failed:', err);
          if (!cancelled) {
            setLoaded({ venueId, checkedInHere: false, presentUsers: [], registeredCount: 0, error: true });
          }
        }
      })();
      return () => { cancelled = true; };
    }, [venueId, user?.uid]),
  );

  const openUser = useCallback((uid: string) => {
    router.push(`/(tabs)/user/${uid}`);
  }, [router]);

  return (
    <ScreenWrapper>
      <Header />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{name ?? 'עמוד העסק'}</Text>
          {/* Matches icon + count (#6) — tap to jump to your matches (chats). */}
          <TouchableOpacity style={styles.matchesBtn} activeOpacity={0.7} onPress={() => router.push('/(tabs)/chat')}>
            <NavSwipesIcon size={24} color={colors.primary} />
            {matchCount > 0 && (
              <View style={styles.matchesBadge}><Text style={styles.matchesBadgeText}>{matchCount}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        {/* Count excludes you, to match the grid below (which shows OTHERS to tap).
            Requires BOTH the live count for THIS venue AND a SUCCESSFUL `current`
            (which carries checkedInHere): the count arrives in one snapshot while
            checkedInHere costs several round-trips, so rendering on `presence` alone
            would count YOU as a stranger and state one person too many, then silently
            decrement. On the error path checkedInHere is forced false and is therefore
            not trustworthy either — so the count is withheld rather than overstated.
            Without this, switching venues would also assert "0 נמצאים כאן עכשיו"
            about a venue nothing is yet known about. */}
        {presence && presence.venueId === venueId && current && !current.error && (
          <Text style={styles.presentCount}>
            {Math.max(0, presentCount - (selfPresent ? 1 : 0))} נמצאים כאן עכשיו
          </Text>
        )}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : error ? (
          <Text style={styles.errorText}>שגיאה בטעינת המקום. בדוק את החיבור לאינטרנט ונסה שוב.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>מי כאן עכשיו</Text>
            {checkedInHere ? (
              <UserGrid users={presentUsers} onPress={openUser} emptyText="אף אחד אחר לא סימן נוכחות כאן כרגע" />
            ) : (
              <Text style={styles.emptyText}>סמן נוכחות (״אני כאן״) כדי לראות מי נמצא כאן עכשיו</Text>
            )}

            <Text style={styles.sectionTitle}>רשומים לאירועים כאן</Text>
            <Text style={registeredCount > 0 ? styles.registeredCount : styles.emptyText}>
              {registeredCount > 0 ? `${registeredCount} רשומים` : 'אין רשומים לאירועים כאן'}
            </Text>
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const AVATAR = 96;
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  title: { ...typography.h2, color: colors.text, textAlign: 'right', flex: 1 },
  matchesBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  matchesBadge: { position: 'absolute', top: 2, left: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  matchesBadgeText: { color: colors.white, fontFamily: 'Rubik_700Bold', fontSize: 11 },
  presentCount: { ...typography.body, color: colors.primary, textAlign: 'right', marginTop: 8, fontFamily: 'Rubik_600SemiBold' },
  registeredCount: { ...typography.body, color: colors.text, textAlign: 'right', fontFamily: 'Rubik_600SemiBold' },
  sectionTitle: { ...typography.captionBold, color: colors.textSecondary, textAlign: 'right', marginTop: 28, marginBottom: 12 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  userCard: { width: AVATAR, alignItems: 'center' },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: 12, backgroundColor: colors.surface },
  avatarPlaceholder: { backgroundColor: colors.surfaceLight },
  userName: { ...typography.caption, color: colors.text, textAlign: 'center', marginTop: 6, width: AVATAR },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
  center: { paddingTop: 48, alignItems: 'center' },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: 40 },
});
