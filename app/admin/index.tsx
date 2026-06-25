import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAdminAuth } from '../../src/admin/AdminAuthContext';
import { colors } from '../../src/theme';

export default function AdminIndex() {
  const { admin, isLoading } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(admin ? '/admin/overview' : '/admin/login');
  }, [admin, isLoading, router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
