import React from 'react';
import {
  CloudRain,
  Lightbulb,
  MapPin,
  Play,
  RotateCcw,
  Settings,
  Sun,
  Trophy,
  Warehouse,
} from 'lucide-react';
import { audioEngine } from '../engine/audio';
import { RaceResultSummary, TimeOfDay, WeatherType } from '../types/game';

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
  onResume: () => void;
  onRestart: () => void;
  onOpenMap: () => void;
  onOpenSettings: () => void;
  onCycleWeather: (w: WeatherType, t: TimeOfDay) => void;
  onToggleDayNightCycle: () => void;
  onToggleHeadlights: () => void;
  onResetCar: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  weather,
  timeOfDay,
  cycleTimeLabel,
  autoDayNightCycle,
  headlightsOn,
  onResume,
  onRestart,
  onOpenMap,
  onOpenSettings,
  onCycleWeather,
  onToggleDayNightCycle,
  onToggleHeadlights,
  onResetCar,
  onExitToMenu,
}) => {
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
              onRestart();
            }}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-display tracking-wider text-xs py-2.5 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-rose-500" />
            RESTART SESSION
          </button>
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
