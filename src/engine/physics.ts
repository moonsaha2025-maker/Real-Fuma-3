import * as THREE from 'three';
import { getEffectiveCarStats } from '../data/cars';
import {
  getRoadPointAt,
  getSurfaceAt,
  projectOntoTrack,
} from '../data/track';
import {
  CarBaseSpec,
  CarUpgrades,
  ControlInputState,
  TransmissionMode,
  WeatherType,
} from '../types/game';

export interface VehiclePhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  angularVel: number;
  steerAngle: number;
  wheelSpinRad: number;
  speedKmh: number;
  forwardSpeedMs: number;
  lateralSpeedMs: number;
  rpm: number;
  maxRpm: number;
  gear: number;
  nitro: number;
  nitroActive: boolean;
  driftAngleDeg: number;
  isDrifting: boolean;
  currentDriftPoints: number;
  totalDriftScore: number;
  pitchRad: number;
  rollRad: number;
  heaveY: number;
  trackBankRad: number;
  trackPitchRad: number;
  stationIdx: number;
  trackProgress: number;
  absActive: boolean;
  tcsActive: boolean;
  surface: 'asphalt' | 'dirt' | 'sand' | 'snow' | 'grass' | 'water';
  grounded: boolean;
  lastCollisionImpact: number;
  justShifted: boolean;
}

const GEAR_RATIOS = [0, 3.45, 2.32, 1.65, 1.24, 0.96, 0.78];

export function createInitialPhysicsStateAtS(
  s = 0.06,
  lateralOffset = 0,
): VehiclePhysicsState {
  const pt = getRoadPointAt(s, lateralOffset);
  return {
    x: pt.x,
    y: pt.y,
    z: pt.z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: pt.heading,
    angularVel: 0,
    steerAngle: 0,
    wheelSpinRad: 0,
    speedKmh: 0,
    forwardSpeedMs: 0,
    lateralSpeedMs: 0,
    rpm: 950,
    maxRpm: 8500,
    gear: 1,
    nitro: 100,
    nitroActive: false,
    driftAngleDeg: 0,
    isDrifting: false,
    currentDriftPoints: 0,
    totalDriftScore: 0,
    pitchRad: 0,
    rollRad: 0,
    heaveY: 0,
    trackBankRad: pt.station.bankRad,
    trackPitchRad: -Math.asin(THREE.MathUtils.clamp(pt.station.ty, -0.5, 0.5)),
    stationIdx: pt.station.idx,
    trackProgress: pt.station.s,
    absActive: false,
    tcsActive: false,
    surface: 'asphalt',
    grounded: true,
    lastCollisionImpact: 0,
    justShifted: false,
  };
}

