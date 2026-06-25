import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/contexts/AuthContext';

export default function BusinessOnboardingLayout() {
  const { user, userType, isProfileComplete, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }
    // Only an in-progress business login belongs here: a customer-intent session
    // must not create a stray businesses/{uid} doc, and a completed business
    // should go straight to the business app.
    if (userType !== 'business' || isProfileComplete) {
      router.replace('/');
    }
  }, [user, userType, isProfileComplete, isLoading, router]);

  if (isLoading || !user || userType !== 'business' || isProfileComplete) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_left',
      }}
    />
  );
}
