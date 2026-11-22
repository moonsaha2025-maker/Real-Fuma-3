import * as THREE from 'three';
import { CarBaseSpec, ControlInputState, WeatherType } from '../types/game';
import { VehiclePhysicsState } from './physics';

const MAX_PARTICLES = 360;

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
      blending: THREE.AdditiveBlending,
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
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.92 / dist), 1.0, 240.0);
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

          float lobeA = sin(p.x * 8.5 + 1.2) * cos(p.y * 8.5 - 0.7) * 0.13;
          float lobeB = cos((p.x - p.y) * 11.0 + 0.4) * 0.07;
          float radial = clamp(1.0 - r + lobeA + lobeB, 0.0, 1.0);
          float softPuff = smoothstep(0.0, 0.88, radial);
          float alpha = pow(softPuff, 1.45) * vAlpha;

          gl_FragColor = vec4(vColor * alpha, alpha);
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
    this.spinVel[i] = (Math.random() - 0.5) * 1.8;
  }

  public update(
    dt: number,
    physics: VehiclePhysicsState,
    carSpec: CarBaseSpec,
    input: ControlInputState,
    weather: WeatherType,
  ): void {
    const isWetWeather =
      weather === 'rain' ||
      weather === 'heavy_rain' ||
      weather === 'thunderstorm';

    const driftTriggered =
      (physics.driftAngleDeg > 15 && physics.speedKmh > 16) ||
      (input.handbrake && physics.speedKmh > 20);
    const isBurnout =
      physics.surface === 'asphalt' &&
      input.throttle > 0.65 &&
      input.brake > 0.35 &&
      physics.speedKmh < 28;
    const isOffroadSpray =
      physics.surface !== 'asphalt' &&
      (physics.speedKmh > 26 || physics.driftAngleDeg > 15);

    if (physics.grounded && (driftTriggered || isBurnout || isOffroadSpray)) {
      const slipStrength = driftTriggered
        ? Math.min(1, 0.42 + Math.max(0, physics.driftAngleDeg - 13) / 28)
        : isBurnout
          ? 0.85
          : Math.min(0.9, physics.speedKmh / 110);

      // Surface-calibrated smoke/dust/spray profile for additive blending
      let cr = 0.45;
      let cg = 0.48;
      let cb = 0.54;
      let lifeMin = 1.05;
      let lifeSpan = 0.45;
      let sSize = 0.55;
      let eSize = 3.25;
      let upVel = 1.45;
      let peakA = 0.24 * (0.55 + slipStrength * 0.45);
      let emitRate = 22 + slipStrength * 28;

      if (physics.surface === 'asphalt') {
        if (isWetWeather && !isBurnout) {
          cr = 0.36;
          cg = 0.45;
          cb = 0.55;
          lifeMin = 0.75;
          lifeSpan = 0.35;
          eSize = 3.5;
          upVel = 1.7;
          peakA = 0.21 * (0.5 + slipStrength * 0.5);
        }
      } else if (physics.surface === 'dirt') {
        cr = 0.44;
        cg = 0.31;
        cb = 0.18;
        lifeMin = 0.9;
        lifeSpan = 0.45;
        sSize = 0.62;
        eSize = 3.45;
        upVel = 1.8;
        peakA = 0.23;
      } else if (physics.surface === 'grass') {
        cr = 0.32;
        cg = 0.39;
        cb = 0.20;
        lifeMin = 0.85;
        lifeSpan = 0.4;
        sSize = 0.58;
        eSize = 3.1;
        upVel = 1.7;
        peakA = 0.20;
      } else if (physics.surface === 'sand') {
        cr = 0.50;
        cg = 0.40;
        cb = 0.24;
        lifeMin = 0.8;
        lifeSpan = 0.4;
        sSize = 0.65;
        eSize = 3.2;
        upVel = 2.3;
        peakA = 0.24;
        emitRate += 6;
      } else if (physics.surface === 'snow') {
        cr = 0.48;
        cg = 0.54;
        cb = 0.62;
        lifeMin = 0.75;
        lifeSpan = 0.35;
        sSize = 0.58;
        eSize = 2.95;
        upVel = 2.4;
        peakA = 0.25;
        emitRate += 6;
      } else if (physics.surface === 'water') {
        cr = 0.34;
        cg = 0.48;
        cb = 0.58;
        lifeMin = 0.55;
        lifeSpan = 0.3;
        sSize = 0.62;
        eSize = 2.85;
        upVel = 3.1;
        peakA = 0.26;
      }

      this.emitAccumulator += dt * emitRate;
      const pairsToEmit = Math.min(4, Math.floor(this.emitAccumulator));
      if (pairsToEmit > 0) {
        this.emitAccumulator -= pairsToEmit;

        const sinH = Math.sin(physics.heading);
        const cosH = Math.cos(physics.heading);
        const rearZ = -carSpec.dimensions.length * 0.31;
        const halfTrack = carSpec.dimensions.width * 0.42;

        // World velocity contribution & rear-ward wheel spray
        const baseVx = physics.vx * 0.22 - sinH * 1.6;
        const baseVz = physics.vz * 0.22 - cosH * 1.6;
        const wheelY = physics.y + 0.16;

        for (let p = 0; p < pairsToEmit; p++) {
          for (const side of [-1, 1]) {
            const lx = side * halfTrack;
            const wx =
              physics.x +
              lx * cosH +
              rearZ * sinH +
              (Math.random() - 0.5) * 0.22;
            const wz =
              physics.z -
              lx * sinH +
              rearZ * cosH +
              (Math.random() - 0.5) * 0.22;

            const tintVar = 0.92 + Math.random() * 0.16;
            this.spawnParticle(
              wx,
              wheelY + Math.random() * 0.08,
              wz,
              baseVx + (Math.random() - 0.5) * 2.1,
              upVel * (0.75 + Math.random() * 0.5),
              baseVz + (Math.random() - 0.5) * 2.1,
              cr * tintVar,
              cg * tintVar,
              cb * tintVar,
              lifeMin + Math.random() * lifeSpan,
              sSize * (0.85 + Math.random() * 0.3),
              eSize * (0.85 + Math.random() * 0.35),
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
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] *= Math.exp(-1.1 * dt);
      this.velocities[i3 + 2] *= drag;

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
