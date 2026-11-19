/**
 * Phase 0 Adversarial Security Rule Verification Matrix for AbleBridge
 * Intended for validation against Firebase Rules Emulator (`@firebase/rules-unit-testing`)
 * verifying all Dirty Dozen + RemoteLink adversarial payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Caregiver Profile Read',
    collectionPath: '/users/userA/settings/caregiverProfile',
    operation: 'get',
    authUid: null,
    emailVerified: false,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-User PII Snooping',
    collectionPath: '/users/userA/settings/caregiverProfile',
    operation: 'get',
    authUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Token Write',
    collectionPath: '/users/userA',
    operation: 'create',
    authUid: 'userA',
    emailVerified: false,
    payload: {
      uid: 'userA',
      displayName: 'Alex Rivera',
      role: 'patient',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'OwnerId Identity Spoofing in StressLog',
    collectionPath: '/users/userA/stressLogs/log1',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userB',
      stressScore: 5,
      mood: 'calm',
      mentalStatus: 'stable',
      triggerNote: 'Quiet morning',
      copingAction: 'Breathing',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Ghost Field Injection',
    collectionPath: '/users/userA/stressLogs/log2',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userA',
      stressScore: 4,
      mood: 'calm',
      mentalStatus: 'stable',
      triggerNote: 'Test',
      copingAction: 'Rain audio',
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Backdated Client Timestamp Forgery',
    collectionPath: '/users/userA/stressLogs/log3',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userA',
      stressScore: 6,
      mood: 'anxious',
      mentalStatus: 'elevated_stress',
      triggerNote: 'Crowded hall',
      copingAction: 'Grounding',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Subcollection Write Without Parent User Doc',
    collectionPath: '/users/userNoParent/stressLogs/log4',
    operation: 'create',
    authUid: 'userNoParent',
    emailVerified: true,
    payload: {
      ownerId: 'userNoParent',
      stressScore: 3,
      mood: 'calm',
      mentalStatus: 'stable',
      triggerNote: '',
      copingAction: 'None',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Document ID Poisoning (>128 chars or path traversal)',
    collectionPath: `/users/userA/stressLogs/${'x'.repeat(180)}`,
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userA',
      stressScore: 2,
      mood: 'calm',
      mentalStatus: 'stable',
      triggerNote: 'ok',
      copingAction: 'ok',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Out-of-Bounds Value & String Exhaustion',
    collectionPath: '/users/userA/stressLogs/log5',
    operation: 'create',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      ownerId: 'userA',
      stressScore: 99,
      mood: 'calm',
      mentalStatus: 'stable',
      triggerNote: 'A'.repeat(2000),
      copingAction: 'None',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'SOS Terminal State Bypass (dispatched -> active)',
    collectionPath: '/users/userA/sosEvents/sos1',
    operation: 'update',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Immutable CreatedAt Mutation on Profile Update',
    collectionPath: '/users/userA/settings/caregiverProfile',
    operation: 'update',
    authUid: 'userA',
    emailVerified: true,
    payload: {
      createdAt: '2021-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'RemoteLinks Enumeration & Unauthenticated Read Probe',
    collectionPath: '/remoteLinks',
    operation: 'list',
    authUid: 'userB',
    emailVerified: true,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Cross-User RemoteLink Overwrite Hijack',
    collectionPath: '/remoteLinks/AB7K9M2P',
    operation: 'update',
    authUid: 'userB',
    emailVerified: true,
    payload: {
      ownerId: 'userB',
      lat: 0,
      lng: 0,
    },
    expected: 'PERMISSION_DENIED',
  },
];
