import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// allowsEditing is intentionally OFF everywhere: the native Android crop screen's
// confirm ("אישור") button is hidden/cut off on some devices, which left users
// unable to finish adding a photo. Images are rendered with resizeMode="cover"
// across the app (grid slots, swipe card, profile, venue/event cards, logo
// circle), so a forced 1:1 crop is unnecessary.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.8,
};

// Cap the longest edge before upload. Without the native crop, the picker
// returns full-resolution images; modern phones can produce >10MB files, which
// Firebase Storage rejects (10MB rule cap) and which waste bandwidth/memory.
// Since every display surface uses resizeMode="cover", downscaling to this
// bound is visually invisible.
const MAX_EDGE = 1280;

// Resize the asset so its longest edge is at most MAX_EDGE, re-encoding as JPEG.
// Images already within bounds are returned untouched (no needless re-encode),
// and any manipulation failure falls back to the original uri so a photo is
// never lost to a resize error.
async function downscale(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const { uri, width, height } = asset;
  if (!width || !height || Math.max(width, height) <= MAX_EDGE) {
    return uri;
  }
  try {
    const size = width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE };
    const image = await ImageManipulator.manipulate(uri).resize(size).renderAsync();
    const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return result.uri;
  } catch {
    return uri;
  }
}

async function resolveResult(result: ImagePicker.ImagePickerResult): Promise<string | null> {
  if (result.canceled || !result.assets[0]) return null;
  return downscale(result.assets[0]);
}

/**
 * Pick an existing image from the device gallery (downscaled before return).
 * Returns the image uri, or null if the user cancels or denies permission
 * (a Hebrew Alert is shown on denial).
 */
export async function pickFromGallery(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('נדרשת גישה', 'אנא אפשר גישה לגלריה בהגדרות המכשיר');
    return null;
  }
  return resolveResult(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
}

/**
 * Capture a new photo with the camera (downscaled before return). `facing:
 * 'front'` opens the selfie camera (the user can still flip in the native UI).
 * Returns the image uri, or null on cancel / permission denial.
 */
export async function captureFromCamera(facing: 'back' | 'front' = 'back'): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('נדרשת גישה', 'אנא אפשר גישה למצלמה בהגדרות המכשיר');
    return null;
  }
  return resolveResult(
    await ImagePicker.launchCameraAsync({
      ...PICKER_OPTIONS,
      cameraType: facing === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    }),
  );
}

export type PhotoSource = 'camera' | 'selfie' | 'gallery';

/** Resolve a PhotoSource selection to an image uri (or null on cancel/denial). */
export function pickImageFromSource(source: PhotoSource): Promise<string | null> {
  if (source === 'gallery') return pickFromGallery();
  return captureFromCamera(source === 'selfie' ? 'front' : 'back');
}
