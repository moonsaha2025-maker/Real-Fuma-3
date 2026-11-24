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
import { PauseModal, RaceResultsModal } from './components/PauseAndResultsModal';
import { PhotoModeOverlay } from './components/PhotoModeOverlay';
import { ProfileModal } from './components/ProfileModal';
import { QuickRaceModal } from './components/QuickRaceModal';
import { SettingsModal } from './components/SettingsModal';
import { WorldMapModal } from './components/WorldMapModal';
import { getCarSpec } from './data/cars';
import { getRoadPointAt } from './data/track';
import { REGIONS } from './data/world';
import { audioEngine } from './engine/audio';
import { DRIVE_SPAWN_S, GameEngine } from './engine/GameEngine';
import { useGameStore } from './state/useGameStore';
import {
  ControlInputState,
  ControlScheme,
  LiveTelemetry,
  MapLandmark,
  OwnedCarData,
  RaceEvent,
  RaceResultSummary,
  ScreenState,
  TimeOfDay,
  WeatherType,
} from './types/game';

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
  opponents: [],
};

export default function App() {
  const {
    save,
    activeCarData,
    updateSettings,
    setDriverName,
    selectCar,
    buyCar,
    updateCarCustomization,
    buyUpgrade,
    setCarDirtLevel,
    unlockRegion,
    recordRaceResult,
    addFreeRoamRewards,
    resetProgress,
  } = useGameStore();

  const [screen, setScreen] = useState<ScreenState>('loading');
  const [paused, setPaused] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [telemetry, setTelemetry] = useState<LiveTelemetry>(INITIAL_TELEMETRY);
  const [raceResult, setRaceResult] = useState<RaceResultSummary | null>(null);
  const [isWashingCar, setIsWashingCar] = useState(false);
  const [activeRaceConfig, setActiveRaceConfig] = useState<{
    event: RaceEvent;
    weather?: WeatherType;
    time?: TimeOfDay;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
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
  });
  callbacksRef.current = {
    recordRaceResult,
    addFreeRoamRewards,
    unlockRegion,
    setCarDirtLevel,
  };

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2400);
  }, []);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container || engineRef.current) return;

    const engine = new GameEngine(container, activeCarData, save.settings, {
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
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
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
      setPaused(false);
      setPhotoMode(false);
      setRaceResult(null);
      setActiveRaceConfig(null);
      engineRef.current?.setPhotoMode(false);
      engineRef.current?.setPlayerCar(activeCarData);
      if (weather && time) {
        engineRef.current?.setAtmosphere(weather, time);
      }
      engineRef.current?.startFreeRoam(spawnX, spawnZ);
      setScreen('playing');
    },
    [activeCarData],
  );

  const startRaceEvent = useCallback(
    (event: RaceEvent, weather?: WeatherType, time?: TimeOfDay) => {
      setPaused(false);
      setPhotoMode(false);
      setRaceResult(null);
      setShowWorldMap(false);
      setActiveRaceConfig({ event, weather, time });
      engineRef.current?.setPhotoMode(false);
      engineRef.current?.setPlayerCar(activeCarData);
      engineRef.current?.startRaceEvent(event, weather, time);
      setScreen('playing');
    },
    [activeCarData],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
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
        !photoMode
      ) {
        enterPhotoMode();
      } else if (e.code === 'KeyM' && screen === 'playing' && !raceResult && !photoMode) {
        setShowWorldMap((prev) => !prev);
      } else if (e.code === 'Enter' && screen === 'main_menu' && !showWorldMap) {
        startFreeRoam();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, showWorldMap, raceResult, photoMode, startFreeRoam, enterPhotoMode]);

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
          onReady={() => {
            engineRef.current?.setShowcaseMode(true);
            setScreen('main_menu');
          }}
        />
      )}

      {screen === 'main_menu' && (
        <MainMenu
          save={save}
          activeCar={activeCarData}
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
          onDriveNow={() => startFreeRoam()}
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
          onUpdate={updateSettings}
          onBack={() =>
            setScreen(activeRaceConfig || paused ? 'playing' : 'main_menu')
          }
        />
      )}

      {screen === 'profile' && (
        <ProfileModal
          save={save}
          onUpdateName={setDriverName}
          onResetSave={() => {
            resetProgress();
            notify('Career Save Reset');
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
    </div>
  );
}
