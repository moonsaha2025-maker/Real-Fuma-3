import React, { useEffect } from 'react';
import { CalendarCheck, Check, Gem, Gift, X } from 'lucide-react';
import { DAILY_LOGIN_PRIZES, getDailyLoginStatus } from '../data/quests';
import { audioEngine } from '../engine/audio';
import { DailyLoginState } from '../types/game';

interface DailyLoginModalProps {
  dailyLogin: DailyLoginState;
  onClaimDaily: () => void;
  onClose: () => void;
}

export const DailyLoginModal: React.FC<DailyLoginModalProps> = ({
  dailyLogin,
  onClaimDaily,
  onClose,
}) => {
  const status = getDailyLoginStatus(dailyLogin);

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

  const todayTier =
    DAILY_LOGIN_PRIZES.find((d) => d.day === status.claimableDay) ??
    DAILY_LOGIN_PRIZES[0];

  return (
    <div
      className="fixed inset-0 z-40 bg-[#06070d]/88 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-login-heading"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#0d1018] border border-white/15 shadow-2xl overflow-hidden">
        <div
          className="h-1.5 w-full shrink-0"
          style={{
            background:
              'linear-gradient(90deg, #f59e0b 0%, #db2777 50%, #6d28d9 100%)',
          }}
        />

        <div className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-display tracking-[0.24em] text-amber-400 uppercase">
              <Gift className="w-3.5 h-3.5" />
              7-DAY STREAK REWARDS
            </div>
            <h2
              id="daily-login-heading"
              className="font-display italic text-2xl sm:text-3xl font-bold text-white tracking-wide mt-0.5"
            >
              DAILY LOGIN PRIZES
            </h2>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close daily login prizes"
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 text-xs font-display font-semibold tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer min-h-[40px]"
          >
            <X className="w-4 h-4 text-rose-400" />
            CLOSE
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DAILY_LOGIN_PRIZES.map((tier) => {
              const isClaimedDay =
                (status.claimedToday && tier.day <= status.claimableDay) ||
                (!status.claimedToday && tier.day < status.claimableDay);
              const isTodayReady =
                status.canClaimToday && tier.day === status.claimableDay;
              const isJackpot = tier.day === 7;

              return (
                <div
                  key={tier.day}
                  className={`relative border p-3.5 flex flex-col justify-between gap-2.5 ${
                    isJackpot ? 'col-span-2' : ''
                  } ${
                    isTodayReady
                      ? 'bg-gradient-to-br from-[#2b193d] to-[#1a132b] border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.2)]'
                      : isClaimedDay
                        ? 'bg-[#090b11] border-emerald-500/40 opacity-80'
                        : 'bg-[#10131e] border-white/12'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display italic font-bold text-xs tracking-wider uppercase text-slate-200">
                      DAY {tier.day}
                    </span>
                    {isClaimedDay ? (
                      <span className="flex items-center gap-1 text-[10px] font-display font-bold text-emerald-400">
                        <Check className="w-3 h-3" />
                        CLAIMED
                      </span>
                    ) : isTodayReady ? (
                      <span className="text-[10px] font-display font-bold tracking-wider text-amber-300 uppercase">
                        READY
                      </span>
                    ) : (
                      <span className="text-[10px] font-display text-slate-500 uppercase">
                        LOCKED
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="font-mono-num text-base sm:text-lg font-bold text-[#fbbf24] tabular-nums">
                      +${tier.cash.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono-num text-xs font-bold text-cyan-300 tabular-nums">
                      <Gem className="w-3.5 h-3.5" />
                      <span>+{tier.shards} Fuma Shards</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div className="text-xs sm:text-sm text-slate-300">
              {status.canClaimToday ? (
                <span>
                  Today&apos;s reward:{' '}
                  <strong className="text-amber-300">
                    +${todayTier.cash.toLocaleString()}
                  </strong>{' '}
                  &amp;{' '}
                  <strong className="text-cyan-300">
                    +{todayTier.shards} Fuma Shards
                  </strong>
                </span>
              ) : (
                <span className="flex items-center gap-2 text-emerald-300 font-display">
                  <CalendarCheck className="w-4 h-4" />
                  Today&apos;s login prize claimed. Return tomorrow to continue your streak!
                </span>
              )}
            </div>

            {status.canClaimToday ? (
              <button
                onClick={() => {
                  audioEngine.init();
                  audioEngine.playUiClick();
                  onClaimDaily();
                }}
                className="min-h-[44px] px-7 py-2.5 text-white font-display italic font-bold text-xs sm:text-sm tracking-[0.14em] uppercase shadow-lg hover:brightness-110 cursor-pointer whitespace-nowrap"
                style={{
                  background:
                    'linear-gradient(120deg, #ff784f 0%, #f95738 55%, #e11d48 100%)',
                  clipPath: 'polygon(6% 0%, 100% 0%, 94% 100%, 0% 100%)',
                }}
              >
                CLAIM DAY {status.claimableDay} PRIZE
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="min-h-[42px] bg-white hover:bg-slate-200 text-[#0b0c12] font-display italic font-bold tracking-widest text-xs px-6 py-2.5 cursor-pointer whitespace-nowrap"
              >
                DONE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
