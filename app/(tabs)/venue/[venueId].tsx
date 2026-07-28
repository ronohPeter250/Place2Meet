import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useTabBarClearance } from '../../../src/hooks/useTabBarClearance';

// Stable empty array — a fresh [] on every render would change identity each time and
// re-run any memo/effect keyed on these lists.
const EMPTY_USERS: UserProfile[] = [];

// Floor between presence-driven reloads. Each reload is several queries plus one getDoc
// per present and per registered user, and a busy venue emits a change per check-in.
const PRESENCE_RELOAD_THROTTLE_MS = 4000;

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
  // Clear the floating tab bar using the running device's bottom inset — the
  // literal 120 this replaces was only correct when that inset was 0.
  const tabBarClearance = useTabBarClearance(20);
  const { venueId, name } = useLocalSearchParams<{ venueId?: string; name?: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [presence, setPresence] = useState<{ venueId: string; count: number } | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [loaded, setLoaded] = useState<{
    venueId: string;
    checkedInHere: boolean;
    presentUsers: UserProfile[];
    // Same three-way distinction as the registered grid: the live count comes from the
    // identity-free entries, which still count a person whose PROFILE cannot be read
    // (suspended/deleted). Without this the grid said "nobody has marked presence"
    // directly under a header saying "1 נמצאים כאן עכשיו".
    presentIdCount: number;
    registeredUsers: UserProfile[];
    // registeredUsers has had TWO independent reductions applied: registrants who are
    // also present are removed, and registrants whose profile could not be read are
    // silently dropped by fetchProfiles. An empty grid therefore has three different
    // causes, and both counts are needed to tell them apart:
    //   registeredIdCount === 0            -> nobody is registered at all
    //   registeredNotPresentCount === 0    -> every registrant is in the grid above
    //   otherwise                          -> they exist, are not here, and are unreadable
    registeredIdCount: number;
    registeredNotPresentCount: number;
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
  const presentUsers = current?.presentUsers ?? EMPTY_USERS;
  const presentIdCount = current?.presentIdCount ?? 0;
  const registeredUsers = current?.registeredUsers ?? EMPTY_USERS;
  const registeredIdCount = current?.registeredIdCount ?? 0;
  const registeredNotPresentCount = current?.registeredNotPresentCount ?? 0;
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

  // ONE loader for everything venue-scoped. The present list, the registered list and
  // the three counters are all derived from the SAME instant and are mutually
  // dependent — the registered grid is registered-minus-present, and the empty-text
  // for each is chosen from counts taken alongside. Refreshing any one of them on its
  // own desynchronises the rest: a registrant who checks in appeared in BOTH grids,
  // and when everyone checked out the page read "nobody is here" directly above "all
  // registrants are already here". So there is exactly one function that computes the
  // whole set, and every trigger calls it.
  // One generation counter for ALL venue loads. Two triggers with two independent
  // cancel flags could not invalidate each other, so a slow earlier load overwrote a
  // fast later one — a 30-person grid rendered above a "0 נמצאים כאן עכשיו" header.
  // Every load claims a generation at entry and may only write while it is still the
  // newest; blur bumps it, abandoning anything in flight.
  const loadGenRef = useRef(0);
  const loadVenue = useCallback(async (vid: string) => {
    const gen = ++loadGenRef.current;
    const isCancelled = () => gen !== loadGenRef.current;
    loadInFlightRef.current = true;
    try {
      const myCheckin = await getCurrentUserCheckIn().catch(() => null);
      if (isCancelled()) return;
      const here = !!myCheckin && myCheckin.venueId === vid;
      const [presentIds, registeredIds] = await Promise.all([
        getVenuePresentUserIds(vid),
        getVenueRegisteredUserIds(vid),
      ]);
      if (isCancelled()) return;
      const selfExcluded = (ids: string[]) => ids.filter(id => id !== user?.uid);
      const presentOthers = selfExcluded(presentIds);
      // Don't list a registered user twice if they are also physically present.
      const presentSet = new Set(presentOthers);
      const registeredNotPresent = selfExcluded(registeredIds).filter(id => !presentSet.has(id));
      const [present, registered] = await Promise.all([
        fetchProfiles(presentOthers),
        fetchProfiles(registeredNotPresent),
      ]);
      if (isCancelled()) return;
      setLoaded({
        venueId: vid,
        checkedInHere: here,
        presentUsers: present,
        presentIdCount: presentOthers.length,
        registeredUsers: registered,
        registeredIdCount: selfExcluded(registeredIds).length,
        registeredNotPresentCount: registeredNotPresent.length,
        error: false,
      });
    } catch (err) {
      console.error('[VenueDetailScreen] load failed:', err);
      if (!isCancelled()) {
        // Only surface a full-screen error when there is nothing good on screen. A
        // background refresh that fails must not replace an already-rendered page
        // (both grids AND the header) with "שגיאה בטעינת המקום" over data that had
        // loaded perfectly well, with no retry until the next count change.
        setLoaded(prev => (prev && prev.venueId === vid && !prev.error ? prev : {
          venueId: vid, checkedInHere: false,
          presentUsers: [], presentIdCount: 0,
          registeredUsers: [], registeredIdCount: 0, registeredNotPresentCount: 0,
          error: true,
        }));
      }
    } finally {
      if (!isCancelled()) {
        loadInFlightRef.current = false;
        // Run the coalesced follow-up, if any arrived while this load was running.
        if (pendingReloadRef.current && focusedRef.current) {
          pendingReloadRef.current = false;
          lastReloadAtRef.current = Date.now();
          void loadVenue(vid);
        }
      }
    }
  }, [user?.uid]);

  const livePresenceCount = presence && presence.venueId === venueId ? presence.count : null;

  // Load once per focus. livePresenceCount is deliberately NOT a dependency here: the
  // effect's cleanup bumps the generation, so any dep change CANCELS an in-flight load
  // and restarts it. The presence subscription always delivers a first snapshot, so
  // that turned every venue open into two full read sets — and at a busy venue, where
  // the count changes faster than the three-round-trip load completes, every load was
  // cancelled before it could write and the screen span forever.
  const focusedRef = useRef(false);
  // Declared before the focus effect below, whose cleanup clears the pending timer.
  const lastCountRef = useRef<number | null>(null);
  const lastReloadAtRef = useRef(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A load is in flight. A reload must NEVER start while one is running: starting one
  // claims a new generation, which cancels the running load before it can write, so the
  // screen stays on its spinner. Throttling only bounds how often a reload STARTS — it
  // does nothing about overlap. Requests that arrive during a load are coalesced into a
  // single follow-up instead.
  const loadInFlightRef = useRef(false);
  const pendingReloadRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (venueId) void loadVenue(venueId);
      // Abandon any in-flight load on blur / venue change, so it cannot land later and
      // overwrite whatever the next screen loads — and drop a pending throttled reload
      // with it, so nothing is queued up against a screen the user has left.
      return () => {
        focusedRef.current = false;
        loadGenRef.current++;
        if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null; }
        // Reset the coalescing flags too. A load cancelled by this very bump skips its
        // own finally (that body is guarded on still being current), so without this
        // both flags leaked across visits: the next open completed its load and then
        // immediately fired a second, identical fan-out for data it had just fetched.
        loadInFlightRef.current = false;
        pendingReloadRef.current = false;
      };
    }, [venueId, loadVenue]),
  );

  // Presence-driven refresh, kept OUT of the focus effect so it never tears the load
  // down mid-flight. Throttled, because a busy venue emits a count change per check-in
  // and each reload is a multi-query fan-out; the generation guard then ensures only
  // the newest result is written.
  useEffect(() => { lastCountRef.current = null; }, [venueId]);
  useEffect(() => {
    if (livePresenceCount === null || !venueId) return;
    // The FIRST snapshot is what the focus load already reflects — reloading on it is
    // pure waste, and it is guaranteed to arrive on every open.
    if (lastCountRef.current === null) { lastCountRef.current = livePresenceCount; return; }
    if (lastCountRef.current === livePresenceCount) return;
    lastCountRef.current = livePresenceCount;
    if (!focusedRef.current) return;

    const since = Date.now() - lastReloadAtRef.current;
    // Re-check focus when the timer FIRES, not only when it is scheduled: the user can
    // leave during the throttle window, and this effect's deps do not change on blur so
    // its cleanup never runs. Without this a full fan-out executed for a screen nobody
    // was looking at.
    const run = () => {
      reloadTimerRef.current = null;
      if (!focusedRef.current) return;
      // Never pre-empt a running load — coalesce into one follow-up instead.
      if (loadInFlightRef.current) { pendingReloadRef.current = true; return; }
      lastReloadAtRef.current = Date.now();
      void loadVenue(venueId);
    };
    if (since >= PRESENCE_RELOAD_THROTTLE_MS) { run(); return; }
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(run, PRESENCE_RELOAD_THROTTLE_MS - since);
    return () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); };
  }, [venueId, livePresenceCount, loadVenue]);

  const openUser = useCallback((uid: string) => {
    router.push(`/(tabs)/user/${uid}`);
  }, [router]);

  return (
    <ScreenWrapper>
      <Header />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}>
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
            {/* Both grids are visible to every viewer — tapping a person opens their
                profile, where a like can be sent. No check-in required to look. */}
            <Text style={styles.sectionTitle}>מי כאן עכשיו</Text>
            {/* "else" only when the viewer is themselves checked in — the list is
                self-excluded, so telling a person who just marked presence that nobody
                has marked presence here contradicts what they just did. */}
            <UserGrid
              users={presentUsers}
              onPress={openUser}
              emptyText={
                presentIdCount > 0
                  ? 'לא ניתן להציג את הנוכחים כרגע'
                  : checkedInHere
                    ? 'אף אחד אחר לא סימן נוכחות כאן כרגע'
                    : 'אף אחד לא סימן נוכחות כאן כרגע'
              }
            />

            <Text style={styles.sectionTitle}>רשומים לאירועים כאן</Text>
            {/* This grid is registered MINUS already-present, so an empty grid does not
                mean nobody is registered — it can mean every registrant is standing in
                the section above. Saying "nobody is registered" there would contradict
                the list directly overhead. */}
            <UserGrid
              users={registeredUsers}
              onPress={openUser}
              emptyText={
                registeredIdCount === 0
                  ? 'אין רשומים לאירועים כאן'
                  : registeredNotPresentCount === 0
                    ? 'כל הרשומים כבר נמצאים כאן'
                    : 'לא ניתן להציג את הרשומים כרגע'
              }
            />
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const AVATAR = 96;
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
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
