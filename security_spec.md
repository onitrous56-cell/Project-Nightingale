# AbleBridge Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Owner & PII Isolation**: Every user document (`/users/{userId}`) and private subcollection (`/users/{userId}/settings/{settingId}`, `/users/{userId}/stressLogs/{logId}`, `/users/{userId}/sosEvents/{eventId}`, `/users/{userId}/chatMessages/{messageId}`) contains medical notes, caregiver phone numbers, alert emails, avatars, PINs, GPS locations, or mental status entries. Only the authenticated, email-verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`) can read or write them.
2. **Master Gate Parent Integrity**: No subcollection record (`settings`, `stressLogs`, `sosEvents`, `chatMessages`) or `/remoteLinks/{accessCode}` write is permitted unless the parent `/users/{userId}` document exists.
3. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` cannot change after creation, and `createdAt` / `updatedAt` must strictly equal `request.time`.
4. **Terminal State Locking on SOS Events**: Once an `SosEvent` reaches status `'canceled'` or `'dispatched'`, no further updates are permitted.
5. **Bounded Arrays & Strings**: Every string enforces a `.size()` limit matching `firebase-blueprint.json` (including `avatarDataUrl <= 100000` bytes and `alertEmail <= 160` chars), and arrays (`disabilities` max 25, `enabledModules` 1..15) are size-bounded and element-type guarded.
6. **Zero Client Query Trust**: Every `allow list` rule evaluates `resource.data.ownerId == request.auth.uid` directly without `get()` or `exists()` lookups.
7. **Zero-Enumeration Remote Access Links (`/remoteLinks/{accessCode}`)**:
   - `allow list: if false;` prevents any client from enumerating active patient pair codes.
   - `allow get` requires an authenticated account (`isSignedIn()`) and exact 8-character code format (`^[A-Z0-9]{8}$`).
   - Documents store **no PII** (no phone numbers, no email addresses, no full medical notes, no PINs) — only first-name alias, consented coordinates, streak days, latest stress score, mood, and SOS status.
   - Only the email-verified owner (`incoming().ownerId == request.auth.uid`) may create, update, or delete their remote link.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Profile Read**: Unauthenticated client requests `get(/users/userA/settings/caregiverProfile)` -> `PERMISSION_DENIED`.
2. **Cross-User PII Snooping**: `userB` requests `get(/users/userA/settings/caregiverProfile)` -> `PERMISSION_DENIED`.
3. **Unverified Email Spoof**: `userA` with `email_verified: false` writes `/users/userA` -> `PERMISSION_DENIED`.
4. **OwnerId Identity Spoofing**: `userA` creates `/users/userA/stressLogs/log1` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
5. **Shadow Ghost Field Injection**: `userA` creates `/users/userA/stressLogs/log1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Backdated Timestamp Forgery**: `userA` creates `/users/userA/stressLogs/log1` with `createdAt: Timestamp(2020-01-01)` -> `PERMISSION_DENIED`.
7. **Orphaned Subcollection Write**: `userA` creates `/users/userA/stressLogs/log1` before `/users/userA` exists -> `PERMISSION_DENIED`.
8. **ID Poisoning (Resource Exhaustion)**: `userA` attempts `create` at `/users/userA/stressLogs/` + 200-char ID or invalid characters `../bad` -> `PERMISSION_DENIED`.
9. **Out-of-Bounds Value Poisoning**: `userA` writes `stressScore: 999` or a 10KB `triggerNote` -> `PERMISSION_DENIED`.
10. **Terminal State Violation on SOS Event**: `userA` attempts to update `/users/userA/sosEvents/ev1` from `'dispatched'` back to `'active'` -> `PERMISSION_DENIED`.
11. **Immutable Field Mutation**: `userA` updates `/users/userA/settings/caregiverProfile` attempting to alter `createdAt` or `ownerId` -> `PERMISSION_DENIED`.
12. **Blanket Remote Code Enumeration / Cross-User Hijack**: `userB` executes `list(/remoteLinks)` OR attempts `update(/remoteLinks/AB7K9M2P)` owned by `userA` -> `PERMISSION_DENIED`.
