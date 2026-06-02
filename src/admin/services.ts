import {
  collection,
  doc,
  documentId,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
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
  return {
    items: snap.docs.map(d => ({ uid: d.id, ...d.data() })) as BusinessProfile[],
    nextCursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
  };
}

export async function getBusinessForAdmin(uid: string): Promise<BusinessProfile | null> {
  const snap = await getDoc(doc(db, 'businesses', uid));
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as BusinessProfile) : null;
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
    contactName: input.contactName.trim(),
    businessName: input.businessName.trim(),
    email: input.email.trim(),
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
  batch.set(doc(collection(db, 'adminAuditLogs')), {
    ...admin,
    targetType: 'business',
    targetId: id,
    action: before.exists() ? 'business_update' : 'business_create',
    before: before.exists() ? before.data() : undefined,
    after: data,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return id;
}
