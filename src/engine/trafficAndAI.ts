import * as THREE from 'three';
import { CAR_CATALOG, getDefaultCustomization } from '../data/cars';
import { getRoadPointAt, TRACK_LENGTH_M } from '../data/track';
import { PaintFinish, TrafficDensity } from '../types/game';
import { CarModelRig, createCarModel } from './carModel';
import { VehiclePhysicsState } from './physics';

const _worldUp = new THREE.Vector3(0, 1, 0);
const _roadTan = new THREE.Vector3();
const _roadRight = new THREE.Vector3();
const _roadNormal = new THREE.Vector3();
const _qSurface = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();

const INNER_LANE_OFFSET = 2.15;
const OUTER_LANE_OFFSET = 5.15;

const DENSITY_COUNTS: Record<TrafficDensity, number> = {
  off: 0,
  low: 12,
  normal: 24,
  high: 36,
};

const TRAFFIC_PAINTS = [
  '#dc2626',
  '#cbd5e1',
  '#f59e0b',
  '#0f172a',
  '#e2e8f0',
  '#38bdf8',
  '#10b981',
  '#6366f1',
  '#f97316',
  '#475569',
];

const TRAFFIC_FINISHES: PaintFinish[] = ['metallic', 'gloss', 'metallic', 'matte'];

export interface TrafficAgent {
  carRig: CarModelRig;
  s: number; // 0..1 spline progress
  lateralOffset: number;
  baseLateral: number;
  targetLateral: number;
  laneChangeCooldown: number;
  dir: 1 | -1;
  speedMs: number;
  baseSpeedMs: number;
  massKg: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  hitYawOffset: number;
  hitSpinVel: number;
  hitRoll: number;
  hitTimer: number;
}

export interface RaceAIAgent {
  name: string;
  carRig: CarModelRig;
  s: number;
  totalS: number; // Cumulative laps + s
  lateralOffset: number;
  targetLateral: number;
  speedMs: number;
  maxSpeedMs: number;
  massKg: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  hitYawOffset: number;
  hitSpinVel: number;
  hitRoll: number;
  hitTimer: number;
}

export interface CarHeadlightTarget {
  x: number;
  y: number;
  z: number;
  heading: number;
  distSq: number;
}

export class TrafficAndAIManager {
  public group = new THREE.Group();
  public traffic: TrafficAgent[] = [];
  public racers: RaceAIAgent[] = [];
  private sharedContactShadow?: THREE.Texture;
  private density: TrafficDensity = 'normal';
  private spawnSerial = 0;

  constructor(contactShadow?: THREE.Texture, initialDensity: TrafficDensity = 'normal') {
    this.sharedContactShadow = contactShadow;
    this.setTrafficDensity(initialDensity);
  }

  public setTrafficDensity(density: TrafficDensity): void {
    const targetCount = DENSITY_COUNTS[density] ?? DENSITY_COUNTS.normal;
    if (this.density === density && this.traffic.length === targetCount) {
      return;
    }
    this.density = density;

    // Trim excess vehicles cleanly with GPU resource disposal
    while (this.traffic.length > targetCount) {
      const removed = this.traffic.pop();
      if (removed) {
        this.group.remove(removed.carRig.root);
        removed.carRig.dispose();
      }
    }

    if (targetCount === 0) return;

    // If growing from empty or adding slots, spawn remaining vehicles spread evenly across the loop
    const existingCount = this.traffic.length;
    const needed = targetCount - existingCount;
    for (let k = 0; k < needed; k++) {
      const slotIndex = existingCount + k;
      this.spawnSingleTrafficAgent(slotIndex, targetCount);
    }
  }

