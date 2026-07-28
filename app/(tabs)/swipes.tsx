import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { SwipeCard } from '../../src/components/ui/SwipeCard';
import { MatchModal } from '../../src/components/ui/MatchModal';
import { FilterModal, FilterValues } from '../../src/components/ui/FilterModal';
import { RadarAnimation } from '../../src/components/ui/RadarAnimation';
import { SearchIcon, FilterIcon, SwipeLeftArrowIcon, SwipeRightArrowIcon, HandPointingIcon } from '../../src/components/ui/SvgIcons';
import { createSwipe, getSwipedUserIds, getSwipeableUsers } from '../../src/services/swipes';
import { prefetchImages } from '../../src/components/ui/CachedImage';
import { UserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { useTabBarClearance } from '../../src/hooks/useTabBarClearance';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

export default function SwipesScreen() {
  // Clear the floating tab bar using the running device's bottom inset — the
  // literal 100 this replaces was only correct when that inset was 0.
  const tabBarClearance = useTabBarClearance();
  const router = useRouter();
  const { user } = useAuth();
  const translateX = useSharedValue(0);
  const isSwiping = useRef(false);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matchedUser, setMatchedUser] = useState<UserProfile | null>(null);
  const [showMatch, setShowMatch] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [matchChatId, setMatchChatId] = useState<string | null>(null);
  const [myPhoto, setMyPhoto] = useState<string | undefined>(undefined);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({ genders: [], ageRange: [18, 65], relationshipTypes: [] });

  // Fetch current user's photo for match modal
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { getUserProfile } = await import('../../src/services/users');
        const profile = await getUserProfile(user.uid);
        if (!cancelled) {
          setMyPhoto(profile?.photos?.[0]);
          prefetchImages([profile?.photos?.[0]]); // warm own photo for the match modal
        }
      } catch (err) { console.error('[SwipesScreen] photo fetch failed:', err); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Check if tutorial was seen
  useEffect(() => {
    AsyncStorage.getItem('swipes_tutorial_seen').then(val => {
      if (!val) setShowTutorial(true);
    });
  }, []);

  const dismissTutorial = useCallback(async () => {
    setShowTutorial(false);
    await AsyncStorage.setItem('swipes_tutorial_seen', 'true');
  }, []);

  // Load swipeable users (re-runs when the applied filters change)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const swipedIds = await getSwipedUserIds();
        const swipeableUsers = await getSwipeableUsers(user.uid, swipedIds, 50, filters);
        if (!cancelled) {
          setUsers(swipeableUsers);
          setCurrentIndex(0);
          setLoading(false);
          // Warm the disk cache for the first few cards so they appear instantly.
          prefetchImages(swipeableUsers.slice(0, 3).map(u => u.photos?.[0]));
        }
      } catch (err) {
        console.error('[SwipesScreen] users fetch failed:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, filters]);

  const handleSwipeComplete = useCallback(async (direction: 'like' | 'dislike') => {
    if (isSwiping.current) return;
    const currentUser = users[currentIndex];
    if (!currentUser) return;

    isSwiping.current = true;
    try {
      const isMatch = await createSwipe(currentUser.uid, direction);
      if (isMatch && user) {
        // Reset before this match's chat is created — otherwise a failed creation
        // here would leave the PREVIOUS match's chat id stale, routing this match's
        // "send message" to the wrong conversation.
        setMatchChatId(null);
        try {
          // Create chat document for the match
          const { createChatForMatch } = await import('../../src/services/chat');
          const chatId = await createChatForMatch(user.uid, currentUser.uid);
          setMatchChatId(chatId);
        } catch (chatErr) {
          // Even if chat creation fails, still surface the match — the user can
          // retry chat creation via the matches list later.
          console.error('[SwipesScreen] chat creation failed:', chatErr);
          Alert.alert('שגיאה ביצירת צ\'אט', String((chatErr as Error)?.message ?? chatErr));
        }
        setMatchedUser(currentUser);
        setShowMatch(true);
      }
      // Only advance on success
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      const msg = (err as { message?: string; code?: string })?.message
        ?? (err as { code?: string })?.code
        ?? String(err);
      console.error('[SwipesScreen] swipe action failed:', err);
      Alert.alert('שגיאה בסוויפ', msg);
    }
    translateX.value = 0;
    isSwiping.current = false;
  }, [users, currentIndex, translateX, user]);

  const onSwipeRight = useCallback(() => {
    handleSwipeComplete('like');
  }, [handleSwipeComplete]);

  const onSwipeLeft = useCallback(() => {
    handleSwipeComplete('dislike');
  }, [handleSwipeComplete]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH * 1.5, { duration: 300 }, () => {
          runOnJS(onSwipeRight)();
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH * 1.5, { duration: 300 }, () => {
          runOnJS(onSwipeLeft)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const handleSendMessage = useCallback(async () => {
    // If the chat wasn't created at match time (a failure/race), retry now so the
    // user isn't stranded. Keep the match modal visible during the retry rather
    // than flashing a blank screen, and only navigate once we have a chat id.
    let chatId = matchChatId;
    if (!chatId && user && matchedUser) {
      try {
        const { createChatForMatch } = await import('../../src/services/chat');
        chatId = await createChatForMatch(user.uid, matchedUser.uid);
      } catch (err) {
        console.error('[SwipesScreen] retry chat creation failed:', err);
        Alert.alert('שגיאה', 'לא ניתן לפתוח את הצ\'אט כרגע. נסה שוב מתוך הצ\'אטים.');
      }
    }
    setShowMatch(false);
    setMatchedUser(null);
    setMatchChatId(null);
    if (chatId) {
      router.push(`/(tabs)/chat/${chatId}`);
    } else {
      router.push('/(tabs)/chat');
    }
  }, [router, matchChatId, user, matchedUser]);

  const handleKeepSwiping = useCallback(() => {
    setShowMatch(false);
    setMatchedUser(null);
    setMatchChatId(null);
  }, []);

  const handleFilterApply = useCallback((newFilters: FilterValues) => {
    setFilters(newFilters);
  }, []);

  const currentUser = users[currentIndex];
  const nextUser = users[currentIndex + 1];
  const hasUsers = currentIndex < users.length;

  // No users / searching state
  if (loading || !hasUsers) {
    return (
      <View style={styles.emptyContainer}>
        {/* Keep the filter reachable here — an over-narrow filter can empty the
            deck, and without this the user would be trapped with no way to widen it. */}
        <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilter(true)} activeOpacity={0.7}>
          <FilterIcon size={28} />
        </TouchableOpacity>
        <View style={styles.searchIconContainer}>
          <RadarAnimation size={200} />
          <View style={styles.searchIconOverlay}>
            <SearchIcon size={65} color={colors.primary} />
          </View>
        </View>
        <Text style={styles.emptyText}>{he.swipes.noUsers}</Text>
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(108,54,0,0.8)']}
          locations={[0, 0.55, 1]}
          style={styles.bottomFade}
          pointerEvents="none"
        />
        {/* Still render the match modal here — matching on the LAST card flips
            hasUsers to false, and the modal must not be pre-empted by this state. */}
        <MatchModal
          visible={showMatch}
          matchedUser={matchedUser}
          currentUserPhoto={myPhoto}
          onSendMessage={handleSendMessage}
          onKeepSwiping={handleKeepSwiping}
        />
        <FilterModal
          visible={showFilter}
          onClose={() => setShowFilter(false)}
          onApply={handleFilterApply}
          initialValues={filters}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: tabBarClearance }]}>
      {/* Filter button */}
      <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilter(true)} activeOpacity={0.7}>
        <FilterIcon size={28} />
      </TouchableOpacity>

      {/* Card stack */}
      <View style={styles.cardStack}>
        {/* Back card */}
        {nextUser && (
          <SwipeCard
            user={nextUser}
            translateX={translateX}
            isTop={false}
          />
        )}

        {/* Top card - swipeable */}
        {currentUser && (
          <GestureDetector gesture={panGesture}>
            <SwipeCard
              user={currentUser}
              translateX={translateX}
              isTop
            />
          </GestureDetector>
        )}
      </View>

      {/* Swiping only - no action buttons per Figma */}

      {/* Bottom orange fade — Figma gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(108,54,0,0.8)']}
        locations={[0, 0.55, 1]}
        style={styles.bottomFade}
        pointerEvents="none"
      />

      {/* Match Modal */}
      <MatchModal
        visible={showMatch}
        matchedUser={matchedUser}
        currentUserPhoto={myPhoto}
        onSendMessage={handleSendMessage}
        onKeepSwiping={handleKeepSwiping}
      />

      {/* Filter Modal */}
      <FilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        onApply={handleFilterApply}
        initialValues={filters}
      />

      {/* Tutorial popup - exact Figma design */}
      <Modal visible={showTutorial} transparent animationType="fade" onRequestClose={dismissTutorial}>
        <TouchableOpacity style={styles.tutorialOverlay} activeOpacity={1} onPress={dismissTutorial}>
          <View style={styles.tutorialContent}>
            {/* Like / Dislike labels */}
            <View style={styles.tutorialLabelsRow}>
              <Text style={styles.tutorialLabel}>Dislike</Text>
              <Text style={styles.tutorialLabel}>Like</Text>
            </View>
            {/* Gesture arrows from Figma */}
            <View style={styles.tutorialArrowsRow}>
              <View style={styles.tutorialArrow}><SwipeLeftArrowIcon size={56} /></View>
              <View style={[styles.tutorialArrow, { transform: [{ scaleX: -1 }] }]}><SwipeRightArrowIcon size={56} /></View>
            </View>
            {/* Hand icon */}
            <View style={styles.tutorialHand}><HandPointingIcon size={64} /></View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    // paddingBottom is applied inline from useTabBarClearance() — device dependent.
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '30%',
  },
  searchIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 25,
    lineHeight: 24,
  },
  filterButton: {
    position: 'absolute',
    top: 78,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cardStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  tutorialOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialContent: {
    alignItems: 'center',
    width: 247,
  },
  tutorialLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 203,
    marginBottom: 8,
  },
  tutorialLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.white,
  },
  tutorialArrowsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 4,
  },
  tutorialArrow: {
    width: 56,
    height: 56,
  },
  tutorialHand: {
    width: 64,
    height: 64,
  },
});
