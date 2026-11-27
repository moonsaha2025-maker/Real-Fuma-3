import * as THREE from 'three';
import { getTerrainHeight, WORLD_HALF_SIZE } from '../data/track';
import { CarBaseSpec } from '../types/game';
import { audioEngine } from './audio';
import { CrashEffectsSystem } from './crashEffects';
import { VehiclePhysicsState } from './physics';
import {
  BreakableFenceSegment,
  BreakableLampPole,
  BuiltWorld,
  TreeCollider,
} from './worldBuilder';

const GRID_RES = 48;
const GRID_MIN = -WORLD_HALF_SIZE;
const GRID_SPAN = WORLD_HALF_SIZE * 2;

const MAX_DYN_POSTS = 48;
const MAX_DYN_RAILS = 96;
const MAX_DYN_POLES = 24;

const _zeroScaleMat = new THREE.Matrix4().makeScale(0, 0, 0);
const _dummy = new THREE.Object3D();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpVec = new THREE.Vector3();
const _tmpColor = new THREE.Color();

interface FlyingBody {
  active: boolean;
  settled: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  avx: number;
  avy: number;
  avz: number;
  halfH: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  age: number;
}

export interface PropCollisionFeedback {
  cameraShake: number;
  crashFlash: number;
  crashRoll: number;
  joltX: number;
  joltZ: number;
  hitstop: boolean;
}

export class PropPhysicsSystem {
  public readonly group = new THREE.Group();

  // Spatial buckets for O(1) per-frame collision checks
  private readonly treeBuckets: number[][] = Array.from(
    { length: GRID_RES * GRID_RES },
    () => [],
  );
  private readonly fenceBuckets: number[][] = Array.from(
    { length: GRID_RES * GRID_RES },
    () => [],
  );
  private readonly lampBuckets: number[][] = Array.from(
    { length: GRID_RES * GRID_RES },
    () => [],
  );

  // Dynamic pooled flying fence posts & rails
  private readonly postGeo: THREE.BoxGeometry;
  private readonly railGeo: THREE.BoxGeometry;
  private readonly woodMat: THREE.MeshStandardMaterial;
  private readonly dynPostInst: THREE.InstancedMesh;
  private readonly dynRailInst: THREE.InstancedMesh;
  private readonly dynPosts: FlyingBody[] = [];
  private readonly dynRails: FlyingBody[] = [];
  private postCursor = 0;
  private railCursor = 0;

  // Dynamic pooled knocked-down street lamp poles & luminaires
  private readonly poleGeo: THREE.CylinderGeometry;
  private readonly poleMat: THREE.MeshStandardMaterial;
  private readonly lampHeadGeo: THREE.BoxGeometry;
  private readonly lampHeadMat: THREE.MeshStandardMaterial;
  private readonly dynPoleInst: THREE.InstancedMesh;
  private readonly dynLampHeadInst: THREE.InstancedMesh;
  private readonly dynPoles: Array<FlyingBody & { side: number; origYaw: number }> = [];
  private poleCursor = 0;

  // Reusable zero-allocation sample points along car hull (front, mid, rear)
  private readonly sampleX = new Float64Array(3);
  private readonly sampleZ = new Float64Array(3);

