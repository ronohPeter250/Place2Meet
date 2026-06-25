import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AdminButton, AdminCard, AdminTextInput } from '../../src/admin/components/AdminControls';
import { useAdminAuth } from '../../src/admin/AdminAuthContext';
import { colors, typography } from '../../src/theme';

export default function AdminLogin() {
  const { admin, error, isLoading, signIn } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (admin) {
      router.replace('/admin/overview');
    }
  }, [admin, router]);

  const handleSubmit = async () => {
    await signIn(email, password);
  };

  return (
    <View style={styles.root}>
      <View style={styles.panel}>
        <Text style={styles.kicker}>Place2Meet Admin</Text>
        <Text style={styles.title}>כניסת מנהלים</Text>
        <AdminCard>
          <AdminTextInput label="אימייל" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <AdminTextInput label="סיסמה" value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          <AdminButton title="כניסה" onPress={handleSubmit} disabled={isLoading || !email.trim() || !password} />
        </AdminCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    gap: 14,
    maxWidth: 440,
    width: '100%',
  },
  kicker: {
    color: colors.primary,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
  },
  error: {
    color: colors.errorLight,
    textAlign: 'right',
  },
});
