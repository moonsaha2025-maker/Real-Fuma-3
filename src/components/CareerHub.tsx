import React from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Lock,
  Play,
  Swords,
  Trophy,
} from 'lucide-react';
import { isRankAtLeast, RANK_INFO, RANK_ORDER } from '../data/cars';
import { ACHIEVEMENTS_LIST, RACE_EVENTS, REGIONS } from '../data/world';
import { audioEngine } from '../engine/audio';
import { PlayerSaveData, RaceEvent } from '../types/game';

interface CareerHubProps {
  save: PlayerSaveData;
  onBack: () => void;
  onStartEvent: (evt: RaceEvent) => void;
}

export const CareerHub: React.FC<CareerHubProps> = ({
  save,
  onBack,
  onStartEvent,
}) => {
  const curIdx = RANK_ORDER.indexOf(save.rank);
  const nextRank = curIdx < RANK_ORDER.length - 1 ? RANK_ORDER[curIdx + 1] : null;
  const curRankInfo = RANK_INFO[save.rank];
  const nextRankInfo = nextRank ? RANK_INFO[nextRank] : null;

  const xpPct = nextRankInfo
    ? Math.min(
        100,
        Math.round(
          ((save.xp - curRankInfo.minXp) /
            Math.max(1, nextRankInfo.minXp - curRankInfo.minXp)) *
            100,
        ),
      )
    : 100;

  return (
    <div className="fixed inset-0 z-30 bg-[#07080b]/95 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
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
                COASTAL CHAMPIONSHIP
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-100">
                CAREER PROGRESSION
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-5 bg-[#0d1017] border border-slate-800 px-4 py-2.5 tabular-nums">
            <div>
              <div className="text-[10px] text-slate-500 font-display">XP</div>
              <div className="font-mono-num text-sm font-bold text-sky-400">
                {save.xp.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-display">REPUTATION</div>
              <div className="font-mono-num text-sm font-bold text-rose-400">
                {save.reputation.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-display">CREDITS</div>
              <div className="font-mono-num text-sm font-bold text-emerald-400">
                ${save.money.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* 5-Tier Career Ladder */}
        <div className="bg-[#0d1017] border border-slate-800 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-display text-xs tracking-widest text-slate-300">
              CURRENT TIER:{' '}
              <span className="text-rose-400 font-bold uppercase">
                {curRankInfo.label}
              </span>
            </div>
            {nextRankInfo && (
              <div className="font-mono-num text-xs text-slate-400 tabular-nums">
                NEXT: {nextRankInfo.label} ({nextRankInfo.minXp.toLocaleString()} XP ·{' '}
                {nextRankInfo.minRep.toLocaleString()} REP)
              </div>
            )}
          </div>

          <div className="grid grid-cols-5 gap-2 mb-3">
            {RANK_ORDER.map((r, i) => {
              const reached = i <= curIdx;
              return (
                <div
                  key={r}
                  className={`p-2 border text-center ${
                    reached
                      ? 'bg-rose-950/30 border-rose-500/80 text-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="text-[10px] font-mono-num">TIER {i + 1}</div>
                  <div className="font-display text-xs font-bold truncate mt-0.5">
                    {RANK_INFO[r].label}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="h-1.5 bg-slate-900 overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>

        {/* Championship Events */}
        <div>
          <h3 className="font-display text-sm font-bold tracking-widest text-slate-200 uppercase mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-rose-500" />
            LOOP EVENTS & RIVAL SHOWDOWNS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {RACE_EVENTS.map((evt) => {
              const unlocked = isRankAtLeast(save.rank, evt.requiredRank);
              const completed = save.completedEvents.includes(evt.id);
              const region = REGIONS.find((r) => r.id === evt.regionId);
              return (
                <div
                  key={evt.id}
                  className={`flex flex-col justify-between p-4 border ${
                    unlocked
                      ? 'bg-[#0d1017] border-slate-800 hover:border-rose-500/80'
                      : 'bg-[#090b10] border-slate-900 opacity-65'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-display tracking-wider mb-1">
                      <span className="text-rose-400 font-bold">
                        {evt.mode === 'rival_battle' ? (
                          <span className="inline-flex items-center gap-1">
                            <Swords className="w-3 h-3" /> RIVAL DUEL
                          </span>
                        ) : (
                          evt.mode.replace('_', ' ').toUpperCase()
                        )}
                      </span>
                      {completed ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> CLEARED
                        </span>
                      ) : !unlocked ? (
                        <span className="text-amber-400 inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> {RANK_INFO[evt.requiredRank].label}
                        </span>
                      ) : (
                        <span className="text-slate-400">{evt.difficulty}</span>
                      )}
                    </div>
                    <div className="font-display font-bold text-base text-slate-100">
                      {evt.title}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{evt.subtitle}</p>
                    <div className="text-[11px] text-slate-500 mt-2">
                      {region?.name} · {evt.laps} Lap{evt.laps > 1 ? 's' : ''} ·{' '}
                      {evt.defaultTime.toUpperCase()} / {evt.defaultWeather.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="font-mono-num text-xs tabular-nums">
                      <span className="text-emerald-400 font-bold">
                        +${evt.rewardCash.toLocaleString()}
                      </span>
                      <span className="text-slate-500 ml-2">
                        +{evt.rewardXp} XP
                      </span>
                    </div>
                    <button
                      disabled={!unlocked}
                      onClick={() => {
                        audioEngine.playUiClick();
                        onStartEvent(evt);
                      }}
                      className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-3.5 py-1.5 text-xs font-display font-bold tracking-wider cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      RACE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievements */}
        <div>
          <h3 className="font-display text-sm font-bold tracking-widest text-slate-200 uppercase mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            ACHIEVEMENTS ({save.achievements.length}/{ACHIEVEMENTS_LIST.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ACHIEVEMENTS_LIST.map((ach) => {
              const done = save.achievements.includes(ach.id);
              return (
                <div
                  key={ach.id}
                  className={`p-3 border ${
                    done
                      ? 'bg-emerald-950/20 border-emerald-600/60'
                      : 'bg-[#0d1017] border-slate-800/80 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-display font-bold">
                    <span className={done ? 'text-emerald-300' : 'text-slate-200'}>
                      {ach.title}
                    </span>
                    <span className="font-mono-num text-[11px] text-emerald-400">
                      +${(ach.rewardCash / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{ach.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
