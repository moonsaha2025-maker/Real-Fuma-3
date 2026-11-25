import React, { useState } from 'react';
import { ArrowLeft, RotateCcw, User } from 'lucide-react';
import { getCarSpec, RANK_INFO } from '../data/cars';
import { audioEngine } from '../engine/audio';
import { PlayerSaveData } from '../types/game';

interface ProfileModalProps {
  save: PlayerSaveData;
  onUpdateName: (name: string) => void;
  onResetSave: () => void;
  onBack: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  save,
  onUpdateName,
  onResetSave,
  onBack,
}) => {
  const [nameInput, setNameInput] = useState(save.driverName);
  const [confirmReset, setConfirmReset] = useState(false);

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
