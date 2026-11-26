import * as THREE from 'three';

const MAX_FIRE = 320;
const MAX_EMBERS = 240;
const MAX_SOOT = 96;

const _worldTip = new THREE.Vector3();
const _backDir = new THREE.Vector3();
const _rightDir = new THREE.Vector3();
const _upDir = new THREE.Vector3();

export interface NitroFireUpdateOptions {
  chassisMatrixWorld: THREE.Matrix4;
  exhaustAnchors: readonly THREE.Vector3[];
  carVx: number;
  carVz: number;
  speedKmh: number;
  nitroActive: boolean;
  backfireActive: boolean;
  roadY: number;
  daylightFactor: number;
}

export class NitroFireSystem {
  public readonly group = new THREE.Group();

  // 1. Volumetric Turbulent Additive Fireballs & Flame Tongues
  private readonly fireGeo: THREE.BufferGeometry;
  private readonly fireMat: THREE.ShaderMaterial;
  private readonly firePos = new Float32Array(MAX_FIRE * 3);
  private readonly fireVel = new Float32Array(MAX_FIRE * 3);
  private readonly fireLife = new Float32Array(MAX_FIRE);
  private readonly fireMaxLife = new Float32Array(MAX_FIRE);
  private readonly fireStartSize = new Float32Array(MAX_FIRE);
  private readonly fireEndSize = new Float32Array(MAX_FIRE);
  private readonly firePeakAlpha = new Float32Array(MAX_FIRE);
  private readonly fireSpin = new Float32Array(MAX_FIRE);
  private readonly fireIsBackfire = new Float32Array(MAX_FIRE);

  private readonly fireSize = new Float32Array(MAX_FIRE);
  private readonly fireAlpha = new Float32Array(MAX_FIRE);
  private readonly fireColor = new Float32Array(MAX_FIRE * 3);
  private readonly fireRot = new Float32Array(MAX_FIRE);
  private readonly fireAge = new Float32Array(MAX_FIRE);
  private readonly fireSeed = new Float32Array(MAX_FIRE);

  private readonly firePosAttr: THREE.BufferAttribute;
  private readonly fireSizeAttr: THREE.BufferAttribute;
  private readonly fireAlphaAttr: THREE.BufferAttribute;
  private readonly fireColAttr: THREE.BufferAttribute;
  private readonly fireRotAttr: THREE.BufferAttribute;
  private readonly fireAgeAttr: THREE.BufferAttribute;
  private readonly fireSeedAttr: THREE.BufferAttribute;
  private fireCursor = 0;

  // 2. Incandescent Exhaust Sparks / Glowing Embers
  private readonly emberGeo: THREE.BufferGeometry;
  private readonly emberMat: THREE.ShaderMaterial;
  private readonly emberPos = new Float32Array(MAX_EMBERS * 3);
  private readonly emberVel = new Float32Array(MAX_EMBERS * 3);
  private readonly emberLife = new Float32Array(MAX_EMBERS);
  private readonly emberMaxLife = new Float32Array(MAX_EMBERS);
  private readonly emberStartSize = new Float32Array(MAX_EMBERS);

  private readonly emberSize = new Float32Array(MAX_EMBERS);
  private readonly emberAlpha = new Float32Array(MAX_EMBERS);
  private readonly emberColor = new Float32Array(MAX_EMBERS * 3);

  private readonly emberPosAttr: THREE.BufferAttribute;
  private readonly emberSizeAttr: THREE.BufferAttribute;
  private readonly emberAlphaAttr: THREE.BufferAttribute;
  private readonly emberColAttr: THREE.BufferAttribute;
  private emberCursor = 0;

  // 3. Subtle Dark Afterburn Heat-Soot Wisps (NormalBlending contrast behind flames)
  private readonly sootGeo: THREE.BufferGeometry;
  private readonly sootMat: THREE.ShaderMaterial;
  private readonly sootPos = new Float32Array(MAX_SOOT * 3);
  private readonly sootVel = new Float32Array(MAX_SOOT * 3);
  private readonly sootLife = new Float32Array(MAX_SOOT);
  private readonly sootMaxLife = new Float32Array(MAX_SOOT);
  private readonly sootStartSize = new Float32Array(MAX_SOOT);
  private readonly sootEndSize = new Float32Array(MAX_SOOT);
  private readonly sootPeakAlpha = new Float32Array(MAX_SOOT);

