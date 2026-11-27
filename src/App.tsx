/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CareerHub } from './components/CareerHub';
import { GameHUD } from './components/GameHUD';
import { GarageDealership } from './components/GarageDealership';
import { LoadingScreen } from './components/LoadingScreen';
import { MainMenu } from './components/MainMenu';
import { OnboardingModal } from './components/OnboardingModal';
import { PauseModal, RaceResultsModal } from './components/PauseAndResultsModal';
import { PhotoModeOverlay } from './components/PhotoModeOverlay';
import { ProfileModal } from './components/ProfileModal';
import {
  QuestId,
  RaceEvent,
  RaceResultSummary,
  ScreenState,
  TimeOfDay,
  WeatherType,
  ControlInputState,
  ControlScheme,
  LiveTelemetry,
  MapLandmark,
  OnlinePlayerState,
  OnlineRoom,
  OwnedCarData,
  RegionId,
} from './types/game';
import { QuestsModal } from './components/QuestsModal';
import { QuickRaceModal } from './components/QuickRaceModal';
import { OnlineLobbyModal } from './components/OnlineLobbyModal';
import { SettingsModal } from './components/SettingsModal';
import { WorldMapModal } from './components/WorldMapModal';
import { getCarSpec } from './data/cars';
import { getRoadPointAt } from './data/track';
import { REGIONS } from './data/world';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { audioEngine } from './engine/audio';
import { DRIVE_SPAWN_S, GameEngine } from './engine/GameEngine';
import {
  auth,
  deleteCloudCareerSave,
  loadCloudCareerSave,
  saveCloudCareerSave,
  signInWithGoogle,
  signOutGoogle,
  syncPrivateAccountDoc,
} from './services/firebase';
import {
  createOnlineRoom,
  findOnlineRoom,
  joinOnlineRoom,
  leaveOnlineRoom,
  publishOnlinePlayerPose,
  subscribePublicRooms,
  subscribeRoom,
  subscribeRoomPlayers,
  updateOnlineRoomMeta,
} from './services/onlineMultiplayer';
import { normalizeSaveData, useGameStore } from './state/useGameStore';
import {
  exitAppFullscreen,
  isFullscreenSupported,
  isInFullscreen,
  requestAppFullscreen,
  subscribeFullscreenChange,
} from './utils/fullscreen';

const INITIAL_PT = getRoadPointAt(DRIVE_SPAWN_S, 0);

const INITIAL_TELEMETRY: LiveTelemetry = {
  speedKmh: 0,
  rpm: 950,
  maxRpm: 8500,
  gear: 1,
  nitro: 100,
  nitroActive: false,
  driftAngleDeg: 0,
  isDrifting: false,
  currentDriftPoints: 0,
  totalDriftScore: 0,
  headlightsOn: false,
  absActive: false,
  tcsActive: false,
  surface: 'asphalt',
  regionId: 'sunset_coast',
  regionName: 'SUNSET COAST',
  playerX: INITIAL_PT.x,
  playerZ: INITIAL_PT.z,
  playerHeading: INITIAL_PT.heading,
  trackProgress: DRIVE_SPAWN_S,
  raceState: 'free_roam',
  countdownValue: 0,
  racePosition: 1,
  totalRacers: 1,
  currentLap: 1,
  totalLaps: 1,
  checkpointIndex: 0,
  totalCheckpoints: 0,
  raceElapsedSec: 0,
  nearLandmark: null,
  nearEvent: null,
  cameraMode: 'chase',
  weather: 'sunny',
  timeOfDay: 'day',
  cycleTimeLabel: '09:14',
  autoDayNightCycle: true,
  fps: 60,
  dirtLevel: 0,
  damageLevel: 0,
  crashFlash: 0,
  noBrakeDriftSec: 0,
  opponents: [],
  trafficPositions: [],
};

