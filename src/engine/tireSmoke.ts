import * as THREE from 'three';
import { CarBaseSpec, ControlInputState, WeatherType } from '../types/game';
import { VehiclePhysicsState } from './physics';
import { WindFieldState } from './wind';

const MAX_PARTICLES = 440;

export interface TireSmokeUpdateOptions {
  driftThresholdDeg?: number;
  daylightFactor?: number;
  driftActive?: boolean;
  wind?: WindFieldState;
}

export class TireSmokeSystem {
  public readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly alphas = new Float32Array(MAX_PARTICLES);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly rotations = new Float32Array(MAX_PARTICLES);

  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly startSize = new Float32Array(MAX_PARTICLES);
  private readonly endSize = new Float32Array(MAX_PARTICLES);
  private readonly peakAlpha = new Float32Array(MAX_PARTICLES);
  private readonly spinVel = new Float32Array(MAX_PARTICLES);

  private readonly posAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly rotAttr: THREE.BufferAttribute;

  private cursor = 0;
  private emitAccumulator = 0;

  constructor(initialViewportHeightPx = 720) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.positions[i * 3 + 1] = -9999;
      this.life[i] = 0;
      this.alphas[i] = 0;
      this.sizes[i] = 1;
    }

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.rotAttr = new THREE.BufferAttribute(this.rotations, 1);

    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.rotAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aRotation', this.rotAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelHeight: { value: Math.max(240, initialViewportHeightPx) },
      },
      blending: THREE.NormalBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        attribute float aRotation;
        uniform float uPixelHeight;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;

        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vRotation = aRotation;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = max(1.0, -mvPosition.z);
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.96 / dist), 1.0, 260.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;

        void main() {
          if (vAlpha <= 0.002) discard;

          vec2 centered = gl_PointCoord - 0.5;
          float c = cos(vRotation);
          float s = sin(vRotation);
          vec2 p = vec2(
            c * centered.x - s * centered.y,
            s * centered.x + c * centered.y
          );

          float r = length(p) * 2.0;
          if (r >= 1.0) discard;

          float lobeA = sin(p.x * 8.5 + 1.2) * cos(p.y * 8.5 - 0.7) * 0.14;
          float lobeB = cos((p.x - p.y) * 11.0 + 0.4) * 0.08;
          float radial = clamp(1.0 - r + lobeA + lobeB, 0.0, 1.0);
          float softPuff = smoothstep(0.0, 0.86, radial);
          float alpha = pow(softPuff, 1.32) * vAlpha;

          // Subtle top-lit volumetric rim vs cooler underside
          float rimShade = clamp(0.84 + (-centered.y * 0.24 - centered.x * 0.08), 0.72, 1.08);
          vec3 litColor = min(vec3(1.0), vColor * rimShade);

          gl_FragColor = vec4(litColor, alpha);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  public setViewportHeight(pixelHeight: number): void {
    this.material.uniforms.uPixelHeight.value = Math.max(240, pixelHeight);
  }

  public clear(): void {
    this.emitAccumulator = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.life[i] = 0;
      this.alphas[i] = 0;
      this.positions[i * 3 + 1] = -9999;
    }
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    lifeSec: number,
    sSize: number,
    eSize: number,
    alpha: number,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;

    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;

    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;

    this.colors[i3] = r;
    this.colors[i3 + 1] = g;
    this.colors[i3 + 2] = b;

    this.life[i] = lifeSec;
    this.maxLife[i] = lifeSec;
    this.startSize[i] = sSize;
    this.endSize[i] = eSize;
    this.peakAlpha[i] = alpha;

    this.sizes[i] = sSize;
    this.alphas[i] = 0.01;
    this.rotations[i] = Math.random() * Math.PI * 2;
    this.spinVel[i] = (Math.random() - 0.5) * 2.1;
  }

  /**
   * Emits an immediate multi-puff burst behind both rear tires when driftAngleDeg
   * first crosses the active drift threshold.
   */
  public emitDriftEntryBurst(
    physics: VehiclePhysicsState,
    carSpec: CarBaseSpec,
    daylightFactor = 1,
  ): void {
    if (!physics.grounded) return;
    const sinH = Math.sin(physics.heading);
    const cosH = Math.cos(physics.heading);
    const rearZ = -carSpec.dimensions.length * 0.31;
    const halfTrack = carSpec.dimensions.width * 0.42;
    const wheelY = physics.y + 0.16;
    const ambientLit = 0.34 + 0.66 * Math.max(0, Math.min(1, daylightFactor));
    const latThrow = -Math.sign(physics.lateralSpeedMs || 0) * 1.4;
    const baseVx = physics.vx * 0.2 - sinH * 1.8 + cosH * latThrow;
    const baseVz = physics.vz * 0.2 - cosH * 1.8 - sinH * latThrow;

    const puffsPerTire = physics.surface === 'asphalt' ? 3 : 2;
    for (const side of [-1, 1]) {
      const lx = side * halfTrack;
      const anchorX = physics.x + lx * cosH + rearZ * sinH;
      const anchorZ = physics.z - lx * sinH + rearZ * cosH;
      for (let k = 0; k < puffsPerTire; k++) {
        const tint = (0.86 + Math.random() * 0.12) * ambientLit;
        this.spawnParticle(
          anchorX + (Math.random() - 0.5) * 0.26,
          wheelY + Math.random() * 0.08,
          anchorZ + (Math.random() - 0.5) * 0.26,
          baseVx + (Math.random() - 0.5) * 2.4,
          1.15 + Math.random() * 0.9,
          baseVz + (Math.random() - 0.5) * 2.4,
          tint,
          tint * 1.01,
          tint * 1.04,
          0.95 + Math.random() * 0.45,
          0.55 + Math.random() * 0.2,
          2.6 + Math.random() * 0.9,
          0.42,
        );
      }
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.rotAttr.needsUpdate = true;
  }

  public update(
    dt: number,
    physics: VehiclePhysicsState,
    carSpec: CarBaseSpec,
    input: ControlInputState,
    weather: WeatherType,
    options?: TireSmokeUpdateOptions,
  ): void {
    const thresholdDeg = options?.driftThresholdDeg ?? 10;
    const daylightFactor = Math.max(0, Math.min(1, options?.daylightFactor ?? 1));
    const ambientLit = 0.34 + 0.66 * daylightFactor;

    const isWetWeather =
      weather === 'rain' ||
      weather === 'heavy_rain' ||
      weather === 'thunderstorm';

    const driftTriggered =
      options?.driftActive ??
      ((physics.driftAngleDeg > thresholdDeg && physics.speedKmh > 14) ||
        (input.handbrake && physics.speedKmh > 18));
    const isBurnout =
      physics.surface === 'asphalt' &&
      input.throttle > 0.65 &&
      input.brake > 0.35 &&
      physics.speedKmh < 28;
    const isOffroadSpray =
      physics.surface !== 'asphalt' &&
      (physics.speedKmh > 18 || physics.driftAngleDeg > thresholdDeg);

    if (physics.grounded && (driftTriggered || isBurnout || isOffroadSpray)) {
      const slipExcess = Math.max(0, physics.driftAngleDeg - (thresholdDeg - 1));
      const slipStrength = driftTriggered
        ? Math.min(1, 0.36 + slipExcess / 26)
        : isBurnout
          ? 0.9
          : Math.min(0.92, physics.speedKmh / 105);

      // Surface-calibrated smoke/dust/spray profile for NormalBlending volumetric puffs
      let cr = (0.86 + 0.08 * slipStrength) * ambientLit;
      let cg = (0.87 + 0.07 * slipStrength) * ambientLit;
      let cb = (0.91 + 0.05 * slipStrength) * ambientLit;
      let lifeMin = 1.05 + slipStrength * 0.25;
      let lifeSpan = 0.5;
      let sSize = 0.56 + slipStrength * 0.14;
      let eSize = 3.15 + slipStrength * 1.15;
      let upVel = 1.35 + slipStrength * 0.55;
      let peakA = (0.34 + slipStrength * 0.24) * (0.82 + 0.18 * daylightFactor);
      let emitRate = 24 + slipStrength * 34;

      if (physics.surface === 'asphalt') {
        if (isWetWeather && !isBurnout) {
          cr = 0.72 * ambientLit;
          cg = 0.80 * ambientLit;
          cb = 0.88 * ambientLit;
          lifeMin = 0.75;
          lifeSpan = 0.35;
          eSize = 3.4 + slipStrength * 0.8;
          upVel = 1.75;
          peakA = 0.28 + slipStrength * 0.18;
        }
      } else if (physics.surface === 'dirt') {
        cr = 0.68 * ambientLit;
        cg = 0.50 * ambientLit;
        cb = 0.30 * ambientLit;
        lifeMin = 0.95;
        lifeSpan = 0.45;
        sSize = 0.64;
        eSize = 3.55;
        upVel = 1.85;
        peakA = 0.40 + slipStrength * 0.16;
      } else if (physics.surface === 'grass') {
        cr = 0.50 * ambientLit;
        cg = 0.60 * ambientLit;
        cb = 0.32 * ambientLit;
        lifeMin = 0.85;
        lifeSpan = 0.4;
        sSize = 0.6;
        eSize = 3.2;
        upVel = 1.7;
        peakA = 0.34 + slipStrength * 0.14;
      } else if (physics.surface === 'sand') {
        cr = 0.82 * ambientLit;
        cg = 0.68 * ambientLit;
        cb = 0.44 * ambientLit;
        lifeMin = 0.85;
        lifeSpan = 0.4;
        sSize = 0.66;
        eSize = 3.35;
        upVel = 2.35;
        peakA = 0.42 + slipStrength * 0.15;
        emitRate += 8;
      } else if (physics.surface === 'snow') {
        cr = 0.88 * ambientLit;
        cg = 0.93 * ambientLit;
        cb = 0.98 * ambientLit;
        lifeMin = 0.8;
        lifeSpan = 0.35;
        sSize = 0.6;
        eSize = 3.1;
        upVel = 2.4;
        peakA = 0.44 + slipStrength * 0.16;
        emitRate += 8;
      } else if (physics.surface === 'water') {
        cr = 0.74 * ambientLit;
        cg = 0.86 * ambientLit;
        cb = 0.94 * ambientLit;
        lifeMin = 0.55;
        lifeSpan = 0.3;
        sSize = 0.64;
        eSize = 3.0;
        upVel = 3.1;
        peakA = 0.42;
      }

      this.emitAccumulator += dt * emitRate;
      const pairsToEmit = Math.min(5, Math.floor(this.emitAccumulator));
      if (pairsToEmit > 0) {
        this.emitAccumulator -= pairsToEmit;

        const sinH = Math.sin(physics.heading);
        const cosH = Math.cos(physics.heading);
        const rearZ = -carSpec.dimensions.length * 0.31;
        const halfTrack = carSpec.dimensions.width * 0.42;

        // World velocity contribution, rear-ward wheel spray & outward drift wake curl
        const latCurl = -Math.sign(physics.lateralSpeedMs || 0) * (0.9 + slipStrength * 1.4);
        const baseVx = physics.vx * 0.22 - sinH * 1.7 + cosH * latCurl;
        const baseVz = physics.vz * 0.22 - cosH * 1.7 - sinH * latCurl;
        const wheelY = physics.y + 0.16;

        for (let p = 0; p < pairsToEmit; p++) {
          for (const side of [-1, 1]) {
            const lx = side * halfTrack;
            const wx =
              physics.x +
              lx * cosH +
              rearZ * sinH +
              (Math.random() - 0.5) * 0.24;
            const wz =
              physics.z -
              lx * sinH +
              rearZ * cosH +
              (Math.random() - 0.5) * 0.24;

            const tintVar = 0.92 + Math.random() * 0.14;
            this.spawnParticle(
              wx,
              wheelY + Math.random() * 0.08,
              wz,
              baseVx + (Math.random() - 0.5) * 2.2,
              upVel * (0.75 + Math.random() * 0.5),
              baseVz + (Math.random() - 0.5) * 2.2,
              Math.min(1, cr * tintVar),
              Math.min(1, cg * tintVar),
              Math.min(1, cb * tintVar),
              lifeMin + Math.random() * lifeSpan,
              sSize * (0.85 + Math.random() * 0.3),
              eSize * (0.88 + Math.random() * 0.35),
              peakA,
            );
          }
        }
      }
    } else {
      this.emitAccumulator = 0;
    }

    // Advance active particles (zero heap allocations)
    const drag = Math.exp(-2.4 * dt);
    let anyActive = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const rem = this.life[i];
      if (rem <= 0) continue;

      const nextRem = rem - dt;
      this.life[i] = nextRem;
      if (nextRem <= 0) {
        this.alphas[i] = 0;
        this.positions[i * 3 + 1] = -9999;
        anyActive = true;
        continue;
      }

      anyActive = true;
      const i3 = i * 3;
      const windVx = options?.wind ? options.wind.dirX * options.wind.speedMs * 0.24 : 0;
      const windVz = options?.wind ? options.wind.dirZ * options.wind.speedMs * 0.24 : 0;
      this.velocities[i3] = this.velocities[i3] * drag + windVx * dt * 2.2;
      this.velocities[i3 + 1] *= Math.exp(-1.1 * dt);
      this.velocities[i3 + 2] = this.velocities[i3 + 2] * drag + windVz * dt * 2.2;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const progress = Math.min(1, Math.max(0, 1 - nextRem / this.maxLife[i]));
      const oneMinus = Math.max(0, 1 - progress);
      // Fast billowy expansion then gentle plateau
      const expand = 1 - Math.pow(oneMinus, 2.2);
      this.sizes[i] =
        this.startSize[i] + (this.endSize[i] - this.startSize[i]) * expand;

      // Smooth fade-in over first 12% of life, soft fade-out over remainder
      const fadeIn = Math.min(1, progress / 0.12);
      const fadeOut = Math.pow(oneMinus, 1.35);
      this.alphas[i] = this.peakAlpha[i] * fadeIn * fadeOut;
      this.rotations[i] += this.spinVel[i] * dt;
    }

    if (anyActive) {
      this.posAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
      this.rotAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
