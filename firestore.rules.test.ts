/**
 * Adversarial Security Rules Verification Specification (Dirty Dozen Suite)
 * Verifies all 12 adversarial payloads in security_spec.md are denied.
 */
export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Family',
    collectionPath: 'families/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2', name: 'Spoofed Family' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    collectionPath: 'families/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: { ownerId: 'user_1', name: 'Unverified Family' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Player',
    collectionPath: 'families/user_1/players/p1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', familyId: 'user_1', name: 'Sara', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'ID Poisoning Attack',
    collectionPath: 'families/user_1/players/invalid$id!',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', familyId: 'user_1', name: 'Sara' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Denial of Wallet String Overflow',
    collectionPath: 'families/user_1/players/p1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', familyId: 'user_1', name: 'A'.repeat(500) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Array Overflow on Badges',
    collectionPath: 'families/user_1/players/p1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', familyId: 'user_1', badges: new Array(20).fill('badge') },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Subcollection Write',
    collectionPath: 'families/non_existent/players/p1',
    operation: 'create',
    auth: { uid: 'non_existent', email_verified: true },
    payload: { ownerId: 'non_existent', familyId: 'non_existent', name: 'Ghost' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Cross-Family Subcollection Read',
    collectionPath: 'families/user_2/players/p1',
    operation: 'get',
    auth: { uid: 'user_1', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Update Gap / Type Poisoning',
    collectionPath: 'families/user_1/games/g1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { scoreA: 'invalid_number' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Tampering',
    collectionPath: 'families/user_1/players/p1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { createdAt: '2099-01-01T00:00:00.000Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unfiltered List Scraping',
    collectionPath: 'families/user_2/games',
    operation: 'list',
    auth: { uid: 'user_1', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Invalid Enum Injection',
    collectionPath: 'families/user_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { language: 'es' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
