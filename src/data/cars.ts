import {
  CarBaseSpec,
  CarCustomization,
  CarUpgrades,
  CareerRankId,
} from '../types/game';

export const CAR_CATALOG: CarBaseSpec[] = [
  {
    id: 'mclaren_760s',
    name: 'Woking 765LT Spider',
    brand: 'McLaren-Inspired',
    inspiredBy: 'McLaren 765LT Spider',
    category: 'SUPERCARS',
    price: 0, // Flagship #1 Starter Supercar
    unlockRank: 'rookie',
    drivetrain: 'RWD',
    horsepower: 755,
    topSpeedKmh: 342,
    massKg: 1339,
    accelZeroToHundred: 2.7,
    handlingRating: 95,
    brakingRating: 94,
    engineSoundProfile: 'v8',
    defaultColor: '#0284c7',
    bodyStyle: 'hyper',
    dimensions: { length: 4.60, width: 1.96, height: 1.19, wheelRadius: 0.35, groundClearance: 0.11 },
  },
  {
    id: 'toyota_supra_mk5',
    name: 'FUMA RZ-5 Supra',
    brand: 'Toyota-Inspired',
    inspiredBy: 'Toyota Supra MK5',
    category: 'SPORTS',
    price: 42000,
    unlockRank: 'rookie',
    drivetrain: 'RWD',
    horsepower: 382,
    topSpeedKmh: 274,
    massKg: 1495,
    accelZeroToHundred: 3.9,
    handlingRating: 85,
    brakingRating: 82,
    engineSoundProfile: 'i6_turbo',
    defaultColor: '#e11d48',
    bodyStyle: 'jdm',
    dimensions: { length: 4.38, width: 1.88, height: 1.29, wheelRadius: 0.35, groundClearance: 0.13 },
  },
  {
    id: 'nissan_gtr_r35',
    name: 'FUMA R35 Godzilla GT',
    brand: 'Nissan-Inspired',
    inspiredBy: 'Nissan GT-R Nismo',
    category: 'SPORTS',
    price: 95000,
    unlockRank: 'rookie',
    drivetrain: 'AWD',
    horsepower: 600,
    topSpeedKmh: 315,
    massKg: 1725,
    accelZeroToHundred: 2.7,
    handlingRating: 89,
    brakingRating: 88,
    engineSoundProfile: 'i6_turbo',
    defaultColor: '#cbd5e1',
    bodyStyle: 'jdm',
    dimensions: { length: 4.65, width: 1.92, height: 1.35, wheelRadius: 0.36, groundClearance: 0.12 },
  },
  {
    id: 'porsche_911_gt3',
    name: 'Stuttgart 911 GT3 RS',
    brand: 'Porsche-Inspired',
    inspiredBy: 'Porsche 911 GT3 RS',
    category: 'SPORTS',
    price: 165000,
    unlockRank: 'street',
    drivetrain: 'RWD',
    horsepower: 518,
    topSpeedKmh: 312,
    massKg: 1450,
    accelZeroToHundred: 3.0,
    handlingRating: 97,
    brakingRating: 96,
    engineSoundProfile: 'v10',
    defaultColor: '#f8fafc',
    bodyStyle: 'gt',
    dimensions: { length: 4.57, width: 1.91, height: 1.30, wheelRadius: 0.36, groundClearance: 0.11 },
  },
  {
    id: 'ferrari_f9_corsa',
    name: 'Maranello F90 Stradale',
    brand: 'Ferrari-Inspired',
    inspiredBy: 'Ferrari SF90 Stradale',
    category: 'SUPERCARS',
    price: 280000,
    unlockRank: 'pro',
    drivetrain: 'AWD',
    horsepower: 986,
    topSpeedKmh: 356,
    massKg: 1570,
    accelZeroToHundred: 2.3,
    handlingRating: 94,
    brakingRating: 95,
    engineSoundProfile: 'v12',
    defaultColor: '#dc2626',
    bodyStyle: 'wedge',
    dimensions: { length: 4.71, width: 1.97, height: 1.18, wheelRadius: 0.36, groundClearance: 0.11 },
  },
  {
    id: 'koenigsegg_valkyrie_jesk',
    name: 'Angelholm Jesko Absolut',
    brand: 'Koenigsegg-Inspired',
    inspiredBy: 'Koenigsegg Jesko Absolut',
    category: 'SUPERCARS',
    price: 480000,
    unlockRank: 'elite',
    drivetrain: 'RWD',
    horsepower: 1600,
    topSpeedKmh: 455,
    massKg: 1320,
    accelZeroToHundred: 2.1,
    handlingRating: 98,
    brakingRating: 98,
    engineSoundProfile: 'v12',
    defaultColor: '#e2e8f0',
    bodyStyle: 'hyper',
    dimensions: { length: 4.84, width: 2.03, height: 1.20, wheelRadius: 0.36, groundClearance: 0.11 },
  },
];

