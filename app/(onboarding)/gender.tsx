import { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { GenderChip } from '../../src/components/ui/Chip';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { TOTAL_STEPS, Gender } from '../../src/hooks/useOnboarding';

const GENDERS: { value: Gender; label: string; icon: 'male' | 'female' | 'male-female' }[] = [
  { value: 'male', label: he.onboarding.gender.male, icon: 'male' },
  { value: 'female', label: he.onboarding.gender.female, icon: 'female' },
  { value: 'other', label: he.onboarding.gender.other, icon: 'male-female' },
];

export default function GenderScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [gender, setGender] = useState<Gender | null>(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    if (!gender || !user || loading) return;

    setLoading(true);
    try {
      await updateUserProfile(user.uid, { gender });
    } catch (err) {
      console.error('[GenderScreen] gender update failed:', err);
    }
    setLoading(false);
    router.push('/(onboarding)/dating-preference');
  }, [gender, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={3} total={TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.onboarding.gender.title}</Text>
          <Text style={styles.subtitle}>{he.onboarding.gender.subtitle}</Text>
        </View>
      </View>

      {/* Gender chips - positioned at y=295 from screen top per Figma */}
      <View style={styles.gendersContainer}>
        {GENDERS.map((g) => (
          <GenderChip
            key={g.value}
            label={g.label}
            icon={g.icon}
            selected={gender === g.value}
            onPress={() => setGender(g.value)}
          />
        ))}
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
  gendersContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 12,
    marginTop: 40,
    paddingHorizontal: 16,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
