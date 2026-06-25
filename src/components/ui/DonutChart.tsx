import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography } from '../../theme';

interface DonutChartProps {
  size?: number;
  strokeWidth?: number;
  segments: { percent: number; color: string }[];
  centerValue: string | number;
}

export const DonutChart = React.memo(function DonutChart({
  size = 120,
  strokeWidth = 12,
  segments,
  centerValue,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const computedSegments = useMemo(() => {
    let cumulative = 0;
    return segments.map((seg) => {
      const offset = circumference * (1 - cumulative / 100);
      const dashLength = (seg.percent / 100) * circumference;
      cumulative += seg.percent;
      return { ...seg, offset, dashLength };
    });
  }, [segments, circumference]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.surfaceLight}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {computedSegments.map((seg, i) => (
          <Circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            stroke={seg.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
            strokeDashoffset={seg.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </Svg>
      <View style={styles.centerLabel}>
        <Text style={styles.centerValue}>{centerValue}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    ...typography.h1,
    color: colors.text,
  },
});
