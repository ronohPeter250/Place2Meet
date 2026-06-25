import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, TouchableOpacity, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDoc, collection, serverTimestamp, Timestamp, doc, getDoc } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Header } from '../../../src/components/layout/Header';
import { Button } from '../../../src/components/ui/Button';
import { TextField } from '../../../src/components/ui/TextField';
import { db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { updateEvent } from '../../../src/services/events';
import { colors, typography, spacing, borderRadius } from '../../../src/theme';

const HEBREW_DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];

export default function NewEventScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const isEditMode = !!eventId;
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('30');
  const [eventDate, setEventDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venuePhoto, setVenuePhoto] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset pickers on screen entry (Expo Router may reuse the component)
  useEffect(() => {
    setShowDatePicker(false);
    setShowTimePicker(false);
  }, [eventId]);

  // Load business info (always) + event data (edit mode)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const bizDoc = await getDoc(doc(db, 'businesses', user.uid));
        if (bizDoc.exists() && !cancelled) {
          const data = bizDoc.data();
          setVenueName(data?.businessName ?? data?.name ?? '');
          setVenueAddress(data?.location ?? data?.address ?? '');
          if (data?.photos?.length > 0) {
            setVenuePhoto(data.photos[0]);
          }
        }
        // Edit mode — load existing event data
        if (eventId && !cancelled) {
          const eventDoc = await getDoc(doc(db, 'events', eventId));
          if (eventDoc.exists() && !cancelled) {
            const ev = eventDoc.data();
            setTitle(ev.title ?? '');
            setOriginalTitle(ev.title ?? '');
            setDescription(ev.description ?? '');
            setCapacity(String(ev.capacity ?? 30));
            if (ev.dateTime?.toDate) setEventDate(ev.dateTime.toDate());
            if (ev.venuePhoto) setVenuePhoto(ev.venuePhoto);
          }
        }
      } catch (err) {
        console.error('[NewEventScreen] fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user, eventId]);

  const handleDateChange = useCallback((_: unknown, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) {
      setEventDate(prev => {
        const newDate = new Date(prev);
        newDate.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        return newDate;
      });
    }
  }, []);

  const handleTimeChange = useCallback((_: unknown, selected?: Date) => {
    setShowTimePicker(false);
    if (selected) {
      setEventDate(prev => {
        const newDate = new Date(prev);
        newDate.setHours(selected.getHours(), selected.getMinutes());
        return newDate;
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !user || saving) return;

    const cap = parseInt(capacity, 10);
    if (!cap || cap < 1 || cap > 1000) {
      Alert.alert('שגיאה', 'מספר מקומות חייב להיות בין 1 ל-1000');
      return;
    }

    if (!isEditMode && eventDate <= new Date()) {
      Alert.alert('שגיאה', 'תאריך האירוע חייב להיות בעתיד');
      return;
    }

    setSaving(true);
    try {
      if (isEditMode && eventId) {
        await updateEvent(eventId, {
          title: title.trim(),
          description: description.trim(),
          venueName,
          venueAddress,
          venuePhoto,
          dateTime: Timestamp.fromDate(eventDate),
          capacity: cap,
        });
        Alert.alert('', 'האירוע עודכן בהצלחה');
      } else {
        await addDoc(collection(db, 'events'), {
          title: title.trim(),
          description: description.trim(),
          venueId: user.uid,
          venueName,
          venueAddress,
          venuePhoto,
          dateTime: Timestamp.fromDate(eventDate),
          capacity: cap,
          attendeeCount: 0,
          attendeeCounts: { male: 0, female: 0, other: 0 },
          attendeeIds: [],
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
        Alert.alert('', 'האירוע נוצר בהצלחה');
      }
      router.navigate('/(business)/events');
    } catch {
      Alert.alert('שגיאה', isEditMode ? 'לא ניתן לעדכן אירוע. נסה שוב.' : 'לא ניתן ליצור אירוע. נסה שוב.');
    } finally {
      setSaving(false);
    }
  }, [title, description, capacity, venueName, venueAddress, venuePhoto, eventDate, user, saving, router, isEditMode, eventId]);

  const formatDateDisplay = (date: Date): string => {
    const dayName = HEBREW_DAYS[date.getDay()];
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString().slice(2);
    return `${dayName}, ${d}.${m}.${y}`;
  };

  const formatTimeDisplay = (date: Date): string => {
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${min}`;
  };

  return (
    <ScreenWrapper>
      <Header onBack={() => router.navigate('/(business)/events')} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.screenTitle, !isEditMode && { marginBottom: 16 }]}>{isEditMode ? 'עריכת אירוע' : 'אירוע חדש'}</Text>
        {isEditMode && originalTitle ? <Text style={styles.editEventName}>{originalTitle}</Text> : null}



        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder="שם האירוע"
          maxLength={100}
        />

        <View style={styles.dateTimeRow}>
          <TouchableOpacity style={styles.timeButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.fieldText}>{formatTimeDisplay(eventDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.fieldText}>{formatDateDisplay(eventDate)}</Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={eventDate}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={handleDateChange}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={eventDate}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        )}

        <TextField
          value={capacity}
          onChangeText={setCapacity}
          placeholder="מקומות"
          keyboardType="number-pad"
          maxLength={4}
        />

        <View style={styles.textareaContainer}>
          <TextInput
            style={styles.textarea}
            value={description}
            onChangeText={setDescription}
            placeholder="תיאור האירוע"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
            textAlign="right"
            selectionColor={colors.primary}
          />
        </View>

        {venuePhoto ? (
          <Image source={{ uri: venuePhoto }} style={styles.venueImage} />
        ) : null}

        <Button
          title={isEditMode ? 'עדכון אירוע' : 'יצירת אירוע'}
          onPress={handleSave}
          loading={saving}
          disabled={!title.trim() || saving}
          style={styles.createButton}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 16,
  },
  screenTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 28,
    color: colors.text,
    textAlign: 'right',
    marginTop: 32,
    marginBottom: 4,
  },
  editEventName: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'right',
    lineHeight: 21,
    marginBottom: 8,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateButton: {
    flex: 1,
    height: 48,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  timeButton: {
    width: 90,
    height: 48,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  fieldButton: {
    height: 48,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  fieldText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  textareaContainer: {
    width: '100%',
  },
  textarea: {
    width: '100%',
    height: 140,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 16,
    paddingTop: 13,
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  venueImage: {
    width: '100%',
    height: 214,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.white,
  },
  createButton: {
    marginTop: 8,
  },
});
