import React, { useState } from 'react';
import {
  ArrowLeft,
  Flag,
  MapPin,
  Navigation,
  ShoppingBag,
  Warehouse,
  Wrench,
} from 'lucide-react';
import {
  getRoadPointAt,
  TRACK_STATIONS,
  WORLD_HALF_SIZE,
} from '../data/track';
import {
  MAP_LANDMARKS,
  RACE_EVENTS,
  REGIONS,
} from '../data/world';
import { audioEngine } from '../engine/audio';
import {
  MapLandmark,
  PlayerSaveData,
  RaceEvent,
  RegionInfo,
} from '../types/game';

interface WorldMapModalProps {
  save: PlayerSaveData;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  onlinePlayers?: Array<{
    uid: string;
    googleDisplayName: string;
    x: number;
    z: number;
    heading: number;
  }>;
  onClose: () => void;
  onFastTravel: (x: number, z: number) => void;
  onLaunchEvent: (evt: RaceEvent) => void;
}

const WORLD_LOOP_PATH = (() => {
  const parts: string[] = [];
  for (let i = 0; i < TRACK_STATIONS.length; i += 2) {
    const st = TRACK_STATIONS[i];
    parts.push(`${i === 0 ? 'M' : 'L'}${st.x.toFixed(1)},${st.z.toFixed(1)}`);
  }
  parts.push('Z');
  return parts.join(' ');
})();

