import React from 'react';
import {
  Flag,
  MapPin,
  Play,
  Settings,
  Trophy,
  User,
  Wrench,
} from 'lucide-react';
import { getCarSpec, getEffectiveCarStats, RANK_INFO } from '../data/cars';
import { audioEngine } from '../engine/audio';
import { OwnedCarData, PlayerSaveData, ScreenState } from '../types/game';
import { Logo } from './Logo';

interface MainMenuProps {
  save: PlayerSaveData;
  activeCar: OwnedCarData;
  onNavigate: (screen: ScreenState) => void;
  onPlayFreeRoam: () => void;
  onOpenWorldMap: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  save,
  activeCar,
  onNavigate,
  onPlayFreeRoam,
  onOpenWorldMap,
}) => {
  const spec = getCarSpec(activeCar.carId);
  const stats = getEffectiveCarStats(spec, activeCar.upgrades);
  const rankMeta = RANK_INFO[save.rank];

  const handleClick = (fn: () => void) => {
    audioEngine.init();
    audioEngine.playUiClick();
    fn();
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-6">
      {/* Slim Top Editorial Header — showcases coastal 3D viewport unobstructed */}
      <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
        <Logo compact />

        <div className="flex items-center gap-2 sm:gap-3 bg-black/45 border border-white/15 px-3 py-1.5">
          <button
            onClick={() => handleClick(() => onNavigate('profile'))}
            className="flex items-center gap-2 pr-2.5 border-r border-white/15 text-left hover:text-rose-400 transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-rose-500" />
            <div>
              <div className="text-[9px] font-display tracking-widest text-slate-400 uppercase leading-none">
                {rankMeta.label}
              </div>
              <div className="font-mono-num text-xs font-bold text-slate-100 leading-tight">
                {save.driverName}
              </div>
            </div>
          </button>

          <div className="pr-2.5 border-r border-white/15 text-right">
            <div className="text-[9px] font-display tracking-widest text-slate-400 leading-none">
              CREDITS
            </div>
            <div className="font-mono-num text-xs font-bold text-emerald-400 tabular-nums leading-tight">
              ${save.money.toLocaleString()}
            </div>
          </div>

          <button
            onClick={() => handleClick(() => onNavigate('settings'))}
            title="Settings"
            aria-label="Settings"
            className="p-1.5 text-slate-300 hover:text-white border border-white/10 hover:border-rose-500 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sleek Bottom Dock — leaves entire center viewport open to coastal supercar showcase */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pointer-events-auto">
        {/* Primary & Secondary Action Rail */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleClick(onPlayFreeRoam)}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-widest text-xs sm:text-sm py-2.5 px-5 shadow-lg transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            DRIVE COAST
          </button>

          <button
            onClick={() => handleClick(() => onNavigate('quick_race'))}
            className="flex items-center gap-1.5 bg-black/50 hover:bg-black/70 border border-white/15 hover:border-rose-500 text-slate-100 font-display font-semibold tracking-wider text-xs py-2.5 px-3.5 transition-colors cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5 text-rose-500" />
            EVENTS
          </button>

          <button
            onClick={() => handleClick(() => onNavigate('career'))}
            className="flex items-center gap-1.5 bg-black/50 hover:bg-black/70 border border-white/15 hover:border-rose-500 text-slate-100 font-display font-semibold tracking-wider text-xs py-2.5 px-3.5 transition-colors cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            CAREER
          </button>

          <button
            onClick={() => handleClick(() => onNavigate('garage'))}
            className="flex items-center gap-1.5 bg-black/50 hover:bg-black/70 border border-white/15 hover:border-rose-500 text-slate-100 font-display font-semibold tracking-wider text-xs py-2.5 px-3.5 transition-colors cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5 text-sky-400" />
            GARAGE
          </button>

          <button
            onClick={() => handleClick(onOpenWorldMap)}
            className="flex items-center gap-1.5 bg-black/50 hover:bg-black/70 border border-white/15 hover:border-rose-500 text-slate-100 font-display font-semibold tracking-wider text-xs py-2.5 px-3.5 transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            TRACK MAP
          </button>
        </div>

        {/* Clean Single-Line Editorial Active Car Badge */}
        <div className="bg-black/45 border border-white/15 px-4 py-2.5 flex items-center justify-between gap-4">
          <div>
            <div className="text-[9px] font-display tracking-[0.22em] text-sky-400 uppercase">
              {spec.category} · {spec.drivetrain}
            </div>
            <div className="font-display text-sm sm:text-base font-bold text-white leading-tight">
              {spec.name}
            </div>
          </div>
          <div className="flex items-center gap-2.5 font-mono-num text-xs text-slate-200 tabular-nums border-l border-white/15 pl-3">
            <span>{stats.horsepower} HP</span>
            <span className="text-slate-500">·</span>
            <span className="text-rose-400 font-bold">{stats.topSpeedKmh} KM/H</span>
            <span className="text-slate-500 hidden sm:inline">·</span>
            <span className="hidden sm:inline text-slate-300">{stats.massKg} KG</span>
          </div>
        </div>
      </div>
    </div>
  );
};
