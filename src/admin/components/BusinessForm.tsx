import { useMemo, useState } from 'react';
import { GeoPoint } from 'firebase/firestore';
import { StyleSheet, Text, View } from 'react-native';
import { BusinessHours, BusinessProfile, DayHours } from '../../services/business';
import { AccountStatus } from '../types';
import { saveBusinessForAdmin } from '../services';
import { colors } from '../../theme';
import { adminErrorMessage } from '../utils';
import { AdminButton, AdminCard, AdminSelect, AdminTextInput } from './AdminControls';
import { BusinessAddressPicker } from './BusinessAddressPicker';

const statusOptions: { label: string; value: AccountStatus }[] = [
  { label: 'פעיל', value: 'active' },
  { label: 'מושהה', value: 'suspended' },
  { label: 'חסום', value: 'blocked' },
  { label: 'מחוק', value: 'deleted' },
];

const profileOptions = [
  { label: 'מלא', value: 'true' },
  { label: 'טיוטה', value: 'false' },
];

const dayLabels: { key: keyof BusinessHours; label: string }[] = [
  { key: 'sunday', label: 'ראשון' },
  { key: 'monday', label: 'שני' },
  { key: 'tuesday', label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday', label: 'חמישי' },
  { key: 'friday', label: 'שישי' },
  { key: 'saturday', label: 'שבת' },
];

function defaultDay(): DayHours {
  return { open: '09:00', close: '18:00', closed: false };
}

function defaultHours(): BusinessHours {
  return {
    sunday: defaultDay(),
    monday: defaultDay(),
    tuesday: defaultDay(),
    wednesday: defaultDay(),
    thursday: defaultDay(),
    friday: defaultDay(),
    saturday: defaultDay(),
  };
}

export function BusinessForm({ initialBusiness, onSaved }: { initialBusiness?: BusinessProfile | null; onSaved: (businessId: string) => void }) {
  const initialHours = useMemo(() => initialBusiness?.hours ?? defaultHours(), [initialBusiness]);
  const [businessName, setBusinessName] = useState(initialBusiness?.businessName ?? '');
  const [contactName, setContactName] = useState(initialBusiness?.contactName ?? '');
  const [email, setEmail] = useState(initialBusiness?.email ?? '');
  const [category, setCategory] = useState(initialBusiness?.category ?? '');
  const [about, setAbout] = useState(initialBusiness?.about ?? '');
  const [profileComplete, setProfileComplete] = useState(initialBusiness?.profileComplete ?? true);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>(initialBusiness?.accountStatus ?? 'active');
  const [photosText, setPhotosText] = useState((initialBusiness?.photos ?? []).join('\n'));
  const [location, setLocation] = useState(initialBusiness?.location ?? '');
  const [coordinates, setCoordinates] = useState<GeoPoint | undefined>(initialBusiness?.coordinates);
  const [hours, setHours] = useState<BusinessHours>(initialHours);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDay = (key: keyof BusinessHours, patch: Partial<DayHours>) => {
    setHours(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const setAddressText = (next: string) => {
    setLocation(next);
    if (next !== initialBusiness?.location) setCoordinates(undefined);
  };

  const handleSave = async () => {
    if (!coordinates) {
      setError('יש לבחור כתובת מתוצאות Google');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const businessId = await saveBusinessForAdmin({
        uid: initialBusiness?.uid,
        businessName,
        contactName,
        email,
        category,
        about,
        profileComplete,
        accountStatus,
        location,
        coordinates,
        hours,
        photos: photosText.split('\n').map(photo => photo.trim()).filter(Boolean),
      });
      onSaved(businessId);
    } catch (err) {
      setError(adminErrorMessage(err, 'Failed to save business'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AdminCard title="פרטי עסק">
        <View style={styles.grid}>
          <AdminTextInput label="שם העסק" value={businessName} onChangeText={setBusinessName} />
          <AdminTextInput label="איש קשר" value={contactName} onChangeText={setContactName} />
          <AdminTextInput label="אימייל" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <AdminTextInput label="קטגוריה" value={category} onChangeText={setCategory} />
        </View>
        <BusinessAddressPicker
          value={location}
          onChangeText={setAddressText}
          onSelect={(address) => {
            setLocation(address.formattedAddress);
            setCoordinates(address.coordinates);
          }}
        />
        <AdminTextInput label="תיאור" value={about} onChangeText={setAbout} multiline style={styles.multiline} />
        <AdminSelect label="סטטוס חשבון" value={accountStatus} options={statusOptions} onChange={setAccountStatus} />
        <AdminSelect label="פרופיל" value={String(profileComplete)} options={profileOptions} onChange={value => setProfileComplete(value === 'true')} />
      </AdminCard>

      <AdminCard title="שעות פתיחה">
        {dayLabels.map(day => (
          <View key={day.key} style={styles.dayRow}>
            <Text style={styles.dayLabel}>{day.label}</Text>
            <AdminTextInput label="פתיחה" value={hours[day.key].open} onChangeText={open => updateDay(day.key, { open })} />
            <AdminTextInput label="סגירה" value={hours[day.key].close} onChangeText={close => updateDay(day.key, { close })} />
            <AdminSelect
              label="מצב"
              value={hours[day.key].closed ? 'closed' : 'open'}
              options={[{ label: 'פתוח', value: 'open' }, { label: 'סגור', value: 'closed' }]}
              onChange={value => updateDay(day.key, { closed: value === 'closed' })}
            />
          </View>
        ))}
      </AdminCard>

      <AdminCard title="תמונות">
        <AdminTextInput label="כתובות תמונות, שורה לכל תמונה" value={photosText} onChangeText={setPhotosText} multiline style={styles.photos} />
      </AdminCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <AdminButton title={saving ? 'שומר...' : 'שמור עסק'} onPress={handleSave} disabled={saving || !coordinates} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  dayRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 12,
  },
  dayLabel: {
    color: colors.text,
    fontWeight: '800',
    minWidth: 70,
    textAlign: 'right',
  },
  photos: {
    minHeight: 130,
    textAlignVertical: 'top',
  },
  error: {
    color: colors.errorLight,
    textAlign: 'right',
  },
  actions: {
    alignSelf: 'flex-start',
    minWidth: 180,
  },
});
