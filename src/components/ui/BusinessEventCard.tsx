import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Timestamp } from 'firebase/firestore';
import { CachedImage } from './CachedImage';
import { colors, borderRadius } from '../../theme';

interface BusinessEventCardProps {
  title: string;
  description?: string;
  coverImage?: string;
  dateTime: Timestamp | null;
  onPress: () => void;
}

const HEBREW_DAYS = ['יום א', 'יום ב', 'יום ג', 'יום ד', 'יום ה', 'יום ו', 'שבת'];

export const BusinessEventCard = React.memo(function BusinessEventCard({
  title, description, coverImage, dateTime, onPress,
}: BusinessEventCardProps) {
  const dateDisplay = useMemo(() => {
    if (!dateTime?.toDate) return '';
    const date = dateTime.toDate();
    const dayName = HEBREW_DAYS[date.getDay()];
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString().slice(2);
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${dayName}, ${d}.${m}.${y}, ${h}:${min}`;
  }, [dateTime]);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.imageSection}>
        {coverImage ? (
          <CachedImage uri={coverImage} style={styles.coverImage} />
        ) : (
          <View style={styles.coverPlaceholder} />
        )}
        {dateDisplay ? (
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{dateDisplay}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {description ? (
          <Text style={styles.description} numberOfLines={4}>{description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
  },
  imageSection: {
    height: 180,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 180,
  },
  coverPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: colors.surfaceLight,
  },
  dateBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.dateBadge,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateBadgeText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.white,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    color: colors.text,
    textAlign: 'right',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
