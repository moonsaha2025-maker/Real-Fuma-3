import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../engine/audio';
import { RadioStationId } from '../types/game';

interface LoadingScreenProps {
  radioStation?: RadioStationId;
  onWarmup?: () => void;
  onReady: () => void;
}

const LOADING_LOGO_SRC = '/assets/aistudio/Neon_Red_Ghost_Emblem_7ea8b422.png';

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onWarmup,
  onReady,
}) => {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onWarmupRef = useRef(onWarmup);
  onWarmupRef.current = onWarmup;
  const [imgFailed, setImgFailed] = useState(false);
  const [logoDecoded, setLogoDecoded] = useState(false);

  useEffect(() => {
    const warmupTimer = window.setTimeout(() => {
      onWarmupRef.current?.();
    }, 6400);
    const timer = window.setTimeout(() => {
      onReadyRef.current();
    }, 7000);
    const decodeSafety = window.setTimeout(() => {
      setLogoDecoded(true);
    }, 350);
    return () => {
      window.clearTimeout(warmupTimer);
      window.clearTimeout(timer);
      window.clearTimeout(decodeSafety);
    };
  }, []);

  return (
    <div
      onPointerDown={() => audioEngine.init()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 select-none overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="real-fuma-loading-aura pointer-events-none absolute w-[28rem] h-[28rem] sm:w-[36rem] sm:h-[36rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.28)_0%,rgba(127,29,29,0.08)_44%,transparent_72%)]"
      />
      <div
        className={`${logoDecoded ? 'real-fuma-loading-logo' : 'opacity-0'} relative flex items-center justify-center`}
      >
        {!imgFailed ? (
          <img
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

