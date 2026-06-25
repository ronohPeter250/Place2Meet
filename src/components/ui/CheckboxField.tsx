import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { colors, typography, borderRadius } from '../../theme';

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onPress: () => void;
}

export const CheckboxField = React.memo(function CheckboxField({
  label,
  checked,
  onPress,
}: CheckboxFieldProps) {
  return (
    <TouchableOpacity
      style={[styles.container, checked && styles.containerChecked]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
    >
      {/* Radio-style circle (from Figma) */}
      <View style={[styles.radio, checked && styles.radioChecked]}>
        {checked && <View style={styles.radioInner} />}
      </View>
      <Text style={[styles.label, checked && styles.labelChecked]}>{label}</Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 48,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: colors.background,
  },
  containerChecked: {
    borderColor: colors.primary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radioChecked: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  label: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  labelChecked: {
    color: colors.primary,
  },
});
