import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper';
import { Header } from '../../src/components/layout/Header';
import { Button } from '../../src/components/ui/Button';
import { PhotoGrid } from '../../src/components/ui/PhotoGrid';
import { PhotoSourceSheet } from '../../src/components/ui/PhotoSourceSheet';
import { pickImageFromSource, PhotoSource } from '../../src/lib/imagePick';
import { ProgressBar } from '../../src/components/ui/ProgressBar';
import { AddIcon } from '../../src/components/ui/SvgIcons';
import { uploadBusinessPhoto, uploadBusinessLogo, getPhotoURL } from '../../src/services/storage';
import { updateBusinessProfile, completeBusinessProfile } from '../../src/services/business';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, typography, spacing } from '../../src/theme';
import { he } from '../../src/i18n/he';
import { BUSINESS_TOTAL_STEPS } from '../../src/hooks/useBusinessOnboarding';

const MIN_PHOTOS = 2;

export default function BusinessPhotosScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const [photos, setPhotos] = useState<string[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoSheetVisible, setLogoSheetVisible] = useState(false);
  const logoPickingRef = useRef(false);

  const logoSize = useMemo(() => {
    const availableWidth = screenWidth - 32;
    return Math.floor((availableWidth - 12 * 2) / 3);
  }, [screenWidth]);

  const handleSelectLogoSource = useCallback(async (source: PhotoSource) => {
    if (logoPickingRef.current) {
      setLogoSheetVisible(false);
      return;
    }
    logoPickingRef.current = true;
    let uri: string | null = null;
    try {
      uri = await pickImageFromSource(source);
    } finally {
      logoPickingRef.current = false;
      setLogoSheetVisible(false);
    }
    if (uri) setLogo(uri);
  }, []);

  const handleFinish = useCallback(async () => {
    if (photos.length < MIN_PHOTOS || !user || loading) return;

    setLoading(true);
    try {
      // Upload only local photos (filter out already-uploaded URLs)
      const uploadPromises = photos.map(async (uri, index) => {
        if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://')) {
          return uploadBusinessPhoto(user.uid, uri, index);
        }
        return uri; // Already uploaded
      });
      const results = await Promise.allSettled(uploadPromises);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error('\u05D7\u05DC\u05E7 \u05DE\u05D4\u05EA\u05DE\u05D5\u05E0\u05D5\u05EA \u05DC\u05D0 \u05D4\u05D5\u05E2\u05DC\u05D5');
      }
      const storagePaths = results.map(
        r => (r as PromiseFulfilledResult<string>).value
      );

      // Convert storage paths to download URLs for display
      const downloadUrls = await Promise.all(
        storagePaths.map(path =>
          path.startsWith('http') ? path : getPhotoURL(path)
        )
      );

      // Upload logo if selected
      let logoUrl: string | undefined;
      if (logo && (logo.startsWith('file://') || logo.startsWith('content://') || logo.startsWith('ph://'))) {
        const logoPath = await uploadBusinessLogo(user.uid, logo);
        logoUrl = await getPhotoURL(logoPath);
      } else if (logo) {
        logoUrl = logo;
      }

      // Save photos, logo, and complete business profile
      await updateBusinessProfile(user.uid, {
        photos: downloadUrls,
        ...(logoUrl ? { logo: logoUrl } : {}),
      } as any);
      await completeBusinessProfile(user.uid);
      await refreshProfile();
      router.replace('/');
    } catch {
      Alert.alert('\u05E9\u05D2\u05D9\u05D0\u05D4', '\u05D0\u05D9\u05E8\u05E2\u05D4 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D4\u05E2\u05DC\u05D0\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D5\u05EA. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.');
    } finally {
      setLoading(false);
    }
  }, [photos, user, loading, router, refreshProfile]);

  return (
    <ScreenWrapper>
      <ProgressBar current={7} total={BUSINESS_TOTAL_STEPS} />

      <Header />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{he.businessOnboarding.photos.title}</Text>
          <Text style={styles.subtitle}>{he.businessOnboarding.photos.subtitle}</Text>
        </View>

        <View style={styles.gridContainer}>
          <PhotoGrid
            photos={photos}
            onPhotosChange={setPhotos}
          />
        </View>

        <View style={styles.logoSection}>
          <Text style={styles.logoTitle}>{he.businessOnboarding.photos.addLogo}</Text>
          <TouchableOpacity onPress={() => setLogoSheetVisible(true)} activeOpacity={0.7}>
            {logo ? (
              <Image source={{ uri: logo }} style={[styles.logoCircle, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]} resizeMode="cover" />
            ) : (
              <View style={[styles.logoCirclePlaceholder, { width: logoSize, height: logoSize, borderRadius: logoSize / 2 }]}>
                <AddIcon size={32} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={he.businessOnboarding.finish}
          onPress={handleFinish}
          loading={loading}
          disabled={loading}
        />
      </View>

      <PhotoSourceSheet
        visible={logoSheetVisible}
        onClose={() => setLogoSheetVisible(false)}
        onSelect={handleSelectLogoSource}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    marginTop: 32,
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
  logoSection: {
    marginTop: 32,
    alignItems: 'flex-end',
    gap: 12,
  },
  logoTitle: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
  },
  logoCirclePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  logoPlusIcon: {
    fontSize: 32,
    color: colors.primary,
    fontFamily: 'Rubik_400Regular',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xxxl,
  },
});
