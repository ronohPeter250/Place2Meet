import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { Header } from '../../../src/components/layout/Header';
import { Chip } from '../../../src/components/ui/Chip';
import { LocationPinIcon } from '../../../src/components/ui/SvgIcons';
import { getUserProfile, UserProfile, calculateAge } from '../../../src/services/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PHOTO_HEIGHT = SCREEN_HEIGHT * 0.5;

export default function ViewProfileScreen() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserProfile(user.uid);
        if (!cancelled) setProfile(data);
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const age = profile?.birthday
    ? (() => { try { return calculateAge(profile.birthday); } catch { return ''; } })()
    : '';

  return (
    <ScreenWrapper>
      <Header />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile photo */}
        <View style={styles.photoSection}>
          {profile?.photos?.[0] ? (
            <CachedImage uri={profile.photos[0]} style={styles.heroPhoto} priority="high" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceLight }} />
            </View>
          )}
        </View>

        {/* Name and location */}
        <View style={styles.infoSection}>
          <Text style={styles.name}>
            {profile?.name ?? ''}{age ? `, ${age}` : ''}
          </Text>
          {profile?.city && (
            <View style={styles.cityRow}>
              <LocationPinIcon size={14} color={colors.textSecondary} />
              <Text style={styles.city}>{profile.city}</Text>
            </View>
          )}
        </View>

        {/* About */}
        {profile?.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{he.swipes.about}</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {/* Relationship type chips */}
        {profile?.relationshipType && profile.relationshipType.length > 0 && (
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
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 120,
  },
  photoSection: {
    width: '100%',
  },
  heroPhoto: {
    width: '100%',
    height: PHOTO_HEIGHT,
  },
  photoPlaceholder: {
    width: '100%',
    height: PHOTO_HEIGHT,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  name: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'right',
  },
  cityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  city: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: 8,
  },
  bioText: {
    ...typography.body,
    color: colors.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
});