const BRIDGE_LOOP_PATH = (() => {
  const pts = TRACK_STATIONS.filter((st) => st.isBridge);
  return pts
    .map((st, idx) => `${idx === 0 ? 'M' : 'L'}${st.x.toFixed(1)},${st.z.toFixed(1)}`)
    .join(' ');
})();

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  save,
  playerX,
  playerZ,
  playerHeading,
  onlinePlayers = [],
  onClose,
  onFastTravel,
  onLaunchEvent,
}) => {
  const [selectedRegion, setSelectedRegion] = useState<RegionInfo>(REGIONS[0]);
  const [selectedLandmark, setSelectedLandmark] = useState<MapLandmark | null>(
    null,
  );
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);

  const toMapPct = (val: number) =>
    ((val + WORLD_HALF_SIZE) / (WORLD_HALF_SIZE * 2)) * 100;

  return (
    <div className="fixed inset-0 z-40 bg-[#07080b]/95 flex flex-col p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              audioEngine.playUiClick();
              onClose();
            }}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-display tracking-wider text-slate-100 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-rose-500" />
            CLOSE MAP
          </button>
          <div>
            <div className="text-[10px] font-display tracking-[0.28em] text-rose-500 uppercase">
              COASTAL-TO-MOUNTAIN LOOP GPS
            </div>
            <h2 className="font-display text-xl font-bold text-slate-100">
              4 ZONES ({save.unlockedRegions.length}/4 DISCOVERED)
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] font-display text-slate-300">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-sky-400 inline-block" /> GARAGE
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-amber-400 inline-block" /> DEALERSHIP
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-purple-400 inline-block" /> CUSTOMS
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-rose-500 inline-block" /> EVENTS
          </span>
          {onlinePlayers.length > 0 && (
            <span className="flex items-center gap-1 text-emerald-300">
              <span className="w-2.5 h-2.5 bg-emerald-400 inline-block rounded-full" />{' '}
              PLAYERS ({onlinePlayers.length})
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-2 relative bg-[#081d2c] border border-slate-800 overflow-hidden min-h-[300px]">
          <svg
            viewBox={`-${WORLD_HALF_SIZE} -${WORLD_HALF_SIZE} ${WORLD_HALF_SIZE * 2} ${WORLD_HALF_SIZE * 2}`}
            className="w-full h-full"
          >
            {/* Coastal Peninsula Landmass Silhouette */}
            <path
              d="M -585,-640 Q -570,-120 -585,480 L -240,480 Q 45,270 330,480 L 760,520 Q 820,-200 740,-680 Q 120,-780 -585,-640 Z"
              fill="#192822"
              stroke="#2c4438"
              strokeWidth={12}
            />

            {/* Main Closed Spline Highway Loop */}
            <path
              d={WORLD_LOOP_PATH}
              fill="none"
              stroke="#475569"
              strokeWidth={34}
              strokeLinejoin="round"
            />
            <path
              d={WORLD_LOOP_PATH}
              fill="none"
              stroke="#cbd5e1"
              strokeOpacity={0.4}
              strokeWidth={4}
              strokeDasharray="18 18"
            />

            {/* Fujimi Bay Suspension Bridge Highlight */}
            <path
              d={BRIDGE_LOOP_PATH}
              fill="none"
              stroke="#e11d48"
              strokeWidth={22}
              strokeLinecap="round"
            />

            {/* 4 Zone Badges */}
            {REGIONS.map((reg) => {
              const pt = getRoadPointAt(reg.spawnS, 0);
              return (
                <g
                  key={reg.id}
                  onClick={() => {
                    audioEngine.playUiClick();
                    setSelectedRegion(reg);
                    setSelectedLandmark(null);
                    setSelectedEvent(null);
                  }}
                  className="cursor-pointer"
                >
                  <circle
                    cx={pt.x}
                    cy={pt.z}
                    r={68}
                    fill={reg.accentColor}
                    fillOpacity={0.14}
                    stroke={reg.accentColor}
                    strokeWidth={5}
                  />
                  <text
                    x={pt.x}
                    y={pt.z - 86}
                    textAnchor="middle"
                    fill={reg.accentColor}
                    fontSize="44"
                    fontWeight="bold"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {reg.code}. {reg.name}
                  </text>
                </g>
              );
            })}

            {/* Remote Online Players */}
            {onlinePlayers.map((op) => (
              <g key={op.uid} transform={`translate(${op.x}, ${op.z})`}>
                <circle
                  r={34}
                  fill="#10b981"
                  fillOpacity={0.28}
                  stroke="#34d399"
                  strokeWidth={5}
                />
                <circle r={16} fill="#10b981" stroke="#ffffff" strokeWidth={4} />
                <text
                  x={0}
                  y={-42}
                  textAnchor="middle"
                  fill="#a7f3d0"
                  fontSize="36"
                  fontWeight="bold"
                  fontFamily="Chakra Petch, sans-serif"
                >
                  {op.googleDisplayName}
                </text>
              </g>
            ))}

            {/* Player Arrow */}
            <g
              transform={`translate(${playerX}, ${playerZ}) rotate(${
                (-playerHeading * 180) / Math.PI
              })`}
            >
              <circle r={42} fill="#e11d48" fillOpacity={0.28} />
              <polygon
                points="0,24 -16,-14 0,-6 16,-14"
                fill="#f8fafc"
                stroke="#e11d48"
                strokeWidth={5}
              />
            </g>
          </svg>

          {MAP_LANDMARKS.map((lm) => {
            const bg =
              lm.type === 'garage'
                ? 'bg-sky-500'
                : lm.type === 'dealership'
                  ? 'bg-amber-500'
                  : lm.type === 'custom_shop'
                    ? 'bg-purple-500'
                    : 'bg-emerald-500';
            return (
              <button
                key={lm.id}
                onClick={() => {
                  audioEngine.playUiClick();
                  setSelectedLandmark(lm);
                  setSelectedEvent(null);
                }}
                title={lm.name}
                style={{
                  left: `${toMapPct(lm.x)}%`,
                  top: `${toMapPct(lm.z)}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 ${bg} border border-white text-white flex items-center justify-center hover:scale-125 transition-transform cursor-pointer`}
              >
                {lm.type === 'garage' ? (
                  <Warehouse className="w-3 h-3" />
                ) : lm.type === 'dealership' ? (
                  <ShoppingBag className="w-3 h-3" />
                ) : lm.type === 'custom_shop' ? (
                  <Wrench className="w-3 h-3" />
                ) : (
                  <MapPin className="w-3 h-3" />
                )}
              </button>
            );
          })}

          {RACE_EVENTS.map((evt) => {
            const wp = getRoadPointAt(evt.startS, 0);
            return (
              <button
                key={evt.id}
                onClick={() => {
                  audioEngine.playUiClick();
                  setSelectedEvent(evt);
                  setSelectedLandmark(null);
                }}
                title={evt.title}
                style={{
                  left: `${toMapPct(wp.x)}%`,
                  top: `${toMapPct(wp.z)}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-rose-600 border border-amber-300 text-white flex items-center justify-center hover:scale-125 transition-transform cursor-pointer"
              >
                <Flag className="w-3 h-3" />
              </button>
            );
          })}
        </div>

        {/* Right Panel */}
        <div className="bg-[#0d1017] border border-slate-800 p-4 flex flex-col justify-between overflow-y-auto space-y-4">
          {selectedEvent ? (
            <div className="space-y-3">
              <div className="text-[10px] font-display tracking-widest text-rose-500 uppercase">
                RACE EVENT SELECTED
              </div>
              <h3 className="font-display text-xl font-bold text-slate-100">
                {selectedEvent.title}
              </h3>
              <p className="text-xs text-slate-400">{selectedEvent.subtitle}</p>
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/80 p-3 border border-slate-800">
                <div>
                  <span className="text-slate-500">REWARD:</span>{' '}
                  <span className="text-emerald-400 font-mono-num font-bold">
                    ${selectedEvent.rewardCash.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">DIFFICULTY:</span>{' '}
                  <span className="text-slate-200">{selectedEvent.difficulty}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onLaunchEvent(selectedEvent);
                }}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-widest text-xs py-3 cursor-pointer"
              >
                START EVENT NOW
              </button>
            </div>
          ) : selectedLandmark ? (
            <div className="space-y-3">
              <div className="text-[10px] font-display tracking-widest text-sky-400 uppercase">
                {selectedLandmark.type.replace('_', ' ')}
              </div>
              <h3 className="font-display text-xl font-bold text-slate-100">
                {selectedLandmark.name}
              </h3>
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  onFastTravel(selectedLandmark.x, selectedLandmark.z);
                }}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-widest text-xs py-3 cursor-pointer"
              >
                <Navigation className="w-4 h-4" />
                FAST TRAVEL HERE
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-[10px] font-display tracking-widest text-rose-500 uppercase">
                ZONE {selectedRegion.code}
              </div>
              <h3 className="font-display text-xl font-bold text-slate-100">
                {selectedRegion.name}
              </h3>
              <div className="text-xs font-display text-slate-400">
                {selectedRegion.subtitle}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedRegion.description}
              </p>
              <button
                onClick={() => {
                  audioEngine.playUiClick();
                  const pt = getRoadPointAt(selectedRegion.spawnS, 0);
                  onFastTravel(pt.x, pt.z);
                }}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-widest text-xs py-3 cursor-pointer"
              >
                <Navigation className="w-4 h-4" />
                FAST TRAVEL TO {selectedRegion.name}
              </button>
            </div>
          )}

          <div className="border-t border-slate-800 pt-3 space-y-1.5">
            <div className="text-[10px] font-display tracking-widest text-slate-500">
              LOOP ZONES
            </div>
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRegion(r);
                  setSelectedLandmark(null);
                  setSelectedEvent(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-display border cursor-pointer ${
                  selectedRegion.id === r.id
                    ? 'bg-slate-800 border-rose-500 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <span>
                  {r.code}. {r.name}
                </span>
                <span className="text-[10px] text-slate-500">
                  {save.unlockedRegions.includes(r.id) ? 'DISCOVERED' : 'UNEXPLORED'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
