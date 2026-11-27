export type CarCategory = 'SUPERCARS' | 'SPORTS';

export type Drivetrain = 'RWD' | 'AWD';

export type PaintFinish = 'gloss' | 'metallic' | 'matte';

export type GraphicsPreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export type ControlScheme = 'buttons' | 'wheel' | 'tilt' | 'keyboard';

export type TransmissionMode = 'auto' | 'manual';

export type CameraMode = 'chase' | 'far' | 'hood' | 'cockpit' | 'bumper' | 'cinematic';

export type TrafficDensity = 'off' | 'low' | 'normal' | 'high';

export type WeatherType =
  | 'sunny'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'fog';

export type TimeOfDay = 'sunrise' | 'day' | 'sunset' | 'night';

export type RadioStationId =
  | 'off'
  | 'horizon_fm'
  | 'apex_bass'
  | 'lofi_sunset'
  | 'hyper_euro';

export type RegionId =
  | 'sunset_coast'
  | 'palm_canyon'
  | 'alpine_pass'
  | 'fujimi_bay';

export type RaceMode =
  | 'circuit'
  | 'drift'
  | 'time_attack'
  | 'sprint'
  | 'rival_battle'
  | 'free_roam';

export type CareerRankId =
  | 'rookie'
  | 'street'
  | 'pro'
  | 'elite'
  | 'legend';

export type ScreenState =
  | 'loading'
  | 'onboarding'
  | 'main_menu'
  | 'playing'
  | 'online'
  | 'garage'
  | 'dealership'
  | 'customization'
  | 'career'
  | 'quick_race'
  | 'settings'
  | 'profile';

export interface CarBaseSpec {
  id: string;
  name: string;
  brand: string;
  inspiredBy: string;
  category: CarCategory;
  price: number;
  unlockRank: CareerRankId;
  drivetrain: Drivetrain;
  horsepower: number;
  topSpeedKmh: number;
  massKg: number;
  accelZeroToHundred: number;
  handlingRating: number;
  brakingRating: number;
  engineSoundProfile: 'v12' | 'v10' | 'v8' | 'i6_turbo';
  defaultColor: string;
  bodyStyle: 'hyper' | 'wedge' | 'jdm' | 'gt';
  dimensions: {
    length: number;
    width: number;
    height: number;
    wheelRadius: number;
    groundClearance: number;
  };
}

export interface CarCustomization {
  paintColor: string;
  paintFinish: PaintFinish;
  rimStyle: 'sport_5' | 'mesh_gt' | 'blade_aero';
  rimColor: string;
  spoiler: 'none' | 'lip' | 'gt_wing' | 'swan_neck';
  bodyKit: 'stock' | 'street' | 'widebody_gt';
  exhaust: 'dual' | 'quad' | 'titanium_center';
  neonColor: string;
  windowTint: number;
}

export interface CarUpgrades {
  engine: number;
  turbo: number;
  tires: number;
  suspension: number;
  brakes: number;
  nitro: number;
}

export interface OwnedCarData {
  carId: string;
  customization: CarCustomization;
  upgrades: CarUpgrades;
  mileageKm: number;
  dirtLevel?: number;
}

export interface RegionInfo {
  id: RegionId;
  code: string;
  name: string;
  subtitle: string;
  description: string;
  spawnS: number;
  accentColor: string;
}

export interface MapLandmark {
  id: string;
  name: string;
  type: 'garage' | 'dealership' | 'custom_shop' | 'fast_travel';
  regionId: RegionId;
  s: number;
  x: number;
  z: number;
}

export interface RaceEvent {
  id: string;
  title: string;
  subtitle: string;
  mode: RaceMode;
  regionId: RegionId;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme';
  requiredRank: CareerRankId;
  startS: number;
  laps: number;
  aiCount: number;
  rewardCash: number;
  rewardXp: number;
  rewardRep: number;
  defaultWeather: WeatherType;
  defaultTime: TimeOfDay;
  targetDriftScore?: number;
  targetTimeSec?: number;
  checkpointsS: number[];
}

export interface GameSettings {
  graphicsPreset: GraphicsPreset;
  controlScheme: ControlScheme;
  transmission: TransmissionMode;
  abs: boolean;
  tractionControl: boolean;
  steeringSensitivity: number;
  touchButtonScale: number;
  masterVolume: number;
  engineVolume: number;
  sfxVolume: number;
  radioVolume: number;
  radioStation: RadioStationId;
  muted: boolean;
  cameraShake: boolean;
  motionBlur: boolean;
  trafficDensity: TrafficDensity;
  autoFullscreen: boolean;
  units: 'KMH' | 'MPH';
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  rewardCash: number;
  unlocked: boolean;
}

