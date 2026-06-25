import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { ChevronLeftIcon } from './SvgIcons';

interface SettingsItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

export const SettingsItem = React.memo(function SettingsItem({
  icon,
  label,
  onPress,
}: SettingsItemProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label} accessibilityRole="button">
      <View style={styles.icon}>{icon}</View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chevron}>
        <ChevronLeftIcon />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  icon: {
    width: 24,
    height: 24,
  },
  chevron: {
    width: 24,
    height: 24,
    transform: [{ scaleY: -1 }],
  },
  label: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
});
