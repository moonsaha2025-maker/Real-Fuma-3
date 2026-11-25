import React, { useEffect } from 'react';
import { Check, CheckCircle2, Gem, Target, X } from 'lucide-react';
import { computeQuestStatuses } from '../data/quests';
import { audioEngine } from '../engine/audio';
import { PlayerSaveData, QuestId } from '../types/game';

interface QuestsModalProps {
  save: PlayerSaveData;
  sessionPlaySec: number;
  onClaimQuest: (questId: QuestId) => void;
  onClose: () => void;
}

export const QuestsModal: React.FC<QuestsModalProps> = ({
  save,
  sessionPlaySec,
  onClaimQuest,
  onClose,
}) => {
  const items = computeQuestStatuses(save, sessionPlaySec);
  const completedCount = items.filter((i) => i.completed).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        audioEngine.playUiClick();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleClose = () => {
    audioEngine.playUiClick();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#06070d]/88 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quests-heading"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#0d1018] border border-white/15 shadow-2xl overflow-hidden">
        <div
          className="h-1.5 w-full shrink-0"
          style={{
            background:
              'linear-gradient(90deg, #6d28d9 0%, #db2777 50%, #ff6b4a 100%)',
          }}
        />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-display tracking-[0.24em] text-violet-300 uppercase">
              <Target className="w-3.5 h-3.5 text-violet-400" />
              CAREER CHALLENGES · {completedCount} / {items.length} COMPLETED
            </div>
            <h2
              id="quests-heading"
              className="font-display italic text-2xl sm:text-3xl font-bold text-white tracking-wide mt-0.5"
            >
              QUESTS
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#070910] border border-cyan-400/30 rounded-full px-3.5 py-1.5">
              <Gem className="w-4 h-4 text-cyan-300" />
              <span className="font-mono-num text-sm font-bold text-cyan-200 tabular-nums">
                {save.fumaShards}
              </span>
              <span className="text-[10px] font-display tracking-wider text-slate-400 uppercase">
                Fuma Shards
              </span>
            </div>

            <button
              onClick={handleClose}
              aria-label="Close quests"
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 text-xs font-display font-semibold tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer min-h-[40px]"
            >
              <X className="w-4 h-4 text-rose-400" />
              CLOSE
            </button>
          </div>
        </div>

        {/* Scrollable Quests List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-3">
          {items.map((item) => {
            const canClaim = item.completed && !item.claimed;
            return (
              <div
                key={item.quest.id}
                className={`border p-4 transition-colors ${
                  canClaim
                    ? 'bg-gradient-to-r from-[#1a1230] to-[#131726] border-amber-400/70'
                    : item.claimed
                      ? 'bg-[#090b11] border-white/10 opacity-75'
                      : 'bg-[#10131e] border-white/12'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.claimed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Gem className="w-4 h-4 text-cyan-300 shrink-0" />
                      )}
                      <h3 className="font-display font-bold text-sm sm:text-base text-white tracking-wide">
                        {item.quest.title}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-300">
                      {item.quest.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-display tracking-widest text-slate-400 uppercase">
                        PRIZE
                      </div>
                      <div className="flex items-center gap-1 font-mono-num text-sm font-bold text-cyan-300 tabular-nums">
                        <Gem className="w-3.5 h-3.5" />
                        <span>+{item.quest.rewardShards} Fuma Shards</span>
                      </div>
                    </div>

                    {item.claimed ? (
                      <div className="min-w-[110px] min-h-[40px] flex items-center justify-center gap-1.5 bg-emerald-950/60 border border-emerald-500/40 px-3 py-2 text-xs font-display font-bold tracking-wider text-emerald-300">
                        <Check className="w-3.5 h-3.5" />
                        CLAIMED
                      </div>
                    ) : canClaim ? (
                      <button
                        onClick={() => {
                          audioEngine.init();
                          audioEngine.playUiClick();
                          onClaimQuest(item.quest.id);
                        }}
                        className="min-w-[110px] min-h-[40px] px-4 py-2 text-xs font-display italic font-bold tracking-wider text-white uppercase shadow-lg hover:brightness-110 cursor-pointer"
                        style={{
                          background:
                            'linear-gradient(120deg, #ff784f 0%, #f95738 55%, #e11d48 100%)',
                        }}
                      >
                        CLAIM +{item.quest.rewardShards}
                      </button>
                    ) : (
                      <div className="min-w-[110px] min-h-[40px] flex items-center justify-center bg-white/5 border border-white/10 px-3 py-2 text-[11px] font-display tracking-wider text-slate-400">
                        IN PROGRESS
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono-num tabular-nums">
                    <span className="text-slate-300">{item.progressText}</span>
                    <span
                      className={
                        item.completed ? 'text-emerald-400 font-bold' : 'text-slate-400'
                      }
                    >
                      {item.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#07090f] overflow-hidden border border-white/10">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${item.pct}%`,
                        background: item.completed
                          ? 'linear-gradient(90deg, #10b981, #22d3ee)'
                          : 'linear-gradient(90deg, #7c3aed, #db2777)',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
