import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { colors } from '../src/theme';

export default function Index() {
  // userType reflects the ACTIVE login choice (customer vs business). The same
  // phone can own both accounts; the login screen decides which one is active,
  // and AuthContext reports that account's completion/status.
  const { user, isLoading, isProfileComplete, userType, accountStatus } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (accountStatus !== 'active') {
      router.replace('/(auth)/blocked');
      return;
    }

    if (userType === 'business') {
      router.replace(isProfileComplete ? '/(business)/events' : '/(business-onboarding)/contact-name');
      return;
    }

    router.replace(isProfileComplete ? '/(tabs)/map' : '/(onboarding)/name');
  }, [user, isLoading, isProfileComplete, userType, accountStatus, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
