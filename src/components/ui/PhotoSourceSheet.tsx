import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import type { PhotoSource } from '../../lib/imagePick';

interface PhotoSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: PhotoSource) => void;
}

const OPTIONS: { source: PhotoSource; label: string }[] = [
  { source: 'camera', label: 'צלם תמונה' },
  { source: 'selfie', label: 'צלם סלפי' },
  { source: 'gallery', label: 'בחר מהגלריה' },
];

export const PhotoSourceSheet = React.memo(function PhotoSourceSheet({
  visible,
  onClose,
  onSelect,
}: PhotoSourceSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tap outside the sheet to dismiss */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {/* Absorb taps inside the sheet so they don't bubble up and dismiss it */}
        <TouchableOpacity style={[styles.container, { paddingBottom: insets.bottom + 24 }]} activeOpacity={1} onPress={() => {}}>
          <View style={styles.handleBar} />
          <Text style={styles.title}>הוספת תמונה</Text>
          {OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.source}
              style={styles.option}
              onPress={() => onSelect(opt.source)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelOption} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>ביטול</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
    alignItems: 'center',
  },
  handleBar: {
    width: 37,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border,
  },
  title: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  option: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
  },
  cancelOption: {
    width: '100%',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.textSecondary,
  },
});
