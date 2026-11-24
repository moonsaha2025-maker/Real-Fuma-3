import React, { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { audioEngine } from '../engine/audio';
import { getRadioStationMeta } from '../engine/radio';
import { RadioStationId } from '../types/game';
import { Logo } from './Logo';

interface LoadingScreenProps {
  radioStation: RadioStationId;
  onReady: () => void;
}

const STAGES = [
  'INITIALIZING SUNLIT PBR PIPELINE',
  'BUILDING COASTAL-TO-MOUNTAIN SPLINE LOOP',
  'CALIBRATING SUSPENSION & DRIFT PHYSICS',
  'STAGING WOKING 765LT SPIDER AT SUNSET COAST',
  'READY TO DRIVE',
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  radioStation,
  onReady,
}) => {
  const [progress, setProgress] = useState(0);
  const stationMeta = getRadioStationMeta(radioStation);

  useEffect(() => {
    const start = performance.now();
    const duration = 1050;
    let raf = 0;

    const step = (now: number) => {
      const pct = Math.min(100, ((now - start) / duration) * 100);
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(step);
      } else {
        setTimeout(onReady, 160);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [onReady]);

  const stageIdx = Math.min(
    STAGES.length - 1,
    Math.floor((progress / 100) * STAGES.length),
  );

  return (
    <div
      onPointerDown={() => audioEngine.init()}
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#07080b] p-6 sm:p-12"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <Logo />
        <div className="text-right font-mono-num text-xs text-slate-400">
          <div>COASTAL HORIZON</div>
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-300 mt-0.5">
            <Radio className="w-3.5 h-3.5" style={{ color: stationMeta.accentHex }} />
            <span>{stationMeta.name}</span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="text-sky-400">{stationMeta.freq}</span>
          </div>
        </div>
      </div>

      <div className="my-auto max-w-2xl">
        <div className="text-xs font-display tracking-[0.3em] text-rose-500 uppercase mb-2">
          SUNSET COAST · PALM CANYON · ALPINE PASS · FUJIMI BAY
        </div>
        <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-100 leading-tight">
          CRISP COASTAL PBR.
          <br />
          <span className="text-slate-400">SEAMLESS MOUNTAIN LOOP.</span>
        </h1>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-display tracking-widest uppercase">
          <span className="text-slate-300">{STAGES[stageIdx]}</span>
          <span className="font-mono-num text-rose-400 tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-rose-600 via-sky-400 to-slate-100 transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 font-display tracking-wider">
          <span>WASD / ARROWS OR TOUCH CONTROLS</span>
          <span>SPACE DRIFT · SHIFT NITRO · C CAMERA · P PHOTO</span>
        </div>
      </div>
    </div>
  );
};
