import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { getLoginType, clearLoginType, loadLoginType } from '../src/services/loginState';
import { colors } from '../src/theme';

export default function Index() {
  const { user, isLoading, isProfileComplete, userType, accountStatus } = useAuth();
  const router = useRouter();
  const [loginTypeLoaded, setLoginTypeLoaded] = useState(false);

  useEffect(() => {
    loadLoginType().then(() => setLoginTypeLoaded(true));
  }, []);

  useEffect(() => {
    if (!loginTypeLoaded) return;
    const intent = getLoginType();
    console.log('INDEX: isLoading=', isLoading, 'user=', user?.uid, 'userType=', userType, 'intent=', intent);
    if (isLoading) return;

    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (accountStatus !== 'active') {
      router.replace('/(auth)/blocked');
      return;
    }

    // Business login intent - redirect to business onboarding for new users
    if (intent === 'business') {
      // Skip onboarding if already a complete business user
      if (userType === 'business' && isProfileComplete) {
        clearLoginType();
        router.replace('/(business)/events');
        return;
      }
      clearLoginType();
      router.replace('/(business-onboarding)/contact-name');
      return;
    }

    // Existing business user with complete profile
    if (userType === 'business' && isProfileComplete) {
      router.replace('/(business)/events');
      return;
    }

    // Existing business user with incomplete profile - resume onboarding
    if (userType === 'business' && !isProfileComplete) {
      router.replace('/(business-onboarding)/contact-name');
      return;
    }

    // User needs onboarding
    if (userType === null || !isProfileComplete) {
      router.replace('/(onboarding)/name');
      return;
    }

    router.replace('/(tabs)/map');
  }, [user, isLoading, isProfileComplete, userType, accountStatus, router, loginTypeLoaded]);

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
