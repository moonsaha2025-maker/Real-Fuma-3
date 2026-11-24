import React, { useEffect, useState } from 'react';
import {
  Aperture,
  ArrowLeft,
  CloudRain,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  RotateCcw,
  Sun,
  Wind,
  X,
} from 'lucide-react';
import { audioEngine } from '../engine/audio';
import { TimeOfDay, WeatherType } from '../types/game';

const WEATHER_CYCLE: WeatherType[] = [
  'sunny',
  'cloudy',
  'rain',
  'heavy_rain',
  'thunderstorm',
  'fog',
];
const TIME_CYCLE: TimeOfDay[] = ['day', 'sunset', 'night', 'sunrise'];

interface PhotoModeOverlayProps {
  carName: string;
  regionName: string;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  cycleTimeLabel: string;
  onExit: () => void;
  onCapture: () => string | null;
  onResetCamera: () => void;
  onUpdateCamera: (patch: {
    fov?: number;
    dist?: number;
    height?: number;
    rollDeg?: number;
    motionBlur?: boolean;
    blurIntensity?: number;
  }) => void;
  onCycleWeather: (w: WeatherType, t: TimeOfDay) => void;
}

export const PhotoModeOverlay: React.FC<PhotoModeOverlayProps> = ({
  carName,
  regionName,
  weather,
  timeOfDay,
  cycleTimeLabel,
  onExit,
  onCapture,
  onResetCamera,
  onUpdateCamera,
  onCycleWeather,
}) => {
  const [fov, setFov] = useState(45);
  const [dist, setDist] = useState(5.2);
  const [height, setHeight] = useState(0.72);
  const [rollDeg, setRollDeg] = useState(0);
  const [motionBlur, setMotionBlur] = useState(false);
  const [blurIntensity, setBlurIntensity] = useState(0.45);
  const [showGrid, setShowGrid] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [lastShotUrl, setLastShotUrl] = useState<string | null>(null);

  const triggerCapture = () => {
    audioEngine.playShutterClick();
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 180);

    const url = onCapture();
    if (url) {
      setLastShotUrl(url);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.download = `real-fuma-${stamp}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        e.preventDefault();
        setUiHidden((prev) => !prev);
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        triggerCapture();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (uiHidden && e.code === 'Escape') {
          setUiHidden(false);
        } else {
          onExit();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleReset = () => {
    audioEngine.playUiClick();
    setFov(45);
    setDist(5.2);
    setHeight(0.72);
    setRollDeg(0);
    setMotionBlur(false);
    setBlurIntensity(0.45);
    onResetCamera();
  };

  const nextWeather = () => {
    audioEngine.playUiClick();
    const idx = WEATHER_CYCLE.indexOf(weather);
    onCycleWeather(WEATHER_CYCLE[(idx + 1) % WEATHER_CYCLE.length], timeOfDay);
  };

  const nextTime = () => {
    audioEngine.playUiClick();
    const idx = TIME_CYCLE.indexOf(timeOfDay);
    onCycleWeather(weather, TIME_CYCLE[(idx + 1) % TIME_CYCLE.length]);
  };

  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Camera shutter white flash */}
      {shutterFlash && (
        <div className="fixed inset-0 z-50 bg-white/75 pointer-events-none" />
      )}

      {/* Rule-of-thirds viewfinder composition guides */}
      {showGrid && !uiHidden && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/15" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/15" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/15" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/15" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 border border-white/25" />
        </div>
      )}

      {/* Minimal restore toggle when UI is hidden for OS screenshots */}
      {uiHidden ? (
        <div className="relative z-10 flex justify-end">
          <button
            onClick={() => setUiHidden(false)}
            title="Show Photo Controls [H]"
            aria-label="Show Photo Controls"
            className="pointer-events-auto opacity-30 hover:opacity-100 bg-black/60 border border-white/20 text-white p-2 cursor-pointer transition-opacity"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Top Bar */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onExit();
                }}
                className="flex items-center gap-1.5 bg-black/65 hover:bg-black/85 border border-white/20 text-white px-3.5 py-2 text-xs font-display font-bold tracking-wider whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-rose-500" />
                EXIT PHOTO MODE
              </button>

              <div className="hidden md:flex items-center gap-2 bg-black/55 border border-white/15 px-3 py-1.5 text-[11px] font-display text-slate-200">
                <span className="font-bold text-white">{carName}</span>
                <span className="text-white/35" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-300">{regionName}</span>
                <span className="text-white/35" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-num text-amber-300 tabular-nums">
                  {cycleTimeLabel}
                </span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  setShowGrid((g) => !g);
                }}
                title="Toggle Viewfinder Grid"
                aria-label="Toggle Viewfinder Grid"
                className={`p-2 border cursor-pointer ${
                  showGrid
                    ? 'bg-rose-600/80 border-rose-400 text-white'
                    : 'bg-black/60 hover:bg-black/80 border-white/20 text-slate-200'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                title="Reset Camera Angle"
                aria-label="Reset Camera Angle"
                className="p-2 bg-black/60 hover:bg-black/80 border border-white/20 text-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  setUiHidden(true);
                }}
                title="Hide UI [H]"
                aria-label="Hide Photo Mode UI"
                className="flex items-center gap-1.5 bg-black/60 hover:bg-black/80 border border-white/20 text-slate-200 px-3 py-2 text-xs font-display tracking-wider whitespace-nowrap shrink-0 cursor-pointer"
              >
                <EyeOff className="w-4 h-4" />
                HIDE UI
              </button>
            </div>
          </div>

          {/* Snapshot Thumbnail Preview */}
          {lastShotUrl && (
            <div className="relative z-10 pointer-events-auto ml-auto my-auto bg-[#0a0d14]/90 border border-white/20 p-2 w-48 shadow-2xl space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-display tracking-wider text-slate-300">
                <span>SAVED PNG</span>
                <button
                  onClick={() => setLastShotUrl(null)}
                  aria-label="Dismiss Preview"
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <img
                src={lastShotUrl}
                alt="Captured vehicle screenshot"
                className="w-full h-24 object-cover border border-white/10"
              />
              <a
                href={lastShotUrl}
                download="real-fuma-photo.png"
                className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-display tracking-wider py-1.5"
              >
                <Download className="w-3 h-3 text-sky-400" />
                DOWNLOAD PNG
              </a>
            </div>
          )}

          {/* Bottom Studio Controls */}
          <div className="relative z-10 pointer-events-auto mx-auto w-full max-w-4xl bg-[#0a0d14]/85 border border-white/15 p-3 sm:p-4 shadow-2xl space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="flex justify-between text-[10px] font-display tracking-wider text-slate-400 mb-1">
                  <span>LENS FOV</span>
                  <span className="font-mono-num text-slate-200 tabular-nums">
                    {fov}°
                  </span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={85}
                  step={1}
                  value={fov}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setFov(val);
                    onUpdateCamera({ fov: val });
                  }}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-display tracking-wider text-slate-400 mb-1">
                  <span>DISTANCE</span>
                  <span className="font-mono-num text-slate-200 tabular-nums">
                    {dist.toFixed(1)}m
                  </span>
                </div>
                <input
                  type="range"
                  min={2.6}
                  max={16.0}
                  step={0.1}
                  value={dist}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDist(val);
                    onUpdateCamera({ dist: val });
                  }}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-display tracking-wider text-slate-400 mb-1">
                  <span>HEIGHT</span>
                  <span className="font-mono-num text-slate-200 tabular-nums">
                    {height.toFixed(2)}m
                  </span>
                </div>
                <input
                  type="range"
                  min={-0.2}
                  max={2.4}
                  step={0.05}
                  value={height}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setHeight(val);
                    onUpdateCamera({ height: val });
                  }}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-display tracking-wider text-slate-400 mb-1">
                  <span>ROLL TILT</span>
                  <span className="font-mono-num text-slate-200 tabular-nums">
                    {rollDeg > 0 ? `+${rollDeg}` : rollDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-25}
                  max={25}
                  step={1}
                  value={rollDeg}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRollDeg(val);
                    onUpdateCamera({ rollDeg: val });
                  }}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Radial Speed Motion Blur Control Row */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  const next = !motionBlur;
                  setMotionBlur(next);
                  onUpdateCamera({ motionBlur: next, blurIntensity });
                }}
                aria-pressed={motionBlur}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-display font-bold tracking-wider whitespace-nowrap shrink-0 border cursor-pointer ${
                  motionBlur
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                <Wind className="w-3.5 h-3.5" />
                RADIAL BLUR: {motionBlur ? 'ON' : 'OFF'}
              </button>

              <div className="flex-1 min-w-[180px] flex items-center gap-3">
                <span className="text-[10px] font-display tracking-wider text-slate-400 whitespace-nowrap shrink-0">
                  BLUR INTENSITY
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={blurIntensity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setBlurIntensity(val);
                    if (!motionBlur) {
                      setMotionBlur(true);
                      onUpdateCamera({ motionBlur: true, blurIntensity: val });
                    } else {
                      onUpdateCamera({ blurIntensity: val });
                    }
                  }}
                  aria-label="Radial Motion Blur Intensity"
                  className={`flex-1 accent-sky-400 cursor-pointer ${
                    motionBlur ? 'opacity-100' : 'opacity-45'
                  }`}
                />
                <span className="font-mono-num text-[11px] text-slate-200 tabular-nums w-10 text-right shrink-0">
                  {Math.round(blurIntensity * 100)}%
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2">
                <button
                  onClick={nextWeather}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[11px] uppercase px-3 py-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  {weather.replace('_', ' ')}
                </button>
                <button
                  onClick={nextTime}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[11px] uppercase px-3 py-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  {timeOfDay}
                </button>
              </div>

              <div className="hidden lg:block text-[10px] font-display tracking-wider text-slate-400">
                DRAG TO ORBIT · SCROLL TO ZOOM · H HIDE UI · SPACE CAPTURE
              </div>

              <button
                onClick={triggerCapture}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-wider text-xs px-5 py-2 whitespace-nowrap shrink-0 cursor-pointer shadow-lg"
              >
                <Aperture className="w-4 h-4" />
                TAKE PHOTO
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
