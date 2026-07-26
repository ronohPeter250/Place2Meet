import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { Header } from '../../../src/components/layout/Header';
import { Chip } from '../../../src/components/ui/Chip';
import { Button } from '../../../src/components/ui/Button';
import { LocationPinIcon } from '../../../src/components/ui/SvgIcons';
import { getUserProfile, UserProfile, calculateAge } from '../../../src/services/users';
import { createSwipe } from '../../../src/services/swipes';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.5;

// View ANY user's profile (reached from a venue's present/registered list) and
// "like" them. Chatting is match-first: a like only opens a chat if it is mutual,
// otherwise it is recorded and the peer is notified on their side when they like back.
export default function ViewUserScreen() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  // This screen is a bottom-TAB route (app/(tabs)/_layout.tsx registers it as a
  // Tabs.Screen with href:null), and expo-router downgrades push() to NAVIGATE for a
  // non-stack target — so opening a second person REUSES this instance and only
  // swaps params; it is never remounted. Keying the loaded data to the userId it
  // belongs to therefore matters: a param change invalidates it in the SAME render,
  // so the previous person can never be on screen under the new one's route (which
  // would let a like be sent to someone other than the face being displayed).
  const [loaded, setLoaded] = useState<{ userId: string; profile: UserProfile | null; error: boolean } | null>(null);
  // Which people have a like in flight — a LIST, not a single id, for the same reason
  // as `loaded`: on this reused instance a plain flag would carry over to the next
  // profile and leave that person's button stuck disabled. A single slot is not enough
  // either: liking A then B then returning to A would show A's button enabled while A's
  // request is still running, letting the same like be submitted twice.
  const [likingFor, setLikingFor] = useState<readonly string[]>([]);

  const current = loaded && loaded.userId === userId ? loaded : null;
  const loading = current === null;
  const profile = current?.profile ?? null;
  const loadError = current?.error ?? false;
  const liking = !!userId && likingFor.includes(userId);

  const isSelf = !!user && !!userId && user.uid === userId;

  // For the same reason, a `mountedRef` here would be permanently true and guard
  // nothing. What actually matters for a late-resolving like is whether the user is
  // still looking at this screen AND still on the same person.
  const focusedRef = useRef(true);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // A failed load is otherwise terminal on this never-remounting screen: `userId` does
  // not change when the user backs out and re-opens the SAME profile, so the effect
  // below never re-runs and the "try again" message can never be acted on. Bumping this
  // on re-entry (only when the stored state for this user is an error) makes it retry.
  const [retryEpoch, setRetryEpoch] = useState(0);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    const l = loadedRef.current;
    if (l && l.userId === userId && l.error) setRetryEpoch(e => e + 1);
    return () => { focusedRef.current = false; };
  }, [userId]));

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserProfile(userId);
        if (!cancelled) setLoaded({ userId, profile: data, error: false });
      } catch (err) {
        console.error('[ViewUserScreen] load failed:', err);
        if (!cancelled) setLoaded({ userId, profile: null, error: true });
      }
    })();
    return () => { cancelled = true; };
  }, [userId, retryEpoch]);

  const handleLike = useCallback(async () => {
    if (!user || !userId || isSelf || liking) return;
    const target = userId;  // the person this like is for, fixed at press time
    // Still on this screen, still on the same person? Used to decide whether to SHOW
    // something. It deliberately gates only UI (alerts/navigation) — never the writes
    // themselves: leaving the screen mid-round-trip must not abandon a match halfway,
    // which would record the mutual like with no chat to go with it and leave both
    // users unable to reach each other.
    const stillHere = () => focusedRef.current && userIdRef.current === target;
    setLikingFor(prev => (prev.includes(target) ? prev : [...prev, target]));
    try {
      const isMatch = await createSwipe(target, 'like');
      if (isMatch) {
        // Mutual like — create the chat REGARDLESS of where the user has navigated to,
        // then only offer to jump into it if they are still here to see the offer.
        const { createChatForMatch } = await import('../../../src/services/chat');
        let chatId: string | null = null;
        try {
          chatId = await createChatForMatch(user.uid, target);
        } catch (err) {
          console.error('[ViewUserScreen] chat creation failed:', err);
        }
        if (!stillHere()) return;
        Alert.alert('יש התאמה! 🎉', 'אתם יכולים להתחיל לשוחח.', [
          chatId
            ? { text: 'לצ\'אט', onPress: () => router.replace(`/(tabs)/chat/${chatId}`) }
            : { text: 'לצ\'אטים', onPress: () => router.replace('/(tabs)/chat') },
        ]);
      } else {
        if (!stillHere()) return;
        Alert.alert('שלחת לייק ❤️', 'אם גם הוא יסמן לך לייק — זו התאמה ותוכלו לשוחח.', [
          { text: 'הבנתי', onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('[ViewUserScreen] like failed:', err);
      if (stillHere()) Alert.alert('שגיאה', 'לא ניתן לשלוח לייק כרגע. נסה שוב.');
    } finally {
      setLikingFor(prev => prev.filter(id => id !== target));
    }
  }, [user, userId, isSelf, liking, router]);

  const age = profile?.birthday
    ? (() => { try { return calculateAge(profile.birthday); } catch { return ''; } })()
    : '';

  return (
    <ScreenWrapper>
      <Header />
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : loadError ? (
        <View style={styles.center}><Text style={styles.emptyText}>שגיאה בטעינת הפרופיל. בדוק את החיבור ונסה שוב.</Text></View>
      ) : !profile ? (
        <View style={styles.center}><Text style={styles.emptyText}>הפרופיל לא נמצא</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.photoSection}>
            {profile.photos?.[0] ? (
              <CachedImage uri={profile.photos[0]} style={styles.heroPhoto} priority="high" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceLight }} />
              </View>
            )}
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.name}>{profile.name ?? ''}{age ? `, ${age}` : ''}</Text>
            {!!profile.city && (
              <View style={styles.cityRow}>
                <LocationPinIcon size={14} color={colors.textSecondary} />
                <Text style={styles.city}>{profile.city}</Text>
              </View>
            )}
          </View>

          {!!profile.bio && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{he.swipes.about}</Text>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          )}

          {profile.relationshipType && profile.relationshipType.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{he.profile.relationshipLooking}</Text>
              <View style={styles.chipsRow}>
                {profile.relationshipType.map(type => (
                  <Chip
                    key={type}
                    label={
                      type === 'serious' ? he.onboarding.relationshipType.serious :
                      type === 'casual' ? he.onboarding.relationshipType.casual :
                      he.onboarding.relationshipType.longTerm
                    }
                    selected
                    onPress={() => {}}
                  />
                ))}
              </View>
            </View>
          )}

          {!isSelf && (
            <View style={styles.likeContainer}>
              <Button title="שלח לייק ❤️" onPress={handleLike} loading={liking} disabled={liking} />
            </View>
          )}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary },
  scrollContent: { paddingBottom: 120 },
  photoSection: { width: '100%' },
  heroPhoto: { width: '100%', height: PHOTO_HEIGHT },
  photoPlaceholder: { width: '100%', height: PHOTO_HEIGHT, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  infoSection: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  name: { ...typography.h2, color: colors.text, textAlign: 'right' },
  cityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  city: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { ...typography.captionBold, color: colors.textSecondary, textAlign: 'right', marginBottom: 8 },
  bioText: { ...typography.body, color: colors.text, textAlign: 'right', lineHeight: 22 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  likeContainer: { paddingHorizontal: 16, paddingTop: 32 },
});
