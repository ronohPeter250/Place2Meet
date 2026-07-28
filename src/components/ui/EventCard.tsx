import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GenderOtherSmallIcon, GenderFemaleSmallIcon, GenderMaleSmallIcon } from './SvgIcons';
import { CachedImage } from './CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Timestamp } from 'firebase/firestore';
import { colors, typography } from '../../theme';
import { Button } from './Button';
import { he } from '../../i18n/he';

interface EventCardProps {
  title: string;
  description?: string;
  venueName: string;
  venueAddress: string;
  venueImage?: string;
  dateTime: Timestamp | null;
  attendeeCount: number;
  capacity: number;
  coverImage?: string;
  attendeeCounts?: { male: number; female: number; other: number };
  hideReserve?: boolean;
  onPress: () => void;
  /** Optional: show a "who's coming" action that opens the attendee list. */
  onShowAttendees?: () => void;
}

export const EventCard = React.memo(function EventCard({
  title, description, venueName, venueAddress, venueImage, dateTime, attendeeCount, capacity, coverImage, attendeeCounts, hideReserve, onPress, onShowAttendees,
}: EventCardProps) {
  const dateDisplay = useMemo(() => {
    if (!dateTime?.toDate) return '';
    const date = dateTime.toDate();
    const hebrewDays = ['יום א', 'יום ב', 'יום ג', 'יום ד', 'יום ה', 'יום ו', 'שבת'];
    const dayName = hebrewDays[date.getDay()];
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(2);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${dayName}, ${day}.${month}.${year}, ${hours}:${mins}`;
  }, [dateTime]);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {/* Cover image with gradient overlay and date badge */}
      <View style={styles.imageSection}>
        {coverImage ? (
          <CachedImage uri={coverImage} style={styles.coverImage} />
        ) : (
          <View style={styles.coverPlaceholder} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(35,32,30,0)', colors.surface]}
          locations={[0, 0.7, 1]}
          style={styles.imageGradient}
        />
        {dateDisplay ? (
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{dateDisplay}</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Venue row with avatar (above title per Figma) */}
        <View style={styles.venueRowOuter}>
          {venueImage ? (
            <CachedImage uri={venueImage} style={styles.venueAvatar} />
          ) : (
            <View style={styles.venueAvatarPlaceholder} />
          )}
          <View style={styles.venueRow}>
            <Text style={styles.venueName}>{venueName}</Text>
            <Text style={styles.venueAddress}>{venueAddress}</Text>
          </View>
        </View>

        <View style={styles.titleDescGroup}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {description ? (
            <Text style={styles.description} numberOfLines={3}>{description}</Text>
          ) : null}
        </View>

        {/* Capacity line */}
        <Text style={styles.capacityText}>
          {he.events.spots}{' '}
          <Text style={styles.capacityCount}>{attendeeCount}/{capacity}</Text>
        </Text>

        {/* Gender breakdown — right to left: גברים, נשים, אחר */}
        {attendeeCounts && (
          <View style={styles.genderRow}>
            {(() => {
              const maleActive = (attendeeCounts.male ?? 0) > 0;
              return (
                <View style={styles.genderBox}>
                  <View style={styles.genderIconWrap}>
                    <GenderMaleSmallIcon size={30} color={maleActive ? colors.primary : colors.text} />
                  </View>
                  <Text style={[styles.genderCount, maleActive && styles.genderActive]}>{attendeeCounts.male}</Text>
                  <Text style={[styles.genderLabel, maleActive && styles.genderActive]}>{he.map.men}</Text>
                </View>
              );
            })()}
            {(() => {
              const femaleActive = (attendeeCounts.female ?? 0) > 0;
              return (
                <View style={styles.genderBox}>
                  <View style={styles.genderIconWrap}>
                    <GenderFemaleSmallIcon size={30} color={femaleActive ? colors.primary : colors.text} />
                  </View>
                  <Text style={[styles.genderCount, femaleActive && styles.genderActive]}>{attendeeCounts.female}</Text>
                  <Text style={[styles.genderLabel, femaleActive && styles.genderActive]}>{he.map.women}</Text>
                </View>
              );
            })()}
            {(() => {
              const otherActive = (attendeeCounts.other ?? 0) > 0;
              return (
                <View style={styles.genderBox}>
                  <View style={styles.genderIconWrap}>
                    <GenderOtherSmallIcon size={30} color={otherActive ? colors.primary : colors.text} />
                  </View>
                  <Text style={[styles.genderCount, otherActive && styles.genderActive]}>{attendeeCounts.other}</Text>
                  <Text style={[styles.genderLabel, otherActive && styles.genderActive]}>{he.map.other}</Text>
                </View>
              );
            })()}
          </View>
        )}

        {/* "Who's coming" — a separate action from reserving, and available whether or
            not the viewer has a spot: the card previously offered reserving as the ONLY
            thing you could do with an event. */}
        {onShowAttendees && (
          <TouchableOpacity style={styles.attendeesBtn} onPress={onShowAttendees} activeOpacity={0.7}>
            <Text style={styles.attendeesBtnText}>
              {attendeeCount > 0 ? `מי מגיע? (${attendeeCount})` : 'מי מגיע?'}
            </Text>
          </TouchableOpacity>
        )}

        {/* CTA button - only for regular users */}
        {!hideReserve && (
          <Button
            title={he.events.reserveSpot}
            onPress={onPress}
            style={styles.ctaButton}
          />
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  attendeesBtn: {
    // width matches ctaButton below: the card's content column is alignItems:'flex-end',
    // so without it this collapsed to a narrow right-hugging pill above a full-width
    // button. No marginTop either — the container already applies gap:16, and adding
    // one made the spacing above this row differ from every other row in the card.
    width: '100%', paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: colors.primary, alignItems: 'center',
  },
  attendeesBtnText: { ...typography.body, color: colors.primary, fontFamily: 'Rubik_600SemiBold' },
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
  },
  imageSection: {
    height: 143,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 143,
  },
  coverPlaceholder: {
    width: '100%',
    height: 143,
    backgroundColor: colors.surfaceLight,
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
  },
  dateBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.dateBadge,
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateBadgeText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.white,
  },
  content: {
    padding: 16,
    gap: 16,
    alignItems: 'flex-end',
  },
  titleDescGroup: {
    gap: 8,
    alignItems: 'flex-end',
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
  venueRowOuter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  venueAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  venueAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceLight,
  },
  venueRow: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  venueName: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    color: colors.text,
    textAlign: 'right',
  },
  venueAddress: {
    fontFamily: 'Rubik_300Light',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  capacityText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  genderRow: {
    flexDirection: 'row-reverse',
    gap: 7,
    width: '100%',
    justifyContent: 'center',
  },
  genderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#A7A7A7',
    borderRadius: 6,
    backgroundColor: colors.background,
    paddingVertical: 12,
  },
  genderIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderCount: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: colors.text,
    lineHeight: 17.5,
    textAlign: 'center',
  },
  genderLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: colors.text,
    lineHeight: 17.5,
    textAlign: 'center',
  },
  genderActive: {
    color: colors.primary,
  },
  capacityCount: {
    color: colors.primary,
  },
  ctaButton: {
    width: '100%',
  },
});
