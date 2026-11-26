import React, { useState } from 'react';
import { Calendar, CheckCircle2, ChevronRight, Loader2, User } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { audioEngine } from '../engine/audio';

interface OnboardingModalProps {
  initialName?: string;
  authUser: FirebaseUser | null;
  authBusy?: boolean;
  onGoogleSignIn: () => Promise<{ ok: boolean; error?: string; displayName?: string }>;
  onComplete: (username: string, age: number) => void;
}

const GoogleGIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  initialName,
  authUser,
  authBusy = false,
  onGoogleSignIn,
  onComplete,
}) => {
  const defaultDraft =
    initialName && initialName !== 'FUMA_RACER'
      ? initialName
      : (authUser?.displayName ?? '').slice(0, 18);
  const [username, setUsername] = useState(defaultDraft);
  const [age, setAge] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleGoogleClick = async () => {
    audioEngine.init();
    audioEngine.playUiClick();
    setError(null);
    const res = await onGoogleSignIn();
    if (!res.ok && res.error) {
      setError(res.error);
      return;
    }
    if (res.ok && res.displayName && !username.trim()) {
      setUsername(res.displayName.slice(0, 18));
    }
  };

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
      className="fixed inset-0 z-40 bg-[#06070d]/84 backdrop-blur-md overflow-y-auto flex justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="my-auto w-full max-w-md bg-[#0d1018] border border-white/15 shadow-2xl overflow-hidden">
        <div
          className="h-1.5 w-full"
          style={{
            background:
              'linear-gradient(90deg, #6d28d9 0%, #db2777 50%, #ff6b4a 100%)',
          }}
        />

        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-4">
          <div className="space-y-1 border-b border-white/10 pb-3.5">
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
              Sign in with Google to sync your career, or set up a local profile.
            </p>
          </div>

          {/* Google Sign-In / Account Creation Box */}
          {!authUser ? (
            <button
              type="button"
              disabled={authBusy}
              onClick={handleGoogleClick}
              className="w-full min-h-[44px] bg-white hover:bg-slate-100 disabled:opacity-70 text-[#0f172a] font-display font-bold text-xs sm:text-sm tracking-wide px-4 py-2.5 flex items-center justify-center gap-2.5 shadow-md transition-colors cursor-pointer"
            >
              {authBusy ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
              ) : (
                <GoogleGIcon />
              )}
              <span>
                {authBusy
                  ? 'CONNECTING GOOGLE...'
                  : 'SIGN IN / CREATE ACCOUNT WITH GOOGLE'}
              </span>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-3 bg-emerald-950/35 border border-emerald-500/40 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                {authUser.photoURL && !imgFailed ? (
                  <img
                    src={authUser.photoURL}
                    alt={authUser.displayName ?? 'Google Avatar'}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-8 h-8 rounded-full border border-emerald-400/50 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-emerald-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-display font-bold text-white truncate">
                    {authUser.displayName || 'Google Account Linked'}
                  </div>
                  <div className="text-[11px] text-emerald-300/90 truncate">
                    {authUser.email}
                  </div>
                </div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>
          )}

          <div className="flex items-center gap-2.5 text-[10px] font-display tracking-widest text-slate-500 uppercase">
            <span className="h-px flex-1 bg-white/10" />
            <span>{authUser ? 'Finish Driver Card' : 'Or Play Locally'}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="space-y-3.5">
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
            <span>{authUser ? 'CREATE ACCOUNT & START' : 'START GAME'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
