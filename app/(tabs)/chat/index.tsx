import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { ChatEmptyIcon } from '../../../src/components/ui/SvgIcons';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { ChatListItem } from '../../../src/components/ui/ChatListItem';
import { subscribeToChats, Chat, reconcileMissingChats, isChatUnread } from '../../../src/services/chat';
import { getUserProfile } from '../../../src/services/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography } from '../../../src/theme';
import { he } from '../../../src/i18n/he';
import { useTabBarClearance } from '../../../src/hooks/useTabBarClearance';

interface ChatWithName extends Chat {
  otherUserName: string;
  otherUserPhoto?: string;
  unread: boolean;
}

export default function ChatListScreen() {
  // Clear the floating tab bar using the running device's bottom inset — the
  // literal 100 this replaces was only correct when that inset was 0.
  const tabBarClearance = useTabBarClearance();
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const nameCache = useRef<Map<string, { name: string; photo?: string }>>(new Map());
  // Monotonic token: the enrichment callback is async (awaits name fetches), so a
  // later snapshot can resolve before an earlier one — discard any result that
  // isn't from the most recent snapshot, or a stale list would clobber a fresh one.
  const seqRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // Recover any matches whose chat was never created (a failure or the
    // simultaneous-like race at match time) so they appear in the list.
    reconcileMissingChats().catch(err => console.error('[ChatListScreen] reconcile failed:', err));

    const unsubscribe = subscribeToChats(async (rawChats) => {
      if (cancelled) return;
      const seq = ++seqRef.current;

      try {
        // Only fetch names not already cached
        const uncachedUids = rawChats
          .map(chat => chat.participants.find(p => p !== user.uid) ?? '')
          .filter(uid => uid && !nameCache.current.has(uid));

        if (uncachedUids.length > 0) {
          // allSettled: one unreadable participant (e.g. suspended/blocked, whose
          // users doc read is denied) must degrade to an "Unknown" row, not reject
          // the whole batch and blank the entire chat list.
          const results = await Promise.allSettled(
            uncachedUids.map(uid => getUserProfile(uid).then(p => ({
              uid,
              name: p?.name ?? 'Unknown',
              photo: p?.photos?.[0] as string | undefined,
            })))
          );
          if (cancelled) return;
          results.forEach((r) => {
            // Only cache successful reads — a transient/denied read stays uncached
            // so the next snapshot retries it (render falls back to 'Unknown'
            // meanwhile) instead of sticking 'Unknown' for the whole session.
            if (r.status === 'fulfilled') {
              nameCache.current.set(r.value.uid, { name: r.value.name, photo: r.value.photo });
            }
          });
        }

        const enriched = rawChats.map(chat => {
          const otherUid = chat.participants.find(p => p !== user.uid) ?? '';
          const cached = nameCache.current.get(otherUid);
          return {
            ...chat,
            otherUserName: cached?.name ?? 'Unknown',
            otherUserPhoto: cached?.photo,
            unread: isChatUnread(chat, user.uid),
          };
        });

        // Only apply if this is still the newest snapshot (a slower earlier
        // callback must not overwrite a fresher list with stale data).
        if (cancelled || seq !== seqRef.current) return;
        setChats(enriched);
        setError(false);
      } catch (err) {
        console.error('[ChatListScreen] enrichment failed:', err);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, (err) => {
      console.error('[ChatListScreen] subscription error:', err);
      if (!cancelled) {
        setLoading(false);
        setError(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  const handleChatPress = useCallback((chatId: string) => {
    router.push(`/(tabs)/chat/${chatId}`);
  }, [router]);

  const renderItem = useCallback(({ item }: { item: ChatWithName }) => (
    <ChatListItem
      name={item.otherUserName}
      lastMessage={item.lastMessage}
      lastMessageAt={item.lastMessageAt as Timestamp | null}
      photo={item.otherUserPhoto}
      unread={item.unread}
      onPress={() => handleChatPress(item.id)}
    />
  ), [handleChatPress]);

  const keyExtractor = useCallback((item: ChatWithName) => item.id, []);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>{he.chat.title}</Text>
      </View>

      {error && chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ChatEmptyIcon />
          <Text style={styles.emptyTitle}>שגיאה בטעינת הצ'אטים</Text>
          <Text style={styles.emptySubtext}>בדוק את החיבור לאינטרנט ונסה שוב.</Text>
        </View>
      ) : chats.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <ChatEmptyIcon />
          <Text style={styles.emptyTitle}>{he.chat.noChats}</Text>
          <Text style={styles.emptySubtext}>{he.chat.noChatsSubtext}</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarClearance }]}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 22,
    color: colors.text,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyIcon: {
    marginBottom: 0,
  },
  emptyTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 24,
    letterSpacing: -0.4,
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 22
  },
});
