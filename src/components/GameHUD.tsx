import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Camera,
  Gamepad2,
  MapPin,
  Pause,
  Users,
  Wrench,
} from 'lucide-react';
import { TRACK_STATIONS } from '../data/track';
import {
  ControlInputState,
  ControlScheme,
  GameSettings,
  LiveTelemetry,
  MapLandmark,
  RaceEvent,
} from '../types/game';

interface GameHUDProps {
  telemetry: LiveTelemetry;
  settings: GameSettings;
  onTouchInput: (patch: Partial<ControlInputState>) => void;
  onShiftGear: (delta: -1 | 1) => void;
  onCycleCamera: () => void;
  onCycleControlScheme: () => void;
  onEnterPhotoMode: () => void;
  onOpenMap: () => void;
  onOpenOnlineLobby?: () => void;
  onPause: () => void;
  onInteractLandmark: (lm: MapLandmark) => void;
  onStartNearbyEvent: (evt: RaceEvent) => void;
}

const SCHEME_LABELS: Record<ControlScheme, string> = {
  buttons: 'TOUCH PAD',
  wheel: 'WHEEL',
  tilt: 'GYRO',
  keyboard: 'KEYS',
};

// Precompute static closed spline SVG paths once (negated XZ for starboard-right radar math)
const RADAR_LOOP_PATH = (() => {
  const step = 3;
  const parts: string[] = [];
  for (let i = 0; i < TRACK_STATIONS.length; i += step) {
    const st = TRACK_STATIONS[i];
    parts.push(`${i === 0 ? 'M' : 'L'}${(-st.x).toFixed(1)},${(-st.z).toFixed(1)}`);
  }
  parts.push('Z');
  return parts.join(' ');
})();

interface HoldButtonProps {
  onHoldChange: (held: boolean) => void;
  ariaLabel: string;
  className: string;
  activeClassName: string;
  children: React.ReactNode;
}

const TouchHoldButton: React.FC<HoldButtonProps> = ({
  onHoldChange,
  ariaLabel,
  className,
  activeClassName,
  children,
}) => {
  const [pressed, setPressed] = useState(false);
  const pointerIdsRef = useRef<Set<number>>(new Set());
  const latestOnHoldRef = useRef(onHoldChange);
  latestOnHoldRef.current = onHoldChange;

  const releasePointer = useCallback((pointerId?: number) => {
    if (pointerId !== undefined) {
      pointerIdsRef.current.delete(pointerId);
    } else {
      pointerIdsRef.current.clear();
    }
    if (pointerIdsRef.current.size === 0) {
      setPressed(false);
      latestOnHoldRef.current(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pointerIdsRef.current.size > 0) {
        pointerIdsRef.current.clear();
        latestOnHoldRef.current(false);
      }
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Ignore browsers rejecting synthetic pointer capture
        }
        pointerIdsRef.current.add(e.pointerId);
        setPressed(true);
        onHoldChange(true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        releasePointer(e.pointerId);
      }}
      onPointerCancel={(e) => {
        releasePointer(e.pointerId);
      }}
      onLostPointerCapture={(e) => {
        releasePointer(e.pointerId);
      }}
      className={`${className} touch-none select-none cursor-pointer transition-colors ${
        pressed ? activeClassName : ''
      }`}
    >
      {children}
    </button>
  );
};

