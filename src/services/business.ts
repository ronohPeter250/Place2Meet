import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  FieldValue,
  Timestamp,
  GeoPoint,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { AccountStatus } from '../admin/types';

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface BusinessHours {
  sunday: DayHours;
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
}

export interface BusinessProfile {
  uid: string;
  contactName: string;
  businessName: string;
  email: string;
  location: string;
  coordinates?: GeoPoint;
  about: string;
  hours: BusinessHours;
  photos: string[];
  profileComplete: boolean;
  createdAt?: Timestamp | FieldValue;
  lastActive?: Timestamp | FieldValue;
  category?: string;
  accountStatus?: AccountStatus;
  updatedByAdminAt?: Timestamp | FieldValue;
  updatedByAdminId?: string;
}

const MAX_NAME_LENGTH = 100;
const MAX_ABOUT_LENGTH = 1000;

function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function assertAuthenticatedUser(uid: string): void {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) {
    throw new Error('Unauthorized: uid does not match authenticated user');
  }
}

export async function createBusinessProfile(
  uid: string,
  data: Partial<BusinessProfile>
): Promise<void> {
  assertAuthenticatedUser(uid);

  const sanitizedData: Partial<BusinessProfile> = { ...data };
  if (sanitizedData.contactName) {
    sanitizedData.contactName = sanitizeText(sanitizedData.contactName, MAX_NAME_LENGTH);
  }
  if (sanitizedData.businessName) {
    sanitizedData.businessName = sanitizeText(sanitizedData.businessName, MAX_NAME_LENGTH);
  }
  if (sanitizedData.about) {
    sanitizedData.about = sanitizeText(sanitizedData.about, MAX_ABOUT_LENGTH);
  }

  await setDoc(doc(db, 'businesses', uid), {
    ...sanitizedData,
    uid,
    profileComplete: false,
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
  }, { merge: true });
}

export async function updateBusinessProfile(
  uid: string,
  data: Partial<BusinessProfile>
): Promise<void> {
  assertAuthenticatedUser(uid);

  const sanitizedData: Partial<BusinessProfile> = { ...data };
  if (sanitizedData.contactName) {
    sanitizedData.contactName = sanitizeText(sanitizedData.contactName, MAX_NAME_LENGTH);
  }
  if (sanitizedData.businessName) {
    sanitizedData.businessName = sanitizeText(sanitizedData.businessName, MAX_NAME_LENGTH);
  }
  if (sanitizedData.about) {
    sanitizedData.about = sanitizeText(sanitizedData.about, MAX_ABOUT_LENGTH);
  }

  await updateDoc(doc(db, 'businesses', uid), {
    ...sanitizedData,
    lastActive: serverTimestamp(),
  });
}

export async function completeBusinessProfile(uid: string): Promise<void> {
  assertAuthenticatedUser(uid);
  await updateDoc(doc(db, 'businesses', uid), {
    profileComplete: true,
    lastActive: serverTimestamp(),
  });
}

export async function getBusinessProfile(uid: string): Promise<BusinessProfile | null> {
  const bizDoc = await getDoc(doc(db, 'businesses', uid));
  if (bizDoc.exists()) {
    return bizDoc.data() as BusinessProfile;
  }
  return null;
}
