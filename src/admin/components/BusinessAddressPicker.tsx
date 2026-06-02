import { useEffect, useState } from 'react';
import { GeoPoint } from 'firebase/firestore';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getPlaceDetails, searchPlaces, AutocompletePrediction } from '../../services/places';
import { SelectedPlaceAddress } from '../types';
import { colors } from '../../theme';
import { AdminTextInput } from './AdminControls';

export function BusinessAddressPicker({
  value,
  onChangeText,
  onSelect,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (address: SelectedPlaceAddress) => void;
}) {
  const [suggestions, setSuggestions] = useState<AutocompletePrediction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setSuggestions(await searchPlaces(trimmed));
      } catch {
        setError('חיפוש הכתובת נכשל');
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  const handleSelect = async (prediction: AutocompletePrediction) => {
    setLoading(true);
    setError(null);
    try {
      const details = await getPlaceDetails(prediction.placeId);
      onChangeText(details.formattedAddress);
      setSuggestions([]);
      onSelect({
        formattedAddress: details.formattedAddress,
        coordinates: new GeoPoint(details.latitude, details.longitude),
      });
    } catch {
      setError('טעינת פרטי הכתובת נכשלה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AdminTextInput label="כתובת" value={value} onChangeText={onChangeText} placeholder="הקלד כתובת בישראל" />
      {loading ? <Text style={styles.muted}>מחפש...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {suggestions.map(suggestion => (
        <Pressable key={suggestion.placeId} style={styles.suggestion} onPress={() => handleSelect(suggestion)}>
          <Text style={styles.suggestionText}>{suggestion.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  suggestion: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  suggestionText: {
    color: colors.text,
    textAlign: 'right',
  },
  muted: {
    color: colors.textSecondary,
    textAlign: 'right',
  },
  error: {
    color: colors.errorLight,
    textAlign: 'right',
  },
});
