import {
  Achievement,
  LeaderboardEntry,
  MapLandmark,
  RaceEvent,
  RegionId,
  RegionInfo,
} from '../types/game';
import { getRoadPointAt, projectOntoTrack } from './track';

export { WORLD_HALF_SIZE, getDriveSurfaceHeight, getSurfaceAt, getTerrainHeight } from './track';

export const REGIONS: RegionInfo[] = [
  {
    id: 'sunset_coast',
    code: '1',
    name: 'SUNSET COAST',
    subtitle: 'Oceanfront Palm Boulevard',
    description:
      'Sun-drenched Pacific coastal sweepers flanked by golden beaches, swaying palms, and sandstone bluffs.',
    spawnS: 0.06,
    accentColor: '#0ea5e9',
  },
  {
    id: 'palm_canyon',
    code: '2',
    name: 'PALM CANYON',
    subtitle: 'Banked Switchback Climb',
    description:
      'Fast banked canyon S-curves winding steadily upward from sea level through sun-warmed rock cuts.',
    spawnS: 0.34,
    accentColor: '#f59e0b',
  },
  {
    id: 'alpine_pass',
    code: '3',
    name: 'ALPINE PINE PASS',
    subtitle: 'High-Altitude Mountain Ridge',
    description:
      '42m elevation ridge framed by deep evergreen pine forests, stone tunnel portals, and sweeping apexes.',
    spawnS: 0.58,
    accentColor: '#22c55e',
  },
  {
    id: 'fujimi_bay',
    code: '4',
    name: 'FUJIMI BAY BRIDGE',
    subtitle: 'Glass Skyline & Cable Span',
    description:
      'Downhill glass-tower harbor approach leading onto the elevated suspension bridge spanning turquoise Fujimi Bay.',
    spawnS: 0.84,
    accentColor: '#e11d48',
  },
];

export function getRegionAt(x: number, z: number, hintIdx?: number): RegionInfo {
  const proj = projectOntoTrack(x, z, hintIdx);
  return REGIONS.find((r) => r.id === proj.station.zoneId) ?? REGIONS[0];
}

function makeLandmark(
  id: string,
  name: string,
  type: MapLandmark['type'],
  regionId: RegionId,
  s: number,
  lateral = 5.5,
): MapLandmark {
  const pt = getRoadPointAt(s, lateral);
  return { id, name, type, regionId, s, x: pt.x, z: pt.z };
}

export const MAP_LANDMARKS: MapLandmark[] = [
  makeLandmark('lm_coast_hub', 'SUNSET COAST OVERLOOK GARAGE', 'garage', 'sunset_coast', 0.075, 4.5),
  makeLandmark('lm_canyon_custom', 'PALM CANYON TUNING STOP', 'custom_shop', 'palm_canyon', 0.32, 4.5),
  makeLandmark('lm_alpine_summit', 'ALPINE RIDGE SUMMIT', 'fast_travel', 'alpine_pass', 0.56, 0),
  makeLandmark('lm_bay_dealer', 'FUJIMI HARBOR EXOTICS', 'dealership', 'fujimi_bay', 0.77, 4.5),
  makeLandmark('lm_bay_bridge', 'FUJIMI BAY BRIDGE SPAN', 'fast_travel', 'fujimi_bay', 0.845, 0),
];

function buildLoopCheckpoints(startS: number, count = 12): number[] {
  const arr: number[] = [];
  for (let i = 1; i <= count; i++) {
    arr.push((startS + i / count) % 1);
  }
  return arr;
}