export const RANK_ORDER: CareerRankId[] = [
  'rookie',
  'street',
  'pro',
  'elite',
  'legend',
];

export const RANK_INFO: Record<
  CareerRankId,
  { label: string; minXp: number; minRep: number; color: string }
> = {
  rookie: { label: 'Rookie Driver', minXp: 0, minRep: 0, color: '#94a3b8' },
  street: { label: 'Street Racer', minXp: 1200, minRep: 400, color: '#38bdf8' },
  pro: { label: 'Pro Contender', minXp: 4000, minRep: 1400, color: '#f59e0b' },
  elite: { label: 'Elite Driver', minXp: 9500, minRep: 3200, color: '#e11d48' },
  legend: { label: 'Coastal Legend', minXp: 20000, minRep: 7500, color: '#fbbf24' },
};

export function isRankAtLeast(current: CareerRankId, required: CareerRankId): boolean {
  return RANK_ORDER.indexOf(current) >= RANK_ORDER.indexOf(required);
}

export function getCarSpec(carId: string): CarBaseSpec {
  return CAR_CATALOG.find((c) => c.id === carId) ?? CAR_CATALOG[0];
}

export function getDefaultCustomization(car: CarBaseSpec): CarCustomization {
  return {
    paintColor: car.defaultColor,
    paintFinish: 'metallic',
    rimStyle: car.category === 'SUPERCARS' ? 'mesh_gt' : 'sport_5',
    rimColor: '#d4d7dd',
    spoiler: car.id === 'mclaren_760s' ? 'lip' : car.category === 'SUPERCARS' ? 'gt_wing' : 'lip',
    bodyKit: 'stock',
    exhaust: car.category === 'SUPERCARS' ? 'quad' : 'dual',
    neonColor: 'none',
    windowTint: 0.52,
  };
}

export function getDefaultUpgrades(): CarUpgrades {
  return {
    engine: 0,
    turbo: 0,
    tires: 0,
    suspension: 0,
    brakes: 0,
    nitro: 0,
  };
}

export function getEffectiveCarStats(spec: CarBaseSpec, upgrades: CarUpgrades) {
  const hpMult = 1 + upgrades.engine * 0.1 + upgrades.turbo * 0.12;
  const weightMult = 1 - upgrades.suspension * 0.025;
  const topSpeedBonus = upgrades.engine * 12 + upgrades.turbo * 14;
  const handlingBonus = upgrades.tires * 4 + upgrades.suspension * 3;
  const brakingBonus = upgrades.brakes * 5 + upgrades.tires * 2;

  return {
    horsepower: Math.round(spec.horsepower * hpMult),
    topSpeedKmh: Math.round(spec.topSpeedKmh + topSpeedBonus),
    massKg: Math.round(spec.massKg * weightMult),
    handlingRating: Math.min(100, spec.handlingRating + handlingBonus),
    brakingRating: Math.min(100, spec.brakingRating + brakingBonus),
    nitroCapacity: 100 + upgrades.nitro * 25,
    nitroPowerMult: 1.32 + upgrades.nitro * 0.08,
  };
}

export const UPGRADE_COSTS = [0, 8500, 22000, 50000];
