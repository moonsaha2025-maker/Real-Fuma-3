import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { RANK_ORDER } from '../data/cars';
import type { PlayerSaveData } from '../types/game';

const app = initializeApp(firebaseConfig);

function createFirestoreClient(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreClient();
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('the client is offline') ||
        error.message.includes('unavailable'))
    ) {
      console.warn('Firestore connection check deferred (offline or unavailable).');
    }
  }
}

if (typeof window !== 'undefined') {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener('online', () => {
      void testConnection();
    }, { once: true });
  } else {
    void testConnection();
  }
}

const inFlightAccountSync = new Map<string, Promise<void>>();

export async function syncPrivateAccountDoc(user: User): Promise<void> {
  const existingPromise = inFlightAccountSync.get(user.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const run = (async () => {
    const path = `users/${user.uid}/private/account`;
    const ref = doc(db, 'users', user.uid, 'private', 'account');
    let exists = false;
    try {
      const snap = await getDoc(ref);
      exists = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }

    const email = (user.email ?? '').slice(0, 320);
    const displayName = (user.displayName ?? 'Driver').slice(0, 120);
    const photoURL = (user.photoURL ?? '').slice(0, 512);

    try {
      if (!exists) {
        await setDoc(ref, {
          uid: user.uid,
          email,
          displayName,
          photoURL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          email,
          displayName,
          photoURL,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        exists ? OperationType.UPDATE : OperationType.CREATE,
        path,
      );
    }
  })().finally(() => {
    inFlightAccountSync.delete(user.uid);
  });

  inFlightAccountSync.set(user.uid, run);
  return run;
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

function clampNonNegative(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function buildCareerSavePayload(
  uid: string,
  save: PlayerSaveData,
): Omit<PlayerSaveData, 'driverAge'> & {
  uid: string;
  driverAge: number | null;
} {
  const ownedEntries = Object.entries(save.ownedCars ?? {}).slice(0, 25);
  const boundedOwnedCars: Record<string, PlayerSaveData['ownedCars'][string]> =
    {};
  for (const [k, v] of ownedEntries) {
    if (v) boundedOwnedCars[k] = stripUndefined(v);
  }

  const validRank = RANK_ORDER.includes(save.rank) ? save.rank : 'rookie';
  const cleanAge =
    typeof save.driverAge === 'number' && Number.isFinite(save.driverAge)
      ? Math.max(6, Math.min(120, Math.round(save.driverAge)))
      : null;

  return {
    uid,
    driverName: (save.driverName || 'FUMA_RACER').trim().slice(0, 18) || 'FUMA_RACER',
    driverAge: cleanAge,
    onboarded: Boolean(save.onboarded),
    money: clampNonNegative(save.money, 0),
    fumaShards: clampNonNegative(save.fumaShards, 0),
    totalFumaShardsCollected: clampNonNegative(save.totalFumaShardsCollected, 0),
    totalCashEarned: clampNonNegative(save.totalCashEarned, 0),
    bestNoBrakeDriftSec: clampNonNegative(save.bestNoBrakeDriftSec, 0),
    bestContinuousPlaySec: clampNonNegative(save.bestContinuousPlaySec, 0),
    claimedQuests: Array.isArray(save.claimedQuests)
      ? save.claimedQuests.slice(0, 20)
      : [],
    dailyLogin: {
      lastClaimDate: save.dailyLogin?.lastClaimDate ?? null,
      streakDay: clampNonNegative(save.dailyLogin?.streakDay, 0),
    },
    xp: clampNonNegative(save.xp, 0),
    reputation: clampNonNegative(save.reputation, 0),
    rank: validRank,
    activeCarId: (save.activeCarId || Object.keys(boundedOwnedCars)[0] || 'mclaren_765lt').slice(0, 64),
    ownedCars: boundedOwnedCars,
    completedEvents: Array.isArray(save.completedEvents)
      ? save.completedEvents.slice(0, 100)
      : [],
    unlockedRegions: Array.isArray(save.unlockedRegions)
      ? save.unlockedRegions.slice(0, 10)
      : ['sunset_coast'],
    achievements: Array.isArray(save.achievements)
      ? save.achievements.slice(0, 64)
      : [],
    stats: stripUndefined(save.stats),
    recentResults: Array.isArray(save.recentResults)
      ? stripUndefined(save.recentResults.slice(0, 20))
      : [],
    leaderboard: Array.isArray(save.leaderboard)
      ? stripUndefined(save.leaderboard.slice(0, 30))
      : [],
    settings: stripUndefined(save.settings),
  };
}

export async function loadCloudCareerSave(
  uid: string,
): Promise<Partial<PlayerSaveData> | null> {
  const path = `users/${uid}/saves/career`;
  const ref = doc(db, 'users', uid, 'saves', 'career');
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return {
      ...(data as unknown as Partial<PlayerSaveData>),
      driverAge:
        typeof data.driverAge === 'number' ? data.driverAge : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveCloudCareerSave(
  uid: string,
  save: PlayerSaveData,
): Promise<void> {
  const path = `users/${uid}/saves/career`;
  const ref = doc(db, 'users', uid, 'saves', 'career');

  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const payload = buildCareerSavePayload(uid, save);

  try {
    if (!exists) {
      const createDoc: Record<string, unknown | FieldValue> = {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, createDoc);
    } else {
      const { uid: _omitUid, ...mutableFields } = payload;
      void _omitUid;
      const updateDocPayload: Record<string, unknown | FieldValue> = {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(ref, updateDocPayload);
    }
  } catch (error) {
    handleFirestoreError(
      error,
      exists ? OperationType.UPDATE : OperationType.CREATE,
      path,
    );
  }
}

export async function deleteCloudCareerSave(uid: string): Promise<void> {
  const path = `users/${uid}/saves/career`;
  const ref = doc(db, 'users', uid, 'saves', 'career');
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
