// Shared login state - separate from route files to avoid module duplication

import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGIN_TYPE_KEY = '@place2meet_login_type';

let _pendingVerificationId: string | null = null;
let _pendingPhone: string | null = null;
let _loginType: 'user' | 'business' = 'user';

// A single phone number (one Firebase uid) can own BOTH a customer profile
// (users/{uid}) and a business profile (businesses/{uid}). The login type chosen
// at the login screen decides which account the app opens for this session.
// Listeners let reactive consumers (AuthContext) re-resolve the active account
// when the login type changes (on login) or is restored from storage (cold start).
type LoginTypeListener = (type: 'user' | 'business') => void;
const loginTypeListeners = new Set<LoginTypeListener>();

function notifyLoginType() {
  loginTypeListeners.forEach(listener => listener(_loginType));
}

export function subscribeLoginType(listener: LoginTypeListener): () => void {
  loginTypeListeners.add(listener);
  return () => {
    loginTypeListeners.delete(listener);
  };
}

export function setPendingVerification(verificationId: string, phone: string) {
  _pendingVerificationId = verificationId;
  _pendingPhone = phone;
}

export function getPendingVerification() {
  return { verificationId: _pendingVerificationId, phone: _pendingPhone };
}

export function clearPendingVerification() {
  _pendingVerificationId = null;
  _pendingPhone = null;
}

export function setLoginType(type: 'user' | 'business') {
  _loginType = type;
  AsyncStorage.setItem(LOGIN_TYPE_KEY, type).catch(() => {});
  notifyLoginType();
}

export function getLoginType(): 'user' | 'business' {
  return _loginType;
}

export async function loadLoginType(): Promise<'user' | 'business'> {
  try {
    const stored = await AsyncStorage.getItem(LOGIN_TYPE_KEY);
    if (stored === 'business' || stored === 'user') {
      _loginType = stored;
    }
  } catch {
    // Ignore storage errors
  }
  notifyLoginType();
  return _loginType;
}

// Note: the persisted login type intentionally survives logout — on the next
// launch the app reopens the last-used account, and the login screen overwrites
// it via setLoginType when the user picks an option.
