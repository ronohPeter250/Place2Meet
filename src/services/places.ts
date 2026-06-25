import Constants from 'expo-constants';

const API_KEY = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
  ?.googleMapsApiKey as string | undefined;

export interface AutocompletePrediction {
  placeId: string;
  text: string;
}

export interface PlaceDetails {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface AutocompleteSuggestion {
  placePrediction?: {
    placeId: string;
    text: { text: string };
  };
}

interface AutocompleteResponse {
  suggestions?: AutocompleteSuggestion[];
}

// Google Places API (New) — restricted to Israel addresses, Hebrew language.
export async function searchPlaces(input: string): Promise<AutocompletePrediction[]> {
  if (!API_KEY) {
    throw new Error('Missing googleMapsApiKey in app.json extra');
  }
  const trimmed = input.trim();
  if (!trimmed) return [];

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
    },
    body: JSON.stringify({
      input: trimmed,
      languageCode: 'he',
      regionCode: 'IL',
      includedRegionCodes: ['il'],
      includedPrimaryTypes: ['street_address', 'route', 'premise', 'subpremise'],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Places autocomplete failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as AutocompleteResponse;
  return (data.suggestions ?? [])
    .map(s => s.placePrediction)
    .filter((p): p is NonNullable<AutocompleteSuggestion['placePrediction']> => Boolean(p))
    .map(p => ({ placeId: p.placeId, text: p.text.text }));
}

interface PlaceDetailsResponse {
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  if (!API_KEY) {
    throw new Error('Missing googleMapsApiKey in app.json extra');
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=he`,
    {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'formattedAddress,location',
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Place details failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as PlaceDetailsResponse;
  if (!data.location || data.formattedAddress == null) {
    throw new Error('Place details response missing location or address');
  }
  return {
    formattedAddress: data.formattedAddress,
    latitude: data.location.latitude,
    longitude: data.location.longitude,
  };
}
