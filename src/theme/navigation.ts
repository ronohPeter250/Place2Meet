import { colors } from './colors';

export const sharedTabBarOptions = {
  headerShown: false,
  tabBarStyle: {
    backgroundColor: colors.navBackground,
    borderTopColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    height: 76,
    paddingHorizontal: 36,
    paddingVertical: 24,
    position: 'absolute' as const,
    bottom: 16,
    left: 17,
    right: 17,
    borderRadius: 40,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tabBarItemStyle: {
    gap: 0,
  },
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: '#9C9B99',
  tabBarShowLabel: false,
} as const;
