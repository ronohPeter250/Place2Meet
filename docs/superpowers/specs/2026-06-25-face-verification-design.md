# Face Verification for Main Profile Photo — Design Spec

**Date:** 2026-06-25
**Status:** Approved design (pending written-spec review)
**Scope:** Place2Meet (React Native + Expo SDK 54 + Firebase), Hebrew RTL

---

## 1. Problem & Goal

When a user uploads their **main profile photo** (the first photo / avatar), the app must
ensure the image actually contains a **human face**. Photos with no detectable face
(landscapes, objects, backgrounds, blank images) must be rejected at the client, before the
photo is added/saved.

This is **face _detection_** ("is there a human face in this image?"), not identity
verification, not liveness/anti-spoofing, and not quality scoring.

### In scope
- Detect ≥1 human face in the image chosen for **photo index 0** (the main profile photo).
- Block adding/saving that photo if no face is detected; show a Hebrew message.
- Client-side, on-device, offline, free.

### Out of scope (explicitly decided)
- Other photos (indexes 1–5) — no face requirement; free content.
- Liveness / anti-spoofing (preventing a photo-of-a-photo or someone else's picture).
- Face quality rules (size, eyes-open, blur, single-vs-multiple face).
- Identity matching ("is this the same person?").
- Server-side enforcement (Firebase Storage rules / Cloud Functions). The check is
  best-effort client-side, as requested.

---

## 2. Decisions (resolved during brainstorming)

| Question | Decision |
|---|---|
| Which photos require a face? | **Only photo #1 (index 0)** — the main profile photo. |
| Verification level | **Simple: "there is a face"** only. No liveness, no quality checks. |
| Detection method | **On-device ML Kit** via `@infinitered/react-native-mlkit-face-detection` (Expo SDK 54 supported). |
| Behavior on **technical** detector failure | **Fail-open** (allow the photo) + `console.warn`. A model/engine glitch must never lock out real users. A definitive "no face" result still blocks. |
| Error UX | **No new screen.** Reuse the app's existing patterns: `Alert.alert` (Hebrew) for the blocking message — consistent with the existing photo-permission and upload-error alerts; an in-grid `ActivityIndicator` overlay (theme-colored) for the "checking" state. |

---

## 3. Current upload flow (as-is)

```
PhotoGrid (slot tap)
  → PhotoSourceSheet (camera / selfie / gallery)
  → pickImageFromSource(source)            // src/lib/imagePick.ts (downscales to ≤1280px JPEG)
  → returns local uri (file:// | content:// | ph://)
  → added to `photos` state in the screen
On "continue" / "save":
  → uploadUserPhoto(uid, uri, index)       // src/services/storage.ts → Firebase Storage
  → getPhotoURL(path) → updateUserProfile({ photos })   // Firestore
```

- `PhotoGrid` is **generic** and reused by user onboarding (`app/(onboarding)/photos.tsx`),
  profile edit (`app/(tabs)/profile/edit.tsx`), **and business screens**
  (`app/(business-onboarding)/photos.tsx`). The face rule must apply **only to the user's
  main photo**, never to business logos/photos.
- Photos fill slots in order; removing a photo uses `filter`, so the array **shifts** — the
  photo at index 0 can change without a new pick.

---

## 4. Architecture & Components

### 4.1 New: `src/services/faceDetection.ts`
A thin, imperative wrapper around the on-device ML Kit detector.

```ts
/**
 * Returns true if the image at `uri` contains at least one human face.
 * On a technical detection failure (engine not ready, native error), returns
 * true (fail-open) and logs a warning — a model glitch must not block real users.
 * A successful detection that finds zero faces returns false (blocking).
 */
export async function imageHasFace(uri: string): Promise<boolean>;
```

- Backed by `@infinitered/react-native-mlkit-face-detection` (Google ML Kit, on-device).
- **Open implementation detail:** the library's documented entry point for a static image is
  the `useFacesInPhoto(uri)` hook + a `useFaceDetection()` context. For an imperative
  one-shot call inside an async handler we prefer the underlying Expo **native module**
  method (no React context needed). The exact symbol will be confirmed by reading the
  installed package at implementation time. **Fallback:** if Infinite Red's imperative
  ergonomics are poor, switch to `@react-native-ml-kit/face-detection`, whose API is purely
  imperative (`FaceDetection.detect(uri) → faces[]`). Either way, `imageHasFace` is the
  stable seam the rest of the app depends on; the library choice stays behind it.
- If the chosen library requires a provider in the tree, add `<FaceDetectionProvider>` in
  `app/_layout.tsx` (inside `AuthProvider`). Not needed if a module-level API exists.

### 4.2 Changed: `src/components/ui/PhotoGrid.tsx`
Add an **optional** validation hook so the policy lives in the caller, keeping the grid generic.

```ts
interface PhotoGridProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  maxPhotos?: number;
  validatePhoto?: (uri: string, index: number) => Promise<{ ok: boolean; message?: string }>;
}
```

- In `handleSelectSource`, after `pickImageFromSource` resolves a `uri` and the target
  `index` is known:
  - If `validatePhoto` is provided, set a per-slot `validatingIndex` state (shows an
    `ActivityIndicator` overlay over that slot), then `await validatePhoto(uri, index)`.
  - If `ok === false`: do **not** add the photo; `Alert.alert` with `message` (or a default
    Hebrew string). Clear the validating state.
  - If `ok === true` (or no validator): add/replace as today.
- The existing re-entrancy guard (`pickingRef`) already serializes picks; validation runs
  inside the same guarded section so a fast double-tap can't bypass it.
- Business screens pass **no** `validatePhoto` → zero behavior change for them.

### 4.3 Changed: `app/(onboarding)/photos.tsx` and `app/(tabs)/profile/edit.tsx`
1. Pass a `validatePhoto` that enforces a face **only for index 0**:
   ```ts
   const validatePhoto = useCallback(async (uri: string, index: number) => {
     if (index !== 0) return { ok: true };
     const ok = await imageHasFace(uri);
     return { ok, message: he.onboarding.photos.faceRequired };
   }, []);
   ```
2. **Upload-time safety net** (authoritative gate, covers the array-shift edge case): before
   `updateUserProfile({ photos })`, if `photos[0]` is a **local** uri (`file://`/`content://`/`ph://`)
   re-run `imageHasFace(photos[0])`; if it returns false, `Alert.alert` the face message and
   abort the save. An already-uploaded `http(s)` photo at index 0 is skipped (it passed
   before). This keeps a deterministic guarantee even if pick-time UX is bypassed by a
   removal that promotes a different photo to slot 0.

### 4.4 Changed: `src/i18n/he.ts`
Add to the onboarding `photos` block (used by both onboarding and edit via `he.onboarding.photos`):
```ts
photos: {
  title: 'הוסף תמונות',
  subtitle: 'תוסיף לפחות 2 תמונות',
  faceRequired: 'התמונה הראשית חייבת להציג את הפנים שלך בבירור. בחר תמונה אחרת.',
  faceChecking: 'בודק תמונה…',
},
```

---

## 5. Data flow (to-be)

```
PhotoGrid slot 0 → pickImageFromSource → uri
  → validatePhoto(uri, 0) → imageHasFace(uri)
        ├─ false → Alert("…הפנים שלך בבירור…"), photo NOT added
        ├─ true  → photo added to grid
        └─ technical error → fail-open (true) + console.warn → photo added
"continue"/"save":
  → if photos[0] is local → imageHasFace(photos[0]) guard
        ├─ false → Alert + abort save
        └─ true  → uploadUserPhoto → getPhotoURL → updateUserProfile
```

---

## 6. Error handling & edge cases

| Case | Behavior |
|---|---|
| No face detected (slot 0) | Block add; Hebrew `Alert`. |
| Detector technical error | Fail-open (allow) + `console.warn`. |
| User cancels picker / denies permission | Unchanged (`pickImageFromSource` returns `null`). |
| Photo at index 0 removed → index 1 shifts to 0 | Caught by the upload-time safety net (§4.3.2). |
| Existing already-uploaded main photo (unchanged) | Skipped at upload (already `http`, passed before). |
| Business logo / business photos | No validator passed → never face-checked. |
| Validation in progress | Per-slot `ActivityIndicator` overlay; slot taps guarded by `pickingRef`. |

---

## 7. UI / Design (consistent with existing app, no new screen)

- **Blocking message:** `Alert.alert('', he.onboarding.photos.faceRequired)` — same mechanism
  already used for photo-permission denials (`src/lib/imagePick.ts`) and upload errors
  (`photos.tsx` / `edit.tsx`).
- **"Checking" indicator:** absolute-fill overlay on the validating slot using
  `rgba(0,0,0,0.6)` (matches `colors.overlay` / the existing `removeButton` overlay) with
  `<ActivityIndicator color={colors.primary} />` (same spinner/color used in
  `app/_layout.tsx`). Optional centered label `he.onboarding.photos.faceChecking` in
  `Rubik_500Medium`, `colors.white`. No Figma deviation — reuses existing tokens
  (`colors`, `typography`, RTL conventions).

---

## 8. Build & dependency implications

- New native dependency (`@infinitered/react-native-mlkit-face-detection`, Google ML Kit).
- Requires `expo prebuild` + a fresh native build. **Not** available in Expo Go.
  - Android APK build per project convention: **JDK 17** at
    `C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot`.
  - iOS (if targeted): `pod install`.
- Adds a few MB (ML Kit) to the binary.
- No change to Firebase Storage rules or Firestore (client-side feature only).

---

## 9. Testing (no mocks — per project policy)

Test on a **real device build**, with real images:
- A real selfie / portrait at slot 0 → **passes**, photo added & saved.
- A landscape / object / blank image at slot 0 → **blocked**, Hebrew alert.
- Slots 1–5 → any image allowed (no face check).
- Business onboarding logo/photos → unaffected.
- Remove the main photo so another shifts into slot 0 with no face → upload-time guard blocks.
- Simulate detector init failure → fail-open, photo allowed, warning logged.

After implementation: run the standard **5 rounds of agent-swarm code review**; all rounds
must be clean before the feature is considered done.

---

## 10. Files touched

| File | Change |
|---|---|
| `src/services/faceDetection.ts` | **New** — `imageHasFace(uri)` wrapper. |
| `src/components/ui/PhotoGrid.tsx` | Add optional `validatePhoto` prop + per-slot checking overlay. |
| `app/(onboarding)/photos.tsx` | Pass `validatePhoto` (index 0) + upload-time guard. |
| `app/(tabs)/profile/edit.tsx` | Pass `validatePhoto` (index 0) + upload-time guard. |
| `src/i18n/he.ts` | Add `faceRequired`, `faceChecking`. |
| `app/_layout.tsx` | Add `<FaceDetectionProvider>` **only if** the library requires it. |
| `package.json` / native config | Add ML Kit dependency; `expo prebuild`. |

`app/(business-onboarding)/photos.tsx` is intentionally **not** changed.
