import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface CheckIn {
  id: string;
  userId: string;
  venueId: string;
  timestamp: Timestamp;
  expiresAt: Timestamp;
}

const CHECKIN_DURATION_HOURS = 4;

export async function checkInToVenue(venueId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  // Fetch existing check-ins
  const checkinsRef = collection(db, 'checkins');
  const q = query(checkinsRef, where('userId', '==', uid));
  const snapshot = await getDocs(q);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CHECKIN_DURATION_HOURS);

  const checkinId = `${uid}_${venueId}`;

  // Atomic batch: delete old check-ins + create new one
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  batch.set(doc(db, 'checkins', checkinId), {
    userId: uid,
    venueId,
    timestamp: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
  });
  await batch.commit();
}

export async function checkOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const checkinsRef = collection(db, 'checkins');
  const q = query(checkinsRef, where('userId', '==', uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function getActiveCheckInsForVenue(venueId: string): Promise<CheckIn[]> {
  const checkinsRef = collection(db, 'checkins');
  const now = Timestamp.now();
  const q = query(
    checkinsRef,
    where('venueId', '==', venueId),
    where('expiresAt', '>', now)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
  })) as CheckIn[];
}

// Computes live gender counts of currently checked-in users for a venue.
// Reads from checkins (filtered by expiresAt > now), then resolves each user's
// gender from the users collection. Used by the map's VenuePopup so the counts
// reflect actual check-ins rather than a stale cached value.
export async function getVenueActiveCounts(
  venueId: string
): Promise<{ male: number; female: number; other: number }> {
  const checkinsRef = collection(db, 'checkins');
  const now = Timestamp.now();
  const q = query(
    checkinsRef,
    where('venueId', '==', venueId),
    where('expiresAt', '>', now)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return { male: 0, female: 0, other: 0 };

  const userIds = Array.from(
    new Set(snapshot.docs.map(d => (d.data() as { userId: string }).userId))
  );

  const userDocs = await Promise.all(
    userIds.map(uid => getDoc(doc(db, 'users', uid)))
  );

  const counts = { male: 0, female: 0, other: 0 };
  for (const userDoc of userDocs) {
    if (!userDoc.exists()) continue;
    const gender = (userDoc.data() as { gender?: 'male' | 'female' | 'other' }).gender;
    if (gender === 'male') counts.male++;
    else if (gender === 'female') counts.female++;
    else counts.other++;
  }
  return counts;
}

// Returns a Map of venueId → active check-in count, computed from a single
// query over all non-expired check-ins. The map screen uses this so each
// marker can show the live count without N round-trips.
export async function getAllActiveCheckinCounts(): Promise<Map<string, number>> {
  const checkinsRef = collection(db, 'checkins');
  const now = Timestamp.now();
  const q = query(checkinsRef, where('expiresAt', '>', now));
  const snapshot = await getDocs(q);

  const counts = new Map<string, number>();
  for (const d of snapshot.docs) {
    const venueId = (d.data() as { venueId: string }).venueId;
    counts.set(venueId, (counts.get(venueId) ?? 0) + 1);
  }
  return counts;
}

export async function getCurrentUserCheckIn(): Promise<CheckIn | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const checkinsRef = collection(db, 'checkins');
  const now = Timestamp.now();
  const q = query(
    checkinsRef,
    where('userId', '==', uid),
    where('expiresAt', '>', now)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
  } as CheckIn;
}
