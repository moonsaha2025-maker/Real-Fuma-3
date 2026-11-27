import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../engine/audio';
import { RadioStationId } from '../types/game';

interface LoadingScreenProps {
  radioStation?: RadioStationId;
  onWarmup?: () => void;
  onReady: () => void;
}

const LOADING_LOGO_SRC = '/assets/aistudio/Neon_Red_Ghost_Emblem_7ea8b422.png';
const STUDIO_PHASE_MS = 2650;
const WARMUP_MS = 6400;
const TOTAL_LOADING_MS = 7000;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onWarmup,
  onReady,
}) => {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onWarmupRef = useRef(onWarmup);
  onWarmupRef.current = onWarmup;
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [phase, setPhase] = useState<'studio' | 'logo'>('studio');
  const [imgFailed, setImgFailed] = useState(false);
  const [logoDecoded, setLogoDecoded] = useState(false);

  useEffect(() => {
    const imgEl = imgRef.current;
    if (imgEl && typeof imgEl.decode === 'function') {
      imgEl
        .decode()
        .then(() => setLogoDecoded(true))
        .catch(() => setLogoDecoded(true));
    }

    const logoTimer = window.setTimeout(() => {
      setPhase('logo');
    }, STUDIO_PHASE_MS);

    const warmupTimer = window.setTimeout(() => {
      onWarmupRef.current?.();
    }, WARMUP_MS);

    const readyTimer = window.setTimeout(() => {
      onReadyRef.current();
    }, TOTAL_LOADING_MS);

    const decodeSafety = window.setTimeout(() => {
      setLogoDecoded(true);
    }, 1800);

    return () => {
      window.clearTimeout(logoTimer);
      window.clearTimeout(warmupTimer);
      window.clearTimeout(readyTimer);
      window.clearTimeout(decodeSafety);
    };
  }, []);

  return (
    <div
      onPointerDown={() => audioEngine.init()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 select-none overflow-hidden"
    >
      {/* Subtle studio / emblem ambient radial glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute w-[28rem] h-[28rem] sm:w-[36rem] sm:h-[36rem] rounded-full transition-opacity duration-500 ${
          phase === 'logo'
            ? 'real-fuma-loading-aura bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.28)_0%,rgba(127,29,29,0.08)_44%,transparent_72%)]'
            : 'opacity-40 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.14)_0%,rgba(15,17,22,0.05)_50%,transparent_74%)]'
        }`}
      />

      {/* Phase 1: Snikko Games studio title */}
      {phase === 'studio' && (
        <div className="relative flex flex-col items-center justify-center text-center">
          <h1 className="snikko-studio-title font-display font-bold text-3xl sm:text-5xl md:text-6xl tracking-[0.14em] text-slate-50 whitespace-nowrap">
            Snikko <span className="text-red-500">Games</span>
          </h1>
          <div
            aria-hidden="true"
            className="snikko-studio-line mt-4 h-px w-28 sm:w-40 bg-gradient-to-r from-transparent via-red-500/85 to-transparent"
          />
        </div>
      )}

      {/* Phase 2: Neon emblem logo (preloaded silently during Phase 1) */}
      <div
        aria-hidden={phase !== 'logo'}
        className={`flex items-center justify-center ${
          phase === 'logo' && logoDecoded
            ? 'relative real-fuma-loading-logo'
            : 'pointer-events-none absolute inset-0 opacity-0'
        }`}
      >
        {!imgFailed ? (
          <img
            ref={imgRef}
            src={LOADING_LOGO_SRC}
            alt="Real Fuma Racing emblem"
            referrerPolicy="no-referrer"
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onLoad={() => setLogoDecoded(true)}
            onError={() => {
              setImgFailed(true);
              setLogoDecoded(true);
            }}
            className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 object-contain pointer-events-none"
          />
        ) : (
          <div className="w-56 h-56 sm:w-72 sm:h-72 rounded-full bg-gradient-to-br from-red-950/60 via-black to-red-900/30 border border-red-500/30 flex items-center justify-center shadow-[0_0_60px_rgba(220,38,38,0.35)]">
            <span className="font-display italic font-bold text-5xl tracking-wider text-red-500">
              RF
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
