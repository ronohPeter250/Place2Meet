import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { searchPlaces, getPlaceDetails, AutocompletePrediction } from '../../services/places';
import { colors, typography, spacing, borderRadius } from '../../theme';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 3;

export interface SelectedPlace {
  address: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (place: SelectedPlace) => void;
  placeholder?: string;
}

export const AddressAutocomplete = React.memo(function AddressAutocomplete({
  value,
  onChangeText,
  onPlaceSelected,
  placeholder,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<AutocompletePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextSearchRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < MIN_QUERY_LEN) {
      setPredictions([]);
      setShowDropdown(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(value);
        setPredictions(results);
        setShowDropdown(results.length > 0);
      } catch (err) {
        console.error('[AddressAutocomplete] search failed:', err);
        setError('שגיאה בחיפוש כתובות');
        setPredictions([]);
        setShowDropdown(false);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const handleSelect = useCallback(
    async (prediction: AutocompletePrediction) => {
      setShowDropdown(false);
      setSearching(true);
      try {
        const details = await getPlaceDetails(prediction.placeId);
        skipNextSearchRef.current = true;
        onChangeText(details.formattedAddress);
        onPlaceSelected({
          address: details.formattedAddress,
          latitude: details.latitude,
          longitude: details.longitude,
        });
      } catch (err) {
        console.error('[AddressAutocomplete] details failed:', err);
        setError('שגיאה בטעינת פרטי הכתובת');
      } finally {
        setSearching(false);
      }
    },
    [onChangeText, onPlaceSelected]
  );

  return (
    <View style={styles.container}>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searching && (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.spinner}
          />
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {showDropdown && predictions.length > 0 && (
        <View style={styles.dropdown}>
          {predictions.map(p => (
            <TouchableOpacity
              key={p.placeId}
              style={styles.predictionRow}
              activeOpacity={0.7}
              onPress={() => handleSelect(p)}
            >
              <Text style={styles.predictionText} numberOfLines={2}>
                {p.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  inputWrap: {
    width: '100%',
    position: 'relative',
  },
  input: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
    textAlign: 'right',
    height: 48,
    textAlignVertical: 'center',
  },
  spinner: {
    position: 'absolute',
    left: 12,
    top: 14,
  },
  errorText: {
    ...typography.small,
    color: colors.error,
    marginTop: 4,
    textAlign: 'right',
  },
  dropdown: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: borderRadius.sm,
    marginTop: 4,
    maxHeight: 280,
    overflow: 'hidden',
  },
  predictionRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  predictionText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
  },
});
