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
  pitchVel: number;
  rollVel: number;
  heaveVel: number;
  trackBankRad: number;
  trackPitchRad: number;
  stationIdx: number;
  trackProgress: number;
  absActive: boolean;
  tcsActive: boolean;
  surface: 'asphalt' | 'dirt' | 'sand' | 'snow' | 'grass' | 'water';
  grounded: boolean;
  lastCollisionImpact: number;
  lastCollisionPointX: number;
  lastCollisionPointY: number;
  lastCollisionPointZ: number;
  lastCollisionNx: number;
  lastCollisionNz: number;
  lastCollisionKind: 'none' | 'rail' | 'car' | 'landing';
  railScrapeIntensity: number;
  damageLevel: number;
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
    pitchVel: 0,
    rollVel: 0,
    heaveVel: 0,
    trackBankRad: pt.station.bankRad,
    trackPitchRad: -Math.asin(THREE.MathUtils.clamp(pt.station.ty, -0.5, 0.5)),
    stationIdx: pt.station.idx,
    trackProgress: pt.station.s,
    absActive: false,
    tcsActive: false,
    surface: 'asphalt',
    grounded: true,
    lastCollisionImpact: 0,
    lastCollisionPointX: pt.x,
    lastCollisionPointY: pt.y,
    lastCollisionPointZ: pt.z,
    lastCollisionNx: 0,
    lastCollisionNz: 0,
    lastCollisionKind: 'none',
    railScrapeIntensity: 0,
    damageLevel: 0,
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
  state.lastCollisionKind = 'none';
  state.railScrapeIntensity = 0;
  state.justShifted = false;
  if (state.exhaustFlameTimer > 0) {
    state.exhaustFlameTimer = Math.max(0, state.exhaustFlameTimer - dt);
  }

  const stats = getEffectiveCarStats(spec, upgrades);
  const massFactor = THREE.MathUtils.clamp(stats.massKg / 1450, 0.82, 1.32);
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

  // Dynamic steering lock & speed-weighted steering feel (smooth ~2.2G high-speed carving, tight low-speed hairpins)
  const speedRatio = Math.min(1, absPreForward / 84);
  const driftExtraSteer = state.driftBlend * 0.16;
  const maxSteer = 0.54 * (1 - speedRatio * 0.44) + driftExtraSteer;
  const targetSteer = -input.steer * maxSteer;
  const steerSpeed = (state.driftBlend > 0.2 ? 12.5 : 11.2) / Math.sqrt(massFactor);
  state.steerAngle += (targetSteer - state.steerAngle) * Math.min(1, dt * steerSpeed);

  // Front/Rear axle dynamic weight transfer (stronger dive/squat on heavier chassis)
  const frontLoad = THREE.MathUtils.clamp(
    0.5 - state.longitudinalG * (0.145 * massFactor),
    0.28,
    0.74,
  );
  const rearLoad = 1.0 - frontLoad;

  // Intentional Drift initiation regimes (never washes out during normal cornering lifts)
  const handbrakeSlide = input.handbrake && speedMsTotal > 4.2;
  const trailBrakeFlick =
    Math.abs(input.steer) > 0.58 &&
    absPreForward > 16 &&
    input.brake > 0.24;
  const powerOversteer =
    !options.tractionControl &&
    effectiveThrottle > 0.72 &&
    Math.abs(input.steer) > 0.56 &&
    absPreForward > 10 &&
    (spec.drivetrain === 'RWD' || state.nitroActive || options.weather !== 'sunny');
  const activeSlideMomentum = slipDegNow > 13.5 && speedMsTotal > 8.0 && Math.abs(input.steer) > 0.12;

  const wantDrift =
    handbrakeSlide ||
    trailBrakeFlick ||
    powerOversteer ||
    activeSlideMomentum;

  const driftBlendTarget = handbrakeSlide ? 1.0 : wantDrift ? 0.88 : 0.0;
  const blendRate = driftBlendTarget > state.driftBlend ? 9.5 : 4.8;
  state.driftBlend += (driftBlendTarget - state.driftBlend) * Math.min(1, dt * blendRate);

  // Speed-normalized Yaw Rotation Dynamics (~1.3 rad/s city turns -> ~0.35 rad/s at 240+ km/h)
  const handlingFactor = 0.90 + (stats.handlingRating / 100) * 0.34;
  const turnSign = preForward >= -0.35 ? 1 : -1;
  const speedTurnFactor = Math.min(1, speedMsTotal / 3.4);
  const speedYawDamp = 1 / (1 + speedRatio * 1.85);

  // Weight on front tires sharpens turn-in cleanly without twitchy snap
  const frontBite = THREE.MathUtils.clamp(0.88 + frontLoad * 0.24 - speedRatio * 0.06, 0.78, 1.10);

  // Counter-steer detection: crisp catch when opposite-locking out of a drift
  const isCounterSteering = input.steer * preLateral < -0.22 && Math.abs(preLateral) > 1.8;
  const yawSteerAuthority = input.handbrake
    ? 1.52
    : state.driftBlend > 0.25
      ? isCounterSteering
        ? 1.48
        : 1.28
      : frontBite;

  let targetYawRate =
    state.steerAngle *
    2.42 *
    speedYawDamp *
    handlingFactor *
    speedTurnFactor *
    turnSign *
    yawSteerAuthority;

  // Handbrake rear-end breakaway kick
  if (handbrakeSlide && Math.abs(input.steer) > 0.12) {
    targetYawRate += -Math.sign(input.steer) * 0.62;
  }

  // Front-wheel caster self-alignment & Traction Control yaw stabilization
  if (Math.abs(preLateral) > 1.2 && absPreForward > 5.0) {
    const casterRate = isCounterSteering ? 0.38 : options.tractionControl ? 0.44 : 0.30;
    targetYawRate += Math.sign(preLateral) * Math.min(1.3, slipDegNow / 24) * casterRate;
  }

  // Responsive rotational inertia (snappy enough for touch & keyboard, planted weight feel)
  const yawInertiaRate = 12.8 / Math.pow(massFactor, 0.55);
  state.angularVel += (targetYawRate - state.angularVel) * Math.min(1, dt * yawInertiaRate);
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
    if (input.brake > 0.2 && prevForward <= 1.0 && effectiveThrottle < 0.08) {
      state.gear = -1;
    } else if (effectiveThrottle > 0.08 && state.gear === -1) {
      // Pressing gas while in Reverse immediately switches back to 1st gear cleanly
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
      forwardAccel = -accelBase * 0.62 * input.brake;
    } else if (effectiveThrottle > 0.05) {
      forwardAccel = accelBase * 0.92 * effectiveThrottle;
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
      // Strong forward launch catch when pulling out of slow reverse momentum
      if (prevForward < -0.2) {
        driveForce += 18.0 * effectiveThrottle;
      }
      forwardAccel += driveForce;
    }
    if (input.brake > 0.02) {
      const brakeStrength = (29 + (stats.brakingRating / 100) * 16) * totalGrip;
      if (prevForward > 0.5) {
        state.absActive = options.abs && input.brake > 0.72;
        forwardAccel -= brakeStrength * input.brake * (options.abs ? 1.08 : 0.92);
      } else if (effectiveThrottle < 0.05 && options.transmission === 'auto') {
        forwardAccel -= accelBase * 0.55 * input.brake;
      }
    }
  }

  // Handbrake initiates rear breakaway without stalling forward drift momentum
  if (input.handbrake && absSpeedMs > 1.5) {
    const scrub = effectiveThrottle > 0.4 ? 2.4 : 5.8;
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

  // Two-Regime Pacejka Lateral Tire Grip Decay (high crisp lateral bite during grip driving)
  const gripDamp = 10.6 * totalGrip * handlingFactor * (0.76 + rearLoad * 0.48);
  const slideDamp = (input.handbrake ? 1.45 : 2.35) * totalGrip;
  const lateralGrip = THREE.MathUtils.lerp(gripDamp, slideDamp, state.driftBlend);

  const nextLateral = prevLateral * Math.exp(-lateralGrip * dt);

  // Preserve clean cornering velocity in grip turns (front tires redirect momentum rather than killing speed)
  if (state.driftBlend < 0.35 && prevForward > 5) {
    const speedBeforeGrip = Math.hypot(prevForward, prevLateral);
    const speedAfterGrip = Math.hypot(nextForward, nextLateral);
    const redirectBonus = Math.max(0, speedBeforeGrip - speedAfterGrip) * (1 - state.driftBlend * 2.2) * 0.72;
    nextForward += redirectBonus;
  }

  state.vx = newSin * nextForward + newCos * nextLateral;
  state.vz = newCos * nextForward - newSin * nextLateral;

  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // Spline-Corridor Containment + Realistic Guardrail Crash & Wall-Scrape Physics
  const proj = projectOntoTrack(state.x, state.z, state.stationIdx);
  state.stationIdx = proj.stationIdx;
  state.trackProgress = proj.station.s;

  const guardLimit = proj.station.roadWidth * 0.5 - 0.88;
  if (Math.abs(proj.lateralOffset) > guardLimit) {
    const side = Math.sign(proj.lateralOffset);
    const excess = Math.abs(proj.lateralOffset) - guardLimit;
    const nx = proj.station.rx * side; // Outward normal toward barrier
    const nz = proj.station.rz * side;

    state.x -= nx * excess;
    state.z -= nz * excess;

    const vOutward = state.vx * nx + state.vz * nz;
    const tx = -nz;
    const tz = nx;
    const vTangential = state.vx * tx + state.vz * tz;
    const totalSpeed = Math.hypot(state.vx, state.vz);

    // Contact point along car's barrier-facing corner/flank
    const impactSideX = -nx * (spec.dimensions.width * 0.46);
    const impactSideZ = -nz * (spec.dimensions.width * 0.46);
    const noseSign = preForward >= 0 ? 1 : -1;
    const frontBias = Math.min(1, Math.abs(vOutward) / 14) * 0.55 + 0.35;
    const contactX = state.x + impactSideX + newSin * (spec.dimensions.length * 0.36 * noseSign * frontBias);
    const contactZ = state.z + impactSideZ + newCos * (spec.dimensions.length * 0.36 * noseSign * frontBias);

    if (vOutward > 0) {
      const impact = Math.min(1.25, vOutward / 22);
      // Heavy impacts bounce with realistic restitution & absorb crash energy; slight scrapes deflect cleanly
      const restitution = impact > 0.35 ? 0.32 : 0.18;
      state.vx -= (1 + restitution) * vOutward * nx;
      state.vz -= (1 + restitution) * vOutward * nz;

      // Friction scrub proportional to wall-normal force
      const scrub = THREE.MathUtils.clamp(1 - impact * 0.22, 0.56, 0.97);
      state.vx *= scrub;
      state.vz *= scrub;

      if (impact > 0.14) {
        state.lastCollisionImpact = impact;
        state.lastCollisionPointX = contactX;
        state.lastCollisionPointY = state.y + 0.36;
        state.lastCollisionPointZ = contactZ;
        state.lastCollisionNx = -nx;
        state.lastCollisionNz = -nz;
        state.lastCollisionKind = 'rail';
        state.damageLevel = Math.min(1, state.damageLevel + impact * 0.16);

        // Controlled yaw kick & suspension slam on barrier impact (never spins driver uncontrollably backwards)
        const crossSign = newSin * nz - newCos * nx;
        state.angularVel += crossSign * impact * (2.1 / massFactor);
        state.heaveVel -= Math.min(1.3, impact * 0.95);
        state.pitchVel += impact * 1.15 * noseSign;
        state.rollVel += side * impact * 1.45;
      }
    }

    // Continuous wall grinding friction + spark stream when sliding along guardrail
    if (totalSpeed > 5.5 && Math.abs(vTangential) > 4.0) {
      const scrape = THREE.MathUtils.clamp(totalSpeed / 48, 0.12, 1.0);
      state.railScrapeIntensity = Math.max(state.railScrapeIntensity, scrape);
      const railDrag = Math.exp(-0.65 * dt);
      state.vx *= railDrag;
      state.vz *= railDrag;
      state.lastCollisionPointX = contactX;
      state.lastCollisionPointY = state.y + 0.32;
      state.lastCollisionPointZ = contactZ;
      state.lastCollisionNx = -nx;
      state.lastCollisionNz = -nz;
    }

    const railHeading = Math.atan2(proj.station.tx, proj.station.tz);
    let hDiff = railHeading - state.heading;
    while (hDiff > Math.PI) hDiff -= Math.PI * 2;
    while (hDiff < -Math.PI) hDiff += Math.PI * 2;
    if (Math.abs(hDiff) < 0.78) {
      state.heading += hDiff * Math.min(1, dt * 3.8);
    }
  }

  // Exact Spline Elevation + Track Banking Alignment
  const finalProj = projectOntoTrack(state.x, state.z, state.stationIdx);
  state.stationIdx = finalProj.stationIdx;
  state.trackProgress = finalProj.station.s;

  const groundY = finalProj.surfaceY;
  if (state.y > groundY + 0.12) {
    state.vy -= 19.6 * dt;
    state.y += state.vy * dt;
    state.grounded = false;
  }
  if (state.y <= groundY) {
    if (state.vy < -4.2) {
      const landImpact = THREE.MathUtils.clamp(-state.vy / 20, 0.14, 1.0);
      state.heaveVel += Math.max(-1.4, state.vy * 0.11);
      state.pitchVel += landImpact * 0.6;
      if (landImpact > 0.25 && state.lastCollisionKind === 'none') {
        state.lastCollisionImpact = Math.max(state.lastCollisionImpact, landImpact * 0.65);
        state.lastCollisionPointX = state.x;
        state.lastCollisionPointY = groundY + 0.1;
        state.lastCollisionPointZ = state.z;
        state.lastCollisionNx = 0;
        state.lastCollisionNz = 0;
        state.lastCollisionKind = 'landing';
      }
    }
    state.y = groundY;
    state.vy = 0;
    state.grounded = true;
  }

  // Smooth bank, grade & true 2nd-order Spring-Damper Suspension Weight Feel
  const targetBank = finalProj.bankRad;
  const targetGrade = -Math.asin(THREE.MathUtils.clamp(finalProj.station.ty, -0.5, 0.5));
  state.trackBankRad += (targetBank - state.trackBankRad) * Math.min(1, dt * 8);
  state.trackPitchRad += (targetGrade - state.trackPitchRad) * Math.min(1, dt * 8);

  state.longitudinalG = THREE.MathUtils.clamp(forwardAccel / 9.81, -2.8, 2.8);
  state.lateralG = THREE.MathUtils.clamp((nextForward * state.angularVel) / 9.81, -3.2, 3.2);

  // Stiffened suspension upgrades reduce body roll & dive while heavy mass increases weight transfer
  const suspStiffMult = 1 + upgrades.suspension * 0.14;
  const compliance = massFactor / suspStiffMult;

  const surfaceChatter =
    state.grounded && state.surface !== 'asphalt'
      ? Math.sin(state.x * 2.1 + state.z * 1.9) * Math.min(1, speedMsTotal / 18) * 0.032
      : state.grounded && speedMsTotal > 22
        ? Math.sin(state.x * 1.1 + state.z * 1.1) * 0.004
        : 0;

  // Gear shift longitudinal torque kick
  if (state.justShifted) {
    state.pitchVel -= 0.42 * compliance;
    state.heaveVel -= 0.14 * compliance;
  }

  const targetPitch = -THREE.MathUtils.clamp(
    (forwardAccel * 0.0036 + (state.nitroActive ? 0.022 : 0)) * compliance,
    -0.088,
    0.088,
  );
  const targetRoll = THREE.MathUtils.clamp(
    (nextLateral * 0.0105 + state.lateralG * 0.024) * compliance,
    -0.11,
    0.11,
  );
  const targetHeave = THREE.MathUtils.clamp(
    surfaceChatter - Math.abs(state.lateralG) * 0.008 * compliance,
    -0.09,
    0.09,
  );

  // Damped harmonic spring integration for authentic weight & rebound
  const pitchStiff = 82 * suspStiffMult / massFactor;
  const pitchDamp = 12.2 / Math.sqrt(massFactor);
  state.pitchVel += ((targetPitch - state.pitchRad) * pitchStiff - state.pitchVel * pitchDamp) * dt;
  state.pitchRad = THREE.MathUtils.clamp(state.pitchRad + state.pitchVel * dt, -0.14, 0.14);

  const rollStiff = 92 * suspStiffMult / massFactor;
  const rollDamp = 13.0 / Math.sqrt(massFactor);
  state.rollVel += ((targetRoll - state.rollRad) * rollStiff - state.rollVel * rollDamp) * dt;
  state.rollRad = THREE.MathUtils.clamp(state.rollRad + state.rollVel * dt, -0.16, 0.16);

  const heaveStiff = 125 * suspStiffMult / massFactor;
  const heaveDamp = 15.0 / Math.sqrt(massFactor);
  state.heaveVel += ((targetHeave - state.heaveY) * heaveStiff - state.heaveVel * heaveDamp) * dt;
  state.heaveY = THREE.MathUtils.clamp(state.heaveY + state.heaveVel * dt, -0.14, 0.14);

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
