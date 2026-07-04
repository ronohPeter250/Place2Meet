import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { TimeField } from '../../src/components/ui/TimeField';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateBusinessProfile, BusinessHours, DayHours } from '../../src/services/business';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { BUSINESS_TOTAL_STEPS } from '../../src/hooks/useBusinessOnboarding';

const DAYS = [
  { key: 'sunday', label: he.businessOnboarding.days.sunday },
  { key: 'monday', label: he.businessOnboarding.days.monday },
  { key: 'tuesday', label: he.businessOnboarding.days.tuesday },
  { key: 'wednesday', label: he.businessOnboarding.days.wednesday },
  { key: 'thursday', label: he.businessOnboarding.days.thursday },
  { key: 'friday', label: he.businessOnboarding.days.friday },
  { key: 'saturday', label: he.businessOnboarding.days.saturday },
] as const;

function createDefaultHours(): BusinessHours {
  return {
    sunday: { open: '08:00', close: '22:00', closed: false },
    monday: { open: '08:00', close: '22:00', closed: false },
    tuesday: { open: '08:00', close: '22:00', closed: false },
    wednesday: { open: '08:00', close: '22:00', closed: false },
    thursday: { open: '08:00', close: '22:00', closed: false },
    friday: { open: '08:00', close: '22:00', closed: false },
    saturday: { open: '', close: '', closed: true },
  };
}

export default function BusinessHoursScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [hours, setHours] = useState<BusinessHours>(createDefaultHours);
  const [loading, setLoading] = useState(false);

  const updateDay = useCallback(
    (dayKey: keyof BusinessHours, field: keyof DayHours, value: string | boolean) => {
      setHours((prev) => ({
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          [field]: value,
        },
      }));
    },
    [],
  );

  const toggleDay = useCallback(
    (dayKey: keyof BusinessHours, isOpen: boolean) => {
      setHours((prev) => ({
        ...prev,
        [dayKey]: {
          open: isOpen ? '08:00' : '',
          close: isOpen ? '22:00' : '',
          closed: !isOpen,
        },
      }));
    },
    [],
  );

  const handleContinue = useCallback(async () => {
    if (!user || loading) return;

    setLoading(true);
    try {
      await updateBusinessProfile(user.uid, { hours });
      router.push('/(business-onboarding)/photos');
    } catch (err) {
      console.error('[BusinessHoursScreen] hours update failed:', err);
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת שעות הפעילות. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [hours, user, loading, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={6} total={BUSINESS_TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.businessOnboarding.hours.title}</Text>
          <Text style={styles.subtitle}>{he.businessOnboarding.hours.subtitle}</Text>
        </View>

        <ScrollView
          style={styles.daysContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.daysContent}
        >
          {DAYS.map((day) => {
            const dayData = hours[day.key];
            const isOpen = !dayData.closed;
            return (
              <View key={day.key} style={styles.row}>
                <Text style={styles.dayName}>{day.label}</Text>

                <Switch
                  value={isOpen}
                  onValueChange={(val) => toggleDay(day.key, val)}
                  trackColor={{ false: colors.surfaceLight, true: colors.primary }}
                  thumbColor={colors.white}
                  ios_backgroundColor={colors.surfaceLight}
                  style={styles.switch}
                />

                <Text style={styles.statusText}>
                  {isOpen ? he.businessOnboarding.hours.open : he.businessOnboarding.hours.closed}
                </Text>

                {isOpen && (
                  <View style={styles.timesContainer}>
                    <TimeField
                      value={dayData.open}
                      onChange={(val) => updateDay(day.key, 'open', val)}
                      placeholder="08:00"
                    />
                    <Text style={styles.timeDash}>-</Text>
                    <TimeField
                      value={dayData.close}
                      onChange={(val) => updateDay(day.key, 'close', val)}
                      placeholder="22:00"
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
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
  daysContainer: {
    marginTop: 24,
  },
  daysContent: {
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dayName: {
    width: 72,
    textAlign: 'right',
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  statusText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.white,
    width: 36,
    textAlign: 'center',
    marginHorizontal: 2,
  },
  switch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
    marginHorizontal: 2,
  },
  timesContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },
  timeInput: {
    width: 58,
    height: 36,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: borderRadius.sm,
    textAlign: 'center',
    color: colors.text,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  timeDash: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.text,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
