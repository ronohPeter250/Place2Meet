import {
  collection,
  doc,
  documentId,
  DocumentData,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  GeoPoint,
  QueryDocumentSnapshot,
  startAfter,
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { BusinessProfile } from '../services/business';
import { UserProfile } from '../services/users';
import {
  AccountStatus,
  AdminAuditLog,
  AdminProfile,
  PhotoModerationStatus,
} from './types';
import { photoModerationKey } from './utils';

const AUDIT_LIMIT = 50;
const ADMIN_PAGE_SIZE = 100;

export interface AdminListPage<T> {
  items: T[];
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
}

export async function loginAdmin(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function logoutAdmin(): Promise<void> {
  await signOut(auth);
}

export async function getAdminProfile(uid: string): Promise<AdminProfile | null> {
  const snap = await getDoc(doc(db, 'admins', uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as AdminProfile;
}

export async function assertActiveAdmin(uid: string): Promise<AdminProfile> {
  const profile = await getAdminProfile(uid);
  if (!profile || profile.active !== true) {
    throw new Error('Unauthorized admin');
  }
  return profile;
}

async function getUserAdminData(uid: string): Promise<Partial<UserProfile>> {
  const snap = await getDoc(doc(db, 'users', uid, 'adminData', 'private'));
  return snap.exists() ? snap.data() as Partial<UserProfile> : {};
}

export async function listUsersForAdmin(
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
  pageSize = ADMIN_PAGE_SIZE,
): Promise<AdminListPage<UserProfile>> {
  const constraints = cursor
    ? [orderBy(documentId()), startAfter(cursor), limit(pageSize)]
    : [orderBy(documentId()), limit(pageSize)];
  const snap = await getDocs(query(collection(db, 'users'), ...constraints));
  return {
    items: snap.docs.map(d => ({ uid: d.id, ...d.data() })) as UserProfile[],
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

export async function getUserForAdmin(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data(), ...await getUserAdminData(uid) } as UserProfile;
}

export async function listBusinessesForAdmin(
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
  pageSize = ADMIN_PAGE_SIZE,
): Promise<AdminListPage<BusinessProfile>> {
  const constraints = cursor
    ? [orderBy(documentId()), startAfter(cursor), limit(pageSize)]
    : [orderBy(documentId()), limit(pageSize)];
  const snap = await getDocs(query(collection(db, 'businesses'), ...constraints));
  const items = await Promise.all(snap.docs.map(async d => {
    // Merge the private contact subdoc (admin-readable) so the admin list can
    // still show contactName/email even though they're off the public doc.
    const priv = await getDoc(doc(db, 'businesses', d.id, 'private', 'contact')).catch(() => null);
    const p = priv && priv.exists() ? priv.data() : {};
    return { uid: d.id, ...d.data(), ...p } as BusinessProfile;
  }));
  return {
    items: items as BusinessProfile[],
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

export async function getBusinessForAdmin(uid: string): Promise<BusinessProfile | null> {
  const [snap, priv] = await Promise.all([
    getDoc(doc(db, 'businesses', uid)),
    getDoc(doc(db, 'businesses', uid, 'private', 'contact')).catch(() => null),
  ]);
  if (!snap.exists()) return null;
  const p = priv && priv.exists() ? priv.data() : {};
  return { uid: snap.id, ...snap.data(), ...p } as BusinessProfile;
}

function currentAdminIdentity() {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Admin is not signed in');
  return { adminId: admin.uid, adminEmail: admin.email ?? undefined };
}

export async function getAuditLogsForTarget(targetType: 'user' | 'business', targetId: string): Promise<AdminAuditLog[]> {
  const q = query(
    collection(db, 'adminAuditLogs'),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
    orderBy('createdAt', 'desc'),
    limit(AUDIT_LIMIT),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })) as AdminAuditLog[];
}

export async function updateUserStatus(uid: string, before: AccountStatus | undefined, status: AccountStatus): Promise<void> {
  const admin = currentAdminIdentity();
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    accountStatus: status,
    updatedByAdminAt: serverTimestamp(),
    updatedByAdminId: admin.adminId,
  });
  batch.set(doc(collection(db, 'adminAuditLogs')), { ...admin, targetType: 'user', targetId: uid, action: 'status_change', before: { accountStatus: before ?? 'active' }, after: { accountStatus: status }, createdAt: serverTimestamp() });
  await batch.commit();
}

export async function updateUserFlag(uid: string, before: boolean | undefined, flagged: boolean): Promise<void> {
  const admin = currentAdminIdentity();
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'adminData', 'private'), {
    flagged,
    updatedByAdminAt: serverTimestamp(),
    updatedByAdminId: admin.adminId,
  }, { merge: true });
  batch.set(doc(collection(db, 'adminAuditLogs')), { ...admin, targetType: 'user', targetId: uid, action: 'flag_change', before: { flagged: before === true }, after: { flagged }, createdAt: serverTimestamp() });
  await batch.commit();
}

export async function updateUserPhotoModeration(uid: string, photoKey: string, status: PhotoModerationStatus): Promise<void> {
  const admin = currentAdminIdentity();
  const safePhotoKey = photoModerationKey(photoKey);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'adminData', 'private'), {
    [`photoModeration.${safePhotoKey}`]: status,
    updatedByAdminAt: serverTimestamp(),
    updatedByAdminId: admin.adminId,
  }, { merge: true });
  batch.set(doc(collection(db, 'adminAuditLogs')), { ...admin, targetType: 'user', targetId: uid, action: 'photo_moderation', after: { [safePhotoKey]: status }, createdAt: serverTimestamp() });
  await batch.commit();
}

