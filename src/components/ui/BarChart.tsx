import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { colors } from '../../theme';

interface BarChartDataPoint {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  data: BarChartDataPoint[];
  width: number;
  height?: number;
  barRadius?: number;
  showValues?: boolean;
}

export const BarChart = React.memo(function BarChart({
  data,
  width,
  height = 180,
  barRadius = 6,
  showValues = true,
}: BarChartProps) {
  const maxValue = useMemo(
    () => Math.max(...data.map(d => d.value), 1),
    [data],
  );

  const padding = { top: 20, bottom: 0, left: 8, right: 8 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barSpacing = data.length > 0 ? chartWidth / data.length : chartWidth;
  const barWidth = Math.min(Math.round(barSpacing * 0.55), 36);

  return (
    <View>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + chartHeight * (1 - ratio);
          return (
            <Line
              key={`grid-${i}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={colors.border}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          );
        })}
        {/* Bars */}
        {data.map((item, i) => {
          const barH =
            maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
          const x =
            padding.left + barSpacing * i + (barSpacing - barWidth) / 2;
          const y = padding.top + chartHeight - barH;
          return (
            <Rect
              key={`bar-${i}`}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barH, 2)}
              fill={item.color}
              rx={barRadius}
              ry={barRadius}
            />
          );
        })}
      </Svg>
      {/* Labels row */}
      <View style={styles.labelsRow}>
        {data.map((item, i) => (
          <View
            key={`lbl-${i}`}
            style={[styles.labelContainer, { width: barSpacing }]}
          >
            {showValues && (
              <Text style={styles.barValue}>{item.value}</Text>
            )}
            <Text style={styles.barLabel} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  labelsRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  labelContainer: {
    alignItems: 'center',
    gap: 2,
  },
  barLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 10,
    color: '#A7A7A7',
    textAlign: 'center',
  },
  barValue: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 11,
    color: colors.white,
    textAlign: 'center',
  },
});
