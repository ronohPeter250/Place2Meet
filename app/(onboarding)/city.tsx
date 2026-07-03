import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { TOTAL_STEPS } from '../../src/hooks/useOnboarding';

export default function CityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    if (!city.trim() || !user || loading) return;

    setLoading(true);
    try {
      await updateUserProfile(user.uid, { city: city.trim() });
      router.push('/(onboarding)/gender');
    } catch (err) {
      // Do NOT advance on a failed write — that would produce a "complete"
      // profile with missing data. Keep the user here and let them retry.
      console.error('[CityScreen] city update failed:', err);
      Alert.alert('שגיאה', 'לא ניתן לשמור כרגע. בדוק את החיבור ונסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [city, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={2} total={TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.onboarding.city.title}</Text>
          <Text style={styles.subtitle}>{he.onboarding.city.subtitle}</Text>
        </View>

        <View style={styles.fields}>
          <TextField
            value={city}
            onChangeText={setCity}
            placeholder="עיר"
            maxLength={50}
            autoFocus
          />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={he.onboarding.continue}
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
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
