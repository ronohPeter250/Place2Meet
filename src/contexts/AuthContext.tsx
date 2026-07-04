import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { doc, DocumentData, DocumentSnapshot, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { signOut as firebaseSignOut } from '../services/auth';
import { getLoginType, loadLoginType, subscribeLoginType } from '../services/loginState';
import { AccountStatus } from '../admin/types';
import { getEffectiveAccountStatus } from '../admin/utils';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isProfileComplete: boolean;
  userType: 'user' | 'business';
  accountStatus: AccountStatus;
}

interface AuthContextType extends AuthState {
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

type ProfileState = {
  profileComplete: boolean;
  accountStatus: AccountStatus;
};

// Both profiles are tracked independently. A single uid (phone number) may have
// a customer profile, a business profile, both, or neither. The active login
// type — not doc precedence — decides which one drives the session.
type Profiles = {
  user: ProfileState | null;
  business: ProfileState | null;
};

const EMPTY_PROFILES: Profiles = { user: null, business: null };

function profileStateFromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ProfileState | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    profileComplete: data?.profileComplete === true,
    accountStatus: getEffectiveAccountStatus(data?.accountStatus),
  };
}

// One-shot read of both profile docs (used by refreshProfile after onboarding).
async function readProfiles(uid: string): Promise<Profiles> {
  const [userDoc, businessDoc] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'businesses', uid)),
  ]);
  return {
    user: profileStateFromSnapshot(userDoc),
    business: profileStateFromSnapshot(businessDoc),
  };
}

// Live subscription to both profile docs; publishes only once both have
// reported at least once so the active selection is never based on a half-loaded
// pair.
function subscribeProfiles(
  uid: string,
  onChange: (profiles: Profiles) => void,
  onError: () => void,
): () => void {
  let userSeen = false;
  let businessSeen = false;
  let latestUser: DocumentSnapshot<DocumentData> | null = null;
  let latestBusiness: DocumentSnapshot<DocumentData> | null = null;

  const publishIfReady = () => {
    if (!userSeen || !businessSeen) return;
    onChange({
      user: latestUser ? profileStateFromSnapshot(latestUser) : null,
      business: latestBusiness ? profileStateFromSnapshot(latestBusiness) : null,
    });
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
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profiles | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [activeType, setActiveType] = useState<'user' | 'business'>(getLoginType());
  const [intentLoaded, setIntentLoaded] = useState(false);

  // Keep the active account type in sync with the persisted login type: restore
  // it on cold start, and react to changes when the user logs in choosing a
  // different option.
  useEffect(() => {
    let mounted = true;
    loadLoginType().then(type => {
      if (!mounted) return;
      setActiveType(type);
      setIntentLoaded(true);
    });
    const unsubscribe = subscribeLoginType(type => {
      if (mounted) setActiveType(type);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let latestCallId = 0;
    let unsubscribeProfiles: (() => void) | null = null;

    const unsubscribe = auth.onAuthStateChanged((nextUser) => {
      const callId = ++latestCallId;
      unsubscribeProfiles?.();
      unsubscribeProfiles = null;

      if (nextUser) {
        // Set the user immediately (profiles still loading) so consumers wait
        // for the Firestore status check before routing.
        setUser(nextUser);
        setProfiles(null);
        setAuthResolved(false);
        unsubscribeProfiles = subscribeProfiles(
          nextUser.uid,
          (nextProfiles) => {
            if (callId !== latestCallId) return;
            setUser(nextUser);
            setProfiles(nextProfiles);
            setAuthResolved(true);
          },
          () => {
            if (callId !== latestCallId) return;
            setUser(nextUser);
            // A transient listener error must NOT wipe an already-loaded profile
            // (that would bounce a signed-in user back to onboarding or clear a
            // blocked/status flag). Only fall back to EMPTY_PROFILES if nothing
            // has loaded yet.
            setProfiles(prev => prev ?? EMPTY_PROFILES);
            setAuthResolved(true);
          },
        );
      } else {
        if (callId !== latestCallId) return;
        setUser(null);
        setProfiles(null);
        setAuthResolved(true);
      }
    });

    return () => {
      latestCallId = Infinity;
      unsubscribeProfiles?.();
      unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const nextProfiles = await readProfiles(currentUser.uid);
    setUser(currentUser);
    setProfiles(nextProfiles);
    setAuthResolved(true);
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut();
    setUser(null);
    setProfiles(null);
    setAuthResolved(true);
  }, []);

  // Derive the session's account state from the ACTIVE login type. userType is
  // the chosen type; isProfileComplete / accountStatus come from that type's doc
  // (defaulting to "needs onboarding" when the doc for the chosen type is absent).
  const derived = useMemo(() => {
    const active = activeType === 'business' ? profiles?.business : profiles?.user;
    return {
      userType: activeType,
      isProfileComplete: active?.profileComplete ?? false,
      accountStatus: active?.accountStatus ?? 'active',
    };
  }, [activeType, profiles]);

  // Still loading until: auth state resolved, the persisted intent restored,
  // and (when signed in) the profile docs have arrived.
  const isLoading = !authResolved || !intentLoaded || (!!user && profiles === null);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isProfileComplete: derived.isProfileComplete,
      userType: derived.userType,
      accountStatus: derived.accountStatus,
      refreshProfile,
      logout,
    }),
    [user, isLoading, derived, refreshProfile, logout],
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
