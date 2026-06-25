import { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { CheckboxField } from '../../src/components/ui/CheckboxField';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { TOTAL_STEPS, RelationshipType } from '../../src/hooks/useOnboarding';

// Figma order: קשר רציני, קשר ארוך, ערב אחד
const OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'serious', label: he.onboarding.relationshipType.serious },
  { value: 'longTerm', label: he.onboarding.relationshipType.longTerm },
  { value: 'casual', label: he.onboarding.relationshipType.casual },
];

export default function RelationshipTypeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [selected, setSelected] = useState<RelationshipType[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleOption = useCallback((value: RelationshipType) => {
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
      await updateUserProfile(user.uid, { relationshipType: selected });
    } catch (err) {
      console.error('[RelationshipTypeScreen] relationship type update failed:', err);
    }
    setLoading(false);
    router.push('/(onboarding)/about');
  }, [selected, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={5} total={TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.onboarding.relationshipType.title}</Text>
          <Text style={styles.subtitle}>{he.onboarding.relationshipType.subtitle}</Text>
        </View>

        {/* Checkbox fields - 343x48 each, 17px gap (from Figma: y=0, y=65, y=130) */}
        <View style={styles.fields}>
          {OPTIONS.map((option) => (
            <CheckboxField
              key={option.value}
              label={option.label}
              checked={selected.includes(option.value)}
              onPress={() => toggleOption(option.value)}
            />
          ))}
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
    marginTop: 40,
    gap: 17,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
