import { CAR_CATALOG } from './cars';
import {
  DailyLoginState,
  DailyPrizeTier,
  PlayerSaveData,
  QuestDefinition,
  QuestId,
} from '../types/game';

export const STARTING_MONEY = 5000;
export const STARTING_FUMA_SHARDS = 5;
export const CONTINUOUS_PLAY_TARGET_SEC = 3 * 60 * 60; // 3 hours = 10,800s

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'drift_10s_no_brake',
    title: 'Drift 10 Seconds Without Brakes',
    description:
      'Hold a continuous drift for 10 seconds without pressing the brake.',
    rewardShards: 5,
    target: 10,
  },
  {
    id: 'earn_120k',
    title: 'Earn $120,000',
    description:
      'Earn a cumulative $120,000 from races, free roam, and daily rewards.',
    rewardShards: 4,
    target: 120000,
  },
  {
    id: 'buy_all_cars',
    title: 'Buy All Game Cars',
    description: 'Own every vehicle available in the dealership.',
    rewardShards: 5,
    target: CAR_CATALOG.length,
  },
  {
    id: 'collect_50_shards',
    title: 'Collect 50 Fuma Shards',
    description: 'Gather a total of 50 Fuma Shards across quests and login prizes.',
    rewardShards: 3,
    target: 50,
  },
  {
    id: 'upgrade_all_cars_max',
    title: 'Upgrade All Cars to Max',
    description:
      'Own every car in the game and upgrade all 6 performance parts on each to Level 3.',
    rewardShards: 6,
    target: CAR_CATALOG.length,
  },
  {
    id: 'play_3h_continuous',
    title: 'Play Continuously for 3 Hours',
    description: 'Keep playing in a single continuous session for 3 hours.',
    rewardShards: 6,
    target: CONTINUOUS_PLAY_TARGET_SEC,
  },
];

export const DAILY_LOGIN_PRIZES: DailyPrizeTier[] = [
  { day: 1, cash: 2500, shards: 2, label: 'Day 1 · Starter Bonus' },
  { day: 2, cash: 5000, shards: 3, label: 'Day 2 · Street Boost' },
  { day: 3, cash: 8000, shards: 4, label: 'Day 3 · Drift Pack' },
  { day: 4, cash: 12000, shards: 5, label: 'Day 4 · Turbo Crate' },
  { day: 5, cash: 18000, shards: 6, label: 'Day 5 · Apex Reserve' },
  { day: 6, cash: 25000, shards: 8, label: 'Day 6 · Pro Payout' },
  { day: 7, cash: 40000, shards: 12, label: 'Day 7 · Grand Jackpot' },
];

export function formatLocalDateKey(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getYesterdayDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDateKey(d);
}

export function getDailyLoginStatus(daily: DailyLoginState): {
  canClaimToday: boolean;
  claimedToday: boolean;
  claimableDay: number; // 1..7
} {
  const today = formatLocalDateKey();
  const yesterday = getYesterdayDateKey();

  if (daily.lastClaimDate === today) {
    return {
      canClaimToday: false,
      claimedToday: true,
      claimableDay: Math.max(1, Math.min(7, daily.streakDay || 1)),
    };
  }

  const nextDay =
    daily.lastClaimDate === yesterday && daily.streakDay > 0
      ? (daily.streakDay % 7) + 1
      : 1;

  return {
    canClaimToday: true,
    claimedToday: false,
    claimableDay: nextDay,
  };
}

export function countMaxUpgradedGameCars(save: PlayerSaveData): number {
  let maxed = 0;
  for (const spec of CAR_CATALOG) {
    const owned = save.ownedCars[spec.id];
    if (!owned) continue;
    const u = owned.upgrades;
    if (
      u.engine >= 3 &&
      u.turbo >= 3 &&
      u.tires >= 3 &&
      u.suspension >= 3 &&
      u.brakes >= 3 &&
      u.nitro >= 3
    ) {
      maxed += 1;
    }
  }
  return maxed;
}

export function formatDurationHms(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface QuestProgressItem {
  quest: QuestDefinition;
  progress: number;
  progressText: string;
  pct: number;
  completed: boolean;
  claimed: boolean;
}

export function computeQuestStatuses(
  save: PlayerSaveData,
  sessionPlaySec = 0,
): QuestProgressItem[] {
  const claimedSet = new Set<QuestId>(save.claimedQuests ?? []);
  const ownedCount = Object.keys(save.ownedCars).length;
  const maxedCars = countMaxUpgradedGameCars(save);
  const driftSec = save.bestNoBrakeDriftSec ?? 0;
  const earnedCash = save.totalCashEarned ?? 0;
  const collectedShards = Math.max(
    save.totalFumaShardsCollected ?? 0,
    save.fumaShards ?? 0,
  );
  const continuousSec = Math.max(
    save.bestContinuousPlaySec ?? 0,
    sessionPlaySec,
  );

  return QUEST_DEFINITIONS.map((quest) => {
    let raw = 0;
    let progressText = '';

    switch (quest.id) {
      case 'drift_10s_no_brake':
        raw = driftSec;
        progressText = `${Math.min(quest.target, driftSec).toFixed(1)}s / ${quest.target}s`;
        break;
      case 'earn_120k':
        raw = earnedCash;
        progressText = `$${Math.min(quest.target, Math.round(earnedCash)).toLocaleString()} / $${quest.target.toLocaleString()}`;
        break;
      case 'buy_all_cars':
        raw = ownedCount;
        progressText = `${Math.min(quest.target, ownedCount)} / ${quest.target} Cars`;
        break;
      case 'collect_50_shards':
        raw = collectedShards;
        progressText = `${Math.min(quest.target, collectedShards)} / ${quest.target} Shards`;
        break;
      case 'upgrade_all_cars_max':
        raw = maxedCars;
        progressText = `${Math.min(quest.target, maxedCars)} / ${quest.target} Cars Maxed`;
        break;
      case 'play_3h_continuous':
        raw = continuousSec;
        progressText = `${formatDurationHms(Math.min(quest.target, continuousSec))} / 03:00:00`;
        break;
    }

    const clamped = Math.min(quest.target, Math.max(0, raw));
    const pct = Math.min(100, Math.round((clamped / quest.target) * 100));
    const completed = raw >= quest.target;
    const claimed = claimedSet.has(quest.id);

    return {
      quest,
      progress: clamped,
      progressText,
      pct,
      completed,
      claimed,
    };
  });
}
