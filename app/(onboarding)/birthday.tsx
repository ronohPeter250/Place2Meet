import { useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateUserProfile, completeProfile, calculateAge } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { TOTAL_STEPS } from '../../src/hooks/useOnboarding';

export default function BirthdayScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const handleDayChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 2);
    setDay(cleaned);
    setError('');
    if (cleaned.length === 2) monthRef.current?.focus();
  }, []);

  const handleMonthChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 2);
    setMonth(cleaned);
    setError('');
    if (cleaned.length === 2) yearRef.current?.focus();
  }, []);

  const handleYearChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4);
    setYear(cleaned);
    setError('');
  }, []);

  const isComplete = day.length === 2 && month.length === 2 && year.length === 4;

  const handleContinue = useCallback(async () => {
    if (!isComplete || !user || loading) return;

    const dayN = parseInt(day, 10);
    const monthN = parseInt(month, 10);
    const yearN = parseInt(year, 10);

    // Semantic date validation
    if (monthN < 1 || monthN > 12 || dayN < 1 || yearN < 1900) {
      setError('תאריך לידה לא תקין');
      return;
    }
    const dateCheck = new Date(yearN, monthN - 1, dayN);
    if (dateCheck.getFullYear() !== yearN || dateCheck.getMonth() !== monthN - 1 || dateCheck.getDate() !== dayN) {
      setError('תאריך לידה לא תקין');
      return;
    }

    const birthday = `${yearN}-${String(monthN).padStart(2, '0')}-${String(dayN).padStart(2, '0')}`;

    // Validate age synchronously before starting async work
    try {
      calculateAge(birthday);
    } catch (err: unknown) {
      const message = (err as Error).message;
      if (message === 'Must be 18 or older') {
        setError(he.onboarding.birthday.underAge);
      } else {
        setError('תאריך לידה לא תקין');
      }
      return;
    }

    setLoading(true);
    try {
      await updateUserProfile(user.uid, { birthday });
      await completeProfile(user.uid);
      await refreshProfile();
      router.replace('/');
    } catch {
      setError('שגיאה בלתי צפויה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [day, month, year, isComplete, user, loading, refreshProfile, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={8} total={TOTAL_STEPS} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Header />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{he.onboarding.birthday.title}</Text>
            <Text style={styles.subtitle}>{he.onboarding.birthday.subtitle}</Text>
          </View>

          {/* Date fields - 71x47 each from Figma, RTL order: day, month, year */}
          <View style={styles.dateContainer}>
            <View style={styles.dateFields}>
              <View style={[styles.dateField, styles.yearField, error ? styles.dateFieldError : null]}>
                <TextInput
                  ref={yearRef}
                  style={styles.dateInput}
                  value={year}
                  onChangeText={handleYearChange}
                  placeholder="YYYY"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  textAlign="center"
                />
              </View>

              <View style={[styles.dateField, error ? styles.dateFieldError : null]}>
                <TextInput
                  ref={monthRef}
                  style={styles.dateInput}
                  value={month}
                  onChangeText={handleMonthChange}
                  placeholder="MM"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                />
              </View>

              <View style={[styles.dateField, error ? styles.dateFieldError : null]}>
                <TextInput
                  style={styles.dateInput}
                  value={day}
                  onChangeText={handleDayChange}
                  placeholder="DD"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                  textAlign="center"
                  autoFocus
                />
              </View>
            </View>

            {error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}
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
  dateContainer: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  dateFields: {
    flexDirection: 'row-reverse',
    gap: 16,
  },
  dateField: {
    width: 71,
    height: 47,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateFieldError: {
    borderColor: colors.error,
  },
  yearField: {
    width: 71,
  },
  dateInput: {
    ...typography.body,
    color: colors.text,
    width: '100%',
    height: '100%',
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    textAlign: 'right',
    marginTop: 16,
    width: '100%',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
