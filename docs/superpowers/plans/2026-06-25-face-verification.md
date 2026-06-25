# Face Verification (Main Profile Photo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user uploads their main profile photo (index 0), verify on-device that the image contains a human face; block it with a Hebrew message if it doesn't.

**Architecture:** A new `useFaceCheck()` hook wraps Google ML Kit (on-device, via `@infinitered/react-native-mlkit-face-detection`) behind `FaceDetectionProvider`. The generic `PhotoGrid` gains an optional `validatePhoto` prop; the user onboarding and profile-edit screens pass a validator that runs face detection only for slot 0, plus an upload-time safety-net check on `photos[0]`. Business screens pass no validator and are unaffected.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript, Firebase (Storage + Firestore), `@infinitered/react-native-mlkit-face-detection` (Google ML Kit).

## Global Constraints

- **Scope:** face check applies **only to photo index 0** (the main profile photo). Slots 1–5: no check.
- **Fail-open:** on any *technical* detection failure (detector undefined, `result.success === false`, thrown error) → treat as **pass** (`true`) and `console.warn`. A successful detection with **zero faces** → **block** (`false`).
- **Out of scope:** liveness/anti-spoofing, face quality/size rules, identity matching, server-side enforcement. Do **not** add these.
- **Business screens untouched:** `app/(business-onboarding)/photos.tsx` must not receive a validator and must not change behavior.
- **UI:** no new screen. Blocking message via `Alert.alert` (Hebrew); "checking" state via an in-slot `ActivityIndicator` (`colors.primary`) over a `colors.overlay` background. Reuse existing theme tokens. Hebrew text is right-aligned per app convention.
- **No mocks:** verify behavior on a real device build, with real images. ML Kit is a native module — it does **not** run in Expo Go.
- **Build:** Android dev build via `npx expo run:android` with **JDK 17** at `C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot` (`$env:JAVA_HOME`). iOS (if targeted): `pod install` after prebuild.
- **Verification per task:** `npx tsc --noEmit` must pass (0 errors) after each code change; behavioral checks happen on the device build (Task 7).
- **Commit convention:** each commit message must end with the two required trailer lines:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DxEXcMJsLR3m2ifFeAxLTx
  ```
- **Branch:** the repo is on `main` with unrelated uncommitted WIP. Execute this plan on a dedicated branch (Task 1, Step 1). Stage only the files each task lists — never `git add -A`.
- **Definition of done:** after Task 7, run **5 consecutive rounds of agent-swarm code review**; all 5 must be clean before the feature is considered complete.

---

### Task 1: Add the ML Kit dependency, provider, and native build

**Files:**
- Modify: `package.json` (dependency added by installer)
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `FaceDetectionProvider` mounted around the navigation `Stack`, making `useFaceDetection()` available to all screens; the `@infinitered/react-native-mlkit-face-detection` package installed.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feature/face-verification
```

- [ ] **Step 2: Install the package**

```bash
npx expo install @infinitered/react-native-mlkit-face-detection
```
If npm reports a missing peer (e.g. `@infinitered/react-native-mlkit-core`), install it the same way. Use the version line compatible with Expo SDK 54 (RNMLKit 5.x). It is an Expo module (autolinked) — no `app.json` `plugins` entry is required unless the build later complains.

- [ ] **Step 3: Mount `FaceDetectionProvider` in the root layout**

