# Security Specification — Hakam AI (حَكَم)

## 1. Data Invariants
1. **Family Ownership Invariant**: Every `families/{familyId}` document must have `familyId == request.auth.uid` and `data.ownerId == request.auth.uid`. Only verified signed-in users (`request.auth.token.email_verified == true`) may create or mutate documents.
2. **Relational Master Gate Invariant**: Every subcollection document (`players`, `games`, `events`, `proverbs`, `leaderboard`) must belong to an existing parent `families/{familyId}` owned by `request.auth.uid`, verified via `exists()`/`get()` on single-document operations and `resource.data.ownerId == request.auth.uid` on list queries.
3. **Strict Schema & Volumetric Bounds**: Every collection enforces exact allowed keys via `hasAll()` and `hasOnly()`, bounded string lengths (`<= maxLength`), bounded arrays (`badges.size() <= 10`), and regex ID guards (`^[a-zA-Z0-9_\-]+$`).
4. **Immutability Invariant**: `ownerId`, `familyId`, and `createdAt` can never be modified during `update` operations.

## 2. The "Dirty Dozen" Payloads
1. **Payload 1 (Identity Spoofing on Family)**: `{ ownerId: "other-uid", name: "Al Maktoum", ... }` -> Rejected (`ownerId != request.auth.uid`).
2. **Payload 2 (Unverified Email Write)**: Valid family payload sent by user with `email_verified: false` -> Rejected (`!isVerifiedUser()`).
3. **Payload 3 (Shadow Field Injection on Player)**: `{ ..., isAdmin: true }` -> Rejected (`!data.keys().hasOnly(...)`).
4. **Payload 4 (ID Poisoning Attack)**: Document ID with 200 characters or special characters `player/../../hack` -> Rejected (`!isValidId(playerId)`).
5. **Payload 5 (Denial of Wallet String Overflow)**: Player `name` with 5,000 characters -> Rejected (`data.name.size() > 60`).
6. **Payload 6 (Array Overflow on Badges)**: Player `badges` with 50 items -> Rejected (`data.badges.size() > 10`).
7. **Payload 7 (Orphaned Subcollection Write)**: Creating a player under a non-existent `families/{familyId}` -> Rejected (`!exists(...)`).
8. **Payload 8 (Cross-Family Subcollection Read)**: Reading `families/otherUid/players/p1` -> Rejected (`familyId != request.auth.uid`).
9. **Payload 9 (Update Gap / Type Poisoning)**: Updating `scoreA` on `games/{gameId}` with `"million"` (string instead of number) -> Rejected (`!isValidGame(incoming())`).
10. **Payload 10 (Immutable Field Tampering)**: Updating `createdAt` or `ownerId` on `players/{playerId}` -> Rejected (`incoming().createdAt != existing().createdAt`).
11. **Payload 11 (Unfiltered List Scraping)**: Listing `families/{familyId}/games` without `where('ownerId', '==', uid)` -> Rejected (`existing().ownerId == request.auth.uid`).
12. **Payload 12 (Invalid Enum Injection)**: Setting `language: "fr"` or `team: "C"` -> Rejected (`!(data.team in ['A', 'B'])`).