export const GameHUD: React.FC<GameHUDProps> = ({
  telemetry,
  settings,
  onTouchInput,
  onShiftGear,
  onCycleCamera,
  onCycleControlScheme,
  onEnterPhotoMode,
  onOpenMap,
  onOpenOnlineLobby,
  onPause,
  onInteractLandmark,
  onStartNearbyEvent,
}) => {
  const [wheelAngle, setWheelAngle] = useState(0);
  const [rockerSteer, setRockerSteer] = useState(0);
  const [gyroSteer, setGyroSteer] = useState(0);
  const [gyroNeedsPermission, setGyroNeedsPermission] = useState(() => {
    const devOrient = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<'granted' | 'denied'>;
        })
      | undefined;
    return typeof devOrient?.requestPermission === 'function';
  });

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelPointerId = useRef<number | null>(null);
  const wheelStartRef = useRef<{ x: number; prevVal: number }>({
    x: 0,
    prevVal: 0,
  });

  const rockerRef = useRef<HTMLDivElement | null>(null);
  const rockerPointerId = useRef<number | null>(null);

  useEffect(() => {
    if (settings.controlScheme !== 'tilt' || gyroNeedsPermission) {
      setGyroSteer(0);
      return;
    }
    const handleOrient = (ev: DeviceOrientationEvent) => {
      if (ev.gamma == null) return;
      const deadzone = 3.5;
      const raw = ev.gamma;
      const absG = Math.abs(raw);
      let steer = 0;
      if (absG > deadzone) {
        steer = Math.sign(raw) * Math.min(1, (absG - deadzone) / 26);
      }
      setGyroSteer(steer);
      onTouchInput({ steer });
    };
    window.addEventListener('deviceorientation', handleOrient);
    return () => {
      window.removeEventListener('deviceorientation', handleOrient);
      onTouchInput({ steer: 0 });
    };
  }, [settings.controlScheme, gyroNeedsPermission, onTouchInput]);

  // Reset touch steer cleanly whenever control scheme switches
  useEffect(() => {
    setWheelAngle(0);
    setRockerSteer(0);
    onTouchInput({ steer: 0 });
  }, [settings.controlScheme, onTouchInput]);

  const requestGyroAccess = async () => {
    const devOrient = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<'granted' | 'denied'>;
        })
      | undefined;
    if (typeof devOrient?.requestPermission === 'function') {
      try {
        const res = await devOrient.requestPermission();
        if (res === 'granted') {
          setGyroNeedsPermission(false);
        }
      } catch {
        // User denied or unsupported context
      }
    }
  };

  const displaySpeed =
    settings.units === 'MPH'
      ? Math.round(telemetry.speedKmh * 0.621371)
      : telemetry.speedKmh;

  const rpmPct = Math.min(1, telemetry.rpm / Math.max(1, telemetry.maxRpm));

  // Continuous horizontal + arc steering wheel calculation without bottom-half flip bug
  const updateWheelSteer = (clientX: number, clientY: number, isDown: boolean) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let norm = 0;
    if (dy <= rect.height * 0.12) {
      const ang = Math.atan2(dx, Math.max(14, -dy));
      norm = Math.max(-1, Math.min(1, ang / 1.25));
    } else {
      norm = Math.max(-1, Math.min(1, dx / (rect.width * 0.55)));
    }

    if (isDown) {
      wheelStartRef.current = { x: clientX, prevVal: norm };
    }
    setWheelAngle(norm * 105);
    onTouchInput({ steer: norm });
  };

  // Unified slide-to-steer rocker: consistent full steer left/right, smooth bridge across center
  const updateRockerSteer = (clientX: number) => {
    if (!rockerRef.current) return;
    const rect = rockerRef.current.getBoundingClientRect();
    const rel = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    let val = 0;
    if (rel <= -0.14) {
      val = -1;
    } else if (rel >= 0.14) {
      val = 1;
    } else {
      val = rel / 0.14;
    }
    setRockerSteer(val);
    onTouchInput({ steer: val });
  };

  const scaleStyle = {
    transform: `scale(${settings.touchButtonScale})`,
  };

  const showTouchControls = settings.controlScheme !== 'keyboard';

  const dmg = Math.max(0, Math.min(1, telemetry.damageLevel));
  const dmgPct = Math.round(dmg * 100);
  const flash = Math.max(0, Math.min(1, telemetry.crashFlash));
  const isImpacting = flash > 0.08;
  const isSignificantDamage = dmg >= 0.45;
  const isModerateDamage = dmg >= 0.22 && dmg < 0.45;

  // Dynamic chassis SVG vertex deformation based on accumulated damage & live crash jolt
  const bend = dmg * 6.5 + flash * 3.8;
  const skewDeg = (isImpacting ? (flash * 9 - 2) : 0) + (dmg >= 0.45 ? dmg * 3.2 : 0);
  const scaleBump = isImpacting ? 1 + flash * 0.08 : 1;
  const frontInset = (dmg * 5.2 + flash * 2.5).toFixed(1);
  const leftBuckle = (9 + dmg * 4.5).toFixed(1);
  const rightBuckle = (39 - dmg * 4.2).toFixed(1);
  const dmgStroke =
    isImpacting || isSignificantDamage
      ? '#fca5a5'
      : isModerateDamage
        ? '#fbbf24'
        : '#a7f3d0';
  const dmgFill =
    isImpacting || isSignificantDamage
      ? 'rgba(239, 68, 68, 0.35)'
      : isModerateDamage
        ? 'rgba(245, 158, 11, 0.25)'
        : 'rgba(16, 185, 129, 0.16)';

  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2.5 md:p-4 touch-none-game select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {telemetry.crashFlash > 0.03 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none"
          style={{
            opacity: Math.min(0.75, telemetry.crashFlash * 0.75),
            background:
              'radial-gradient(ellipse at center, transparent 52%, rgba(239, 68, 68, 0.34) 84%, rgba(249, 115, 22, 0.56) 100%)',
          }}
        />
      )}
      {/* TOP BAR: Compact Translucent Radar Minimap + Top-Left FPS & Damage Indicator + Race Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <div className="relative w-20 h-20 md:w-24 md:h-24 bg-black/35 border border-white/15 overflow-hidden shrink-0">
            <svg viewBox="-210 -210 420 420" className="w-full h-full">
              <g
                transform={`rotate(${
                  (telemetry.playerHeading * 180) / Math.PI
                }) translate(${telemetry.playerX}, ${telemetry.playerZ})`}
              >
                <path
                  d={RADAR_LOOP_PATH}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeOpacity={0.78}
                  strokeWidth={14}
                  strokeLinejoin="round"
                />
                {(telemetry.trafficPositions ?? []).map((tp, i) => (
                  <circle
                    key={`tr-${i}`}
                    cx={-tp.x}
                    cy={-tp.z}
                    r={5.5}
                    fill="#38bdf8"
                    fillOpacity={0.85}
                  />
                ))}
                {telemetry.opponents.map((op, i) => (
                  <circle
                    key={i}
                    cx={-op.x}
                    cy={-op.z}
                    r={10}
                    fill="#f59e0b"
                  />
                ))}
                {(telemetry.onlinePlayers ?? []).map((op) => (
                  <circle
                    key={`ol-${op.uid}`}
                    cx={-op.x}
                    cy={-op.z}
                    r={12}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth={3}
                  />
                ))}
              </g>
              {/* Player Direction Arrow */}
              <polygon points="0,-14 9,11 0,6 -9,11" fill="#f43f5e" />
            </svg>
            <div className="absolute bottom-0 inset-x-0 bg-black/55 px-1.5 py-0.5 text-[8px] font-display tracking-wider text-white/90 flex items-center justify-between gap-1 border-t border-white/10">
              <span className="truncate">{telemetry.regionName}</span>
              <span className="font-mono-num text-amber-300/90 tabular-nums shrink-0">
                {telemetry.cycleTimeLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div
              aria-label="Frame rate meter"
              className="bg-black/45 border border-white/15 px-2 py-1 flex items-baseline justify-between gap-1.5"
            >
              <span
                className={`font-mono-num text-xs font-bold tabular-nums leading-none ${
                  telemetry.fps >= 50
                    ? 'text-emerald-400'
                    : telemetry.fps >= 30
                      ? 'text-amber-300'
                      : 'text-rose-400'
                }`}
              >
                {telemetry.fps}
              </span>
              <span className="text-[8px] font-display tracking-wider text-white/60">
                FPS
              </span>
            </div>

            {/* Dynamic Chassis Damage Indicator (deforms & flashes red on heavy crash/damage) */}
            <div
              role="status"
              aria-label={`Vehicle damage ${dmgPct} percent`}
              className={`border px-2 py-1 flex items-center gap-2 transition-colors duration-150 ${
                isImpacting
                  ? 'bg-rose-600/85 border-rose-200 shadow-[0_0_22px_rgba(244,63,94,0.85)]'
                  : isSignificantDamage
                    ? 'hud-damage-critical'
                    : isModerateDamage
                      ? 'bg-amber-950/60 border-amber-400/70'
                      : 'bg-black/45 border-white/15'
              }`}
              style={{
                transform: `skewX(${(-skewDeg).toFixed(1)}deg) scale(${scaleBump.toFixed(3)})`,
              }}
            >
              <svg
                viewBox="0 0 48 64"
                className="w-6 h-8 shrink-0 overflow-visible"
                aria-hidden="true"
              >
                {/* Dynamic deforming top-down chassis outline */}
                <path
                  d={`M 14 ${6 + Number(frontInset)} L 34 ${6 + Number(frontInset) * 0.7} L ${rightBuckle} 20 L 40 44 L 35 58 L 13 58 L 8 44 L ${leftBuckle} 20 Z`}
                  fill={dmgFill}
                  stroke={dmgStroke}
                  strokeWidth={isSignificantDamage || isImpacting ? 2.5 : 2}
                  strokeLinejoin="round"
                />
                {/* Windshield & Cabin */}
                <path
                  d={`M 15 ${(20 + bend * 0.35).toFixed(1)} L 33 ${(20 + bend * 0.25).toFixed(1)} L 31 37 L 17 37 Z`}
                  fill="rgba(15,23,42,0.75)"
                  stroke={dmgStroke}
                  strokeWidth={1.2}
                />
                {/* Structural fracture lines appear when car sustains moderate/significant damage */}
                {(dmg >= 0.28 || isImpacting) && (
                  <path
                    d={`M 18 11 L 24 18 L 20 26 M 32 13 L 27 21`}
                    fill="none"
                    stroke="#fecaca"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                  />
                )}
                {dmg >= 0.55 && (
                  <path
                    d={`M 10 30 L 17 34 L 13 43 M 38 33 L 31 39`}
                    fill="none"
                    stroke="#f87171"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                )}
              </svg>

              <div className="leading-tight">
                <div
                  className={`text-[8px] font-display font-bold tracking-wider uppercase ${
                    isImpacting || isSignificantDamage
                      ? 'text-rose-100'
                      : isModerateDamage
                        ? 'text-amber-300'
                        : 'text-white/65'
                  }`}
                >
                  {isImpacting
                    ? 'IMPACT!'
                    : isSignificantDamage
                      ? 'CRITICAL'
                      : 'DMG'}
                </div>
                <div
                  className={`font-mono-num text-xs font-bold tabular-nums leading-none mt-0.5 ${
                    isImpacting || isSignificantDamage
                      ? 'text-white'
                      : isModerateDamage
                        ? 'text-amber-200'
                        : 'text-emerald-300'
                  }`}
                >
                  {dmgPct}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top-Center: Online Room Bar + Active Race Telemetry + Live Drift Counter */}
        <div className="flex flex-col items-center gap-1.5">
          {telemetry.onlineMode && (
            <div className="pointer-events-auto bg-black/55 border border-emerald-400/45 px-2.5 py-1 flex items-center gap-2 text-[10px]">
              <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono-num font-bold text-emerald-300 tabular-nums whitespace-nowrap">
                {telemetry.onlineRoomId}
              </span>
              <span className="text-white/30 hidden sm:inline">|</span>
              <span className="text-white/90 font-display hidden sm:inline whitespace-nowrap">
                {(telemetry.onlinePlayers?.length ?? 0) + 1} ONLINE
              </span>
              {(telemetry.onlinePlayers ?? []).slice(0, 2).map((op) => (
                <span
                  key={op.uid}
                  className="hidden md:inline-flex items-center gap-1 text-slate-200 border-l border-white/15 pl-2 max-w-[140px] truncate"
                >
                  <span className="truncate font-semibold">{op.googleDisplayName}</span>
                  <span className="font-mono-num text-emerald-300 tabular-nums shrink-0">
                    {op.speedKmh}
                  </span>
                </span>
              ))}
              {onOpenOnlineLobby && (
                <button
                  type="button"
                  onClick={onOpenOnlineLobby}
                  className="ml-1 px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 font-display font-bold tracking-wider uppercase cursor-pointer whitespace-nowrap"
                >
                  LOBBY
                </button>
              )}
            </div>
          )}

          {telemetry.raceState === 'racing' && (
            <div className="bg-black/40 border border-white/15 px-3 py-1 flex items-center gap-3 text-[11px]">
              <div className="font-display font-bold text-white/90 tabular-nums">
                P
                <span className="text-rose-400 font-mono-num">
                  {telemetry.racePosition}/{telemetry.totalRacers}
                </span>
              </div>
              <div className="font-display text-white/75 tabular-nums">
                L
                <span className="font-mono-num text-white font-bold">
                  {telemetry.currentLap}/{telemetry.totalLaps}
                </span>
              </div>
              <div className="font-mono-num text-white/90 tabular-nums">
                {telemetry.raceElapsedSec.toFixed(1)}s
              </div>
            </div>
          )}

          {telemetry.isDrifting && (
            <div className="bg-amber-500/85 text-black font-display font-bold px-3 py-0.5 text-[11px] tracking-wider tabular-nums">
              DRIFT +{telemetry.currentDriftPoints.toLocaleString()}
            </div>
          )}

          {telemetry.noBrakeDriftSec >= 0.4 && (
            <div
              className={`px-2.5 py-0.5 text-[10px] font-mono-num font-bold tracking-wider tabular-nums border ${
                telemetry.noBrakeDriftSec >= 10
                  ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                  : 'bg-black/60 border-cyan-400/50 text-cyan-200'
              }`}
            >
              {telemetry.noBrakeDriftSec >= 10
                ? `NO-BRAKE DRIFT ${telemetry.noBrakeDriftSec.toFixed(1)}s · QUEST COMPLETE`
                : `NO-BRAKE DRIFT ${telemetry.noBrakeDriftSec.toFixed(1)}s / 10.0s`}
            </div>
          )}
        </div>

        {/* Top-Right: Minimal Translucent Edge Buttons + Quick Control Mode Switcher */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCycleControlScheme}
            title={`Input Mode: ${SCHEME_LABELS[settings.controlScheme]} (Tap to switch)`}
            aria-label="Switch Control Mode"
            className="h-8 md:h-9 px-2 bg-black/40 hover:bg-black/60 border border-white/15 text-white/90 flex items-center gap-1 cursor-pointer"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[9px] font-display font-bold tracking-wider hidden sm:inline">
              {SCHEME_LABELS[settings.controlScheme]}
            </span>
          </button>
          <button
            type="button"
            onClick={onEnterPhotoMode}
            title="Photo Mode [P]"
            aria-label="Enter Photo Mode"
            className="w-8 h-8 md:w-9 md:h-9 bg-black/35 hover:bg-black/55 border border-white/15 text-white/90 flex items-center justify-center cursor-pointer"
          >
            <Aperture className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onCycleCamera}
            title={`Camera (${telemetry.cameraMode}) [C]`}
            aria-label="Switch Camera"
            className="h-8 md:h-9 px-2 bg-black/40 hover:bg-black/60 border border-white/15 text-white/90 flex items-center gap-1 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[9px] font-display font-bold tracking-wider uppercase">
              {telemetry.cameraMode}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenMap}
            title="Track Map [M]"
            aria-label="Open Track Map"
            className="w-8 h-8 md:w-9 md:h-9 bg-black/35 hover:bg-black/55 border border-white/15 text-white/90 flex items-center justify-center cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onPause}
            title="Pause [Esc]"
            aria-label="Pause Game"
            className="w-8 h-8 md:w-9 md:h-9 bg-rose-600/70 hover:bg-rose-500/85 border border-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* CENTER: Clear driving view; only brief countdown or slim contextual prompt when parked on marker */}
      <div className="my-auto flex flex-col items-center gap-2">
        {telemetry.raceState === 'countdown' && (
          <div className="font-display text-6xl md:text-7xl font-bold text-rose-500 drop-shadow-lg tabular-nums">
            {telemetry.countdownValue > 0 ? telemetry.countdownValue : 'GO!'}
          </div>
        )}

        {telemetry.nearEvent && telemetry.raceState === 'free_roam' && (
          <div className="pointer-events-auto bg-black/55 border border-white/20 px-4 py-1.5 flex items-center gap-3">
            <div className="font-display font-bold text-xs text-white">
              {telemetry.nearEvent.title}
            </div>
            <button
              type="button"
              onClick={() => onStartNearbyEvent(telemetry.nearEvent!)}
              className="bg-rose-600/90 hover:bg-rose-500 text-white px-3 py-1 text-[11px] font-display font-bold tracking-wider cursor-pointer"
            >
              ENTER RACE
            </button>
          </div>
        )}

        {telemetry.nearLandmark && telemetry.raceState === 'free_roam' && (
          <div className="pointer-events-auto bg-black/55 border border-white/20 px-4 py-1.5 flex items-center gap-3">
            <div className="text-xs font-display text-white/90">
              {telemetry.nearLandmark.name}
            </div>
            <button
              type="button"
              onClick={() => onInteractLandmark(telemetry.nearLandmark!)}
              className="bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1 text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer"
            >
              <Wrench className="w-3 h-3" /> OPEN
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM BAR: Ergonomic Multi-Touch Edge Controls + Compact Speed Readout */}
      <div className="flex items-end justify-between gap-2">
        {showTouchControls ? (
          <div
            className="pointer-events-auto flex items-center gap-1.5 origin-bottom-left"
            style={scaleStyle}
          >
            {settings.controlScheme === 'wheel' ? (
              <div
                ref={wheelRef}
                onPointerDown={(e) => {
                  e.preventDefault();
                  wheelPointerId.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore capture failures
                  }
                  updateWheelSteer(e.clientX, e.clientY, true);
                }}
                onPointerMove={(e) => {
                  if (wheelPointerId.current === e.pointerId) {
                    updateWheelSteer(e.clientX, e.clientY, false);
                  }
                }}
                onPointerUp={(e) => {
                  if (wheelPointerId.current === e.pointerId) {
                    wheelPointerId.current = null;
                    setWheelAngle(0);
                    onTouchInput({ steer: 0 });
                  }
                }}
                onPointerCancel={() => {
                  wheelPointerId.current = null;
                  setWheelAngle(0);
                  onTouchInput({ steer: 0 });
                }}
                onLostPointerCapture={() => {
                  wheelPointerId.current = null;
                  setWheelAngle(0);
                  onTouchInput({ steer: 0 });
                }}
                className="w-28 h-28 rounded-full bg-black/40 border-2 border-white/30 flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing relative"
                style={{ transform: `rotate(${wheelAngle}deg)` }}
              >
                <div className="w-24 h-2 bg-rose-500/85" />
                <div className="w-2 h-5 bg-rose-400 absolute top-1" />
                <div className="w-5 h-5 rounded-full bg-white/85 border border-black absolute" />
              </div>
            ) : settings.controlScheme === 'tilt' ? (
              <div className="bg-black/45 border border-white/20 px-3 py-2 space-y-1.5 min-w-[116px]">
                {gyroNeedsPermission ? (
                  <button
                    type="button"
                    onClick={requestGyroAccess}
                    className="w-full bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-[10px] py-1.5 px-2 cursor-pointer"
                  >
                    ENABLE GYRO
                  </button>
                ) : (
                  <>
                    <div className="text-[9px] font-display tracking-wider text-white/80 text-center">
                      TILT STEER ACTIVE
                    </div>
                    <div className="h-1.5 bg-white/15 relative overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 w-3 bg-rose-500 -translate-x-1/2"
                        style={{ left: `${50 + gyroSteer * 45}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* Unified Slide-to-Steer Rocker: tap ◀ / ▶ OR slide thumb smoothly across center */
              <div
                ref={rockerRef}
                role="group"
                aria-label="Steering Pad"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.preventDefault();
                  rockerPointerId.current = e.pointerId;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // Ignore capture failures
                  }
                  updateRockerSteer(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (rockerPointerId.current === e.pointerId) {
                    updateRockerSteer(e.clientX);
                  }
                }}
                onPointerUp={(e) => {
                  if (rockerPointerId.current === e.pointerId) {
                    rockerPointerId.current = null;
                    setRockerSteer(0);
                    onTouchInput({ steer: 0 });
                  }
                }}
                onPointerCancel={() => {
                  rockerPointerId.current = null;
                  setRockerSteer(0);
                  onTouchInput({ steer: 0 });
                }}
                onLostPointerCapture={() => {
                  rockerPointerId.current = null;
                  setRockerSteer(0);
                  onTouchInput({ steer: 0 });
                }}
                className="flex items-stretch gap-1.5 touch-none select-none cursor-pointer"
              >
                <div
                  className={`w-16 h-16 border flex items-center justify-center font-display text-lg transition-colors ${
                    rockerSteer < -0.1
                      ? 'bg-rose-600/75 border-rose-300 text-white'
                      : 'bg-black/40 border-white/20 text-white/90'
                  }`}
                >
                  ◀
                </div>
                <div
                  className={`w-16 h-16 border flex items-center justify-center font-display text-lg transition-colors ${
                    rockerSteer > 0.1
                      ? 'bg-rose-600/75 border-rose-300 text-white'
                      : 'bg-black/40 border-white/20 text-white/90'
                  }`}
                >
                  ▶
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden md:block bg-black/35 border border-white/10 px-2.5 py-1 text-[9px] font-display tracking-wider text-white/70">
            WASD / ARROWS DRIVE · SPACE DRIFT · SHIFT NOS · C CAM · R RESET
          </div>
        )}

        {/* Bottom-Right: Compact Speedometer + Live NOS/Drift Readout + Multi-Touch Pedals */}
        <div className="flex items-end gap-1.5 ml-auto">
          <div className="bg-black/40 border border-white/15 px-2.5 py-1.5 min-w-[90px] space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono-num text-xl font-bold text-white leading-none tabular-nums">
                {displaySpeed}
              </span>
              <span className="text-[8px] font-display text-white/60">
                {settings.units}
              </span>
              <span className="text-xs font-mono-num font-bold text-rose-400">
                {telemetry.gear === -1 ? 'R' : telemetry.gear}
              </span>
            </div>
            <div className="h-[2px] bg-white/15">
              <div
                className="h-full bg-rose-500/85"
                style={{ width: `${Math.round(rpmPct * 100)}%` }}
              />
            </div>
            <div className="h-[3px] bg-white/15 overflow-hidden">
              <div
                className={`h-full ${telemetry.nitroActive ? 'bg-cyan-300' : 'bg-sky-400/85'}`}
                style={{ width: `${Math.min(100, telemetry.nitro)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[8px] font-display tracking-wider pt-0.5">
              <span className={telemetry.nitroActive ? 'text-cyan-300 font-bold' : 'text-sky-300/75'}>
                {telemetry.nitroActive ? 'NOS ACTIVE' : `NOS ${telemetry.nitro}%`}
              </span>
              {telemetry.driftAngleDeg > 10 && (
                <span className="text-amber-300 font-mono-num font-bold tabular-nums">
                  {telemetry.driftAngleDeg}°
                </span>
              )}
            </div>
          </div>

          {showTouchControls && (
            <div
              className="pointer-events-auto flex items-end gap-1.5 origin-bottom-right"
              style={scaleStyle}
            >
              {settings.transmission === 'manual' && (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onShiftGear(1);
                    }}
                    className="w-10 h-8 bg-black/40 active:bg-white/25 border border-white/20 text-white/90 font-display font-bold text-[10px] touch-none select-none cursor-pointer"
                  >
                    +G
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onShiftGear(-1);
                    }}
                    className="w-10 h-8 bg-black/40 active:bg-white/25 border border-white/20 text-white/90 font-display font-bold text-[10px] touch-none select-none cursor-pointer"
                  >
                    -G
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <TouchHoldButton
                  ariaLabel="Nitro Boost"
                  onHoldChange={(held) => onTouchInput({ nitro: held })}
                  className="w-12 h-9 bg-sky-500/40 border border-sky-300/40 text-white/95 font-display font-bold text-[10px]"
                  activeClassName="bg-sky-400/80 border-sky-200"
                >
                  NOS
                </TouchHoldButton>
                <TouchHoldButton
                  ariaLabel="Drift Handbrake"
                  onHoldChange={(held) => onTouchInput({ handbrake: held })}
                  className="w-12 h-9 bg-amber-500/40 border border-amber-300/40 text-white/95 font-display font-bold text-[10px]"
                  activeClassName="bg-amber-400/80 border-amber-200 text-black"
                >
                  DRIFT
                </TouchHoldButton>
              </div>

              <TouchHoldButton
                ariaLabel="Brake and Reverse"
                onHoldChange={(held) => onTouchInput({ brake: held ? 1 : 0 })}
                className="w-13 h-16 bg-black/40 border border-white/25 text-white/95 font-display font-bold text-[11px]"
                activeClassName="bg-rose-700/75 border-rose-300"
              >
                BRK
              </TouchHoldButton>
              <TouchHoldButton
                ariaLabel="Accelerate"
                onHoldChange={(held) => onTouchInput({ throttle: held ? 1 : 0 })}
                className="w-14 h-[74px] bg-rose-600/60 border border-white/30 text-white font-display font-bold text-xs"
                activeClassName="bg-rose-500/90 border-white"
              >
                GAS
              </TouchHoldButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
