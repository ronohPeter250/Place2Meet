import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [liking, setLiking] = useState(false);

  const isSelf = !!user && !!userId && user.uid === userId;

  // Guards against a late-resolving like firing an Alert / navigating after the
  // user already left this pushed screen (header/hardware back during the round-trip).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserProfile(userId);
        if (!cancelled) { setProfile(data); setLoadError(false); }
      } catch (err) {
        console.error('[ViewUserScreen] load failed:', err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleLike = useCallback(async () => {
    if (!user || !userId || isSelf || liking) return;
    setLiking(true);
    try {
      const isMatch = await createSwipe(userId, 'like');
      if (!mountedRef.current) return;  // user left mid-like — don't alert/navigate.
      if (isMatch) {
        // Mutual like — open (or create) the chat and jump into it.
        const { createChatForMatch } = await import('../../../src/services/chat');
        if (!mountedRef.current) return;
        try {
          const chatId = await createChatForMatch(user.uid, userId);
          if (!mountedRef.current) return;
          Alert.alert('יש התאמה! 🎉', 'אתם יכולים להתחיל לשוחח.', [
            { text: 'לצ\'אט', onPress: () => router.replace(`/(tabs)/chat/${chatId}`) },
          ]);
        } catch {
          if (!mountedRef.current) return;
          Alert.alert('יש התאמה! 🎉', 'אתם יכולים להתחיל לשוחח.', [
            { text: 'לצ\'אטים', onPress: () => router.replace('/(tabs)/chat') },
          ]);
        }
      } else {
        Alert.alert('שלחת לייק ❤️', 'אם גם הוא יסמן לך לייק — זו התאמה ותוכלו לשוחח.', [
          { text: 'הבנתי', onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('[ViewUserScreen] like failed:', err);
      if (mountedRef.current) Alert.alert('שגיאה', 'לא ניתן לשלוח לייק כרגע. נסה שוב.');
    } finally {
      if (mountedRef.current) setLiking(false);
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
