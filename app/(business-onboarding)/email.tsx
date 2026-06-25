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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !user || loading) return;

    if (!EMAIL_REGEX.test(trimmed)) {
      Alert.alert('שגיאה', 'כתובת אימייל לא תקינה');
      return;
    }

    setLoading(true);
    try {
      await updateBusinessProfile(user.uid, { email: trimmed });
      router.push('/(business-onboarding)/location');
    } catch {
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת האימייל. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [email, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={3} total={BUSINESS_TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.businessOnboarding.email.title}</Text>
          <Text style={styles.subtitle}>{he.businessOnboarding.email.subtitle}</Text>
        </View>

        <View style={styles.fields}>
          <TextField
            value={email}
            onChangeText={setEmail}
            placeholder={he.businessOnboarding.email.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
            autoFocus
            maxLength={200}
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
