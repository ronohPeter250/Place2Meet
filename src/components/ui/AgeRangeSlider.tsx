import React, { useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent, I18nManager, DimensionValue } from 'react-native';
import { colors, typography } from '../../theme';

interface AgeRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export const AgeRangeSlider = React.memo(function AgeRangeSlider({
  min,
  max,
  value,
  onChange,
}: AgeRangeSliderProps) {
  const [low, high] = value;
  const range = max - min;
  const trackLayout = useRef({ x: 0, width: 0 });
  const isRTL = I18nManager.isRTL;

  // Use refs to avoid stale closures in PanResponder
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const posToValue = useCallback((pageX: number): number => {
    const { x, width } = trackLayout.current;
    if (width === 0) return min;
    let ratio = (pageX - x) / width;
    if (isRTL) ratio = 1 - ratio;
    return Math.round(Math.min(max, Math.max(min, min + ratio * range)));
  }, [min, max, range, isRTL]);

  const lowResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const newLow = posToValue(evt.nativeEvent.pageX);
        const [, currentHigh] = valueRef.current;
        if (newLow < currentHigh) onChangeRef.current([newLow, currentHigh]);
      },
    })
  ).current;

  const highResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt) => {
        const newHigh = posToValue(evt.nativeEvent.pageX);
        const [currentLow] = valueRef.current;
        if (newHigh > currentLow) onChangeRef.current([currentLow, newHigh]);
      },
    })
  ).current;

  const lowPercent = ((low - min) / range) * 100;
  const highPercent = ((high - min) / range) * 100;

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    e.target.measure((_x, _y, width, _h, pageX) => {
      trackLayout.current = { x: pageX, width };
    });
  }, []);

  const fillStart = `${isRTL ? 100 - highPercent : lowPercent}%` as DimensionValue;
  const fillEnd = `${isRTL ? lowPercent : 100 - highPercent}%` as DimensionValue;
  const lowPos = `${isRTL ? 100 - lowPercent : lowPercent}%` as DimensionValue;
  const highPos = `${isRTL ? 100 - highPercent : highPercent}%` as DimensionValue;

  return (
    <View style={styles.container}>
      <View style={styles.track} onLayout={onTrackLayout}>
        <View style={[styles.fill, { left: fillStart, right: fillEnd }]} />
        <View style={[styles.thumb, { left: lowPos }]} {...lowResponder.panHandlers} />
        <View style={[styles.thumb, { left: highPos }]} {...highResponder.panHandlers} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  label: {
    ...typography.body,
    color: colors.text,
  },
  separator: {
    ...typography.body,
    color: colors.textSecondary,
  },
  track: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    position: 'relative',
    marginHorizontal: 8,
  },
  fill: {
    position: 'absolute',
    top: 0,
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
    marginRight: -12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});
