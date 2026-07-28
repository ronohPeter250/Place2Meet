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
import { checkOut } from '../../../src/services/checkin';

// Sign-out must never wait longer than this on the courtesy check-out.
const CHECKOUT_ON_LOGOUT_TIMEOUT_MS = 3000;
import { debugError } from '../../../src/utils/debugLog';
import { useAuth } from '../../../src/contexts/AuthContext';
import { openWhatsApp } from '../../../src/lib/contact';
import { colors } from '../../../src/theme';
import { he } from '../../../src/i18n/he';
import { useTabBarClearance } from '../../../src/hooks/useTabBarClearance';

export default function ProfileScreen() {
  // Clear the floating tab bar using the running device's bottom inset — the
  // literal 120 this replaces was only correct when that inset was 0.
  const tabBarClearance = useTabBarClearance(20);
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
            // Leave the venue BEFORE dropping the session. Presence is otherwise only
            // cleared by its 4-hour expiry, so signing out left the user showing as
            // "here now" at a venue they had left — visible to everyone there.
            // The write needs the still-valid session, so it has to happen first.
            //
            // BOUNDED, and a try/catch is not enough for that: offline, the Firestore
            // SDK queues the write locally and its promise NEVER SETTLES (it waits for
            // a server ack), so awaiting it would hang sign-out forever with no
            // feedback — catch only handles a rejection, not a promise that never
            // resolves. Racing a timer keeps sign-out working with no connection; the
            // queued delete still flushes when the device reconnects, and the 4-hour
            // expiry remains the backstop if it never does.
            try {
              await Promise.race([
                checkOut(),
                new Promise<void>(resolve => setTimeout(resolve, CHECKOUT_ON_LOGOUT_TIMEOUT_MS)),
              ]);
            } catch (err) {
              debugError('AUTH', 'check-out on logout', err);
            }
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

      <ScrollView contentContainerStyle={{ paddingBottom: tabBarClearance }}>
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
