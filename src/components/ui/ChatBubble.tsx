import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { colors } from '../../theme';

interface ChatBubbleProps {
  text: string;
  timestamp: Timestamp | null;
  isSent: boolean;
  showTimestamp?: boolean;
  isGrouped?: boolean;
}

export const ChatBubble = React.memo(function ChatBubble({
  text, timestamp, isSent, showTimestamp = true, isGrouped = false,
}: ChatBubbleProps) {
  const time = useMemo(() => {
    const d = (timestamp as Timestamp | null)?.toDate?.();
    if (!d) return '';
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }, [timestamp]);

  return (
    <View style={[styles.container, isSent ? styles.sentContainer : styles.receivedContainer, isGrouped && styles.groupedContainer]}>
      <View style={[styles.bubble, isSent ? styles.sentBubble : styles.receivedBubble]}>
        <Text style={[styles.text, isSent ? styles.sentText : styles.receivedText]}>{text}</Text>
      </View>
      {showTimestamp && time ? <Text style={[styles.time, isSent ? styles.timeSent : styles.timeReceived]}>{time}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginVertical: 8, paddingHorizontal: 16 },
  groupedContainer: { marginTop: 0, marginBottom: 0 },
  sentContainer: { alignItems: 'flex-end' },
  receivedContainer: { alignItems: 'flex-start' },
  bubble: { maxWidth: '75%', padding: 8, borderRadius: 12, minHeight: 32 },
  sentBubble: { backgroundColor: colors.bubbleSent, borderBottomRightRadius: 0 },
  receivedBubble: { backgroundColor: colors.bubbleReceived, borderBottomLeftRadius: 0 },
  text: { fontFamily: 'Rubik_400Regular', fontSize: 14 },
  sentText: { color: colors.white, textAlign: 'center' },
  receivedText: { color: colors.text, textAlign: 'right' },
  time: { fontFamily: 'Rubik_400Regular', fontSize: 10, color: colors.textMuted, marginTop: 10 },
  timeSent: { textAlign: 'right' },
  timeReceived: { textAlign: 'left' },
});
