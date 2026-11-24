import * as THREE from 'three';
import { CAR_CATALOG, getDefaultCustomization } from '../data/cars';
import { getRoadPointAt, TRACK_LENGTH_M } from '../data/track';
import { CarModelRig, createCarModel } from './carModel';
import { VehiclePhysicsState } from './physics';

const _worldUp = new THREE.Vector3(0, 1, 0);
const _roadTan = new THREE.Vector3();
const _roadRight = new THREE.Vector3();
const _roadNormal = new THREE.Vector3();
const _qSurface = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();

export interface TrafficAgent {
  carRig: CarModelRig;
  s: number; // 0..1 spline progress
  lateralOffset: number;
  baseLateral: number;
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

  constructor(contactShadow?: THREE.Texture) {
    this.sharedContactShadow = contactShadow;
    this.spawnLoopTraffic();
  }

  private spawnLoopTraffic(): void {
    const paints = ['#dc2626', '#cbd5e1', '#f59e0b', '#0f172a', '#e2e8f0', '#38bdf8'];
    const count = 14;

    for (let i = 0; i < count; i++) {
      const spec = CAR_CATALOG[(i % (CAR_CATALOG.length - 1)) + 1];
      const cust = getDefaultCustomization(spec);
      cust.paintColor = paints[i % paints.length];
      cust.paintFinish = 'metallic';
      cust.spoiler = i % 3 === 0 ? 'gt_wing' : 'lip';

      const rig = createCarModel(spec, cust, {
        contactShadowMap: this.sharedContactShadow,
        lightweight: true,
      });
      this.group.add(rig.root);

      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const s = (0.12 + i / count) % 1;
      const lateralOffset = dir === 1 ? 3.5 : -3.5;
      const pt = getRoadPointAt(s, lateralOffset);
      const heading = dir === 1 ? pt.heading : pt.heading + Math.PI;
      const baseSpeedMs = 22 + (i % 4) * 3.5;

      rig.root.position.set(pt.x, pt.y, pt.z);
      rig.root.rotation.y = heading;

      this.traffic.push({
        carRig: rig,
        s,
        lateralOffset,
        baseLateral: lateralOffset,
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

    // 1. Update Free-Roam Sports Traffic (hidden during timed races for clean racing lines)
    const showTraffic = this.racers.length === 0;
    for (const t of this.traffic) {
      if (!showTraffic) {
        t.carRig.root.visible = false;
        continue;
      }

      if (t.hitTimer > 0) {
        t.hitTimer = Math.max(0, t.hitTimer - dt);
        t.hitYawOffset += t.hitSpinVel * dt;
        t.hitSpinVel *= Math.exp(-5.5 * dt);
        t.hitYawOffset *= Math.exp(-3.2 * dt);
        t.hitRoll *= Math.exp(-4.5 * dt);
        t.lateralOffset += (t.baseLateral - t.lateralOffset) * Math.min(1, dt * 1.4);
        t.speedMs += (t.baseSpeedMs - t.speedMs) * Math.min(1, dt * 1.2);
      } else {
        t.hitYawOffset = 0;
        t.hitRoll = 0;
      }

      const distToPlayer = Math.hypot(player.x - t.x, player.z - t.z);
      const speedMod = distToPlayer < 16 && t.hitTimer <= 0 ? 0.38 : 1.0;

      t.s = (t.s + (t.dir * t.speedMs * speedMod * dt) / TRACK_LENGTH_M + 1) % 1;
      const pt = getRoadPointAt(t.s, t.lateralOffset);
      t.x = pt.x;
      t.y = pt.y;
      t.z = pt.z;
      t.heading = (t.dir === 1 ? pt.heading : pt.heading + Math.PI) + t.hitYawOffset;

      const inRange = distToPlayer < 460;
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

        t.carRig.setBodyTilt(0, t.hitRoll, 0);
        t.carRig.setWheels(0, (t.speedMs * speedMod / 0.35) * dt);
        t.carRig.setLights(headlightsOn, speedMod < 0.6 || t.hitTimer > 0, false);
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

      const cornerSlow = Math.max(0.62, 1 - Math.abs(getRoadPointAt(r.s, 0).station.curvature) * 0.38);
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
