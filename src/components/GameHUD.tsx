import React, { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, Pause, Wrench } from 'lucide-react';
import { TRACK_STATIONS } from '../data/track';
import {
  ControlInputState,
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
  onOpenMap: () => void;
  onPause: () => void;
  onInteractLandmark: (lm: MapLandmark) => void;
  onStartNearbyEvent: (evt: RaceEvent) => void;
}

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

export const GameHUD: React.FC<GameHUDProps> = ({
  telemetry,
  settings,
  onTouchInput,
  onShiftGear,
  onCycleCamera,
  onOpenMap,
  onPause,
  onInteractLandmark,
  onStartNearbyEvent,
}) => {
  const [wheelAngle, setWheelAngle] = useState(0);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelDragging = useRef(false);

  useEffect(() => {
    if (settings.controlScheme !== 'tilt') return;
    const handleOrient = (ev: DeviceOrientationEvent) => {
      if (ev.gamma == null) return;
      const steer = Math.max(-1, Math.min(1, ev.gamma / 32));
      onTouchInput({ steer });
    };
    window.addEventListener('deviceorientation', handleOrient);
    return () => window.removeEventListener('deviceorientation', handleOrient);
  }, [settings.controlScheme, onTouchInput]);

  const displaySpeed =
    settings.units === 'MPH'
      ? Math.round(telemetry.speedKmh * 0.621371)
      : telemetry.speedKmh;

  const rpmPct = Math.min(1, telemetry.rpm / Math.max(1, telemetry.maxRpm));

  const handleWheelPointer = (clientX: number, clientY: number) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const ang = Math.atan2(dx, -dy);
    const clamped = Math.max(-1.35, Math.min(1.35, ang));
    setWheelAngle((clamped * 180) / Math.PI);
    onTouchInput({ steer: clamped / 1.35 });
  };

  const scaleStyle = {
    transform: `scale(${settings.touchButtonScale})`,
  };

  const showTouchControls = settings.controlScheme !== 'keyboard';

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-2.5 md:p-4 touch-none-game">
      {/* TOP BAR: Compact Translucent Radar Minimap + Top-Left FPS Meter + Race Status + Edge Buttons */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <div className="relative w-20 h-20 md:w-24 md:h-24 bg-black/35 border border-white/15 overflow-hidden">
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
                {telemetry.opponents.map((op, i) => (
                  <circle
                    key={i}
                    cx={-op.x}
                    cy={-op.z}
                    r={10}
                    fill="#f59e0b"
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

          <div
            aria-label="Frame rate meter"
            className="bg-black/45 border border-white/15 px-2 py-1 flex items-baseline gap-1"
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
        </div>

        {/* Top-Center: Active Race Telemetry or Live Drift Counter Only */}
        <div className="flex flex-col items-center gap-1.5">
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
        </div>

        {/* Top-Right: 3 Minimal Translucent Edge Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={onCycleCamera}
            title={`Camera (${telemetry.cameraMode}) [C]`}
            aria-label="Switch Camera"
            className="w-8 h-8 md:w-9 md:h-9 bg-black/35 hover:bg-black/55 border border-white/15 text-white/90 flex items-center justify-center cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenMap}
            title="Track Map [M]"
            aria-label="Open Track Map"
            className="w-8 h-8 md:w-9 md:h-9 bg-black/35 hover:bg-black/55 border border-white/15 text-white/90 flex items-center justify-center cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>
          <button
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
              onClick={() => onInteractLandmark(telemetry.nearLandmark!)}
              className="bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1 text-[11px] font-display font-bold flex items-center gap-1 cursor-pointer"
            >
              <Wrench className="w-3 h-3" /> OPEN
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM BAR: Slim Translucent Edge Controls + Compact Speed Readout */}
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
                  wheelDragging.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleWheelPointer(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (wheelDragging.current) {
                    handleWheelPointer(e.clientX, e.clientY);
                  }
                }}
                onPointerUp={() => {
                  wheelDragging.current = false;
                  setWheelAngle(0);
                  onTouchInput({ steer: 0 });
                }}
                onPointerCancel={() => {
                  wheelDragging.current = false;
                  setWheelAngle(0);
                  onTouchInput({ steer: 0 });
                }}
                className="w-24 h-24 rounded-full bg-black/30 border-2 border-white/25 flex items-center justify-center cursor-grab active:cursor-grabbing"
                style={{ transform: `rotate(${wheelAngle}deg)` }}
              >
                <div className="w-20 h-1.5 bg-rose-500/80" />
                <div className="w-4 h-4 rounded-full bg-white/80 border border-black absolute" />
              </div>
            ) : settings.controlScheme === 'tilt' ? (
              <div className="bg-black/35 border border-white/15 px-2.5 py-1 text-[9px] font-display text-white/75">
                TILT STEER
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onPointerDown={() => onTouchInput({ steer: -1 })}
                  onPointerUp={() => onTouchInput({ steer: 0 })}
                  onPointerLeave={() => onTouchInput({ steer: 0 })}
                  onPointerCancel={() => onTouchInput({ steer: 0 })}
                  aria-label="Steer Left"
                  className="w-12 h-12 bg-black/35 active:bg-rose-600/65 border border-white/15 text-white/90 font-display text-base flex items-center justify-center"
                >
                  ◀
                </button>
                <button
                  onPointerDown={() => onTouchInput({ steer: 1 })}
                  onPointerUp={() => onTouchInput({ steer: 0 })}
                  onPointerLeave={() => onTouchInput({ steer: 0 })}
                  onPointerCancel={() => onTouchInput({ steer: 0 })}
                  aria-label="Steer Right"
                  className="w-12 h-12 bg-black/35 active:bg-rose-600/65 border border-white/15 text-white/90 font-display text-base flex items-center justify-center"
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden lg:block bg-black/30 border border-white/10 px-2.5 py-1 text-[9px] font-display tracking-wider text-white/65">
            WASD DRIVE · SPACE DRIFT · SHIFT NOS · R RESET
          </div>
        )}

        {/* Bottom-Right: Compact Speedometer + Live NOS/Drift Readout + Touch Pedals */}
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
              className="pointer-events-auto flex items-end gap-1 origin-bottom-right"
              style={scaleStyle}
            >
              {settings.transmission === 'manual' && (
                <div className="flex flex-col gap-1">
                  <button
                    onPointerDown={() => onShiftGear(1)}
                    className="w-9 h-7 bg-black/35 active:bg-white/25 border border-white/15 text-white/90 font-display font-bold text-[10px]"
                  >
                    +G
                  </button>
                  <button
                    onPointerDown={() => onShiftGear(-1)}
                    className="w-9 h-7 bg-black/35 active:bg-white/25 border border-white/15 text-white/90 font-display font-bold text-[10px]"
                  >
                    -G
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <button
                  onPointerDown={() => onTouchInput({ nitro: true })}
                  onPointerUp={() => onTouchInput({ nitro: false })}
                  onPointerLeave={() => onTouchInput({ nitro: false })}
                  onPointerCancel={() => onTouchInput({ nitro: false })}
                  className="w-11 h-8 bg-sky-500/35 active:bg-sky-400/70 border border-sky-300/35 text-white/95 font-display font-bold text-[9px]"
                >
                  NOS
                </button>
                <button
                  onPointerDown={() => onTouchInput({ handbrake: true })}
                  onPointerUp={() => onTouchInput({ handbrake: false })}
                  onPointerLeave={() => onTouchInput({ handbrake: false })}
                  onPointerCancel={() => onTouchInput({ handbrake: false })}
                  className="w-11 h-8 bg-amber-500/35 active:bg-amber-400/70 border border-amber-300/35 text-white/95 font-display font-bold text-[9px]"
                >
                  DRIFT
                </button>
              </div>

              <button
                onPointerDown={() => onTouchInput({ brake: 1 })}
                onPointerUp={() => onTouchInput({ brake: 0 })}
                onPointerLeave={() => onTouchInput({ brake: 0 })}
                onPointerCancel={() => onTouchInput({ brake: 0 })}
                className="w-11 h-14 bg-black/35 active:bg-rose-600/60 border border-white/20 text-white/90 font-display font-bold text-[10px]"
              >
                BRK
              </button>
              <button
                onPointerDown={() => onTouchInput({ throttle: 1 })}
                onPointerUp={() => onTouchInput({ throttle: 0 })}
                onPointerLeave={() => onTouchInput({ throttle: 0 })}
                onPointerCancel={() => onTouchInput({ throttle: 0 })}
                className="w-12 h-16 bg-rose-600/55 active:bg-rose-500/80 border border-white/25 text-white font-display font-bold text-[11px]"
              >
                GAS
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
