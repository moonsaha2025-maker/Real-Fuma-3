import { useCallback, useEffect, useState } from 'react';
import {
  CAR_CATALOG,
  getCarSpec,
  getDefaultCustomization,
  getDefaultUpgrades,
  RANK_INFO,
  RANK_ORDER,
  UPGRADE_COSTS,
} from '../data/cars';
import { ACHIEVEMENTS_LIST, DEFAULT_LEADERBOARD, REGIONS } from '../data/world';
import {
  CarCustomization,
  CarUpgrades,
  CareerRankId,
  GameSettings,
  OwnedCarData,
  PlayerSaveData,
  RaceResultSummary,
  RegionId,
} from '../types/game';

const STORAGE_KEY = 'real_fuma_save_v2';

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsPreset: 'HIGH',
  controlScheme:
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      ? 'buttons'
      : 'keyboard',
  transmission: 'auto',
  abs: true,
  tractionControl: true,
  steeringSensitivity: 1.0,
  touchButtonScale: 1.0,
  masterVolume: 0.75,
  engineVolume: 0.85,
  sfxVolume: 0.8,
  muted: false,
  cameraShake: true,
  units: 'KMH',
};

function createInitialSaveData(): PlayerSaveData {
  const starter = CAR_CATALOG[0]; // Woking 765LT Spider (Coastal Blue #0284c7)
  return {
    driverName: 'FUMA_RACER',
    money: 60000,
    xp: 0,
    reputation: 0,
    rank: 'rookie',
    activeCarId: starter.id,
    ownedCars: {
      [starter.id]: {
        carId: starter.id,
        customization: getDefaultCustomization(starter),
        upgrades: getDefaultUpgrades(),
        mileageKm: 0,
      },
    },
    completedEvents: [],
    unlockedRegions: ['sunset_coast'],
    achievements: [],
    stats: {
      racesCompleted: 0,
      racesWon: 0,
      totalDistanceKm: 0,
      topSpeedKmh: 0,
      totalDriftScore: 0,
    },
    recentResults: [],
    leaderboard: DEFAULT_LEADERBOARD,
    settings: DEFAULT_SETTINGS,
  };
}

function loadSaveData(): PlayerSaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialSaveData();
    const parsed = JSON.parse(raw) as Partial<PlayerSaveData>;
    const base = createInitialSaveData();

    const validRegionIds = new Set(REGIONS.map((r) => r.id));
    const parsedRegions = Array.isArray(parsed.unlockedRegions)
      ? parsed.unlockedRegions.filter((id): id is RegionId =>
          validRegionIds.has(id as RegionId),
        )
      : [];

    const validCarIds = new Set(CAR_CATALOG.map((c) => c.id));
    const mergedOwned: Record<string, OwnedCarData> = {};
    if (parsed.ownedCars) {
      for (const [k, v] of Object.entries(parsed.ownedCars)) {
        if (validCarIds.has(k) && v) {
          mergedOwned[k] = v;
        }
      }
    }
    const ownedCars =
      Object.keys(mergedOwned).length > 0 ? mergedOwned : base.ownedCars;

    const activeCarId =
      parsed.activeCarId && ownedCars[parsed.activeCarId]
        ? parsed.activeCarId
        : Object.keys(ownedCars)[0];

    return {
      ...base,
      ...parsed,
      activeCarId,
      ownedCars,
      unlockedRegions:
        parsedRegions.length > 0 ? parsedRegions : base.unlockedRegions,
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      leaderboard:
        parsed.leaderboard && parsed.leaderboard.length > 0
          ? parsed.leaderboard
          : base.leaderboard,
    };
  } catch {
    return createInitialSaveData();
  }
}

export function computeRankFromProgress(xp: number, rep: number): CareerRankId {
  let achieved: CareerRankId = 'rookie';
  for (const r of RANK_ORDER) {
    const info = RANK_INFO[r];
    if (xp >= info.minXp && rep >= info.minRep) {
      achieved = r;
    }
  }
  return achieved;
}

