import {
  collection,
  doc,
  query,
  getDocs,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  where,
  increment,
  arrayUnion,
  arrayRemove,
  runTransaction,
  limit as firestoreLimit,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface AppEvent {
  id: string;
  venueId: string;
  venueName: string;
  venueAddress: string;
  venuePhoto?: string;
  title: string;
  description: string;
  dateTime: Timestamp;
  capacity: number;
  attendeeCount: number;
  attendeeCounts: {
    male: number;
    female: number;
    other: number;
  };
  attendeeIds?: string[];
  createdBy: string;
  createdAt?: Timestamp | FieldValue;
}

export interface Registration {
  id: string;
  userId: string;
  eventId: string;
  status: 'registered' | 'cancelled';
  timestamp: Timestamp | FieldValue;
}

export async function getEvents(maxResults = 50): Promise<AppEvent[]> {
  const eventsRef = collection(db, 'events');
  const q = query(
    eventsRef,
    where('dateTime', '>=', Timestamp.now()),
    orderBy('dateTime', 'asc'),
    firestoreLimit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as AppEvent[];
}

export async function getEventsByCreator(creatorUid: string): Promise<AppEvent[]> {
  const eventsRef = collection(db, 'events');
  const q = query(eventsRef, where('createdBy', '==', creatorUid), orderBy('dateTime', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as AppEvent[];
}

export async function getEvent(eventId: string): Promise<AppEvent | null> {
  const eventDoc = await getDoc(doc(db, 'events', eventId));
  if (eventDoc.exists()) {
    return { id: eventDoc.id, ...eventDoc.data() } as AppEvent;
  }
  return null;
}

// Sum attendeeCount per venueId over UPCOMING events only (past events should
// not inflate the "how many registered to the place" badge). Shared by the
// one-shot getter and the realtime subscription below.
function tallyVenueCounts(
  docs: { data: () => Record<string, unknown> }[]
): Map<string, number> {
  const now = Date.now();
  // Distinct registered users per venue (dedup across the venue's events so the
  // same person registered to two events isn't counted twice).
  const sets = new Map<string, Set<string>>();
  // Legacy events that predate attendeeIds — fall back to their attendeeCount.
  const fallback = new Map<string, number>();

  for (const d of docs) {
    const ev = d.data() as {
      venueId?: string; attendeeCount?: number;
      attendeeIds?: string[]; dateTime?: { toDate?: () => Date };
    };
    if (!ev.venueId) continue;
    const when = ev.dateTime?.toDate?.()?.getTime?.();
    // Only count UPCOMING, validly-dated events. Missing/invalid date or past
    // events are excluded (a date-less draft must not inflate the badge).
    if (when == null || when < now) continue;

    if (Array.isArray(ev.attendeeIds)) {
      let s = sets.get(ev.venueId);
      if (!s) { s = new Set(); sets.set(ev.venueId, s); }
      for (const id of ev.attendeeIds) s.add(id);
    } else {
      // Coerce + clamp: guard against corrupt/non-numeric/negative attendeeCount
      // (e.g. an over-decremented counter) producing NaN/negative badges.
      const n = Number(ev.attendeeCount);
      const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      fallback.set(ev.venueId, (fallback.get(ev.venueId) ?? 0) + safe);
    }
  }

  const counts = new Map<string, number>();
  const venueIds = new Set<string>([...sets.keys(), ...fallback.keys()]);
  for (const vid of venueIds) {
    // Prefer the distinct-user set when the venue has attendeeIds registrations.
    // A set that EXISTS but is empty (a modern event with nobody registered yet)
    // must NOT suppress a legacy event's attendeeCount at the same venue, so only
    // use the set when it actually has members.
    const s = sets.get(vid);
    counts.set(vid, s && s.size > 0 ? s.size : (fallback.get(vid) ?? 0));
  }
  return counts;
}

// Map of venueId -> number of users registered to that venue's upcoming events.
// Powers the count badge on each map marker ("how many registered to the place").
export async function getVenueRegistrationCounts(): Promise<Map<string, number>> {
  const snap = await getDocs(collection(db, 'events'));
  return tallyVenueCounts(snap.docs);
}

// Realtime variant: fires `onChange` immediately with current counts and again
// whenever any event's attendeeCount changes — so the map badge stays live
// without needing a screen remount/tab-switch. Returns an unsubscribe fn.
function countMapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function subscribeVenueRegistrationCounts(
  onChange: (counts: Map<string, number>) => void
): () => void {
  // Scope to upcoming events only (past events never contribute to a badge), so
  // the listener re-reads far fewer docs, and suppress no-op deliveries so the
  // map doesn't re-render on unrelated event writes.
  const q = query(collection(db, 'events'), where('dateTime', '>=', Timestamp.now()));
  let prev: Map<string, number> | null = null;
  return onSnapshot(
    q,
    (snap) => {
      const counts = tallyVenueCounts(snap.docs);
      if (prev && countMapsEqual(prev, counts)) return;
      prev = counts;
      onChange(counts);
    },
    (err) => console.error('[events] venue counts subscription failed:', err),
  );
}

export async function getMyRegisteredEventIds(): Promise<string[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const regsRef = collection(db, 'registrations');
  const q = query(
    regsRef,
    where('userId', '==', uid),
    where('status', '==', 'registered'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data().eventId as string);
}

export async function registerForEvent(eventId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const regId = `${uid}_${eventId}`;
  const regRef = doc(db, 'registrations', regId);
  const eventRef = doc(db, 'events', eventId);
  const userRef = doc(db, 'users', uid);

  await runTransaction(db, async (tx) => {
    const [eventSnap, regSnap, userSnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(regRef),
      tx.get(userRef),
    ]);

    if (!eventSnap.exists()) throw new Error('Event not found');
    const data = eventSnap.data();
    if (data.attendeeCount >= data.capacity) throw new Error('Event is full');
    if (regSnap.exists() && regSnap.data()?.status === 'registered') {
      throw new Error('Already registered');
    }

    const gender = userSnap.data()?.gender as 'male' | 'female' | 'other' | undefined;
    const genderField = gender === 'male' || gender === 'female' ? gender : 'other';

    tx.set(regRef, {
      userId: uid,
      eventId,
      status: 'registered',
      genderField,
      timestamp: serverTimestamp(),
    });
    tx.update(eventRef, {
      attendeeCount: increment(1),
      [`attendeeCounts.${genderField}`]: increment(1),
      attendeeIds: arrayUnion(uid),
    });
  });
}

export async function updateEvent(
  eventId: string,
  data: Partial<Omit<AppEvent, 'id'>>,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const eventRef = doc(db, 'events', eventId);
  // Transaction so the capacity-vs-attendeeCount check and the write are atomic —
  // a concurrent registerForEvent can't slip a join between a plain read and
  // write and leave attendeeCount > capacity. (The rule also enforces this floor.)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists()) throw new Error('Event not found');
    const current = snap.data();
    if (current?.createdBy !== uid) {
      throw new Error('Unauthorized: only event creator can update');
    }
    const newCap = (data as { capacity?: number }).capacity;
    if (typeof newCap === 'number' && newCap < (current?.attendeeCount ?? 0)) {
      throw new Error('Capacity below current attendees');
    }
    tx.update(eventRef, data);
  });
}

export async function cancelRegistration(eventId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const regId = `${uid}_${eventId}`;
  const regRef = doc(db, 'registrations', regId);
  const eventRef = doc(db, 'events', eventId);

  await runTransaction(db, async (tx) => {
    const [regSnap, eventSnap] = await Promise.all([
      tx.get(regRef),
      tx.get(eventRef),
    ]);
    if (!regSnap.exists() || regSnap.data()?.status !== 'registered') return;
    if (!eventSnap.exists()) return;

    const genderField = regSnap.data()?.genderField ?? 'other';

    tx.update(regRef, { status: 'cancelled' });
    tx.update(eventRef, {
      attendeeCount: increment(-1),
      [`attendeeCounts.${genderField}`]: increment(-1),
      attendeeIds: arrayRemove(uid),
    });
  });
}
