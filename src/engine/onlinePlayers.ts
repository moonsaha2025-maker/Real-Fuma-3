import * as THREE from 'three';
import { getCarSpec, getDefaultCustomization } from '../data/cars';
import { getDriveSurfaceHeight, projectOntoTrack } from '../data/track';
import type { CarCustomization, OnlinePlayerState } from '../types/game';
import { CarModelRig, createCarModel } from './carModel';
import type { CarHeadlightTarget } from './trafficAndAI';
import type { VehiclePhysicsState } from './physics';

const _worldUp = new THREE.Vector3(0, 1, 0);
const _roadTan = new THREE.Vector3();
const _roadRight = new THREE.Vector3();
const _roadNormal = new THREE.Vector3();
const _qSurface = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();

interface RemotePlayerVisual {
  uid: string;
  carKey: string;
  labelKey: string;
  carRig: CarModelRig;
  nameSprite: THREE.Sprite;
  nameTexture: THREE.CanvasTexture;
  nameMaterial: THREE.SpriteMaterial;
  // Current interpolated state
  x: number;
  y: number;
  z: number;
  heading: number;
  speedKmh: number;
  steerAngle: number;
  braking: boolean;
  nitroActive: boolean;
  headlightsOn: boolean;
  // Latest authoritative target from Firestore
  targetX: number;
  targetY: number;
  targetZ: number;
  targetHeading: number;
  targetVx: number;
  targetVz: number;
  targetSpeedKmh: number;
  targetSteerAngle: number;
  packetReceivedAtMs: number;
  lastServerUpdateMs: number;
  lastChangedLocalMs: number;
  googleDisplayName: string;
  googlePhotoURL: string;
  driverName: string;
  carName: string;
}

