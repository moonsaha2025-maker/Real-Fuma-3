import * as THREE from 'three';
import { CarBaseSpec } from '../types/game';
import { getRoadPointAt } from '../data/track';
import { VehiclePhysicsState } from './physics';

const MAX_SKID_SEGMENTS = 900;

const _dummy = new THREE.Object3D();
const _roadNormal = new THREE.Vector3();
const _roadRight = new THREE.Vector3();
const _roadTan = new THREE.Vector3();
const _matBasis = new THREE.Matrix4();
const _segFwd = new THREE.Vector3();
const _segSide = new THREE.Vector3();

/**
 * Pooled InstancedMesh ring-buffer for realistic rear-tire rubber skidmarks
 * laid flush onto the banked spline asphalt surface during drifts & burnouts.
 */
export class TireSkidmarkSystem {
  public readonly mesh: THREE.InstancedMesh;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshBasicMaterial;
  private cursor = 0;
  private prevLeftX = 0;
  private prevLeftZ = 0;
  private prevRightX = 0;
  private prevRightZ = 0;
  private hadPrev = false;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(0.28, 1.0);
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.MeshBasicMaterial({
      color: 0x0f1115,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_SKID_SEGMENTS);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX_SKID_SEGMENTS;

    _dummy.position.set(0, -9999, 0);
    _dummy.scale.set(0.001, 0.001, 0.001);
    _dummy.updateMatrix();
    for (let i = 0; i < MAX_SKID_SEGMENTS; i++) {
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public clear(): void {
    this.hadPrev = false;
    this.cursor = 0;
    _dummy.position.set(0, -9999, 0);
    _dummy.scale.set(0.001, 0.001, 0.001);
    _dummy.updateMatrix();
    for (let i = 0; i < MAX_SKID_SEGMENTS; i++) {
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private placeSegment(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y: number,
    roadNormal: THREE.Vector3,
  ): void {
    const dx = bx - ax;
    const dz = bz - az;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.08 || segLen > 6.0) return;

    _segFwd.set(dx, 0, dz).normalize();
    _segSide.crossVectors(roadNormal, _segFwd).normalize();
    _segFwd.crossVectors(_segSide, roadNormal).normalize();
    _matBasis.makeBasis(_segSide, roadNormal, _segFwd);

    _dummy.position.set((ax + bx) * 0.5, y + 0.028, (az + bz) * 0.5);
    _dummy.quaternion.setFromRotationMatrix(_matBasis);
    _dummy.scale.set(1.0, 1.0, segLen * 1.15);
    _dummy.updateMatrix();

    this.mesh.setMatrixAt(this.cursor, _dummy.matrix);
    this.cursor = (this.cursor + 1) % MAX_SKID_SEGMENTS;
  }

  public update(
    physics: VehiclePhysicsState,
    carSpec: CarBaseSpec,
    handbrake: boolean,
    isBurnout: boolean,
  ): void {
    const shouldMark =
      physics.grounded &&
      physics.surface === 'asphalt' &&
      ((physics.driftAngleDeg > 10 && physics.speedKmh > 14) ||
        (handbrake && physics.speedKmh > 18) ||
        isBurnout);

    if (!shouldMark) {
      this.hadPrev = false;
      return;
    }

    const sinH = Math.sin(physics.heading);
    const cosH = Math.cos(physics.heading);
    const rearZ = -carSpec.dimensions.length * 0.31;
    const halfTrack = carSpec.dimensions.width * 0.42;

    const lx = halfTrack * cosH + rearZ * sinH + physics.x;
    const lz = -halfTrack * sinH + rearZ * cosH + physics.z;
    const rx = -halfTrack * cosH + rearZ * sinH + physics.x;
    const rz = halfTrack * sinH + rearZ * cosH + physics.z;

    if (!this.hadPrev) {
      this.prevLeftX = lx;
      this.prevLeftZ = lz;
      this.prevRightX = rx;
      this.prevRightZ = rz;
      this.hadPrev = true;
      return;
    }

    const dist = Math.hypot(lx - this.prevLeftX, lz - this.prevLeftZ);
    if (dist < 0.25) return;

    const pt = getRoadPointAt(physics.trackProgress, 0);
    _roadTan.set(pt.tx, pt.ty, pt.tz).normalize();
    const bankSin = Math.sin(physics.trackBankRad);
    const bankCos = Math.cos(physics.trackBankRad);
    _roadRight.set(pt.rx * bankCos, bankSin, pt.rz * bankCos).normalize();
    _roadNormal.crossVectors(_roadRight, _roadTan).normalize();
    if (_roadNormal.y < 0) _roadNormal.negate();

    this.placeSegment(this.prevLeftX, this.prevLeftZ, lx, lz, physics.y, _roadNormal);
    this.placeSegment(this.prevRightX, this.prevRightZ, rx, rz, physics.y, _roadNormal);
    this.mesh.instanceMatrix.needsUpdate = true;

    this.prevLeftX = lx;
    this.prevLeftZ = lz;
    this.prevRightX = rx;
    this.prevRightZ = rz;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
