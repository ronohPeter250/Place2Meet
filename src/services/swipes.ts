import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { debugLog, debugError } from '../utils/debugLog';
import { isActiveAccount } from '../admin/utils';
import { UserProfile } from './users';

export interface Swipe {
  id: string;
  fromUser: string;
  toUser: string;
  action: 'like' | 'dislike';
  venueId?: string;
  timestamp: Timestamp | FieldValue;
}

export async function createSwipe(
  toUser: string,
  action: 'like' | 'dislike',
  venueId?: string
): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');
  if (uid === toUser) throw new Error('Cannot swipe on yourself');

  const swipeId = `${uid}_${toUser}`;
  debugLog('SWIPE', 'create start', { swipeId, action, venueId: venueId ?? null });
  try {
    await setDoc(doc(db, 'swipes', swipeId), {
      fromUser: uid,
      toUser,
      action,
      venueId: venueId ?? null,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    debugError('SWIPE', 'create', err, { swipeId, action });
    throw err;
  }

  if (action === 'like') {
    const isMatch = await checkForMatch(uid, toUser);
    debugLog('SWIPE', 'like recorded', { swipeId, isMatch });
    return isMatch;
  }
  debugLog('SWIPE', 'dislike recorded', { swipeId });
  return false;
}

async function checkForMatch(user1: string, user2: string): Promise<boolean> {
  const reverseSwipeId = `${user2}_${user1}`;
  try {
    const reverseDoc = await getDoc(doc(db, 'swipes', reverseSwipeId));
    const exists = reverseDoc.exists();
    const action = exists ? reverseDoc.data()?.action : null;
    // The reverse swipe is the whole basis of a match. Logging both existence and
    // action separates "they never swiped me" from "they swiped dislike" from "the
    // read was denied" — three very different bugs that all look like "no match".
    debugLog('SWIPE', 'reverse check', { reverseSwipeId, exists, action: action ?? null });
    return exists && action === 'like';
  } catch (err) {
    debugError('SWIPE', 'reverse check', err, { reverseSwipeId });
    throw err;
  }
}

export async function getSwipedUserIds(): Promise<Set<string>> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthorized');

  const swipesRef = collection(db, 'swipes');
  const q = query(swipesRef, where('fromUser', '==', uid));
  const snapshot = await getDocs(q);

  return new Set(snapshot.docs.map(d => d.data().toUser));
}

export interface SwipeFilters {
  genders: string[];
  ageRange: [number, number];
  relationshipTypes: string[];
}

function ageFromBirthday(birthday?: string): number | null {
  if (!birthday) return null;
  const bd = new Date(birthday);
  if (isNaN(bd.getTime())) return null;
  const today = new Date();
  let a = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) a--;
  return a;
}

// The age slider's upper bound. When ageRange[1] sits at this value it means
// "and older" (no upper cap) — otherwise every user above it would be hidden.
export const AGE_FILTER_MAX = 65;

// Applies the user-selected swipe filters. Empty gender/relationship selections
// mean "no restriction". A missing birthday is not filtered out on age (we don't
// hide users just because a field is absent).
function matchesFilters(u: UserProfile, f?: SwipeFilters): boolean {
  if (!f) return true;
  if (f.genders.length > 0 && (!u.gender || !f.genders.includes(u.gender))) return false;
  if (f.relationshipTypes.length > 0) {
    const urt = (u.relationshipType ?? []) as string[];
    if (!urt.some(rt => f.relationshipTypes.includes(rt))) return false;
  }
  const age = ageFromBirthday(u.birthday);
  if (age !== null) {
    if (age < f.ageRange[0]) return false;
    // ageRange[1] at the slider max means "and older" — don't cap.
    if (f.ageRange[1] < AGE_FILTER_MAX && age > f.ageRange[1]) return false;
  }
  return true;
}

// Returns only users who are co-registered with the current user to at least
// one shared event. Both must be registered (status='registered') to the same
// event for one to appear in the other's swipe deck. Optional `filters` narrow
// the deck by gender / age / relationship type.
export async function getSwipeableUsers(
  currentUid: string,
  excludeIds: Set<string>,
  maxResults = 50,
  filters?: SwipeFilters
): Promise<UserProfile[]> {
  const authUid = auth.currentUser?.uid;
  if (!authUid || authUid !== currentUid) throw new Error('Unauthorized');

  // 1. Find events the current user is registered to
  const regsRef = collection(db, 'registrations');
  const myRegsQ = query(
    regsRef,
    where('userId', '==', currentUid),
    where('status', '==', 'registered'),
  );
  // Fetch the user's own dating preference (orientation) alongside their regs, so
  // the deck only shows genders they actually want to date (was ignored entirely).
  const [meDoc, myRegsSnap] = await Promise.all([
    getDoc(doc(db, 'users', currentUid)),
    getDocs(myRegsQ),
  ]);
  const myPrefs = (meDoc.data()?.datingPreference ?? []) as string[];
  const myEventIds = myRegsSnap.docs.map(d => d.data().eventId as string);
  if (myEventIds.length === 0) return [];

  // 2. Read each event's attendeeIds and union them (excluding self/already-swiped)
  const eventResults = await Promise.allSettled(
    myEventIds.map(eid => getDoc(doc(db, 'events', eid)))
  );
  const candidateUids = new Set<string>();
  for (const res of eventResults) {
    if (res.status !== 'fulfilled' || !res.value.exists()) continue;
    const attendeeIds = (res.value.data().attendeeIds ?? []) as string[];
    for (const uid of attendeeIds) {
      if (uid !== currentUid && !excludeIds.has(uid)) {
        candidateUids.add(uid);
      }
    }
  }
  if (candidateUids.size === 0) return [];

  // 3. Fetch all candidate profiles, filter to profileComplete, THEN cap.
  //    (Capping before filter would shrink the deck if many incomplete
  //    profiles land at the head of the array.)
  const userIdsArr = Array.from(candidateUids).slice(0, Math.max(maxResults * 4, maxResults));
  const userDocs = await Promise.allSettled(
    userIdsArr.map(uid => getDoc(doc(db, 'users', uid)))
  );
  return userDocs
    .flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    .filter(docSnap => docSnap.exists())
    .map(docSnap => docSnap.data() as UserProfile)
    .filter(u => u.profileComplete && isActiveAccount(u.accountStatus))
    // Orientation: only show genders the user wants to date (empty = no preference).
    .filter(u => myPrefs.length === 0 || (!!u.gender && myPrefs.includes(u.gender)))
    .filter(u => matchesFilters(u, filters))
    .slice(0, maxResults);
}
