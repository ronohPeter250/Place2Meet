import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { GeoPoint } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Header } from '../../../src/components/layout/Header';
import { Button } from '../../../src/components/ui/Button';
import { TextField } from '../../../src/components/ui/TextField';
import { AddressAutocomplete, SelectedPlace } from '../../../src/components/ui/AddressAutocomplete';
import { PhotoGrid } from '../../../src/components/ui/PhotoGrid';
import { TimeField } from '../../../src/components/ui/TimeField';
import {
  getBusinessProfile,
  updateBusinessProfile,
  BusinessHours,
  DayHours,
} from '../../../src/services/business';
import { uploadBusinessPhoto, getPhotoURL } from '../../../src/services/storage';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

const DAYS = [
  { key: 'sunday', label: he.businessOnboarding.days.sunday },
  { key: 'monday', label: he.businessOnboarding.days.monday },
  { key: 'tuesday', label: he.businessOnboarding.days.tuesday },
  { key: 'wednesday', label: he.businessOnboarding.days.wednesday },
  { key: 'thursday', label: he.businessOnboarding.days.thursday },
  { key: 'friday', label: he.businessOnboarding.days.friday },
  { key: 'saturday', label: he.businessOnboarding.days.saturday },
] as const;

function defaultHours(): BusinessHours {
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

export default function EditBusinessProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [photos, setPhotos] = useState<string[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [originalLocation, setOriginalLocation] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [about, setAbout] = useState('');
  const [hours, setHours] = useState<BusinessHours>(defaultHours);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getBusinessProfile(user.uid);
        if (!cancelled && data) {
          setPhotos(data.photos ?? []);
          setBusinessName(data.businessName ?? '');
          setEmail(data.email ?? '');
          setLocation(data.location ?? '');
          setOriginalLocation(data.location ?? '');
          setAbout(data.about ?? '');
          setHours(data.hours ?? defaultHours());
        }
      } catch (err) {
        console.error('[EditBusinessProfile] load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleLocationChange = useCallback((text: string) => {
    setLocation(text);
    if (selectedPlace && text !== selectedPlace.address) {
      setSelectedPlace(null);
    }
  }, [selectedPlace]);

  const handlePlaceSelected = useCallback((place: SelectedPlace) => {
    setSelectedPlace(place);
    setLocation(place.address);
  }, []);

  const updateDay = useCallback(
    (dayKey: keyof BusinessHours, field: keyof DayHours, value: string | boolean) => {
      setHours(prev => ({
        ...prev,
        [dayKey]: { ...prev[dayKey], [field]: value },
      }));
    },
    []
  );

  const toggleDay = useCallback((dayKey: keyof BusinessHours, isOpen: boolean) => {
    setHours(prev => ({
      ...prev,
      [dayKey]: {
        open: isOpen ? '08:00' : '',
        close: isOpen ? '22:00' : '',
        closed: !isOpen,
      },
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!user || saving) return;

    const trimmedName = businessName.trim();
    const trimmedLocation = location.trim();
    if (!trimmedName) {
      Alert.alert('שגיאה', 'יש להזין שם עסק.');
      return;
    }
    if (!trimmedLocation) {
      Alert.alert('שגיאה', 'יש להזין כתובת עסק.');
      return;
    }

    setSaving(true);
    try {
      // Upload new local photos, keep existing URLs
      const storagePaths = await Promise.all(
        photos.map(async (uri, index) => {
          if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://')) {
            return uploadBusinessPhoto(user.uid, uri, index);
          }
          return uri;
        })
      );
      const downloadUrls = await Promise.all(
        storagePaths.map(p => (p.startsWith('http') ? p : getPhotoURL(p)))
      );

      const addressChanged = trimmedLocation !== originalLocation;
      if (addressChanged && !selectedPlace) {
        Alert.alert(
          'בחר כתובת מהרשימה',
          'שינית את הכתובת — בחר את הכתובת החדשה מההצעות כדי לוודא שהיא קיימת על המפה.'
        );
        setSaving(false);
        return;
      }

      const updates: Parameters<typeof updateBusinessProfile>[1] = {
        businessName: trimmedName,
        email: email.trim(),
        location: trimmedLocation,
        about: about.trim(),
        hours,
        photos: downloadUrls,
      };

      if (addressChanged && selectedPlace) {
        updates.coordinates = new GeoPoint(selectedPlace.latitude, selectedPlace.longitude);
      }

      await updateBusinessProfile(user.uid, updates);
      Alert.alert('נשמר', 'הפרופיל עודכן בהצלחה.');
      router.back();
    } catch (err) {
      console.error('[EditBusinessProfile] save failed:', err);
      Alert.alert('שגיאה', 'לא ניתן לשמור. נסה שוב.');
    } finally {
      setSaving(false);
    }
  }, [user, saving, businessName, email, location, originalLocation, selectedPlace, about, hours, photos, router]);

  return (
    <ScreenWrapper dismissKeyboardOnTap={false}>
      <Header />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        <Text style={styles.screenTitle}>{he.profile.editProfile}</Text>

        {/* Photos */}
        <Text style={styles.sectionTitle}>תמונות</Text>
        <View style={styles.photosContainer}>
          <PhotoGrid photos={photos} onPhotosChange={setPhotos} />
        </View>

        {/* Business Name */}
        <Text style={styles.sectionTitle}>שם העסק</Text>
        <TextField
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={he.businessOnboarding.businessName.placeholder}
          maxLength={100}
        />

        {/* Email */}
        <Text style={styles.sectionTitle}>אימייל</Text>
        <TextField
          value={email}
          onChangeText={setEmail}
          placeholder={he.businessOnboarding.email.placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          maxLength={100}
        />

        {/* Address */}
        <Text style={styles.sectionTitle}>כתובת</Text>
        <AddressAutocomplete
          value={location}
          onChangeText={handleLocationChange}
          onPlaceSelected={handlePlaceSelected}
          placeholder={he.businessOnboarding.location.placeholder}
        />

        {/* About */}
        <Text style={styles.sectionTitle}>אודות העסק</Text>
        <TextInput
          style={styles.aboutInput}
          value={about}
          onChangeText={setAbout}
          placeholder="ספר על העסק שלך..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
          textAlignVertical="top"
          textAlign="right"
          selectionColor={colors.primary}
        />

        {/* Hours */}
        <Text style={styles.sectionTitle}>שעות פעילות</Text>
        <View style={styles.hoursContainer}>
          {DAYS.map(day => {
            const dayData = hours[day.key];
            const isOpen = !dayData?.closed;
            return (
              <View key={day.key} style={styles.hoursRow}>
                <Text style={styles.dayName}>{day.label}</Text>
                <Switch
                  value={isOpen}
                  onValueChange={val => toggleDay(day.key, val)}
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
                      value={dayData?.open ?? ''}
                      onChange={val => updateDay(day.key, 'open', val)}
                      placeholder="08:00"
                    />
                    <Text style={styles.timeDash}>-</Text>
                    <TimeField
                      value={dayData?.close ?? ''}
                      onChange={val => updateDay(day.key, 'close', val)}
                      placeholder="22:00"
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Save */}
        <Button
          title={he.common.save}
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  screenTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'right',
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 24,
    marginBottom: 12,
  },
  photosContainer: {
    marginBottom: 8,
  },
  aboutInput: {
    width: '100%',
    height: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    ...typography.body,
    color: colors.text,
  },
  hoursContainer: {
    gap: 4,
  },
  hoursRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 8,
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
  saveButton: {
    marginTop: 32,
  },
});