  private readonly sootSize = new Float32Array(MAX_SOOT);
  private readonly sootAlpha = new Float32Array(MAX_SOOT);
  private readonly sootColor = new Float32Array(MAX_SOOT * 3);
  private readonly sootRot = new Float32Array(MAX_SOOT);

  private readonly sootPosAttr: THREE.BufferAttribute;
  private readonly sootSizeAttr: THREE.BufferAttribute;
  private readonly sootAlphaAttr: THREE.BufferAttribute;
  private readonly sootColAttr: THREE.BufferAttribute;
  private readonly sootRotAttr: THREE.BufferAttribute;
  private sootCursor = 0;

  private fireAccum = 0;
  private emberAccum = 0;
  private sootAccum = 0;
  private shaderTime = 0;

  constructor(initialViewportHeightPx = 720) {
    const pxH = Math.max(240, initialViewportHeightPx);

    // --- 1. Fireball / Flame Tongue Sprites ---
    for (let i = 0; i < MAX_FIRE; i++) {
      this.firePos[i * 3 + 1] = -9999;
      this.fireLife[i] = 0;
      this.fireAlpha[i] = 0;
      this.fireSize[i] = 1;
    }

    this.fireGeo = new THREE.BufferGeometry();
    this.firePosAttr = new THREE.BufferAttribute(this.firePos, 3);
    this.fireSizeAttr = new THREE.BufferAttribute(this.fireSize, 1);
    this.fireAlphaAttr = new THREE.BufferAttribute(this.fireAlpha, 1);
    this.fireColAttr = new THREE.BufferAttribute(this.fireColor, 3);
    this.fireRotAttr = new THREE.BufferAttribute(this.fireRot, 1);
    this.fireAgeAttr = new THREE.BufferAttribute(this.fireAge, 1);
    this.fireSeedAttr = new THREE.BufferAttribute(this.fireSeed, 1);

    this.firePosAttr.setUsage(THREE.DynamicDrawUsage);
    this.fireSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.fireAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.fireColAttr.setUsage(THREE.DynamicDrawUsage);
    this.fireRotAttr.setUsage(THREE.DynamicDrawUsage);
    this.fireAgeAttr.setUsage(THREE.DynamicDrawUsage);
    this.fireSeedAttr.setUsage(THREE.DynamicDrawUsage);

    this.fireGeo.setAttribute('position', this.firePosAttr);
    this.fireGeo.setAttribute('aSize', this.fireSizeAttr);
    this.fireGeo.setAttribute('aAlpha', this.fireAlphaAttr);
    this.fireGeo.setAttribute('aColor', this.fireColAttr);
    this.fireGeo.setAttribute('aRotation', this.fireRotAttr);
    this.fireGeo.setAttribute('aAge', this.fireAgeAttr);
    this.fireGeo.setAttribute('aSeed', this.fireSeedAttr);

    this.fireMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelHeight: { value: pxH },
        uTime: { value: 0 },
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
        attribute float aAge;
        attribute float aSeed;
        uniform float uPixelHeight;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;
        varying float vAge;
        varying float vSeed;

        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vRotation = aRotation;
          vAge = aAge;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(1.0, -mv.z);
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.92 / dist), 1.5, 190.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;
        varying float vAge;
        varying float vSeed;

