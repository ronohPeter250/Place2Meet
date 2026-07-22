import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { PhotoGrid } from '../../src/components/ui/PhotoGrid';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { uploadUserPhoto } from '../../src/services/storage';
import { updateUserProfile } from '../../src/services/users';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { TOTAL_STEPS } from '../../src/hooks/useOnboarding';
import { useFaceCheck } from '../../src/services/faceDetection';

const MIN_PHOTOS = 2;

export default function PhotosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const checkFace = useFaceCheck();

  const validatePhoto = useCallback(
    async (uri: string, index: number) => {
      if (index !== 0) return { ok: true };
      const ok = await checkFace(uri);
      return { ok, message: he.onboarding.photos.faceRequired };
    },
    [checkFace],
  );

  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Surface the "at least 2 photos" requirement instead of silently doing nothing
  // when the user taps Continue with too few photos.
  const [photoError, setPhotoError] = useState(false);

  const handlePhotosChange = useCallback((next: string[]) => {
    setPhotos(next);
    if (next.length >= MIN_PHOTOS) setPhotoError(false);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!user || loading) return;
    if (photos.length < MIN_PHOTOS) {
      setPhotoError(true);
      return;
    }

    // The main photo (index 0) must contain a face. Re-check here in case the
    // original main photo was removed and another shifted into slot 0.
    const main = photos[0];
    const mainIsLocal =
      !!main &&
      (main.startsWith('file://') || main.startsWith('content://') || main.startsWith('ph://'));
    if (mainIsLocal) {
      const ok = await checkFace(main);
      if (!ok) {
        Alert.alert('', he.onboarding.photos.faceRequired);
        return;
      }
    }

    setLoading(true);
    try {
      // Upload only local photos (filter out already-uploaded URLs)
      const uploadPromises = photos.map(async (uri, index) => {
        if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://')) {
          return uploadUserPhoto(user.uid, uri, index);
        }
        return uri; // Already uploaded
      });
      const results = await Promise.allSettled(uploadPromises);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error('חלק מהתמונות לא הועלו');
      }
      const storagePaths = results.map(
        r => (r as PromiseFulfilledResult<string>).value
      );

      // Convert storage paths to download URLs for display
      const { getPhotoURL } = await import('../../src/services/storage');
      const downloadUrls = await Promise.all(
        storagePaths.map(path =>
          path.startsWith('http') ? path : getPhotoURL(path)
        )
      );

      await updateUserProfile(user.uid, { photos: downloadUrls });
      router.push('/(onboarding)/birthday');
    } catch {
      Alert.alert('שגיאה', 'אירעה שגיאה בהעלאת התמונות. נסה שוב.');
    } finally {
      setLoading(false);
    }
  }, [photos, user, loading, router, checkFace]);

  return (
    <ScreenWrapper>
      <ProgressBar current={7} total={TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.onboarding.photos.title}</Text>
          <Text style={styles.subtitle}>{he.onboarding.photos.subtitle}</Text>
        </View>

        {/* Photo grid - 3x2 grid, 106x106 slots from Figma */}
        <View style={styles.gridContainer}>
          <PhotoGrid
            photos={photos}
            onPhotosChange={handlePhotosChange}
            validatePhoto={validatePhoto}
            validatingLabel={he.onboarding.photos.faceChecking}
          />
        </View>

        {photos.length < MIN_PHOTOS && (
          <Text style={[styles.photoHint, photoError && styles.photoHintError]}>
            יש להעלות לפחות {MIN_PHOTOS} תמונות כדי להמשיך ({photos.length}/{MIN_PHOTOS})
          </Text>
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={he.onboarding.continue}
          onPress={handleContinue}
          loading={loading}
          disabled={loading}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    width: '100%',
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    lineHeight: 21,
  },
  gridContainer: {
    marginTop: 32,
  },
  photoHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 16,
  },
  photoHintError: {
    color: colors.primary,
    fontFamily: 'Rubik_600SemiBold',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