export function useGameStore() {
  const [save, setSave] = useState<PlayerSaveData>(() => loadSaveData());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
      // Ignore storage quota errors
    }
  }, [save]);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSave((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const setDriverName = useCallback((name: string) => {
    const clean = name.trim().slice(0, 18) || 'FUMA_RACER';
    setSave((prev) => ({ ...prev, driverName: clean }));
  }, []);

  const selectCar = useCallback((carId: string) => {
    setSave((prev) => {
      if (!prev.ownedCars[carId]) return prev;
      return { ...prev, activeCarId: carId };
    });
  }, []);

  const buyCar = useCallback((carId: string): { ok: boolean; reason?: string } => {
    const spec = getCarSpec(carId);
    let result: { ok: boolean; reason?: string } = { ok: false };
    setSave((prev) => {
      if (prev.ownedCars[carId]) {
        result = { ok: true };
        return { ...prev, activeCarId: carId };
      }
      if (RANK_ORDER.indexOf(prev.rank) < RANK_ORDER.indexOf(spec.unlockRank)) {
        result = {
          ok: false,
          reason: `Requires ${RANK_INFO[spec.unlockRank].label} rank`,
        };
        return prev;
      }
      if (prev.money < spec.price) {
        result = { ok: false, reason: 'Insufficient credits' };
        return prev;
      }
      const newOwned: OwnedCarData = {
        carId,
        customization: getDefaultCustomization(spec),
        upgrades: getDefaultUpgrades(),
        mileageKm: 0,
      };
      const ownedCount = Object.keys(prev.ownedCars).length + 1;
      const newAchievements = [...prev.achievements];
      let bonusCash = 0;
      if (ownedCount >= 3 && !newAchievements.includes('collector_3')) {
        newAchievements.push('collector_3');
        bonusCash += 30000;
      }
      result = { ok: true };
      return {
        ...prev,
        money: prev.money - spec.price + bonusCash,
        activeCarId: carId,
        ownedCars: { ...prev.ownedCars, [carId]: newOwned },
        achievements: newAchievements,
      };
    });
    return result;
  }, []);

  const updateCarCustomization = useCallback(
    (carId: string, patch: Partial<CarCustomization>) => {
      setSave((prev) => {
        const car = prev.ownedCars[carId];
        if (!car) return prev;
        return {
          ...prev,
          ownedCars: {
            ...prev.ownedCars,
            [carId]: {
              ...car,
              customization: { ...car.customization, ...patch },
            },
          },
        };
      });
    },
    [],
  );

  const buyUpgrade = useCallback(
    (carId: string, part: keyof CarUpgrades): boolean => {
      let success = false;
      setSave((prev) => {
        const car = prev.ownedCars[carId];
        if (!car) return prev;
        const currentLvl = car.upgrades[part];
        if (currentLvl >= 3) return prev;
        const cost = UPGRADE_COSTS[currentLvl + 1];
        if (prev.money < cost) return prev;
        success = true;
        return {
          ...prev,
          money: prev.money - cost,
          ownedCars: {
            ...prev.ownedCars,
            [carId]: {
              ...car,
              upgrades: { ...car.upgrades, [part]: currentLvl + 1 },
            },
          },
        };
      });
      return success;
    },
    [],
  );

  const unlockRegion = useCallback((regionId: RegionId) => {
    setSave((prev) => {
      if (prev.unlockedRegions.includes(regionId)) return prev;
      const unlocked = [...prev.unlockedRegions, regionId];
      const newAch = [...prev.achievements];
      let bonus = 0;
      if (unlocked.length >= 4 && !newAch.includes('world_explorer')) {
        newAch.push('world_explorer');
        bonus += 25000;
      }
      return {
        ...prev,
        money: prev.money + bonus,
        unlockedRegions: unlocked,
        achievements: newAch,
      };
    });
  }, []);

  const recordRaceResult = useCallback((summary: RaceResultSummary) => {
    setSave((prev) => {
      const nextXp = prev.xp + summary.xpEarned;
      const nextRep = prev.reputation + summary.repEarned;
      const nextRank = computeRankFromProgress(nextXp, nextRep);

      const newCompleted =
        summary.won && !prev.completedEvents.includes(summary.eventId)
          ? [...prev.completedEvents, summary.eventId]
          : prev.completedEvents;

      const newTopSpeed = Math.max(prev.stats.topSpeedKmh, summary.topSpeedKmh);
      const newDriftTotal = prev.stats.totalDriftScore + summary.driftScore;

      const newAch = [...prev.achievements];
      let achBonus = 0;
      const grant = (id: string) => {
        if (!newAch.includes(id)) {
          newAch.push(id);
          const found = ACHIEVEMENTS_LIST.find((a) => a.id === id);
          if (found) achBonus += found.rewardCash;
        }
      };
      if (summary.won) grant('first_win');
      if (newTopSpeed >= 300) grant('speed_300');
      if (newTopSpeed >= 400) grant('speed_400');
      if (newDriftTotal >= 25000) grant('drift_master');

      const activeSpec = getCarSpec(prev.activeCarId);
      const newLeaderboard = [
        ...prev.leaderboard,
        {
          id: `lb_${Date.now()}`,
          driverName: prev.driverName,
          carName: activeSpec.name,
          eventTitle: summary.eventTitle,
          timeSec: Math.round(summary.timeSec * 10) / 10,
          score:
            summary.driftScore > 0
              ? summary.driftScore
              : Math.round(summary.xpEarned * 25 + (summary.won ? 20000 : 5000)),
          isPlayer: true,
        },
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

      return {
        ...prev,
        money: prev.money + summary.cashEarned + achBonus,
        xp: nextXp,
        reputation: nextRep,
        rank: nextRank,
        completedEvents: newCompleted,
        achievements: newAch,
        stats: {
          ...prev.stats,
          racesCompleted: prev.stats.racesCompleted + 1,
          racesWon: prev.stats.racesWon + (summary.won ? 1 : 0),
          topSpeedKmh: newTopSpeed,
          totalDriftScore: newDriftTotal,
        },
        recentResults: [summary, ...prev.recentResults].slice(0, 20),
        leaderboard: newLeaderboard,
      };
    });
  }, []);

  const addFreeRoamRewards = useCallback(
    (
      cash: number,
      xp: number,
      rep: number,
      distanceKm: number,
      topSpeed: number,
      driftPts: number,
    ) => {
      setSave((prev) => {
        const nextXp = prev.xp + xp;
        const nextRep = prev.reputation + rep;
        const nextRank = computeRankFromProgress(nextXp, nextRep);
        const activeOwned = prev.ownedCars[prev.activeCarId];
        return {
          ...prev,
          money: prev.money + cash,
          xp: nextXp,
          reputation: nextRep,
          rank: nextRank,
          ownedCars: activeOwned
            ? {
                ...prev.ownedCars,
                [prev.activeCarId]: {
                  ...activeOwned,
                  mileageKm: activeOwned.mileageKm + distanceKm,
                },
              }
            : prev.ownedCars,
          stats: {
            ...prev.stats,
            totalDistanceKm: prev.stats.totalDistanceKm + distanceKm,
            topSpeedKmh: Math.max(prev.stats.topSpeedKmh, topSpeed),
            totalDriftScore: prev.stats.totalDriftScore + driftPts,
          },
        };
      });
    },
    [],
  );

  const resetProgress = useCallback(() => {
    const fresh = createInitialSaveData();
    setSave(fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  }, []);

  const activeCarData: OwnedCarData =
    save.ownedCars[save.activeCarId] ?? Object.values(save.ownedCars)[0];

  return {
    save,
    activeCarData,
    updateSettings,
    setDriverName,
    selectCar,
    buyCar,
    updateCarCustomization,
    buyUpgrade,
    unlockRegion,
    recordRaceResult,
    addFreeRoamRewards,
    resetProgress,
  };
}
