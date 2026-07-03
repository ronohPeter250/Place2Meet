import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit as firestoreLimit,
  GeoPoint,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { isActiveAccount } from '../admin/utils';

export interface Venue {
  id: string;
  name: string;
  logo: string;
  photos: string[];
  description: string;
  address: string;
  location: GeoPoint;
  openingHours: OpeningHours;
  activeUserCounts: {
    male: number;
    female: number;
    other: number;
  };
  source?: 'venues' | 'businesses';
  createdAt?: Timestamp | FieldValue;
}

export interface OpeningHours {
  sunday: DayHours;
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
}

export interface DayHours {
  open: boolean;
  from?: string;
  to?: string;
}

export async function getVenues(maxResults = 200): Promise<Venue[]> {
  const venuesRef = collection(db, 'venues');
  const snapshot = await getDocs(query(venuesRef, firestoreLimit(maxResults)));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    source: 'venues' as const,
    ...doc.data(),
  })) as Venue[];
}

export async function getVenue(venueId: string): Promise<Venue | null> {
  const venueDoc = await getDoc(doc(db, 'venues', venueId));
  if (venueDoc.exists()) {
    return { id: venueDoc.id, source: 'venues', ...venueDoc.data() } as Venue;
  }
  return null;
}

interface BusinessDayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

interface BusinessHours {
  sunday?: BusinessDayHours;
  monday?: BusinessDayHours;
  tuesday?: BusinessDayHours;
  wednesday?: BusinessDayHours;
  thursday?: BusinessDayHours;
  friday?: BusinessDayHours;
  saturday?: BusinessDayHours;
}

const DAY_KEYS: (keyof BusinessHours)[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

function adaptBusinessHoursToOpeningHours(hours?: BusinessHours): OpeningHours {
  const result: Partial<OpeningHours> = {};
  for (const day of DAY_KEYS) {
    const bh = hours?.[day];
    result[day] = bh?.closed
      ? { open: false }
      : { open: true, from: bh?.open, to: bh?.close };
  }
  return result as OpeningHours;
}

// Reads completed businesses with geocoded coordinates and adapts them to the
// Venue shape so the map can render them alongside venues.
export async function getBusinessesAsVenues(maxResults = 200): Promise<Venue[]> {
  const businessesRef = collection(db, 'businesses');
  const snapshot = await getDocs(
    query(businessesRef, where('profileComplete', '==', true), firestoreLimit(maxResults))
  );
  return snapshot.docs
    .map(d => {
      const data = d.data() as Record<string, unknown>;
      const coords = data.coordinates as GeoPoint | undefined;
      // Skip businesses without coordinates, and suspended/blocked ones (they
      // must not linger on the map).
      if (!coords || !isActiveAccount(data.accountStatus as never)) return null;
      const photos = (data.photos as string[] | undefined) ?? [];
      return {
        id: d.id,
        name: (data.businessName as string) ?? '',
        logo: photos[0] ?? '',
        photos,
        description: (data.about as string) ?? '',
        address: (data.location as string) ?? '',
        location: coords,
        openingHours: adaptBusinessHoursToOpeningHours(data.hours as BusinessHours | undefined),
        activeUserCounts: { male: 0, female: 0, other: 0 },
        source: 'businesses' as const,
      } as Venue;
    })
    .filter((v): v is Venue => v !== null);
}

export async function getAllMapVenues(): Promise<Venue[]> {
  const [venues, businesses] = await Promise.all([
    getVenues(),
    getBusinessesAsVenues(),
  ]);
  return [...venues, ...businesses];
}
