import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SendIcon } from '../../../src/components/ui/SvgIcons';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Header } from '../../../src/components/layout/Header';
import { ChatBubble } from '../../../src/components/ui/ChatBubble';
import {
  subscribeToMessages, sendMessage, markChatRead, fetchEarlierMessages, Message,
} from '../../../src/services/chat';
import { getUserProfile } from '../../../src/services/users';
import { db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

const PAGE_SIZE = 50;

type ListItem = Message | { id: string; type: 'divider'; label: string };

function isDivider(item: ListItem): item is { id: string; type: 'divider'; label: string } {
  return 'type' in item && item.type === 'divider';
}

export default function ChatConversationScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [earlierMessages, setEarlierMessages] = useState<Message[]>([]);
  const [hasMoreEarlier, setHasMoreEarlier] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [otherUserName, setOtherUserName] = useState('');
  const [otherUserPhoto, setOtherUserPhoto] = useState<string | undefined>();
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const suppressScrollRef = useRef(false);
  const atBottomRef = useRef(true);
  const lastMarkedRef = useRef<string | null>(null);

  // Header + access guard: confirm the current user is a participant before
  // showing the conversation (rules also deny reads, but this gives real feedback
  // instead of a silently blank screen), and load the other user's name.
  useEffect(() => {
    if (!chatId || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        if (cancelled) return;
        if (!chatDoc.exists()) {
          Alert.alert('שגיאה', 'הצ\'אט לא נמצא.');
          router.back();
          return;
        }
        const participants = (chatDoc.data()?.participants as string[]) ?? [];
        if (!participants.includes(user.uid)) {
          Alert.alert('אין הרשאה', 'אין לך גישה לשיחה זו.');
          router.back();
          return;
        }
        const otherUid = participants.find(p => p !== user.uid);
        if (!otherUid) return;
        const profile = await getUserProfile(otherUid);
        if (!cancelled && profile) {
          const age = profile.birthday ? (() => {
            const bd = new Date(profile.birthday);
            if (isNaN(bd.getTime())) return null;
            const today = new Date();
            let a = today.getFullYear() - bd.getFullYear();
            const m = today.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) a--;
            return a;
          })() : null;
          setOtherUserName(age ? `${profile.name}, ${age}` : profile.name);
          if (profile.photos?.[0]) setOtherUserPhoto(profile.photos[0]);
        }
      } catch (err) {
        console.error('[ChatConversationScreen] header fetch failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [chatId, user, router]);

  // Subscribe to the live tail (last PAGE_SIZE messages)
  useEffect(() => {
    if (!chatId) return;
    let scrollTimer: ReturnType<typeof setTimeout>;

    const unsubscribe = subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      // Only follow the tail if the reader is already near the bottom — don't
      // yank them down while they're browsing older history.
      if (!atBottomRef.current) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }, PAGE_SIZE, (err) => {
      console.error('[ChatConversationScreen] messages subscription error:', err);
    });

    return () => {
      clearTimeout(scrollTimer);
      unsubscribe();
    };
  }, [chatId]);

  // Mark the chat read when the newest message is an incoming (other-user) one,
  // deduped by message id so rapid deliveries don't each trigger a Firestore write.
  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    const newest = messages[messages.length - 1];
    if (newest.senderId === user?.uid) return;       // my own message needs no read stamp
    if (lastMarkedRef.current === newest.id) return;  // already marked for this message
    lastMarkedRef.current = newest.id;
    markChatRead(chatId);
  }, [chatId, messages, user?.uid]);

  // Merge paginated older messages with the live tail (dedup by id, older first).
  const allMessages = useMemo(() => {
    const seen = new Set<string>();
    const merged: Message[] = [];
    for (const m of [...earlierMessages, ...messages]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
    return merged;
  }, [earlierMessages, messages]);

  const handleLoadEarlier = useCallback(async () => {
    if (!chatId || loadingEarlier || !hasMoreEarlier) return;
    // Left boundary of what's already shown: the oldest loaded-earlier message,
    // or the oldest of the live tail on the first page. endBefore(it) always
    // moves strictly further back, so pagination advances on every press.
    const boundary = earlierMessages.length > 0 ? earlierMessages[0] : messages[0];
    const before = boundary?.timestamp as Timestamp | undefined;
    if (!before?.toMillis) return;

    setLoadingEarlier(true);
    try {
      const older = await fetchEarlierMessages(chatId, before, PAGE_SIZE);
      if (older.length === 0) {
        setHasMoreEarlier(false);
      } else {
        // Keep the reader's scroll position — don't let the content-size change
        // from prepending scroll them back to the bottom.
        suppressScrollRef.current = true;
        setEarlierMessages(prev => [...older, ...prev]);
        if (older.length < PAGE_SIZE) setHasMoreEarlier(false);
      }
    } catch (err) {
      console.error('[ChatConversationScreen] load earlier failed:', err);
    } finally {
      setLoadingEarlier(false);
    }
  }, [chatId, loadingEarlier, hasMoreEarlier, earlierMessages, messages]);

  // Build list with date dividers
  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    let lastDate = '';

    for (const msg of allMessages) {
      const ts = (msg.timestamp as Timestamp)?.toDate?.();
      if (ts) {
        const dateStr = ts.toLocaleDateString('he-IL');
        const today = new Date().toLocaleDateString('he-IL');
        if (dateStr !== lastDate) {
          lastDate = dateStr;
          items.push({
            id: `divider-${dateStr}`,
            type: 'divider',
            label: dateStr === today ? he.chat.today : dateStr,
          });
        }
      }
      items.push(msg);
    }
    return items;
  }, [allMessages]);

  const handleSend = useCallback(async () => {
    if (!chatId || !inputText.trim() || sending) return;

    // Sending your own message should always scroll you to it.
    atBottomRef.current = true;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendMessage(chatId, text);
    } catch (err) {
      console.error('[ChatConversationScreen] send message failed:', err);
      // Restore the text only if the user hasn't started typing something new.
      setInputText(prev => (prev.length === 0 ? text : prev));
      Alert.alert('שגיאה', 'ההודעה לא נשלחה. נסה שוב.');
    } finally {
      setSending(false);
    }
  }, [chatId, inputText, sending]);

  const renderItem = useCallback(({ item, index }: { item: ListItem; index: number }) => {
    if (isDivider(item)) {
      return (
        <View style={styles.dividerContainer}>
          <Text style={styles.dividerText}>{item.label}</Text>
        </View>
      );
    }
    // Determine if next message is from same sender (grouped bubbles)
    const nextItem = listData[index + 1];
    const nextIsSameSender = nextItem && !isDivider(nextItem) && nextItem.senderId === item.senderId;
    return (
      <ChatBubble
        text={item.text}
        timestamp={item.timestamp as Timestamp | null}
        isSent={item.senderId === user?.uid}
        showTimestamp={!nextIsSameSender}
        isGrouped={!!nextIsSameSender}
      />
    );
  }, [user?.uid, listData]);

  const keyExtractor = useCallback((item: ListItem) => item.id, []);

  const handleContentSizeChange = useCallback(() => {
    // Skip the auto-scroll-to-bottom once right after a "load earlier" prepend,
    // otherwise the reader is yanked back to the newest message.
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    // Don't jump to the bottom on content growth while the reader is scrolled up.
    if (!atBottomRef.current) return;
    flatListRef.current?.scrollToEnd({ animated: false });
  }, []);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    atBottomRef.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < 120;
  }, []);

  // "Load earlier" control at the top of the history.
  const listHeader = useMemo(() => {
    if (allMessages.length === 0 || !hasMoreEarlier) return null;
    return (
      <TouchableOpacity
        style={styles.loadEarlier}
        onPress={handleLoadEarlier}
        disabled={loadingEarlier}
        activeOpacity={0.7}
      >
        {loadingEarlier ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.loadEarlierText}>טען הודעות קודמות</Text>
        )}
      </TouchableOpacity>
    );
  }, [allMessages.length, hasMoreEarlier, loadingEarlier, handleLoadEarlier]);

  return (
    <ScreenWrapper edges={['top']}>
      <Header
        title={otherUserName || undefined}
        rightElement={
          otherUserPhoto ? (
            <View style={styles.headerAvatarRing}>
              <CachedImage uri={otherUserPhoto} style={styles.headerAvatar} />
            </View>
          ) : undefined
        }
      />
      <View style={styles.headerSeparator} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          scrollEventThrottle={100}
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            <SendIcon size={34} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={he.chat.messagePlaceholder}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            textAlign="right"
            selectionColor={colors.primary}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 3,
    alignSelf: 'flex-end',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerSeparator: {
    height: 1,
    backgroundColor: colors.border,
  },
  messagesContent: {
    paddingVertical: 16,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  loadEarlier: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadEarlierText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: colors.primary,
  },
  dividerContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dividerText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    // Lift above the floating tab bar (76 height + 24 bottom offset = 100, plus buffer)
    marginBottom: 110,
  },
  input: {
    flex: 1,
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    height: 39,
    marginLeft: 8,
  },
  sendButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
