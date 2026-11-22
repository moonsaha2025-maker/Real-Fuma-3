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
  dir: 1 | -1;
  speedMs: number;
  x: number;
  y: number;
  z: number;
  heading: number;
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
  x: number;
  y: number;
  z: number;
  heading: number;
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

      rig.root.position.set(pt.x, pt.y, pt.z);
      rig.root.rotation.y = heading;

      this.traffic.push({
        carRig: rig,
        s,
        lateralOffset,
        dir,
        speedMs: 22 + (i % 4) * 3.5,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        heading,
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
        x: pt.x,
        y: pt.y,
        z: pt.z,
        heading: pt.heading,
      });
    }
  }

  public update(
    dt: number,
    player: VehiclePhysicsState,
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

      const distToPlayer = Math.hypot(player.x - t.x, player.z - t.z);
      const speedMod = distToPlayer < 16 ? 0.35 : 1.0;

      t.s = (t.s + (t.dir * t.speedMs * speedMod * dt) / TRACK_LENGTH_M + 1) % 1;
      const pt = getRoadPointAt(t.s, t.lateralOffset);
      t.x = pt.x;
      t.y = pt.y;
      t.z = pt.z;
      t.heading = t.dir === 1 ? pt.heading : pt.heading + Math.PI;

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

        t.carRig.setWheels(0, (t.speedMs * speedMod / 0.35) * dt);
        t.carRig.setLights(headlightsOn, speedMod < 0.6, false);
      }

      if (distToPlayer < 3.2) {
        const pdx = player.x - t.x;
        const pdz = player.z - t.z;
        const d = Math.max(0.1, Math.hypot(pdx, pdz));
        const pushX = pdx / d;
        const pushZ = pdz / d;
        const overlap = 3.2 - d;
        player.x += pushX * overlap * 0.75;
        player.z += pushZ * overlap * 0.75;
        const impact = Math.min(1, Math.hypot(player.vx, player.vz) / 30);
        if (impact > 0.14) {
          player.vx *= 0.68;
          player.vz *= 0.68;
          collisionImpact = Math.max(collisionImpact, impact);
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
      r.heading = pt.heading;

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

      r.carRig.setWheels(0, (r.speedMs / 0.35) * dt);
      r.carRig.setLights(headlightsOn, cornerSlow < 0.75, r.speedMs > 58);

      const dp = Math.hypot(player.x - r.x, player.z - r.z);
      if (dp < 3.1) {
        const nx = (player.x - r.x) / Math.max(0.1, dp);
        const nz = (player.z - r.z) / Math.max(0.1, dp);
        const overlap = 3.1 - dp;
        player.x += nx * overlap * 0.65;
        player.z += nz * overlap * 0.65;
        collisionImpact = Math.max(collisionImpact, 0.3);
      }
    }

    return { collisionImpact };
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
