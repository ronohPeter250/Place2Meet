import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateBusinessProfile } from '../../src/services/business';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { BUSINESS_TOTAL_STEPS } from '../../src/hooks/useBusinessOnboarding';

export default function BusinessNameScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    if (!businessName.trim() || !user || loading) return;

    setLoading(true);
    try {
      await updateBusinessProfile(user.uid, { businessName: businessName.trim() });
      router.push('/(business-onboarding)/email');
    } catch {
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת הפרופיל. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [businessName, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={2} total={BUSINESS_TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.businessOnboarding.businessName.title}</Text>
          <Text style={styles.subtitle}>{he.businessOnboarding.businessName.subtitle}</Text>
        </View>

        <View style={styles.fields}>
          <TextField
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={he.businessOnboarding.businessName.placeholder}
            maxLength={100}
            autoFocus
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
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
