import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getCarSpec, RANK_ORDER } from '../data/cars';
import type {
  CarCustomization,
  OnlinePlayerState,
  OnlineRoom,
  PlayerSaveData,
  RegionId,
  TimeOfDay,
  WeatherType,
} from '../types/game';
import { auth, db, handleFirestoreError, OperationType } from './firebase';

const VALID_REGIONS: readonly RegionId[] = [
  'sunset_coast',
  'palm_canyon',
  'alpine_pass',
  'fujimi_bay',
];
const VALID_WEATHERS: readonly WeatherType[] = [
  'sunny',
  'cloudy',
  'rain',
  'heavy_rain',
  'thunderstorm',
  'fog',
];
const VALID_TIMES: readonly TimeOfDay[] = ['sunrise', 'day', 'sunset', 'night'];
const VALID_FINISHES: readonly CarCustomization['paintFinish'][] = [
  'gloss',
  'metallic',
  'matte',
];
const VALID_SPOILERS: readonly CarCustomization['spoiler'][] = [
  'none',
  'lip',
  'gt_wing',
  'swan_neck',
];
const VALID_BODYKITS: readonly CarCustomization['bodyKit'][] = [
  'stock',
  'street',
  'widebody_gt',
];

function clamp(v: number, min: number, max: number, fallback = 0): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  if (
    ts !== null &&
    typeof ts === 'object' &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FM${suffix}`;
}

export function getGooglePublicIdentity(
  user: User,
  driverName: string,
): {
  googleDisplayName: string;
  googlePhotoURL: string;
  cleanDriverName: string;
} {
  const fallbackFromEmail = user.email ? user.email.split('@')[0] : 'Google Driver';
  const googleDisplayName =
    (user.displayName || fallbackFromEmail || 'Google Driver')
      .trim()
      .slice(0, 80) || 'Google Driver';
  const googlePhotoURL = (user.photoURL || '').slice(0, 512);
  const cleanDriverName =
    (driverName || googleDisplayName || 'FUMA_RACER')
      .trim()
      .slice(0, 18) || 'FUMA_RACER';

  return { googleDisplayName, googlePhotoURL, cleanDriverName };
}

function mapDocToRoom(data: Record<string, unknown>, id: string): OnlineRoom {
  const regionId = VALID_REGIONS.includes(data.regionId as RegionId)
    ? (data.regionId as RegionId)
    : 'sunset_coast';
  const weather = VALID_WEATHERS.includes(data.weather as WeatherType)
    ? (data.weather as WeatherType)
    : 'sunny';
  const timeOfDay = VALID_TIMES.includes(data.timeOfDay as TimeOfDay)
    ? (data.timeOfDay as TimeOfDay)
    : 'day';
  const status =
    data.status === 'active' || data.status === 'closed' ? data.status : 'open';

  return {
    roomId: typeof data.roomId === 'string' ? data.roomId : id,
    name: typeof data.name === 'string' ? data.name : 'Highway Cruise',
    hostUid: typeof data.hostUid === 'string' ? data.hostUid : '',
    hostDisplayName:
      typeof data.hostDisplayName === 'string'
        ? data.hostDisplayName
        : 'Google Driver',
    hostPhotoURL: typeof data.hostPhotoURL === 'string' ? data.hostPhotoURL : '',
    isPublic: Boolean(data.isPublic),
    status,
    regionId,
    weather,
    timeOfDay,
    maxPlayers:
      typeof data.maxPlayers === 'number' && Number.isFinite(data.maxPlayers)
        ? data.maxPlayers
        : 8,
    createdAtMs: timestampToMs(data.createdAt),
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

function mapDocToPlayer(
  data: Record<string, unknown>,
  docId: string,
): OnlinePlayerState {
  return {
    uid: typeof data.uid === 'string' ? data.uid : docId,
    roomId: typeof data.roomId === 'string' ? data.roomId : '',
    googleDisplayName:
      typeof data.googleDisplayName === 'string'
        ? data.googleDisplayName
        : 'Google Driver',
    googlePhotoURL:
      typeof data.googlePhotoURL === 'string' ? data.googlePhotoURL : '',
    driverName:
      typeof data.driverName === 'string' ? data.driverName : 'FUMA_RACER',
    rank: RANK_ORDER.includes(data.rank as PlayerSaveData['rank'])
      ? (data.rank as PlayerSaveData['rank'])
      : 'rookie',
    carId: typeof data.carId === 'string' ? data.carId : 'mclaren_765lt',
    paintColor:
      typeof data.paintColor === 'string' ? data.paintColor : '#ef4444',
    paintFinish: VALID_FINISHES.includes(
      data.paintFinish as CarCustomization['paintFinish'],
    )
      ? (data.paintFinish as CarCustomization['paintFinish'])
      : 'metallic',
    spoiler: VALID_SPOILERS.includes(data.spoiler as CarCustomization['spoiler'])
      ? (data.spoiler as CarCustomization['spoiler'])
      : 'none',
    bodyKit: VALID_BODYKITS.includes(data.bodyKit as CarCustomization['bodyKit'])
      ? (data.bodyKit as CarCustomization['bodyKit'])
      : 'stock',
    x: typeof data.x === 'number' ? data.x : 0,
    y: typeof data.y === 'number' ? data.y : 0,
    z: typeof data.z === 'number' ? data.z : 0,
    heading: typeof data.heading === 'number' ? data.heading : 0,
    vx: typeof data.vx === 'number' ? data.vx : 0,
    vz: typeof data.vz === 'number' ? data.vz : 0,
    speedKmh: typeof data.speedKmh === 'number' ? data.speedKmh : 0,
    steerAngle: typeof data.steerAngle === 'number' ? data.steerAngle : 0,
    braking: Boolean(data.braking),
    nitroActive: Boolean(data.nitroActive),
    headlightsOn: Boolean(data.headlightsOn),
    s: typeof data.s === 'number' ? data.s : 0,
    updatedAtMs: timestampToMs(data.updatedAt),
  };
}

export function subscribePublicRooms(
  onRooms: (rooms: OnlineRoom[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const path = 'online_rooms';
  const q = query(
    collection(db, path),
    where('isPublic', '==', true),
    where('status', 'in', ['open', 'active']),
    limit(20),
  );

  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const fourHoursMs = 4 * 60 * 60 * 1000;
      const list = snap.docs
        .map((d) => mapDocToRoom(d.data() as Record<string, unknown>, d.id))
        .filter((r) => now - r.updatedAtMs < fourHoursMs)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onRooms(list);
    },
    (error) => {
      onError?.(error);
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeRoom(
  roomId: string,
  onRoom: (room: OnlineRoom | null) => void,
  onError?: (err: unknown) => void,
): () => void {
  const cleanId = normalizeRoomCode(roomId);
  const path = `online_rooms/${cleanId}`;
  return onSnapshot(
    doc(db, 'online_rooms', cleanId),
    (snap) => {
      if (!snap.exists()) {
        onRoom(null);
        return;
      }
      onRoom(mapDocToRoom(snap.data() as Record<string, unknown>, snap.id));
    },
    (error) => {
      onError?.(error);
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export function subscribeRoomPlayers(
  roomId: string,
  onPlayers: (players: OnlinePlayerState[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const cleanId = normalizeRoomCode(roomId);
  const path = `online_rooms/${cleanId}/players`;
  const q = query(
    collection(db, 'online_rooms', cleanId, 'players'),
    where('roomId', '==', cleanId),
    limit(16),
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) =>
        mapDocToPlayer(d.data() as Record<string, unknown>, d.id),
      );
      onPlayers(list);
    },
    (error) => {
      onError?.(error);
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function findOnlineRoom(roomId: string): Promise<OnlineRoom | null> {
  const cleanId = normalizeRoomCode(roomId);
  if (cleanId.length < 4) return null;
  const path = `online_rooms/${cleanId}`;
  try {
    const snap = await getDoc(doc(db, 'online_rooms', cleanId));
    if (!snap.exists()) return null;
    const room = mapDocToRoom(snap.data() as Record<string, unknown>, snap.id);
    if (room.status === 'closed') return null;
    return room;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createOnlineRoom(params: {
  name: string;
  isPublic: boolean;
  regionId: RegionId;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  maxPlayers?: number;
}): Promise<OnlineRoom> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Google sign-in is required for Online Mode.');
  }

  const roomId = generateRoomCode();
  const path = `online_rooms/${roomId}`;
  const { googleDisplayName, googlePhotoURL } = getGooglePublicIdentity(
    user,
    user.displayName || 'Driver',
  );

  const cleanName =
    params.name.trim().slice(0, 40) || `${googleDisplayName}'s Session`;
  const regionId = VALID_REGIONS.includes(params.regionId)
    ? params.regionId
    : 'sunset_coast';
  const weather = VALID_WEATHERS.includes(params.weather)
    ? params.weather
    : 'sunny';
  const timeOfDay = VALID_TIMES.includes(params.timeOfDay)
    ? params.timeOfDay
    : 'sunset';
  const maxPlayers = Math.max(2, Math.min(12, Math.round(params.maxPlayers ?? 8)));

  try {
    await setDoc(doc(db, 'online_rooms', roomId), {
      roomId,
      name: cleanName,
      hostUid: user.uid,
      hostDisplayName: googleDisplayName,
      hostPhotoURL: googlePhotoURL,
      isPublic: Boolean(params.isPublic),
      status: 'open',
      regionId,
      weather,
      timeOfDay,
      maxPlayers,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  const now = Date.now();
  return {
    roomId,
    name: cleanName,
    hostUid: user.uid,
    hostDisplayName: googleDisplayName,
    hostPhotoURL: googlePhotoURL,
    isPublic: Boolean(params.isPublic),
    status: 'open',
    regionId,
    weather,
    timeOfDay,
    maxPlayers,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export async function updateOnlineRoomMeta(
  roomId: string,
  patch: Partial<
    Pick<
      OnlineRoom,
      'name' | 'isPublic' | 'status' | 'regionId' | 'weather' | 'timeOfDay'
    >
  >,
): Promise<void> {
  const cleanId = normalizeRoomCode(roomId);
  const path = `online_rooms/${cleanId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof patch.name === 'string') {
    payload.name = patch.name.trim().slice(0, 40) || 'Highway Session';
  }
  if (typeof patch.isPublic === 'boolean') {
    payload.isPublic = patch.isPublic;
  }
  if (
    patch.status === 'open' ||
    patch.status === 'active' ||
    patch.status === 'closed'
  ) {
    payload.status = patch.status;
  }
  if (patch.regionId && VALID_REGIONS.includes(patch.regionId)) {
    payload.regionId = patch.regionId;
  }
  if (patch.weather && VALID_WEATHERS.includes(patch.weather)) {
    payload.weather = patch.weather;
  }
  if (patch.timeOfDay && VALID_TIMES.includes(patch.timeOfDay)) {
    payload.timeOfDay = patch.timeOfDay;
  }

  try {
    await updateDoc(doc(db, 'online_rooms', cleanId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface PlayerPoseInput {
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  speedKmh: number;
  steerAngle: number;
  braking: boolean;
  nitroActive: boolean;
  headlightsOn: boolean;
  s: number;
}

function buildPlayerMutableFields(
  user: User,
  save: PlayerSaveData,
  pose: PlayerPoseInput,
) {
  const { googleDisplayName, googlePhotoURL, cleanDriverName } =
    getGooglePublicIdentity(user, save.driverName);
  const activeCar =
    save.ownedCars[save.activeCarId] ?? Object.values(save.ownedCars)[0];
  const spec = getCarSpec(activeCar?.carId ?? save.activeCarId);
  const cust = activeCar?.customization;

  const paintColor =
    typeof cust?.paintColor === 'string' &&
    cust.paintColor.length >= 4 &&
    cust.paintColor.length <= 16
      ? cust.paintColor
      : spec.defaultColor;
  const paintFinish =
    cust && VALID_FINISHES.includes(cust.paintFinish)
      ? cust.paintFinish
      : 'metallic';
  const spoiler =
    cust && VALID_SPOILERS.includes(cust.spoiler) ? cust.spoiler : 'none';
  const bodyKit =
    cust && VALID_BODYKITS.includes(cust.bodyKit) ? cust.bodyKit : 'stock';
  const rank = RANK_ORDER.includes(save.rank) ? save.rank : 'rookie';

  return {
    googleDisplayName,
    googlePhotoURL,
    driverName: cleanDriverName,
    rank,
    carId: spec.id.slice(0, 64),
    paintColor,
    paintFinish,
    spoiler,
    bodyKit,
    x: clamp(pose.x, -4900, 4900, 0),
    y: clamp(pose.y, -450, 1950, 0),
    z: clamp(pose.z, -4900, 4900, 0),
    heading: clamp(pose.heading, -90, 90, 0),
    vx: clamp(pose.vx, -290, 290, 0),
    vz: clamp(pose.vz, -290, 290, 0),
    speedKmh: clamp(pose.speedKmh, 0, 599, 0),
    steerAngle: clamp(pose.steerAngle, -1.9, 1.9, 0),
    braking: Boolean(pose.braking),
    nitroActive: Boolean(pose.nitroActive),
    headlightsOn: Boolean(pose.headlightsOn),
    s: clamp(pose.s, 0, 1, 0),
  };
}

export async function joinOnlineRoom(
  roomId: string,
  save: PlayerSaveData,
  initialPose: PlayerPoseInput,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Google sign-in is required for Online Mode.');
  }

  const cleanId = normalizeRoomCode(roomId);
  const path = `online_rooms/${cleanId}/players/${user.uid}`;
  const playerRef = doc(db, 'online_rooms', cleanId, 'players', user.uid);
  const mutable = buildPlayerMutableFields(user, save, initialPose);

  let exists = false;
  try {
    const snap = await getDoc(playerRef);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  try {
    if (!exists) {
      await setDoc(playerRef, {
        uid: user.uid,
        roomId: cleanId,
        ...mutable,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(playerRef, {
        ...mutable,
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
}

export async function publishOnlinePlayerPose(
  roomId: string,
  save: PlayerSaveData,
  pose: PlayerPoseInput,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const cleanId = normalizeRoomCode(roomId);
  const path = `online_rooms/${cleanId}/players/${user.uid}`;
  const playerRef = doc(db, 'online_rooms', cleanId, 'players', user.uid);
  const mutable = buildPlayerMutableFields(user, save, pose);

  try {
    await updateDoc(playerRef, {
      ...mutable,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function leaveOnlineRoom(
  roomId: string,
  isHost: boolean,
  remainingPlayerCount: number,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const cleanId = normalizeRoomCode(roomId);
  if (!cleanId) return;

  const playerPath = `online_rooms/${cleanId}/players/${user.uid}`;
  try {
    await deleteDoc(doc(db, 'online_rooms', cleanId, 'players', user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, playerPath);
  }

  if (isHost && remainingPlayerCount <= 1) {
    const roomPath = `online_rooms/${cleanId}`;
    try {
      await updateDoc(doc(db, 'online_rooms', cleanId), {
        status: 'closed',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, roomPath);
    }
  }
}
