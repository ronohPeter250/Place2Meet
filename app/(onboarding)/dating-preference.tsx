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

export default function DatingPreferenceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Gender[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleGender = useCallback((value: Gender) => {
    setSelected(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  }, []);

  const handleContinue = useCallback(async () => {
    if (selected.length === 0 || !user || loading) return;

    setLoading(true);
    try {
      await updateUserProfile(user.uid, { datingPreference: selected });
    } catch (err) {
      console.error('[DatingPreferenceScreen] preference update failed:', err);
    }
    setLoading(false);
    router.push('/(onboarding)/relationship-type');
  }, [selected, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={4} total={TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.onboarding.datingPreference.title}</Text>
          <Text style={styles.subtitle}>{he.onboarding.datingPreference.subtitle}</Text>
        </View>
      </View>

      <View style={styles.gendersContainer}>
        {GENDERS.map((g) => (
          <GenderChip
            key={g.value}
            label={g.label}
            icon={g.icon}
            selected={selected.includes(g.value)}
            onPress={() => toggleGender(g.value)}
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
    gap: 22,
    marginTop: 40,
    paddingHorizontal: 15,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
