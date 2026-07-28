import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SendIcon } from '../../../src/components/ui/SvgIcons';
import { CachedImage } from '../../../src/components/ui/CachedImage';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
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
import { useTabBarClearance } from '../../../src/hooks/useTabBarClearance';
import { colors, typography, spacing, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';

const PAGE_SIZE = 50;

type ListItem = Message | { id: string; type: 'divider'; label: string };

function isDivider(item: ListItem): item is { id: string; type: 'divider'; label: string } {
  return 'type' in item && item.type === 'divider';
}

interface ConvoState {
  chatId: string;
  messages: Message[];
  earlier: Message[];
  hasMoreEarlier: boolean;
  otherUserName: string;
  otherUserPhoto?: string;
}

const EMPTY_MESSAGES: Message[] = [];
const emptyConvo = (chatId: string): ConvoState => ({
  chatId, messages: [], earlier: [], hasMoreEarlier: true, otherUserName: '', otherUserPhoto: undefined,
});

export default function ChatConversationScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  // ALL conversation-scoped state is keyed to the chatId it belongs to. `chat/[chatId]`
  // is a bottom-TAB route (app/(tabs)/_layout.tsx registers it with href:null), so
  // expo-router downgrades push() to NAVIGATE and this screen is REUSED with new params
  // — it is never remounted. Unkeyed, the live-tail merge below (which accumulates by
  // id rather than replacing) folds the PREVIOUS conversation's messages into the next
  // one: one person's private messages rendered inside a different person's chat, with
  // the header still showing the previous person. Deriving off the key invalidates all
  // of it in the same render as the param change.
  const [convo, setConvo] = useState<ConvoState>(emptyConvo(''));

  const current = convo.chatId === chatId ? convo : null;
  const messages = current?.messages ?? EMPTY_MESSAGES;
  const earlierMessages = current?.earlier ?? EMPTY_MESSAGES;
  const hasMoreEarlier = current?.hasMoreEarlier ?? true;
  const otherUserName = current?.otherUserName ?? '';
  const otherUserPhoto = current?.otherUserPhoto;

  // The chat currently on screen. Async callbacks capture the chatId they were started
  // for and compare against this, so a response that arrives after the user moved on is
  // DROPPED rather than applied.
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  // Whether the user is actually looking at this conversation. The screen stays mounted
  // (and subscribed) after they navigate away, so anything with a side effect — read
  // receipts in particular — must check this. focusEpoch re-runs those effects on return.
  const focusedRef = useRef(true);
  const [focusEpoch, setFocusEpoch] = useState(0);
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    setFocusEpoch(e => e + 1);
    return () => { focusedRef.current = false; };
  }, []));

  // Update the state for `id` — but ONLY while `id` is still the chat on screen. A
  // stale callback must be ignored outright: writing it (even into a fresh container
  // for its own chat) would replace the state of the conversation now being viewed and
  // blank it out, since the derived values above fall back to empty when the key
  // doesn't match. Ignoring is safe — the abandoned chat re-fetches if reopened.
  const patchConvo = useCallback((id: string, patch: (prev: ConvoState) => Partial<ConvoState>) => {
    if (id !== chatIdRef.current) return;
    setConvo(prev => {
      const base = prev.chatId === id ? prev : emptyConvo(id);
      return { ...base, ...patch(base) };
    });
  }, []);

  // Draft text and the in-flight flags are conversation-scoped too: on this reused
  // screen an unkeyed draft would carry a message composed for one person into someone
  // else's conversation, where `handleSend` (which reads the CURRENT chatId) would
  // deliver it to the wrong recipient. Same reasoning for the two busy flags — keyed so
  // one chat's outstanding request cannot disable the other chat's controls.
  const [draft, setDraft] = useState<{ chatId: string; text: string }>({ chatId: '', text: '' });
  const inputText = draft.chatId === chatId ? draft.text : '';
  const setInputText = useCallback((updater: string | ((prev: string) => string)) => {
    const id = chatIdRef.current;
    setDraft(prev => {
      const prevText = prev.chatId === id ? prev.text : '';
      return { chatId: id, text: typeof updater === 'function' ? updater(prevText) : updater };
    });
  }, []);

  const [loadingEarlierFor, setLoadingEarlierFor] = useState<string | null>(null);
  const loadingEarlier = loadingEarlierFor === chatId;
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const sending = sendingFor === chatId;

  const flatListRef = useRef<FlatList>(null);
  const suppressScrollRef = useRef(false);
  const atBottomRef = useRef(true);
  const lastMarkedRef = useRef<string | null>(null);

  // Scroll/read-receipt refs are per-conversation too. Reset them the moment the param
  // changes (during render, before the new chat paints) — otherwise a new chat inherits
  // "user is scrolled up" from the previous one and opens parked at the oldest message
  // of its window, with tail-following disabled until the user scrolls down manually.
  const renderedChatIdRef = useRef(chatId);
  if (renderedChatIdRef.current !== chatId) {
    renderedChatIdRef.current = chatId;
    atBottomRef.current = true;
    suppressScrollRef.current = false;
    lastMarkedRef.current = null;
  }

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
          patchConvo(chatId, () => ({
            otherUserName: age ? `${profile.name}, ${age}` : profile.name,
            otherUserPhoto: profile.photos?.[0],
          }));
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
      // ACCUMULATE, don't replace. subscribeToMessages returns a sliding
      // last-PAGE_SIZE window; replacing `messages` each snapshot would drop older
      // messages that scroll out of the window as new ones arrive, and those aren't
      // in earlierMessages either — leaving a permanent hole in the scrollback.
      // Merge by id (updates read-receipts/resolved timestamps too) and keep asc
      // order; a pending (null) server timestamp sorts to the end (it's newest).
      // patchConvo restarts from a blank conversation when the stored state belongs to
      // a different chat, so `prev.messages` here is only ever THIS chat's messages.
      patchConvo(chatId, prev => {
        if (prev.messages.length === 0) return { messages: msgs };
        const byId = new Map<string, Message>();
        for (const m of prev.messages) byId.set(m.id, m);
        for (const m of msgs) byId.set(m.id, m);
        return {
          messages: Array.from(byId.values()).sort((a, b) => {
            const ta = (a.timestamp as Timestamp)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
            const tb = (b.timestamp as Timestamp)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
            return ta - tb;
          }),
        };
      });
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
  // Gated on FOCUS: this screen is a tab route that stays mounted and keeps its
  // subscription running after the user navigates away, so without the gate every
  // message arriving while they are elsewhere would be stamped read — clearing the
  // unread badge for messages they never saw. Re-running on focus means messages that
  // landed while away are marked read the moment the user actually returns to them.
  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    if (!focusedRef.current) return;
    const newest = messages[messages.length - 1];
    if (newest.senderId === user?.uid) return;       // my own message needs no read stamp
    if (lastMarkedRef.current === newest.id) return;  // already marked for this message
    lastMarkedRef.current = newest.id;
    markChatRead(chatId);
  }, [chatId, messages, user?.uid, focusEpoch]);

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
    if (!before?.toMillis || !boundary?.id) return;

    setLoadingEarlierFor(chatId);
    try {
      const older = await fetchEarlierMessages(chatId, before, boundary.id, PAGE_SIZE);
      // A page is only valid if it still JOINS ONTO what is displayed. Matching the
      // chatId is not enough: leaving this chat and coming back rebuilds the container
      // from a fresh live tail, and messages sent meanwhile land between that tail and
      // this page — prepending it then would splice in a block that is no longer
      // adjacent, leaving a permanent hole that further pagination only moves away
      // from. So re-check that the boundary this page was fetched against is still the
      // left edge of the displayed history; if not, drop the page (a later press
      // re-fetches from the current edge).
      const stillAdjacent = (prev: ConvoState) => (
        prev.earlier.length > 0 ? prev.earlier[0].id === boundary.id : prev.messages[0]?.id === boundary.id
      );
      if (older.length === 0) {
        patchConvo(chatId, prev => (stillAdjacent(prev) ? { hasMoreEarlier: false } : {}));
      } else {
        // Keep the reader's scroll position — don't let the content-size change
        // from prepending scroll them back to the bottom. Id-guarded like every other
        // write here: if the user switched chats while this page was in flight, setting
        // the flag would re-dirty it after the param-change reset and make the NEW
        // conversation open parked at its oldest message.
        if (chatIdRef.current === chatId) suppressScrollRef.current = true;
        patchConvo(chatId, prev => (stillAdjacent(prev)
          ? { earlier: [...older, ...prev.earlier], hasMoreEarlier: older.length >= PAGE_SIZE }
          : {}));
      }
    } catch (err) {
      console.error('[ChatConversationScreen] load earlier failed:', err);
    } finally {
      setLoadingEarlierFor(prev => (prev === chatId ? null : prev));
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
    const target = chatId;  // the conversation this text was written for
    setInputText('');
    setSendingFor(target);

    try {
      await sendMessage(target, text);
    } catch (err) {
      console.error('[ChatConversationScreen] send message failed:', err);
      // Restore the text only if the user hasn't started typing something new — and
      // only while still in the same conversation, so a failed message never lands in
      // someone else's composer inviting the user to resend it to the wrong person.
      if (chatIdRef.current === target) {
        setInputText(prev => (prev.length === 0 ? text : prev));
      }
      // The alert is NOT gated on the conversation: sendMessage has no retry or queue,
      // so a rejection means the text is permanently lost, and the composer was already
      // cleared optimistically. Staying silent because the user has moved on would let
      // them believe a message was delivered when it never was. The wording names no
      // conversation, so showing it from elsewhere discloses nothing.
      Alert.alert('שגיאה', 'ההודעה לא נשלחה. נסה שוב.');
    } finally {
      setSendingFor(prev => (prev === target ? null : prev));
    }
  }, [chatId, inputText, sending, setInputText]);

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

  // The composer is FIXED, so unlike a scroll view it cannot be brought back into view
  // by scrolling: if it lands under the floating tab bar the user simply cannot type.
  // Measured from the running device rather than assumed — see useTabBarClearance.
  const composerClearance = useTabBarClearance(10);

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

        <View style={[styles.inputContainer, { marginBottom: composerClearance }]}>
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
    // Rubik — the divider label is Hebrew ('היום' / he-IL date); Plus Jakarta Sans
    // has no Hebrew glyphs and would render tofu/boxes.
    fontFamily: 'Rubik_400Regular',
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
    // marginBottom is applied inline from useTabBarClearance() — it depends on the
    // device's bottom safe-area inset and so cannot live in a static stylesheet.
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
