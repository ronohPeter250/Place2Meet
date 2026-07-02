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
  await setDoc(doc(db, 'swipes', swipeId), {
    fromUser: uid,
    toUser,
    action,
    venueId: venueId ?? null,
    timestamp: serverTimestamp(),
  });

  if (action === 'like') {
    return checkForMatch(uid, toUser);
  }
  return false;
}

async function checkForMatch(user1: string, user2: string): Promise<boolean> {
  const reverseSwipeId = `${user2}_${user1}`;
  const reverseDoc = await getDoc(doc(db, 'swipes', reverseSwipeId));
  return reverseDoc.exists() && reverseDoc.data()?.action === 'like';
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
  if (age !== null && (age < f.ageRange[0] || age > f.ageRange[1])) return false;
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
  const myRegsSnap = await getDocs(myRegsQ);
  const myEventIds = myRegsSnap.docs.map(d => d.data().eventId as string);
  if (myEventIds.length === 0) return [];

  // 2. Read each event's attendeeIds and union them (excluding self/already-swiped)
  const eventDocs = await Promise.all(
    myEventIds.map(eid => getDoc(doc(db, 'events', eid)))
  );
  const candidateUids = new Set<string>();
  for (const evDoc of eventDocs) {
    if (!evDoc.exists()) continue;
    const attendeeIds = (evDoc.data().attendeeIds ?? []) as string[];
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
    .filter(u => matchesFilters(u, filters))
    .slice(0, maxResults);
}
