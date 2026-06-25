import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAdminAuth } from '../AdminAuthContext';
import { colors, typography } from '../../theme';

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { admin, isLoading, signOut } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (!isLoading && !admin && !isLogin) {
      router.replace('/admin/login');
    }
  }, [admin, isLoading, isLogin, router]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!admin && !isLogin) {
    return null;
  }

  return (
    <View style={styles.root}>
      {admin ? (
        <View style={styles.nav}>
          <View style={styles.navLinks}>
            <NavButton title="סטטיסטיקות" active={pathname.startsWith('/admin/overview')} onPress={() => router.push('/admin/overview')} />
            <NavButton title="משתמשים" active={pathname.startsWith('/admin/users')} onPress={() => router.push('/admin/users')} />
            <NavButton title="עסקים" active={pathname.startsWith('/admin/businesses')} onPress={() => router.push('/admin/businesses')} />
          </View>
          <View style={styles.identity}>
            <Text style={styles.email}>{admin.email}</Text>
            <Pressable onPress={signOut} style={styles.logout}>
              <Text style={styles.logoutText}>יציאה</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </ScrollView>
    </View>
  );
}

function NavButton({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      <Text style={[styles.navText, active && styles.navTextActive]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  nav: {
    alignItems: 'center',
    backgroundColor: colors.navBackground,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  navLinks: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  navButton: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  navButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  navText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  navTextActive: {
    color: colors.white,
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row-reverse',
    gap: 12,
  },
  email: {
    color: colors.textSecondary,
  },
  logout: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: {
    color: colors.text,
    fontWeight: '700',
  },
  content: {
    gap: 18,
    marginHorizontal: 'auto',
    maxWidth: 1180,
    padding: 24,
    width: '100%',
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'right',
  },
});
