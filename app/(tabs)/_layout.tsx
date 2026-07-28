import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { CustomTabBar } from '../../src/components/ui/CustomTabBar';
import { NavProfileIcon, NavChatIcon, NavHomeIcon, NavSwipesIcon, NavEventsIcon } from '../../src/components/ui/SvgIcons';
import { subscribeToChats } from '../../src/services/chat';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const { user, userType, isLoading } = useAuth();
  const router = useRouter();
  // Matches == the user's chats. Subscribed once at the tab-bar level so the badge is
  // live on every screen rather than only where a screen happens to fetch it.
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    if (!user || userType === 'business') { setMatchCount(0); return; }
    const unsub = subscribeToChats((chats) => setMatchCount(chats.length));
    return () => unsub();
  }, [user, userType]);

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
          // Badge with the live match count, so the number is visible from anywhere in
          // the app — including while standing in a venue, which is when it matters.
          tabBarIcon: ({ color }) => (
            <View>
              <NavSwipesIcon color={color} />
              {matchCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{matchCount > 99 ? '99+' : matchCount}</Text>
                </View>
              )}
            </View>
          ),
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

const styles = StyleSheet.create({
  tabBadge: {
    position: 'absolute', top: -4, left: -8,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabBadgeText: { color: colors.white, fontFamily: 'Rubik_700Bold', fontSize: 11 },
});
