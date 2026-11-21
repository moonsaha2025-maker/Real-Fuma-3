import React, { useState } from 'react';
import { ArrowLeft, CloudRain, Flag, Play, Sun } from 'lucide-react';
import { RACE_EVENTS, REGIONS } from '../data/world';
import { audioEngine } from '../engine/audio';
import {
  RaceEvent,
  RaceMode,
  RegionId,
  TimeOfDay,
  WeatherType,
} from '../types/game';

interface QuickRaceModalProps {
  onBack: () => void;
  onStartRace: (
    event: RaceEvent,
    weather: WeatherType,
    time: TimeOfDay,
  ) => void;
  onStartFreeRoam: (
    regionId: RegionId,
    weather: WeatherType,
    time: TimeOfDay,
  ) => void;
}

const MODE_LABELS: Array<{ id: RaceMode; label: string; desc: string }> = [
  { id: 'circuit', label: 'Circuit GP', desc: 'Full 3.8 km coastal-to-mountain championship' },
  { id: 'sprint', label: 'Bridge Sprint', desc: 'High-speed dash across Fujimi Suspension Bridge' },
  { id: 'drift', label: 'Drift Attack', desc: 'Slide Palm Canyon switchbacks for max points' },
  { id: 'time_attack', label: 'Time Attack', desc: 'Beat the benchmark solo flying lap' },
  { id: 'rival_battle', label: 'Rival Duel', desc: '1v1 showdown across skyline & mountain pass' },
  { id: 'free_roam', label: 'Free Roam', desc: 'Cruise all 4 interconnected highway zones' },
];

const WEATHERS: Array<{ id: WeatherType; label: string }> = [
  { id: 'sunny', label: 'Sunny' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'rain', label: 'Rain' },
  { id: 'heavy_rain', label: 'Heavy Rain' },
  { id: 'thunderstorm', label: 'Thunderstorm' },
  { id: 'fog', label: 'Coastal Fog' },
];

const TIMES: Array<{ id: TimeOfDay; label: string }> = [
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
];

export const QuickRaceModal: React.FC<QuickRaceModalProps> = ({
  onBack,
  onStartRace,
  onStartFreeRoam,
}) => {
  const [selectedMode, setSelectedMode] = useState<RaceMode>('circuit');
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('sunset_coast');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Extreme'>('Medium');

  const matchingEvent =
    RACE_EVENTS.find((e) => e.mode === selectedMode) ?? RACE_EVENTS[0];

  const handleLaunch = () => {
    audioEngine.playUiClick();
    if (selectedMode === 'free_roam') {
      onStartFreeRoam(selectedRegion, weather, timeOfDay);
      return;
    }
    const configured: RaceEvent = {
      ...matchingEvent,
      difficulty,
    };
    onStartRace(configured, weather, timeOfDay);
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#07080b]/95 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
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
                EVENT GENERATOR
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-100">
                EVENTS & FREE ROAM SETUP
              </h2>
            </div>
          </div>

          <button
            onClick={handleLaunch}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-widest text-sm px-6 py-3 cursor-pointer shadow-lg"
          >
            <Play className="w-4 h-4 fill-current" />
            START SESSION
          </button>
        </div>

        <div>
          <div className="text-xs font-display tracking-widest text-slate-400 uppercase mb-2.5 flex items-center gap-2">
            <Flag className="w-3.5 h-3.5 text-rose-500" />
            SELECT SESSION MODE
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {MODE_LABELS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  audioEngine.playUiClick();
                  setSelectedMode(m.id);
                }}
                className={`p-3.5 border text-left transition-all cursor-pointer ${
                  selectedMode === m.id
                    ? 'bg-rose-950/40 border-rose-500 text-white'
                    : 'bg-[#0d1017] border-slate-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="font-display font-bold text-xs uppercase tracking-wider">
                  {m.label}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0d1017] border border-slate-800 p-4 space-y-3">
            <div className="text-xs font-display tracking-widest text-slate-300 flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-sky-400" />
              DYNAMIC WEATHER (AFFECTS TIRE GRIP)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEATHERS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    audioEngine.playUiClick();
                    setWeather(w.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-display border cursor-pointer ${
                    weather === w.id
                      ? 'bg-rose-600 border-rose-500 text-white font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0d1017] border border-slate-800 p-4 space-y-3">
            <div className="text-xs font-display tracking-widest text-slate-300 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" />
              TIME OF DAY & AI DIFFICULTY
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TIMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    audioEngine.playUiClick();
                    setTimeOfDay(t.id);
                  }}
                  className={`px-3 py-1.5 text-xs font-display border cursor-pointer ${
                    timeOfDay === t.id
                      ? 'bg-rose-600 border-rose-500 text-white font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800">
              {(['Easy', 'Medium', 'Hard', 'Extreme'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    audioEngine.playUiClick();
                    setDifficulty(d);
                  }}
                  className={`px-3 py-1 text-xs font-display border cursor-pointer ${
                    difficulty === d
                      ? 'bg-slate-100 text-black font-bold border-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  AI: {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedMode === 'free_roam' && (
          <div className="bg-[#0d1017] border border-slate-800 p-4">
            <div className="text-xs font-display tracking-widest text-slate-300 mb-2">
              STARTING ZONE
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegion(r.id)}
                  className={`px-3 py-1.5 text-xs font-display border cursor-pointer ${
                    selectedRegion === r.id
                      ? 'bg-rose-600 border-rose-500 text-white font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  {r.code}: {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
