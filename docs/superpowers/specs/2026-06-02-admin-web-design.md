# Place2Meet Admin Web Design

## Goal

Add a web admin system inside the existing Expo project under `/admin`. The admin system will use the existing Firebase project for authentication, Firestore data, Storage-backed photos, and Google Places address lookup.

The first implementation is an MVP without Cloud Functions. Admin actions update Firestore state only. Account deletion is soft deletion. Password/account operations against Firebase Auth users are out of scope for this MVP.

## Decisions Confirmed With User

- Admin app lives in the existing Expo Router project as `/admin` routes.
- Admin login uses Firebase Auth email/password.
- Admin authorization is checked through Firestore documents at `admins/{uid}`.
- MVP does not use Cloud Functions or Firebase Admin SDK.
- User blocking, suspension, and deletion are Firestore status fields, not Firebase Auth account mutations.

## Architecture

```text
app/admin/*
  -> admin screens and layout
  -> src/admin/* reusable admin components/hooks/services
  -> existing src/config/firebase.ts
  -> Firestore, Firebase Auth, Firebase Storage, Google Places
```

The admin feature should reuse the existing Firebase client setup from `src/config/firebase.ts`. It should not create a separate web app or duplicate Firebase config.

Admin-specific code should be isolated under `src/admin` where practical so mobile app screens remain unaffected.

## Admin Routes

```text
app/admin/index.tsx                 Dashboard / redirect
app/admin/login.tsx                 Email/password login
app/admin/users.tsx                 User management list
app/admin/users/[userId].tsx        User profile and moderation
app/admin/businesses.tsx            Business management list
app/admin/businesses/new.tsx        Create business
app/admin/businesses/[businessId].tsx Edit business
```

The `/admin` routes should use a simple web-friendly layout: sidebar or top navigation, dark theme aligned with the mobile app, Hebrew/right-aligned labels, and responsive tables/cards.

## Admin Authorization

Admin access is granted only when all are true:

1. Firebase Auth has a signed-in user.
2. Firestore contains `admins/{uid}`.
3. The admin document has `active: true`.

Admin document shape:

```ts
interface AdminProfile {
  uid: string;
  email: string;
  name?: string;
  role: 'admin' | 'owner';
  active: boolean;
  createdAt?: Timestamp | FieldValue;
}
```

If authorization fails, the admin app signs the user out and shows an access-denied message on `/admin/login`.

## Firestore Security Rules

Add a helper rule function equivalent to:

```js
function isAdmin() {
  return request.auth != null
    && exists(/databases/$(database)/documents/admins/$(request.auth.uid))
    && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.active == true;
}
```

Admin users can read and update `users`, `businesses`, moderation fields, and audit logs. Admins can create business documents for MVP business management.

The mobile app's existing owner restrictions remain for normal users and business owners.

## User Management

`/admin/users` shows all documents from `users` with:

- Name
- Age calculated from `birthday`
- City / location summary
- Account status
- Photos count
- Created date
- Last active date
- Flagged/suspicious marker

Filtering and search:

- Text search over name and city on the loaded result set.
- Status filter: `active`, `suspended`, `blocked`, `deleted`.
- Age range filter.
- Join date range filter when timestamps are present.

`/admin/users/[userId]` shows full profile details, photos, moderation controls, notes, and audit history.

User admin fields:

```ts
type AccountStatus = 'active' | 'suspended' | 'blocked' | 'deleted';
type PhotoModerationStatus = 'pending' | 'approved' | 'rejected';

interface UserAdminFields {
  accountStatus?: AccountStatus;
  flagged?: boolean;
  photoModeration?: Record<string, PhotoModerationStatus>;
  adminNotes?: string;
  updatedByAdminAt?: Timestamp | FieldValue;
  updatedByAdminId?: string;
}
```

MVP actions:

- View user profile.
- Set status: active / suspended / blocked / deleted.
- Mark or unmark as suspicious.
- Approve or reject individual photos.
- Edit admin notes.
- View basic audit history for that user.

