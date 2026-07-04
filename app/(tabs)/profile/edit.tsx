import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../src/components/layout/ScreenWrapper';
import { Header } from '../../../src/components/layout/Header';
import { Button } from '../../../src/components/ui/Button';
import { PhotoGrid } from '../../../src/components/ui/PhotoGrid';
import { getUserProfile, updateUserProfile, UserProfile } from '../../../src/services/users';
import { uploadUserPhoto } from '../../../src/services/storage';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, typography, spacing, borderRadius } from '../../../src/theme';
import { he } from '../../../src/i18n/he';
import { RelationshipType } from '../../../src/hooks/useOnboarding';
import { useFaceCheck } from '../../../src/services/faceDetection';

// Order from Figma: קשר רציני, ערב אחד, קשר ארוך
const REL_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: 'serious', label: he.onboarding.relationshipType.serious },
  { value: 'casual', label: he.onboarding.relationshipType.casual },
  { value: 'longTerm', label: he.onboarding.relationshipType.longTerm },
];

export default function EditProfileScreen() {
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

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [originalMain, setOriginalMain] = useState<string | undefined>(undefined);
  const [relationshipType, setRelationshipType] = useState<RelationshipType[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserProfile(user.uid);
        if (!cancelled && data) {
          setProfile(data);
          setBio(data.bio ?? '');
          setPhotos(data.photos ?? []);
          setOriginalMain(data.photos?.[0]);
          setRelationshipType(data.relationshipType ?? []);
        }
      } catch (err) {
        console.error('Failed to load profile for editing:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggleRelType = useCallback((value: RelationshipType) => {
    setRelationshipType(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!user || saving) return;

    // The main photo (index 0) must contain a face. Re-check whenever it changed
    // identity from the loaded profile — covers a newly-picked local photo AND a
    // remote photo that shifted into slot 0 after the original main was removed.
    const main = photos[0];
    if (main && main !== originalMain) {
      const ok = await checkFace(main);
      if (!ok) {
        Alert.alert('', he.onboarding.photos.faceRequired);
        return;
      }
    }

    setSaving(true);
    try {
      // Upload any new local photos
      const storagePaths = await Promise.all(
        photos.map(async (uri, index) => {
          if (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://')) {
            return uploadUserPhoto(user.uid, uri, index);
          }
          return uri; // Already a download URL
        })
      );

      // Convert storage paths to download URLs
      const { getPhotoURL } = await import('../../../src/services/storage');
      const downloadUrls = await Promise.all(
        storagePaths.map(p => p.startsWith('http') ? p : getPhotoURL(p))
      );

      await updateUserProfile(user.uid, {
        bio,
        photos: downloadUrls,
        relationshipType,
      });

      Alert.alert('נשמר', 'הפרופיל עודכן בהצלחה.');
      router.back();
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור. נסה שוב.');
    } finally {
      setSaving(false);
    }
  }, [user, bio, photos, relationshipType, saving, router, checkFace]);

  return (
    <ScreenWrapper dismissKeyboardOnTap={false}>
      <Header />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>{he.profile.editProfile}</Text>

        {/* My Photos */}
        <Text style={styles.sectionTitle}>{he.profile.myPhotos}</Text>
        <View style={styles.photosContainer}>
          <PhotoGrid
            photos={photos}
            onPhotosChange={setPhotos}
            validatePhoto={validatePhoto}
            validatingLabel={he.onboarding.photos.faceChecking}
          />
        </View>

        {/* About Me */}
        <Text style={styles.sectionTitle}>{he.profile.aboutMe}</Text>
        <TextInput
          style={styles.bioInput}
          value={bio}
          onChangeText={setBio}
          placeholder={he.onboarding.about.placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          textAlignVertical="top"
          textAlign="right"
          selectionColor={colors.primary}
        />

        {/* Relationship Type - chips per Figma 173:2444 */}
        <Text style={styles.sectionTitle}>{he.profile.relationshipLooking}</Text>
        <View style={styles.relTypeContainer}>
          {REL_OPTIONS.map(opt => {
            const selected = relationshipType.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.relChip, selected && styles.relChipSelected]}
                onPress={() => toggleRelType(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.relChipText, selected && styles.relChipTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Save button */}
        <Button
          title={he.common.save}
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
        />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  screenTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'right',
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.captionBold,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 24,
    marginBottom: 12,
  },
  photosContainer: {
    marginBottom: 8,
  },
  bioInput: {
    width: '100%',
    height: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    ...typography.body,
    color: colors.text,
  },
  relTypeContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  relChip: {
    height: 31,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relChipSelected: {
    borderColor: colors.primary,
  },
  relChipText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    color: colors.text,
  },
  relChipTextSelected: {
    color: colors.primary,
  },
  saveButton: {
    marginTop: 32,
  },
});
