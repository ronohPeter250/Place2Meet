import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { auth } from '../config/firebase';
import { AdminProfile } from './types';
import { assertActiveAdmin, loginAdmin, logoutAdmin } from './services';

interface AdminAuthState {
  user: User | null;
  admin: AdminProfile | null;
  isLoading: boolean;
  error: string | null;
}

interface AdminAuthContextType extends AdminAuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AdminAuthState>({ user: null, admin: null, isLoading: true, error: null });

  const loadAdmin = useCallback(async (user: User | null) => {
    if (!user) {
      setState({ user: null, admin: null, isLoading: false, error: null });
      return;
    }

    try {
      const admin = await assertActiveAdmin(user.uid);
      setState({ user, admin, isLoading: false, error: null });
    } catch {
      await logoutAdmin().catch(() => {});
      setState({ user: null, admin: null, isLoading: false, error: 'אין הרשאת אדמין למשתמש הזה' });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setState(prev => ({ ...prev, user, isLoading: true }));
      loadAdmin(user);
    });
    return unsubscribe;
  }, [loadAdmin]);

  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const user = await loginAdmin(email, password);
      await loadAdmin(user);
    } catch {
      setState({ user: null, admin: null, isLoading: false, error: 'ההתחברות נכשלה או שאין הרשאת אדמין' });
    }
  }, [loadAdmin]);

  const signOut = useCallback(async () => {
    await logoutAdmin();
    setState({ user: null, admin: null, isLoading: false, error: null });
  }, []);

  const refresh = useCallback(async () => {
    await loadAdmin(auth.currentUser);
  }, [loadAdmin]);

  const value = useMemo(() => ({ ...state, signIn, signOut, refresh }), [state, signIn, signOut, refresh]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextType {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return context;
}
