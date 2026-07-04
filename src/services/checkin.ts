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
  gender?: 'male' | 'female' | 'other';
  timestamp: Timestamp;
  expiresAt: Timestamp;
  entryId?: string;
}

const CHECKIN_DURATION_HOURS = 4;
type Gender = 'male' | 'female' | 'other';

function normalizeGender(g: unknown): Gender {
  return g === 'male' || g === 'female' ? g : 'other';
}

// A check-in writes two docs:
//  - checkins/{uid}_{venueId} (PRIVATE): the user's own record, so they can
//    check out and so the map knows whether *they* are checked in.
//  - venue_presence_entries/{autoId} (PUBLIC read): the identity-free tally
//    entry — { venueId, gender, expiresAt } with NO userId — so anyone can count
//    per-gender presence per venue WITHOUT being able to enumerate who is where.
// The two are coupled by the rules: an entry can only be created/deleted by the
// owner of the matching check-in that references it.
export async function checkInToVenue(venueId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const userSnap = await getDoc(doc(db, 'users', uid));
  const gender = normalizeGender((userSnap.data() as { gender?: string } | undefined)?.gender);

  const checkinId = `${uid}_${venueId}`;
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + CHECKIN_DURATION_HOURS * 3600 * 1000),
  );

  let existing = await getDocs(query(collection(db, 'checkins'), where('userId', '==', uid)));

  // A legacy check-in at THIS venue (created before the presence feature, no
  // entryId) can't be refreshed or created-in-place under the new rules, so drop
  // it first in its own write, then re-read.
  const legacySame = existing.docs.find(
    d => d.id === checkinId && !(d.data() as { entryId?: string }).entryId,
  );
  if (legacySame) {
    const del = writeBatch(db);
    del.delete(legacySame.ref);
    await del.commit();
    existing = await getDocs(query(collection(db, 'checkins'), where('userId', '==', uid)));
  }

  const same = existing.docs.find(
    d => d.id === checkinId && (d.data() as { entryId?: string }).entryId,
  );

  const batch = writeBatch(db);
  // Leaving any OTHER venue: remove that check-in AND its presence entry together
  // (the rules require the entry to be co-deleted).
  existing.docs.forEach(d => {
    if (d.id === checkinId) return;
    const oldEntryId = (d.data() as { entryId?: string }).entryId;
    if (oldEntryId) batch.delete(doc(db, 'venue_presence_entries', oldEntryId));
    batch.delete(d.ref);
  });

  if (same) {
    // Already present here — just extend the window, reusing the same entry so no
    // duplicate presence is created.
    const entryId = (same.data() as { entryId: string }).entryId;
    batch.update(doc(db, 'venue_presence_entries', entryId), { expiresAt });
    batch.update(doc(db, 'checkins', checkinId), { expiresAt });
  } else {
    const entryRef = doc(collection(db, 'venue_presence_entries'));
    batch.set(entryRef, { venueId, gender, expiresAt });
    batch.set(doc(db, 'checkins', checkinId), {
      userId: uid,
      venueId,
      gender,
      timestamp: serverTimestamp(),
      expiresAt,
      entryId: entryRef.id,
    });
  }
  await batch.commit();
}

export async function checkOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const existing = await getDocs(query(collection(db, 'checkins'), where('userId', '==', uid)));
  if (existing.empty) return;

  const batch = writeBatch(db);
  existing.docs.forEach(d => {
    const oldEntryId = (d.data() as { entryId?: string }).entryId;
    if (oldEntryId) batch.delete(doc(db, 'venue_presence_entries', oldEntryId));
    batch.delete(d.ref);
  });
  await batch.commit();
}

// Live per-gender counts for a venue, read from the identity-free presence
// entries (filtered by expiry). No check-in listing is involved, so no one can
// enumerate who is physically present — only the aggregate is exposed.
export async function getVenueActiveCounts(
  venueId: string,
): Promise<{ male: number; female: number; other: number }> {
  const now = Timestamp.now();
  const snap = await getDocs(query(
    collection(db, 'venue_presence_entries'),
    where('venueId', '==', venueId),
    where('expiresAt', '>', now),
  ));
  const counts = { male: 0, female: 0, other: 0 };
  for (const d of snap.docs) {
    counts[normalizeGender((d.data() as { gender?: string }).gender)]++;
  }
  return counts;
}

// venueId -> active presence count, from a single query over all non-expired
// entries. Lets the map show a live badge per marker without N round-trips.
export async function getAllActiveCheckinCounts(): Promise<Map<string, number>> {
  const now = Timestamp.now();
  const snap = await getDocs(query(
    collection(db, 'venue_presence_entries'),
    where('expiresAt', '>', now),
  ));
  const counts = new Map<string, number>();
  for (const d of snap.docs) {
    const venueId = (d.data() as { venueId: string }).venueId;
    counts.set(venueId, (counts.get(venueId) ?? 0) + 1);
  }
  return counts;
}

export async function getCurrentUserCheckIn(): Promise<CheckIn | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const now = Timestamp.now();
  const snap = await getDocs(query(
    collection(db, 'checkins'),
    where('userId', '==', uid),
    where('expiresAt', '>', now),
  ));
  if (snap.empty) return null;

  return { id: snap.docs[0].id, ...snap.docs[0].data() } as CheckIn;
}
