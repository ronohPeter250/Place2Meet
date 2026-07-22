import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { CustomTabBar } from '../../src/components/ui/CustomTabBar';
import { NavProfileIcon, NavChatIcon, NavHomeIcon, NavSwipesIcon, NavEventsIcon } from '../../src/components/ui/SvgIcons';

export default function TabsLayout() {
  const { user, userType, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }
    // A business account must not land on the user tab group: it would render
    // the dating UI and write a users/{uid} doc via location/profile calls.
    if (userType === 'business') {
      router.replace('/');
    }
  }, [user, userType, isLoading, router]);

  if (isLoading || !user || userType === 'business') return null;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="profile/index"
        options={{
          tabBarIcon: ({ color }) => <NavProfileIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat/index"
        options={{
          tabBarIcon: ({ color }) => <NavChatIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="swipes"
        options={{
          tabBarIcon: ({ color }) => <NavSwipesIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="events/index"
        options={{
          tabBarIcon: ({ color }) => <NavEventsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarIcon: ({ color }) => <NavHomeIcon color={color} />,
        }}
      />

      {/* Hide sub-routes from tab bar */}
      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="profile/view" options={{ href: null }} />
      <Tabs.Screen name="chat/[chatId]" options={{ href: null }} />
      <Tabs.Screen name="venue/[venueId]" options={{ href: null }} />
      <Tabs.Screen name="user/[userId]" options={{ href: null }} />
    </Tabs>
  );
}
