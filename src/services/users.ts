import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  GeoPoint,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { AccountStatus, PhotoModerationStatus } from '../admin/types';

const MAX_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 500;
const MIN_AGE = 18;
const MAX_AGE = 120;

export interface UserProfile {
  uid: string;
  name: string;
  city: string;
  gender: 'male' | 'female' | 'other';
  datingPreference: ('male' | 'female' | 'other')[];
  relationshipType: ('serious' | 'casual' | 'longTerm')[];
  bio: string;
  birthday: string;
  photos: string[];
  profileComplete: boolean;
  lastActive?: Timestamp | FieldValue;
  createdAt?: Timestamp | FieldValue;
  accountStatus?: AccountStatus;
  flagged?: boolean;
  photoModeration?: Record<string, PhotoModerationStatus>;
  adminNotes?: string;
  updatedByAdminAt?: Timestamp | FieldValue;
  updatedByAdminId?: string;
}

function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function calculateAge(birthday: string): number {
  const birthDate = new Date(birthday);
  if (isNaN(birthDate.getTime())) {
    throw new Error('Invalid birthday format');
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < MIN_AGE) throw new Error('Must be 18 or older');
  if (age > MAX_AGE) throw new Error('Invalid birthday');

  return age;
}

function assertAuthenticatedUser(uid: string): void {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) {
    throw new Error('Unauthorized: uid does not match authenticated user');
  }
}

export async function createUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  assertAuthenticatedUser(uid);

  const sanitizedData: Partial<UserProfile> = { ...data };
  if (sanitizedData.name) {
    sanitizedData.name = sanitizeText(sanitizedData.name, MAX_NAME_LENGTH);
  }
  if (sanitizedData.bio) {
    sanitizedData.bio = sanitizeText(sanitizedData.bio, MAX_BIO_LENGTH);
  }

  // Preserve profileComplete/createdAt when the profile already exists, so
  // re-running this step never de-completes a finished account or resets its
  // creation time. Those fields are stamped only on first creation.
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, { ...sanitizedData, uid, lastActive: serverTimestamp() }, { merge: true });
    return;
  }
  await setDoc(ref, {
    ...sanitizedData,
    uid,
    profileComplete: false,
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
  }, { merge: true });
}

export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  assertAuthenticatedUser(uid);

  const sanitizedData: Partial<UserProfile> = { ...data };
  if (sanitizedData.name) {
    sanitizedData.name = sanitizeText(sanitizedData.name, MAX_NAME_LENGTH);
  }
  if (sanitizedData.bio) {
    sanitizedData.bio = sanitizeText(sanitizedData.bio, MAX_BIO_LENGTH);
  }

  await updateDoc(doc(db, 'users', uid), {
    ...sanitizedData,
    lastActive: serverTimestamp(),
  });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    return userDoc.data() as UserProfile;
  }
  return null;
}

export async function completeProfile(uid: string): Promise<void> {
  assertAuthenticatedUser(uid);
  await updateDoc(doc(db, 'users', uid), {
    profileComplete: true,
    lastActive: serverTimestamp(),
  });
}

export async function updateUserLocation(
  uid: string,
  latitude: number,
  longitude: number
): Promise<void> {
  assertAuthenticatedUser(uid);

  if (!isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Invalid coordinates');
  }

  // Precise coordinates go to a SEPARATE, self-readable collection — never on the
  // public users doc (readable by any active user) — so a user's real-time GPS is
  // not exposed to others (a stalking vector for a dating app). Only lastActive
  // (a low-sensitivity presence timestamp) stays on the profile.
  await setDoc(doc(db, 'user_locations', uid), {
    location: new GeoPoint(latitude, longitude),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await updateDoc(doc(db, 'users', uid), {
    lastActive: serverTimestamp(),
  });
}