In `app/_layout.tsx`, add the import:
```tsx
import { FaceDetectionProvider } from '@infinitered/react-native-mlkit-face-detection';
```
Wrap the `<Stack>` (inside `AuthProvider`):
```tsx
        <AuthProvider>
          <FaceDetectionProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_left',
              }}
            />
          </FaceDetectionProvider>
        </AuthProvider>
```
(Default detector options are correct for presence detection — fast mode, no landmarks/contours. Do not pass an `options` prop.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Produce a native dev build**

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot'
npx expo prebuild --clean
npx expo run:android
```
Expected: the app builds and launches on the device/emulator (this confirms the native ML Kit module links). Existing photo flows still work.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/_layout.tsx app.json
git commit -m "feat(photos): add on-device ML Kit face detection provider"
```
(Include `android/`/`ios/` only if prebuild generated them and they are tracked; otherwise omit.)

---

### Task 2: Add Hebrew strings

**Files:**
- Modify: `src/i18n/he.ts` (the `onboarding.photos` block, around line 64)

**Interfaces:**
- Consumes: nothing.
- Produces: `he.onboarding.photos.faceRequired` and `he.onboarding.photos.faceChecking` (strings).

- [ ] **Step 1: Add the two keys**

In `src/i18n/he.ts`, change the onboarding `photos` block from:
```ts
    photos: {
      title: 'הוסף תמונות',
      subtitle: 'תוסיף לפחות 2 תמונות',
    },
```
to:
```ts
    photos: {
      title: 'הוסף תמונות',
      subtitle: 'תוסיף לפחות 2 תמונות',
      faceRequired: 'התמונה הראשית חייבת להציג את הפנים שלך בבירור. בחר תמונה אחרת.',
      faceChecking: 'בודק תמונה…',
    },
```
(Do **not** edit the other `photos` block used by business onboarding, which has `addLogo`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/he.ts
git commit -m "feat(i18n): add face-check strings"
```

---

### Task 3: Create the `useFaceCheck` service

**Files:**
- Create: `src/services/faceDetection.ts`

**Interfaces:**
- Consumes: `useFaceDetection()` from `@infinitered/react-native-mlkit-face-detection` (returns a detector with `detectFaces(uri) => Promise<{ faces: unknown[]; success: boolean; error?: string } | undefined>`); requires `<FaceDetectionProvider>` in the tree (Task 1).
- Produces: `useFaceCheck(): (uri: string) => Promise<boolean>` — resolves `true` if ≥1 face or on technical failure (fail-open), `false` if detection succeeds with zero faces.

- [ ] **Step 1: Write the service**

Create `src/services/faceDetection.ts`:
```ts
import { useCallback } from 'react';
import { useFaceDetection } from '@infinitered/react-native-mlkit-face-detection';

/**
 * Hook returning a function that resolves true if the image at `uri` contains
 * at least one human face.
 *
 * Fail-open: on any technical detection failure (detector unavailable,
 * result.success === false, or a thrown error) it returns true and warns, so a
 * model/engine glitch never blocks a real user. A successful detection that
 * finds zero faces returns false (blocking).
 *
 * Must be called from a component rendered inside <FaceDetectionProvider>.
 */
export function useFaceCheck(): (uri: string) => Promise<boolean> {
  const detector = useFaceDetection();
  return useCallback(
    async (uri: string): Promise<boolean> => {
      try {
        const result = await detector?.detectFaces(uri);
        if (!result || result.success === false) {
          console.warn('[faceCheck] detector unavailable/failed — allowing photo (fail-open)');
          return true;
        }
        return (result.faces?.length ?? 0) > 0;
      } catch (err) {
        console.warn('[faceCheck] detection error — allowing photo (fail-open):', err);
        return true;
      }
    },
    [detector],
  );
}
```
If `tsc` reports that `detectFaces`/`success`/`faces` don't exist on the detector type, open the installed package's types (`node_modules/@infinitered/react-native-mlkit-face-detection`) and adjust the property access to the real `RNMLKitFaceDetectionResult` shape — the documented fields are `faces` (array), `success` (boolean), `error` (string). Keep the function signature `(uri: string) => Promise<boolean>` unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/faceDetection.ts
git commit -m "feat(photos): add useFaceCheck on-device detection hook"
```

---

### Task 4: Add `validatePhoto` support to `PhotoGrid`

**Files:**
- Modify: `src/components/ui/PhotoGrid.tsx`

**Interfaces:**
- Consumes: nothing new (validator is injected by the caller).
- Produces: two new optional props on `PhotoGrid` —
  `validatePhoto?: (uri: string, index: number) => Promise<{ ok: boolean; message?: string }>` and
  `validatingLabel?: string`. When `validatePhoto` returns `{ ok: false }`, the picked photo is **not** added and a Hebrew `Alert` is shown.

- [ ] **Step 1: Extend imports and props**

In `src/components/ui/PhotoGrid.tsx`, update the React Native import to include `ActivityIndicator` and `Alert`:
```tsx
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions, ActivityIndicator, Alert } from 'react-native';
```
Update the props interface:
```tsx
interface PhotoGridProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  validatePhoto?: (uri: string, index: number) => Promise<{ ok: boolean; message?: string }>;
  validatingLabel?: string;
}
```
Update the component signature destructuring:
```tsx
export const PhotoGrid = React.memo(function PhotoGrid({
  photos,
  onPhotosChange,
  maxPhotos = TOTAL_SLOTS,
  validatePhoto,
  validatingLabel,
}: PhotoGridProps) {
```

- [ ] **Step 2: Add validating state**

Below the existing `pendingIndex` state, add:
```tsx
  const [validatingIndex, setValidatingIndex] = useState<number | null>(null);
```

- [ ] **Step 3: Replace `handleSelectSource` with the validating version**

Replace the whole existing `handleSelectSource` callback with:
```tsx
  const handleSelectSource = useCallback(async (source: PhotoSource) => {
    const index = pendingIndex;
    if (index === null || pickingRef.current) {
      setSheetVisible(false);
      return;
    }
    pickingRef.current = true;
    try {
      let uri: string | null = null;
      try {
        uri = await pickImageFromSource(source);
      } finally {
        setSheetVisible(false);
        setPendingIndex(null);
      }
      if (!uri) return;

      if (validatePhoto) {
        setValidatingIndex(index);
        try {
          const { ok, message } = await validatePhoto(uri, index);
          if (!ok) {
            Alert.alert('', message ?? 'התמונה אינה תקינה. בחר תמונה אחרת.');
            return;
          }
        } finally {
          setValidatingIndex(null);
        }
      }

      const newPhotos = [...photos];
      if (index < photos.length) {
        newPhotos[index] = uri;
      } else {
        newPhotos.push(uri);
      }
      onPhotosChange(newPhotos.slice(0, maxPhotos));
    } finally {
      pickingRef.current = false;
    }
  }, [pendingIndex, photos, onPhotosChange, maxPhotos, validatePhoto]);
```
(Note: `pickingRef` now resets in the outer `finally`, so the re-entrancy guard stays held through validation — a fast double-tap can't start a second pick while a photo is being checked.)

- [ ] **Step 4: Render the checking overlay per slot**

Inside the `slots.map(...)` return, add the overlay as the last child of the slot `View` (after the `hasPhoto ? (...) : (...)` block, still inside the outer `<View key={index} ...>`):
```tsx
              {validatingIndex === index && (
                <View style={[styles.validatingOverlay, { width: slotSize, height: slotSize }]}>
                  <ActivityIndicator color={colors.primary} />
                  {validatingLabel ? <Text style={styles.validatingText}>{validatingLabel}</Text> : null}
                </View>
              )}
```

- [ ] **Step 5: Add the overlay styles**

In the `StyleSheet.create({...})`, add:
```ts
  validatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.sm,
    gap: 6,
  },
  validatingText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    color: colors.white,
  },
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/PhotoGrid.tsx
git commit -m "feat(photos): add optional validatePhoto + checking overlay to PhotoGrid"
```

---

### Task 5: Wire face check into onboarding photos screen

**Files:**
- Modify: `app/(onboarding)/photos.tsx`

**Interfaces:**
- Consumes: `useFaceCheck()` (Task 3), `PhotoGrid`'s `validatePhoto`/`validatingLabel` props (Task 4), `he.onboarding.photos.faceRequired`/`faceChecking` (Task 2).
- Produces: face enforcement on slot 0 at pick-time + a pre-upload safety-net check on `photos[0]`.

- [ ] **Step 1: Import the hook**

Add to the imports in `app/(onboarding)/photos.tsx`:
```tsx
import { useFaceCheck } from '../../src/services/faceDetection';
```

- [ ] **Step 2: Build the validator and the upload guard**

Inside `PhotosScreen`, after `const { user } = useAuth();`, add:
```tsx
  const checkFace = useFaceCheck();

  const validatePhoto = useCallback(
    async (uri: string, index: number) => {
      if (index !== 0) return { ok: true };
      const ok = await checkFace(uri);
      return { ok, message: he.onboarding.photos.faceRequired };
    },
    [checkFace],
  );
```
At the very start of `handleContinue`, **before** `setLoading(true)`, add the safety net:
```tsx
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
```
Add `checkFace` to the `handleContinue` dependency array.

- [ ] **Step 3: Pass the props to `PhotoGrid`**

Change:
```tsx
          <PhotoGrid
            photos={photos}
            onPhotosChange={setPhotos}
          />
```
to:
```tsx
          <PhotoGrid
            photos={photos}
            onPhotosChange={setPhotos}
            validatePhoto={validatePhoto}
            validatingLabel={he.onboarding.photos.faceChecking}
          />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. (`Alert` and `useCallback` are already imported in this file.)

- [ ] **Step 5: Commit**

```bash
git add "app/(onboarding)/photos.tsx"
git commit -m "feat(onboarding): enforce face on main profile photo"
```

---

### Task 6: Wire face check into profile-edit screen

**Files:**
- Modify: `app/(tabs)/profile/edit.tsx`

**Interfaces:**
- Consumes: same as Task 5.
- Produces: identical face enforcement (slot 0 pick-time + pre-save guard) in the edit flow.

- [ ] **Step 1: Import the hook**

Add to the imports in `app/(tabs)/profile/edit.tsx`:
```tsx
import { useFaceCheck } from '../../../src/services/faceDetection';
```

- [ ] **Step 2: Build the validator and the save guard**

Inside `EditProfileScreen`, after `const { user } = useAuth();`, add:
```tsx
  const checkFace = useFaceCheck();

  const validatePhoto = useCallback(
    async (uri: string, index: number) => {
      if (index !== 0) return { ok: true };
      const ok = await checkFace(uri);
      return { ok, message: he.onboarding.photos.faceRequired };
    },
    [checkFace],
  );
```
At the start of `handleSave`, **before** `setSaving(true)`, add:
```tsx
    // The main photo (index 0) must contain a face (covers removal-shift).
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
```
Add `checkFace` to the `handleSave` dependency array.

- [ ] **Step 3: Pass the props to `PhotoGrid`**

Change:
```tsx
          <PhotoGrid photos={photos} onPhotosChange={setPhotos} />
```
to:
```tsx
          <PhotoGrid
            photos={photos}
            onPhotosChange={setPhotos}
            validatePhoto={validatePhoto}
            validatingLabel={he.onboarding.photos.faceChecking}
          />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors. (`Alert` and `useCallback` are already imported in this file.)

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/profile/edit.tsx"
git commit -m "feat(profile): enforce face on main profile photo in edit"
```

---

### Task 7: Real-device verification & review gate

**Files:** none (verification only).

**Interfaces:**
- Consumes: the full feature (Tasks 1–6).
- Produces: a verified, review-clean feature.

- [ ] **Step 1: Build and run on a real device**

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot'
npx expo run:android
```

- [ ] **Step 2: Behavioral matrix (no mocks — real images)**

Verify each row:
1. Onboarding, slot 0 = a real selfie/portrait → photo is **added**; finishing uploads & saves.
2. Onboarding, slot 0 = a landscape/object/blank image → photo **rejected**; alert "…הפנים שלך בבירור…"; spinner ("בודק תמונה…") shows during the check.
3. Onboarding, slots 1–5 = any image (incl. non-face) → **allowed**.
4. Profile edit, replace slot 0 with a non-face image → **rejected**; with a face → accepted & saved.
5. Remove the slot-0 photo so a different (non-face) photo shifts into slot 0, then continue/save → **blocked** by the pre-upload guard.
6. Existing already-uploaded main photo, unchanged, save → **no** re-check, saves normally.
7. Business onboarding (`(business-onboarding)/photos.tsx`) logo & photos → **unaffected** (no face check, no spinner).

- [ ] **Step 3: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Run 5 rounds of agent-swarm code review**

Run the standard deep review (security, performance, bugs, race conditions, code quality, logic) for **5 consecutive rounds**. Fix every finding. All 5 rounds must come back clean before marking the feature done.

- [ ] **Step 5: Final commit (if any review fixes were made)**

```bash
git add -p
git commit -m "fix(photos): address review findings for face verification"
```

---

## Notes for the executor

- The one genuine unknown is the installed library's exact result type. Task 3, Step 1 tells you how to resolve it by reading the package types; the `(uri) => Promise<boolean>` seam stays stable regardless.
- If `useFaceDetection()` ergonomics turn out to be poor (e.g. the detector isn't ready synchronously), the documented fallback is `@react-native-ml-kit/face-detection` with a purely imperative `FaceDetection.detect(uri)` — swap it **behind** `useFaceCheck` without changing any caller.
- Keep `git add` scoped to each task's listed files; the repo has unrelated WIP on `main`.
