import React, { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../engine/audio';
import { RadioStationId } from '../types/game';

interface LoadingScreenProps {
  radioStation?: RadioStationId;
  onReady: () => void;
}

const LOADING_LOGO_SRC = '/assets/aistudio/Neon_Red_Ghost_Emblem_7ea8b422.png';

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onReady }) => {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onReadyRef.current();
    }, 7000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      onPointerDown={() => audioEngine.init()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black px-6 select-none overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.16)_0%,rgba(127,29,29,0.05)_38%,transparent_70%)]"
      />
      <div className="real-fuma-loading-logo relative flex items-center justify-center">
        {!imgFailed ? (
          <img
            src={LOADING_LOGO_SRC}
            alt="Real Fuma Racing emblem"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setImgFailed(true)}
            className="real-fuma-loading-emblem w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 object-contain pointer-events-none"
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

