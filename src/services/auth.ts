import {
  PhoneAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth } from '../config/firebase';

const ISRAELI_MOBILE_REGEX = /^\+9725[0-9]{8}$/;

export async function verifyOTP(
  verificationId: string,
  otp: string
): Promise<User> {
  const credential = PhoneAuthProvider.credential(verificationId, otp);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('972')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+972${cleaned.slice(1)}`;
  return `+972${cleaned}`;
}

export function validateIsraeliPhone(phone: string): boolean {
  return ISRAELI_MOBILE_REGEX.test(phone);
}

export function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-phone-number':
      return 'מספר טלפון לא תקין';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.';
    case 'auth/invalid-verification-code':
      return 'הקוד שהוזן לא נכון';
    case 'auth/code-expired':
      return 'הקוד פג תוקף. שלח קוד חדש.';
    case 'auth/network-request-failed':
      return 'שגיאת רשת. בדוק את החיבור לאינטרנט.';
    case 'auth/captcha-check-failed':
      return 'אימות נכשל. נסה שוב.';
    default:
      return 'שגיאה בלתי צפויה. נסה שוב.';
  }
}