  private spawnSingleTrafficAgent(slotIndex: number, totalTarget: number): void {
    const seed = this.spawnSerial++;
    const spec = CAR_CATALOG[(seed % (CAR_CATALOG.length - 1)) + 1];
    const cust = getDefaultCustomization(spec);
    cust.paintColor = TRAFFIC_PAINTS[seed % TRAFFIC_PAINTS.length];
    cust.paintFinish = TRAFFIC_FINISHES[seed % TRAFFIC_FINISHES.length];
    cust.spoiler = seed % 4 === 0 ? 'gt_wing' : seed % 2 === 0 ? 'lip' : 'none';

    const rig = createCarModel(spec, cust, {
      contactShadowMap: this.sharedContactShadow,
      lightweight: true,
    });
    this.group.add(rig.root);

    const dir: 1 | -1 = slotIndex % 2 === 0 ? 1 : -1;
    const isFastLane = Math.floor(slotIndex / 2) % 2 === 0;
    const laneMag = isFastLane ? INNER_LANE_OFFSET : OUTER_LANE_OFFSET;
    const lateralOffset = dir * laneMag;

    // Evenly distribute around the 3.8 km highway loop with slight deterministic stagger
    const stagger = ((seed * 37) % 100) * 0.0008;
    const s = (0.11 + slotIndex / Math.max(1, totalTarget) + stagger) % 1;
    const pt = getRoadPointAt(s, lateralOffset);
    const heading = dir === 1 ? pt.heading : pt.heading + Math.PI;
    const baseSpeedMs = isFastLane
      ? 27.5 + (seed % 4) * 2.1 // ~99 - 122 km/h inner lane
      : 19.5 + (seed % 4) * 1.8; // ~70 - 90 km/h outer cruising lane

    rig.root.position.set(pt.x, pt.y, pt.z);
    rig.root.rotation.y = heading;

    this.traffic.push({
      carRig: rig,
      s,
      lateralOffset,
      baseLateral: lateralOffset,
      targetLateral: lateralOffset,
      laneChangeCooldown: 1.5 + (seed % 5) * 0.7,
      dir,
      speedMs: baseSpeedMs,
      baseSpeedMs,
      massKg: spec.massKg,
      x: pt.x,
      y: pt.y,
      z: pt.z,
      heading,
      hitYawOffset: 0,
      hitSpinVel: 0,
      hitRoll: 0,
      hitTimer: 0,
    });
  }

  private isLaneWindowClear(
    selfIdx: number,
    dir: 1 | -1,
    s: number,
    candidateLateral: number,
    behindM: number,
    aheadM: number,
    player: VehiclePhysicsState,
  ): boolean {
    const halfLen = TRACK_LENGTH_M * 0.5;
    for (let j = 0; j < this.traffic.length; j++) {
      if (j === selfIdx) continue;
      const other = this.traffic[j];
      if (other.dir !== dir) continue;
      if (
        Math.abs(other.lateralOffset - candidateLateral) > 2.2 &&
        Math.abs(other.targetLateral - candidateLateral) > 2.2
      ) {
        continue;
      }
      let signedDs = dir === 1 ? other.s - s : s - other.s;
      signedDs = ((signedDs % 1) + 1) % 1;
      let signedM = signedDs * TRACK_LENGTH_M;
      if (signedM > halfLen) signedM -= TRACK_LENGTH_M;
      if (signedM >= -behindM && signedM <= aheadM) {
        return false;
      }
    }

    // Ensure player isn't sitting directly in the target lane right beside this car
    const self = this.traffic[selfIdx];
    const pdx = player.x - self.x;
    const pdz = player.z - self.z;
    if (pdx * pdx + pdz * pdz < 26 * 26) {
      const sinH = Math.sin(self.heading);
      const cosH = Math.cos(self.heading);
      const fwdDist = pdx * sinH + pdz * cosH;
      const lateralShift = candidateLateral - self.lateralOffset;
      const rightX = -cosH;
      const rightZ = sinH;
      const playerSideDist = pdx * rightX + pdz * rightZ;
      const signedLatDelta = lateralShift * self.dir;
      if (
        fwdDist > -10 &&
        fwdDist < 22 &&
        Math.abs(playerSideDist - signedLatDelta) < 2.6
      ) {
        return false;
      }
    }

    return true;
  }

  public clearRacers(): void {
    for (const r of this.racers) {
      this.group.remove(r.carRig.root);
      r.carRig.dispose();
    }
    this.racers = [];
  }

