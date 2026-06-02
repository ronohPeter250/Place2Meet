import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { doc, DocumentData, DocumentSnapshot, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { signOut as firebaseSignOut } from '../services/auth';
import { AccountStatus } from '../admin/types';
import { getEffectiveAccountStatus } from '../admin/utils';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isProfileComplete: boolean;
  userType: 'user' | 'business' | null;
  accountStatus: AccountStatus;
}

interface AuthContextType extends AuthState {
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

type ProfileState = {
  profileComplete: boolean;
  userType: 'user' | 'business' | null;
  accountStatus: AccountStatus;
};

const emptyProfileState: ProfileState = {
  profileComplete: false,
  userType: null,
  accountStatus: 'active',
};

function profileStateFromSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  userType: 'user' | 'business',
): ProfileState | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    profileComplete: data?.profileComplete === true,
    userType,
    accountStatus: getEffectiveAccountStatus(data?.accountStatus),
  };
}

async function checkUserStatus(uid: string): Promise<{
  profileComplete: boolean;
  userType: 'user' | 'business' | null;
  accountStatus: AccountStatus;
}> {
  const [userDoc, businessDoc] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'businesses', uid)),
  ]);
  if (userDoc.exists()) {
    const data = userDoc.data();
    return {
      profileComplete: data?.profileComplete === true,
      userType: 'user',
      accountStatus: getEffectiveAccountStatus(data?.accountStatus),
    };
  }
  if (businessDoc.exists()) {
    const data = businessDoc.data();
    return {
      profileComplete: data?.profileComplete === true,
      userType: 'business',
      accountStatus: getEffectiveAccountStatus(data?.accountStatus),
    };
  }
  return { profileComplete: false, userType: null, accountStatus: 'active' };
}

function subscribeProfileStatus(
  uid: string,
  onChange: (profile: ProfileState) => void,
  onError: () => void,
): () => void {
  let userSeen = false;
  let businessSeen = false;
  let latestUser: DocumentSnapshot<DocumentData> | null = null;
  let latestBusiness: DocumentSnapshot<DocumentData> | null = null;

  const publishIfReady = () => {
    if (!userSeen || !businessSeen) return;
    const userProfile = latestUser ? profileStateFromSnapshot(latestUser, 'user') : null;
    const businessProfile = latestBusiness ? profileStateFromSnapshot(latestBusiness, 'business') : null;
    onChange(userProfile ?? businessProfile ?? emptyProfileState);
  };

  const unsubscribeUser = onSnapshot(
    doc(db, 'users', uid),
    snapshot => {
      userSeen = true;
      latestUser = snapshot;
      publishIfReady();
    },
    onError,
  );
  const unsubscribeBusiness = onSnapshot(
    doc(db, 'businesses', uid),
    snapshot => {
      businessSeen = true;
      latestBusiness = snapshot;
      publishIfReady();
    },
    onError,
  );

  return () => {
    unsubscribeUser();
    unsubscribeBusiness();
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isProfileComplete: false,
    userType: null,
    accountStatus: 'active',
  });

  const refreshProfile = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const { profileComplete, userType, accountStatus } = await checkUserStatus(currentUser.uid);
    setState(prev => ({ ...prev, isProfileComplete: profileComplete, userType, accountStatus }));
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut();
    setState({ user: null, isLoading: false, isProfileComplete: false, userType: null, accountStatus: 'active' });
  }, []);

  useEffect(() => {
    let latestCallId = 0;
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribe = auth.onAuthStateChanged((user) => {
      const callId = ++latestCallId;
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      // Set user immediately with isLoading=true so consumers (e.g. index.tsx)
      // wait for the Firestore status check to complete before routing.
      // Without this, there's a race window where onAuthStateChanged fires with a
      // signed-in user but state still reads { user: null, isLoading: false } until
      // checkUserStatus resolves — causing a wrong redirect to /(auth)/welcome.
      if (user) {
        setState(prev => ({ ...prev, user, isLoading: true }));
      }

      if (user) {
        unsubscribeProfile = subscribeProfileStatus(
          user.uid,
          ({ profileComplete, userType, accountStatus }) => {
            if (callId !== latestCallId) return;
            setState({ user, isLoading: false, isProfileComplete: profileComplete, userType, accountStatus });
          },
          () => {
            if (callId !== latestCallId) return;
            setState({ user, isLoading: false, isProfileComplete: false, userType: null, accountStatus: 'active' });
          },
        );
      } else {
        if (callId !== latestCallId) return;
        setState({ user: null, isLoading: false, isProfileComplete: false, userType: null, accountStatus: 'active' });
      }
    });

    return () => {
      latestCallId = Infinity;
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ ...state, refreshProfile, logout }),
    [state, refreshProfile, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
