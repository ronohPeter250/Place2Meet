import React from 'react';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// The floating bar's geometry, exported as the single source of truth. Screen content
// has to clear this bar, and the clearance was previously re-derived by hand at each
// call site as the literal 100/110/120 — which silently went wrong the moment the bar
// moved. useTabBarClearance() computes it from these; nothing should hardcode it again.
export const TAB_BAR_HEIGHT = 76;
export const TAB_BAR_BOTTOM_OFFSET = 24;

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navWidth = screenWidth - 32;

  const currentRoute = state.routes[state.index];
  const currentOptions = descriptors[currentRoute.key].options;
  if (currentOptions.tabBarStyle && (currentOptions.tabBarStyle as any).display === 'none') {
    return null;
  }

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + TAB_BAR_BOTTOM_OFFSET }]}>
      <View style={[styles.inner, { width: navWidth }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if (!options.tabBarIcon) return null;

          const isFocused = state.index === index;
          const tintColor = isFocused ? '#FF7043' : '#9C9B99';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
            >
              {options.tabBarIcon?.({ focused: isFocused, color: tintColor, size: 28 })}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // Overridden inline with the safe-area inset added; this is only the fallback.
    bottom: TAB_BAR_BOTTOM_OFFSET,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  inner: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    backgroundColor: 'rgba(35, 32, 30, 0.95)',
    borderRadius: 38,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_BAR_HEIGHT,
  },
});
