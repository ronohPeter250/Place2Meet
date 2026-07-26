import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  onSnapshot,
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

// A user may only mark presence when they are physically AT the venue. Their live
// GPS is checked against the venue's coordinates both here and in the Firestore rules.
// ~200m covers typical GPS inaccuracy without letting someone check in from down the
// street. NOTE: the rules check is NOT a backstop against a raw client — it validates
// client-SUPPLIED lat/lng against the venue's public coordinates (with a wider 300m
// radius than this one), so anyone bypassing the UI can simply echo those coordinates
// back. Both checks constrain the honest path only; see the ACCEPTED RISK note on
// venue_presence in firestore.rules.
const CHECKIN_RADIUS_METERS = 200;

function normalizeGender(g: unknown): Gender {
  return g === 'male' || g === 'female' ? g : 'other';
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The venue's authoritative coordinates: a venue doc's `location` GeoPoint, or a
// business doc's `coordinates` GeoPoint. Returns null if neither has coordinates.
async function getVenueGeo(venueId: string): Promise<{ lat: number; lng: number } | null> {
  const venueSnap = await getDoc(doc(db, 'venues', venueId));
  const loc = (venueSnap.data() as { location?: { latitude: number; longitude: number } } | undefined)?.location;
  if (loc && typeof loc.latitude === 'number') return { lat: loc.latitude, lng: loc.longitude };
  const bizSnap = await getDoc(doc(db, 'businesses', venueId));
  const coords = (bizSnap.data() as { coordinates?: { latitude: number; longitude: number } } | undefined)?.coordinates;
  if (coords && typeof coords.latitude === 'number') return { lat: coords.latitude, lng: coords.longitude };
  return null;
}

export class CheckInError extends Error {
  constructor(public reason: 'LOCATION_REQUIRED' | 'VENUE_NO_LOCATION' | 'TOO_FAR') {
    super(reason);
    this.name = 'CheckInError';
  }
}

// A check-in writes THREE docs:
//  - checkins/{uid}_{venueId} (PRIVATE, owner/venue-owner/admin only): the user's
//    own record (holds their exact lat/lng) so they can check out and the map knows
//    whether *they* are checked in.
//  - venue_presence_entries/{autoId} (public read, IDENTITY-FREE — venueId/gender/
//    expiresAt, NO userId): so anyone can COUNT per-gender presence per venue,
//    globally, without being able to enumerate WHO is where.
//  - venue_presence/{venueId}/present/{uid} (CO-PRESENCE GATED, venue-scoped): carries
//    identity (doc id = uid) so the venue detail can show who's here. NOT public read —
//    unlike the entries above, the rule additionally requires the READER to hold a LIVE
//    check-in at this same venue, so callers must keep the `checkedInHere` gate in
//    app/(tabs)/venue/[venueId].tsx or the read is denied. That gate raises the cost of
//    tracking but does NOT prevent it: check-ins are self-mintable and unlimited, so a
//    raw client can hold one at every venue and read them all. Documented ACCEPTED RISK
//    — see the note on venue_presence in firestore.rules for the full attack.
// All are coupled by the rules to the caller's own matching check-in.
export async function checkInToVenue(
  venueId: string,
  userCoords: { lat: number; lng: number },
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  if (!userCoords || typeof userCoords.lat !== 'number' || typeof userCoords.lng !== 'number'
      || Number.isNaN(userCoords.lat) || Number.isNaN(userCoords.lng)) {
    throw new CheckInError('LOCATION_REQUIRED');
  }
  // Proximity gate: only allow if the user's live GPS is within the radius of the
  // venue. The rules apply a wider (300m) geodesic check of their own, but over
  // CLIENT-SUPPLIED coordinates — so it is not a backstop; see the note on
  // CHECKIN_RADIUS_METERS above.
  const venueGeo = await getVenueGeo(venueId);
  if (!venueGeo) throw new CheckInError('VENUE_NO_LOCATION');
  if (distanceMeters(userCoords.lat, userCoords.lng, venueGeo.lat, venueGeo.lng) > CHECKIN_RADIUS_METERS) {
    throw new CheckInError('TOO_FAR');
  }

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
    const data = d.data() as { entryId?: string; venueId?: string };
    if (data.entryId) batch.delete(doc(db, 'venue_presence_entries', data.entryId));
    if (data.venueId) batch.delete(doc(db, 'venue_presence', data.venueId, 'present', uid));
    batch.delete(d.ref);
  });

  if (same) {
    // Already present here — extend the window, reusing the same entry so no
    // duplicate presence is created. Use set (not update) so a stale check-in
    // whose entry was already cleaned still succeeds (re-creates the entry).
    const entryId = (same.data() as { entryId: string }).entryId;
    batch.set(doc(db, 'venue_presence_entries', entryId), { venueId, gender, expiresAt });
    batch.set(doc(db, 'venue_presence', venueId, 'present', uid), { gender, expiresAt });
    batch.update(doc(db, 'checkins', checkinId), { expiresAt });
  } else {
    const entryRef = doc(collection(db, 'venue_presence_entries'));
    batch.set(entryRef, { venueId, gender, expiresAt });
    batch.set(doc(db, 'venue_presence', venueId, 'present', uid), { gender, expiresAt });
    batch.set(doc(db, 'checkins', checkinId), {
      userId: uid,
      venueId,
      gender,
      lat: userCoords.lat,
      lng: userCoords.lng,
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
    const data = d.data() as { entryId?: string; venueId?: string };
    if (data.entryId) batch.delete(doc(db, 'venue_presence_entries', data.entryId));
    if (data.venueId) batch.delete(doc(db, 'venue_presence', data.venueId, 'present', uid));
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

// LIVE version of getAllActiveCheckinCounts: fires immediately and again on every
// presence write, so the map badge reflects check-ins/-outs in real time. Reads the
// IDENTITY-FREE venue_presence_entries (venueId/gender/expiresAt only) — safe to
// query globally because it carries no userId.
export function subscribeAllActiveCheckinCounts(
  onChange: (counts: Map<string, number>) => void,
): () => void {
  const q = query(collection(db, 'venue_presence_entries'), where('expiresAt', '>', Timestamp.now()));
  let lastDocs: { venueId: string; expiresAt?: Timestamp }[] = [];
  let lastKey = '';
  const recompute = () => {
    const counts = new Map<string, number>();
    for (const data of lastDocs) {
      // The query's `now` is frozen at subscribe time — re-apply expiry against the
      // real clock (also on a timer) so counts drop as entries lapse during a quiet
      // period with no new snapshot.
      if (data.expiresAt && data.expiresAt.toMillis() <= Date.now()) continue;
      counts.set(data.venueId, (counts.get(data.venueId) ?? 0) + 1);
    }
    // Skip a no-op re-render (avoids re-rendering the whole map on unrelated writes).
    const key = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}:${v}`).join(',');
    if (key === lastKey) return;
    lastKey = key;
    onChange(counts);
  };
  const unsub = onSnapshot(q, (snap) => { lastDocs = snap.docs.map(d => d.data() as { venueId: string; expiresAt?: Timestamp }); recompute(); }, () => { /* best-effort */ });
  const timer = setInterval(recompute, 45000);
  return () => { clearInterval(timer); unsub(); };
}

// LIVE per-gender presence for ONE venue (drives the venue popup / detail counts).
export function subscribeVenueActiveCounts(
  venueId: string,
  onChange: (counts: { male: number; female: number; other: number }) => void,
): () => void {
  const q = query(
    collection(db, 'venue_presence_entries'),
    where('venueId', '==', venueId),
    where('expiresAt', '>', Timestamp.now()),
  );
  let lastDocs: { gender?: string; expiresAt?: Timestamp }[] = [];
  let lastKey = '';
  const recompute = () => {
    const counts = { male: 0, female: 0, other: 0 };
    for (const data of lastDocs) {
      if (data.expiresAt && data.expiresAt.toMillis() <= Date.now()) continue;
      counts[normalizeGender(data.gender)]++;
    }
    const key = `${counts.male},${counts.female},${counts.other}`;
    if (key === lastKey) return;
    lastKey = key;
    onChange(counts);
  };
  const unsub = onSnapshot(q, (snap) => { lastDocs = snap.docs.map(d => d.data() as { gender?: string; expiresAt?: Timestamp }); recompute(); }, () => { /* best-effort */ });
  const timer = setInterval(recompute, 45000);
  return () => { clearInterval(timer); unsub(); };
}

// The distinct userIds currently present at a venue. Reads the VENUE-SCOPED
// subcollection venue_presence/{venueId}/present/{uid} (doc id == uid). Unlike the
// flat entries it is NOT globally queryable, which raises the cost of tracking — but
// it does NOT prevent it: check-ins are self-mintable and uncapped, so a raw client
// can hold one at every venue and read every present list. Documented ACCEPTED RISK;
// see the venue_presence note in firestore.rules.
export async function getVenuePresentUserIds(venueId: string): Promise<string[]> {
  const snap = await getDocs(query(
    collection(db, 'venue_presence', venueId, 'present'),
    where('expiresAt', '>', Timestamp.now()),
  ));
  const ids: string[] = [];
  for (const d of snap.docs) {
    const data = d.data() as { expiresAt?: Timestamp };
    if (data.expiresAt && data.expiresAt.toMillis() <= Date.now()) continue;
    ids.push(d.id);
  }
  return ids;
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
