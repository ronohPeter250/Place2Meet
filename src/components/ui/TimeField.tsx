import React, { useState, useCallback } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, borderRadius } from '../../theme';

interface TimeFieldProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  placeholder?: string;
}

function parseTime(value: string): Date {
  const d = new Date();
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (match) {
    d.setHours(Math.min(23, Number(match[1])), Math.min(59, Number(match[2])), 0, 0);
  } else {
    d.setHours(8, 0, 0, 0);
  }
  return d;
}

function formatTime(date: Date): string {
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// A tappable time field that opens a native spinner ("alarm clock" wheel) time
// picker instead of requiring the user to type HH:MM.
export const TimeField = React.memo(function TimeField({
  value,
  onChange,
  placeholder = '08:00',
}: TimeFieldProps) {
  const [show, setShow] = useState(false);
  const [temp, setTemp] = useState<Date>(() => parseTime(value));

  const open = useCallback(() => {
    setTemp(parseTime(value));
    setShow(true);
  }, [value]);

  // Android: the picker is a dialog; "set" confirms, anything else cancels.
  const handleAndroidChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      setShow(false);
      if (event.type === 'set' && date) onChange(formatTime(date));
    },
    [onChange],
  );

  // iOS: the spinner stays inline in a sheet until the user taps אישור.
  const handleIosChange = useCallback((_event: DateTimePickerEvent, date?: Date) => {
    if (date) setTemp(date);
  }, []);

  const confirmIos = useCallback(() => {
    onChange(formatTime(temp));
    setShow(false);
  }, [onChange, temp]);

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={open} activeOpacity={0.7}>
        <Text style={[styles.text, !value && styles.placeholder]}>{value || placeholder}</Text>
      </TouchableOpacity>

      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={temp}
          mode="time"
          is24Hour
          display="spinner"
          onChange={handleAndroidChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <TouchableOpacity style={styles.iosOverlay} activeOpacity={1} onPress={() => setShow(false)}>
            <TouchableOpacity style={styles.iosSheet} activeOpacity={1} onPress={() => {}}>
              <DateTimePicker
                value={temp}
                mode="time"
                is24Hour
                display="spinner"
                themeVariant="dark"
                onChange={handleIosChange}
              />
              <TouchableOpacity style={styles.iosDone} onPress={confirmIos} activeOpacity={0.7}>
                <Text style={styles.iosDoneText}>אישור</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  field: {
    width: 58,
    height: 36,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.text,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  placeholder: {
    color: colors.textMuted,
  },
  iosOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  iosSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
  iosDone: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginTop: 8,
  },
  iosDoneText: {
    color: colors.white,
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
  },
});
