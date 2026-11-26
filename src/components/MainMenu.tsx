import React, { useState } from 'react';
import {
  Car,
  Cloud,
  Gem,
  Gift,
  Home,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  ScrollText,
  Settings,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { getCarSpec, RANK_ORDER } from '../data/cars';
import { computeQuestStatuses, getDailyLoginStatus } from '../data/quests';
import { audioEngine } from '../engine/audio';
import { OwnedCarData, PlayerSaveData, QuestId, ScreenState } from '../types/game';
import { CreditsModal } from './CreditsModal';
import { DailyLoginModal } from './DailyLoginModal';
import { QuestsModal } from './QuestsModal';

interface MainMenuProps {
  save: PlayerSaveData;
  activeCar: OwnedCarData;
  sessionPlaySec: number;
  authUser?: FirebaseUser | null;
  authBusy?: boolean;
  cloudSyncState?: 'idle' | 'syncing' | 'synced' | 'error';
  onGoogleSignIn?: () => void;
  isFullscreen?: boolean;
  fullscreenSupported?: boolean;
  onToggleFullscreen?: () => void;
  onClaimQuest: (questId: QuestId) => void;
  onClaimDaily: () => void;
  onNavigate: (screen: ScreenState) => void;
  onPlayFreeRoam: () => void;
  onOpenWorldMap: () => void;
}

const CARD_CHAMFER_CLIP =
  'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)';

const STRIPED_TEXTURE =
  'repeating-linear-gradient(125deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 15px)';

export const MainMenu: React.FC<MainMenuProps> = ({
  save,
  activeCar,
  sessionPlaySec,
  authUser = null,
  authBusy = false,
  cloudSyncState = 'idle',
  onGoogleSignIn,
  isFullscreen = false,
  fullscreenSupported = false,
  onToggleFullscreen,
  onClaimQuest,
  onClaimDaily,
  onNavigate,
  onPlayFreeRoam,
  onOpenWorldMap,
}) => {
  const [showCredits, setShowCredits] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const spec = getCarSpec(activeCar.carId);
  const rankLevel = Math.max(1, RANK_ORDER.indexOf(save.rank) + 1);
  const ownedCarCount = Object.keys(save.ownedCars).length;
  const questStatuses = computeQuestStatuses(save, sessionPlaySec);
  const claimableQuests = questStatuses.filter(
    (q) => q.completed && !q.claimed,
  ).length;
  const dailyStatus = getDailyLoginStatus(
    save.dailyLogin ?? { lastClaimDate: null, streakDay: 0 },
  );

  const handleClick = (fn: () => void) => {
    audioEngine.init();
    audioEngine.playUiClick();
    fn();
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between overflow-hidden">
      {/* Subtle cinematic left-side & horizon scrim so stacked cards remain high-contrast over bright 3D scenes */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(7,8,16,0.78) 0%, rgba(7,8,16,0.36) 38%, rgba(7,8,16,0.08) 72%, rgba(7,8,16,0.28) 100%)',
        }}
      />

      {/* Sleek glowing horizon arc framing the live 3D vehicle showcase */}
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-x-0 top-[46%] w-full h-36 sm:h-48 pointer-events-none opacity-85"
      >
        <defs>
          <linearGradient id="menuHorizonArc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="32%" stopColor="#c084fc" stopOpacity="0.65" />
            <stop offset="68%" stopColor="#f472b6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fb7185" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path
          d="M 180 220 Q 820 110 1440 165"
          fill="none"
          stroke="url(#menuHorizonArc)"
          strokeWidth="3.2"
        />
      </svg>

      {/* Main Content Frame above the bottom bar */}
      <div className="relative z-10 flex-1 flex flex-col justify-between px-4 sm:px-8 lg:px-12 pt-3 sm:pt-5 pb-3 sm:pb-5 min-h-0">
        {/* Top Row: Driver Profile + Level Badge (Left) & Currency Capsule (Right) */}
        <div className="flex items-center justify-between gap-4 pointer-events-auto">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => handleClick(() => onNavigate('profile'))}
              className="group flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded px-1 py-0.5 min-h-[40px]"
              title={
                authUser
                  ? `Signed in as ${authUser.email} — Open Profile`
                  : 'Open Driver Profile'
              }
            >
              {authUser?.photoURL && !avatarFailed ? (
                <img
                  src={authUser.photoURL}
                  alt={save.driverName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-6 h-6 rounded-full border border-white/40 object-cover shrink-0 shadow"
                />
              ) : (
                <User className="w-5 h-5 text-white drop-shadow shrink-0" />
              )}
              <span className="font-display italic font-bold text-base sm:text-lg text-white tracking-wide drop-shadow group-hover:text-amber-300 transition-colors whitespace-nowrap truncate max-w-[140px] sm:max-w-none">
                {save.driverName}
              </span>
              <span
                className="inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-display italic font-bold tracking-wider text-[#090b10] shadow-md whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  transform: 'skewX(-16deg)',
                }}
              >
                <span style={{ transform: 'skewX(16deg)' }}>LV {rankLevel}</span>
              </span>
              {authUser && (
                <Cloud
                  className={`w-3.5 h-3.5 shrink-0 ${
                    cloudSyncState === 'error'
                      ? 'text-rose-400'
                      : cloudSyncState === 'syncing'
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                  }`}
                />
              )}
            </button>

            {!authUser && onGoogleSignIn && (
              <button
                onClick={() => handleClick(onGoogleSignIn)}
                disabled={authBusy}
                className="bg-white/95 hover:bg-white disabled:opacity-70 text-[#0f172a] rounded-full px-3 py-1 min-h-[34px] text-[11px] font-display font-bold tracking-wide shadow-lg flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                title="Sign in or Create Account with Google"
              >
                {authBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
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
                <span className="hidden sm:inline">SIGN IN</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Daily Login Prizes Trigger */}
            <button
              onClick={() => handleClick(() => setShowDaily(true))}
              className={`border rounded-full px-3.5 py-1.5 shadow-xl transition-colors cursor-pointer min-h-[40px] flex items-center gap-1.5 text-xs font-display italic font-bold tracking-wider whitespace-nowrap ${
                dailyStatus.canClaimToday
                  ? 'bg-gradient-to-r from-[#f59e0b] to-[#ea580c] border-amber-300 text-[#090b10]'
                  : 'bg-[#0e1018]/92 hover:bg-[#171a26] border-white/12 text-slate-200'
              }`}
              title="Daily Login Prizes"
            >
              <Gift className="w-3.5 h-3.5 shrink-0" />
              <span>{dailyStatus.canClaimToday ? 'DAILY GIFT!' : 'DAILY'}</span>
            </button>

            {/* Quests Modal Trigger */}
            <button
              onClick={() => handleClick(() => setShowQuests(true))}
              className={`border rounded-full px-3.5 py-1.5 shadow-xl transition-colors cursor-pointer min-h-[40px] flex items-center gap-1.5 text-xs font-display italic font-bold tracking-wider whitespace-nowrap ${
                claimableQuests > 0
                  ? 'bg-gradient-to-r from-[#6d28d9] to-[#db2777] border-white/60 text-white'
                  : 'bg-[#0e1018]/92 hover:bg-[#171a26] border-white/12 text-slate-200'
              }`}
              title="Open Quests"
            >
              <ScrollText className="w-3.5 h-3.5 shrink-0" />
              <span>QUESTS</span>
              {claimableQuests > 0 && (
                <span className="bg-white text-[#0b0c12] font-mono-num text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums">
                  {claimableQuests}
                </span>
              )}
            </button>

            {/* Fuma Shards Capsule */}
            <button
              onClick={() => handleClick(() => setShowQuests(true))}
              className="bg-[#0e1018]/92 hover:bg-[#171a26] border border-cyan-400/25 rounded-full px-3.5 py-1.5 shadow-xl transition-colors cursor-pointer min-h-[40px] flex items-center gap-1.5"
              title="Fuma Shards (Earn via Quests & Daily Login)"
            >
              <Gem className="w-4 h-4 text-cyan-300 shrink-0" />
              <span className="font-mono-num text-sm font-bold text-cyan-200 tabular-nums whitespace-nowrap">
                {save.fumaShards}
              </span>
            </button>

            {/* Cash Capsule */}
            <button
              onClick={() => handleClick(() => onNavigate('dealership'))}
              className="bg-[#0e1018]/92 hover:bg-[#171a26] border border-white/12 rounded-full px-4 sm:px-5 py-1.5 shadow-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[40px] flex items-center"
              title="Visit Dealership"
            >
              <span className="font-mono-num text-sm sm:text-base font-bold text-[#fbbf24] tracking-wide tabular-nums whitespace-nowrap">
                ${save.money.toLocaleString()}
              </span>
            </button>

            {fullscreenSupported && onToggleFullscreen && (
              <button
                onClick={() => handleClick(onToggleFullscreen)}
                className="bg-[#0e1018]/92 hover:bg-[#171a26] border border-white/12 rounded-full w-10 h-10 shadow-xl transition-colors cursor-pointer flex items-center justify-center text-slate-200 hover:text-white"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 text-rose-400" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Middle & Lower Split: Left Stacked Mode Cards + Bottom-Right START RACE CTA */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 my-auto sm:my-0 sm:mt-auto pointer-events-none">
          {/* Left Vertical Stack: CLASSIC HIGHWAY / Race / GARAGE */}
          <div className="flex flex-col gap-2 w-[235px] sm:w-[300px] lg:w-[335px] pointer-events-auto">
            {/* Card 1: CLASSIC HIGHWAY (Selected with Crisp White Chamfered Outline) */}
            <div
              className="p-[2.5px] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.55)] transition-transform duration-150 hover:translate-x-1"
              style={{ clipPath: CARD_CHAMFER_CLIP }}
            >
              <button
                onClick={() => handleClick(onPlayFreeRoam)}
                className="relative w-full text-left px-4 py-3 sm:py-3.5 min-h-[68px] sm:min-h-[84px] flex flex-col justify-between cursor-pointer overflow-hidden focus-visible:outline-none"
                style={{
                  clipPath: CARD_CHAMFER_CLIP,
                  background: `linear-gradient(125deg, #5b21b6 0%, #7c3aed 58%, #4c1d95 100%)`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: STRIPED_TEXTURE }}
                />
                <span className="relative z-10 font-display italic font-bold text-sm sm:text-base lg:text-lg tracking-wider text-white uppercase drop-shadow whitespace-nowrap">
                  CLASSIC HIGHWAY
                </span>
                <span className="relative z-10 text-[10px] sm:text-[11px] font-display tracking-widest text-violet-200/85 uppercase">
                  Open Coast · {spec.name}
                </span>
              </button>
            </div>

            {/* Card 2: Race (Events & Quick Race Modes) */}
            <div
              className="p-[2px] bg-transparent hover:bg-white/60 transition-all duration-150 hover:translate-x-1 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
              style={{ clipPath: CARD_CHAMFER_CLIP }}
            >
              <button
                onClick={() => handleClick(() => onNavigate('quick_race'))}
                className="relative w-full text-left px-4 py-3 sm:py-3.5 min-h-[62px] sm:min-h-[76px] flex items-center cursor-pointer overflow-hidden focus-visible:outline-none"
                style={{
                  clipPath: CARD_CHAMFER_CLIP,
                  background: `linear-gradient(125deg, #9d174d 0%, #db2777 56%, #be185d 100%)`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: STRIPED_TEXTURE }}
                />
                <span className="relative z-10 font-display font-bold text-xl sm:text-2xl tracking-wide text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                  Race
                </span>
              </button>
            </div>

            {/* Card 3: GARAGE (with LV rank & dark car count notch bottom-right) */}
            <div
              className="p-[2px] bg-transparent hover:bg-white/60 transition-all duration-150 hover:translate-x-1 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
              style={{ clipPath: CARD_CHAMFER_CLIP }}
            >
              <button
                onClick={() => handleClick(() => onNavigate('garage'))}
                className="relative w-full text-left px-4 pt-2.5 pb-2 min-h-[64px] sm:min-h-[78px] flex items-stretch justify-between cursor-pointer overflow-hidden focus-visible:outline-none"
                style={{
                  clipPath: CARD_CHAMFER_CLIP,
                  background: `linear-gradient(125deg, #1e3a8a 0%, #2563eb 56%, #1d4ed8 100%)`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: STRIPED_TEXTURE }}
                />
                <span className="relative z-10 font-display italic font-bold text-sm sm:text-base tracking-wider text-white uppercase drop-shadow self-start">
                  GARAGE
                </span>

                <div className="relative z-10 flex flex-col items-end justify-between -mr-4 -mb-2">
                  <div className="pr-4 flex items-baseline gap-1 text-white drop-shadow">
                    <span className="font-display italic text-[11px] font-semibold opacity-90">
                      LV
                    </span>
                    <span className="font-display italic text-xl sm:text-2xl font-bold leading-none">
                      {rankLevel}
                    </span>
                  </div>

                  <div className="bg-[#090b12]/92 px-3.5 py-1 flex items-center gap-1.5 font-mono-num text-xs font-bold text-white tabular-nums">
                    <Car className="w-3.5 h-3.5 text-sky-300" />
                    <span>{ownedCarCount}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Bottom-Right Primary Skewed Coral-Orange CTA */}
          <div className="self-end pointer-events-auto sm:mb-1">
            <button
              onClick={() => handleClick(onPlayFreeRoam)}
              className="group relative px-8 sm:px-11 py-3 sm:py-3.5 min-h-[46px] text-white font-display italic font-bold text-sm sm:text-base tracking-[0.14em] uppercase shadow-[0_12px_28px_rgba(249,87,56,0.42)] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap"
              style={{
                background:
                  'linear-gradient(120deg, #ff784f 0%, #f95738 55%, #e11d48 100%)',
                clipPath: 'polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)',
              }}
            >
              START RACE
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Edge Full-Width Navigation Bar */}
      <nav
        aria-label="Main Menu Navigation"
        className="relative z-10 w-full bg-[#0a0b10]/95 border-t border-white/12 pointer-events-auto grid grid-cols-6 items-stretch min-h-[46px] sm:min-h-[52px]"
      >
        {/* 1. HOME (Slanted white active tab matching reference screenshot) */}
        <button
          onClick={() => handleClick(() => setShowCredits(false))}
          className="relative flex items-center justify-center gap-1.5 px-2 sm:px-4 bg-white text-[#0a0b10] font-display italic font-bold text-[10px] sm:text-xs tracking-wider uppercase cursor-pointer whitespace-nowrap shrink-0"
          style={{
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
          }}
        >
          <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>HOME</span>
        </button>

        {/* 2. GARAGE */}
        <button
          onClick={() => handleClick(() => onNavigate('garage'))}
          className="flex items-center justify-center gap-1.5 px-2 sm:px-3 text-slate-200 hover:text-white hover:bg-white/5 border-r border-white/10 font-display italic font-semibold text-[10px] sm:text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Car className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-slate-300" />
          <span className="hidden sm:inline">GARAGE</span>
        </button>

        {/* 3. RECORDS (Career & Achievements) */}
        <button
          onClick={() => handleClick(() => onNavigate('career'))}
          aria-label="Records"
          className="flex items-center justify-center gap-1.5 px-2 sm:px-3 text-slate-200 hover:text-white hover:bg-white/5 border-r border-white/10 font-display italic font-semibold text-[10px] sm:text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-slate-300" />
          <span className="hidden sm:inline">RECORDS</span>
        </button>

        {/* 4. SETTINGS */}
        <button
          onClick={() => handleClick(() => onNavigate('settings'))}
          aria-label="Settings"
          className="flex items-center justify-center gap-1.5 px-2 sm:px-3 text-slate-200 hover:text-white hover:bg-white/5 border-r border-white/10 font-display italic font-semibold text-[10px] sm:text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-slate-300" />
          <span className="hidden sm:inline">SETTINGS</span>
        </button>

        {/* 5. CREDITS (Mr_Snikko) */}
        <button
          onClick={() => handleClick(() => setShowCredits(true))}
          aria-label="Credits"
          className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 border-r border-white/10 font-display italic font-semibold text-[10px] sm:text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            showCredits
              ? 'bg-white/15 text-amber-300'
              : 'text-slate-200 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-300" />
          <span className="hidden sm:inline">CREDITS</span>
        </button>

        {/* 6. TRACK MAP */}
        <button
          onClick={() => handleClick(onOpenWorldMap)}
          aria-label="Track Map"
          className="flex items-center justify-center gap-1.5 px-2 sm:px-3 text-slate-200 hover:text-white hover:bg-white/5 font-display italic font-semibold text-[10px] sm:text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-slate-300" />
          <span className="hidden sm:inline">MAP</span>
        </button>
      </nav>

      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
      {showQuests && (
        <QuestsModal
          save={save}
          sessionPlaySec={sessionPlaySec}
          onClaimQuest={onClaimQuest}
          onClose={() => setShowQuests(false)}
        />
      )}
      {showDaily && (
        <DailyLoginModal
          dailyLogin={save.dailyLogin ?? { lastClaimDate: null, streakDay: 0 }}
          onClaimDaily={onClaimDaily}
          onClose={() => setShowDaily(false)}
        />
      )}
    </div>
  );
};
