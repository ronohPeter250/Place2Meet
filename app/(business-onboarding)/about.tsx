import { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateBusinessProfile } from '../../src/services/business';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { BUSINESS_TOTAL_STEPS } from '../../src/hooks/useBusinessOnboarding';

const MAX_BIO_LENGTH = 1000;

export default function BusinessAboutScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);

  const handleContinue = useCallback(async () => {
    if (!user || loading) return;

    setLoading(true);
    try {
      await updateBusinessProfile(user.uid, { about: bio.trim() });
      router.push('/(business-onboarding)/hours');
    } catch (err) {
      console.error('[BusinessAboutScreen] about update failed:', err);
    } finally {
      setLoading(false);
    }
  }, [bio, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={5} total={BUSINESS_TOTAL_STEPS} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <Header />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{he.businessOnboarding.about.title}</Text>
          </View>

          {/* Bio textarea - 343x140 from Figma */}
          <View style={styles.textareaContainer}>
            <TextInput
              style={styles.textarea}
              value={bio}
              onChangeText={setBio}
              placeholder={he.businessOnboarding.about.placeholder}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_BIO_LENGTH}
              textAlignVertical="top"
              textAlign="right"
              selectionColor={colors.primary}
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
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  },
  textareaContainer: {
    marginTop: 32,
  },
  textarea: {
    width: '100%',
    height: 140,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    padding: 13,
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
