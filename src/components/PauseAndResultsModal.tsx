import React from 'react';
import {
  Aperture,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Lightbulb,
  MapPin,
  Maximize2,
  Minimize2,
  Play,
  Radio,
  RotateCcw,
  ScrollText,
  Settings,
  Sun,
  Trophy,
  Volume2,
  VolumeX,
  Warehouse,
} from 'lucide-react';
import { audioEngine } from '../engine/audio';
import { getRadioStationMeta, RADIO_STATIONS, radioEngine } from '../engine/radio';
import {
  RaceResultSummary,
  RadioStationId,
  TimeOfDay,
  WeatherType,
} from '../types/game';

const WEATHER_CYCLE: WeatherType[] = [
  'sunny',
  'cloudy',
  'rain',
  'heavy_rain',
  'thunderstorm',
  'fog',
];
const TIME_CYCLE: TimeOfDay[] = ['day', 'sunset', 'night', 'sunrise'];

interface PauseModalProps {
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  cycleTimeLabel: string;
  autoDayNightCycle: boolean;
  headlightsOn: boolean;
  radioStation: RadioStationId;
  radioVolume: number;
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
  const stationMeta = getRadioStationMeta(radioStation);
  const currentTrack = radioEngine.getCurrentTrack();

  const cycleStation = (delta: -1 | 1) => {
    audioEngine.init();
    const curIdx = RADIO_STATIONS.findIndex((s) => s.id === radioStation);
    const nextIdx =
      (curIdx + delta + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    onChangeRadioStation(RADIO_STATIONS[nextIdx].id);
  };

  const nextWeather = () => {
    const idx = WEATHER_CYCLE.indexOf(weather);
    onCycleWeather(WEATHER_CYCLE[(idx + 1) % WEATHER_CYCLE.length], timeOfDay);
  };

  const nextTime = () => {
    const idx = TIME_CYCLE.indexOf(timeOfDay);
    onCycleWeather(weather, TIME_CYCLE[(idx + 1) % TIME_CYCLE.length]);
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#06080d]/82 backdrop-blur-md overflow-y-auto flex justify-center p-2.5 sm:p-5">
      <div
        className="my-auto w-full max-w-3xl bg-[#0c0f16]/96 border border-white/12 shadow-[0_24px_64px_rgba(0,0,0,0.78)] p-3.5 sm:p-5 flex flex-col gap-3 sm:gap-4"
        style={{
          clipPath:
            'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
        }}
      >
        {/* Top Bar: Brand + Live World Clock */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2.5">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h2 className="font-display italic text-lg sm:text-2xl font-bold tracking-wider text-white whitespace-nowrap">
              REAL FUMA 3
            </h2>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="text-[11px] sm:text-xs font-display tracking-[0.2em] text-rose-400 uppercase whitespace-nowrap">
              Paused
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 tabular-nums">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="hidden sm:inline font-display tracking-wider text-[10px] uppercase">
                World Time
              </span>
              <span className="font-mono-num text-sm font-bold text-amber-300">
                {cycleTimeLabel}
              </span>
            </div>
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onResume();
              }}
              className="hidden sm:inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-display italic font-bold tracking-wider text-xs px-4 py-2 min-h-[36px] cursor-pointer transition-colors whitespace-nowrap"
              style={{
                clipPath: 'polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)',
              }}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Resume
            </button>
          </div>
        </div>

        {/* 2-Column Landscape Command Deck */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-stretch">
          {/* Left Column: Primary Drive & Navigation Actions */}
          <div className="sm:col-span-6 flex flex-col justify-between gap-2">
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onResume();
              }}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#f43f5e] to-[#e11d48] hover:brightness-110 text-white font-display italic font-bold tracking-[0.14em] uppercase text-xs sm:text-sm min-h-[42px] px-4 cursor-pointer transition-all shadow-lg shadow-rose-950/50 whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              Resume Driving
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onOpenPhotoMode();
                }}
                className="flex items-center justify-center gap-1.5 bg-sky-600/85 hover:bg-sky-500 text-white font-display font-bold tracking-wider uppercase text-[11px] min-h-[40px] px-3 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Aperture className="w-3.5 h-3.5 shrink-0" />
                Photo Mode
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onRestart();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display tracking-wider uppercase text-[11px] min-h-[40px] px-3 cursor-pointer transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                Restart
              </button>

              {onOpenQuests && (
                <button
                  onClick={() => {
                    audioEngine.playUiClick();
                    onOpenQuests();
                  }}
                  className="flex items-center justify-center gap-1.5 bg-violet-700/85 hover:bg-violet-600 text-white font-display font-bold tracking-wider uppercase text-[11px] min-h-[40px] px-3 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <ScrollText className="w-3.5 h-3.5 shrink-0" />
                  Quests
                </button>
              )}

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onOpenMap();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display tracking-wider uppercase text-[11px] min-h-[40px] px-3 cursor-pointer transition-colors whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                Track Map
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onOpenSettings();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display tracking-wider uppercase text-[11px] min-h-[40px] px-3 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                Settings
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onResetCar();
                  onResume();
                }}
                className={`flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display tracking-wider uppercase text-[11px] min-h-[40px] px-3 cursor-pointer transition-colors whitespace-nowrap ${
                  !onOpenQuests ? 'col-span-2' : ''
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Reset Car
              </button>
            </div>

            <button
              onClick={() => {
                audioEngine.playUiClick();
                onExitToMenu();
              }}
              className="w-full flex items-center justify-center gap-2 bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-display tracking-wider uppercase text-[11px] min-h-[40px] px-4 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Warehouse className="w-3.5 h-3.5 shrink-0" />
              Return to Main Menu
            </button>
          </div>

          {/* Right Column: Atmosphere Controls + Radio Tuner */}
          <div className="sm:col-span-6 flex flex-col justify-between gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  nextWeather();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display text-[11px] uppercase min-h-[40px] px-2.5 cursor-pointer transition-colors whitespace-nowrap truncate"
              >
                <CloudRain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">{weather.replace('_', ' ')}</span>
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  nextTime();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display text-[11px] uppercase min-h-[40px] px-2.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{timeOfDay}</span>
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onToggleDayNightCycle();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display text-[11px] uppercase min-h-[40px] px-2.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Sun
                  className={`w-3.5 h-3.5 shrink-0 ${
                    autoDayNightCycle ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                />
                <span>Cycle: {autoDayNightCycle ? 'Auto' : 'Locked'}</span>
              </button>

              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onToggleHeadlights();
                }}
                className="flex items-center justify-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display text-[11px] uppercase min-h-[40px] px-2.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Lightbulb
                  className={`w-3.5 h-3.5 shrink-0 ${
                    headlightsOn ? 'text-sky-400' : 'text-slate-500'
                  }`}
                />
                <span>Lights {headlightsOn ? 'On' : 'Off'}</span>
              </button>

              {fullscreenSupported && onToggleFullscreen && (
                <button
                  onClick={() => {
                    audioEngine.playUiClick();
                    onToggleFullscreen();
                  }}
                  className="col-span-2 flex items-center justify-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-100 font-display text-[11px] uppercase min-h-[38px] px-3 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Fullscreen On · Tap to Exit
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      Enter Fullscreen
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Compact Radio Tuner */}
            <div className="bg-slate-950/85 border border-white/10 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Radio
                    className="w-4 h-4 shrink-0"
                    style={{ color: stationMeta.accentHex }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-display font-bold text-white truncate">
                      <span className="truncate">{stationMeta.name}</span>
                      <span className="text-slate-500" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono-num text-[11px] text-sky-300 tabular-nums shrink-0">
                        {stationMeta.freq}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {stationMeta.genre} — {currentTrack}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => cycleStation(-1)}
                    title="Previous Station"
                    aria-label="Previous Radio Station"
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => cycleStation(1)}
                    title="Next Station"
                    aria-label="Next Radio Station"
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {RADIO_STATIONS.map((st) => {
                  const active = st.id === radioStation;
                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        audioEngine.init();
                        onChangeRadioStation(st.id);
                      }}
                      className={`py-1 px-1 text-[10px] font-display font-bold tracking-wider truncate border cursor-pointer ${
                        active
                          ? 'bg-rose-600 border-rose-400 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-100'
                      }`}
                      title={`${st.name} (${st.freq})`}
                    >
                      {st.id === 'off' ? 'OFF' : st.freq.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5">
                {radioVolume <= 0.01 || radioStation === 'off' ? (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
                <span className="text-[10px] font-display tracking-wider text-slate-400 shrink-0 uppercase">
                  Radio
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
                  className="flex-1 accent-rose-600 cursor-pointer"
                />
                <span className="font-mono-num text-[11px] text-slate-200 tabular-nums w-8 text-right">
                  {Math.round(radioVolume * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
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
