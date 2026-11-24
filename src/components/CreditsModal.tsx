import React, { useEffect } from 'react';
import { Award, Code2, Headphones, Sparkles, X } from 'lucide-react';
import { audioEngine } from '../engine/audio';

interface CreditsModalProps {
  onClose: () => void;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ onClose }) => {
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
      className="fixed inset-0 z-40 bg-[#06070d]/88 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-heading"
    >
      <div className="relative w-full max-w-lg bg-[#0d1018] border border-white/15 shadow-2xl overflow-hidden">
        {/* Diagonal top accent bar matching main menu */}
        <div
          className="h-1.5 w-full"
          style={{
            background:
              'linear-gradient(90deg, #6d28d9 0%, #db2777 50%, #ff6b4a 100%)',
          }}
        />

        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <div className="text-[11px] font-display tracking-[0.26em] text-amber-400 uppercase">
                REAL FUMA RACING 3D
              </div>
              <h2
                id="credits-heading"
                className="font-display italic text-2xl sm:text-3xl font-bold text-white tracking-wide mt-0.5"
              >
                CREDITS
              </h2>
            </div>

            <button
              onClick={handleClose}
              aria-label="Close credits"
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/15 border border-white/15 px-3 py-2 text-xs font-display font-semibold tracking-wider text-slate-200 hover:text-white transition-colors cursor-pointer min-h-[40px]"
            >
              <X className="w-4 h-4 text-rose-400" />
              CLOSE
            </button>
          </div>

          {/* Primary Creator Highlight */}
          <div className="bg-gradient-to-br from-[#1b1433] via-[#131726] to-[#1a1020] border border-white/15 p-5 sm:p-6 text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-display tracking-[0.28em] text-amber-300 uppercase">
              <Award className="w-4 h-4 text-amber-400" />
              CREATED &amp; DIRECTED BY
            </div>
            <div className="font-display italic text-3xl sm:text-4xl font-bold tracking-wider text-white">
              Mr_Snikko
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              Creative Vision, Gameplay Direction &amp; Experience Design
            </p>
          </div>

          {/* Supporting Production Credits */}
          <div className="divide-y divide-white/10 border-t border-b border-white/10 text-xs sm:text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-slate-400 font-display tracking-wide">
                <Code2 className="w-4 h-4 text-violet-400 shrink-0" />
                3D Engine, Physics &amp; World
              </span>
              <span className="font-display font-semibold text-white">
                Mr_Snikko
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-slate-400 font-display tracking-wide">
                <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
                UI, Customization &amp; Photo Mode
              </span>
              <span className="font-display font-semibold text-white">
                Mr_Snikko
              </span>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-slate-400 font-display tracking-wide">
                <Headphones className="w-4 h-4 text-sky-400 shrink-0" />
                Audio Synthesis &amp; Radio
              </span>
              <span className="font-display font-semibold text-white">
                Procedural Web Audio
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="bg-white hover:bg-slate-200 text-[#0b0c12] font-display italic font-bold tracking-widest text-xs px-6 py-2.5 transition-colors cursor-pointer min-h-[42px]"
            >
              BACK TO MENU
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