export interface RaceResultSummary {
  eventId: string;
  eventTitle: string;
  mode: RaceMode;
  position: number;
  totalRacers: number;
  timeSec: number;
  bestLapSec: number;
  driftScore: number;
  topSpeedKmh: number;
  cashEarned: number;
  xpEarned: number;
  repEarned: number;
  won: boolean;
}

export interface LeaderboardEntry {
  id: string;
  driverName: string;
  carName: string;
  eventTitle: string;
  timeSec: number;
  score: number;
  isPlayer?: boolean;
}

export type QuestId =
  | 'drift_10s_no_brake'
  | 'earn_120k'
  | 'buy_all_cars'
  | 'collect_50_shards'
  | 'upgrade_all_cars_max'
  | 'play_3h_continuous';

export interface QuestDefinition {
  id: QuestId;
  title: string;
  description: string;
  rewardShards: number;
  target: number;
}

export interface DailyLoginState {
  lastClaimDate: string | null;
  streakDay: number;
}

export interface DailyPrizeTier {
  day: number;
  cash: number;
  shards: number;
  label: string;
}

export interface PlayerSaveData {
  driverName: string;
  driverAge?: number;
  onboarded?: boolean;
  money: number;
  fumaShards: number;
  totalFumaShardsCollected: number;
  totalCashEarned: number;
  bestNoBrakeDriftSec: number;
  bestContinuousPlaySec: number;
  claimedQuests: QuestId[];
  dailyLogin: DailyLoginState;
  xp: number;
  reputation: number;
  rank: CareerRankId;
  activeCarId: string;
  ownedCars: Record<string, OwnedCarData>;
  completedEvents: string[];
  unlockedRegions: RegionId[];
  achievements: string[];
  stats: {
    racesCompleted: number;
    racesWon: number;
    totalDistanceKm: number;
    topSpeedKmh: number;
    totalDriftScore: number;
  };
  recentResults: RaceResultSummary[];
  leaderboard: LeaderboardEntry[];
  settings: GameSettings;
}

export interface LiveTelemetry {
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  gear: number;
  nitro: number;
  nitroActive: boolean;
  driftAngleDeg: number;
  isDrifting: boolean;
  currentDriftPoints: number;
  totalDriftScore: number;
  headlightsOn: boolean;
  absActive: boolean;
  tcsActive: boolean;
  surface: 'asphalt' | 'dirt' | 'sand' | 'snow' | 'grass' | 'water';
  regionId: RegionId;
  regionName: string;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  trackProgress: number;
  raceState: 'free_roam' | 'countdown' | 'racing' | 'finished';
  countdownValue: number;
  racePosition: number;
  totalRacers: number;
  currentLap: number;
  totalLaps: number;
  checkpointIndex: number;
  totalCheckpoints: number;
  raceElapsedSec: number;
  nearLandmark: MapLandmark | null;
  nearEvent: RaceEvent | null;
  cameraMode: CameraMode;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  cycleTimeLabel: string;
  autoDayNightCycle: boolean;
  fps: number;
  dirtLevel: number;
  damageLevel: number;
  crashFlash: number;
  noBrakeDriftSec: number;
  opponents: Array<{ x: number; z: number; name: string }>;
  trafficPositions: Array<{ x: number; z: number }>;
  onlineMode?: boolean;
  onlineRoomId?: string | null;
  onlineRoomName?: string | null;
  onlinePlayers?: Array<{
    uid: string;
    googleDisplayName: string;
    googlePhotoURL: string;
    driverName: string;
    carName: string;
    x: number;
    z: number;
    heading: number;
    speedKmh: number;
  }>;
}

export interface OnlineRoom {
  roomId: string;
  name: string;
  hostUid: string;
  hostDisplayName: string;
  hostPhotoURL: string;
  isPublic: boolean;
  status: 'open' | 'active' | 'closed';
  regionId: RegionId;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  maxPlayers: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface OnlinePlayerState {
  uid: string;
  roomId: string;
  googleDisplayName: string;
  googlePhotoURL: string;
  driverName: string;
  rank: CareerRankId;
  carId: string;
  paintColor: string;
  paintFinish: PaintFinish;
  spoiler: CarCustomization['spoiler'];
  bodyKit: CarCustomization['bodyKit'];
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  speedKmh: number;
  steerAngle: number;
  braking: boolean;
  nitroActive: boolean;
  headlightsOn: boolean;
  s: number;
  updatedAtMs: number;
}

export interface ControlInputState {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  nitro: boolean;
}
