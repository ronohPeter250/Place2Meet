import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, TAB_BAR_BOTTOM_OFFSET } from '../components/ui/CustomTabBar';

/**
 * How much bottom space a tab screen must leave so its content is not covered by the
 * floating tab bar, measured for the CURRENT device rather than assumed.
 *
 * The bar is absolutely positioned at `insets.bottom + TAB_BAR_BOTTOM_OFFSET` and is
 * TAB_BAR_HEIGHT tall, so the space it occupies — from the physical bottom of the
 * screen to its top edge — is:
 *
 *     insets.bottom + TAB_BAR_BOTTOM_OFFSET + TAB_BAR_HEIGHT
 *
 * Call sites used to hardcode that sum as 100/110/120, which is only correct when
 * `insets.bottom` is 0. It is not 0 on any device with a gesture pill or a 3-button
 * navigation bar, and since targetSdk 35 Android forces edge-to-edge — so the inset
 * reaches the app instead of being consumed by the system. The shortfall equals
 * `insets.bottom` exactly (~48dp with 3-button navigation): enough to bury the chat
 * composer, which is fixed and therefore cannot be scrolled back into view.
 *
 * @param gap extra breathing room above the bar, on top of the clearance itself.
 */
export function useTabBarClearance(gap = 0): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_BOTTOM_OFFSET + TAB_BAR_HEIGHT + gap;
}
