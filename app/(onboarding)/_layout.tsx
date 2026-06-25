import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { colors } from '../../src/theme';
import { useAuth } from '../../src/contexts/AuthContext';

export default function OnboardingLayout() {
  const { user, userType, isProfileComplete, isLoading } = useAuth();
  const router = useRouter();

  // Prevent completed users — and business accounts — from entering the user
  // onboarding stack (a business here would create a stale users/{uid} doc).
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (isProfileComplete || userType === 'business') {
      router.replace('/');
    }
  }, [user, userType, isProfileComplete, isLoading, router]);

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
