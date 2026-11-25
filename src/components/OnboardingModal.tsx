import React, { useState } from 'react';
import { Calendar, ChevronRight, User } from 'lucide-react';
import { audioEngine } from '../engine/audio';

interface OnboardingModalProps {
  initialName?: string;
  onComplete: (username: string, age: number) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  initialName,
  onComplete,
}) => {
  const defaultDraft =
    initialName && initialName !== 'FUMA_RACER' ? initialName : '';
  const [username, setUsername] = useState(defaultDraft);
  const [age, setAge] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    audioEngine.init();

    const cleanName = username.trim();
    if (cleanName.length < 2) {
      setError('Please enter a username (at least 2 characters).');
      return;
    }

    const parsedAge = Number(age.trim());
    if (!Number.isFinite(parsedAge) || parsedAge < 6 || parsedAge > 120) {
      setError('Please enter a valid age between 6 and 120.');
      return;
    }

    setError(null);
    audioEngine.playUiClick();
    onComplete(cleanName.slice(0, 18), Math.round(parsedAge));
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#06070d]/84 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-md bg-[#0d1018] border border-white/15 shadow-2xl overflow-hidden">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              'linear-gradient(90deg, #6d28d9 0%, #db2777 50%, #ff6b4a 100%)',
          }}
        />

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div className="space-y-1 border-b border-white/10 pb-4">
            <div className="text-[11px] font-display tracking-[0.26em] text-amber-400 uppercase">
              REAL FUMA 3
            </div>
            <h2
              id="onboarding-title"
              className="font-display italic text-2xl sm:text-3xl font-bold text-white tracking-wide"
            >
              DRIVER PROFILE SETUP
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Enter your username and age to start your racing career.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="driver-username"
                className="flex items-center gap-1.5 text-xs font-display tracking-wider text-slate-300 uppercase mb-1.5"
              >
                <User className="w-3.5 h-3.5 text-violet-400" />
                Username
              </label>
              <input
                id="driver-username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={18}
                autoFocus
                autoComplete="username"
                placeholder="e.g. AlexDrift"
                className="w-full min-h-[44px] bg-[#07090f] border border-white/15 focus:border-violet-400 px-3.5 py-2.5 text-sm font-display text-white placeholder:text-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="driver-age"
                className="flex items-center gap-1.5 text-xs font-display tracking-wider text-slate-300 uppercase mb-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-pink-400" />
                Age
              </label>
              <input
                id="driver-age"
                type="number"
                inputMode="numeric"
                min={6}
                max={120}
                value={age}
                onChange={(e) => {
                  setAge(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter your age"
                className="w-full min-h-[44px] bg-[#07090f] border border-white/15 focus:border-pink-400 px-3.5 py-2.5 text-sm font-mono-num text-white placeholder:text-slate-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-rose-950/60 border border-rose-500/60 px-3.5 py-2 text-xs text-rose-200"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full min-h-[46px] flex items-center justify-center gap-2 text-white font-display italic font-bold text-sm sm:text-base tracking-[0.14em] uppercase shadow-[0_10px_24px_rgba(249,87,56,0.38)] hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer"
            style={{
              background:
                'linear-gradient(120deg, #ff784f 0%, #f95738 55%, #e11d48 100%)',
              clipPath: 'polygon(3% 0%, 100% 0%, 97% 100%, 0% 100%)',
            }}
          >
            <span>START GAME</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
