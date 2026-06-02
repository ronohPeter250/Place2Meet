import { FieldValue, GeoPoint, Timestamp } from 'firebase/firestore';

export type AccountStatus = 'active' | 'suspended' | 'blocked' | 'deleted';
export type PhotoModerationStatus = 'pending' | 'approved' | 'rejected';
export type AdminRole = 'admin' | 'owner';
export type AdminAuditTargetType = 'user' | 'business';
export type AdminAuditAction =
  | 'status_change'
  | 'flag_change'
  | 'photo_moderation'
  | 'admin_notes_update'
  | 'business_create'
  | 'business_update';

export interface AdminProfile {
  uid: string;
  email: string;
  name?: string;
  role: AdminRole;
  active: boolean;
  createdAt?: Timestamp | FieldValue;
}

export interface AdminAuditLog {
  id?: string;
  adminId: string;
  adminEmail?: string;
  targetType: AdminAuditTargetType;
  targetId: string;
  action: AdminAuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: Timestamp | FieldValue;
}

export interface AdminManagedFields {
  accountStatus?: AccountStatus;
  flagged?: boolean;
  photoModeration?: Record<string, PhotoModerationStatus>;
  adminNotes?: string;
  updatedByAdminAt?: Timestamp | FieldValue;
  updatedByAdminId?: string;
}

export interface BusinessAdminFields {
  category?: string;
  accountStatus?: AccountStatus;
  updatedByAdminAt?: Timestamp | FieldValue;
  updatedByAdminId?: string;
}

export interface SelectedPlaceAddress {
  formattedAddress: string;
  coordinates: GeoPoint;
}