  public spawnRaceOpponents(
    count: number,
    startS: number,
    difficulty: 'Easy' | 'Medium' | 'Hard' | 'Extreme',
  ): void {
    this.clearRacers();
    if (count <= 0) return;

    const names = ['Akira Kage', 'Elena Rossi', 'Kenji Drift', 'Marcus Vance', 'Sora Hayashi'];
    const diffMult =
      difficulty === 'Easy'
        ? 0.72
        : difficulty === 'Medium'
          ? 0.85
          : difficulty === 'Hard'
            ? 0.94
            : 1.02;

    const aiPaints = ['#e11d48', '#f59e0b', '#e2e8f0', '#22c55e', '#a855f7'];

    for (let i = 0; i < count; i++) {
      const spec = CAR_CATALOG[(i + 1) % CAR_CATALOG.length];
      const cust = getDefaultCustomization(spec);
      cust.paintColor = aiPaints[i % aiPaints.length];

      const rig = createCarModel(spec, cust, {
        contactShadowMap: this.sharedContactShadow,
        lightweight: true,
      });

      const lateral = (i % 2 === 0 ? -1 : 1) * 3.4;
      const sOff = -((Math.floor(i / 2) + 1) * 9) / TRACK_LENGTH_M;
      const s = (startS + sOff + 1) % 1;
      const pt = getRoadPointAt(s, lateral);

      rig.root.position.set(pt.x, pt.y, pt.z);
      rig.root.rotation.y = pt.heading;
      this.group.add(rig.root);

      this.racers.push({
        name: names[i % names.length],
        carRig: rig,
        s,
        totalS: sOff,
        lateralOffset: lateral,
        targetLateral: lateral,
        speedMs: 0,
        maxSpeedMs: (spec.topSpeedKmh / 3.6) * diffMult * (0.94 + (i % 3) * 0.03),
        massKg: spec.massKg,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        heading: pt.heading,
        hitYawOffset: 0,
        hitSpinVel: 0,
        hitRoll: 0,
        hitTimer: 0,
      });
    }
  }

  private resolveCarToCarImpact(
    player: VehiclePhysicsState,
    playerMassKg: number,
    agent: {
      x: number;
      y: number;
      z: number;
      heading: number;
      speedMs: number;
      massKg: number;
      lateralOffset: number;
      hitYawOffset: number;
      hitSpinVel: number;
      hitRoll: number;
      hitTimer: number;
      carRig: CarModelRig;
    },
    roadRx: number,
    roadRz: number,
    roadWidth: number,
  ): number {
    const pdx = player.x - agent.x;
    const pdz = player.z - agent.z;
    const d = Math.max(0.08, Math.hypot(pdx, pdz));
    const minSep = 3.45;
    if (d >= minSep) return 0;

    const nx = pdx / d; // Normal from agent -> player
    const nz = pdz / d;
    const overlap = minSep - d;

    // 2-body mass ratio impulse distribution
    const totalMass = Math.max(800, playerMassKg + agent.massKg);
    const playerShare = agent.massKg / totalMass;
    const agentShare = playerMassKg / totalMass;

    // Separate overlap physically
    player.x += nx * overlap * (0.45 + playerShare * 0.55);
    player.z += nz * overlap * (0.45 + playerShare * 0.55);

    const latPush = (nx * roadRx + nz * roadRz) * overlap * (0.45 + agentShare * 0.55);
    const maxLat = roadWidth * 0.5 - 1.0;
    agent.lateralOffset = THREE.MathUtils.clamp(agent.lateralOffset - latPush, -maxLat, maxLat);

    // Relative velocity along collision normal
    const agVx = Math.sin(agent.heading) * agent.speedMs;
    const agVz = Math.cos(agent.heading) * agent.speedMs;
    const relVx = player.vx - agVx;
    const relVz = player.vz - agVz;
    const relVn = relVx * nx + relVz * nz;

    if (relVn >= 0) return 0; // Moving apart already

    const closingSpeed = -relVn;
    const impact = Math.min(1.3, closingSpeed / 24);
    const restitution = impact > 0.35 ? 0.42 : 0.28;
    const jImpulse = -(1 + restitution) * relVn;

    // Momentum transfer onto player
    player.vx += nx * jImpulse * playerShare * 1.15;
    player.vz += nz * jImpulse * playerShare * 1.15;
    const speedScrub = THREE.MathUtils.clamp(1 - impact * 0.24, 0.58, 0.96);
    player.vx *= speedScrub;
    player.vz *= speedScrub;

    // Knockback & spin shock onto struck car
    const agLatForce = -(nx * roadRx + nz * roadRz) * closingSpeed * agentShare;
    agent.lateralOffset = THREE.MathUtils.clamp(
      agent.lateralOffset + agLatForce * 0.08,
      -maxLat,
      maxLat,
    );
    const agFwdDot = nx * Math.sin(agent.heading) + nz * Math.cos(agent.heading);
    agent.speedMs = Math.max(2, agent.speedMs - agFwdDot * closingSpeed * agentShare * 0.45);
    agent.hitSpinVel += (Math.sin(agent.heading) * nz - Math.cos(agent.heading) * nx) * impact * 5.2;
    agent.hitRoll = THREE.MathUtils.clamp(-agLatForce * 0.012, -0.22, 0.22);
    agent.hitTimer = 1.6;
    agent.carRig.setDamage(Math.min(1, impact * 0.85));

    if (impact > 0.1) {
      // Yaw spin torque + suspension slam on player car
      const pSin = Math.sin(player.heading);
      const pCos = Math.cos(player.heading);
      const torqueSign = pSin * nz - pCos * nx;
      player.angularVel += torqueSign * impact * 4.4;
      player.heaveVel -= Math.min(1.4, impact * 1.1);
      player.pitchVel += (pSin * nx + pCos * nz) * impact * 1.65;
      player.rollVel += (pCos * nx - pSin * nz) * impact * 1.95;

      player.lastCollisionImpact = Math.max(player.lastCollisionImpact, impact);
      player.lastCollisionPointX = (player.x + agent.x) * 0.5;
      player.lastCollisionPointY = (player.y + agent.y) * 0.5 + 0.42;
      player.lastCollisionPointZ = (player.z + agent.z) * 0.5;
      player.lastCollisionNx = nx;
      player.lastCollisionNz = nz;
      player.lastCollisionKind = 'car';
      player.damageLevel = Math.min(1, player.damageLevel + impact * 0.22);
    }

    return impact;
  }

