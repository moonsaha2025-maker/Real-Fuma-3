import React, { useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  User,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { getCarSpec, RANK_INFO } from '../data/cars';
import { audioEngine } from '../engine/audio';
import { PlayerSaveData } from '../types/game';

interface ProfileModalProps {
  save: PlayerSaveData;
  authUser: FirebaseUser | null;
  authBusy?: boolean;
  cloudSyncState?: 'idle' | 'syncing' | 'synced' | 'error';
  onGoogleSignIn: () => Promise<{ ok: boolean; error?: string }>;
  onGoogleSignOut: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onUpdateName: (name: string) => void;
  onResetSave: () => void;
  onBack: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  save,
  authUser,
  authBusy = false,
  cloudSyncState = 'idle',
  onGoogleSignIn,
  onGoogleSignOut,
  onSyncNow,
  onUpdateName,
  onResetSave,
  onBack,
}) => {
  const [nameInput, setNameInput] = useState(save.driverName);
  const [confirmReset, setConfirmReset] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const garageValue = Object.keys(save.ownedCars).reduce(
    (sum, id) => sum + getCarSpec(id).price,
    0,
  );

  return (
    <div className="fixed inset-0 z-40 bg-[#07080b]/95 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onBack();
              }}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-display tracking-wider text-slate-100 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-rose-500" />
              BACK
            </button>
            <div>
              <div className="text-[10px] font-display tracking-[0.28em] text-rose-500 uppercase">
                DRIVER TELEMETRY & LICENSE
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-100">
                PLAYER PROFILE
              </h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0d1017] border border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-rose-600/20 border border-rose-500 flex items-center justify-center">
                <User className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <div className="text-[10px] font-display text-rose-400 uppercase">
                  {RANK_INFO[save.rank].label}
                </div>
                <div className="font-display text-lg font-bold text-slate-100">
                  {save.driverName}
                </div>
                {save.driverAge !== undefined && (
                  <div className="text-[11px] font-mono-num text-slate-400">
                    Age {save.driverAge}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-display text-slate-400 mb-1">
                DRIVER CALLSIGN
              </label>
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={18}
                  className="flex-1 bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs font-display text-white"
                />
                <button
                  onClick={() => {
                    audioEngine.playUiClick();
                    onUpdateName(nameInput);
                  }}
                  className="bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-display font-bold text-white cursor-pointer"
                >
                  SAVE
                </button>
              </div>
            </div>

            {/* Google Account & Cloud Save Section */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-[10px] font-display text-slate-400 uppercase">
                <span>GOOGLE CLOUD ACCOUNT</span>
                {authUser ? (
                  <span
                    className={`flex items-center gap-1 ${
                      cloudSyncState === 'error'
                        ? 'text-rose-400'
                        : cloudSyncState === 'syncing'
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                    }`}
                  >
                    <Cloud className="w-3 h-3" />
                    {cloudSyncState === 'syncing'
                      ? 'SYNCING'
                      : cloudSyncState === 'error'
                        ? 'SYNC ERROR'
                        : 'SYNCED'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-500">
                    <CloudOff className="w-3 h-3" />
                    LOCAL ONLY
                  </span>
                )}
              </div>

              {!authUser ? (
                <div className="space-y-2">
                  <button
                    disabled={authBusy}
                    onClick={async () => {
                      audioEngine.playUiClick();
                      setAuthError(null);
                      const res = await onGoogleSignIn();
                      if (!res.ok && res.error) setAuthError(res.error);
                    }}
                    className="w-full min-h-[40px] bg-white hover:bg-slate-100 disabled:opacity-70 text-[#0f172a] font-display font-bold text-xs px-3 py-2 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    {authBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
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
                    )}
                    <span>
                      {authBusy ? 'CONNECTING...' : 'SIGN IN / CREATE ACCOUNT'}
                    </span>
                  </button>
                  <p className="text-[11px] text-slate-400">
                    Link your Google account to save cars, cash, and Fuma Shards across devices.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 bg-slate-950/80 border border-slate-800 p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {authUser.photoURL && !avatarFailed ? (
                      <img
                        src={authUser.photoURL}
                        alt={authUser.displayName ?? 'Google Avatar'}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                        className="w-9 h-9 rounded-full border border-emerald-400/50 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-emerald-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-display font-bold text-white truncate">
                        {authUser.displayName || 'Google Driver'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {authUser.email}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        audioEngine.playUiClick();
                        void onSyncNow();
                      }}
                      disabled={cloudSyncState === 'syncing'}
                      className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-[11px] font-display text-slate-200 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3 h-3 text-sky-400 ${
                          cloudSyncState === 'syncing' ? 'animate-spin' : ''
                        }`}
                      />
                      SYNC NOW
                    </button>
                    <button
                      onClick={() => {
                        audioEngine.playUiClick();
                        void onGoogleSignOut();
                      }}
                      className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-600/50 px-2.5 py-1.5 text-[11px] font-display text-slate-200 hover:text-rose-200 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3 text-rose-400" />
                      SIGN OUT
                    </button>
                  </div>
                </div>
              )}

              {authError && (
                <div className="text-[11px] text-rose-300 bg-rose-950/50 border border-rose-500/40 px-2.5 py-1.5">
                  {authError}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800">
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1.5 text-xs font-display text-slate-400 hover:text-rose-400 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  RESET CAREER SAVE DATA
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onResetSave();
                      setConfirmReset(false);
                    }}
                    className="bg-rose-600 px-3 py-1 text-xs font-display font-bold text-white cursor-pointer"
                  >
                    CONFIRM RESET
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="bg-slate-800 px-3 py-1 text-xs font-display text-slate-300 cursor-pointer"
                  >
                    CANCEL
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-2 bg-[#0d1017] border border-slate-800 p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 tabular-nums">
            <div>
              <div className="text-[10px] font-display text-slate-400">RACES WON / ENTERED</div>
              <div className="font-mono-num text-xl font-bold text-slate-100 mt-1">
                {save.stats.racesWon} / {save.stats.racesCompleted}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-display text-slate-400">TOP RECORDED SPEED</div>
              <div className="font-mono-num text-xl font-bold text-rose-400 mt-1">
                {save.stats.topSpeedKmh} KM/H
              </div>
            </div>
            <div>
              <div className="text-[10px] font-display text-slate-400">DISTANCE DRIVEN</div>
              <div className="font-mono-num text-xl font-bold text-slate-100 mt-1">
                {save.stats.totalDistanceKm.toFixed(1)} KM
              </div>
            </div>
            <div>
              <div className="text-[10px] font-display text-slate-400">TOTAL DRIFT SCORE</div>
              <div className="font-mono-num text-xl font-bold text-amber-400 mt-1">
                {save.stats.totalDriftScore.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-display text-slate-400">ZONES DISCOVERED</div>
              <div className="font-mono-num text-xl font-bold text-sky-400 mt-1">
                {save.unlockedRegions.length} / 4
              </div>
            </div>
            <div>
              <div className="text-[10px] font-display text-slate-400">FUMA SHARDS</div>
              <div className="font-mono-num text-xl font-bold text-cyan-300 mt-1">
                {save.fumaShards}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-display text-slate-400">GARAGE ASSET VALUE</div>
              <div className="font-mono-num text-xl font-bold text-emerald-400 mt-1">
                ${garageValue.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Races */}
        <div className="bg-[#0d1017] border border-slate-800 p-5">
          <div className="text-xs font-display font-bold tracking-widest text-slate-300 mb-3">
            RECENT EVENT HISTORY
          </div>
          {save.recentResults.length === 0 ? (
            <div className="text-xs text-slate-500">
              No completed events yet. Launch Events or Career Mode to set loop records.
            </div>
          ) : (
            <div className="space-y-2">
              {save.recentResults.slice(0, 6).map((r, i) => (
                <div
                  key={`${r.eventId}_${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 border border-slate-800/70 px-3 py-2 text-xs tabular-nums"
                >
                  <div>
                    <span className="font-display font-bold text-slate-100">
                      {r.eventTitle}
                    </span>
                    <span className="text-slate-500 ml-2 uppercase">
                      {r.mode.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono-num">
                    <span className={r.won ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      P{r.position}/{r.totalRacers}
                    </span>
                    <span className="text-slate-300">{r.timeSec.toFixed(1)}s</span>
                    <span className="text-emerald-400">+${r.cashEarned.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
