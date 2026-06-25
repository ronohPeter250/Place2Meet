import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, Image, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SendIcon } from '../../../src/components/ui/SvgIcons';
import { useLocalSearchParams } from 'expo-router';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Header } from '../../../src/components/layout/Header';
import { ChatBubble } from '../../../src/components/ui/ChatBubble';
import { subscribeToMessages, sendMessage, Message } from '../../../src/services/chat';
import { getUserProfile } from '../../../src/services/users';
import { db } from '../../../src/config/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

type ListItem = Message | { id: string; type: 'divider'; label: string };

function isDivider(item: ListItem): item is { id: string; type: 'divider'; label: string } {
  return 'type' in item && item.type === 'divider';
}

export default function ChatConversationScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUserName, setOtherUserName] = useState('');
  const [otherUserPhoto, setOtherUserPhoto] = useState<string | undefined>();
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fetch other user's name
  useEffect(() => {
    if (!chatId || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        if (!chatDoc.exists() || cancelled) return;
        const participants = chatDoc.data()?.participants as string[];
        const otherUid = participants?.find(p => p !== user.uid);
        if (!otherUid || cancelled) return;
        const profile = await getUserProfile(otherUid);
        if (!cancelled && profile) {
          const age = profile.birthday ? (() => {
            const bd = new Date(profile.birthday);
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
  }, [chatId, user]);

  // Subscribe to messages
  useEffect(() => {
    if (!chatId) return;
    let scrollTimer: ReturnType<typeof setTimeout>;

    const unsubscribe = subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      clearTimeout(scrollTimer);
      unsubscribe();
    };
  }, [chatId]);

  // Build list with date dividers
  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    let lastDate = '';

    for (const msg of messages) {
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
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!chatId || !inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendMessage(chatId, text);
    } catch (err) {
      console.error('[ChatConversationScreen] send message failed:', err);
      setInputText(text);
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
    flatListRef.current?.scrollToEnd({ animated: false });
  }, []);

  return (
    <ScreenWrapper edges={['top']}>
      <Header
        title={otherUserName || undefined}
        rightElement={
          otherUserPhoto ? (
            <View style={styles.headerAvatarRing}>
              <Image source={{ uri: otherUserPhoto }} style={styles.headerAvatar} />
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
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={handleContentSizeChange}
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
            maxLength={1000}
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