export const RACE_EVENTS: RaceEvent[] = [
  {
    id: 'evt_coastal_gp',
    title: 'SUNSET COAST GRAND CIRCUIT',
    subtitle: 'Full 3.8 km Coastal-to-Mountain Loop Championship',
    mode: 'circuit',
    regionId: 'sunset_coast',
    difficulty: 'Medium',
    requiredRank: 'rookie',
    startS: 0.07,
    laps: 2,
    aiCount: 4,
    rewardCash: 35000,
    rewardXp: 950,
    rewardRep: 420,
    defaultWeather: 'sunny',
    defaultTime: 'day',
    checkpointsS: buildLoopCheckpoints(0.07, 16),
  },
  {
    id: 'evt_canyon_drift',
    title: 'PALM CANYON DRIFT ATTACK',
    subtitle: 'Chain 10,000+ Drift Points Through Switchback Hairpins',
    mode: 'drift',
    regionId: 'palm_canyon',
    difficulty: 'Medium',
    requiredRank: 'rookie',
    startS: 0.28,
    laps: 1,
    aiCount: 0,
    rewardCash: 28000,
    rewardXp: 820,
    rewardRep: 380,
    defaultWeather: 'sunny',
    defaultTime: 'sunset',
    targetDriftScore: 10000,
    checkpointsS: [0.34, 0.40, 0.46, 0.52, 0.58, 0.64],
  },
  {
    id: 'evt_alpine_time_trial',
    title: 'ALPINE PASS TIME TRIAL',
    subtitle: 'Clock Under 88s Around the High-Speed Peninsula Loop',
    mode: 'time_attack',
    regionId: 'alpine_pass',
    difficulty: 'Hard',
    requiredRank: 'street',
    startS: 0.52,
    laps: 1,
    aiCount: 0,
    rewardCash: 45000,
    rewardXp: 1200,
    rewardRep: 550,
    defaultWeather: 'sunny',
    defaultTime: 'day',
    targetTimeSec: 88,
    checkpointsS: buildLoopCheckpoints(0.52, 16),
  },
  {
    id: 'evt_fujimi_sprint',
    title: 'FUJIMI BAY BRIDGE SPRINT',
    subtitle: 'Sunset Expressway Dash Across the Suspension Bridge',
    mode: 'sprint',
    regionId: 'fujimi_bay',
    difficulty: 'Hard',
    requiredRank: 'street',
    startS: 0.72,
    laps: 1,
    aiCount: 4,
    rewardCash: 48000,
    rewardXp: 1350,
    rewardRep: 620,
    defaultWeather: 'sunny',
    defaultTime: 'sunset',
    checkpointsS: [0.78, 0.84, 0.90, 0.96, 0.04, 0.12, 0.20],
  },
  {
    id: 'evt_midnight_rival',
    title: 'MIDNIGHT HARBOR RIVAL DUEL',
    subtitle: '1v1 Touge Finale Under Fujimi City Lights',
    mode: 'rival_battle',
    regionId: 'fujimi_bay',
    difficulty: 'Extreme',
    requiredRank: 'pro',
    startS: 0.88,
    laps: 2,
    aiCount: 1,
    rewardCash: 85000,
    rewardXp: 2400,
    rewardRep: 1100,
    defaultWeather: 'cloudy',
    defaultTime: 'night',
    checkpointsS: buildLoopCheckpoints(0.88, 16),
  },
];

export const ACHIEVEMENTS_LIST: Omit<Achievement, 'unlocked'>[] = [
  { id: 'first_win', title: 'Coastal Champion', description: 'Win your first race on the REAL FUMA loop.', rewardCash: 15000 },
  { id: 'speed_300', title: '300 KM/H Club', description: 'Break 300 km/h on the coastal highway or bay bridge.', rewardCash: 20000 },
  { id: 'speed_400', title: 'Hyper Velocity', description: 'Surpass 400 km/h in a tuned hypercar.', rewardCash: 50000 },
  { id: 'drift_master', title: 'Sideways Artist', description: 'Accumulate 25,000 total drift points.', rewardCash: 25000 },
  { id: 'collector_3', title: 'Paddock Collector', description: 'Own 3 or more cars in your garage.', rewardCash: 30000 },
  { id: 'world_explorer', title: 'Peninsula Tourer', description: 'Discover all 4 zones of the highway loop.', rewardCash: 25000 },
];

export const DEFAULT_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'lb1', driverName: 'K. Takahashi', carName: 'Angelholm Jesko Absolut', eventTitle: 'ALPINE PASS TIME TRIAL', timeSec: 69.4, score: 98500 },
  { id: 'lb2', driverName: 'Elena Rossi', carName: 'Maranello F90 Stradale', eventTitle: 'SUNSET COAST GRAND CIRCUIT', timeSec: 74.2, score: 88200 },
  { id: 'lb3', driverName: 'Akira Kage', carName: 'Woking 765LT Spider', eventTitle: 'FUJIMI BAY BRIDGE SPRINT', timeSec: 46.8, score: 79400 },
  { id: 'lb4', driverName: 'Kenji Drift', carName: 'FUMA RZ-5 Supra', eventTitle: 'PALM CANYON DRIFT ATTACK', timeSec: 0, score: 24500 },
];
