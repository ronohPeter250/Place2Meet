import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { CustomTabBar } from '../../src/components/ui/CustomTabBar';
import { NavBusinessEventsIcon, NavBusinessDashboardIcon, NavBusinessProfileIcon } from '../../src/components/ui/SvgIcons';

export default function BusinessLayout() {
  const { user, userType, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }
    if (userType !== 'business') {
      router.replace('/');
    }
  }, [user, userType, isLoading, router]);

  if (isLoading || !user || userType !== 'business') return null;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="profile/index"
        options={{
          tabBarIcon: ({ color }) => <NavBusinessProfileIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="events/index"
        options={{
          tabBarIcon: ({ color }) => <NavBusinessEventsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ color }) => <NavBusinessDashboardIcon color={color} />,
        }}
      />

      {/* Hide sub-routes from tab bar */}
      <Tabs.Screen name="events/new" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="profile/edit" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}
