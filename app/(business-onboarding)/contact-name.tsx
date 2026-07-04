import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { createBusinessProfile } from '../../src/services/business';
import { useAuth } from '../../src/contexts/AuthContext';
import { signOut } from '../../src/services/auth';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { BUSINESS_TOTAL_STEPS } from '../../src/hooks/useBusinessOnboarding';

export default function ContactNameScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    if (!firstName.trim() || !user || loading) return;

    setLoading(true);
    try {
      const fullName = lastName.trim()
        ? `${firstName.trim()} ${lastName.trim()}`
        : firstName.trim();
      await createBusinessProfile(user.uid, { contactName: fullName });
      router.push('/(business-onboarding)/business-name');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // Only a harmless double-create (already-exists) should advance; a real
      // permission-denied means the profile was NOT saved, so keep the user here
      // to retry rather than advancing into steps that will all fail.
      if (code === 'already-exists') {
        router.push('/(business-onboarding)/business-name');
      } else {
        Alert.alert('שגיאה', 'אירעה שגיאה בשמירת הפרופיל. נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  }, [firstName, lastName, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={1} total={BUSINESS_TOTAL_STEPS} />

      <Header onBack={async () => {
        // No client-side draft cleanup: businesses deletes are forbidden by the
        // rules, so an abandoned draft (profileComplete=false) simply persists —
        // it's hidden from the map/events and merged on the next onboarding. (A
        // swallowed deleteDoc here only misled readers into thinking it was cleaned.)
        await signOut();
        router.replace('/(auth)/welcome');
      }} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.businessOnboarding.contactName.title}</Text>
          <Text style={styles.subtitle}>{he.businessOnboarding.contactName.subtitle}</Text>
        </View>

        <View style={styles.fields}>
          <TextField
            value={firstName}
            onChangeText={setFirstName}
            placeholder="שם פרטי"
            maxLength={50}
            autoFocus
          />
          <TextField
            value={lastName}
            onChangeText={setLastName}
            placeholder="שם משפחה"
            maxLength={50}
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={he.businessOnboarding.continue}
          onPress={handleContinue}
          loading={loading}
          disabled={loading}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    marginTop: 32,
    width: '100%',
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    lineHeight: 21,
  },
  fields: {
    marginTop: 32,
    gap: 16,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