function wrapAngleDelta(target: number, current: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function buildNameplateTexture(
  googleDisplayName: string,
  driverName: string,
  carName: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sleek dark obsidian nameplate card with chamfered corners
    const x = 18;
    const y = 16;
    const w = canvas.width - 36;
    const h = canvas.height - 42;
    const cut = 14;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(7, 10, 18, 0.88)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
    ctx.stroke();

    // Google identity "G" emblem chip on left
    const badgeCx = x + 36;
    const badgeCy = y + h * 0.5;
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, 19, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2563eb';
    ctx.fillText('G', badgeCx, badgeCy + 1);

    // Primary line: Google Account Display Name
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 31px "Chakra Petch", system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    const maxNameWidth = w - 90;
    let displayText = googleDisplayName.trim() || 'Google Driver';
    while (displayText.length > 3 && ctx.measureText(displayText).width > maxNameWidth) {
      displayText = `${displayText.slice(0, -2)}…`;
    }
    ctx.fillText(displayText, x + 70, y + 44);

    // Secondary line: @driverName · Car model
    ctx.font = '600 19px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#6ee7b7';
    let subText = `@${driverName} · ${carName}`;
    while (subText.length > 6 && ctx.measureText(subText).width > maxNameWidth) {
      subText = `${subText.slice(0, -2)}…`;
    }
    ctx.fillText(subText, x + 70, y + 76);

    // Bottom pointer triangle toward vehicle roof
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 11, y + h);
    ctx.lineTo(canvas.width / 2 + 11, y + h);
    ctx.lineTo(canvas.width / 2, y + h + 16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class OnlinePlayersManager {
  public group = new THREE.Group();
  private sharedContactShadow?: THREE.Texture;
  private players = new Map<string, RemotePlayerVisual>();
  private bumpCooldown = 0;

  constructor(contactShadow?: THREE.Texture) {
    this.sharedContactShadow = contactShadow;
  }

  public syncRemotePlayers(
    remoteList: OnlinePlayerState[],
    localUid: string | null,
  ): void {
    const now = Date.now();
    const activeUids = new Set<string>();

    for (const rp of remoteList) {
      if (!rp.uid || rp.uid === localUid) continue;
      activeUids.add(rp.uid);

      const spec = getCarSpec(rp.carId);
      const carKey = `${spec.id}|${rp.paintColor}|${rp.paintFinish}|${rp.spoiler}|${rp.bodyKit}`;
      const labelKey = `${rp.googleDisplayName}|${rp.driverName}|${spec.id}`;
      const existing = this.players.get(rp.uid);

      if (!existing) {
        const cust: CarCustomization = {
          ...getDefaultCustomization(spec),
          paintColor: rp.paintColor || spec.defaultColor,
          paintFinish: rp.paintFinish,
          spoiler: rp.spoiler,
          bodyKit: rp.bodyKit,
        };
        const rig = createCarModel(spec, cust, {
          contactShadowMap: this.sharedContactShadow,
          lightweight: true,
        });
        this.group.add(rig.root);

        const tex = buildNameplateTexture(
          rp.googleDisplayName,
          rp.driverName,
          spec.name,
        );
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          depthTest: true,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(0, 2.38, 0);
        sprite.scale.set(4.1, 1.15, 1);
        rig.root.add(sprite);

        rig.root.position.set(rp.x, rp.y, rp.z);
        rig.root.rotation.y = rp.heading;

        this.players.set(rp.uid, {
          uid: rp.uid,
          carKey,
          labelKey,
          carRig: rig,
          nameSprite: sprite,
          nameTexture: tex,
          nameMaterial: mat,
          x: rp.x,
          y: rp.y,
          z: rp.z,
          heading: rp.heading,
          speedKmh: rp.speedKmh,
          steerAngle: rp.steerAngle,
          braking: rp.braking,
          nitroActive: rp.nitroActive,
          headlightsOn: rp.headlightsOn,
          targetX: rp.x,
          targetY: rp.y,
          targetZ: rp.z,
          targetHeading: rp.heading,
          targetVx: rp.vx,
          targetVz: rp.vz,
          targetSpeedKmh: rp.speedKmh,
          targetSteerAngle: rp.steerAngle,
          packetReceivedAtMs: now,
          lastServerUpdateMs: rp.updatedAtMs,
          lastChangedLocalMs: now,
          googleDisplayName: rp.googleDisplayName,
          googlePhotoURL: rp.googlePhotoURL,
          driverName: rp.driverName,
          carName: spec.name,
        });
        continue;
      }

      // Rebuild car rig only if vehicle or paint/kit changed
      if (existing.carKey !== carKey) {
        existing.carRig.root.remove(existing.nameSprite);
        this.group.remove(existing.carRig.root);
        existing.carRig.dispose();

        const cust: CarCustomization = {
          ...getDefaultCustomization(spec),
          paintColor: rp.paintColor || spec.defaultColor,
          paintFinish: rp.paintFinish,
          spoiler: rp.spoiler,
          bodyKit: rp.bodyKit,
        };
        const newRig = createCarModel(spec, cust, {
          contactShadowMap: this.sharedContactShadow,
          lightweight: true,
        });
        newRig.root.add(existing.nameSprite);
        this.group.add(newRig.root);
        existing.carRig = newRig;
        existing.carKey = carKey;
        existing.carName = spec.name;
      }

      // Rebuild Google nameplate texture only if display name, driver handle, or car changed
      if (existing.labelKey !== labelKey) {
        const newTex = buildNameplateTexture(
          rp.googleDisplayName,
          rp.driverName,
          spec.name,
        );
        existing.nameMaterial.map = newTex;
        existing.nameMaterial.needsUpdate = true;
        existing.nameTexture.dispose();
        existing.nameTexture = newTex;
        existing.labelKey = labelKey;
        existing.googleDisplayName = rp.googleDisplayName;
        existing.driverName = rp.driverName;
        existing.carName = spec.name;
      }

      const changed =
        rp.updatedAtMs !== existing.lastServerUpdateMs ||
        Math.abs(rp.x - existing.targetX) > 0.05 ||
        Math.abs(rp.z - existing.targetZ) > 0.05;
      if (changed) {
        existing.lastChangedLocalMs = now;
        existing.lastServerUpdateMs = rp.updatedAtMs;
        existing.packetReceivedAtMs = now;
      }

      // Snap if remote player teleported or fast-traveled across the world (> 75m)
      if (Math.hypot(rp.x - existing.x, rp.z - existing.z) > 75) {
        existing.x = rp.x;
        existing.y = rp.y;
        existing.z = rp.z;
        existing.heading = rp.heading;
      }

      existing.targetX = rp.x;
      existing.targetY = rp.y;
      existing.targetZ = rp.z;
      existing.targetHeading = rp.heading;
      existing.targetVx = rp.vx;
      existing.targetVz = rp.vz;
      existing.targetSpeedKmh = rp.speedKmh;
      existing.targetSteerAngle = rp.steerAngle;
      existing.braking = rp.braking;
      existing.nitroActive = rp.nitroActive;
      existing.headlightsOn = rp.headlightsOn;
      existing.googlePhotoURL = rp.googlePhotoURL;
    }

    // Remove players who left the room cleanly
    for (const [uid, visual] of this.players.entries()) {
      if (!activeUids.has(uid)) {
        this.disposeVisual(visual);
        this.players.delete(uid);
      }
    }
  }

  public update(
    dt: number,
    player: VehiclePhysicsState,
    defaultHeadlightsOn: boolean,
    elapsedTime: number,
  ): { collisionImpact: number } {
    const now = Date.now();
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    let collisionImpact = 0;

    for (const [uid, p] of this.players.entries()) {
      // Remove stale ghost players that closed the tab without clean disconnect (>25s stale)
      const localAgeMs = now - p.lastChangedLocalMs;
      const serverAgeMs = now - p.lastServerUpdateMs;
      if (localAgeMs > 24000 && serverAgeMs > 28000) {
        this.disposeVisual(p);
        this.players.delete(uid);
        continue;
      }

      // Dead-reckoning prediction capped at 0.45s
      const packetAgeSec = Math.min(0.45, Math.max(0, (now - p.packetReceivedAtMs) / 1000));
      const predX = p.targetX + p.targetVx * packetAgeSec;
      const predZ = p.targetZ + p.targetVz * packetAgeSec;

      const posLerp = 1 - Math.exp(-9.5 * dt);
      p.x += (predX - p.x) * posLerp;
      p.z += (predZ - p.z) * posLerp;
      p.heading += wrapAngleDelta(p.targetHeading, p.heading) * (1 - Math.exp(-10.5 * dt));
      p.speedKmh += (p.targetSpeedKmh - p.speedKmh) * posLerp;
      p.steerAngle += (p.targetSteerAngle - p.steerAngle) * posLerp;

      const proj = projectOntoTrack(p.x, p.z);
      const st = proj.station;
      const groundY = getDriveSurfaceHeight(p.x, p.z, proj.stationIdx);
      p.y += (groundY - p.y) * (1 - Math.exp(-16 * dt));

      const distToPlayer = Math.hypot(p.x - player.x, p.z - player.z);
      const visible = distToPlayer < 680;
      p.carRig.root.visible = visible;
      if (!visible) continue;

      p.carRig.root.position.set(p.x, p.y, p.z);

      // Align smoothly with road banking when on asphalt, flat normal off-road
      if (Math.abs(proj.lateralOffset) <= st.roadWidth * 0.62) {
        _roadTan.set(st.tx, st.ty, st.tz).normalize();
        const bankSin = Math.sin(st.bankRad);
        const bankCos = Math.cos(st.bankRad);
        _roadRight.set(st.rx * bankCos, bankSin, st.rz * bankCos).normalize();
        _roadNormal.crossVectors(_roadRight, _roadTan).normalize();
        if (_roadNormal.y < 0) _roadNormal.negate();
        _qSurface.setFromUnitVectors(_worldUp, _roadNormal);
      } else {
        _qSurface.identity();
      }
      _qYaw.setFromAxisAngle(_worldUp, p.heading);
      p.carRig.root.quaternion.copy(_qSurface).multiply(_qYaw);

      const speedMs = p.speedKmh / 3.6;
      p.carRig.setWheels(p.steerAngle, (speedMs / 0.35) * dt);
      p.carRig.setBodyTilt(
        p.braking ? -0.02 : p.nitroActive ? 0.015 : 0,
        THREE.MathUtils.clamp(-p.steerAngle * 0.08, -0.06, 0.06),
        0,
      );
      p.carRig.setLights(
        p.headlightsOn || defaultHeadlightsOn,
        p.braking,
        p.nitroActive,
        elapsedTime,
      );

      // Dynamic nameplate scale & opacity scaling with distance for readability
      const nameScale = THREE.MathUtils.clamp(3.6 + distToPlayer * 0.028, 3.6, 8.8);
      p.nameSprite.scale.set(nameScale, nameScale * (144 / 512), 1);
      p.nameSprite.position.y = THREE.MathUtils.clamp(2.35 + distToPlayer * 0.018, 2.35, 4.6);
      p.nameMaterial.opacity =
        distToPlayer > 240
          ? THREE.MathUtils.clamp(1 - (distToPlayer - 240) / 140, 0.15, 1)
          : 1;

      // Gentle elastic side-by-side bump with local player (prevents clipping without launching cars)
      if (distToPlayer < 2.95 && distToPlayer > 0.05) {
        const nx = (player.x - p.x) / distToPlayer;
        const nz = (player.z - p.z) / distToPlayer;
        const overlap = 2.95 - distToPlayer;
        player.x += nx * overlap * 0.48;
        player.z += nz * overlap * 0.48;

        const relVx = player.vx - p.targetVx;
        const relVz = player.vz - p.targetVz;
        const approach = relVx * nx + relVz * nz;
        if (approach < -1.5 && this.bumpCooldown <= 0) {
          const push = Math.min(10, -approach * 0.55);
          player.vx += nx * push;
          player.vz += nz * push;
          player.lastCollisionNx = nx;
          player.lastCollisionNz = nz;
          player.lastCollisionPointX = (player.x + p.x) * 0.5;
          player.lastCollisionPointY = player.y + 0.65;
          player.lastCollisionPointZ = (player.z + p.z) * 0.5;
          player.lastCollisionKind = 'car';
          collisionImpact = Math.min(0.65, push / 14);
          this.bumpCooldown = 0.28;
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
  ): void {
    for (const p of this.players.values()) {
      if (!p.carRig.root.visible) continue;
      const dx = p.x - playerX;
      const dz = p.z - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > 220 * 220) continue;
      out.push({
        x: p.x,
        y: p.y,
        z: p.z,
        heading: p.heading,
        distSq,
      });
    }
    if (out.length > maxCount) {
      out.sort((a, b) => a.distSq - b.distSq);
      out.length = maxCount;
    }
  }

  public getTelemetryList(): Array<{
    uid: string;
    googleDisplayName: string;
    googlePhotoURL: string;
    driverName: string;
    carName: string;
    x: number;
    z: number;
    heading: number;
    speedKmh: number;
  }> {
    const out: Array<{
      uid: string;
      googleDisplayName: string;
      googlePhotoURL: string;
      driverName: string;
      carName: string;
      x: number;
      z: number;
      heading: number;
      speedKmh: number;
    }> = [];
    for (const p of this.players.values()) {
      out.push({
        uid: p.uid,
        googleDisplayName: p.googleDisplayName,
        googlePhotoURL: p.googlePhotoURL,
        driverName: p.driverName,
        carName: p.carName,
        x: p.x,
        z: p.z,
        heading: p.heading,
        speedKmh: Math.round(p.speedKmh),
      });
    }
    return out;
  }

  public clear(): void {
    for (const visual of this.players.values()) {
      this.disposeVisual(visual);
    }
    this.players.clear();
  }

  private disposeVisual(visual: RemotePlayerVisual): void {
    visual.carRig.root.remove(visual.nameSprite);
    this.group.remove(visual.carRig.root);
    visual.carRig.dispose();
    visual.nameTexture.dispose();
    visual.nameMaterial.dispose();
  }

  public dispose(): void {
    this.clear();
  }
}