export async function updateUserAdminNotes(uid: string, before: string | undefined, adminNotes: string): Promise<void> {
  const admin = currentAdminIdentity();
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'adminData', 'private'), {
    adminNotes,
    updatedByAdminAt: serverTimestamp(),
    updatedByAdminId: admin.adminId,
  }, { merge: true });
  batch.set(doc(collection(db, 'adminAuditLogs')), { ...admin, targetType: 'user', targetId: uid, action: 'admin_notes_update', before: { adminNotes: before ?? '' }, after: { adminNotes }, createdAt: serverTimestamp() });
  await batch.commit();
}

export interface AdminBusinessInput {
  uid?: string;
  contactName: string;
  businessName: string;
  email: string;
  location: string;
  coordinates: GeoPoint;
  about: string;
  category: string;
  hours: BusinessProfile['hours'];
  photos: string[];
  profileComplete: boolean;
  accountStatus: AccountStatus;
}

export async function saveBusinessForAdmin(input: AdminBusinessInput): Promise<string> {
  const admin = currentAdminIdentity();
  const id = input.uid || doc(collection(db, 'businesses')).id;
  const ref = doc(db, 'businesses', id);
  const before = await getDoc(ref);
  const data = {
    uid: id,
    businessName: input.businessName.trim(),
    location: input.location,
    coordinates: input.coordinates,
    about: input.about.trim(),
    category: input.category.trim(),
    hours: input.hours,
    photos: input.photos,
    profileComplete: input.profileComplete,
    accountStatus: input.accountStatus,
    updatedByAdminAt: serverTimestamp(),
    updatedByAdminId: admin.adminId,
    ...(before.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  const batch = writeBatch(db);
  batch.set(ref, data, { merge: true });
  // Contact PII stays in the private subdoc, off the world-readable business doc.
  batch.set(doc(db, 'businesses', id, 'private', 'contact'), {
    contactName: input.contactName.trim(),
    email: input.email.trim(),
  }, { merge: true });
  // Build the audit entry without a top-level `undefined` — Firestore rejects
  // undefined field values (ignoreUndefinedProperties is off), which crashed the
  // admin "create business" path where before does not exist.
  const auditEntry: Record<string, unknown> = {
    ...admin,
    targetType: 'business',
    targetId: id,
    action: before.exists() ? 'business_update' : 'business_create',
    after: data,
    createdAt: serverTimestamp(),
  };
  if (before.exists()) auditEntry.before = before.data();
  batch.set(doc(collection(db, 'adminAuditLogs')), auditEntry);
  await batch.commit();
  return id;
}

/* ------------------------------------------------------------------ */
/*  Platform-wide analytics for the admin web dashboard               */
/*  Reads every collection directly — gated by the Firestore          */
/*  isAdmin() rule, NOT by a business account.                        */
/* ------------------------------------------------------------------ */

export interface AdminPlatformOverview {
  totalUsers: number;
  totalBusinesses: number;
  totalEvents: number;
  totalCheckins: number;
  genderBreakdown: {
    male: number;
    female: number;
    other: number;
    malePercent: number;
    femalePercent: number;
    otherPercent: number;
  };
  ageDistribution: { label: string; count: number; color: string }[];
  weeklyActivity: { label: string; count: number; color: string }[];
  eventsBreakdown: {
    active: number;
    completed: number;
    totalAttendees: number;
    totalCapacity: number;
  };
}

const ADMIN_AGE_GROUPS = [
  { min: 18, max: 24, label: '18-24', color: '#FF7043' },
  { min: 25, max: 34, label: '25-34', color: '#FFD043' },
  { min: 35, max: 44, label: '35-44', color: '#4CAF50' },
  { min: 45, max: 54, label: '45-54', color: '#42A5F5' },
  { min: 55, max: 120, label: '55+', color: '#AB47BC' },
];

const ADMIN_HEBREW_SHORT_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function adminComputeAge(birthday: string | Date): number {
  const bday = typeof birthday === 'string' ? new Date(birthday) : birthday;
  const today = new Date();
  let age = today.getFullYear() - bday.getFullYear();
  const m = today.getMonth() - bday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) age--;
  return age;
}

// Resilient document count: prefer the cheap server-side aggregation, but fall
// back to a full getDocs().size if aggregation is unavailable (offline /
// emulator / permissions) so a count never silently under-reports or rejects
// the whole overview.
async function adminCountOf(collectionName: string): Promise<number> {
  try {
    const snap = await getCountFromServer(collection(db, collectionName));
    return snap.data().count;
  } catch {
    const snap = await getDocs(collection(db, collectionName));
    return snap.size;
  }
}

export async function getPlatformOverviewForAdmin(): Promise<AdminPlatformOverview> {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Admin is not signed in');

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Parallel data fetches — admins can read all of these per the isAdmin() rule.
  const [usersSnap, totalBusinesses, eventsSnap, weekCheckinsSnap, totalCheckinsCount] =
    await Promise.all([
      getDocs(collection(db, 'users')),
      adminCountOf('businesses'),
      getDocs(collection(db, 'events')),
      getDocs(
        query(
          collection(db, 'checkins'),
          where('timestamp', '>=', Timestamp.fromDate(weekAgo)),
        ),
      ),
      adminCountOf('checkins'),
    ]);

  // --- User analysis (gender + age) ---
  let male = 0;
  let female = 0;
  let other = 0;
  const ageCounts = ADMIN_AGE_GROUPS.map(() => 0);

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const gender = data.gender as string | undefined;
    if (gender === 'male') male++;
    else if (gender === 'female') female++;
    else other++;

    const bday = data.birthday;
    if (bday) {
      try {
        const bdayValue =
          typeof bday === 'string'
            ? bday
            : bday instanceof Date
              ? bday
              : typeof bday?.toDate === 'function'
                ? bday.toDate()
                : null;
        if (bdayValue) {
          const age = adminComputeAge(bdayValue);
          for (let i = 0; i < ADMIN_AGE_GROUPS.length; i++) {
            if (age >= ADMIN_AGE_GROUPS[i].min && age <= ADMIN_AGE_GROUPS[i].max) {
              ageCounts[i]++;
              break;
            }
          }
        }
      } catch {
        // skip invalid birthday
      }
    }
  }

  const totalGender = male + female + other;
  const maleP = totalGender > 0 ? Math.round((male / totalGender) * 100) : 0;
  const femaleP = totalGender > 0 ? Math.round((female / totalGender) * 100) : 0;
  // Clamp: independent rounding of maleP/femaleP can sum to 101, which would
  // otherwise make otherP -1 (rendered as "-1%" / a negative donut arc). Mirrors
  // the same guard in src/services/dashboard.ts.
  const otherP = totalGender > 0 ? Math.max(0, 100 - maleP - femaleP) : 0;

  // --- Events analysis ---
  const now = new Date();
  let activeEvents = 0;
  let completedEvents = 0;
  let totalAttendeesAll = 0;
  let totalCapacityAll = 0;

  for (const eventDoc of eventsSnap.docs) {
    const ev = eventDoc.data();
    totalAttendeesAll += ev.attendeeCount ?? 0;
    totalCapacityAll += ev.capacity ?? 0;
    const evDate = ev.dateTime?.toDate?.();
    if (!evDate) continue; // skip undated/malformed — don't mislabel as completed
    if (evDate > now) activeEvents++;
    else completedEvents++;
  }

  // --- Weekly check-in activity (last 7 days) ---
  // Bucket by CALENDAR day (normalize to local midnight) so the count buckets
  // line up with the weekday labels regardless of the time of day the screen is
  // opened. A raw ms-delta would plot last-evening's check-in on today's bar.
  const dayCounts = new Array(7).fill(0) as number[];
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const DAY_MS = 1000 * 60 * 60 * 24;

  for (const checkinDoc of weekCheckinsSnap.docs) {
    const ts = checkinDoc.data().timestamp?.toDate?.();
    if (ts) {
      const tsMidnight = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime();
      const daysAgo = Math.round((startOfToday - tsMidnight) / DAY_MS);
      if (daysAgo >= 0 && daysAgo < 7) {
        dayCounts[6 - daysAgo]++;
      }
    }
  }

  const weeklyActivity = dayCounts.map((count, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { label: ADMIN_HEBREW_SHORT_DAYS[d.getDay()], count, color: '#FF7043' };
  });

  return {
    totalUsers: usersSnap.size,
    totalBusinesses,
    totalEvents: eventsSnap.size,
    totalCheckins: totalCheckinsCount,
    genderBreakdown: {
      male,
      female,
      other,
      malePercent: maleP,
      femalePercent: femaleP,
      otherPercent: otherP,
    },
    ageDistribution: ADMIN_AGE_GROUPS.map((group, i) => ({
      label: group.label,
      count: ageCounts[i],
      color: group.color,
    })),
    weeklyActivity,
    eventsBreakdown: {
      active: activeEvents,
      completed: completedEvents,
      totalAttendees: totalAttendeesAll,
      totalCapacity: totalCapacityAll,
    },
  };
}
