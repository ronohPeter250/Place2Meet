import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { GeoPoint } from 'firebase/firestore';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { AddressAutocomplete, SelectedPlace } from '../../src/components/ui/AddressAutocomplete';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { updateBusinessProfile } from '../../src/services/business';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { BUSINESS_TOTAL_STEPS } from '../../src/hooks/useBusinessOnboarding';

export default function LocationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [address, setAddress] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAddressChange = useCallback((text: string) => {
    setAddress(text);
    // If user edits text after selecting, invalidate the selection so they must reselect
    if (selectedPlace && text !== selectedPlace.address) {
      setSelectedPlace(null);
    }
  }, [selectedPlace]);

  const handlePlaceSelected = useCallback((place: SelectedPlace) => {
    setSelectedPlace(place);
    setAddress(place.address);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!user || loading) return;
    if (!selectedPlace) {
      Alert.alert(
        'בחר כתובת',
        'יש לבחור כתובת מהרשימה כדי לוודא שהיא קיימת על המפה.'
      );
      return;
    }

    setLoading(true);
    try {
      await updateBusinessProfile(user.uid, {
        location: selectedPlace.address,
        coordinates: new GeoPoint(selectedPlace.latitude, selectedPlace.longitude),
      });
      router.push('/(business-onboarding)/about');
    } catch (err) {
      console.error('[LocationScreen] location update failed:', err);
      Alert.alert('שגיאה', 'אירעה שגיאה בשמירת המיקום. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [user, loading, selectedPlace, router]);

  return (
    <ScreenWrapper>
      <ProgressBar current={4} total={BUSINESS_TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.businessOnboarding.location.title}</Text>
          <Text style={styles.subtitle}>{he.businessOnboarding.location.subtitle}</Text>
        </View>

        <View style={styles.fields}>
          <AddressAutocomplete
            value={address}
            onChangeText={handleAddressChange}
            onPlaceSelected={handlePlaceSelected}
            placeholder={he.businessOnboarding.location.placeholder}
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
