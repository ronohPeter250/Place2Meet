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

  const [presentCount, setPresentCount] = useState(0);
  const [selfPresent, setSelfPresent] = useState(false);
  const [checkedInHere, setCheckedInHere] = useState(false);
  const [presentUsers, setPresentUsers] = useState<UserProfile[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Live "who's here now" count.
  useEffect(() => {
    if (!venueId) return;
    const unsub = subscribeVenueActiveCounts(venueId, (c) => setPresentCount(c.male + c.female + c.other));
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
          // gate — the rules deny the present-list read otherwise, which also blocks
          // remote stalking). The count + registered list stay public.
          const myCheckin = await getCurrentUserCheckIn().catch(() => null);
          if (cancelled) return;
          const here = !!myCheckin && myCheckin.venueId === venueId;
          setCheckedInHere(here);
          setSelfPresent(here);
          const [presentIds, registeredIds] = await Promise.all([
            here ? getVenuePresentUserIds(venueId) : Promise.resolve([] as string[]),
            getVenueRegisteredUserIds(venueId),
          ]);
          if (cancelled) return;
          const selfExcluded = (ids: string[]) => ids.filter(id => id !== user?.uid);
          const [present, registered] = await Promise.all([
            fetchProfiles(selfExcluded(presentIds)),
            fetchProfiles(selfExcluded(registeredIds)),
          ]);
          if (cancelled) return;
          setPresentUsers(present);
          // Don't list a registered user twice if they're also present.
          const presentSet = new Set(present.map(p => p.uid));
          setRegisteredUsers(registered.filter(r => !presentSet.has(r.uid)));
          setError(false);
        } catch (err) {
          console.error('[VenueDetailScreen] load failed:', err);
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
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

        {/* Count excludes you, to match the grids below (which show OTHERS to tap). */}
        <Text style={styles.presentCount}>{Math.max(0, presentCount - (selfPresent ? 1 : 0))} נמצאים כאן עכשיו</Text>

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
            <UserGrid users={registeredUsers} onPress={openUser} emptyText="אין רשומים לאירועים כאן" />
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