Password reset for mobile users is not implemented in this MVP because mobile users authenticate by phone and Firebase Auth account management for other users requires Admin SDK or Cloud Functions.

## Mobile Enforcement Of User Status

The mobile app should check `accountStatus` after loading the authenticated user's profile.

Behavior:

- Missing `accountStatus` means active for backward compatibility.
- `active` allows normal app use.
- `suspended`, `blocked`, or `deleted` prevents app use and shows a blocked/suspended message with logout.

User lists used for swipes should exclude non-active users.

## Business Management

`/admin/businesses` shows all documents from `businesses` with:

- Business name
- Contact name
- Email
- Address
- Category
- Profile completion status
- Created date
- Last active date

Actions:

- Add business.
- Edit business name, contact name, email, address, opening hours, category, about text, and photos.
- Mark profile complete/incomplete.

Business admin fields:

```ts
interface BusinessAdminFields {
  category?: string;
  accountStatus?: AccountStatus;
  updatedByAdminAt?: Timestamp | FieldValue;
  updatedByAdminId?: string;
}
```

## Google Places Address Lookup

Business create/edit forms must not accept arbitrary un-geocoded addresses as the final saved location.

They should reuse the existing Google Places flow from `src/services/places.ts`:

1. Admin types an address.
2. UI shows Google autocomplete suggestions, restricted to Israel and Hebrew.
3. Admin selects a suggestion.
4. App fetches place details.
5. Firestore saves:
   - `location`: formatted address string
   - `coordinates`: Firestore `GeoPoint`

Manual typing can be used for search text only; saving requires a selected Google Place with coordinates.

## Photo Handling

MVP photo moderation updates Firestore metadata only. It does not delete Storage files.

For business editing, existing Storage ownership rules currently allow only the business owner to upload under `businesses/{businessId}`. Because this MVP has no Cloud Functions/Admin SDK, admin-side photo upload for businesses can either:

1. Save photo URL/path text when already available, or
2. Update Storage rules to allow admins to write business images.

The implementation should prefer option 2 if it can be done safely through `isAdmin()` in `storage.rules`.

## Audit Logs

Add `adminAuditLogs/{logId}` documents for admin actions:

```ts
interface AdminAuditLog {
  adminId: string;
  adminEmail?: string;
  targetType: 'user' | 'business';
  targetId: string;
  action:
    | 'status_change'
    | 'flag_change'
    | 'photo_moderation'
    | 'admin_notes_update'
    | 'business_create'
    | 'business_update';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: Timestamp | FieldValue;
}
```

Audit logs are append-only from the client. Existing logs are read-only.

## Error Handling

- Login failures show Hebrew error text.
- Unauthorized admin access signs out and shows an access-denied message.
- Firestore permission failures show a clear message that rules or admin permissions need checking.
- Google Places failures prevent saving a business address and show a retry message.
- Missing optional legacy fields are rendered as empty/unknown, not as crashes.

## Verification

Implementation should be verified with:

- TypeScript check (`npx tsc --noEmit`).
- Expo web bundling/start smoke check where practical.
- Manual admin flow smoke test:
  - Login rejects non-admin.
  - Login accepts `admins/{uid}.active == true`.
  - User list loads.
  - User status update writes Firestore and audit log.
  - Business form requires Google-selected address and saves coordinates.

## Out Of Scope For MVP

- Firebase Auth deletion/reset for other users.
- Cloud Functions.
- Server-side pagination/search indexing.
- Full role/permission matrix beyond `admin` and `owner`.
- Hard deletion of Storage photos.
- Production deployment setup for Firebase Hosting.

## Self-Review

- No placeholders or TBDs remain.
- MVP scope is limited to one implementation plan.
- Firebase Auth limitations are explicit.
- Business address geocoding is mandatory and tied to the existing Google Places service.
- Mobile enforcement requirements are included so admin status changes affect app usage.
