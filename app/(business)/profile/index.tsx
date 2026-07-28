import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { SettingsItem } from '../../../src/components/ui/SettingsItem';
import {
  SettingsEditProfileIcon,
  SettingsAboutIcon,
  SettingsTermsIcon,
  SettingsPrivacyIcon,
  SettingsWhatsappIcon,
} from '../../../src/components/ui/SvgIcons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { db } from '../../../src/config/firebase';
import { openWhatsApp } from '../../../src/lib/contact';
import { colors } from '../../../src/theme';
import { he } from '../../../src/i18n/he';
import { useTabBarClearance } from '../../../src/hooks/useTabBarClearance';

export default function BusinessProfileScreen() {
  // Clear the floating tab bar using the running device's bottom inset — the
  // literal 120 this replaces was only correct when that inset was 0.
  const tabBarClearance = useTabBarClearance(20);
  const router = useRouter();
  const { user, logout } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const bizDoc = await getDoc(doc(db, 'businesses', user.uid));
        if (bizDoc.exists() && !cancelled) {
          const data = bizDoc.data();
          setBusinessName(data?.name ?? data?.businessName ?? '');
          setProfilePhoto(data?.logo ?? data?.photos?.[0] ?? null);
        }
      } catch (err) { console.error('[BusinessProfileScreen] fetch failed:', err); }
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

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>{he.profile.businessTitle}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tabBarClearance }}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            {profilePhoto ? (
              <CachedImage uri={profilePhoto} style={styles.avatarImage} priority="high" />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
          </View>
          {businessName ? (
            <Text style={styles.businessName}>{businessName}</Text>
          ) : null}
        </View>

        <View style={styles.settingsSection}>
          <SettingsItem icon={<SettingsEditProfileIcon />} label={he.profile.editProfile} onPress={() => router.push('/(business)/profile/edit')} />
          <SettingsItem icon={<SettingsAboutIcon />} label={he.profile.aboutUs} onPress={() => {}} />
          <SettingsItem icon={<SettingsTermsIcon />} label={he.profile.terms} onPress={() => {}} />
          <SettingsItem icon={<SettingsPrivacyIcon />} label={he.profile.privacy} onPress={() => {}} />
          <SettingsItem icon={<SettingsWhatsappIcon />} label={he.profile.whatsapp} onPress={() => openWhatsApp()} />
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
  settingsSection: { gap: 24, paddingHorizontal: 16, marginTop: 16 },
  logoutButton: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  logoutText: { fontFamily: 'Rubik_500Medium', fontSize: 16, color: colors.error, textDecorationLine: 'underline' as const },
});
