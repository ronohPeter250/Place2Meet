import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  orderBy,
  limit as firestoreLimit,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface UpcomingEvent {
  id: string;
  title: string;
  dateTime: Date;
  attendeeCount: number;
  capacity: number;
}

export interface DashboardStats {
  dailyAverage: number;
  malePercent: number;
  femalePercent: number;
  otherPercent: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  totalEvents: number;
  totalAttendees: number;
  totalCapacity: number;
  upcomingEvent: UpcomingEvent | null;
  date: string;
}

export type DashboardPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

const PERIOD_DAYS: Record<DashboardPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

export async function getDashboardStats(venueId: string, period: DashboardPeriod = 'daily'): Promise<DashboardStats> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');
  if (uid !== venueId) throw new Error('Unauthorized: not the owner of this venue');

  const bizSnap = await getDoc(doc(db, 'businesses', uid));
  if (!bizSnap.exists()) throw new Error('Unauthorized: not a business account');

  // --- Fetch events created by this business ---
  const eventsRef = collection(db, 'events');
  const eventsQ = query(eventsRef, where('createdBy', '==', venueId));
  const eventsSnap = await getDocs(eventsQ);

  let totalEvents = 0;
  let totalAttendees = 0;
  let totalCapacity = 0;
  let upcomingEvent: UpcomingEvent | null = null;
  const now = new Date();

  for (const eventDoc of eventsSnap.docs) {
    const ev = eventDoc.data();
    totalEvents++;
    totalAttendees += ev.attendeeCount ?? 0;
    totalCapacity += ev.capacity ?? 0;

    // Track nearest upcoming event
    const evDate = ev.dateTime?.toDate?.();
    if (evDate && evDate > now) {
      if (!upcomingEvent || evDate < upcomingEvent.dateTime) {
        upcomingEvent = {
          id: eventDoc.id,
          title: ev.title ?? '',
          dateTime: evDate,
          attendeeCount: ev.attendeeCount ?? 0,
          capacity: ev.capacity ?? 0,
        };
      }
    }
  }

  // --- Daily average + gender breakdown from checkins (live venue activity) ---
  let dailyAverage = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let otherCount = 0;

  try {
    const daysBack = PERIOD_DAYS[period];
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const checkinsRef = collection(db, 'checkins');
    const checkinsQ = query(
      checkinsRef,
      where('venueId', '==', venueId),
      where('timestamp', '>=', Timestamp.fromDate(sinceDate)),
    );
    const checkinsSnap = await getDocs(checkinsQ);
    dailyAverage = Math.round(checkinsSnap.size / daysBack);

    // Gender is denormalized onto the check-in at check-in time, so read it
    // directly — no per-user fetch (which, with Promise.all, would throw and
    // zero the whole chart the moment one user's doc was unreadable/suspended).
    for (const ckin of checkinsSnap.docs) {
      const g = (ckin.data() as { gender?: 'male' | 'female' | 'other' }).gender;
      if (g === 'male') maleCount++;
      else if (g === 'female') femaleCount++;
      else otherCount++;
    }
  } catch (err) {
    console.error('[dashboard] checkins query failed:', err);
  }

  // --- Gender percentages from check-ins ---
  const totalGender = maleCount + femaleCount + otherCount;
  const maleP = totalGender > 0 ? Math.round((maleCount / totalGender) * 100) : 0;
  const femaleP = totalGender > 0 ? Math.round((femaleCount / totalGender) * 100) : 0;
  const otherP = totalGender > 0 ? 100 - maleP - femaleP : 0;

  return {
    dailyAverage,
    malePercent: maleP,
    femalePercent: femaleP,
    otherPercent: otherP,
    maleCount,
    femaleCount,
    otherCount,
    totalEvents,
    totalAttendees,
    totalCapacity,
    upcomingEvent,
    date: (() => {
      const d = new Date();
      const dd = d.getDate().toString().padStart(2, '0');
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const yy = d.getFullYear().toString().slice(-2);
      return `${dd}/${mm}/${yy}`;
    })(),
  };
}
