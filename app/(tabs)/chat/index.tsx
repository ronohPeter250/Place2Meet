import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { ChatEmptyIcon } from '../../../src/components/ui/SvgIcons';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { ChatListItem } from '../../../src/components/ui/ChatListItem';
import { subscribeToChats, Chat } from '../../../src/services/chat';
import { getUserProfile } from '../../../src/services/users';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

interface ChatWithName extends Chat {
  otherUserName: string;
  otherUserPhoto?: string;
}

export default function ChatListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const nameCache = useRef<Map<string, { name: string; photo?: string }>>(new Map());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const unsubscribe = subscribeToChats(async (rawChats) => {
      if (cancelled) return;

      try {
        // Only fetch names not already cached
        const uncachedUids = rawChats
          .map(chat => chat.participants.find(p => p !== user.uid) ?? '')
          .filter(uid => uid && !nameCache.current.has(uid));

        if (uncachedUids.length > 0) {
          const profiles = await Promise.all(
            uncachedUids.map(uid => getUserProfile(uid).then(p => ({
              uid,
              name: p?.name ?? 'Unknown',
              photo: p?.photos?.[0],
            })))
          );
          if (cancelled) return;
          profiles.forEach(({ uid, name, photo }) => nameCache.current.set(uid, { name, photo }));
        }

        const enriched = rawChats.map(chat => {
          const otherUid = chat.participants.find(p => p !== user.uid) ?? '';
          const cached = nameCache.current.get(otherUid);
          return {
            ...chat,
            otherUserName: cached?.name ?? 'Unknown',
            otherUserPhoto: cached?.photo,
          };
        });

        setChats(enriched);
      } catch (err) {
        console.error('[ChatListScreen] enrichment failed:', err);
      }
      setLoading(false);
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
      onPress={() => handleChatPress(item.id)}
    />
  ), [handleChatPress]);

  const keyExtractor = useCallback((item: ChatWithName) => item.id, []);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>{he.chat.title}</Text>
      </View>

      {chats.length === 0 && !loading ? (
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
          contentContainerStyle={styles.listContent}
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
    paddingTop: 22,
    paddingBottom: 100,
  },
});
