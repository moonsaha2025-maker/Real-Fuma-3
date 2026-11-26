import React, { useEffect, useMemo, useState } from 'react';
import {
  Aperture,
  Car,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudRain,
  Compass,
  Lightbulb,
  MapPin,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  Power,
  Radio,
  RotateCcw,
  ScrollText,
  Settings,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  TrendingUp,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import horizonBucketListImg from '../assets/images/horizon_bucket_list_supercar_1795695145762.jpg';
import horizonPromoHeadlightImg from '../assets/images/horizon_promo_headlight_1795695143909.jpg';
import horizonPhotoModeImg from '../assets/images/horizon_photo_mode_coast_1795695144463.jpg';
import { CAR_CATALOG, getCarSpec, RANK_INFO } from '../data/cars';
import { computeQuestStatuses } from '../data/quests';
import { ACHIEVEMENTS_LIST, RACE_EVENTS, REGIONS } from '../data/world';
import { audioEngine } from '../engine/audio';
import { getRadioStationMeta, RADIO_STATIONS, radioEngine } from '../engine/radio';
import {
  OwnedCarData,
  PlayerSaveData,
  RaceResultSummary,
  RadioStationId,
  TimeOfDay,
  WeatherType,
} from '../types/game';

const WEATHER_OPTIONS: { id: WeatherType; label: string }[] = [
  { id: 'sunny', label: 'Sunny Clear' },
  { id: 'cloudy', label: 'Overcast' },
  { id: 'rain', label: 'Light Rain' },
  { id: 'heavy_rain', label: 'Downpour' },
  { id: 'thunderstorm', label: 'Thunderstorm' },
  { id: 'fog', label: 'Coastal Fog' },
];

const TIME_OPTIONS: { id: TimeOfDay; label: string }[] = [
  { id: 'day', label: 'Midday' },
  { id: 'sunset', label: 'Golden Dusk' },
  { id: 'night', label: 'Midnight' },
  { id: 'sunrise', label: 'Dawn' },
];

type PauseTabId = 'home' | 'atmosphere' | 'garage_radio' | 'progress' | 'system';

const PAUSE_TABS: { id: PauseTabId; label: string }[] = [
  { id: 'home', label: 'HOME' },
  { id: 'atmosphere', label: 'WEATHER' },
  { id: 'garage_radio', label: 'CAR & RADIO' },
  { id: 'progress', label: 'PROGRESS' },
  { id: 'system', label: 'SYSTEM' },
];

function computePerformanceClass(
  specHp: number,
  topSpeedKmh: number,
  upgrades: OwnedCarData['upgrades'] | undefined,
): { letter: string; colorClass: string; pi: number } {
  const upgradeSum = upgrades
    ? upgrades.engine +
      upgrades.turbo +
      upgrades.tires +
      upgrades.brakes +
      upgrades.suspension +
      upgrades.nitro
    : 0;
  const rawPi = Math.min(
    999,
    Math.round(460 + specHp * 0.22 + topSpeedKmh * 0.52 + upgradeSum * 11),
  );
  if (rawPi >= 960) return { letter: 'X', colorClass: 'bg-emerald-500 text-white', pi: rawPi };
  if (rawPi >= 880) return { letter: 'S2', colorClass: 'bg-blue-600 text-white', pi: rawPi };
  if (rawPi >= 800) return { letter: 'S1', colorClass: 'bg-violet-600 text-white', pi: rawPi };
  if (rawPi >= 700) return { letter: 'A', colorClass: 'bg-rose-600 text-white', pi: rawPi };
  return { letter: 'B', colorClass: 'bg-amber-500 text-slate-950', pi: rawPi };
}

interface PhotoTileBackdropProps {
  src: string;
  alt: string;
  fallbackGradient: string;
}

const PhotoTileBackdrop: React.FC<PhotoTileBackdropProps> = ({
  src,
  alt,
  fallbackGradient,
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <>
      {!failed ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className={`absolute inset-0 ${fallbackGradient}`} />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/80"
        aria-hidden="true"
      />
    </>
  );
};

interface PauseModalProps {
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  cycleTimeLabel: string;
  autoDayNightCycle: boolean;
  headlightsOn: boolean;
  radioStation: RadioStationId;
  radioVolume: number;
  regionName?: string;
  save?: PlayerSaveData;
  activeCarData?: OwnedCarData;
  sessionPlaySec?: number;
  onChangeRadioStation: (station: RadioStationId) => void;
  onChangeRadioVolume: (volume: number) => void;
  onResume: () => void;
  onOpenPhotoMode: () => void;
  onOpenQuests?: () => void;
  onRestart: () => void;
  onOpenMap: () => void;
  onOpenSettings: () => void;
  onCycleWeather: (w: WeatherType, t: TimeOfDay) => void;
  onToggleDayNightCycle: () => void;
  onToggleHeadlights: () => void;
  isFullscreen?: boolean;
  fullscreenSupported?: boolean;
  onToggleFullscreen?: () => void;
  onResetCar: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  weather,
  timeOfDay,
  cycleTimeLabel,
  autoDayNightCycle,
  headlightsOn,
  radioStation,
  radioVolume,
  regionName = 'SUNSET COAST',
  save,
  activeCarData,
  sessionPlaySec = 0,
  onChangeRadioStation,
  onChangeRadioVolume,
  onResume,
  onOpenPhotoMode,
  onOpenQuests,
  onRestart,
  onOpenMap,
  onOpenSettings,
  onCycleWeather,
  onToggleDayNightCycle,
  onToggleHeadlights,
  isFullscreen = false,
  fullscreenSupported = false,
  onToggleFullscreen,
  onResetCar,
  onExitToMenu,
}) => {
  const [activeTab, setActiveTab] = useState<PauseTabId>('home');

  const activeSpec = useMemo(
    () => getCarSpec(activeCarData?.carId ?? save?.activeCarId ?? CAR_CATALOG[0].id),
    [activeCarData?.carId, save?.activeCarId],
  );
  const perfClass = useMemo(
    () =>
      computePerformanceClass(
        activeSpec.horsepower,
        activeSpec.topSpeedKmh,
        activeCarData?.upgrades,
      ),
    [activeSpec.horsepower, activeSpec.topSpeedKmh, activeCarData?.upgrades],
  );

  const stationMeta = getRadioStationMeta(radioStation);
  const currentTrack = radioEngine.getCurrentTrack();

  const claimableQuestsCount = useMemo(() => {
    if (!save) return 0;
    return computeQuestStatuses(save, sessionPlaySec).filter(
      (q) => q.completed && !q.claimed,
    ).length;
  }, [save, sessionPlaySec]);

  const driverLevel = useMemo(() => {
    if (!save) return 1;
    return Math.max(1, Math.min(999, Math.floor(save.xp / 250) + 1));
  }, [save]);

  const cycleStation = (delta: -1 | 1) => {
    audioEngine.init();
    const curIdx = RADIO_STATIONS.findIndex((s) => s.id === radioStation);
    const nextIdx =
      (curIdx + delta + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    onChangeRadioStation(RADIO_STATIONS[nextIdx].id);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyE') {
        audioEngine.playUiClick();
        setActiveTab((prev) => {
          const idx = PAUSE_TABS.findIndex((t) => t.id === prev);
          return PAUSE_TABS[(idx + 1) % PAUSE_TABS.length].id;
        });
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyQ') {
        audioEngine.playUiClick();
        setActiveTab((prev) => {
          const idx = PAUSE_TABS.findIndex((t) => t.id === prev);
          return PAUSE_TABS[(idx - 1 + PAUSE_TABS.length) % PAUSE_TABS.length].id;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const topRival = useMemo(() => {
    if (!save?.leaderboard || save.leaderboard.length === 0) {
      return { name: 'K. Takahashi', score: 98500 };
    }
    const sorted = [...save.leaderboard].sort((a, b) => b.score - a.score);
    return { name: sorted[0].driverName, score: sorted[0].score };
  }, [save?.leaderboard]);

  const unlockedCount = save?.unlockedRegions.length ?? 1;
  const completedEventsCount = save?.completedEvents.length ?? 0;
  const racesWonCount = save?.stats.racesWon ?? 0;
  const ownedCarsCount = save ? Object.keys(save.ownedCars).length : 1;
  const achievementsCount = save?.achievements.length ?? 0;
  const playerRankLabel = save ? RANK_INFO[save.rank].label : 'Rookie';

  const weatherBadgeIcon = (w: WeatherType, cls = 'w-5 h-5') => {
    switch (w) {
      case 'sunny':
        return <Sun className={cls} />;
      case 'cloudy':
        return <Cloud className={cls} />;
      case 'rain':
      case 'heavy_rain':
        return <CloudRain className={cls} />;
      case 'thunderstorm':
        return <CloudLightning className={cls} />;
      case 'fog':
        return <Wind className={cls} />;
    }
  };

  const timeBadgeIcon = (t: TimeOfDay, cls = 'w-5 h-5') => {
    switch (t) {
      case 'day':
        return <Sun className={cls} />;
      case 'sunset':
        return <Sunset className={cls} />;
      case 'night':
        return <Moon className={cls} />;
      case 'sunrise':
        return <Sunrise className={cls} />;
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#050810]/52 backdrop-blur-md overflow-y-auto flex flex-col justify-between px-3 py-2.5 sm:px-6 sm:py-4 lg:px-10 lg:py-6">
      {/* Top Status Strip (Car PI + Car Name left | Rank Level + Driver + Credits right) */}
      <header className="w-full max-w-[1120px] mx-auto flex items-center justify-between gap-4 text-white shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="inline-flex items-stretch font-display font-bold text-[11px] sm:text-xs tracking-wider shrink-0 shadow-md">
            <span className={`${perfClass.colorClass} px-2 py-0.5 flex items-center`}>
              {perfClass.letter}
            </span>
            <span className="bg-white text-[#0b1019] px-2 py-0.5 font-mono-num tabular-nums flex items-center">
              {perfClass.pi}
            </span>
          </div>
          <span className="font-display font-bold uppercase tracking-wider text-xs sm:text-sm truncate drop-shadow">
            {activeSpec.name}
          </span>
          <span className="hidden md:inline text-white/45" aria-hidden="true">
            ·
          </span>
          <span className="hidden md:inline font-display uppercase tracking-wider text-[11px] text-slate-200 whitespace-nowrap">
            {regionName} · <span className="font-mono-num text-[#fde047]">{cycleTimeLabel}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0 font-display text-xs sm:text-sm tabular-nums drop-shadow">
          <div className="flex items-center gap-1.5">
            <span className="bg-emerald-500 text-[#04140a] font-extrabold px-1.5 py-0.5 text-[11px] font-mono-num">
              {driverLevel}
            </span>
            <span className="font-semibold tracking-wide text-white truncate max-w-[110px] sm:max-w-none">
              {save?.driverName ?? 'FUMA_RACER'}
            </span>
          </div>
          <span className="text-white/35 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <div className="hidden sm:flex items-center gap-1.5 font-mono-num font-bold text-white">
            <span className="text-[10px] font-display font-bold bg-white/90 text-[#0b1019] px-1 py-0.5 leading-none">
              CR
            </span>
            <span>{(save?.money ?? 0).toLocaleString()}</span>
          </div>
          <div className="hidden md:flex items-center gap-1 font-mono-num font-bold text-cyan-300">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>{(save?.fumaShards ?? 0).toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* Main Centered Horizon Bento Command Console */}
      <main className="w-full max-w-[1120px] mx-auto my-auto py-2 sm:py-3 flex flex-col gap-2">
        {/* Horizontal Tab Navigation Bar */}
        <nav
          aria-label="Pause Menu Sections"
          className="flex items-stretch gap-[2px] overflow-x-auto"
        >
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onResume();
            }}
            title="Resume Driving"
            aria-label="Resume Driving"
            className="bg-[#0b0e15]/92 hover:bg-[#fde047] text-white hover:text-[#090d16] px-3 sm:px-3.5 min-h-[34px] sm:min-h-[38px] flex items-center justify-center transition-colors cursor-pointer shrink-0 border-r border-white/10"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
          </button>

          {PAUSE_TABS.map((tab) => {
            const active = tab.id === activeTab;
            const showBadge =
              (tab.id === 'progress' || tab.id === 'home') && claimableQuestsCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  audioEngine.playUiClick();
                  setActiveTab(tab.id);
                }}
                className={`relative px-3.5 sm:px-5 min-h-[34px] sm:min-h-[38px] font-display font-bold tracking-[0.08em] text-[11px] sm:text-xs uppercase whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-white ${
                  active
                    ? 'bg-[#fde047] text-[#090d16]'
                    : 'bg-[#0b0e15]/90 text-slate-200 hover:bg-[#1a2232] hover:text-white'
                }`}
              >
                {tab.label}
                {showBadge && (
                  <span
                    className="absolute -top-1 -right-0.5 bg-[#f97316] text-white font-mono-num text-[9px] font-extrabold w-4 h-4 flex items-center justify-center shadow"
                    aria-label={`${claimableQuestsCount} claimable rewards`}
                  >
                    {claimableQuestsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* TAB 1: HOME — Immediate Horizon Action Mosaic */}
        {activeTab === 'home' && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1 sm:gap-1.5">
            {/* Row 1, Tile 1 (2 cols): RESUME DRIVING + Road Trip Progress Graphic */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onResume();
              }}
              className="group relative col-span-2 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-[#fde047]"
            >
              <svg
                viewBox="0 0 260 120"
                className="absolute right-0 bottom-0 w-48 sm:w-56 h-24 sm:h-28 text-slate-900/[0.08] pointer-events-none"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M0 120 L55 72 L105 94 L175 44 L260 88 L260 120 Z" />
                <path d="M115 120 C125 98, 155 82, 168 62 L179 64 C166 86, 145 102, 138 120 Z" />
                <circle cx="174" cy="40" r="18" />
              </svg>
              <div className="relative z-10 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase leading-none">
                    RESUME DRIVING
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-600 font-medium mt-1">
                    {regionName} · {cycleTimeLabel}
                  </p>
                </div>
                <span className="bg-[#0b1019] group-hover:bg-[#e11d48] text-white w-8 h-8 flex items-center justify-center transition-colors shrink-0">
                  <Play className="w-4 h-4 fill-current" />
                </span>
              </div>
              <div className="relative z-10 flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wider text-slate-700">
                <span>Return to Highway</span>
                <span className="font-mono-num text-slate-500">ESC</span>
              </div>
            </button>

            {/* Row 1, Tile 2 (1 col): TRACK MAP */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenMap();
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <MapPin
                className="absolute -right-3 -bottom-3 w-20 h-20 sm:w-24 sm:h-24 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                TRACK MAP
              </h3>
              <div className="relative z-10">
                <div className="font-mono-num text-sm sm:text-base font-bold text-[#0b1019] tabular-nums">
                  {unlockedCount}/{REGIONS.length} Zones
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-600 font-medium">
                  Fast Travel & Events
                </div>
              </div>
            </button>

            {/* Row 1, Tile 3 (2 cols): PHOTO MODE Photo Tile */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenPhotoMode();
              }}
              className="group relative col-span-2 text-white p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <PhotoTileBackdrop
                src={horizonPhotoModeImg}
                alt="Coastal cliff highway photo mode showcase"
                fallbackGradient="bg-gradient-to-br from-sky-900 via-slate-900 to-amber-900"
              />
              <div className="relative z-10 flex items-start justify-between gap-2">
                <h3 className="font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase leading-tight drop-shadow">
                  PHOTO MODE
                </h3>
                <Aperture className="w-5 h-5 text-white/90 shrink-0" />
              </div>
              <div className="relative z-10 text-[11px] sm:text-xs text-slate-100 font-medium drop-shadow">
                Free Camera · Filters · Shutter
              </div>
            </button>

            {/* Row 1, Tile 4 (1 col): RESTART SESSION */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onRestart();
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <RotateCcw
                className="absolute -right-3 -bottom-3 w-20 h-20 sm:w-24 sm:h-24 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                RESTART
              </h3>
              <div className="relative z-10 text-[10px] sm:text-[11px] text-slate-600 font-medium">
                Reset Event & Grid
              </div>
            </button>

            {/* Row 2, Tile 1 (2 cols): CAR & RADIO Photo Tile */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                setActiveTab('garage_radio');
              }}
              className="group relative col-span-2 text-white p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <PhotoTileBackdrop
                src={horizonPromoHeadlightImg}
                alt="Supercar front LED headlight detail"
                fallbackGradient="bg-gradient-to-br from-slate-800 via-zinc-900 to-black"
              />
              <div className="relative z-10 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase leading-none drop-shadow">
                    CAR & RADIO
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-200 mt-1 truncate max-w-[240px]">
                    {stationMeta.name} · {stationMeta.freq}
                  </p>
                </div>
                <Radio className="w-5 h-5 text-[#fde047] shrink-0" />
              </div>
              <div className="relative z-10 text-[10px] sm:text-[11px] text-slate-200 truncate">
                {radioStation === 'off' ? 'Radio Off' : currentTrack}
              </div>
            </button>

            {/* Row 2, Tile 2 (1 col): RESET CAR TO ROAD */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onResetCar();
                onResume();
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <Car
                className="absolute -right-3 -bottom-3 w-20 h-20 sm:w-24 sm:h-24 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                RESET CAR
              </h3>
              <div className="relative z-10 text-[10px] sm:text-[11px] text-slate-600 font-medium">
                Recover to Road
              </div>
            </button>

            {/* Row 2, Tile 3 (1 col): QUESTS / SETTINGS */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                if (onOpenQuests) {
                  onOpenQuests();
                } else {
                  onOpenSettings();
                }
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <ScrollText
                className="absolute -right-3 -bottom-3 w-20 h-20 sm:w-24 sm:h-24 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <div className="relative z-10 flex items-start justify-between gap-1">
                <h3 className="font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                  {onOpenQuests ? 'QUESTS' : 'SETTINGS'}
                </h3>
                {claimableQuestsCount > 0 && (
                  <span className="bg-[#f97316] text-white font-mono-num text-[10px] font-extrabold px-1.5 py-0.5">
                    {claimableQuestsCount}
                  </span>
                )}
              </div>
              <div className="relative z-10 text-[10px] sm:text-[11px] text-slate-600 font-medium">
                {claimableQuestsCount > 0
                  ? `${claimableQuestsCount} Claimable`
                  : 'Challenges & Shards'}
              </div>
            </button>

            {/* Row 2, Tile 4 (2 cols, Signature Electric Yellow): ATMOSPHERE & CONDITIONS */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                setActiveTab('atmosphere');
              }}
              className="group relative col-span-2 bg-[#fde047] hover:bg-[#fef08a] text-[#0b1019] p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer transition-transform duration-150 active:scale-[0.99]"
            >
              <div className="relative z-10 flex items-start justify-between gap-2">
                <h3 className="font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase leading-none">
                  WEATHER & TIME
                </h3>
                <div className="flex items-center gap-1.5">
                  {weatherBadgeIcon(weather, 'w-4 h-4')}
                  {timeBadgeIcon(timeOfDay, 'w-4 h-4')}
                </div>
              </div>
              <div className="relative z-10 grid grid-cols-3 gap-2 pt-2 border-t border-black/15">
                <div>
                  <div className="text-[9px] sm:text-[10px] uppercase font-bold text-black/60">
                    Sky
                  </div>
                  <div className="text-xs sm:text-sm font-display font-extrabold uppercase truncate">
                    {weather.replace('_', ' ')}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] sm:text-[10px] uppercase font-bold text-black/60">
                    Hour
                  </div>
                  <div className="text-xs sm:text-sm font-display font-extrabold uppercase">
                    {timeOfDay}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] sm:text-[10px] uppercase font-bold text-black/60">
                    Beams
                  </div>
                  <div className="text-xs sm:text-sm font-display font-extrabold uppercase">
                    {headlightsOn ? 'Lights On' : 'Lights Off'}
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* TAB 2: WEATHER & TIME — Direct Atmosphere Grid */}
        {activeTab === 'atmosphere' && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1 sm:gap-1.5">
            {WEATHER_OPTIONS.map((opt) => {
              const selected = weather === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    audioEngine.playUiClick();
                    onCycleWeather(opt.id, timeOfDay);
                  }}
                  className={`col-span-1 p-3 sm:p-3.5 min-h-[84px] sm:min-h-[124px] lg:min-h-[150px] flex flex-col justify-between text-left cursor-pointer transition-colors ${
                    selected
                      ? 'bg-[#fde047] text-[#090d16]'
                      : 'bg-[#f5f6f8] hover:bg-white text-[#0b1019]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-display font-extrabold text-xs sm:text-sm uppercase leading-tight">
                      {opt.label}
                    </span>
                    {weatherBadgeIcon(opt.id, 'w-4 h-4 shrink-0')}
                  </div>
                  <div className="text-[10px] font-display font-bold uppercase tracking-wider opacity-75">
                    {selected ? 'Active Condition' : 'Select Sky'}
                  </div>
                </button>
              );
            })}

            {TIME_OPTIONS.map((tOpt) => {
              const selected = timeOfDay === tOpt.id;
              return (
                <button
                  key={tOpt.id}
                  onClick={() => {
                    audioEngine.playUiClick();
                    onCycleWeather(weather, tOpt.id);
                  }}
                  className={`col-span-1 p-3 sm:p-3.5 min-h-[84px] sm:min-h-[124px] lg:min-h-[150px] flex flex-col justify-between text-left cursor-pointer transition-colors ${
                    selected
                      ? 'bg-[#fde047] text-[#090d16]'
                      : 'bg-[#f5f6f8] hover:bg-white text-[#0b1019]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-display font-extrabold text-xs sm:text-sm uppercase leading-tight">
                      {tOpt.label}
                    </span>
                    {timeBadgeIcon(tOpt.id, 'w-4 h-4 shrink-0')}
                  </div>
                  <div className="text-[10px] font-display font-bold uppercase tracking-wider opacity-75">
                    {selected ? cycleTimeLabel : 'Jump Time'}
                  </div>
                </button>
              );
            })}

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onToggleDayNightCycle();
              }}
              className="col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[84px] sm:min-h-[124px] lg:min-h-[150px] flex flex-col justify-between text-left cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <span className="font-display font-extrabold text-xs sm:text-sm uppercase leading-tight">
                  TIME CYCLE
                </span>
                <Compass className="w-4 h-4 shrink-0 text-slate-600" />
              </div>
              <div className="font-display font-extrabold text-sm uppercase">
                {autoDayNightCycle ? 'Dynamic Auto' : 'Locked'}
              </div>
            </button>

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onToggleHeadlights();
              }}
              className={`col-span-1 p-3 sm:p-3.5 min-h-[84px] sm:min-h-[124px] lg:min-h-[150px] flex flex-col justify-between text-left cursor-pointer ${
                headlightsOn
                  ? 'bg-[#0b0e15] text-white border border-sky-400/60'
                  : 'bg-[#f5f6f8] hover:bg-white text-[#0b1019]'
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="font-display font-extrabold text-xs sm:text-sm uppercase leading-tight">
                  HEADLIGHTS
                </span>
                <Lightbulb
                  className={`w-4 h-4 shrink-0 ${
                    headlightsOn ? 'text-[#fde047]' : 'text-slate-500'
                  }`}
                />
              </div>
              <div className="font-display font-extrabold text-sm uppercase">
                {headlightsOn ? 'High Beams On' : 'Beams Off'}
              </div>
            </button>
          </div>
        )}

        {/* TAB 3: CAR & RADIO — Radio Stations, Volume & Vehicle Spec */}
        {activeTab === 'garage_radio' && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1 sm:gap-1.5">
            {/* 3 cols: Radio Tuner */}
            <div className="col-span-2 sm:col-span-3 bg-[#f5f6f8] text-[#0b1019] p-3.5 sm:p-4 min-h-[168px] sm:min-h-[258px] lg:min-h-[314px] flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-display font-bold uppercase tracking-widest text-slate-500">
                    Horizon Festival Broadcast
                  </div>
                  <h3 className="font-display font-extrabold text-lg sm:text-xl uppercase tracking-wide truncate">
                    {stationMeta.name} · {stationMeta.freq}
                  </h3>
                  <p className="text-xs text-slate-600 truncate">
                    {stationMeta.genre} — {currentTrack}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => cycleStation(-1)}
                    aria-label="Previous Radio Station"
                    className="w-8 h-8 bg-[#0b1019] hover:bg-slate-800 text-white flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => cycleStation(1)}
                    aria-label="Next Radio Station"
                    className="w-8 h-8 bg-[#0b1019] hover:bg-slate-800 text-white flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5 my-2">
                {RADIO_STATIONS.map((st) => {
                  const active = st.id === radioStation;
                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        audioEngine.init();
                        onChangeRadioStation(st.id);
                      }}
                      className={`py-2 px-1 font-display font-bold text-[11px] uppercase tracking-wider cursor-pointer transition-colors truncate ${
                        active
                          ? 'bg-[#fde047] text-[#090d16]'
                          : 'bg-[#0b1019]/10 hover:bg-[#0b1019]/20 text-[#0b1019]'
                      }`}
                    >
                      {st.id === 'off' ? 'OFF' : st.freq.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-black/10">
                {radioVolume <= 0.01 || radioStation === 'off' ? (
                  <VolumeX className="w-4 h-4 text-slate-500 shrink-0" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#0b1019] shrink-0" />
                )}
                <span className="font-display font-bold text-xs uppercase tracking-wider shrink-0">
                  Volume
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={radioVolume}
                  onChange={(e) => {
                    audioEngine.init();
                    onChangeRadioVolume(parseFloat(e.target.value));
                  }}
                  aria-label="Radio Volume"
                  className="flex-1 accent-[#0b1019] cursor-pointer"
                />
                <span className="font-mono-num text-xs font-bold tabular-nums w-9 text-right">
                  {Math.round(radioVolume * 100)}%
                </span>
              </div>
            </div>

            {/* 3 cols: Active Vehicle Telemetry + Photo Tile + Recovery */}
            <div className="col-span-2 sm:col-span-3 grid grid-cols-2 gap-1 sm:gap-1.5">
              <div className="group relative col-span-2 text-white p-3.5 sm:p-4 min-h-[100px] sm:min-h-[150px] flex flex-col justify-between overflow-hidden">
                <PhotoTileBackdrop
                  src={horizonPromoHeadlightImg}
                  alt={activeSpec.name}
                  fallbackGradient="bg-gradient-to-br from-slate-800 to-black"
                />
                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-display uppercase tracking-widest text-[#fde047]">
                      {activeSpec.brand}
                    </div>
                    <h3 className="font-display font-extrabold text-base sm:text-lg uppercase">
                      {activeSpec.name}
                    </h3>
                  </div>
                  <span className="font-mono-num font-bold text-xs bg-white text-[#0b1019] px-2 py-0.5">
                    {perfClass.letter} {perfClass.pi}
                  </span>
                </div>
                <div className="relative z-10 grid grid-cols-3 gap-2 text-xs font-mono-num tabular-nums">
                  <div>
                    <div className="text-[9px] font-display uppercase text-slate-300">
                      Power
                    </div>
                    <div className="font-bold">{activeSpec.horsepower} HP</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase text-slate-300">
                      Top Speed
                    </div>
                    <div className="font-bold">{activeSpec.topSpeedKmh} KM/H</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-display uppercase text-slate-300">
                      Odometer
                    </div>
                    <div className="font-bold">
                      {(activeCarData?.mileageKm ?? 0).toFixed(1)} KM
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onResetCar();
                  onResume();
                }}
                className="col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 min-h-[72px] sm:min-h-[102px] flex flex-col justify-between text-left cursor-pointer"
              >
                <span className="font-display font-extrabold text-xs sm:text-sm uppercase">
                  RESET TO ROAD
                </span>
                <span className="text-[10px] text-slate-600">Place car upright</span>
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onOpenPhotoMode();
                }}
                className="col-span-1 bg-[#fde047] hover:bg-[#fef08a] text-[#090d16] p-3 min-h-[72px] sm:min-h-[102px] flex flex-col justify-between text-left cursor-pointer"
              >
                <span className="font-display font-extrabold text-xs sm:text-sm uppercase">
                  SHOOT CAR
                </span>
                <span className="text-[10px] text-black/75 font-semibold">
                  Open Photo Mode
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: PROGRESS — Direct Horizon Reference Layout (White / Photo / Yellow Tiles) */}
        {activeTab === 'progress' && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1 sm:gap-1.5">
            {/* Row 1, Tile 1 (2 cols): ROAD TRIP PROGRESS */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenMap();
              }}
              className="group relative col-span-2 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <svg
                viewBox="0 0 260 120"
                className="absolute right-0 bottom-0 w-48 sm:w-56 h-24 sm:h-28 text-slate-900/[0.08] pointer-events-none"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M0 120 L55 72 L105 94 L175 44 L260 88 L260 120 Z" />
                <circle cx="174" cy="40" r="18" />
              </svg>
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase">
                ROAD TRIP PROGRESS
              </h3>
              <div className="relative z-10 flex items-baseline gap-2 font-mono-num tabular-nums">
                <span className="text-base sm:text-lg font-extrabold">
                  {unlockedCount}/{REGIONS.length}
                </span>
                <span className="text-[11px] font-display font-semibold text-slate-600 uppercase">
                  Coastal Regions Discovered
                </span>
              </div>
            </button>

            {/* Row 1, Tile 2 (1 col): QUESTS / WHEELSPIN */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenQuests?.();
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <Sparkles
                className="absolute -right-3 -bottom-3 w-20 h-20 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <div className="relative z-10 flex items-start justify-between gap-1">
                <h3 className="font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                  SHARD QUESTS
                </h3>
                {claimableQuestsCount > 0 && (
                  <span className="bg-[#f97316] text-white font-mono-num text-[10px] font-extrabold px-1.5 py-0.5">
                    {claimableQuestsCount}
                  </span>
                )}
              </div>
              <div className="relative z-10 font-mono-num text-sm font-bold tabular-nums">
                {(save?.fumaShards ?? 0).toLocaleString()} Shards
              </div>
            </button>

            {/* Row 1, Tile 3 (2 cols): BUCKET LIST Photo Tile */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenMap();
              }}
              className="group relative col-span-2 text-white p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <PhotoTileBackdrop
                src={horizonBucketListImg}
                alt="Red supercar overlooking coastal cliffs"
                fallbackGradient="bg-gradient-to-br from-rose-900 via-amber-900 to-slate-900"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase drop-shadow">
                BUCKET LIST
              </h3>
              <div className="relative z-10 text-[11px] sm:text-xs font-medium text-slate-100 drop-shadow tabular-nums">
                {completedEventsCount}/{RACE_EVENTS.length} Loop Challenges Cleared
              </div>
            </button>

            {/* Row 1, Tile 4 (1 col): ACHIEVEMENTS */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenQuests?.();
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <Trophy
                className="absolute -right-3 -bottom-3 w-20 h-20 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                ACHIEVEMENTS
              </h3>
              <div className="relative z-10 font-mono-num text-sm font-bold tabular-nums">
                {achievementsCount}/{ACHIEVEMENTS_LIST.length} Unlocked
              </div>
            </button>

            {/* Row 2, Tile 1 (2 cols): CAR PROMO / GARAGE Photo Tile */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                setActiveTab('garage_radio');
              }}
              className="group relative col-span-2 text-white p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <PhotoTileBackdrop
                src={horizonPromoHeadlightImg}
                alt="Horizon Car Promo"
                fallbackGradient="bg-gradient-to-br from-zinc-800 to-black"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase drop-shadow">
                CAR PROMO
              </h3>
              <div className="relative z-10 text-[11px] sm:text-xs font-medium text-slate-100 drop-shadow tabular-nums">
                {ownedCarsCount}/{CAR_CATALOG.length} Vehicles Owned
              </div>
            </button>

            {/* Row 2, Tile 2 (1 col): PERKS & RANK */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenQuests?.();
              }}
              className="group relative col-span-1 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <div
                className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full border-8 border-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <div className="relative z-10 flex items-start justify-between gap-1">
                <h3 className="font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                  PERKS
                </h3>
                <span className="bg-[#f97316] text-white font-mono-num text-[10px] font-extrabold px-1.5 py-0.5">
                  Lv.{driverLevel}
                </span>
              </div>
              <div className="relative z-10 text-[11px] font-display font-bold uppercase text-slate-700">
                {playerRankLabel} Rank
              </div>
            </button>

            {/* Row 2, Tile 3 (1 col): STATS */}
            <div className="relative col-span-1 bg-[#f5f6f8] text-[#0b1019] p-3 sm:p-3.5 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between overflow-hidden">
              <TrendingUp
                className="absolute -right-3 -bottom-3 w-20 h-20 text-slate-900/[0.08] pointer-events-none"
                aria-hidden="true"
              />
              <h3 className="relative z-10 font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-tight">
                STATS
              </h3>
              <div className="relative z-10 space-y-0.5 font-mono-num text-[11px] font-bold tabular-nums">
                <div>{Math.round(save?.stats.topSpeedKmh ?? 0)} KM/H Peak</div>
                <div className="text-slate-600">
                  {(save?.stats.totalDistanceKm ?? 0).toFixed(1)} KM Driven
                </div>
              </div>
            </div>

            {/* Row 2, Tile 4 (2 cols, Signature Electric Yellow): CHAMPIONSHIPS WON */}
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenMap();
              }}
              className="group relative col-span-2 bg-[#fde047] hover:bg-[#fef08a] text-[#0b1019] p-3 sm:p-4 min-h-[86px] sm:min-h-[126px] lg:min-h-[154px] flex flex-col justify-between text-left overflow-hidden cursor-pointer"
            >
              <h3 className="font-display font-extrabold text-sm sm:text-lg tracking-wide uppercase">
                CHAMPIONSHIPS WON
              </h3>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="grid grid-cols-5 gap-1 mb-1.5 opacity-80">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <Trophy
                        key={idx}
                        className={`w-3 h-3 ${
                          idx < racesWonCount ? 'text-[#0b1019]' : 'text-black/20'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="font-mono-num font-extrabold text-sm sm:text-base tabular-nums">
                    {racesWonCount}/{RACE_EVENTS.length}
                  </div>
                  <div className="text-[10px] font-display font-extrabold uppercase">
                    YOU
                  </div>
                </div>

                <div className="font-display italic font-black text-xl sm:text-2xl text-black/25 px-1">
                  VS.
                </div>

                <div className="text-right">
                  <div className="font-mono-num font-extrabold text-sm sm:text-base tabular-nums">
                    {topRival.score.toLocaleString()}
                  </div>
                  <div className="text-[10px] font-display font-bold uppercase truncate max-w-[110px]">
                    {topRival.name}
                  </div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* TAB 5: SYSTEM — Settings, Fullscreen, Restart & Exit */}
        {activeTab === 'system' && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-1 sm:gap-1.5">
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenSettings();
              }}
              className="col-span-2 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-4 min-h-[92px] sm:min-h-[130px] lg:min-h-[154px] flex flex-col justify-between text-left cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display font-extrabold text-base sm:text-lg uppercase">
                  SETTINGS
                </h3>
                <Settings className="w-5 h-5 text-slate-600" />
              </div>
              <p className="text-xs text-slate-600">
                Graphics Preset · Traffic · Steering · Motion Blur · Audio
              </p>
            </button>

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onRestart();
              }}
              className="col-span-2 bg-[#f5f6f8] hover:bg-white text-[#0b1019] p-4 min-h-[92px] sm:min-h-[130px] lg:min-h-[154px] flex flex-col justify-between text-left cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display font-extrabold text-base sm:text-lg uppercase">
                  RESTART SESSION
                </h3>
                <RotateCcw className="w-5 h-5 text-slate-600" />
              </div>
              <p className="text-xs text-slate-600">
                Restart current race or coastal free roam spawn
              </p>
            </button>

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onToggleFullscreen?.();
              }}
              disabled={!fullscreenSupported || !onToggleFullscreen}
              className="col-span-2 bg-[#f5f6f8] hover:bg-white disabled:opacity-50 text-[#0b1019] p-4 min-h-[92px] sm:min-h-[130px] lg:min-h-[154px] flex flex-col justify-between text-left cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display font-extrabold text-base sm:text-lg uppercase">
                  FULLSCREEN
                </h3>
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <p className="text-xs text-slate-600">
                {fullscreenSupported
                  ? isFullscreen
                    ? 'Fullscreen Active · Click to Exit'
                    : 'Enter Fullscreen Mode'
                  : 'Browser manages viewport sizing'}
              </p>
            </button>

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onResume();
              }}
              className="col-span-2 sm:col-span-3 bg-[#fde047] hover:bg-[#fef08a] text-[#090d16] p-4 min-h-[84px] sm:min-h-[124px] lg:min-h-[146px] flex flex-col justify-between text-left cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display font-extrabold text-base sm:text-lg uppercase">
                  RESUME DRIVING
                </h3>
                <Play className="w-5 h-5 fill-current" />
              </div>
              <p className="text-xs font-semibold text-black/75">
                Close pause menu and return immediately to {regionName}
              </p>
            </button>

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onExitToMenu();
              }}
              className="col-span-2 sm:col-span-3 bg-[#101520] hover:bg-[#e11d48] text-white border border-white/15 p-4 min-h-[84px] sm:min-h-[124px] lg:min-h-[146px] flex flex-col justify-between text-left cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display font-extrabold text-base sm:text-lg uppercase">
                  RETURN TO MAIN MENU
                </h3>
                <Power className="w-5 h-5" />
              </div>
              <p className="text-xs text-slate-300">
                Leave current drive and enter main showcase menu
              </p>
            </button>
          </div>
        )}
      </main>

      {/* Bottom Action Hint Strip (Matches Horizon bottom control hints + quick actions) */}
      <footer className="w-full max-w-[1120px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-white/90 font-display shrink-0">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onResume();
            }}
            className="inline-flex items-center gap-1.5 hover:text-[#fde047] cursor-pointer whitespace-nowrap"
          >
            <span className="bg-emerald-500 text-[#05140a] font-extrabold text-[10px] px-1.5 py-0.5 leading-none">
              ESC
            </span>
            <span>Resume</span>
          </button>

          <button
            onClick={() => {
              audioEngine.playUiClick();
              setActiveTab((prev) => {
                const idx = PAUSE_TABS.findIndex((t) => t.id === prev);
                return PAUSE_TABS[(idx + 1) % PAUSE_TABS.length].id;
              });
            }}
            className="hidden sm:inline-flex items-center gap-1.5 hover:text-[#fde047] cursor-pointer whitespace-nowrap"
          >
            <span className="bg-sky-500 text-[#04121c] font-extrabold text-[10px] px-1.5 py-0.5 leading-none">
              ←/→
            </span>
            <span>Switch Tab</span>
          </button>

          <button
            onClick={() => {
              audioEngine.playUiClick();
              onOpenSettings();
            }}
            className="inline-flex items-center gap-1.5 hover:text-[#fde047] cursor-pointer whitespace-nowrap"
          >
            <span className="bg-[#fde047] text-[#090d16] font-extrabold text-[10px] px-1.5 py-0.5 leading-none">
              S
            </span>
            <span>Settings</span>
          </button>

          {fullscreenSupported && onToggleFullscreen && (
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onToggleFullscreen();
              }}
              className="hidden md:inline-flex items-center gap-1.5 hover:text-[#fde047] cursor-pointer whitespace-nowrap"
            >
              <span className="bg-white/20 text-white font-extrabold text-[10px] px-1.5 py-0.5 leading-none">
                F
              </span>
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>
          )}
        </div>

        <button
          onClick={() => {
            audioEngine.playUiClick();
            onExitToMenu();
          }}
          className="inline-flex items-center gap-1.5 bg-[#0b0e15]/85 hover:bg-rose-600 text-slate-100 hover:text-white border border-white/15 px-3 py-1 text-[11px] font-display font-bold uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap"
        >
          <Power className="w-3 h-3" />
          <span>Main Menu</span>
        </button>
      </footer>
    </div>
  );
};

