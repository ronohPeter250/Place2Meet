import { Stack } from 'expo-router';
import { AdminAuthProvider } from '../../src/admin/AdminAuthContext';
import { colors } from '../../src/theme';

export default function AdminLayout() {
  return (
    <AdminAuthProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </AdminAuthProvider>
  );
}
