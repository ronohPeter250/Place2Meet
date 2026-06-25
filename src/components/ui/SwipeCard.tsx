import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { LocationPinIcon } from './SvgIcons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';
import { UserProfile } from '../../services/users';
import { colors, typography, borderRadius } from '../../theme';
import { he } from '../../i18n/he';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.78;

interface SwipeCardProps {
  user: UserProfile;
  translateX: SharedValue<number>;
  isTop: boolean;
}

export const SwipeCard = React.memo(function SwipeCard({
  user,
  translateX,
  isTop,
}: SwipeCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (!isTop) return {};

    const rotate = interpolate(translateX.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15]);
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SCREEN_WIDTH],
      [1, 0.95]
    );

    return {
      transform: [
        { translateX: translateX.value },
        { rotate: `${rotate}deg` },
        { scale },
      ],
    };
  });

  const likeOpacity = useAnimatedStyle(() => {
    if (!isTop) return { opacity: 0 };
    return {
      opacity: interpolate(translateX.value, [0, SCREEN_WIDTH / 4], [0, 1]),
    };
  });

  const dislikeOpacity = useAnimatedStyle(() => {
    if (!isTop) return { opacity: 0 };
    return {
      opacity: interpolate(translateX.value, [-SCREEN_WIDTH / 4, 0], [1, 0]),
    };
  });

  const age = useMemo(() => {
    if (!user.birthday) return '';
    const birthDate = new Date(user.birthday);
    const today = new Date();
    let a = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) a--;
    return a;
  }, [user.birthday]);

  return (
    <Animated.View style={[styles.card, isTop ? animatedStyle : styles.backCard]}>
      {/* Photo */}
      <View style={styles.photoContainer}>
        {user.photos && user.photos.length > 0 ? (
          <Image source={{ uri: user.photos[0] }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder} />
        )}
      </View>

      {/* Gradient overlay from ~60% transparent to black */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', '#000000']}
        locations={[0.6, 1]}
        style={styles.gradientOverlay}
      />

      {/* Photo pagination dots (vertical, right side) */}
      <View style={styles.dotsContainer}>
        {(user.photos ?? []).map((_, i) => (
          <View key={i} style={[styles.dot, i === 0 ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>

      {/* Like/Dislike overlays */}
      <Animated.View style={[styles.likeOverlay, likeOpacity]}>
        <Text style={styles.overlayText}>{he.swipes.like}</Text>
      </Animated.View>
      <Animated.View style={[styles.dislikeOverlay, dislikeOpacity]}>
        <Text style={styles.overlayText}>{he.swipes.dislike}</Text>
      </Animated.View>

      {/* Bottom info */}
      <View style={styles.info}>
        <Text style={styles.nameText}>
          {user.name}{age ? `, ${age}` : ''}
        </Text>
        {user.city && (
          <View style={styles.cityRow}>
            <LocationPinIcon size={14} color={colors.white} />
            <Text style={styles.cityText}>{user.city}</Text>
          </View>
        )}
        {user.bio ? <Text style={styles.bioText} numberOfLines={3}>{user.bio}</Text> : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    elevation: 8,
    shadowColor: '#1E1C1B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  backCard: {
    transform: [{ scale: 0.95 }],
  },
  photoContainer: {
    flex: 1,
  },
  photo: {
    flex: 1,
    width: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
    borderRadius: 20,
  },
  dotsContainer: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -50,
    gap: 8,
  },
  dot: {
    width: 4,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: colors.white,
  },
  dotActive: {
    height: 33,
    backgroundColor: colors.primary,
  },
  dotInactive: {
    height: 33,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    borderWidth: 3,
    borderColor: colors.success,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    transform: [{ rotate: '-15deg' }],
  },
  dislikeOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
    borderWidth: 3,
    borderColor: colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    transform: [{ rotate: '15deg' }],
  },
  overlayText: {
    fontSize: 24,
    fontFamily: 'Rubik_700Bold',
    color: colors.white,
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  nameText: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 22,
    color: colors.white,
    textAlign: 'right',
  },
  cityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 0,
    marginTop: 2,
  },
  cityText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: colors.white,
    textAlign: 'right',
  },
  bioText: {
    ...typography.caption,
    color: colors.white,
    textAlign: 'right',
    marginTop: 8,
  },
});
