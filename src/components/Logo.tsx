import React from 'react';

interface LogoProps {
  compact?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ compact = false }) => {
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        width={compact ? 36 : 48}
        height={compact ? 36 : 48}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="fumaSilver" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="50%" stopColor="#94A3B8" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
          <linearGradient id="fumaRed" x1="0" y1="0" x2="64" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="50%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#9F1239" />
          </linearGradient>
        </defs>
        <path
          d="M10 12L32 4L54 12L50 44L32 60L14 44L10 12Z"
          fill="#0B0D12"
          stroke="url(#fumaSilver)"
          strokeWidth="2.5"
        />
        <path
          d="M16 18L48 18L44 26L24 26L22 33H40L37 40H21L18 49"
          stroke="url(#fumaRed)"
          strokeWidth="4.2"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path d="M29 44L43 32L46 37L32 51L29 44Z" fill="url(#fumaSilver)" />
      </svg>
      <div className="leading-none">
        <div
          className={`font-display font-bold tracking-wider uppercase ${
            compact ? 'text-xl' : 'text-3xl sm:text-4xl'
          }`}
        >
          <span className="text-slate-100">REAL </span>
          <span className="text-rose-500">FUMA</span>
        </div>
        {!compact && (
          <div className="text-[10px] sm:text-xs font-display tracking-[0.34em] text-slate-400 uppercase mt-1">
            OPEN WORLD RACING
          </div>
        )}
      </div>
    </div>
  );
};