  constructor(world: BuiltWorld) {
    // 1. Index static trees, fences, and lamp poles into spatial hash
    this.indexSpatialProps(world);

    // 2. Dynamic Fence Fragment Pools
    this.postGeo = new THREE.BoxGeometry(0.15, 0.9, 0.15);
    this.railGeo = new THREE.BoxGeometry(0.08, 0.1, 5.45);
    this.woodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
    });

    this.dynPostInst = new THREE.InstancedMesh(
      this.postGeo,
      this.woodMat,
      MAX_DYN_POSTS,
    );
    this.dynPostInst.frustumCulled = false;
    this.dynPostInst.castShadow = true;

    this.dynRailInst = new THREE.InstancedMesh(
      this.railGeo,
      this.woodMat,
      MAX_DYN_RAILS,
    );
    this.dynRailInst.frustumCulled = false;
    this.dynRailInst.castShadow = false;

    for (let i = 0; i < MAX_DYN_POSTS; i++) {
      this.dynPosts.push(this.createEmptyBody(0.45));
      this.dynPostInst.setMatrixAt(i, _zeroScaleMat);
      this.dynPostInst.setColorAt(i, _tmpColor.setHex(0x8a6946));
    }
    for (let i = 0; i < MAX_DYN_RAILS; i++) {
      this.dynRails.push(this.createEmptyBody(0.06));
      this.dynRailInst.setMatrixAt(i, _zeroScaleMat);
      this.dynRailInst.setColorAt(i, _tmpColor.setHex(0x8a6946));
    }
    this.dynPostInst.instanceMatrix.needsUpdate = true;
    this.dynRailInst.instanceMatrix.needsUpdate = true;
    if (this.dynPostInst.instanceColor) this.dynPostInst.instanceColor.needsUpdate = true;
    if (this.dynRailInst.instanceColor) this.dynRailInst.instanceColor.needsUpdate = true;
    this.group.add(this.dynPostInst, this.dynRailInst);

    // 3. Dynamic Street Lamp Pole & Luminaire Pools
    this.poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.6, 8);
    this.poleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.72,
      roughness: 0.36,
    });
    this.lampHeadGeo = new THREE.BoxGeometry(1.1, 0.22, 0.45);
    this.lampHeadMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      emissive: 0x332211,
      emissiveIntensity: 0.1,
      roughness: 0.35,
      metalness: 0.5,
    });

    this.dynPoleInst = new THREE.InstancedMesh(
      this.poleGeo,
      this.poleMat,
      MAX_DYN_POLES,
    );
    this.dynPoleInst.frustumCulled = false;
    this.dynPoleInst.castShadow = true;

    this.dynLampHeadInst = new THREE.InstancedMesh(
      this.lampHeadGeo,
      this.lampHeadMat,
      MAX_DYN_POLES,
    );
    this.dynLampHeadInst.frustumCulled = false;

    for (let i = 0; i < MAX_DYN_POLES; i++) {
      this.dynPoles.push({
        ...this.createEmptyBody(3.8),
        side: 1,
        origYaw: 0,
      });
      this.dynPoleInst.setMatrixAt(i, _zeroScaleMat);
      this.dynLampHeadInst.setMatrixAt(i, _zeroScaleMat);
    }
    this.dynPoleInst.instanceMatrix.needsUpdate = true;
    this.dynLampHeadInst.instanceMatrix.needsUpdate = true;
    this.group.add(this.dynPoleInst, this.dynLampHeadInst);
  }

  private createEmptyBody(halfH: number): FlyingBody {
    return {
      active: false,
      settled: false,
      x: 0,
      y: -9999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      avx: 0,
      avy: 0,
      avz: 0,
      halfH,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      age: 0,
    };
  }

  private gridIndex(x: number, z: number): { gx: number; gz: number } {
    const gx = THREE.MathUtils.clamp(
      Math.floor(((x - GRID_MIN) / GRID_SPAN) * GRID_RES),
      0,
      GRID_RES - 1,
    );
    const gz = THREE.MathUtils.clamp(
      Math.floor(((z - GRID_MIN) / GRID_SPAN) * GRID_RES),
      0,
      GRID_RES - 1,
    );
    return { gx, gz };
  }

  private indexSpatialProps(world: BuiltWorld): void {
    const insert = (buckets: number[][], x: number, z: number, idx: number) => {
      const { gx, gz } = this.gridIndex(x, z);
      buckets[gz * GRID_RES + gx].push(idx);
    };
    world.treeColliders.forEach((t, i) => insert(this.treeBuckets, t.x, t.z, i));
    world.fenceSegments.forEach((f, i) => insert(this.fenceBuckets, f.x, f.z, i));
    world.lampPoles.forEach((l, i) => insert(this.lampBuckets, l.x, l.z, i));
  }

  public resetProps(world: BuiltWorld): void {
    // Restore intact fences
    const touchedFenceMeshes = new Set<THREE.InstancedMesh>();
    for (let i = 0; i < world.fenceSegments.length; i++) {
      const seg = world.fenceSegments[i];
      if (!seg.intact) {
        seg.intact = true;
        seg.postInst.setMatrixAt(seg.postIdx, seg.postMatrix);
        seg.railInst.setMatrixAt(seg.railIdx0, seg.railMatrix0);
        seg.railInst.setMatrixAt(seg.railIdx1, seg.railMatrix1);
        touchedFenceMeshes.add(seg.postInst);
        touchedFenceMeshes.add(seg.railInst);
      }
    }
    touchedFenceMeshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
    });

    // Restore intact lamp poles & lights
    const touchedLampMeshes = new Set<THREE.InstancedMesh>();
    for (let i = 0; i < world.lampPoles.length; i++) {
      const lp = world.lampPoles[i];
      if (!lp.intact) {
        lp.intact = true;
        lp.poleInst.setMatrixAt(lp.poleIdx, lp.poleMatrix);
        lp.lampInst.setMatrixAt(lp.lampIdx, lp.lampMatrix);
        touchedLampMeshes.add(lp.poleInst);
        touchedLampMeshes.add(lp.lampInst);
      }
      if (world.lampPositions[lp.lightIdx]) {
        world.lampPositions[lp.lightIdx].broken = false;
      }
    }
    touchedLampMeshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
    });

    // Clear all flying pooled fragments
    for (let i = 0; i < MAX_DYN_POSTS; i++) {
      this.dynPosts[i].active = false;
      this.dynPostInst.setMatrixAt(i, _zeroScaleMat);
    }
    for (let i = 0; i < MAX_DYN_RAILS; i++) {
      this.dynRails[i].active = false;
      this.dynRailInst.setMatrixAt(i, _zeroScaleMat);
    }
    for (let i = 0; i < MAX_DYN_POLES; i++) {
      this.dynPoles[i].active = false;
      this.dynPoleInst.setMatrixAt(i, _zeroScaleMat);
      this.dynLampHeadInst.setMatrixAt(i, _zeroScaleMat);
    }
    this.dynPostInst.instanceMatrix.needsUpdate = true;
    this.dynRailInst.instanceMatrix.needsUpdate = true;
    this.dynPoleInst.instanceMatrix.needsUpdate = true;
    this.dynLampHeadInst.instanceMatrix.needsUpdate = true;
  }

  private spawnFenceDebris(
    seg: BreakableFenceSegment,
    carVx: number,
    carVz: number,
    hitDirX: number,
    hitDirZ: number,
  ): void {
    const colorHex = seg.isWhiteCoastal ? 0xf1ede4 : 0x8a6946;
    const speed = Math.hypot(carVx, carVz);
    const launchBoost = Math.min(18, 4.5 + speed * 0.58);

    // 1. Flying wooden post
    const pi = this.postCursor;
    this.postCursor = (this.postCursor + 1) % MAX_DYN_POSTS;
    const p = this.dynPosts[pi];
    p.active = true;
    p.settled = false;
    p.age = 0;
    p.x = seg.x;
    p.y = seg.y + 0.45;
    p.z = seg.z;
    p.vx = carVx * 0.52 + hitDirX * launchBoost + (Math.random() - 0.5) * 4.2;
    p.vy = 3.2 + Math.min(7.5, speed * 0.25) + Math.random() * 2.5;
    p.vz = carVz * 0.52 + hitDirZ * launchBoost + (Math.random() - 0.5) * 4.2;
    p.rx = 0;
    p.ry = seg.yaw;
    p.rz = 0;
    p.avx = (Math.random() - 0.5) * 11;
    p.avy = (Math.random() - 0.5) * 8;
    p.avz = (Math.random() - 0.5) * 11;
    p.halfH = 0.44;
    p.scaleX = 1;
    p.scaleY = 1;
    p.scaleZ = 1;
    this.dynPostInst.setColorAt(pi, _tmpColor.setHex(colorHex));
    if (this.dynPostInst.instanceColor) this.dynPostInst.instanceColor.needsUpdate = true;

    // 2. Two flying horizontal fence rails
    const railHeights = [0.75, 0.42];
    for (let r = 0; r < 2; r++) {
      const ri = this.railCursor;
      this.railCursor = (this.railCursor + 1) % MAX_DYN_RAILS;
      const rail = this.dynRails[ri];
      rail.active = true;
      rail.settled = false;
      rail.age = 0;
      rail.x = seg.x;
      rail.y = seg.y + railHeights[r];
      rail.z = seg.z;
      rail.vx = carVx * 0.48 + hitDirX * (launchBoost * (0.85 + r * 0.25)) + (Math.random() - 0.5) * 5.2;
      rail.vy = 2.6 + Math.min(6.5, speed * 0.22) + Math.random() * 2.4;
      rail.vz = carVz * 0.48 + hitDirZ * (launchBoost * (0.85 + r * 0.25)) + (Math.random() - 0.5) * 5.2;
      rail.rx = (Math.random() - 0.5) * 0.25;
      rail.ry = seg.yaw;
      rail.rz = (Math.random() - 0.5) * 0.25;
      rail.avx = (Math.random() - 0.5) * 7.5;
      rail.avy = (Math.random() - 0.5) * 9.5;
      rail.avz = (Math.random() - 0.5) * 7.5;
      rail.halfH = 0.08;
      rail.scaleX = 1;
      rail.scaleY = 1;
      rail.scaleZ = seg.railLen / 5.45;
      this.dynRailInst.setColorAt(ri, _tmpColor.setHex(colorHex));
    }
    if (this.dynRailInst.instanceColor) this.dynRailInst.instanceColor.needsUpdate = true;
  }

  private spawnLampDebris(
    lamp: BreakableLampPole,
    carVx: number,
    carVz: number,
    hitDirX: number,
    hitDirZ: number,
  ): void {
    const idx = this.poleCursor;
    this.poleCursor = (this.poleCursor + 1) % MAX_DYN_POLES;
    const body = this.dynPoles[idx];
    const speed = Math.hypot(carVx, carVz);

    body.active = true;
    body.settled = false;
    body.age = 0;
    body.x = lamp.x;
    body.y = lamp.y + 3.8;
    body.z = lamp.z;
    body.vx = carVx * 0.42 + hitDirX * Math.min(14, 3.5 + speed * 0.34);
    body.vy = 2.4 + Math.min(5.2, speed * 0.14);
    body.vz = carVz * 0.42 + hitDirZ * Math.min(14, 3.5 + speed * 0.34);

    // Topple cleanly in the impact direction
    const toppleDirX = hitDirX;
    const toppleDirZ = hitDirZ;
    body.rx = 0.05;
    body.ry = lamp.yaw;
    body.rz = 0;
    // Rotate perpendicular to horizontal motion vector so pole tips away from car nose
    body.avx = toppleDirZ * (2.6 + Math.min(3.5, speed * 0.1));
    body.avy = (Math.random() - 0.5) * 2.2;
    body.avz = -toppleDirX * (2.6 + Math.min(3.5, speed * 0.1));
    body.halfH = 0.28; // once horizontal on ground
    body.scaleX = 1;
    body.scaleY = 1;
    body.scaleZ = 1;
    body.side = lamp.side;
    body.origYaw = lamp.yaw;
  }

  private stepFlyingFragments(dt: number): void {
    let postsDirty = false;
    for (let i = 0; i < MAX_DYN_POSTS; i++) {
      const b = this.dynPosts[i];
      if (!b.active) continue;
      postsDirty = true;
      b.age += dt;
      if (b.age > 9.0) {
        b.active = false;
        this.dynPostInst.setMatrixAt(i, _zeroScaleMat);
        continue;
      }
      if (!b.settled) {
        b.vy -= 19.6 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rx += b.avx * dt;
        b.ry += b.avy * dt;
        b.rz += b.avz * dt;
        const groundY = getTerrainHeight(b.x, b.z) + 0.12;
        if (b.y < groundY) {
          b.y = groundY;
          if (Math.abs(b.vy) > 1.8) {
            b.vy = Math.abs(b.vy) * 0.34;
          } else {
            b.vy = 0;
          }
          b.vx *= 0.68;
          b.vz *= 0.68;
          b.avx *= 0.58;
          b.avy *= 0.58;
          b.avz *= 0.58;
          if (
            b.vy === 0 &&
            Math.hypot(b.vx, b.vz) < 0.35 &&
            Math.abs(b.avx) + Math.abs(b.avz) < 0.4
          ) {
            b.settled = true;
          }
        }
      }
      const fadeScale = b.age > 7.5 ? Math.max(0.01, (9.0 - b.age) / 1.5) : 1;
      _dummy.position.set(b.x, b.y, b.z);
      _dummy.rotation.set(b.rx, b.ry, b.rz);
      _dummy.scale.set(b.scaleX * fadeScale, b.scaleY * fadeScale, b.scaleZ * fadeScale);
      _dummy.updateMatrix();
      this.dynPostInst.setMatrixAt(i, _dummy.matrix);
    }
    if (postsDirty) this.dynPostInst.instanceMatrix.needsUpdate = true;

    let railsDirty = false;
    for (let i = 0; i < MAX_DYN_RAILS; i++) {
      const b = this.dynRails[i];
      if (!b.active) continue;
      railsDirty = true;
      b.age += dt;
      if (b.age > 9.0) {
        b.active = false;
        this.dynRailInst.setMatrixAt(i, _zeroScaleMat);
        continue;
      }
      if (!b.settled) {
        b.vy -= 19.6 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rx += b.avx * dt;
        b.ry += b.avy * dt;
        b.rz += b.avz * dt;
        const groundY = getTerrainHeight(b.x, b.z) + 0.08;
        if (b.y < groundY) {
          b.y = groundY;
          b.vy = Math.abs(b.vy) > 1.6 ? Math.abs(b.vy) * 0.3 : 0;
          b.vx *= 0.65;
          b.vz *= 0.65;
          b.avx *= 0.55;
          b.avy *= 0.55;
          b.avz *= 0.55;
          if (b.vy === 0 && Math.hypot(b.vx, b.vz) < 0.35) {
            b.settled = true;
          }
        }
      }
      const fadeScale = b.age > 7.5 ? Math.max(0.01, (9.0 - b.age) / 1.5) : 1;
      _dummy.position.set(b.x, b.y, b.z);
      _dummy.rotation.set(b.rx, b.ry, b.rz);
      _dummy.scale.set(b.scaleX * fadeScale, b.scaleY * fadeScale, b.scaleZ * fadeScale);
      _dummy.updateMatrix();
      this.dynRailInst.setMatrixAt(i, _dummy.matrix);
    }
    if (railsDirty) this.dynRailInst.instanceMatrix.needsUpdate = true;

    let polesDirty = false;
    for (let i = 0; i < MAX_DYN_POLES; i++) {
      const b = this.dynPoles[i];
      if (!b.active) continue;
      polesDirty = true;
      b.age += dt;
      if (b.age > 11.0) {
        b.active = false;
        this.dynPoleInst.setMatrixAt(i, _zeroScaleMat);
        this.dynLampHeadInst.setMatrixAt(i, _zeroScaleMat);
        continue;
      }
      if (!b.settled) {
        b.vy -= 19.6 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rx += b.avx * dt;
        b.ry += b.avy * dt;
        b.rz += b.avz * dt;

        // Compute bottom & top tip height clearance so long 7.6m pole lands naturally flat
        _tmpEuler.set(b.rx, b.ry, b.rz);
        _tmpQuat.setFromEuler(_tmpEuler);
        _tmpVec.set(0, 3.8, 0).applyQuaternion(_tmpQuat);
        const lowestTipOffset = Math.abs(_tmpVec.y) + 0.15;
        const groundY = getTerrainHeight(b.x, b.z) + lowestTipOffset;
        if (b.y < groundY) {
          b.y = groundY;
          b.vy = Math.abs(b.vy) > 1.8 ? Math.abs(b.vy) * 0.28 : 0;
          b.vx *= 0.64;
          b.vz *= 0.64;
          b.avx *= 0.56;
          b.avy *= 0.56;
          b.avz *= 0.56;
          if (b.vy === 0 && Math.hypot(b.vx, b.vz) < 0.3 && Math.abs(_tmpVec.y) < 0.85) {
            b.settled = true;
          }
        }
      }

      const fadeScale = b.age > 9.4 ? Math.max(0.01, (11.0 - b.age) / 1.6) : 1;
      _dummy.position.set(b.x, b.y, b.z);
      _dummy.rotation.set(b.rx, b.ry, b.rz);
      _dummy.scale.setScalar(fadeScale);
      _dummy.updateMatrix();
      this.dynPoleInst.setMatrixAt(i, _dummy.matrix);

      // Transform attached luminaire arm head relative to pole center (+3.75m up, -0.5*side*cos(origYaw) -> local -0.55*side*X in pole frame when oriented at yaw)
      _tmpEuler.set(b.rx, b.ry, b.rz);
      _tmpQuat.setFromEuler(_tmpEuler);
      _tmpVec.set(-b.side * 0.55, 3.75, 0).applyQuaternion(_tmpQuat);
      _dummy.position.set(
        b.x + _tmpVec.x * fadeScale,
        b.y + _tmpVec.y * fadeScale,
        b.z + _tmpVec.z * fadeScale,
      );
      _dummy.rotation.set(b.rx, b.ry, b.rz);
      _dummy.scale.setScalar(fadeScale);
      _dummy.updateMatrix();
      this.dynLampHeadInst.setMatrixAt(i, _dummy.matrix);
    }
    if (polesDirty) {
      this.dynPoleInst.instanceMatrix.needsUpdate = true;
      this.dynLampHeadInst.instanceMatrix.needsUpdate = true;
    }
  }

  public update(
    dt: number,
    physics: VehiclePhysicsState,
    spec: CarBaseSpec,
    world: BuiltWorld,
    crashEffects: CrashEffectsSystem,
  ): PropCollisionFeedback {
    this.stepFlyingFragments(dt);

    const feedback: PropCollisionFeedback = {
      cameraShake: 0,
      crashFlash: 0,
      crashRoll: 0,
      joltX: 0,
      joltZ: 0,
      hitstop: false,
    };

    const sinH = Math.sin(physics.heading);
    const cosH = Math.cos(physics.heading);
    const halfLen = spec.dimensions.length * 0.34;
    const carRadius = spec.dimensions.width * 0.48;

    // 3 oriented sample circles along vehicle chassis (front, center, rear)
    this.sampleX[0] = physics.x + sinH * halfLen;
    this.sampleZ[0] = physics.z + cosH * halfLen;
    this.sampleX[1] = physics.x;
    this.sampleZ[1] = physics.z;
    this.sampleX[2] = physics.x - sinH * halfLen;
    this.sampleZ[2] = physics.z - cosH * halfLen;

    const { gx, gz } = this.gridIndex(physics.x, physics.z);
    const speed = Math.hypot(physics.vx, physics.vz);
    const hitDirX = speed > 0.25 ? physics.vx / speed : sinH;
    const hitDirZ = speed > 0.25 ? physics.vz / speed : cosH;

    let touchedFenceInst = false;
    let touchedLampInst = false;

    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox;
      if (cx < 0 || cx >= GRID_RES) continue;
      for (let oz = -1; oz <= 1; oz++) {
        const cz = gz + oz;
        if (cz < 0 || cz >= GRID_RES) continue;
        const bucketIdx = cz * GRID_RES + cx;

        // 1. Solid Tree Trunk Physics + Canopy Spring Impulse
        const trees = this.treeBuckets[bucketIdx];
        for (let t = 0; t < trees.length; t++) {
          const tree: TreeCollider = world.treeColliders[trees[t]];
          if (Math.abs(physics.y - tree.y) > 4.5) continue;

          const minDist = carRadius + tree.radius;
          const minDistSq = minDist * minDist;

          let hitDistSq = Infinity;
          let bestDx = 0;
          let bestDz = 0;
          let hitPtX = physics.x;
          let hitPtZ = physics.z;

          for (let s = 0; s < 3; s++) {
            const dx = this.sampleX[s] - tree.x;
            const dz = this.sampleZ[s] - tree.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < minDistSq && d2 < hitDistSq) {
              hitDistSq = d2;
              bestDx = dx;
              bestDz = dz;
              hitPtX = this.sampleX[s];
              hitPtZ = this.sampleZ[s];
            }
          }

          if (hitDistSq < minDistSq) {
            const dist = Math.max(0.05, Math.sqrt(hitDistSq));
            const nx = bestDx / dist; // normal away from trunk toward car
            const nz = bestDz / dist;
            const overlap = minDist - dist;

            physics.x += nx * overlap;
            physics.z += nz * overlap;

            const vToward = -(physics.vx * nx + physics.vz * nz);
            const impact = THREE.MathUtils.clamp(Math.max(0.18, vToward / 22), 0.16, 1.3);

            if (vToward > 0) {
              const restitution = impact > 0.4 ? 0.34 : 0.2;
              physics.vx += (1 + restitution) * vToward * nx;
              physics.vz += (1 + restitution) * vToward * nz;

              const scrub = THREE.MathUtils.clamp(1 - impact * 0.25, 0.52, 0.94);
              physics.vx *= scrub;
              physics.vz *= scrub;

              // Trigger dramatic tree crown whip & shedding particles!
              world.triggerTreeImpulse(
                tree.x,
                tree.z,
                -nx,
                -nz,
                Math.max(0.45, impact * 1.45),
              );

              if (impact > 0.15) {
                physics.damageLevel = Math.min(1, physics.damageLevel + impact * 0.18);
                const crossSign = sinH * nz - cosH * nx;
                physics.angularVel += crossSign * impact * 2.2;
                physics.heaveVel -= Math.min(1.4, impact * 1.0);
                physics.pitchVel += impact * 1.3;
                physics.rollVel += Math.sign(crossSign || 1) * impact * 1.4;

                const contactX = tree.x + nx * tree.radius;
                const contactZ = tree.z + nz * tree.radius;
                audioEngine.playCollision(impact, 'rail');
                crashEffects.emitCrashBurst({
                  x: contactX,
                  y: physics.y + 0.55,
                  z: contactZ,
                  nx,
                  nz,
                  carVx: physics.vx,
                  carVz: physics.vz,
                  intensity: impact,
                  carColorHex: '#2f6b28',
                  kind: 'rail',
                });

                feedback.cameraShake = Math.max(feedback.cameraShake, Math.min(0.85, impact * 0.72));
                feedback.crashFlash = Math.max(feedback.crashFlash, Math.min(1, impact * 0.9));
                const crashSide = cosH * nx - sinH * nz;
                feedback.crashRoll += crashSide * impact * 0.14;
                feedback.joltX -= nx * Math.min(0.55, impact * 0.45);
                feedback.joltZ -= nz * Math.min(0.55, impact * 0.45);
                if (impact > 0.55) feedback.hitstop = true;
              }
            }
            void hitPtX;
            void hitPtZ;
          }
        }

        // 2. Breakable Coastal & Countryside Wooden Fence Physics
        const fences = this.fenceBuckets[bucketIdx];
        for (let f = 0; f < fences.length; f++) {
          const seg = world.fenceSegments[fences[f]];
          if (!seg.intact) continue;
          if (Math.abs(physics.y - seg.y) > 2.6) continue;

          // Distance from car sample spheres to fence post+rail span center
          const halfRail = seg.railLen * 0.46;
          const fSin = Math.sin(seg.yaw);
          const fCos = Math.cos(seg.yaw);
          let hit = false;
          for (let s = 0; s < 3; s++) {
            const dx = this.sampleX[s] - seg.x;
            const dz = this.sampleZ[s] - seg.z;
            // Project onto fence tangent (rail axis) & normal
            const along = dx * fSin + dz * fCos;
            const perp = dx * fCos - dz * fSin;
            if (Math.abs(along) <= halfRail + carRadius * 0.7 && Math.abs(perp) <= carRadius + 0.25) {
              hit = true;
              break;
            }
          }

          if (hit && speed > 1.6) {
            seg.intact = false;
            seg.postInst.setMatrixAt(seg.postIdx, _zeroScaleMat);
            seg.railInst.setMatrixAt(seg.railIdx0, _zeroScaleMat);
            seg.railInst.setMatrixAt(seg.railIdx1, _zeroScaleMat);
            seg.postInst.instanceMatrix.needsUpdate = true;
            seg.railInst.instanceMatrix.needsUpdate = true;
            touchedFenceInst = true;

            this.spawnFenceDebris(seg, physics.vx, physics.vz, hitDirX, hitDirZ);

            // Light splintering scrub + tactile thump
            const hitInt = THREE.MathUtils.clamp(0.16 + speed * 0.008, 0.16, 0.48);
            physics.vx *= 0.96;
            physics.vz *= 0.96;
            physics.heaveVel -= 0.35;
            physics.pitchVel += 0.24;

            audioEngine.playCollision(hitInt, 'rail');
            crashEffects.emitCrashBurst({
              x: seg.x,
              y: seg.y + 0.52,
              z: seg.z,
              nx: -hitDirX,
              nz: -hitDirZ,
              carVx: physics.vx,
              carVz: physics.vz,
              intensity: 0.34,
              carColorHex: seg.isWhiteCoastal ? '#f1ede4' : '#8a6946',
              kind: 'rail',
            });

            feedback.cameraShake = Math.max(feedback.cameraShake, 0.19);
            feedback.crashFlash = Math.max(feedback.crashFlash, 0.14);
          }
        }

        // 3. Breakable Street Lamp Pole Physics + Light Cutout
        const lamps = this.lampBuckets[bucketIdx];
        for (let l = 0; l < lamps.length; l++) {
          const lamp: BreakableLampPole = world.lampPoles[lamps[l]];
          if (!lamp.intact) continue;
          if (Math.abs(physics.y - lamp.y) > 3.2) continue;

          const minDist = carRadius + 0.35;
          const minDistSq = minDist * minDist;
          let hit = false;
          for (let s = 0; s < 3; s++) {
            const dx = this.sampleX[s] - lamp.x;
            const dz = this.sampleZ[s] - lamp.z;
            if (dx * dx + dz * dz < minDistSq) {
              hit = true;
              break;
            }
          }

          if (hit && speed > 2.2) {
            lamp.intact = false;
            lamp.poleInst.setMatrixAt(lamp.poleIdx, _zeroScaleMat);
            lamp.lampInst.setMatrixAt(lamp.lampIdx, _zeroScaleMat);
            lamp.poleInst.instanceMatrix.needsUpdate = true;
            lamp.lampInst.instanceMatrix.needsUpdate = true;
            if (world.lampPositions[lamp.lightIdx]) {
              world.lampPositions[lamp.lightIdx].broken = true;
            }
            touchedLampInst = true;

            this.spawnLampDebris(lamp, physics.vx, physics.vz, hitDirX, hitDirZ);

            const hitInt = THREE.MathUtils.clamp(0.28 + speed * 0.015, 0.28, 0.92);
            physics.vx *= 0.86;
            physics.vz *= 0.86;
            physics.damageLevel = Math.min(1, physics.damageLevel + 0.065);
            physics.heaveVel -= 0.72;
            physics.pitchVel += 0.75;

            audioEngine.playCollision(hitInt, 'rail');
            crashEffects.emitCrashBurst({
              x: lamp.x,
              y: lamp.y + 0.75,
              z: lamp.z,
              nx: -hitDirX,
              nz: -hitDirZ,
              carVx: physics.vx,
              carVz: physics.vz,
              intensity: Math.max(0.45, hitInt),
              carColorHex: '#94a3b8',
              kind: 'rail',
            });

            feedback.cameraShake = Math.max(feedback.cameraShake, 0.42);
            feedback.crashFlash = Math.max(feedback.crashFlash, 0.28);
            feedback.joltX -= hitDirX * 0.24;
            feedback.joltZ -= hitDirZ * 0.24;
          }
        }
      }
    }

    void touchedFenceInst;
    void touchedLampInst;
    return feedback;
  }

  public dispose(): void {
    this.postGeo.dispose();
    this.railGeo.dispose();
    this.woodMat.dispose();
    this.poleGeo.dispose();
    this.poleMat.dispose();
    this.lampHeadGeo.dispose();
    this.lampHeadMat.dispose();
  }
}