        void main() {
          if (vAlpha <= 0.004) discard;

          vec2 centered = gl_PointCoord - 0.5;
          float c = cos(vRotation);
          float s = sin(vRotation);
          vec2 p = vec2(
            c * centered.x - s * centered.y,
            s * centered.x + c * centered.y
          ) * 2.0;

          // Taper upward into an organic licking flame tongue silhouette
          p.x *= mix(1.0, 1.38, clamp(p.y * 0.5 + 0.5, 0.0, 1.0));
          float ang = atan(p.y, p.x);
          float swirl = sin(ang * 3.0 + vSeed * 6.283 + uTime * 14.0) * 0.16
                      + cos(ang * 5.0 - vSeed * 11.0 - uTime * 21.0) * 0.10;
          float turb = sin(p.x * 6.5 + vSeed * 9.0) * cos(p.y * 6.5 - uTime * 16.0) * 0.14;

          float r = length(p) + swirl * (0.28 + vAge * 0.52) + turb * 0.35;
          if (r >= 1.0) discard;

          float core = smoothstep(0.98, 0.10, r);
          float hotCenter = pow(clamp(1.0 - r * 1.18, 0.0, 1.0), 2.2);

          // Blend white-hot inner plasma core into rich outer flame hue
          vec3 flameRgb = mix(vColor, vec3(1.0, 0.98, 0.92), hotCenter * (1.0 - vAge * 0.65) * 0.72);
          float intensity = (0.95 + hotCenter * 1.15) * core * vAlpha;

          gl_FragColor = vec4(flameRgb * intensity, core * vAlpha);
        }
      `,
    });

    const firePoints = new THREE.Points(this.fireGeo, this.fireMat);
    firePoints.frustumCulled = false;
    firePoints.renderOrder = 6;
    this.group.add(firePoints);

    // --- 2. High-Velocity Incandescent Sparks / Embers ---
    for (let i = 0; i < MAX_EMBERS; i++) {
      this.emberPos[i * 3 + 1] = -9999;
      this.emberLife[i] = 0;
      this.emberAlpha[i] = 0;
      this.emberSize[i] = 1;
    }

    this.emberGeo = new THREE.BufferGeometry();
    this.emberPosAttr = new THREE.BufferAttribute(this.emberPos, 3);
    this.emberSizeAttr = new THREE.BufferAttribute(this.emberSize, 1);
    this.emberAlphaAttr = new THREE.BufferAttribute(this.emberAlpha, 1);
    this.emberColAttr = new THREE.BufferAttribute(this.emberColor, 3);

    this.emberPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.emberSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.emberAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.emberColAttr.setUsage(THREE.DynamicDrawUsage);

    this.emberGeo.setAttribute('position', this.emberPosAttr);
    this.emberGeo.setAttribute('aSize', this.emberSizeAttr);
    this.emberGeo.setAttribute('aAlpha', this.emberAlphaAttr);
    this.emberGeo.setAttribute('aColor', this.emberColAttr);

    this.emberMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelHeight: { value: pxH },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uPixelHeight;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(1.0, -mv.z);
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.78 / dist), 1.5, 42.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          if (vAlpha <= 0.01) discard;
          vec2 p = (gl_PointCoord - 0.5) * 2.0;
          float d = length(p);
          if (d >= 1.0) discard;
          float core = pow(1.0 - d, 2.0);
          gl_FragColor = vec4(vColor * (1.35 + core * 1.1) * vAlpha, core * vAlpha);
        }
      `,
    });

    const emberPoints = new THREE.Points(this.emberGeo, this.emberMat);
    emberPoints.frustumCulled = false;
    emberPoints.renderOrder = 7;
    this.group.add(emberPoints);

    // --- 3. Subtle Dark Afterburn Soot / Heat Haze ---
    for (let i = 0; i < MAX_SOOT; i++) {
      this.sootPos[i * 3 + 1] = -9999;
      this.sootLife[i] = 0;
      this.sootAlpha[i] = 0;
      this.sootSize[i] = 1;
    }

    this.sootGeo = new THREE.BufferGeometry();
    this.sootPosAttr = new THREE.BufferAttribute(this.sootPos, 3);
    this.sootSizeAttr = new THREE.BufferAttribute(this.sootSize, 1);
    this.sootAlphaAttr = new THREE.BufferAttribute(this.sootAlpha, 1);
    this.sootColAttr = new THREE.BufferAttribute(this.sootColor, 3);
    this.sootRotAttr = new THREE.BufferAttribute(this.sootRot, 1);

    this.sootPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.sootSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.sootAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.sootColAttr.setUsage(THREE.DynamicDrawUsage);
    this.sootRotAttr.setUsage(THREE.DynamicDrawUsage);

    this.sootGeo.setAttribute('position', this.sootPosAttr);
    this.sootGeo.setAttribute('aSize', this.sootSizeAttr);
    this.sootGeo.setAttribute('aAlpha', this.sootAlphaAttr);
    this.sootGeo.setAttribute('aColor', this.sootColAttr);
    this.sootGeo.setAttribute('aRotation', this.sootRotAttr);

    this.sootMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelHeight: { value: pxH },
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
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(1.0, -mv.z);
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.85 / dist), 1.0, 180.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRotation;

        void main() {
          if (vAlpha <= 0.003) discard;
          vec2 centered = gl_PointCoord - 0.5;
          float c = cos(vRotation);
          float s = sin(vRotation);
          vec2 p = vec2(c * centered.x - s * centered.y, s * centered.x + c * centered.y) * 2.0;
          float r = length(p) + sin(p.x * 7.0) * cos(p.y * 7.0) * 0.12;
          if (r >= 1.0) discard;
          float alpha = pow(smoothstep(1.0, 0.1, r), 1.4) * vAlpha;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    const sootPoints = new THREE.Points(this.sootGeo, this.sootMat);
    sootPoints.frustumCulled = false;
    sootPoints.renderOrder = 4;
    this.group.add(sootPoints);
  }

  public setViewportHeight(pixelHeight: number): void {
    const h = Math.max(240, pixelHeight);
    this.fireMat.uniforms.uPixelHeight.value = h;
    this.emberMat.uniforms.uPixelHeight.value = h;
    this.sootMat.uniforms.uPixelHeight.value = h;
  }

  public clear(): void {
    this.fireAccum = 0;
    this.emberAccum = 0;
    this.sootAccum = 0;
    for (let i = 0; i < MAX_FIRE; i++) {
      this.fireLife[i] = 0;
      this.fireAlpha[i] = 0;
      this.firePos[i * 3 + 1] = -9999;
    }
    for (let i = 0; i < MAX_EMBERS; i++) {
      this.emberLife[i] = 0;
      this.emberAlpha[i] = 0;
      this.emberPos[i * 3 + 1] = -9999;
    }
    for (let i = 0; i < MAX_SOOT; i++) {
      this.sootLife[i] = 0;
      this.sootAlpha[i] = 0;
      this.sootPos[i * 3 + 1] = -9999;
    }
    this.firePosAttr.needsUpdate = true;
    this.fireAlphaAttr.needsUpdate = true;
    this.emberPosAttr.needsUpdate = true;
    this.emberAlphaAttr.needsUpdate = true;
    this.sootPosAttr.needsUpdate = true;
    this.sootAlphaAttr.needsUpdate = true;
  }

  private spawnFire(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    lifeSec: number,
    startSz: number,
    endSz: number,
    alpha: number,
    isBackfire: boolean,
  ): void {
    const idx = this.fireCursor;
    this.fireCursor = (this.fireCursor + 1) % MAX_FIRE;
    const i3 = idx * 3;

    this.firePos[i3] = x;
    this.firePos[i3 + 1] = y;
    this.firePos[i3 + 2] = z;

    this.fireVel[i3] = vx;
    this.fireVel[i3 + 1] = vy;
    this.fireVel[i3 + 2] = vz;

    this.fireLife[idx] = lifeSec;
    this.fireMaxLife[idx] = lifeSec;
    this.fireStartSize[idx] = startSz;
    this.fireEndSize[idx] = endSz;
    this.firePeakAlpha[idx] = alpha;
    this.fireSize[idx] = startSz;
    this.fireAlpha[idx] = alpha;
    this.fireRot[idx] = Math.random() * Math.PI * 2;
    this.fireSpin[idx] = (Math.random() - 0.5) * 9.0;
    this.fireAge[idx] = 0;
    this.fireSeed[idx] = Math.random();
    this.fireIsBackfire[idx] = isBackfire ? 1 : 0;

    if (isBackfire) {
      this.fireColor[i3] = 1.0;
      this.fireColor[i3 + 1] = 0.72;
      this.fireColor[i3 + 2] = 0.22;
    } else {
      this.fireColor[i3] = 0.45;
      this.fireColor[i3 + 1] = 0.88;
      this.fireColor[i3 + 2] = 1.0;
    }
  }

  private spawnEmber(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    lifeSec: number,
    size: number,
    blueTint: boolean,
  ): void {
    const idx = this.emberCursor;
    this.emberCursor = (this.emberCursor + 1) % MAX_EMBERS;
    const i3 = idx * 3;

    this.emberPos[i3] = x;
    this.emberPos[i3 + 1] = y;
    this.emberPos[i3 + 2] = z;
    this.emberVel[i3] = vx;
    this.emberVel[i3 + 1] = vy;
    this.emberVel[i3 + 2] = vz;

    this.emberLife[idx] = lifeSec;
    this.emberMaxLife[idx] = lifeSec;
    this.emberStartSize[idx] = size;
    this.emberSize[idx] = size;
    this.emberAlpha[idx] = 1.0;

    if (blueTint) {
      this.emberColor[i3] = 0.78;
      this.emberColor[i3 + 1] = 0.94;
      this.emberColor[i3 + 2] = 1.0;
    } else {
      this.emberColor[i3] = 1.0;
      this.emberColor[i3 + 1] = 0.74;
      this.emberColor[i3 + 2] = 0.24;
    }
  }

  private spawnSoot(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    lifeSec: number,
    startSz: number,
    endSz: number,
    alpha: number,
  ): void {
    const idx = this.sootCursor;
    this.sootCursor = (this.sootCursor + 1) % MAX_SOOT;
    const i3 = idx * 3;

    this.sootPos[i3] = x;
    this.sootPos[i3 + 1] = y;
    this.sootPos[i3 + 2] = z;
    this.sootVel[i3] = vx;
    this.sootVel[i3 + 1] = vy;
    this.sootVel[i3 + 2] = vz;
    this.sootLife[idx] = lifeSec;
    this.sootMaxLife[idx] = lifeSec;
    this.sootStartSize[idx] = startSz;
    this.sootEndSize[idx] = endSz;
    this.sootPeakAlpha[idx] = alpha;
    this.sootSize[idx] = startSz;
    this.sootAlpha[idx] = alpha;
    this.sootRot[idx] = Math.random() * Math.PI * 2;
    this.sootColor[i3] = 0.14;
    this.sootColor[i3 + 1] = 0.11;
    this.sootColor[i3 + 2] = 0.10;
  }

  public emitIgnitionBurst(
    chassisMatrixWorld: THREE.Matrix4,
    exhaustAnchors: readonly THREE.Vector3[],
    carVx: number,
    carVz: number,
    isFullNitro: boolean,
  ): void {
    if (exhaustAnchors.length === 0) return;
    _backDir.set(0, 0, -1).transformDirection(chassisMatrixWorld).normalize();
    _rightDir.set(1, 0, 0).transformDirection(chassisMatrixWorld).normalize();
    _upDir.set(0, 1, 0).transformDirection(chassisMatrixWorld).normalize();

    const puffsPerPipe = isFullNitro ? 7 : 5;
    const embersPerPipe = isFullNitro ? 9 : 7;

    for (let a = 0; a < exhaustAnchors.length; a++) {
      _worldTip.copy(exhaustAnchors[a]).applyMatrix4(chassisMatrixWorld);

      for (let i = 0; i < puffsPerPipe; i++) {
        const jetSpeed = (isFullNitro ? 13 : 9) + Math.random() * 11;
        const spreadR = (Math.random() - 0.5) * 1.4;
        const spreadU = (Math.random() - 0.35) * 1.2;
        this.spawnFire(
          _worldTip.x + _backDir.x * (0.04 + i * 0.05),
          _worldTip.y + _backDir.y * (0.04 + i * 0.05),
          _worldTip.z + _backDir.z * (0.04 + i * 0.05),
          carVx * 0.55 + _backDir.x * jetSpeed + _rightDir.x * spreadR,
          0.35 + _backDir.y * jetSpeed + _upDir.y * spreadU,
          carVz * 0.55 + _backDir.z * jetSpeed + _rightDir.z * spreadR,
          0.18 + Math.random() * 0.16,
          0.14 + Math.random() * 0.05,
          0.46 + Math.random() * 0.24,
          0.86,
          !isFullNitro,
        );
      }

      for (let e = 0; e < embersPerPipe; e++) {
        const sparkSpeed = 12 + Math.random() * 18;
        const spreadR = (Math.random() - 0.5) * 3.8;
        const spreadU = (Math.random() - 0.25) * 3.2;
        this.spawnEmber(
          _worldTip.x,
          _worldTip.y,
          _worldTip.z,
          carVx * 0.45 + _backDir.x * sparkSpeed + _rightDir.x * spreadR,
          0.6 + _backDir.y * sparkSpeed + _upDir.y * spreadU,
          carVz * 0.45 + _backDir.z * sparkSpeed + _rightDir.z * spreadR,
          0.26 + Math.random() * 0.36,
          0.045 + Math.random() * 0.055,
          isFullNitro && Math.random() < 0.35,
        );
      }
    }
  }

  public update(dt: number, options: NitroFireUpdateOptions): void {
    this.shaderTime += dt;
    this.fireMat.uniforms.uTime.value = this.shaderTime;

    const {
      chassisMatrixWorld,
      exhaustAnchors,
      carVx,
      carVz,
      speedKmh,
      nitroActive,
      backfireActive,
      roadY,
      daylightFactor,
    } = options;

    if ((nitroActive || backfireActive) && exhaustAnchors.length > 0) {
      _backDir.set(0, 0, -1).transformDirection(chassisMatrixWorld).normalize();
      _rightDir.set(1, 0, 0).transformDirection(chassisMatrixWorld).normalize();
      _upDir.set(0, 1, 0).transformDirection(chassisMatrixWorld).normalize();

      const pipeCount = exhaustAnchors.length;
      const fireRate = nitroActive ? 95 * Math.min(2.2, pipeCount * 0.55) : 48 * Math.min(2, pipeCount * 0.5);
      const emberRate = nitroActive ? 75 * Math.min(2.0, pipeCount * 0.5) : 42;
      const sootRate = nitroActive ? 28 : 14;

      this.fireAccum += dt * fireRate;
      const maxFirePerFrame = 18;
      let spawnedF = 0;
      while (this.fireAccum >= 1 && spawnedF < maxFirePerFrame) {
        this.fireAccum -= 1;
        spawnedF++;
        const anchor = exhaustAnchors[spawnedF % pipeCount];
        _worldTip.copy(anchor).applyMatrix4(chassisMatrixWorld);

        const jetSpeed = (nitroActive ? 14 : 9.5) + Math.random() * 10 + speedKmh * 0.025;
        const spreadR = (Math.random() - 0.5) * 1.15;
        const spreadU = (Math.random() - 0.4) * 0.95;
        const startOffset = 0.06 + Math.random() * 0.14;

        // Mix blue-white plasma core puffs with hot fiery orange combustion tongues
        const isOrangeTongue = !nitroActive || Math.random() < 0.42;
        this.spawnFire(
          _worldTip.x + _backDir.x * startOffset,
          _worldTip.y + _backDir.y * startOffset,
          _worldTip.z + _backDir.z * startOffset,
          carVx * 0.62 + _backDir.x * jetSpeed + _rightDir.x * spreadR,
          0.25 + _backDir.y * jetSpeed + _upDir.y * spreadU,
          carVz * 0.62 + _backDir.z * jetSpeed + _rightDir.z * spreadR,
          (nitroActive ? 0.20 : 0.15) + Math.random() * 0.14,
          0.13 + Math.random() * 0.05,
          (nitroActive ? 0.44 : 0.34) + Math.random() * 0.22,
          nitroActive ? 0.82 : 0.74,
          isOrangeTongue,
        );
      }
      if (this.fireAccum > 6) this.fireAccum = 6;

      this.emberAccum += dt * emberRate;
      let spawnedE = 0;
      while (this.emberAccum >= 1 && spawnedE < 14) {
        this.emberAccum -= 1;
        spawnedE++;
        const anchor = exhaustAnchors[spawnedE % pipeCount];
        _worldTip.copy(anchor).applyMatrix4(chassisMatrixWorld);

        const sparkSpeed = 13 + Math.random() * 17;
        const spreadR = (Math.random() - 0.5) * 3.4;
        const spreadU = (Math.random() - 0.3) * 2.8;
        this.spawnEmber(
          _worldTip.x + _backDir.x * 0.05,
          _worldTip.y + _backDir.y * 0.05,
          _worldTip.z + _backDir.z * 0.05,
          carVx * 0.50 + _backDir.x * sparkSpeed + _rightDir.x * spreadR,
          0.35 + _backDir.y * sparkSpeed + _upDir.y * spreadU,
          carVz * 0.50 + _backDir.z * sparkSpeed + _rightDir.z * spreadR,
          0.24 + Math.random() * 0.34,
          0.04 + Math.random() * 0.055,
          nitroActive && Math.random() < 0.25,
        );
      }
      if (this.emberAccum > 5) this.emberAccum = 5;

      this.sootAccum += dt * sootRate;
      let spawnedS = 0;
      while (this.sootAccum >= 1 && spawnedS < 6) {
        this.sootAccum -= 1;
        spawnedS++;
        const anchor = exhaustAnchors[spawnedS % pipeCount];
        _worldTip.copy(anchor).applyMatrix4(chassisMatrixWorld);
        const tailDist = 0.45 + Math.random() * 0.35;
        this.spawnSoot(
          _worldTip.x + _backDir.x * tailDist,
          _worldTip.y + _backDir.y * tailDist,
          _worldTip.z + _backDir.z * tailDist,
          carVx * 0.45 + _backDir.x * 7.5 + (Math.random() - 0.5) * 1.4,
          0.7 + Math.random() * 0.9,
          carVz * 0.45 + _backDir.z * 7.5 + (Math.random() - 0.5) * 1.4,
          0.38 + Math.random() * 0.28,
          0.26,
          0.75 + Math.random() * 0.35,
          0.09 + daylightFactor * 0.08,
        );
      }
      if (this.sootAccum > 3) this.sootAccum = 3;
    }

    // --- Integrate Fireballs ---
    const fireDrag = Math.exp(-3.4 * dt);
    let anyFire = false;
    for (let i = 0; i < MAX_FIRE; i++) {
      if (this.fireLife[i] <= 0) continue;
      anyFire = true;
      this.fireLife[i] -= dt;
      const i3 = i * 3;
      if (this.fireLife[i] <= 0) {
        this.fireLife[i] = 0;
        this.fireAlpha[i] = 0;
        this.firePos[i3 + 1] = -9999;
        continue;
      }

      const age = 1 - this.fireLife[i] / this.fireMaxLife[i];
      this.fireAge[i] = age;

      this.fireVel[i3] *= fireDrag;
      this.fireVel[i3 + 1] = this.fireVel[i3 + 1] * fireDrag + 2.4 * dt; // Thermal buoyancy lift
      this.fireVel[i3 + 2] *= fireDrag;

      this.firePos[i3] += this.fireVel[i3] * dt;
      this.firePos[i3 + 1] = Math.max(roadY + 0.06, this.firePos[i3 + 1] + this.fireVel[i3 + 1] * dt);
      this.firePos[i3 + 2] += this.fireVel[i3 + 2] * dt;

      this.fireRot[i] += this.fireSpin[i] * dt;
      this.fireSize[i] = THREE.MathUtils.lerp(this.fireStartSize[i], this.fireEndSize[i], Math.pow(age, 0.72));

      // Fade envelope: instant ignition flash -> roaring middle -> clean ember fade
      const fadeIn = Math.min(1, age * 7.0);
      const fadeOut = Math.pow(1 - age, 1.35);
      this.fireAlpha[i] = this.firePeakAlpha[i] * fadeIn * fadeOut;

      // Realistic combustion color temperature cooling curve over age
      if (this.fireIsBackfire[i] > 0.5) {
        // Hot yellow-gold -> roaring fiery orange -> deep crimson ember
        if (age < 0.35) {
          const t = age / 0.35;
          this.fireColor[i3] = 1.0;
          this.fireColor[i3 + 1] = THREE.MathUtils.lerp(0.86, 0.48, t);
          this.fireColor[i3 + 2] = THREE.MathUtils.lerp(0.38, 0.08, t);
        } else {
          const t = (age - 0.35) / 0.65;
          this.fireColor[i3] = THREE.MathUtils.lerp(1.0, 0.82, t);
          this.fireColor[i3 + 1] = THREE.MathUtils.lerp(0.48, 0.14, t);
          this.fireColor[i3 + 2] = THREE.MathUtils.lerp(0.08, 0.02, t);
        }
      } else {
        // Nitrous plasma core: White-Cyan -> Electric Violet-Blue -> Fiery Orange -> Crimson Tip
        if (age < 0.25) {
          const t = age / 0.25;
          this.fireColor[i3] = THREE.MathUtils.lerp(0.75, 0.28, t);
          this.fireColor[i3 + 1] = THREE.MathUtils.lerp(0.95, 0.72, t);
          this.fireColor[i3 + 2] = 1.0;
        } else if (age < 0.60) {
          const t = (age - 0.25) / 0.35;
          this.fireColor[i3] = THREE.MathUtils.lerp(0.28, 1.0, t);
          this.fireColor[i3 + 1] = THREE.MathUtils.lerp(0.72, 0.45, t);
          this.fireColor[i3 + 2] = THREE.MathUtils.lerp(1.0, 0.10, t);
        } else {
          const t = (age - 0.60) / 0.40;
          this.fireColor[i3] = THREE.MathUtils.lerp(1.0, 0.85, t);
          this.fireColor[i3 + 1] = THREE.MathUtils.lerp(0.45, 0.14, t);
          this.fireColor[i3 + 2] = THREE.MathUtils.lerp(0.10, 0.02, t);
        }
      }
    }
    if (anyFire || nitroActive || backfireActive) {
      this.firePosAttr.needsUpdate = true;
      this.fireSizeAttr.needsUpdate = true;
      this.fireAlphaAttr.needsUpdate = true;
      this.fireColAttr.needsUpdate = true;
      this.fireRotAttr.needsUpdate = true;
      this.fireAgeAttr.needsUpdate = true;
      this.fireSeedAttr.needsUpdate = true;
    }

    // --- Integrate Embers ---
    const emberDrag = Math.exp(-2.1 * dt);
    let anyEmber = false;
    for (let i = 0; i < MAX_EMBERS; i++) {
      if (this.emberLife[i] <= 0) continue;
      anyEmber = true;
      this.emberLife[i] -= dt;
      const i3 = i * 3;
      if (this.emberLife[i] <= 0) {
        this.emberLife[i] = 0;
        this.emberAlpha[i] = 0;
        this.emberPos[i3 + 1] = -9999;
        continue;
      }
      const age = 1 - this.emberLife[i] / this.emberMaxLife[i];
      this.emberVel[i3] *= emberDrag;
      this.emberVel[i3 + 1] = this.emberVel[i3 + 1] * emberDrag - 12.5 * dt;
      this.emberVel[i3 + 2] *= emberDrag;

      this.emberPos[i3] += this.emberVel[i3] * dt;
      this.emberPos[i3 + 1] += this.emberVel[i3 + 1] * dt;
      this.emberPos[i3 + 2] += this.emberVel[i3 + 2] * dt;

      if (this.emberPos[i3 + 1] < roadY + 0.03) {
        this.emberPos[i3 + 1] = roadY + 0.03;
        if (this.emberVel[i3 + 1] < 0) {
          this.emberVel[i3 + 1] = Math.abs(this.emberVel[i3 + 1]) * 0.42;
          this.emberVel[i3] *= 0.78;
          this.emberVel[i3 + 2] *= 0.78;
        }
      }

      this.emberSize[i] = this.emberStartSize[i] * (1 - age * 0.55);
      this.emberAlpha[i] = Math.pow(1 - age, 1.45);
      if (age > 0.35) {
        const t = (age - 0.35) / 0.65;
        this.emberColor[i3] = THREE.MathUtils.lerp(1.0, 0.85, t);
        this.emberColor[i3 + 1] = THREE.MathUtils.lerp(0.65, 0.16, t);
        this.emberColor[i3 + 2] = THREE.MathUtils.lerp(0.20, 0.03, t);
      }
    }
    if (anyEmber || nitroActive || backfireActive) {
      this.emberPosAttr.needsUpdate = true;
      this.emberSizeAttr.needsUpdate = true;
      this.emberAlphaAttr.needsUpdate = true;
      this.emberColAttr.needsUpdate = true;
    }

    // --- Integrate Heat-Soot Wisps ---
    const sootDrag = Math.exp(-2.8 * dt);
    let anySoot = false;
    for (let i = 0; i < MAX_SOOT; i++) {
      if (this.sootLife[i] <= 0) continue;
      anySoot = true;
      this.sootLife[i] -= dt;
      const i3 = i * 3;
      if (this.sootLife[i] <= 0) {
        this.sootLife[i] = 0;
        this.sootAlpha[i] = 0;
        this.sootPos[i3 + 1] = -9999;
        continue;
      }
      const age = 1 - this.sootLife[i] / this.sootMaxLife[i];
      this.sootVel[i3] *= sootDrag;
      this.sootVel[i3 + 1] = this.sootVel[i3 + 1] * sootDrag + 1.4 * dt;
      this.sootVel[i3 + 2] *= sootDrag;

      this.sootPos[i3] += this.sootVel[i3] * dt;
      this.sootPos[i3 + 1] = Math.max(roadY + 0.08, this.sootPos[i3 + 1] + this.sootVel[i3 + 1] * dt);
      this.sootPos[i3 + 2] += this.sootVel[i3 + 2] * dt;

      this.sootSize[i] = THREE.MathUtils.lerp(this.sootStartSize[i], this.sootEndSize[i], age);
      this.sootAlpha[i] = this.sootPeakAlpha[i] * Math.sin(Math.min(1, age * 4) * Math.PI * 0.5) * Math.pow(1 - age, 1.5);
    }
    if (anySoot || nitroActive || backfireActive) {
      this.sootPosAttr.needsUpdate = true;
      this.sootSizeAttr.needsUpdate = true;
      this.sootAlphaAttr.needsUpdate = true;
      this.sootColAttr.needsUpdate = true;
      this.sootRotAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.fireGeo.dispose();
    this.fireMat.dispose();
    this.emberGeo.dispose();
    this.emberMat.dispose();
    this.sootGeo.dispose();
    this.sootMat.dispose();
  }
}
