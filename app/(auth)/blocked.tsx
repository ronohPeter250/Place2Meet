import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Button } from '../../src/components/ui/Button';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography } from '../../src/theme';

export default function BlockedScreen() {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/welcome');
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>החשבון שלך אינו פעיל</Text>
          <Text style={styles.body}>אם לדעתך מדובר בטעות, פנה לתמיכה.</Text>
          <Button title="יציאה" onPress={handleLogout} />
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 18,
    padding: 24,
  },
  title: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'right',
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'right',
  },
});
