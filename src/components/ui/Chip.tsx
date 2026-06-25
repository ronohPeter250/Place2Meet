import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { colors, borderRadius } from '../../theme';
import { GenderMaleIcon, GenderFemaleIcon, GenderOtherIcon } from './SvgIcons';

const genderIconComponents: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  male: GenderMaleIcon,
  female: GenderFemaleIcon,
  'male-female': GenderOtherIcon,
};

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  size?: 'normal' | 'large';
}

export const Chip = React.memo(function Chip({
  label,
  selected,
  onPress,
  size = 'normal',
}: ChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        size === 'large' && styles.containerLarge,
        selected && styles.selected,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

interface GenderChipProps {
  label: string;
  icon: 'male' | 'female' | 'male-female';
  selected: boolean;
  onPress: () => void;
}

export const GenderChip = React.memo(function GenderChip({
  label,
  icon,
  selected,
  onPress,
}: GenderChipProps) {
  const IconComponent = genderIconComponents[icon];

  return (
    <TouchableOpacity
      style={[styles.genderContainer, selected && styles.genderSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.genderIconCircle}>
        {IconComponent && <IconComponent size={40} color={selected ? colors.primary : colors.text} />}
      </View>
      <Text style={[styles.genderLabel, selected && styles.genderLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerLarge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  selected: {
    borderColor: colors.primary,
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
  },
  labelSelected: {
    color: colors.primary,
  },
  genderContainer: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  genderSelected: {
    borderColor: colors.primary,
  },
  genderIconCircle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'center',
  },
  genderLabelSelected: {
    color: colors.primary,
  },
});
