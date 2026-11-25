import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../engine/audio';
import { RadioStationId } from '../types/game';

interface LoadingScreenProps {
  radioStation?: RadioStationId;
  onReady: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onReady }) => {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onReadyRef.current();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      onPointerDown={() => audioEngine.init()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06070b] px-6 select-none"
    >
      <h1 className="real-fuma-loading-text font-display italic font-bold text-4xl sm:text-6xl md:text-7xl tracking-[0.08em] text-white text-center">
        Real Fuma 3
      </h1>
    </div>
  );
};
