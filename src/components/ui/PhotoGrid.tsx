import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions, ActivityIndicator, Alert } from 'react-native';
import { AddIcon } from './SvgIcons';
import { PhotoSourceSheet } from './PhotoSourceSheet';
import { pickImagesFromSource, PhotoSource } from '../../lib/imagePick';
import { colors, borderRadius } from '../../theme';

const GRID_GAP = 12;
const SLOTS_PER_ROW = 3;
const TOTAL_SLOTS = 6;
const CONTAINER_PADDING = 16;

interface PhotoGridProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  validatePhoto?: (uri: string, index: number) => Promise<{ ok: boolean; message?: string }>;
  validatingLabel?: string;
}

export const PhotoGrid = React.memo(function PhotoGrid({
  photos,
  onPhotosChange,
  maxPhotos = TOTAL_SLOTS,
  validatePhoto,
  validatingLabel,
}: PhotoGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [validatingIndex, setValidatingIndex] = useState<number | null>(null);
  // Guards against re-entrancy: the sheet stays tappable until the native
  // picker covers it, so a fast double-tap could otherwise launch two picks
  // and the second (built from a stale photos snapshot) would clobber the first.
  const pickingRef = useRef(false);

  const slotSize = useMemo(() => {
    const availableWidth = screenWidth - (CONTAINER_PADDING * 2);
    return Math.floor((availableWidth - GRID_GAP * (SLOTS_PER_ROW - 1)) / SLOTS_PER_ROW);
  }, [screenWidth]);

  const openSheet = useCallback((index: number) => {
    setPendingIndex(index);
    setSheetVisible(true);
  }, []);

  // Resolve the chosen source (camera / selfie / gallery) to one or more uris,
  // then add or replace photos at the pending slot. Gallery allows selecting
  // several at once (up to the free slots). The sheet stays mounted while the
  // native picker is open and closes afterward, avoiding the iOS
  // dismiss-then-present race.
  const handleSelectSource = useCallback(async (source: PhotoSource) => {
    const index = pendingIndex;
    if (index === null || pickingRef.current) {
      setSheetVisible(false);
      return;
    }
    pickingRef.current = true;
    try {
      // How many images may be chosen at once: every remaining free slot, plus
      // one more when the tapped slot already holds a photo (it gets replaced).
      const replacing = index < photos.length;
      const limit = Math.max(1, maxPhotos - photos.length + (replacing ? 1 : 0));

      let uris: string[] = [];
      try {
        uris = await pickImagesFromSource(source, limit);
      } finally {
        setSheetVisible(false);
        setPendingIndex(null);
      }
      if (uris.length === 0) return;

      // Build the prospective list: replace the tapped slot with the first pick
      // and append the rest; or append all when adding to an empty slot.
      const newPhotos = [...photos];
      if (replacing) {
        newPhotos[index] = uris[0];
        newPhotos.push(...uris.slice(1));
      } else {
        newPhotos.push(...uris);
      }
      const trimmed = newPhotos.slice(0, maxPhotos);

      // Validation governs only the MAIN photo (index 0). Run it only when the
      // main photo actually changed to a newly-picked image. The checking
      // overlay is shown on slot 0 because that is the photo being validated.
      if (validatePhoto && trimmed[0] && trimmed[0] !== photos[0]) {
        setValidatingIndex(0);
        try {
          const { ok, message } = await validatePhoto(trimmed[0], 0);
          if (!ok) {
            Alert.alert('', message ?? 'התמונה אינה תקינה. בחר תמונה אחרת.');
            return;
          }
        } finally {
          setValidatingIndex(null);
        }
      }

      onPhotosChange(trimmed);
    } finally {
      pickingRef.current = false;
    }
  }, [pendingIndex, photos, onPhotosChange, maxPhotos, validatePhoto]);

  const handleRemovePhoto = useCallback((index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
  }, [photos, onPhotosChange]);

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i);

  return (
    <>
      <View style={styles.grid}>
        {slots.map((index) => {
          const hasPhoto = index < photos.length;

          return (
            <View
              key={index}
              style={[styles.slot, { width: slotSize, height: slotSize }]}
            >
              {hasPhoto ? (
                <View style={[styles.photoContainer, { width: slotSize, height: slotSize }]}>
                  <TouchableOpacity
                    onPress={() => openSheet(index)}
                    activeOpacity={0.8}
                    style={{ width: slotSize, height: slotSize }}
                  >
                    <Image source={{ uri: photos[index] }} style={{ width: slotSize, height: slotSize }} resizeMode="cover" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemovePhoto(index)}
                    style={styles.removeButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeText}>{'×'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => openSheet(index)}
                  activeOpacity={0.7}
                  style={[styles.addButton, { width: slotSize, height: slotSize }]}
                >
                  <AddIcon size={32} />
                </TouchableOpacity>
              )}
              {validatingIndex === index && (
                <View style={[styles.validatingOverlay, { width: slotSize, height: slotSize }]}>
                  <ActivityIndicator color={colors.primary} />
                  {validatingLabel ? <Text style={styles.validatingText}>{validatingLabel}</Text> : null}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <PhotoSourceSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSelect={handleSelectSource}
      />
    </>
  );
});

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  slot: {},
  photoContainer: {
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '700',
    lineHeight: 16,
  },
  addButton: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.white,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  validatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.sm,
    gap: 6,
  },
  validatingText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    color: colors.white,
  },
});
