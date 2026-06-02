import { Timestamp } from 'firebase/firestore';
import { AccountStatus } from './types';

export function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function calculateAgeFromBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;

  return age >= 0 && age <= 130 ? age : null;
}

export function getEffectiveAccountStatus(status?: AccountStatus): AccountStatus {
  return status ?? 'active';
}

export function isActiveAccount(status?: AccountStatus): boolean {
  return getEffectiveAccountStatus(status) === 'active';
}

export function accountStatusLabel(status?: AccountStatus): string {
  switch (getEffectiveAccountStatus(status)) {
    case 'active': return 'פעיל';
    case 'suspended': return 'מושהה';
    case 'blocked': return 'חסום';
    case 'deleted': return 'מחק';
  }
}

export function timestampToDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Timestamp
    ? value.toDate()
    : typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : null;

  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatTimestamp(value: unknown): string {
  const date = timestampToDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function includesSearch(source: string | null | undefined, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return normalizeSearchText(source).includes(q);
}

export function adminErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { code?: string; message?: string };
  const text = `${maybe.code ?? ''} ${maybe.message ?? ''}`.toLowerCase();
  if (text.includes('permission') || text.includes('insufficient') || maybe.code === 'permission-denied') {
    return `${fallback}. Check admin permissions and Firebase rules.`;
  }
  return fallback;
}

function normalizePhotoIdentity(photoUri: string): string {
  const trimmed = photoUri.trim();
  try {
    const url = new URL(trimmed);
    const storageObjectPrefix = '/o/';
    const storageObjectIndex = url.pathname.indexOf(storageObjectPrefix);
    if (url.hostname === 'firebasestorage.googleapis.com' && storageObjectIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(storageObjectIndex + storageObjectPrefix.length));
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return trimmed;
  }
}

export function photoModerationKey(photoUri: string): string {
  return `photo_${Array.from(normalizePhotoIdentity(photoUri))
    .map(char => char.codePointAt(0)?.toString(16).padStart(4, '0') ?? '0000')
    .join('')}`;
}
