import React from 'react';
import { StyleSheet, StatusBar, ViewStyle, View, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import { colors } from '../../theme';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  statusBarStyle?: 'light' | 'dark';
  showBackgroundBlobs?: boolean;
  // Screens that contain their own ScrollView should pass false: the
  // tap-to-dismiss-keyboard TouchableWithoutFeedback otherwise competes with the
  // ScrollView's drag gesture and makes scrolling sticky/hard.
  dismissKeyboardOnTap?: boolean;
}

function Blob({ width, height, color, opacity }: { width: number; height: number; color: string; opacity: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient id="g" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
          <Stop offset="70%" stopColor={color} stopOpacity={opacity * 0.3} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill="url(#g)" />
    </Svg>
  );
}

export const ScreenWrapper = React.memo(function ScreenWrapper({
  children,
  style,
  edges = ['top', 'bottom'],
  statusBarStyle = 'light',
  showBackgroundBlobs = true,
  dismissKeyboardOnTap = true,
}: ScreenWrapperProps) {
  const content = (
    <SafeAreaView style={[styles.container, style]} edges={edges}>
        <StatusBar
          barStyle={statusBarStyle === 'light' ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
          translucent={false}
        />
        {showBackgroundBlobs && (
          <>
            <View style={styles.blobTopRight}>
              <Blob width={400} height={390} color="#FF7043" opacity={0.2} />
            </View>
            <View style={styles.blobBottomRight}>
              <Blob width={360} height={350} color="#FF7043" opacity={0.12} />
            </View>
            <View style={styles.blobBottomLeft}>
              <Blob width={400} height={390} color="#FF7043" opacity={0.12} />
            </View>
            <LinearGradient
              colors={['rgba(255,112,67,0.12)', 'transparent']}
              style={styles.topFade}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(108,54,0,0.8)']}
              locations={[0, 0.55, 1]}
              style={styles.bottomFade}
              pointerEvents="none"
            />
          </>
        )}
        {children}
      </SafeAreaView>
  );

  if (!dismissKeyboardOnTap) return content;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {content}
    </TouchableWithoutFeedback>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  blobTopRight: {
    position: 'absolute',
    top: -190,
    right: -180,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -120,
    right: -150,
  },
  blobBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: -230,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '15%',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
  },
});
