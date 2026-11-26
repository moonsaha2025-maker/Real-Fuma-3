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
    const nextIdx = (curIdx + delta + RADIO_STATIONS.length) % RADIO_STATIONS.length;
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
    <div className="fixed inset-0 z-40 bg-[#07080b]/85 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0d1017] border border-slate-700 p-6 space-y-4 shadow-2xl">
        <div className="border-b border-slate-800 pb-3 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-display tracking-[0.28em] text-rose-500">
              SIMULATION PAUSED
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-100">
              REAL FUMA
            </h2>
          </div>
          <div className="text-right tabular-nums">
            <div className="text-[9px] font-display tracking-widest text-slate-500">
              WORLD TIME
            </div>
            <div className="font-mono-num text-sm font-bold text-amber-300">
              {cycleTimeLabel}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              audioEngine.playUiClick();
              nextWeather();
            }}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[10px] uppercase py-2 cursor-pointer"
          >
            <CloudRain className="w-3.5 h-3.5 text-sky-400" />
            {weather.replace('_', ' ')}
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              nextTime();
            }}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[10px] uppercase py-2 cursor-pointer"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            {timeOfDay}
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onToggleDayNightCycle();
            }}
            className="col-span-2 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[10px] uppercase py-2 cursor-pointer"
          >
            <Sun className={`w-3.5 h-3.5 ${autoDayNightCycle ? 'text-emerald-400' : 'text-slate-500'}`} />
            DAY/NIGHT CYCLE: {autoDayNightCycle ? 'AUTO' : 'LOCKED'}
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onToggleHeadlights();
            }}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[10px] uppercase py-2 cursor-pointer"
          >
            <Lightbulb className={`w-3.5 h-3.5 ${headlightsOn ? 'text-sky-400' : 'text-slate-500'}`} />
            LIGHTS {headlightsOn ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onResetCar();
              onResume();
            }}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[10px] uppercase py-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            RESET TO ROAD
          </button>
          {fullscreenSupported && onToggleFullscreen && (
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onToggleFullscreen();
              }}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display text-[10px] uppercase py-2 cursor-pointer"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                  FULLSCREEN: ON (TAP TO EXIT)
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                  ENTER FULLSCREEN
                </>
              )}
            </button>
          )}
        </div>

        {/* Radio Station & Volume Tuner */}
        <div className="bg-slate-950/90 border border-slate-800 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Radio
                className="w-4 h-4 shrink-0"
                style={{ color: stationMeta.accentHex }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-display font-bold text-white truncate">
                  <span>{stationMeta.name}</span>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono-num text-[11px] text-sky-300 tabular-nums">
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
                className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => cycleStation(1)}
                title="Next Station"
                aria-label="Next Radio Station"
                className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
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
                  className={`py-1 px-1 text-[9px] font-display font-bold tracking-wider truncate border cursor-pointer ${
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

          <div className="flex items-center gap-2.5 pt-0.5">
            {radioVolume <= 0.01 || radioStation === 'off' ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            )}
            <span className="text-[10px] font-display tracking-wider text-slate-400 shrink-0">
              RADIO VOL
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
            <span className="font-mono-num text-[10px] text-slate-200 tabular-nums w-8 text-right">
              {Math.round(radioVolume * 100)}%
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onResume();
            }}
            className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-widest text-xs py-3 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            RESUME DRIVING
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onOpenPhotoMode();
            }}
            className="w-full flex items-center justify-center gap-2 bg-sky-600/85 hover:bg-sky-500 text-white font-display font-bold tracking-wider text-xs py-2.5 cursor-pointer"
          >
            <Aperture className="w-4 h-4" />
            PHOTO MODE
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onRestart();
            }}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display tracking-wider text-xs py-2.5 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-rose-500" />
            RESTART SESSION
          </button>
          {onOpenQuests && (
            <button
              onClick={() => {
                audioEngine.playUiClick();
                onOpenQuests();
              }}
              className="w-full flex items-center justify-center gap-2 bg-violet-700/80 hover:bg-violet-600 text-white font-display font-bold tracking-wider text-xs py-2.5 cursor-pointer"
            >
              <ScrollText className="w-4 h-4" />
              QUESTS &amp; FUMA SHARDS
            </button>
          )}
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onOpenMap();
            }}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display tracking-wider text-xs py-2.5 cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-rose-500" />
            TRACK MAP & FAST TRAVEL
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onOpenSettings();
            }}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display tracking-wider text-xs py-2.5 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-rose-500" />
            GRAPHICS & CONTROLS
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onExitToMenu();
            }}
            className="w-full flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white font-display tracking-wider text-xs py-2.5 cursor-pointer"
          >
            <Warehouse className="w-4 h-4" />
            RETURN TO MAIN MENU
          </button>
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
    <div className="fixed inset-0 z-40 bg-[#07080b]/90 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0d1017] border border-slate-700 p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="text-[10px] font-display tracking-[0.28em] text-rose-500 uppercase">
              {result.mode.replace('_', ' ')} COMPLETE
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-100 mt-0.5">
              {result.won ? 'VICTORY!' : `FINISHED P${result.position}`}
            </h2>
            <div className="text-xs text-slate-400">{result.eventTitle}</div>
          </div>
          <div className="w-12 h-12 bg-rose-600/20 border border-rose-500 flex items-center justify-center">
            <Trophy
              className={`w-6 h-6 ${
                result.won ? 'text-amber-400' : 'text-slate-400'
              }`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 border border-slate-800 p-4 text-center tabular-nums">
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
            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-wider text-xs py-3 cursor-pointer"
          >
            RACE AGAIN
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onFreeRoam();
            }}
            className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-display font-bold tracking-wider text-xs py-3 cursor-pointer"
          >
            FREE ROAM
          </button>
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onMenu();
            }}
            className="px-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-display text-xs py-3 cursor-pointer"
          >
            MENU
          </button>
        </div>
      </div>
    </div>
  );
};
