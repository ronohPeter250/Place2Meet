import { Image } from 'expo-image';
import { StyleProp, ImageStyle } from 'react-native';

type Fit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

interface CachedImageProps {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: Fit;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  // Pass the uri on recycled list rows (chat list) so a row never briefly shows
  // the previous row's cached image while the new one resolves.
  recyclingKey?: string;
}

// Drop-in replacement for `<Image source={{ uri }} resizeMode="cover" />` at
// REMOTE (Firebase Storage) image sites. Backed by expo-image with a persistent
// memory+disk cache so the same photo loads instantly on re-entry and across app
// restarts, with a short fade instead of a hard pop-in. Callers keep their own
// placeholder <View> (this renders null when uri is empty), so there's no visual
// regression for missing photos.
// NOTE: do NOT use this inside the map's react-native-view-shot capture — the
// snapshot timing depends on RN Image's onLoad; those stay on RN <Image>.
export function CachedImage({
  uri,
  style,
  contentFit = 'cover',
  transition = 200,
  priority,
  recyclingKey,
}: CachedImageProps) {
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={recyclingKey}
    />
  );
}

// Warm the shared disk cache for a set of URLs ahead of time (e.g. upcoming swipe
// cards, the match photos, the map logos before the view-shot capture mounts).
export function prefetchImages(uris: (string | undefined | null)[]): void {
  const list = uris.filter((u): u is string => !!u);
  if (list.length > 0) void Image.prefetch(list);
}
