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
  driftBlend: number;
  lateralG: number;
  longitudinalG: number;
  exhaustFlameTimer: number;
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
    driftBlend: 0,
    lateralG: 0,
    longitudinalG: 0,
    exhaustFlameTimer: 0,
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
  if (state.exhaustFlameTimer > 0) {
    state.exhaustFlameTimer = Math.max(0, state.exhaustFlameTimer - dt);
  }

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

  const surfaceGrip =
    surface === 'asphalt'
      ? 1.0
      : surface === 'dirt'
        ? 0.76
        : surface === 'grass'
          ? 0.74
          : surface === 'sand'
            ? 0.66
            : surface === 'snow'
              ? 0.62
              : 0.55;
  const totalGrip = weatherGrip * surfaceGrip;

  const sinH = Math.sin(state.heading);
  const cosH = Math.cos(state.heading);

  const preForward = state.vx * sinH + state.vz * cosH;
  const preLateral = state.vx * cosH - state.vz * sinH;
  const speedMsTotal = Math.hypot(state.vx, state.vz);
  const absPreForward = Math.abs(preForward);

  // Nitrous Oxide System (fires immediately when requested, injects full throttle automatically)
  const minNitroToStart = state.nitroActive ? 0.2 : 3.0;
  const canNitro = input.nitro && state.nitro > minNitroToStart && input.brake < 0.5;
  state.nitroActive = canNitro;

  const effectiveThrottle = canNitro ? Math.max(input.throttle, 1.0) : input.throttle;

  if (canNitro) {
    state.nitro = Math.max(0, state.nitro - dt * 18.5);
  } else {
    // Drifting refills Nitro rapidly (classic street-drift recharge) + steady passive recovery
    const rechargeRate = state.isDrifting ? 22.0 : 5.2;
    state.nitro = Math.min(stats.nitroCapacity, state.nitro + dt * rechargeRate);
  }

  // Current kinematic slip angle (deg)
  const slipDegNow =
    speedMsTotal > 3.5
      ? Math.abs(Math.atan2(preLateral, absPreForward + 0.5)) * (180 / Math.PI)
      : 0;

  // Dynamic steering lock: expands during drifts so deep 15°-48° counter-steer slides are smooth & catchable
  const speedRatio = Math.min(1, absPreForward / 78);
  const driftExtraSteer = state.driftBlend * 0.24;
  const maxSteer = 0.64 - speedRatio * 0.26 + driftExtraSteer;
  const targetSteer = -input.steer * maxSteer;
  state.steerAngle +=
    (targetSteer - state.steerAngle) * Math.min(1, dt * (state.driftBlend > 0.25 ? 14 : 11));

  // Front/Rear axle dynamic weight transfer
  const frontLoad = THREE.MathUtils.clamp(0.5 - state.longitudinalG * 0.15, 0.28, 0.74);
  const rearLoad = 1.0 - frontLoad;

  // Drift initiation regimes: Handbrake, Trail-Brake/High-G Flick, Power Oversteer, or Sustained Slide Momentum
  const handbrakeSlide = input.handbrake && speedMsTotal > 4.2;
  const highSpeedFlick =
    Math.abs(input.steer) > 0.52 &&
    absPreForward > 15 &&
    (input.brake > 0.08 || frontLoad > 0.51);
  const powerOversteer =
    effectiveThrottle > 0.62 &&
    Math.abs(input.steer) > 0.36 &&
    absPreForward > 7.5 &&
    (spec.drivetrain === 'RWD' || state.nitroActive || options.weather !== 'sunny');
  const activeSlideMomentum = slipDegNow > 7.5 && speedMsTotal > 6.0;

  const wantDrift =
    handbrakeSlide ||
    highSpeedFlick ||
    (powerOversteer && (!options.tractionControl || Math.abs(input.steer) > 0.48)) ||
    activeSlideMomentum;

  const driftBlendTarget = handbrakeSlide ? 1.0 : wantDrift ? 0.92 : 0.0;
  const blendRate = driftBlendTarget > state.driftBlend ? 10.5 : 2.8;
  state.driftBlend += (driftBlendTarget - state.driftBlend) * Math.min(1, dt * blendRate);

  // Yaw Rotation Dynamics (evaluated BEFORE projecting world velocity into new car frame so real slip emerges!)
  const handlingFactor = 0.86 + (stats.handlingRating / 100) * 0.4;
  const turnSign = preForward >= -0.2 ? 1 : -1;
  const speedTurnFactor = Math.min(1, speedMsTotal / 3.8);

  // Counter-steer detection: +steer turns right (-heading) -> +preLateral; counter-steer is -steer -> opposite sign
  const isCounterSteering = input.steer * preLateral < -0.25 && Math.abs(preLateral) > 2.0;
  const yawSteerAuthority = input.handbrake
    ? 1.55
    : state.driftBlend > 0.3
      ? isCounterSteering
        ? 1.32
        : 1.42
      : 1.0;

  let targetYawRate =
    state.steerAngle *
    2.95 *
    handlingFactor *
    speedTurnFactor *
    turnSign *
    yawSteerAuthority;

  // Handbrake rear-end breakaway kick
  if (handbrakeSlide && Math.abs(input.steer) > 0.12) {
    targetYawRate += -Math.sign(input.steer) * 0.78;
  }

  // Front-wheel caster self-alignment: pulls car heading (+heading when preLateral > 0) toward velocity vector
  if (Math.abs(preLateral) > 1.5 && absPreForward > 5.0) {
    const casterRate = isCounterSteering ? 0.65 : 0.42;
    targetYawRate += Math.sign(preLateral) * Math.min(1.8, slipDegNow / 20) * casterRate;
  }

  state.angularVel += (targetYawRate - state.angularVel) * Math.min(1, dt * 11.5);
  state.heading += state.angularVel * dt;

  // Project existing world velocity (vx, vz) onto the NEW rotated vehicle frame -> authentic kinematic slip!
  const newSin = Math.sin(state.heading);
  const newCos = Math.cos(state.heading);
  const prevForward = state.vx * newSin + state.vz * newCos;
  const prevLateral = state.vx * newCos - state.vz * newSin;
  const absSpeedMs = Math.abs(prevForward);

  // Top Speed & Transmission
  const nitroTopMult = 1.26 + upgrades.nitro * 0.03;
  const maxSpeedMs = (stats.topSpeedKmh / 3.6) * (state.nitroActive ? nitroTopMult : 1.0);

  if (options.transmission === 'manual') {
    if (options.manualShiftRequest !== 0) {
      const nextG = state.gear + options.manualShiftRequest;
      if (nextG >= -1 && nextG <= 6 && nextG !== 0) {
        state.gear = nextG;
        state.justShifted = true;
        state.exhaustFlameTimer = 0.22;
      } else if (nextG === 0) {
        state.gear = options.manualShiftRequest > 0 ? 1 : -1;
        state.justShifted = true;
      }
    }
  } else {
    if (input.brake > 0.25 && prevForward < 1.2 && effectiveThrottle < 0.1) {
      state.gear = -1;
    } else if (effectiveThrottle > 0.1 && state.gear === -1 && prevForward > -0.8) {
      state.gear = 1;
    } else if (state.gear > 0) {
      const rpmEst = (absSpeedMs / (maxSpeedMs / GEAR_RATIOS[state.gear])) * maxRpm;
      if (rpmEst > maxRpm * 0.91 && state.gear < 6) {
        state.gear += 1;
        state.justShifted = true;
        state.exhaustFlameTimer = 0.22;
      } else if (rpmEst < maxRpm * 0.42 && state.gear > 1) {
        state.gear -= 1;
        state.justShifted = true;
      }
    } else if (prevForward >= 0) {
      state.gear = 1;
    }
  }

  const gearRatio = state.gear === -1 ? 3.2 : GEAR_RATIOS[Math.max(1, state.gear)];
  const wheelSpinBonus = state.driftBlend * effectiveThrottle * 1450 + (state.nitroActive ? 1050 : 0);
  const wheelRpm = (absSpeedMs / Math.max(1, maxSpeedMs)) * maxRpm * (gearRatio / 1.1);
  const targetRpm = Math.max(950, Math.min(maxRpm, wheelRpm + effectiveThrottle * 1350 + wheelSpinBonus));
  state.rpm += (targetRpm - state.rpm) * Math.min(1, dt * 11);

  // Engine Drive Force + True Dual-Stage Nitrous Oxide Thrust
  const powerWatts = stats.horsepower * 745.7;
  const accelBase =
    (powerWatts / (stats.massKg * 24.0)) *
    (spec.drivetrain === 'AWD' ? 1.12 : 1.0);
  const speedRatioTop = Math.min(1.3, absSpeedMs / Math.max(1, maxSpeedMs));
  const speedFalloff = Math.max(0.18, 1 - Math.pow(speedRatioTop, 1.9));
  const nitroBoostMult = state.nitroActive ? 1.56 + upgrades.nitro * 0.1 : 1.0;

  let forwardAccel = 0;
  state.tcsActive = false;
  state.absActive = false;

  if (state.gear === -1) {
    if (input.brake > 0.05 && prevForward <= 1.0) {
      forwardAccel = -accelBase * 0.58 * input.brake;
    } else if (effectiveThrottle > 0.05) {
      forwardAccel = accelBase * 0.65 * effectiveThrottle;
    }
  } else {
    if (effectiveThrottle > 0.02) {
      let driveForce = accelBase * speedFalloff * effectiveThrottle * nitroBoostMult;
      if (state.nitroActive) {
        // Direct rocket exhaust thrust overcoming aerodynamic drag at high speeds
        driveForce += (10.5 + upgrades.nitro * 2.4) * (0.42 + 0.58 * speedFalloff);
      }
      if (options.tractionControl && totalGrip < 0.78 && absSpeedMs < 14 && !state.nitroActive && state.driftBlend < 0.25) {
        driveForce *= 0.9;
        state.tcsActive = true;
      }
      forwardAccel += driveForce;
    }
    if (input.brake > 0.02) {
      const brakeStrength = (27 + (stats.brakingRating / 100) * 16) * totalGrip;
      if (prevForward > 0.5) {
        state.absActive = options.abs && input.brake > 0.72;
        forwardAccel -= brakeStrength * input.brake * (options.abs ? 1.05 : 0.9);
      } else if (effectiveThrottle < 0.05 && options.transmission === 'auto') {
        forwardAccel -= accelBase * 0.45 * input.brake;
      }
    }
  }

  // Handbrake initiates rear breakaway without stalling forward drift momentum
  if (input.handbrake && absSpeedMs > 1.5) {
    const scrub = effectiveThrottle > 0.4 ? 2.6 : 5.8;
    forwardAccel -= Math.sign(prevForward) * scrub * totalGrip;
  }

  // Natural rolling resistance + aerodynamic drag (reduced during nitro boost stream)
  const aeroDragCoeff = state.nitroActive ? 0.0013 : 0.002;
  const aeroDrag = aeroDragCoeff * prevForward * Math.abs(prevForward);
  const rollDrag = prevForward * (surface === 'asphalt' ? 0.013 : 0.042) * 6.0;
  forwardAccel -= aeroDrag + rollDrag;

  // Drift forward arc drive: spinning rear tires propel car forward along drift arc
  if (state.driftBlend > 0.2 && effectiveThrottle > 0.3 && absSpeedMs > 5) {
    forwardAccel += Math.abs(prevLateral) * 0.42 * effectiveThrottle;
  }

  let nextForward = prevForward + forwardAccel * dt;
  if (nextForward < -22) nextForward = -22;
  if (nextForward > maxSpeedMs) {
    nextForward += (maxSpeedMs - nextForward) * Math.min(1, dt * 4.5);
  }

  // Two-Regime Pacejka Lateral Tire Grip Decay
  const gripDamp = 9.5 * totalGrip * handlingFactor * (0.72 + rearLoad * 0.56);
  const slideDamp = (input.handbrake ? 1.25 : 2.15) * totalGrip;
  const lateralGrip = THREE.MathUtils.lerp(gripDamp, slideDamp, state.driftBlend);

  const nextLateral = prevLateral * Math.exp(-lateralGrip * dt);

  // Preserve clean cornering velocity in grip turns (front tires redirect momentum rather than killing speed)
  if (state.driftBlend < 0.35 && prevForward > 5) {
    const speedBeforeGrip = Math.hypot(prevForward, prevLateral);
    const speedAfterGrip = Math.hypot(nextForward, nextLateral);
    const redirectBonus = Math.max(0, speedBeforeGrip - speedAfterGrip) * (1 - state.driftBlend * 2.2) * 0.65;
    nextForward += redirectBonus;
  }

  state.vx = newSin * nextForward + newCos * nextLateral;
  state.vz = newCos * nextForward - newSin * nextLateral;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // Spline-Corridor Containment + Seamless Armco Steel Guardrail Deflection
  const proj = projectOntoTrack(state.x, state.z, state.stationIdx);
  state.stationIdx = proj.stationIdx;
  state.trackProgress = proj.station.s;

  const guardLimit = proj.station.roadWidth * 0.5 - 0.88;
  if (Math.abs(proj.lateralOffset) > guardLimit) {
    const side = Math.sign(proj.lateralOffset);
    const excess = Math.abs(proj.lateralOffset) - guardLimit;
    const nx = proj.station.rx * side;
    const nz = proj.station.rz * side;

    state.x -= nx * excess;
    state.z -= nz * excess;

    const vOutward = state.vx * nx + state.vz * nz;
    if (vOutward > 0) {
      const impact = Math.min(1, vOutward / 26);
      state.vx -= 1.38 * vOutward * nx;
      state.vz -= 1.38 * vOutward * nz;
      state.vx *= 0.88;
      state.vz *= 0.88;
      if (impact > 0.14) {
        state.lastCollisionImpact = impact;
      }
    }

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

  // Smooth bank, grade & dynamic suspension G-forces
  const targetBank = finalProj.bankRad;
  const targetGrade = -Math.asin(THREE.MathUtils.clamp(finalProj.station.ty, -0.5, 0.5));
  state.trackBankRad += (targetBank - state.trackBankRad) * Math.min(1, dt * 8);
  state.trackPitchRad += (targetGrade - state.trackPitchRad) * Math.min(1, dt * 8);

  state.longitudinalG = THREE.MathUtils.clamp(forwardAccel / 9.81, -2.5, 2.5);
  state.lateralG = THREE.MathUtils.clamp((nextForward * state.angularVel) / 9.81, -2.8, 2.8);

  const dynPitch = -THREE.MathUtils.clamp(
    forwardAccel * 0.0028 + (state.nitroActive ? 0.016 : 0),
    -0.068,
    0.068,
  );
  const dynRoll = THREE.MathUtils.clamp(
    (nextLateral * 0.0085 + state.lateralG * 0.018),
    -0.085,
    0.085,
  );
  state.pitchRad += (dynPitch - state.pitchRad) * Math.min(1, dt * 9);
  state.rollRad += (dynRoll - state.rollRad) * Math.min(1, dt * 9);
  state.heaveY += (0 - state.heaveY) * Math.min(1, dt * 10);

  // Telemetry & Drift Scoring
  state.forwardSpeedMs = nextForward;
  state.lateralSpeedMs = nextLateral;
  const speedMs = Math.hypot(state.vx, state.vz);
  state.speedKmh = speedMs * 3.6;
  state.wheelSpinRad = (nextForward / spec.dimensions.wheelRadius) * dt;

  const slipAngle =
    speedMs > 4
      ? Math.abs(Math.atan2(nextLateral, Math.abs(nextForward) + 0.1)) *
        (180 / Math.PI)
      : 0;
  state.driftAngleDeg = Math.round(slipAngle);

  if (slipAngle > 10.5 && state.speedKmh > 20 && state.grounded) {
    state.isDrifting = true;
    state.currentDriftPoints += (slipAngle * 18 + state.speedKmh * 4.2) * dt;
  } else {
    if (state.currentDriftPoints > 40) {
      state.totalDriftScore += Math.round(state.currentDriftPoints);
    }
    state.currentDriftPoints = 0;
    state.isDrifting = false;
  }
}
