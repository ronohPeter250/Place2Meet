import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme';

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar = React.memo(function ProgressBar({ current, total }: ProgressBarProps) {
  const progressWidth = useMemo(
    () => `${(total > 0 ? (current / total) * 100 : 0)}%` as `${number}%`,
    [current, total]
  );

  return (
    <View style={styles.container}>
      <View style={styles.track} />
      <LinearGradient
        colors={[colors.primary, colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fill, { width: progressWidth }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 9,
    marginHorizontal: 16,
    marginTop: 16,
    position: 'relative',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 9,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4.5,
  },
  fill: {
    position: 'absolute',
    right: 0,
    height: 9,
    borderRadius: 4.5,
  },
});