export default function App() {
  const {
    save,
    activeCarData,
    updateSettings,
    setDriverName,
    completeOnboarding,
    selectCar,
    buyCar,
    updateCarCustomization,
    buyUpgrade,
    setCarDirtLevel,
    unlockRegion,
    recordRaceResult,
    addFreeRoamRewards,
    recordNoBrakeDriftSec,
    updateContinuousPlaySec,
    claimQuestReward,
    claimDailyLoginPrize,
    replaceSave,
    resetProgress,
  } = useGameStore();

  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<
    'idle' | 'syncing' | 'synced' | 'error'
  >('idle');
  const [publicRooms, setPublicRooms] = useState<OnlineRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<OnlineRoom | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<OnlinePlayerState[]>([]);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const activeRoomRef = useRef<OnlineRoom | null>(null);
  activeRoomRef.current = activeRoom;
  const roomPlayersRef = useRef<OnlinePlayerState[]>([]);
  roomPlayersRef.current = roomPlayers;
  const cloudHydratedUidRef = useRef<string | null>(null);
  const inFlightHydrateRef = useRef<{
    uid: string;
    promise: Promise<{ restoredExisting: boolean }>;
  } | null>(null);
  const latestSaveRef = useRef(save);
  latestSaveRef.current = save;
  const screenRef = useRef<ScreenState>('loading');

  const [screen, setScreen] = useState<ScreenState>('loading');
  screenRef.current = screen;
  const [paused, setPaused] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [showPauseQuests, setShowPauseQuests] = useState(false);
  const [sessionPlaySec, setSessionPlaySec] = useState(0);
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(INITIAL_TELEMETRY);
  const [raceResult, setRaceResult] = useState<RaceResultSummary | null>(null);
  const [isWashingCar, setIsWashingCar] = useState(false);
  const [activeRaceConfig, setActiveRaceConfig] = useState<{
    event: RaceEvent;
    weather?: WeatherType;
    time?: TimeOfDay;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isInFullscreen());
  const fullscreenSupported = isFullscreenSupported();

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const manualExitFullscreenRef = useRef(false);
  const appInitiatedExitRef = useRef(false);
  const wasFullscreenRef = useRef<boolean>(isInFullscreen());
  const dragPointer = useRef<{ down: boolean; x: number; y: number }>({
    down: false,
    x: 0,
    y: 0,
  });

  const callbacksRef = useRef({
    recordRaceResult,
    addFreeRoamRewards,
    unlockRegion,
    setCarDirtLevel,
    recordNoBrakeDriftSec,
  });
  callbacksRef.current = {
    recordRaceResult,
    addFreeRoamRewards,
    unlockRegion,
    setCarDirtLevel,
    recordNoBrakeDriftSec,
  };

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2400);
  }, []);

  const hydrateAccountFromCloud = useCallback(
    async (user: FirebaseUser, showWelcomeToast: boolean) => {
      if (inFlightHydrateRef.current?.uid === user.uid) {
        return inFlightHydrateRef.current.promise;
      }

      const promise = (async () => {
        setCloudSyncState('syncing');
        try {
          await syncPrivateAccountDoc(user);
          const cloudPartial = await loadCloudCareerSave(user.uid);
          if (cloudPartial && cloudPartial.onboarded) {
            const restored = normalizeSaveData(cloudPartial);
            replaceSave(restored);
            const restoredCar =
              restored.ownedCars[restored.activeCarId] ??
              Object.values(restored.ownedCars)[0];
            if (restoredCar) {
              engineRef.current?.setPlayerCar(restoredCar);
            }
            engineRef.current?.applySettings(restored.settings);
            audioEngine.applySettings(restored.settings);
            cloudHydratedUidRef.current = user.uid;
            setCloudSyncState('synced');
            if (screenRef.current === 'onboarding') {
              engineRef.current?.setShowcaseMode(true);
              setScreen('main_menu');
            }
            if (showWelcomeToast) {
              notify(`Welcome back, ${restored.driverName}!`);
            }
            return { restoredExisting: true };
          }

          // New Google account (or not onboarded yet): if player already onboarded locally, save it to cloud
          const curSave = latestSaveRef.current;
          if (curSave.onboarded) {
            await saveCloudCareerSave(user.uid, curSave);
            setCloudSyncState('synced');
            if (showWelcomeToast) {
              notify('Google Account Created & Synced!');
            }
          } else {
            setCloudSyncState('idle');
          }
          cloudHydratedUidRef.current = user.uid;
          return { restoredExisting: false };
        } catch (err) {
          console.error('Cloud hydrate error:', err);
          if (cloudHydratedUidRef.current === user.uid) {
            cloudHydratedUidRef.current = null;
          }
          setCloudSyncState('error');
          return { restoredExisting: false };
        } finally {
          if (inFlightHydrateRef.current?.uid === user.uid) {
            inFlightHydrateRef.current = null;
          }
        }
      })();

      inFlightHydrateRef.current = { uid: user.uid, promise };
      return promise;
    },
    [replaceSave, notify],
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        cloudHydratedUidRef.current = null;
        setCloudSyncState('idle');
        return;
      }
      if (cloudHydratedUidRef.current !== user.uid) {
        void hydrateAccountFromCloud(user, false);
      }
    });
    return () => unsub();
  }, [hydrateAccountFromCloud]);

  useEffect(() => {
    if (!authUser) return;
    const handleOnline = () => {
      if (cloudHydratedUidRef.current !== authUser.uid) {
        void hydrateAccountFromCloud(authUser, false);
      } else if (latestSaveRef.current.onboarded) {
        setCloudSyncState('syncing');
        saveCloudCareerSave(authUser.uid, latestSaveRef.current)
          .then(() => setCloudSyncState('synced'))
          .catch(() => setCloudSyncState('error'));
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [authUser, hydrateAccountFromCloud]);

  useEffect(() => {
    if (!authUser || !save.onboarded) return;
    if (cloudHydratedUidRef.current !== authUser.uid) return;

    const timer = window.setTimeout(() => {
      setCloudSyncState('syncing');
      saveCloudCareerSave(authUser.uid, latestSaveRef.current)
        .then(() => setCloudSyncState('synced'))
        .catch(() => setCloudSyncState('error'));
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [authUser, save]);

  const handleGoogleSignIn = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
    displayName?: string;
  }> => {
    setAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      setAuthUser(user);
      await hydrateAccountFromCloud(user, true);
      return {
        ok: true,
        displayName: user.displayName ?? undefined,
      };
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        return { ok: false };
      }
      if (code === 'auth/popup-blocked') {
        return {
          ok: false,
          error: 'Pop-up was blocked by your browser. Allow pop-ups and try again.',
        };
      }
      const msg =
        err instanceof Error ? err.message : 'Failed to sign in with Google.';
      return { ok: false, error: msg };
    } finally {
      setAuthBusy(false);
    }
  }, [hydrateAccountFromCloud]);

  const handleGoogleSignOut = useCallback(async () => {
    try {
      if (activeRoomId) {
        const isHost = activeRoomRef.current?.hostUid === authUser?.uid;
        await leaveOnlineRoom(
          activeRoomId,
          Boolean(isHost),
          roomPlayersRef.current.length,
        ).catch(() => {});
        setActiveRoomId(null);
        setActiveRoom(null);
        setRoomPlayers([]);
        engineRef.current?.setOnlineSession(null, null);
      }
      await signOutGoogle();
      cloudHydratedUidRef.current = null;
      setAuthUser(null);
      setCloudSyncState('idle');
      notify('Signed out — playing locally');
    } catch {
      notify('Could not sign out cleanly');
    }
  }, [activeRoomId, authUser?.uid, notify]);

  const handleSyncNow = useCallback(async () => {
    if (!authUser) return;
    setCloudSyncState('syncing');
    try {
      if (cloudHydratedUidRef.current !== authUser.uid) {
        const result = await hydrateAccountFromCloud(authUser, false);
        if (cloudHydratedUidRef.current !== authUser.uid) {
          setCloudSyncState('error');
          notify('Cloud sync failed');
          return;
        }
        notify(
          result.restoredExisting ? 'Cloud Save Restored' : 'Cloud Save Synced',
        );
        return;
      }
      await saveCloudCareerSave(authUser.uid, latestSaveRef.current);
      setCloudSyncState('synced');
      notify('Cloud Save Synced');
    } catch {
      setCloudSyncState('error');
      notify('Cloud sync failed');
    }
  }, [authUser, hydrateAccountFromCloud, notify]);

  // Subscribe to public online rooms while viewing the Online Lobby
  useEffect(() => {
    if (!authUser || screen !== 'online' || activeRoomId) {
      return;
    }
    const unsub = subscribePublicRooms(
      (rooms) => {
        setPublicRooms(rooms);
        setOnlineError(null);
      },
      () => {
        setOnlineError('Unable to load live online rooms right now.');
      },
    );
    return () => unsub();
  }, [authUser, screen, activeRoomId]);

  // Subscribe to joined room metadata & live connected players
  useEffect(() => {
    if (!authUser || !activeRoomId) {
      setActiveRoom(null);
      setRoomPlayers([]);
      engineRef.current?.setOnlineSession(null, null);
      return;
    }

    const unsubRoom = subscribeRoom(
      activeRoomId,
      (room) => {
        if (!room || room.status === 'closed') {
          setActiveRoomId(null);
          setActiveRoom(null);
          setRoomPlayers([]);
          engineRef.current?.setOnlineSession(null, null);
          notify('Online session ended by host');
          return;
        }
        setActiveRoom(room);
        engineRef.current?.setOnlineSession(room.roomId, room.name);
        if (screenRef.current === 'playing') {
          engineRef.current?.setAtmosphere(room.weather, room.timeOfDay, false);
        }
      },
      () => {
        setOnlineError('Lost connection to online session.');
      },
    );

    const unsubPlayers = subscribeRoomPlayers(
      activeRoomId,
      (players) => {
        setRoomPlayers(players);
        engineRef.current?.syncOnlinePlayers(players, authUser.uid);
      },
      () => {
        setOnlineError('Unable to sync remote drivers.');
      },
    );

    const handlePageHide = () => {
      const isHost = activeRoomRef.current?.hostUid === authUser.uid;
      void leaveOnlineRoom(
        activeRoomId,
        Boolean(isHost),
        roomPlayersRef.current.length,
      ).catch(() => {});
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      unsubRoom();
      unsubPlayers();
    };
  }, [authUser, activeRoomId, notify]);

  // Real-time vehicle pose publisher (4 Hz driving, 0.25 Hz lobby heartbeat)
  useEffect(() => {
    if (!authUser || !activeRoomId) return;
    let lastSentAt = 0;
    let lastX = 0;
    let lastZ = 0;
    let lastStateSig = '';
    let publishing = false;

    const id = window.setInterval(() => {
      if (document.hidden || publishing) return;
      const engine = engineRef.current;
      if (!engine) return;

      const now = Date.now();
      const pose = engine.getLocalPoseSnapshot();
      const isPlaying = screenRef.current === 'playing';
      const moved = Math.hypot(pose.x - lastX, pose.z - lastZ);
      const sig = `${pose.braking}|${pose.nitroActive}|${pose.headlightsOn}|${latestSaveRef.current.activeCarId}`;

      const needsPublish = isPlaying
        ? now - lastSentAt >= 2600 ||
          (now - lastSentAt >= 240 &&
            (moved > 0.35 || pose.speedKmh > 1.5 || sig !== lastStateSig))
        : now - lastSentAt >= 4500 || sig !== lastStateSig;

      if (!needsPublish) return;

      publishing = true;
      lastSentAt = now;
      lastX = pose.x;
      lastZ = pose.z;
      lastStateSig = sig;

      void publishOnlinePlayerPose(activeRoomId, latestSaveRef.current, pose)
        .catch(() => {})
        .finally(() => {
          publishing = false;
        });
    }, 220);

    return () => window.clearInterval(id);
  }, [authUser, activeRoomId]);

  const handleCreateOnlineRoom = useCallback(
    async (params: {
      name: string;
      isPublic: boolean;
      regionId: RegionId;
      weather: WeatherType;
      timeOfDay: TimeOfDay;
    }) => {
      if (!authUser) return;
      setOnlineBusy(true);
      setOnlineError(null);
      try {
        const room = await createOnlineRoom(params);
        const reg = REGIONS.find((r) => r.id === room.regionId) ?? REGIONS[0];
        const pt = getRoadPointAt(reg.spawnS, 0);
        const initialPose = engineRef.current?.getLocalPoseSnapshot() ?? {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          heading: pt.heading,
          vx: 0,
          vz: 0,
          speedKmh: 0,
          steerAngle: 0,
          braking: false,
          nitroActive: false,
          headlightsOn: false,
          s: reg.spawnS,
        };
        await joinOnlineRoom(room.roomId, latestSaveRef.current, initialPose);
        setActiveRoom(room);
        setActiveRoomId(room.roomId);
        engineRef.current?.setOnlineSession(room.roomId, room.name);
        notify(`Online Room ${room.roomId} Created`);
      } catch (err) {
        setOnlineError(
          err instanceof Error ? err.message : 'Could not create online room.',
        );
      } finally {
        setOnlineBusy(false);
      }
    },
    [authUser, notify],
  );

  const handleJoinOnlineRoom = useCallback(
    async (roomId: string) => {
      if (!authUser) return;
      setOnlineBusy(true);
      setOnlineError(null);
      try {
        const room = await findOnlineRoom(roomId);
        if (!room) {
          setOnlineError('Room not found or already closed.');
          return;
        }
        const reg = REGIONS.find((r) => r.id === room.regionId) ?? REGIONS[0];
        const pt = getRoadPointAt(reg.spawnS, 0);
        const initialPose = engineRef.current?.getLocalPoseSnapshot() ?? {
          x: pt.x,
          y: pt.y,
          z: pt.z,
          heading: pt.heading,
          vx: 0,
          vz: 0,
          speedKmh: 0,
          steerAngle: 0,
          braking: false,
          nitroActive: false,
          headlightsOn: false,
          s: reg.spawnS,
        };
        await joinOnlineRoom(room.roomId, latestSaveRef.current, initialPose);
        setActiveRoom(room);
        setActiveRoomId(room.roomId);
        engineRef.current?.setOnlineSession(room.roomId, room.name);
        notify(`Joined ${room.name}`);
      } catch (err) {
        setOnlineError(
          err instanceof Error ? err.message : 'Could not join online room.',
        );
      } finally {
        setOnlineBusy(false);
      }
    },
    [authUser, notify],
  );

  const handleLeaveOnlineRoom = useCallback(async () => {
    if (!activeRoomId) return;
    setOnlineBusy(true);
    try {
      const isHost = activeRoomRef.current?.hostUid === authUser?.uid;
      await leaveOnlineRoom(
        activeRoomId,
        Boolean(isHost),
        roomPlayersRef.current.length,
      );
      setActiveRoomId(null);
      setActiveRoom(null);
      setRoomPlayers([]);
      engineRef.current?.setOnlineSession(null, null);
      notify('Left Online Session');
    } catch {
      setOnlineError('Could not leave online room cleanly.');
    } finally {
      setOnlineBusy(false);
    }
  }, [activeRoomId, authUser?.uid, notify]);

  const handleUpdateOnlineRoomMeta = useCallback(
    async (
      patch: Partial<Pick<OnlineRoom, 'weather' | 'timeOfDay' | 'regionId'>>,
    ) => {
      if (!activeRoomId) return;
      try {
        await updateOnlineRoomMeta(activeRoomId, patch);
      } catch {
        setOnlineError('Could not update room environment.');
      }
    },
    [activeRoomId],
  );

  const launchOnlineDrive = useCallback(() => {
    const room = activeRoomRef.current;
    if (!room) return;
    if (
      save.settings.autoFullscreen &&
      !manualExitFullscreenRef.current &&
      !isInFullscreen()
    ) {
      void requestAppFullscreen();
    }
    setPaused(false);
    setPhotoMode(false);
    setRaceResult(null);
    setActiveRaceConfig(null);
    const other = roomPlayersRef.current.find((p) => p.uid !== authUser?.uid);
    const reg = REGIONS.find((r) => r.id === room.regionId) ?? REGIONS[0];
    const spawnS = other ? (other.s - 0.004 + 1) % 1 : reg.spawnS;

    engineRef.current?.setOnlineSession(room.roomId, room.name);
    engineRef.current?.syncOnlinePlayers(
      roomPlayersRef.current,
      authUser?.uid ?? null,
    );
    engineRef.current?.setPhotoMode(false);
    engineRef.current?.setPlayerCar(activeCarData);
    engineRef.current?.setAtmosphere(room.weather, room.timeOfDay, true);
    engineRef.current?.startFreeRoamAtS(spawnS);
    if (room.hostUid === authUser?.uid && room.status === 'open') {
      void updateOnlineRoomMeta(room.roomId, { status: 'active' }).catch(() => {});
    }
    setScreen('playing');
  }, [activeCarData, authUser?.uid, save.settings.autoFullscreen]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionPlaySec((prev) => {
        const next = prev + 1;
        if (next % 5 === 0 || next === 10800) {
          updateContinuousPlaySec(next);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [updateContinuousPlaySec]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || engineRef.current) return;

    let cancelled = false;
    const initTimer = window.setTimeout(() => {
      if (cancelled || engineRef.current) return;
      const curSave = latestSaveRef.current;
      const curCar =
        curSave.ownedCars[curSave.activeCarId] ??
        Object.values(curSave.ownedCars)[0] ??
        activeCarData;

      const engine = new GameEngine(
        container,
        curCar,
        curSave.settings,
        {
          onTelemetry: (t) => setTelemetry(t),
          onRaceComplete: (res) => {
            callbacksRef.current.recordRaceResult(res);
            setRaceResult(res);
          },
          onFreeRoamReward: (cash, xp, rep, distKm, topSpd, driftPts) => {
            callbacksRef.current.addFreeRoamRewards(
              cash,
              xp,
              rep,
              distKm,
              topSpd,
              driftPts,
            );
          },
          onRegionUnlock: (regId) => {
            callbacksRef.current.unlockRegion(regId);
          },
          onDirtChange: (carId, dirtLevel) => {
            callbacksRef.current.setCarDirtLevel(carId, dirtLevel);
          },
          onWashComplete: () => {
            setIsWashingCar(false);
          },
          onNoBrakeDriftUpdate: (sec) => {
            callbacksRef.current.recordNoBrakeDriftSec(sec);
          },
        },
        { initiallySuspended: screenRef.current === 'loading' },
      );
      engine.setShowcaseRightOffset(screenRef.current === 'main_menu');
      engineRef.current = engine;
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      engineRef.current?.dispose();
      engineRef.current = null;
      audioEngine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    audioEngine.applySettings(save.settings);
    engineRef.current?.applySettings(save.settings);
  }, [save.settings]);

  useEffect(() => {
    engineRef.current?.setShowcaseRightOffset(screen === 'main_menu');
    if (screen !== 'loading') {
      engineRef.current?.setRenderSuspended(false);
    }
  }, [screen]);

  useEffect(() => {
    const unlockAudio = () => {
      audioEngine.init();
      audioEngine.applySettings(save.settings);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return subscribeFullscreenChange((active) => {
      if (wasFullscreenRef.current && !active && !appInitiatedExitRef.current) {
        // User exited fullscreen manually (e.g. via Esc or OS gesture); don't force back until requested
        manualExitFullscreenRef.current = true;
      }
      if (active) {
        manualExitFullscreenRef.current = false;
      }
      appInitiatedExitRef.current = false;
      wasFullscreenRef.current = active;
      setIsFullscreen(active);
    });
  }, []);

  useEffect(() => {
    if (!save.settings.autoFullscreen || !fullscreenSupported) {
      return;
    }

    if (!manualExitFullscreenRef.current && !isInFullscreen()) {
      // Attempt immediate fullscreen on launch (works in permissive browsers/standalone frames)
      void requestAppFullscreen();
    }

    const tryAutoFullscreenOnGesture = (e: Event) => {
      if (
        !save.settings.autoFullscreen ||
        manualExitFullscreenRef.current ||
        isInFullscreen()
      ) {
        return;
      }
      if (screen === 'onboarding') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      void requestAppFullscreen();
    };

    window.addEventListener('pointerdown', tryAutoFullscreenOnGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener('keydown', tryAutoFullscreenOnGesture, {
      capture: true,
    });
    return () => {
      window.removeEventListener('pointerdown', tryAutoFullscreenOnGesture, {
        capture: true,
      });
      window.removeEventListener('keydown', tryAutoFullscreenOnGesture, {
        capture: true,
      });
    };
  }, [save.settings.autoFullscreen, fullscreenSupported, screen]);

  const toggleFullscreen = useCallback(async () => {
    if (!isFullscreenSupported()) {
      notify('Fullscreen is not supported on this browser');
      return;
    }
    if (isInFullscreen()) {
      appInitiatedExitRef.current = true;
      manualExitFullscreenRef.current = true;
      await exitAppFullscreen();
    } else {
      manualExitFullscreenRef.current = false;
      const ok = await requestAppFullscreen();
      if (!ok) {
        notify('Fullscreen blocked by browser/frame');
      }
    }
  }, [notify]);

  const handleTouchInput = useCallback((patch: Partial<ControlInputState>) => {
    engineRef.current?.setTouchInput(patch);
  }, []);

  const handleCycleControlScheme = useCallback(() => {
    audioEngine.playUiClick();
    const order: ControlScheme[] = ['buttons', 'wheel', 'tilt', 'keyboard'];
    const labels: Record<ControlScheme, string> = {
      buttons: 'Controls: Touch Pad + WASD',
      wheel: 'Controls: Steering Wheel',
      tilt: 'Controls: Tilt / Gyro',
      keyboard: 'Controls: Keyboard / Gamepad',
    };
    const next = order[(order.indexOf(save.settings.controlScheme) + 1) % order.length];
    updateSettings({ controlScheme: next });
    notify(labels[next]);
  }, [save.settings.controlScheme, updateSettings, notify]);

  const handlePreviewCar = useCallback((carData: OwnedCarData) => {
    setIsWashingCar(false);
    engineRef.current?.setPlayerCar(carData);
  }, []);

  const handleWashCar = useCallback(() => {
    if (engineRef.current?.startCarWash()) {
      setIsWashingCar(true);
    }
  }, []);

  const enterPhotoMode = useCallback(() => {
    setPaused(false);
    setShowWorldMap(false);
    engineRef.current?.setPaused(false);
    engineRef.current?.setPhotoMode(true);
    setPhotoMode(true);
  }, []);

  const exitPhotoMode = useCallback(() => {
    engineRef.current?.setPhotoMode(false);
    setPhotoMode(false);
  }, []);

  const enterMainMenu = useCallback(() => {
    setPaused(false);
    setPhotoMode(false);
    setRaceResult(null);
    setActiveRaceConfig(null);
    setIsWashingCar(false);
    engineRef.current?.setPhotoMode(false);
    engineRef.current?.setPlayerCar(activeCarData);
    engineRef.current?.setShowcaseMode(true);
    setScreen('main_menu');
  }, [activeCarData]);

  const startFreeRoam = useCallback(
    (spawnX?: number, spawnZ?: number, weather?: WeatherType, time?: TimeOfDay) => {
      if (
        save.settings.autoFullscreen &&
        !manualExitFullscreenRef.current &&
        !isInFullscreen()
      ) {
        void requestAppFullscreen();
      }
      setPaused(false);
      setPhotoMode(false);
      setRaceResult(null);
      setActiveRaceConfig(null);
      engineRef.current?.setOnlineSession(null, null);
      engineRef.current?.setPhotoMode(false);
      engineRef.current?.setPlayerCar(activeCarData);
      if (weather && time) {
        engineRef.current?.setAtmosphere(weather, time, true);
      }
      engineRef.current?.startFreeRoam(spawnX, spawnZ);
      setScreen('playing');
    },
    [activeCarData, save.settings.autoFullscreen],
  );

  const startRaceEvent = useCallback(
    (event: RaceEvent, weather?: WeatherType, time?: TimeOfDay) => {
      if (
        save.settings.autoFullscreen &&
        !manualExitFullscreenRef.current &&
        !isInFullscreen()
      ) {
        void requestAppFullscreen();
      }
      setPaused(false);
      setPhotoMode(false);
      setRaceResult(null);
      setShowWorldMap(false);
      setActiveRaceConfig({ event, weather, time });
      engineRef.current?.setOnlineSession(null, null);
      engineRef.current?.setPhotoMode(false);
      engineRef.current?.setPlayerCar(activeCarData);
      engineRef.current?.startRaceEvent(event, weather, time);
      setScreen('playing');
    },
    [activeCarData, save.settings.autoFullscreen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (showPauseQuests) {
          setShowPauseQuests(false);
          return;
        }
        if (showWorldMap) {
          setShowWorldMap(false);
          return;
        }
        if (photoMode) {
          return;
        }
        if (screen === 'playing' && !raceResult) {
          setPaused((prev) => {
            const next = !prev;
            engineRef.current?.setPaused(next);
            return next;
          });
        }
      } else if (
        e.code === 'KeyP' &&
        screen === 'playing' &&
        !raceResult &&
        !showWorldMap &&
        !showPauseQuests &&
        !photoMode
      ) {
        enterPhotoMode();
      } else if (e.code === 'KeyM' && screen === 'playing' && !raceResult && !photoMode && !showPauseQuests) {
        setShowWorldMap((prev) => !prev);
      } else if (e.code === 'Enter' && screen === 'main_menu' && !showWorldMap) {
        startFreeRoam();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, showWorldMap, showPauseQuests, raceResult, photoMode, startFreeRoam, enterPhotoMode]);

  const isShowcaseScreen =
    screen === 'main_menu' ||
    screen === 'garage' ||
    screen === 'dealership' ||
    screen === 'customization';

  const isPhotoActive = screen === 'playing' && photoMode && !raceResult;
  const isOrbitEnabled = isShowcaseScreen || isPhotoActive;

  const handleInteractLandmark = (lm: MapLandmark) => {
    audioEngine.playUiClick();
    if (lm.type === 'garage') {
      engineRef.current?.setShowcaseMode(true);
      setScreen('garage');
    } else if (lm.type === 'dealership') {
      engineRef.current?.setShowcaseMode(true);
      setScreen('dealership');
    } else if (lm.type === 'custom_shop') {
      engineRef.current?.setShowcaseMode(true);
      setScreen('customization');
    } else {
      setShowWorldMap(true);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#07080b]">
      <div
        ref={canvasContainerRef}
        className={`fixed inset-0 z-0 ${isOrbitEnabled ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={(e) => {
          if (
            screen === 'playing' &&
            !paused &&
            !photoMode &&
            !raceResult &&
            e.pointerType === 'touch' &&
            save.settings.controlScheme === 'keyboard'
          ) {
            updateSettings({ controlScheme: 'buttons' });
            notify('Touch Controls Enabled');
            return;
          }
          if (!isOrbitEnabled) return;
          dragPointer.current = { down: true, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!isOrbitEnabled || !dragPointer.current.down) return;
          const dx = e.clientX - dragPointer.current.x;
          const dy = e.clientY - dragPointer.current.y;
          dragPointer.current.x = e.clientX;
          dragPointer.current.y = e.clientY;
          if (isPhotoActive) {
            engineRef.current?.adjustPhotoOrbit(dx, dy, 0);
          } else {
            engineRef.current?.adjustShowcaseOrbit(dx, dy, 0);
          }
        }}
        onPointerUp={() => {
          dragPointer.current.down = false;
        }}
        onPointerLeave={() => {
          dragPointer.current.down = false;
        }}
        onWheel={(e) => {
          if (!isOrbitEnabled) return;
          if (isPhotoActive) {
            engineRef.current?.adjustPhotoOrbit(0, 0, e.deltaY * 0.004);
          } else {
            engineRef.current?.adjustShowcaseOrbit(0, 0, e.deltaY * 0.004);
          }
        }}
      />

      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white font-display text-xs tracking-widest uppercase px-5 py-2 shadow-xl">
          {toastMsg}
        </div>
      )}

      {screen === 'loading' && (
        <LoadingScreen
          radioStation={save.settings.radioStation}
          onWarmup={() => {
            engineRef.current?.setRenderSuspended(false);
          }}
          onReady={() => {
            engineRef.current?.setRenderSuspended(false);
            engineRef.current?.setShowcaseMode(true);
            setScreen(save.onboarded ? 'main_menu' : 'onboarding');
          }}
        />
      )}

      {screen === 'onboarding' && (
        <OnboardingModal
          initialName={save.driverName}
          authUser={authUser}
          authBusy={authBusy}
          onGoogleSignIn={handleGoogleSignIn}
          onComplete={(username, age) => {
            if (
              save.settings.autoFullscreen &&
              !manualExitFullscreenRef.current &&
              !isInFullscreen()
            ) {
              void requestAppFullscreen();
            }
            completeOnboarding(username, age);
            engineRef.current?.setShowcaseMode(true);
            setScreen('main_menu');
          }}
        />
      )}

      {screen === 'main_menu' && (
        <MainMenu
          save={save}
          activeCar={activeCarData}
          sessionPlaySec={sessionPlaySec}
          authUser={authUser}
          authBusy={authBusy}
          cloudSyncState={cloudSyncState}
          activeOnlineRoomId={activeRoomId}
          onlinePlayerCount={roomPlayers.length}
          onGoogleSignIn={() => {
            void handleGoogleSignIn();
          }}
          isFullscreen={isFullscreen}
          fullscreenSupported={fullscreenSupported}
          onToggleFullscreen={toggleFullscreen}
          onClaimQuest={(qId) => {
            const shards = claimQuestReward(qId, sessionPlaySec);
            if (shards > 0) {
              notify(`Quest Claimed! +${shards} Fuma Shards`);
            }
          }}
          onClaimDaily={() => {
            const tier = claimDailyLoginPrize();
            if (tier) {
              notify(
                `Day ${tier.day} Prize! +$${tier.cash.toLocaleString()} & +${tier.shards} Shards`,
              );
            }
          }}
          onNavigate={(target) => {
            if (
              target === 'garage' ||
              target === 'dealership' ||
              target === 'customization'
            ) {
              engineRef.current?.setShowcaseMode(true);
            }
            setScreen(target);
          }}
          onPlayFreeRoam={() => startFreeRoam()}
          onOpenWorldMap={() => setShowWorldMap(true)}
        />
      )}

      {(screen === 'garage' ||
        screen === 'dealership' ||
        screen === 'customization') && (
        <GarageDealership
          initialTab={screen}
          save={save}
          activeCar={activeCarData}
          liveDirtLevel={telemetry.dirtLevel}
          isWashing={isWashingCar}
          onWashCar={handleWashCar}
          onBack={enterMainMenu}
          onPreviewCar={handlePreviewCar}
          onSelectCar={selectCar}
          onBuyCar={buyCar}
          onUpdateCustomization={updateCarCustomization}
          onBuyUpgrade={buyUpgrade}
          onDriveNow={() => (activeRoomId ? launchOnlineDrive() : startFreeRoam())}
          onResetOrbit={() => engineRef.current?.resetShowcaseOrbit()}
        />
      )}

      {screen === 'career' && (
        <CareerHub
          save={save}
          onBack={enterMainMenu}
          onStartEvent={(evt) => startRaceEvent(evt)}
        />
      )}

      {screen === 'online' && (
        <OnlineLobbyModal
          save={save}
          activeCar={activeCarData}
          authUser={authUser}
          authBusy={authBusy}
          publicRooms={publicRooms}
          activeRoom={activeRoom}
          roomPlayers={roomPlayers}
          onlineBusy={onlineBusy}
          onlineError={onlineError}
          onGoogleSignIn={handleGoogleSignIn}
          onCreateRoom={handleCreateOnlineRoom}
          onJoinRoom={handleJoinOnlineRoom}
          onLeaveRoom={handleLeaveOnlineRoom}
          onUpdateRoomMeta={handleUpdateOnlineRoomMeta}
          onLaunchOnlineDrive={launchOnlineDrive}
          onBack={enterMainMenu}
        />
      )}

      {screen === 'quick_race' && (
        <QuickRaceModal
          onBack={enterMainMenu}
          onStartRace={(evt, w, t) => startRaceEvent(evt, w, t)}
          onStartFreeRoam={(regionId, w, t) => {
            const reg = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0];
            const pt = getRoadPointAt(reg.spawnS, 0);
            startFreeRoam(pt.x, pt.z, w, t);
          }}
        />
      )}

      {screen === 'settings' && (
        <SettingsModal
          settings={save.settings}
          isFullscreen={isFullscreen}
          fullscreenSupported={fullscreenSupported}
          onToggleFullscreen={toggleFullscreen}
          onUpdate={(patch) => {
            if (patch.autoFullscreen === true) {
              manualExitFullscreenRef.current = false;
              if (!isInFullscreen()) {
                void requestAppFullscreen();
              }
            }
            updateSettings(patch);
          }}
          onBack={() =>
            setScreen(activeRaceConfig || paused ? 'playing' : 'main_menu')
          }
        />
      )}

      {screen === 'profile' && (
        <ProfileModal
          save={save}
          authUser={authUser}
          authBusy={authBusy}
          cloudSyncState={cloudSyncState}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onSyncNow={handleSyncNow}
          onUpdateName={setDriverName}
          onResetSave={() => {
            if (authUser) {
              void deleteCloudCareerSave(authUser.uid).catch(() => {});
            }
            resetProgress();
            notify('Career Save Reset');
            setScreen('onboarding');
          }}
          onBack={enterMainMenu}
        />
      )}

      {screen === 'playing' && !paused && !photoMode && !raceResult && (
        <GameHUD
          telemetry={telemetry}
          settings={save.settings}
          onTouchInput={handleTouchInput}
          onShiftGear={(delta) => engineRef.current?.shiftGear(delta)}
          onCycleCamera={() => engineRef.current?.cycleCamera()}
          onCycleControlScheme={handleCycleControlScheme}
          onEnterPhotoMode={enterPhotoMode}
          onOpenMap={() => setShowWorldMap(true)}
          onOpenOnlineLobby={() => {
            engineRef.current?.setShowcaseMode(true);
            setScreen('online');
          }}
          onPause={() => {
            setPaused(true);
            engineRef.current?.setPaused(true);
          }}
          onInteractLandmark={handleInteractLandmark}
          onStartNearbyEvent={(evt) => startRaceEvent(evt)}
        />
      )}

      {isPhotoActive && (
        <PhotoModeOverlay
          carName={getCarSpec(activeCarData.carId).name}
          regionName={telemetry.regionName}
          weather={telemetry.weather}
          timeOfDay={telemetry.timeOfDay}
          cycleTimeLabel={telemetry.cycleTimeLabel}
          onExit={exitPhotoMode}
          onCapture={() => engineRef.current?.capturePhotoDataUrl() ?? null}
          onResetCamera={() => engineRef.current?.resetPhotoCamera()}
          onUpdateCamera={(patch) => engineRef.current?.setPhotoCameraParams(patch)}
          onCycleWeather={(w, t) => {
            engineRef.current?.setAtmosphere(w, t);
            setTelemetry((prev) => ({ ...prev, weather: w, timeOfDay: t }));
          }}
        />
      )}

      {screen === 'playing' && paused && !photoMode && !raceResult && (
        <PauseModal
          weather={telemetry.weather}
          timeOfDay={telemetry.timeOfDay}
          cycleTimeLabel={telemetry.cycleTimeLabel}
          autoDayNightCycle={telemetry.autoDayNightCycle}
          headlightsOn={telemetry.headlightsOn}
          radioStation={save.settings.radioStation}
          radioVolume={save.settings.radioVolume}
          regionName={telemetry.regionName}
          save={save}
          activeCarData={activeCarData}
          sessionPlaySec={sessionPlaySec}
          onChangeRadioStation={(radioStation) =>
            updateSettings({ radioStation })
          }
          onChangeRadioVolume={(radioVolume) =>
            updateSettings({ radioVolume })
          }
          onResume={() => {
            setPaused(false);
            engineRef.current?.setPaused(false);
          }}
          onOpenPhotoMode={enterPhotoMode}
          onOpenQuests={() => setShowPauseQuests(true)}
          onRestart={() => {
            if (activeRaceConfig) {
              startRaceEvent(
                activeRaceConfig.event,
                activeRaceConfig.weather,
                activeRaceConfig.time,
              );
            } else {
              startFreeRoam(telemetry.playerX, telemetry.playerZ);
            }
          }}
          onOpenMap={() => setShowWorldMap(true)}
          onOpenSettings={() => setScreen('settings')}
          onCycleWeather={(w, t) => {
            engineRef.current?.setAtmosphere(w, t);
            setTelemetry((prev) => ({ ...prev, weather: w, timeOfDay: t }));
          }}
          onToggleDayNightCycle={() => {
            const next = engineRef.current?.toggleAutoDayNightCycle() ?? true;
            setTelemetry((prev) => ({ ...prev, autoDayNightCycle: next }));
          }}
          onToggleHeadlights={() => {
            engineRef.current?.toggleHeadlights();
            setTelemetry((prev) => ({
              ...prev,
              headlightsOn: !prev.headlightsOn,
            }));
          }}
          isFullscreen={isFullscreen}
          fullscreenSupported={fullscreenSupported}
          onToggleFullscreen={toggleFullscreen}
          onResetCar={() => engineRef.current?.resetCarToRoad()}
          onExitToMenu={enterMainMenu}
        />
      )}

      {screen === 'playing' && raceResult && (
        <RaceResultsModal
          result={raceResult}
          onRetry={() => {
            if (activeRaceConfig) {
              startRaceEvent(
                activeRaceConfig.event,
                activeRaceConfig.weather,
                activeRaceConfig.time,
              );
            }
          }}
          onFreeRoam={() => startFreeRoam(telemetry.playerX, telemetry.playerZ)}
          onMenu={enterMainMenu}
        />
      )}

      {showWorldMap && (
        <WorldMapModal
          save={save}
          playerX={telemetry.playerX}
          playerZ={telemetry.playerZ}
          playerHeading={telemetry.playerHeading}
          onlinePlayers={telemetry.onlinePlayers}
          onClose={() => setShowWorldMap(false)}
          onFastTravel={(x, z) => {
            setShowWorldMap(false);
            setPaused(false);
            engineRef.current?.setPaused(false);
            if (screen !== 'playing') {
              startFreeRoam(x, z);
            } else {
              engineRef.current?.fastTravelTo(x, z);
            }
            notify('Fast Travel Complete');
          }}
          onLaunchEvent={(evt) => startRaceEvent(evt)}
        />
      )}
      {showPauseQuests && (
        <QuestsModal
          save={save}
          sessionPlaySec={sessionPlaySec}
          onClaimQuest={(qId: QuestId) => {
            const shards = claimQuestReward(qId, sessionPlaySec);
            if (shards > 0) {
              notify(`Quest Claimed! +${shards} Fuma Shards`);
            }
          }}
          onClose={() => setShowPauseQuests(false)}
        />
      )}
    </div>
  );
}
