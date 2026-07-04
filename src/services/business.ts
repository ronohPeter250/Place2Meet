import {
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  writeBatch,
  WriteBatch,
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

// Contact PII (contactName/email) lives in businesses/{uid}/private/contact,
// readable only by the owner/admin — never on the world-readable business doc.
function stageContactPII(batch: WriteBatch, uid: string, contactName?: string, email?: string): void {
  const priv: Record<string, string> = {};
  if (contactName !== undefined) priv.contactName = sanitizeText(contactName, MAX_NAME_LENGTH);
  if (email !== undefined) priv.email = email;
  if (Object.keys(priv).length > 0) {
    batch.set(doc(db, 'businesses', uid, 'private', 'contact'), priv, { merge: true });
  }
}

export async function createBusinessProfile(
  uid: string,
  data: Partial<BusinessProfile>
): Promise<void> {
  assertAuthenticatedUser(uid);

  const { contactName, email, ...rest } = data;
  const sanitizedData: Partial<BusinessProfile> = { ...rest };
  if (sanitizedData.businessName) {
    sanitizedData.businessName = sanitizeText(sanitizedData.businessName, MAX_NAME_LENGTH);
  }
  if (sanitizedData.about) {
    sanitizedData.about = sanitizeText(sanitizedData.about, MAX_ABOUT_LENGTH);
  }

  // Preserve profileComplete/createdAt when the profile already exists, so
  // re-running this step never de-completes a finished account or resets its
  // creation time. Those fields are stamped only on first creation.
  const ref = doc(db, 'businesses', uid);
  const existing = await getDoc(ref);
  const batch = writeBatch(db);
  if (existing.exists()) {
    batch.set(ref, { ...sanitizedData, uid, lastActive: serverTimestamp() }, { merge: true });
  } else {
    batch.set(ref, {
      ...sanitizedData,
      uid,
      profileComplete: false,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    }, { merge: true });
  }
  stageContactPII(batch, uid, contactName, email);
  await batch.commit();
}

export async function updateBusinessProfile(
  uid: string,
  data: Partial<BusinessProfile>
): Promise<void> {
  assertAuthenticatedUser(uid);

  const { contactName, email, ...rest } = data;
  const sanitizedData: Partial<BusinessProfile> = { ...rest };
  if (sanitizedData.businessName) {
    sanitizedData.businessName = sanitizeText(sanitizedData.businessName, MAX_NAME_LENGTH);
  }
  if (sanitizedData.about) {
    sanitizedData.about = sanitizeText(sanitizedData.about, MAX_ABOUT_LENGTH);
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'businesses', uid), {
    ...sanitizedData,
    lastActive: serverTimestamp(),
  });
  stageContactPII(batch, uid, contactName, email);
  await batch.commit();
}

export async function completeBusinessProfile(uid: string): Promise<void> {
  assertAuthenticatedUser(uid);
  await updateDoc(doc(db, 'businesses', uid), {
    profileComplete: true,
    lastActive: serverTimestamp(),
  });
}

export async function getBusinessProfile(uid: string): Promise<BusinessProfile | null> {
  const [bizDoc, privDoc] = await Promise.all([
    getDoc(doc(db, 'businesses', uid)),
    // Contact PII is in a private subdoc — readable only by the owner/admin, so
    // this resolves for the account's own screens and is skipped otherwise.
    getDoc(doc(db, 'businesses', uid, 'private', 'contact')).catch(() => null),
  ]);
  if (!bizDoc.exists()) return null;
  const priv = privDoc && privDoc.exists() ? privDoc.data() : {};
  return { ...bizDoc.data(), ...priv } as BusinessProfile;
}
