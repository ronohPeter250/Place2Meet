import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Modal, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from './CachedImage';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Button } from './Button';
import { GenderMaleSmallIcon, GenderFemaleSmallIcon, GenderOtherSmallIcon } from './SvgIcons';
import { Venue } from '../../services/venues';
import { getVenueActiveCounts } from '../../services/checkin';
import { darkMapStyle } from '../../constants/mapStyle';
import { colors, typography, borderRadius } from '../../theme';
import { he } from '../../i18n/he';

interface VenuePopupProps {
  venue: Venue | null;
  visible: boolean;
  onClose: () => void;
  onCheckIn: (venueId: string) => void;
}

const DAY_KEYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

export const VenuePopup = React.memo(function VenuePopup({
  venue,
  visible,
  onClose,
  onCheckIn,
}: VenuePopupProps) {
  const insets = useSafeAreaInsets();
  const [liveCounts, setLiveCounts] = useState<{ male: number; female: number; other: number } | null>(null);

  // Live per-gender counts from the identity-free presence entries — this reveals
  // only aggregate numbers, never who is present.
  useEffect(() => {
    if (!venue?.id || !visible) { setLiveCounts(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const c = await getVenueActiveCounts(venue.id);
        if (!cancelled) setLiveCounts(c);
      } catch (err) {
        console.error('[VenuePopup] active counts failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [venue?.id, visible]);

  const handleCheckIn = useCallback(async () => {
    if (!venue) return;
    onCheckIn(venue.id);
    try {
      const c = await getVenueActiveCounts(venue.id);
      setLiveCounts(c);
    } catch (err) {
      console.error('[VenuePopup] refresh counts failed:', err);
    }
  }, [venue, onCheckIn]);

  if (!venue) return null;

  const counts = liveCounts ?? venue.activeUserCounts ?? { male: 0, female: 0, other: 0 };
  const totalActive = counts.male + counts.female + counts.other;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Hero image with gradient */}
          {venue.photos?.[0] ? (
            <View style={styles.heroSection}>
              <CachedImage uri={venue.photos[0]} style={styles.heroImage} />
              <LinearGradient
                colors={['transparent', 'rgba(35,32,30,0)', colors.surface]}
                locations={[0, 0.69, 1]}
                style={styles.heroGradient}
              />
            </View>
          ) : (
            <View style={styles.handleBar} />
          )}

          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>{'\u00D7'}</Text>
          </TouchableOpacity>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
            <View style={styles.content}>
              {/* Venue name + avatar + distance badge */}
              <View style={styles.venueRow}>
                <View style={styles.venueInfo}>
                  <Text style={styles.venueName}>{venue.name}</Text>
                  <Text style={styles.venueAddress}>{venue.address}</Text>
                </View>
                {venue.photos?.[1] ? (
                  <CachedImage uri={venue.photos[1]} style={styles.venueAvatar} />
                ) : null}
                <View style={styles.distanceBadge}>
                  <Text style={styles.distanceBadgeText}>{totalActive}</Text>
                </View>
              </View>

              {/* About */}
              <Text style={styles.sectionTitle}>{he.map.aboutPlace}</Text>
              <Text style={styles.description}>{venue.description}</Text>

              {/* Active Users */}
              <Text style={styles.sectionTitle}>{he.map.activeUsers}</Text>
              <View style={styles.usersRow}>
                {([
                  { key: 'male', Icon: GenderMaleSmallIcon, label: he.map.men, count: counts.male },
                  { key: 'female', Icon: GenderFemaleSmallIcon, label: he.map.women, count: counts.female },
                  { key: 'other', Icon: GenderOtherSmallIcon, label: he.map.other, count: counts.other },
                ] as const).map(g => {
                  const isActive = g.count > 0;
                  const activeColor = g.key !== 'other' && isActive ? colors.primary : colors.text;
                  return (
                    <View key={g.key} style={styles.userCount}>
                      <g.Icon size={30} color={activeColor} />
                      <Text style={[styles.userCountNumber, { color: activeColor }]}>{g.count}</Text>
                      <Text style={[styles.userCountLabel, { color: activeColor }]}>{g.label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Mini Map */}
              <Text style={styles.sectionTitle}>{he.map.locationOnMap}</Text>
              <View style={styles.miniMapContainer}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={styles.miniMap}
                  initialRegion={{
                    latitude: venue.location?.latitude ?? 32.0853,
                    longitude: venue.location?.longitude ?? 34.7818,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  customMapStyle={darkMapStyle}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker
                    coordinate={{
                      latitude: venue.location?.latitude ?? 32.0853,
                      longitude: venue.location?.longitude ?? 34.7818,
                    }}
                  />
                </MapView>
              </View>

              {/* Opening Hours */}
              <Text style={styles.sectionTitleBold}>{he.map.openingHours}</Text>
              {venue.openingHours && DAY_KEYS.map((dayKey) => {
                const dayHours = venue.openingHours[dayKey];
                const dayLabel = he.map.days[dayKey];
                return (
                  <View key={dayKey} style={styles.hoursRow}>
                    <Text style={styles.dayName}>{dayLabel}</Text>
                    <Text style={styles.dayHours}>
                      {dayHours?.open
                        ? `${dayHours.from ?? ''} - ${dayHours.to ?? ''}`
                        : he.map.closed}
                    </Text>
                  </View>
                );
              })}

              {/* Buttons */}
              <View style={styles.buttons}>
                <Button
                  title={he.map.iAmHere}
                  onPress={handleCheckIn}
                  variant="primary"
                  style={styles.button}
                />
                <Button
                  title={he.map.businessPage}
                  onPress={onClose}
                  variant="outline"
                  style={styles.button}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    maxHeight: '90%',
  },
  heroSection: {
    height: 250,
    position: 'relative',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: 250,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  handleBar: {
    width: 37,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  closeText: {
    fontSize: 18,
    color: colors.text,
    fontFamily: 'Rubik_700Bold',
    lineHeight: 22,
  },
  venueRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  venueInfo: {
    flex: 1,
  },
  venueAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginHorizontal: 8,
  },
  distanceBadge: {
    backgroundColor: colors.dateBadge,
    borderRadius: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  distanceBadgeText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.white,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
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
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitleBold: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    ...typography.body,
    color: colors.text,
    textAlign: 'right',
  },
  usersRow: {
    flexDirection: 'row-reverse',
    gap: 22,
    justifyContent: 'center',
  },
  userCount: {
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: 6,
    backgroundColor: colors.background,
    paddingHorizontal: 30,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  userCountNumber: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: colors.text,
  },
  userCountLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: colors.textSecondary,
  },
  miniMapContainer: {
    height: 167,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  miniMap: {
    flex: 1,
  },
  hoursRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingVertical: 5.5,
  },
  dayName: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  dayHours: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  buttons: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 32,
    marginBottom: 16,
  },
  button: {
    flex: 1,
  },
});
