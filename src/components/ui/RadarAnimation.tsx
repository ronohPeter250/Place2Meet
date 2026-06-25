import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { colors } from '../../theme';

const RADAR_EASING = Easing.out(Easing.ease);

interface RadarAnimationProps {
  size?: number;
}

const PulsingRing = React.memo(function PulsingRing({ delay, size }: { delay: number; size: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 3000, easing: RADAR_EASING }),
        -1,
        false
      )
    );
    return () => {
      cancelAnimation(progress);
    };
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [0.3, 1]);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [0.6, 0.3, 0]);
    return { transform: [{ scale }], opacity };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors.primary,
        },
        animatedStyle,
      ]}
    />
  );
});

export const RadarAnimation = React.memo(function RadarAnimation({ size = 285 }: RadarAnimationProps) {
  const ringStyles = useMemo(() => ({
    full: [styles.ring, { width: size, height: size, borderRadius: size / 2 }],
    medium: [styles.ring, { width: size * 0.75, height: size * 0.75, borderRadius: (size * 0.75) / 2 }],
    small: [styles.ring, { width: size * 0.5, height: size * 0.5, borderRadius: (size * 0.5) / 2 }],
  }), [size]);

  const containerStyle = useMemo(
    () => [styles.container, { width: size, height: size }],
    [size]
  );

  const glowSize = size * 1.6;

  return (
    <View style={containerStyle}>
      {/* Orange radial glow behind radar */}
      <View style={[styles.glow, { width: glowSize, height: glowSize }]}>
        <Svg width={glowSize} height={glowSize} viewBox={`0 0 ${glowSize} ${glowSize}`}>
          <Defs>
            <RadialGradient id="radarGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#6C3600" stopOpacity={0.5} />
              <Stop offset="50%" stopColor="#6C3600" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#6C3600" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={glowSize / 2} cy={glowSize / 2} rx={glowSize / 2} ry={glowSize / 2} fill="url(#radarGlow)" />
        </Svg>
      </View>
      <View style={ringStyles.full} />
      <View style={ringStyles.medium} />
      <View style={ringStyles.small} />
      <PulsingRing delay={0} size={size} />
      <PulsingRing delay={1000} size={size} />
      <PulsingRing delay={2000} size={size} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.primarySubtle,
    borderStyle: 'dashed',
  },
  glow: {
    position: 'absolute',
  },
});
