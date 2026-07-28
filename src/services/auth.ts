import {
  PhoneAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  getAdditionalUserInfo,
  User,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { debugLog, debugError } from '../utils/debugLog';

const ISRAELI_MOBILE_REGEX = /^\+9725[0-9]{8}$/;

export async function verifyOTP(
  verificationId: string,
  otp: string
): Promise<User> {
  debugLog('AUTH', 'verify start', { otpLen: otp.length, hasVerificationId: !!verificationId });
  try {
    const credential = PhoneAuthProvider.credential(verificationId, otp);
    const userCredential = await signInWithCredential(auth, credential);
    // isNewUser distinguishes "signed up" from "signed back in" — the single most
    // useful fact when a flow lands on the wrong screen after verification. It must
    // come from getAdditionalUserInfo(): the modular SDK does NOT put
    // additionalUserInfo on the credential object, so reading it there is always
    // undefined (which is exactly what the first instrumented run logged).
    debugLog('AUTH', 'verify ok', {
      uid: userCredential.user.uid,
      isNewUser: getAdditionalUserInfo(userCredential)?.isNewUser ?? null,
    });
    return userCredential.user;
  } catch (err) {
    debugError('AUTH', 'verify', err);
    throw err;
  }
}

export async function signOut(): Promise<void> {
  debugLog('AUTH', 'sign out', { uid: auth.currentUser?.uid ?? null });
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
