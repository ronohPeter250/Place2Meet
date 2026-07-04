import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { CachedImage } from './CachedImage';
import { colors, typography } from '../../theme';

interface ChatListItemProps {
  name: string;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  photo?: string;
  unread?: boolean;
  onPress: () => void;
}

export const ChatListItem = React.memo(function ChatListItem({
  name, lastMessage, lastMessageAt, photo, unread, onPress,
}: ChatListItemProps) {
  const timeDisplay = useMemo(() => {
    if (!lastMessageAt?.toDate) return '';
    const date = lastMessageAt.toDate();
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }, [lastMessageAt]);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarRing}>
        {photo ? (
          <CachedImage uri={photo} style={styles.avatarImage} recyclingKey={photo} priority="high" />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.timeColumn}>
            <Text style={styles.time}>{timeDisplay}</Text>
            {unread && <View style={styles.unreadDot} />}
          </View>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>{lastMessage}</Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  topRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: { ...typography.bodyBold, color: colors.text, flex: 1, textAlign: 'right' },
  timeColumn: {
    alignItems: 'center',
    gap: 13,
  },
  time: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: colors.textMuted },
  unreadDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  // Rubik (not Plus Jakarta) — the last-message preview is Hebrew user content and
  // Plus Jakarta Sans has zero Hebrew glyphs, so it rendered as tofu/boxes.
  lastMessage: { fontFamily: 'Rubik_400Regular', fontSize: 12, color: '#BDBDBD', textAlign: 'right' },
});
