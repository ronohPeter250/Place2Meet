import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from './CachedImage';
import { UserProfile } from '../../services/users';
import { HeartBadgeIcon, HeartFloat1Icon, HeartFloat2Icon, HeartFloat3Icon } from './SvgIcons';
import ConfettiSvg from '../../../assets/images/match_confetti.svg';
import { colors, typography } from '../../theme';
import { he } from '../../i18n/he';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const S = SCREEN_WIDTH / 375; // Scale factor from Figma 375px base

interface MatchModalProps {
  visible: boolean;
  matchedUser: UserProfile | null;
  currentUserPhoto?: string;
  onSendMessage: () => void;
  onKeepSwiping: () => void;
}

export const MatchModal = React.memo(function MatchModal({
  visible,
  matchedUser,
  currentUserPhoto,
  onSendMessage,
  onKeepSwiping,
}: MatchModalProps) {
  const matchAge = useMemo(() => {
    if (!matchedUser?.birthday) return '';
    const bd = new Date(matchedUser.birthday);
    // Guard an unparseable birthday (legacy/corrupt data) — otherwise `a` is NaN
    // and the modal renders ", NaN" after the name. Mirrors ageFromBirthday.
    if (isNaN(bd.getTime())) return '';
    const today = new Date();
    let a = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) a--;
    return Number.isFinite(a) && a >= 0 ? `, ${a}` : '';
  }, [matchedUser?.birthday]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onKeepSwiping}>
      {!matchedUser ? null : (
      <LinearGradient
        colors={['#FFAD93', colors.primary]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.overlay}
      >
        {/* Gold confetti/sparkle overlay */}
        <View style={styles.confetti} pointerEvents="none">
          <ConfettiSvg width="100%" height="100%" preserveAspectRatio="none" />
        </View>

        {/* Floating decorative hearts */}
        <View style={styles.heartFloat1}>
          <HeartFloat1Icon size={58} />
        </View>
        <View style={styles.heartFloat2}>
          <HeartFloat2Icon size={42} />
        </View>
        <View style={styles.heartFloat3}>
          <HeartFloat3Icon size={54} />
        </View>

        {/* MATCH! titles - staircase diagonal layout per Figma */}
        <View style={[styles.matchTitleWrap, { left: SCREEN_WIDTH / 2 - 135.5 * S, top: 95 * S }]}>
          <Text style={styles.matchTitle}>{he.swipes.match}</Text>
        </View>
        <View style={[styles.matchTitleWrap, { left: SCREEN_WIDTH / 2 - 97.5 * S, top: 143 * S }]}>
          <Text style={styles.matchTitle2}>{he.swipes.match}</Text>
        </View>
        <View style={[styles.matchTitleWrap, { left: SCREEN_WIDTH / 2 - 43.5 * S, top: 188 * S }]}>
          <Text style={styles.matchTitle3}>{he.swipes.match}</Text>
        </View>

        {/* Content block positioned at top: 223 per Figma */}
        <View style={styles.contentBlock}>
          {/* Overlapping photos */}
          <View style={styles.photosContainer}>
            {/* Left photo (current user) - borderRadius 8 */}
            <View style={styles.photoLeft}>
              {currentUserPhoto ? (
                <CachedImage uri={currentUserPhoto} style={styles.photoFill} />
              ) : (
                <View style={styles.photoPlaceholder} />
              )}
            </View>

            {/* Heart badge at overlap - Figma asset */}
            <View style={styles.heartBadge}>
              <HeartBadgeIcon size={58} />
            </View>

            {/* Right photo (matched user) - borderRadius 20, offset down */}
            <View style={styles.photoRight}>
              {matchedUser.photos?.[0] ? (
                <CachedImage uri={matchedUser.photos[0]} style={styles.photoFill} />
              ) : (
                <View style={styles.photoPlaceholder} />
              )}
            </View>
          </View>

          {/* Match info */}
          <View style={styles.textBlock}>
            <Text style={styles.matchName}>{matchedUser.name}{matchAge}</Text>
            <Text style={styles.matchMessage}>
              {he.swipes.matchMessage} {matchedUser.name}.{'\n'}
              {he.swipes.matchSubtext}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.btnOutline} onPress={onKeepSwiping} activeOpacity={0.8}>
            <Text style={styles.btnOutlineText}>{he.swipes.keepSwiping}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={onSendMessage} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>{he.swipes.sendMessage}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
      )}
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
  },
  confetti: {
    position: 'absolute',
    top: '-9.48%',
    left: '-8.1%',
    right: 0,
    bottom: '59.36%',
  },
  heartFloat1: {
    position: 'absolute',
    right: SCREEN_WIDTH * 0.06,
    top: 73 * S,
    transform: [{ rotate: '-5.44deg' }],
  },
  heartFloat2: {
    position: 'absolute',
    left: 14 * S,
    top: 102 * S,
    transform: [{ rotate: '-15.27deg' }],
  },
  heartFloat3: {
    position: 'absolute',
    left: -20 * S,
    bottom: SCREEN_HEIGHT * 0.15,
    transform: [{ rotate: '5.46deg' }],
  },
  matchTitleWrap: {
    position: 'absolute',
    transform: [{ rotate: '-15deg' }],
  },
  matchTitle: {
    fontFamily: 'Lobster_400Regular',
    fontSize: 65,
    color: colors.white,
    letterSpacing: -0.65,
  },
  matchTitle2: {
    fontFamily: 'Lobster_400Regular',
    fontSize: 65,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: -0.65,
  },
  matchTitle3: {
    fontFamily: 'Lobster_400Regular',
    fontSize: 65,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: -0.65,
  },
  contentBlock: {
    position: 'absolute',
    top: 223 * S,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 24,
  },
  photosContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  photoLeft: {
    width: 166 * S,
    height: 252 * S,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  photoRight: {
    width: 166 * S,
    height: 252 * S,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    marginLeft: -45 * S,
    marginTop: 51,
  },
  photoFill: {
    width: '100%' as any,
    height: '100%' as any,
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heartBadge: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    left: '35%',
    top: '40%',
    zIndex: 10,
  },
  textBlock: {
    alignItems: 'center',
    gap: 20,
    width: 271,
  },
  matchName: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 24,
    color: colors.white,
    textAlign: 'center',
  },
  matchMessage: {
    ...typography.body,
    color: colors.white,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttons: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 80,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  btnOutline: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.white,
  },
  btnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.primary,
  },
});
