import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Button } from '../../../src/components/ui/Button';
import { SettingsItem } from '../../../src/components/ui/SettingsItem';
import {
  SettingsEditProfileIcon,
  SettingsContactIcon,
  SettingsTermsIcon,
  SettingsPrivacyIcon,
} from '../../../src/components/ui/SvgIcons';
import { getUserProfile, UserProfile, calculateAge } from '../../../src/services/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import { openWhatsApp } from '../../../src/lib/contact';
import { colors } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserProfile(user.uid);
        if (!cancelled) setProfile(data);
      } catch (err) { console.error('[ProfileScreen] fetch failed:', err); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      he.profile.logout,
      'האם אתה בטוח שברצונך להתנתק?',
      [
        { text: he.common.cancel, style: 'cancel' },
        {
          text: he.profile.logout,
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/welcome');
          },
        },
      ]
    );
  }, [logout, router]);

  const age = useMemo(() => {
    if (!profile?.birthday) return '';
    try { return calculateAge(profile.birthday); } catch { return ''; }
  }, [profile?.birthday]);

  const displayName = profile?.name ? `${profile.name}${age ? `, ${age}` : ''}` : '';

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>{he.profile.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            {profile?.photos?.[0] ? (
              <CachedImage uri={profile.photos[0]} style={styles.avatarImage} priority="high" />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
          </View>
          {displayName ? (
            <Text style={styles.businessName}>{displayName}</Text>
          ) : null}
        </View>

        {/* "האירועים שלי" CTA — Figma 170:1653 */}
        <View style={styles.myEventsContainer}>
          <Button
            title={he.profile.myEvents}
            onPress={() => router.push('/(tabs)/events')}
            variant="primary"
          />
        </View>

        <View style={styles.settingsSection}>
          <SettingsItem icon={<SettingsEditProfileIcon />} label={he.profile.editProfile} onPress={() => router.push('/(tabs)/profile/edit')} />
          <SettingsItem icon={<SettingsContactIcon />} label={he.profile.contactUs} onPress={() => openWhatsApp()} />
          <SettingsItem icon={<SettingsTermsIcon />} label={he.profile.terms} onPress={() => {}} />
          <SettingsItem icon={<SettingsPrivacyIcon />} label={he.profile.privacy} onPress={() => {}} />
        </View>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton} activeOpacity={0.7}>
          <Text style={styles.logoutText}>{he.profile.logout}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 16 },
  title: { fontFamily: 'Rubik_700Bold', fontSize: 22, color: colors.text, textAlign: 'right' },
  scrollContent: { paddingBottom: 120 },
  avatarSection: { alignItems: 'center', paddingTop: 8, paddingBottom: 12, gap: 8 },
  businessName: { fontFamily: 'Rubik_700Bold', fontSize: 18, color: colors.text, textAlign: 'center' },
  avatar: {
    width: 164, height: 164, borderRadius: 82,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: 164, height: 164, borderRadius: 82 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceLight },
  myEventsContainer: { paddingHorizontal: 16, marginTop: 8 },
  settingsSection: { gap: 24, paddingHorizontal: 16, marginTop: 24 },
  logoutButton: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  logoutText: { fontFamily: 'Rubik_500Medium', fontSize: 16, color: colors.error, textDecorationLine: 'underline' as const },
});
