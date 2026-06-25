import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  // @ts-expect-error -- getReactNativePersistence exists at runtime in RN
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

interface FirebaseConfigExtra {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function getFirebaseConfig(): FirebaseConfigExtra {
  // Prefer app.json extra.firebase (baked into bundle at build time, works in release APK).
  // Falls back to process.env for dev environments using .env files.
  const fromExtra = Constants.expoConfig?.extra?.firebase as FirebaseConfigExtra | undefined;
  if (fromExtra?.apiKey) {
    return fromExtra;
  }

  const fromEnv = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  if (!fromEnv.apiKey) {
    throw new Error(
      'Firebase config missing. Set expo.extra.firebase in app.json or EXPO_PUBLIC_FIREBASE_* env vars.'
    );
  }
  return fromEnv as FirebaseConfigExtra;
}

const app = getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApp();

let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