export function stepVehiclePhysics(
  state: VehiclePhysicsState,
  input: ControlInputState,
  spec: CarBaseSpec,
  upgrades: CarUpgrades,
  options: {
    dt: number;
    weather: WeatherType;
    transmission: TransmissionMode;
    abs: boolean;
    tractionControl: boolean;
    manualShiftRequest: -1 | 0 | 1;
  },
): void {
  const dt = Math.min(options.dt, 0.05);
  state.lastCollisionImpact = 0;
  state.justShifted = false;

  const stats = getEffectiveCarStats(spec, upgrades);
  const maxRpm = spec.category === 'SUPERCARS' ? 9000 : 8000;
  state.maxRpm = maxRpm;

  const surface = getSurfaceAt(state.x, state.z, state.stationIdx);
  state.surface = surface;

  let weatherGrip = 1.0;
  if (options.weather === 'rain') weatherGrip = 0.84;
  else if (options.weather === 'heavy_rain') weatherGrip = 0.76;
  else if (options.weather === 'thunderstorm') weatherGrip = 0.72;
  else if (options.weather === 'fog') weatherGrip = 0.94;

  const totalGrip = weatherGrip * (surface === 'asphalt' ? 1.0 : 0.78);

  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);
  const fwdX = sinH;
  const fwdZ = cosH;
  const rightX = cosH;
  const rightZ = -sinH;

  const prevForward = state.vx * fwdX + state.vz * fwdZ;
  const prevLateral = state.vx * rightX + state.vz * rightZ;

  // Responsive Forza-style speed-sensitive steering
  const speedRatio = Math.min(1, Math.abs(prevForward) / 68);
  const maxSteer = 0.54 - speedRatio * 0.29;
  const targetSteer = -input.steer * maxSteer;
  state.steerAngle += (targetSteer - state.steerAngle) * Math.min(1, dt * 12);

  // Nitro boost & drift recharge
  const canNitro = input.nitro && state.nitro > 1 && input.throttle > 0.1;
  state.nitroActive = canNitro;
  if (canNitro) {
    state.nitro = Math.max(0, state.nitro - dt * 21);
  } else {
    state.nitro = Math.min(
      stats.nitroCapacity,
      state.nitro + dt * (state.isDrifting ? 15 : 3.2),
    );
  }

  const maxSpeedMs =
    (stats.topSpeedKmh / 3.6) * (state.nitroActive ? 1.14 : 1.0);
  const absSpeedMs = Math.abs(prevForward);

  // Transmission
  if (options.transmission === 'manual') {
    if (options.manualShiftRequest !== 0) {
      const nextG = state.gear + options.manualShiftRequest;
      if (nextG >= -1 && nextG <= 6 && nextG !== 0) {
        state.gear = nextG;
        state.justShifted = true;
      } else if (nextG === 0) {
        state.gear = options.manualShiftRequest > 0 ? 1 : -1;
        state.justShifted = true;
      }
    }
  } else {
    if (input.brake > 0.25 && prevForward < 1.2 && input.throttle < 0.1) {
      state.gear = -1;
    } else if (input.throttle > 0.1 && state.gear === -1 && prevForward > -0.8) {
      state.gear = 1;
    } else if (state.gear > 0) {
      const rpmEst = (absSpeedMs / (maxSpeedMs / GEAR_RATIOS[state.gear])) * maxRpm;
      if (rpmEst > maxRpm * 0.91 && state.gear < 6) {
        state.gear += 1;
        state.justShifted = true;
      } else if (rpmEst < maxRpm * 0.42 && state.gear > 1) {
        state.gear -= 1;
        state.justShifted = true;
      }
    } else if (prevForward >= 0) {
      state.gear = 1;
    }
  }

  const gearRatio = state.gear === -1 ? 3.2 : GEAR_RATIOS[Math.max(1, state.gear)];
  const wheelRpm = (absSpeedMs / Math.max(1, maxSpeedMs)) * maxRpm * (gearRatio / 1.1);
  const targetRpm = Math.max(950, Math.min(maxRpm, wheelRpm + input.throttle * 1350));
  state.rpm += (targetRpm - state.rpm) * Math.min(1, dt * 10);

  // Power & Braking
  const powerWatts = stats.horsepower * 745.7;
  const accelBase =
    (powerWatts / (stats.massKg * 25.5)) *
    (spec.drivetrain === 'AWD' ? 1.12 : 1.0);
  const speedFalloff = Math.max(0.08, 1 - Math.pow(absSpeedMs / maxSpeedMs, 1.8));
  const nitroBoost = state.nitroActive ? stats.nitroPowerMult : 1.0;

  let forwardAccel = 0;
  state.tcsActive = false;
  state.absActive = false;

  if (state.gear === -1) {
    if (input.brake > 0.05 && prevForward <= 1.0) {
      forwardAccel = -accelBase * 0.58 * input.brake;
    } else if (input.throttle > 0.05) {
      forwardAccel = accelBase * 0.6 * input.throttle;
    }
  } else {
    if (input.throttle > 0.02) {
      let driveForce = accelBase * speedFalloff * input.throttle * nitroBoost;
      if (options.tractionControl && totalGrip < 0.8 && absSpeedMs < 18) {
        driveForce *= 0.86;
        state.tcsActive = true;
      }
      forwardAccel += driveForce;
    }
    if (input.brake > 0.02) {
      const brakeStrength = (26 + (stats.brakingRating / 100) * 16) * totalGrip;
      if (prevForward > 0.5) {
        state.absActive = options.abs && input.brake > 0.72;
        forwardAccel -= brakeStrength * input.brake * (options.abs ? 1.04 : 0.9);
      } else if (input.throttle < 0.05 && options.transmission === 'auto') {
        forwardAccel -= accelBase * 0.45 * input.brake;
      }
    }
  }

  if (input.handbrake && absSpeedMs > 1) {
    forwardAccel -= Math.sign(prevForward) * 10.5 * totalGrip;
  }

  const aeroDrag = 0.0021 * prevForward * Math.abs(prevForward);
  const rollDrag = prevForward * (surface === 'asphalt' ? 0.014 : 0.045) * 6.5;
  forwardAccel -= aeroDrag + rollDrag;

  let nextForward = prevForward + forwardAccel * dt;
  if (nextForward < -22) nextForward = -22;
  if (nextForward > maxSpeedMs) {
    nextForward += (maxSpeedMs - nextForward) * Math.min(1, dt * 4);
  }

  // Smooth Forza-Style Lateral Grip + Controllable Drift Angle
  const handlingFactor = 0.82 + (stats.handlingRating / 100) * 0.44;
  let lateralGrip = 7.9 * totalGrip * handlingFactor;
  if (input.handbrake) {
    lateralGrip *= 0.25;
  } else if (
    spec.drivetrain === 'RWD' &&
    input.throttle > 0.78 &&
    Math.abs(state.steerAngle) > 0.14
  ) {
    lateralGrip *= options.tractionControl ? 0.84 : 0.6;
  }

  const nextLateral = prevLateral * Math.exp(-lateralGrip * dt);

  const turnSign = nextForward >= -0.2 ? 1 : -1;
  const speedTurnFactor = Math.min(1, Math.abs(nextForward) / 4.0);
  const driftOversteer = input.handbrake ? 1.46 : 1.0;
  const targetYawRate =
    state.steerAngle *
    3.25 *
    handlingFactor *
    speedTurnFactor *
    turnSign *
    driftOversteer;

  state.angularVel += (targetYawRate - state.angularVel) * Math.min(1, dt * 10);
  state.heading += state.angularVel * dt;

  const newSin = Math.sin(state.heading);
  const newCos = Math.cos(state.heading);
  state.vx = newSin * nextForward + newCos * nextLateral;
  state.vz = newCos * nextForward - newSin * nextLateral;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // Spline-Corridor Containment + Seamless Armco Steel Guardrail Deflection (Zero snags!)
  const proj = projectOntoTrack(state.x, state.z, state.stationIdx);
  state.stationIdx = proj.stationIdx;
  state.trackProgress = proj.station.s;

  const guardLimit = proj.station.roadWidth * 0.5 - 0.88;
  if (Math.abs(proj.lateralOffset) > guardLimit) {
    const side = Math.sign(proj.lateralOffset);
    const excess = Math.abs(proj.lateralOffset) - guardLimit;
    const nx = proj.station.rx * side; // Outward normal toward guardrail
    const nz = proj.station.rz * side;

    // Push car cleanly back inside rail corridor
    state.x -= nx * excess;
    state.z -= nz * excess;

    const vOutward = state.vx * nx + state.vz * nz;
    if (vOutward > 0) {
      const impact = Math.min(1, vOutward / 26);
      // Elastic rail deflection + smooth tangential wall slide
      state.vx -= 1.38 * vOutward * nx;
      state.vz -= 1.38 * vOutward * nz;
      state.vx *= 0.88;
      state.vz *= 0.88;
      if (impact > 0.14) {
        state.lastCollisionImpact = impact;
      }
    }

    // Gently steer velocity parallel to rail if scrubbing hard
    const railHeading = Math.atan2(proj.station.tx, proj.station.tz);
    let hDiff = railHeading - state.heading;
    while (hDiff > Math.PI) hDiff -= Math.PI * 2;
    while (hDiff < -Math.PI) hDiff += Math.PI * 2;
    if (Math.abs(hDiff) < 0.75) {
      state.heading += hDiff * Math.min(1, dt * 3.5);
    }
  }

  // Exact Spline Elevation + Track Banking Alignment
  const finalProj = projectOntoTrack(state.x, state.z, state.stationIdx);
  state.stationIdx = finalProj.stationIdx;
  state.trackProgress = finalProj.station.s;

  const groundY = finalProj.surfaceY;
  if (state.y > groundY + 0.12) {
    state.vy -= 19.0 * dt;
    state.y += state.vy * dt;
    state.grounded = false;
  }
  if (state.y <= groundY) {
    if (state.vy < -5) {
      state.heaveY = Math.max(-0.12, state.vy * 0.015);
    }
    state.y = groundY;
    state.vy = 0;
    state.grounded = true;
  }

  // Smooth bank & grade suspension posture
  const targetBank = finalProj.bankRad;
  const targetGrade = -Math.asin(THREE.MathUtils.clamp(finalProj.station.ty, -0.5, 0.5));
  state.trackBankRad += (targetBank - state.trackBankRad) * Math.min(1, dt * 8);
  state.trackPitchRad += (targetGrade - state.trackPitchRad) * Math.min(1, dt * 8);

  const dynPitch = -Math.max(-0.055, Math.min(0.055, forwardAccel * 0.0026));
  const dynRoll = Math.max(-0.07, Math.min(0.07, nextLateral * 0.0075));
  state.pitchRad += (dynPitch - state.pitchRad) * Math.min(1, dt * 8);
  state.rollRad += (dynRoll - state.rollRad) * Math.min(1, dt * 8);
  state.heaveY += (0 - state.heaveY) * Math.min(1, dt * 10);

  // Telemetry & Drift Scoring
  state.forwardSpeedMs = nextForward;
  state.lateralSpeedMs = nextLateral;
  const speedMs = Math.hypot(state.vx, state.vz);
  state.speedKmh = speedMs * 3.6;
  state.wheelSpinRad = (nextForward / spec.dimensions.wheelRadius) * dt;

  const slipAngle =
    speedMs > 5
      ? Math.abs(Math.atan2(nextLateral, Math.abs(nextForward) + 0.1)) *
        (180 / Math.PI)
      : 0;
  state.driftAngleDeg = Math.round(slipAngle);

  if (slipAngle > 13 && state.speedKmh > 26 && state.grounded) {
    state.isDrifting = true;
    state.currentDriftPoints += (slipAngle * 14 + state.speedKmh * 3.5) * dt;
  } else {
    if (state.currentDriftPoints > 50) {
      state.totalDriftScore += Math.round(state.currentDriftPoints);
    }
    state.currentDriftPoints = 0;
    state.isDrifting = false;
  }
}