  public update(
    dt: number,
    player: VehiclePhysicsState,
    playerMassKg: number,
    raceActive: boolean,
    headlightsOn: boolean,
  ): { collisionImpact: number } {
    let collisionImpact = 0;

    // 1. Update Free-Roam Highway NPC Traffic (hidden during timed races for clean racing lines)
    const showTraffic = this.racers.length === 0;
    const trafficCount = this.traffic.length;
    for (let i = 0; i < trafficCount; i++) {
      const t = this.traffic[i];
      if (!showTraffic) {
        t.carRig.root.visible = false;
        continue;
      }

      if (t.laneChangeCooldown > 0) {
        t.laneChangeCooldown = Math.max(0, t.laneChangeCooldown - dt);
      }

      const prevPt = getRoadPointAt(t.s, t.lateralOffset);
      const cornerSlow = Math.max(
        0.66,
        1 - Math.abs(prevPt.station.curvature) * 0.34,
      );
      const desiredCruise = t.baseSpeedMs * cornerSlow;

      // Scan same-direction cars ahead in this lane
      let nearestGapM = 999;
      let aheadSpeedMs = desiredCruise;

      for (let j = 0; j < trafficCount; j++) {
        if (j === i) continue;
        const other = this.traffic[j];
        if (other.dir !== t.dir) continue;
        if (
          Math.abs(other.lateralOffset - t.lateralOffset) > 2.15 &&
          Math.abs(other.targetLateral - t.lateralOffset) > 2.15
        ) {
          continue;
        }
        const rawDs = t.dir === 1 ? (other.s - t.s + 1) % 1 : (t.s - other.s + 1) % 1;
        const gapM = rawDs * TRACK_LENGTH_M;
        if (gapM > 0.2 && gapM < nearestGapM) {
          nearestGapM = gapM;
          aheadSpeedMs = other.speedMs;
        }
      }

      // Check if player is directly ahead in our exact lane (ignore oncoming or adjacent lanes)
      const pdx = player.x - t.x;
      const pdz = player.z - t.z;
      const distToPlayer = Math.hypot(pdx, pdz);
      let isBraking = false;
      let targetSpeed = desiredCruise;

      if (distToPlayer < 42 && t.hitTimer <= 0) {
        const sinH = Math.sin(t.heading);
        const cosH = Math.cos(t.heading);
        const fwdGap = pdx * sinH + pdz * cosH;
        const sideOffset = Math.abs(-cosH * pdx + sinH * pdz);
        if (fwdGap > 1.8 && fwdGap < 38 && sideOffset < 2.25 && fwdGap < nearestGapM) {
          nearestGapM = fwdGap;
          aheadSpeedMs = Math.max(0, player.vx * sinH + player.vz * cosH);
        }
      }

      if (t.hitTimer > 0) {
        t.hitTimer = Math.max(0, t.hitTimer - dt);
        t.hitYawOffset += t.hitSpinVel * dt;
        t.hitSpinVel *= Math.exp(-5.5 * dt);
        t.hitYawOffset *= Math.exp(-3.2 * dt);
        t.hitRoll *= Math.exp(-4.5 * dt);
        t.lateralOffset += (t.targetLateral - t.lateralOffset) * Math.min(1, dt * 1.8);
        t.speedMs += (t.baseSpeedMs - t.speedMs) * Math.min(1, dt * 1.2);
        isBraking = true;
      } else {
        t.hitYawOffset = 0;
        t.hitRoll = 0;

        // Overtake / lane-change logic when approaching a slower vehicle ahead
        if (nearestGapM < 36 && aheadSpeedMs < desiredCruise - 1.8) {
          if (t.laneChangeCooldown <= 0) {
            const isCurrentlyInner = Math.abs(t.targetLateral) < 3.6;
            const altLateral =
              t.dir * (isCurrentlyInner ? OUTER_LANE_OFFSET : INNER_LANE_OFFSET);
            if (
              this.isLaneWindowClear(i, t.dir, t.s, altLateral, 15, 38, player)
            ) {
              t.targetLateral = altLateral;
              t.laneChangeCooldown = 4.2 + (i % 4) * 1.1;
            }
          }

          if (nearestGapM < 9.5) {
            targetSpeed = Math.max(0.5, aheadSpeedMs * 0.52);
            isBraking = true;
          } else if (nearestGapM < 34) {
            const blend = THREE.MathUtils.clamp((nearestGapM - 9.5) / 24.5, 0, 1);
            targetSpeed = THREE.MathUtils.lerp(
              Math.max(2.0, aheadSpeedMs * 0.92),
              desiredCruise,
              blend,
            );
            isBraking = targetSpeed < t.speedMs - 1.1 || nearestGapM < 19;
          }
        } else if (
          Math.abs(t.targetLateral - t.baseLateral) > 0.25 &&
          t.laneChangeCooldown <= 0
        ) {
          // Return smoothly to home cruising lane once clear
          if (
            this.isLaneWindowClear(i, t.dir, t.s, t.baseLateral, 14, 34, player)
          ) {
            t.targetLateral = t.baseLateral;
            t.laneChangeCooldown = 3.5;
          }
        }

        const speedRate = targetSpeed < t.speedMs ? 4.8 : 2.1;
        t.speedMs += (targetSpeed - t.speedMs) * Math.min(1, dt * speedRate);

        // Hard minimum bumper floor against other same-lane NPCs so traffic never stacks
        if (nearestGapM < 6.8 && t.speedMs > aheadSpeedMs) {
          t.speedMs = Math.max(0.5, aheadSpeedMs * 0.85);
          isBraking = true;
        }
      }

      // Smooth lateral lane transition + visual lane-change steering angle
      const latDelta = t.targetLateral - t.lateralOffset;
      const latMove = THREE.MathUtils.clamp(latDelta * 2.8, -3.2, 3.2);
      t.lateralOffset += latMove * dt;
      const laneSteerVisual = THREE.MathUtils.clamp((latMove * t.dir) / 9.5, -0.22, 0.22);

      t.s = (t.s + (t.dir * t.speedMs * dt) / TRACK_LENGTH_M + 1) % 1;
      const pt = getRoadPointAt(t.s, t.lateralOffset);
      t.x = pt.x;
      t.y = pt.y;
      t.z = pt.z;
      t.heading =
        (t.dir === 1 ? pt.heading : pt.heading + Math.PI) +
        t.hitYawOffset +
        laneSteerVisual * 0.35;

      const inRange = distToPlayer < 480;
      t.carRig.root.visible = inRange;
      if (inRange) {
        t.carRig.root.position.set(t.x, t.y, t.z);

        _roadTan.set(pt.tx, pt.ty, pt.tz).normalize();
        const bankSin = Math.sin(pt.bankRad);
        const bankCos = Math.cos(pt.bankRad);
        _roadRight.set(pt.rx * bankCos, bankSin, pt.rz * bankCos).normalize();
        _roadNormal.crossVectors(_roadRight, _roadTan).normalize();
        if (_roadNormal.y < 0) _roadNormal.negate();

        _qSurface.setFromUnitVectors(_worldUp, _roadNormal);
        _qYaw.setFromAxisAngle(_worldUp, t.heading);
        t.carRig.root.quaternion.copy(_qSurface).multiply(_qYaw);

        t.carRig.setBodyTilt(
          isBraking ? -0.018 : 0,
          t.hitRoll + laneSteerVisual * 0.14,
          0,
        );
        t.carRig.setWheels(laneSteerVisual, (t.speedMs / 0.35) * dt);
        t.carRig.setLights(headlightsOn, isBraking, false);
      }

      if (distToPlayer < 3.55) {
        const hit = this.resolveCarToCarImpact(
          player,
          playerMassKg,
          t,
          pt.rx,
          pt.rz,
          pt.station.roadWidth,
        );
        if (hit > 0) {
          collisionImpact = Math.max(collisionImpact, hit);
        }
      }
    }

    // 2. Update Spline Race AI Opponents
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      if (!raceActive) {
        r.carRig.setLights(headlightsOn, false, false);
        continue;
      }

      if (r.hitTimer > 0) {
        r.hitTimer = Math.max(0, r.hitTimer - dt);
        r.hitYawOffset += r.hitSpinVel * dt;
        r.hitSpinVel *= Math.exp(-5.8 * dt);
        r.hitYawOffset *= Math.exp(-3.6 * dt);
        r.hitRoll *= Math.exp(-4.8 * dt);
      } else {
        r.hitYawOffset = 0;
        r.hitRoll = 0;
      }

      const cornerSlow = Math.max(
        0.62,
        1 - Math.abs(getRoadPointAt(r.s, 0).station.curvature) * 0.38,
      );
      const targetSpeed = r.maxSpeedMs * cornerSlow;
      r.speedMs += (targetSpeed - r.speedMs) * Math.min(1, dt * 1.8);

      const ds = (r.speedMs * dt) / TRACK_LENGTH_M;
      r.s = (r.s + ds) % 1;
      r.totalS += ds;

      r.lateralOffset += (r.targetLateral - r.lateralOffset) * Math.min(1, dt * 2.2);
      const pt = getRoadPointAt(r.s, r.lateralOffset);
      r.x = pt.x;
      r.y = pt.y;
      r.z = pt.z;
      r.heading = pt.heading + r.hitYawOffset;

      r.carRig.root.position.set(r.x, r.y, r.z);
      _roadTan.set(pt.tx, pt.ty, pt.tz).normalize();
      const bankSin = Math.sin(pt.bankRad);
      const bankCos = Math.cos(pt.bankRad);
      _roadRight.set(pt.rx * bankCos, bankSin, pt.rz * bankCos).normalize();
      _roadNormal.crossVectors(_roadRight, _roadTan).normalize();
      if (_roadNormal.y < 0) _roadNormal.negate();

      _qSurface.setFromUnitVectors(_worldUp, _roadNormal);
      _qYaw.setFromAxisAngle(_worldUp, r.heading);
      r.carRig.root.quaternion.copy(_qSurface).multiply(_qYaw);

      r.carRig.setBodyTilt(0, r.hitRoll, 0);
      r.carRig.setWheels(0, (r.speedMs / 0.35) * dt);
      r.carRig.setLights(headlightsOn, cornerSlow < 0.75 || r.hitTimer > 0, r.speedMs > 58);

      const dp = Math.hypot(player.x - r.x, player.z - r.z);
      if (dp < 3.55) {
        const hit = this.resolveCarToCarImpact(
          player,
          playerMassKg,
          r,
          pt.rx,
          pt.rz,
          pt.station.roadWidth,
        );
        if (hit > 0) {
          collisionImpact = Math.max(collisionImpact, hit);
        }
      }
    }

    return { collisionImpact };
  }

  public getNearestHeadlights(
    playerX: number,
    playerZ: number,
    out: CarHeadlightTarget[],
    maxCount = 2,
  ): number {
    out.length = 0;
    const pool = this.racers.length > 0 ? this.racers : this.traffic;
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      if (!a.carRig.root.visible) continue;
      const dx = a.x - playerX;
      const dz = a.z - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > 140 * 140) continue;
      out.push({ x: a.x, y: a.y, z: a.z, heading: a.heading, distSq });
    }
    if (out.length > maxCount) {
      out.sort((a, b) => a.distSq - b.distSq);
      out.length = maxCount;
    }
    return out.length;
  }

  public dispose(): void {
    this.clearRacers();
    for (const t of this.traffic) {
      this.group.remove(t.carRig.root);
      t.carRig.dispose();
    }
    this.traffic = [];
  }
}
