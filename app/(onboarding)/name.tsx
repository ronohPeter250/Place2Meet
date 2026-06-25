import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { createUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { signOut } from '../../src/services/auth';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { TOTAL_STEPS } from '../../src/hooks/useOnboarding';

export default function NameScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    if (!name.trim() || !user || loading) return;

    setLoading(true);
    try {
      const fullName = surname.trim()
        ? `${name.trim()} ${surname.trim()}`
        : name.trim();
      await createUserProfile(user.uid, { name: fullName });
      router.push('/(onboarding)/city');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'already-exists' || code === 'permission-denied') {
        // Profile already exists (merge:true should handle this), continue
        router.push('/(onboarding)/city');
      } else {
        Alert.alert('שגיאה', 'אירעה שגיאה בשמירת הפרופיל. נסה שוב.');
      }
    } finally {
      setLoading(false);
    }
  }, [name, surname, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={1} total={TOTAL_STEPS} />

      <Header onBack={async () => { await signOut(); router.replace('/(auth)/welcome'); }} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.onboarding.name.title}</Text>
          <Text style={styles.subtitle}>{he.onboarding.name.subtitle}</Text>
        </View>

        <View style={styles.fields}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder="שם פרטי"
            maxLength={50}
            autoFocus
          />
          <TextField
            value={surname}
            onChangeText={setSurname}
            placeholder="שם משפחה"
            maxLength={50}
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
    gap: 16,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