interface RaceResultsModalProps {
  result: RaceResultSummary;
  onRetry: () => void;
  onFreeRoam: () => void;
  onMenu: () => void;
}

export const RaceResultsModal: React.FC<RaceResultsModalProps> = ({
  result,
  onRetry,
  onFreeRoam,
  onMenu,
}) => {
  return (
    <div className="fixed inset-0 z-40 bg-[#07080b]/90 overflow-y-auto flex justify-center p-3 sm:p-5">
      <div className="my-auto w-full max-w-lg bg-[#0d1017] border border-slate-700 p-5 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div>
            <div className="text-[10px] font-display tracking-[0.28em] text-rose-500 uppercase">
              {result.mode.replace('_', ' ')} Complete
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-100 mt-0.5">
              {result.won ? 'VICTORY!' : `FINISHED P${result.position}`}
            </h2>
            <div className="text-xs text-slate-400">{result.eventTitle}</div>
          </div>
          <div className="w-12 h-12 bg-rose-600/20 border border-rose-500 flex items-center justify-center shrink-0">
            <Trophy
              className={`w-6 h-6 ${
                result.won ? 'text-amber-400' : 'text-slate-400'
              }`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 border border-slate-800 p-3.5 text-center tabular-nums">
          <div>
            <div className="text-[10px] font-display text-slate-500">POSITION</div>
            <div className="font-mono-num text-lg font-bold text-white">
              P{result.position}/{result.totalRacers}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-display text-slate-500">TIME</div>
            <div className="font-mono-num text-lg font-bold text-slate-200">
              {result.timeSec.toFixed(1)}s
            </div>
          </div>
          <div>
            <div className="text-[10px] font-display text-slate-500">TOP SPEED</div>
            <div className="font-mono-num text-lg font-bold text-rose-400">
              {result.topSpeedKmh}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-display text-slate-500">DRIFT PTS</div>
            <div className="font-mono-num text-lg font-bold text-amber-400">
              {result.driftScore.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center tabular-nums">
          <div className="bg-emerald-950/30 border border-emerald-700/60 p-3">
            <div className="text-[10px] font-display text-emerald-300">CREDITS</div>
            <div className="font-mono-num text-base font-bold text-emerald-400">
              +${result.cashEarned.toLocaleString()}
            </div>
          </div>
          <div className="bg-sky-950/30 border border-sky-700/60 p-3">
            <div className="text-[10px] font-display text-sky-300">DRIVER XP</div>
            <div className="font-mono-num text-base font-bold text-sky-400">
              +{result.xpEarned}
            </div>
          </div>
          <div className="bg-rose-950/30 border border-rose-700/60 p-3">
            <div className="text-[10px] font-display text-rose-300">REPUTATION</div>
            <div className="font-mono-num text-base font-bold text-rose-400">
              +{result.repEarned}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onRetry();
            }}
            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-wider text-xs py-3 min-h-[42px] cursor-pointer"
          >
            RACE AGAIN
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onFreeRoam();
            }}
            className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-display font-bold tracking-wider text-xs py-3 min-h-[42px] cursor-pointer"
          >
            FREE ROAM
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onMenu();
            }}
            className="px-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-display text-xs py-3 min-h-[42px] cursor-pointer"
          >
            MENU
          </button>
        </div>
      </div>
    </div>
  );
};
