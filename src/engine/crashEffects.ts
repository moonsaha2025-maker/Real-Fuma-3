import * as THREE from 'three';

const MAX_SPARKS = 260;
const MAX_DEBRIS = 64;
const MAX_SMOKE = 96;
const _tmpDebrisColor = new THREE.Color();

export class CrashEffectsSystem {
  public readonly group = new THREE.Group();

  // 1. Additive Glowing Molten Sparks
  private readonly sparkGeo: THREE.BufferGeometry;
  private readonly sparkMat: THREE.ShaderMaterial;
  private readonly sparkPos = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkVel = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkLife = new Float32Array(MAX_SPARKS);
  private readonly sparkMaxLife = new Float32Array(MAX_SPARKS);
  private readonly sparkSize = new Float32Array(MAX_SPARKS);
  private readonly sparkAlpha = new Float32Array(MAX_SPARKS);
  private readonly sparkColor = new Float32Array(MAX_SPARKS * 3);
  private readonly sparkPosAttr: THREE.BufferAttribute;
  private readonly sparkSizeAttr: THREE.BufferAttribute;
  private readonly sparkAlphaAttr: THREE.BufferAttribute;
  private readonly sparkColAttr: THREE.BufferAttribute;
  private sparkCursor = 0;

  // 2. 3D Tumbling Carbon/Metal Crash Debris Chunks
  private readonly debrisGeo: THREE.BufferGeometry;
  private readonly debrisMat: THREE.MeshStandardMaterial;
  private readonly debrisMesh: THREE.InstancedMesh;
  private readonly debrisPos = new Float32Array(MAX_DEBRIS * 3);
  private readonly debrisVel = new Float32Array(MAX_DEBRIS * 3);
  private readonly debrisRot = new Float32Array(MAX_DEBRIS * 3);
  private readonly debrisAngVel = new Float32Array(MAX_DEBRIS * 3);
  private readonly debrisScale = new Float32Array(MAX_DEBRIS * 3);
  private readonly debrisLife = new Float32Array(MAX_DEBRIS);
  private readonly debrisFloorY = new Float32Array(MAX_DEBRIS);
  private debrisCursor = 0;
  private readonly dummy = new THREE.Object3D();

  // 3. Impact Smoke & Steam Plumes
  private readonly smokeGeo: THREE.BufferGeometry;
  private readonly smokeMat: THREE.ShaderMaterial;
  private readonly smokePos = new Float32Array(MAX_SMOKE * 3);
  private readonly smokeVel = new Float32Array(MAX_SMOKE * 3);
  private readonly smokeLife = new Float32Array(MAX_SMOKE);
  private readonly smokeMaxLife = new Float32Array(MAX_SMOKE);
  private readonly smokeStartSize = new Float32Array(MAX_SMOKE);
  private readonly smokeEndSize = new Float32Array(MAX_SMOKE);
  private readonly smokePeakAlpha = new Float32Array(MAX_SMOKE);
  private readonly smokeSize = new Float32Array(MAX_SMOKE);
  private readonly smokeAlpha = new Float32Array(MAX_SMOKE);
  private readonly smokeColor = new Float32Array(MAX_SMOKE * 3);
  private readonly smokePosAttr: THREE.BufferAttribute;
  private readonly smokeSizeAttr: THREE.BufferAttribute;
  private readonly smokeAlphaAttr: THREE.BufferAttribute;
  private readonly smokeColAttr: THREE.BufferAttribute;
  private smokeCursor = 0;

  // 4. Dynamic Impact Spark Flash Light
  public readonly flashLight: THREE.PointLight;
  private flashIntensity = 0;
  private scrapeEmitAccum = 0;
  private steamEmitAccum = 0;

  constructor(initialViewportHeightPx = 720) {
    // --- Sparks ---
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparkPos[i * 3 + 1] = -9999;
      this.sparkLife[i] = 0;
    }
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPosAttr = new THREE.BufferAttribute(this.sparkPos, 3);
    this.sparkSizeAttr = new THREE.BufferAttribute(this.sparkSize, 1);
    this.sparkAlphaAttr = new THREE.BufferAttribute(this.sparkAlpha, 1);
    this.sparkColAttr = new THREE.BufferAttribute(this.sparkColor, 3);
    this.sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkColAttr.setUsage(THREE.DynamicDrawUsage);
    this.sparkGeo.setAttribute('position', this.sparkPosAttr);
    this.sparkGeo.setAttribute('aSize', this.sparkSizeAttr);
    this.sparkGeo.setAttribute('aAlpha', this.sparkAlphaAttr);
    this.sparkGeo.setAttribute('aColor', this.sparkColAttr);

    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelHeight: { value: Math.max(240, initialViewportHeightPx) },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
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
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.72 / dist), 2.0, 48.0);
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
          float core = pow(1.0 - d, 1.8);
          gl_FragColor = vec4(vColor * (1.2 + core) * vAlpha, core * vAlpha);
        }
      `,
    });
    const sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
    sparkPoints.frustumCulled = false;
    sparkPoints.renderOrder = 6;
    this.group.add(sparkPoints);

    // --- 3D Tumbling Debris ---
    this.debrisGeo = new THREE.BoxGeometry(0.18, 0.045, 0.24);
    this.debrisMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.42,
      metalness: 0.55,
    });
    this.debrisMesh = new THREE.InstancedMesh(this.debrisGeo, this.debrisMat, MAX_DEBRIS);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = false;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      this.dummy.position.set(0, -9999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
      this.debrisMesh.setColorAt(i, new THREE.Color(0x1e293b));
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    this.group.add(this.debrisMesh);

    // --- Impact Smoke & Steam ---
    for (let i = 0; i < MAX_SMOKE; i++) {
      this.smokePos[i * 3 + 1] = -9999;
      this.smokeLife[i] = 0;
    }
    this.smokeGeo = new THREE.BufferGeometry();
    this.smokePosAttr = new THREE.BufferAttribute(this.smokePos, 3);
    this.smokeSizeAttr = new THREE.BufferAttribute(this.smokeSize, 1);
    this.smokeAlphaAttr = new THREE.BufferAttribute(this.smokeAlpha, 1);
    this.smokeColAttr = new THREE.BufferAttribute(this.smokeColor, 3);
    this.smokePosAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeColAttr.setUsage(THREE.DynamicDrawUsage);
    this.smokeGeo.setAttribute('position', this.smokePosAttr);
    this.smokeGeo.setAttribute('aSize', this.smokeSizeAttr);
    this.smokeGeo.setAttribute('aAlpha', this.smokeAlphaAttr);
    this.smokeGeo.setAttribute('aColor', this.smokeColAttr);

    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelHeight: { value: Math.max(240, initialViewportHeightPx) },
      },
      transparent: true,
      depthWrite: false,
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
          gl_PointSize = clamp(aSize * (uPixelHeight * 0.85 / dist), 1.0, 200.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          if (vAlpha <= 0.004) discard;
          vec2 p = (gl_PointCoord - 0.5) * 2.0;
          float d = length(p);
          if (d >= 1.0) discard;
          float puff = smoothstep(1.0, 0.12, d);
          gl_FragColor = vec4(vColor, puff * vAlpha);
        }
      `,
    });
    const smokePoints = new THREE.Points(this.smokeGeo, this.smokeMat);
    smokePoints.frustumCulled = false;
    smokePoints.renderOrder = 5;
    this.group.add(smokePoints);

    // --- Impact Flash PointLight ---
    this.flashLight = new THREE.PointLight(0xff9b38, 0, 26, 1.7);
    this.group.add(this.flashLight);
  }

  public setViewportHeight(pixelHeight: number): void {
    const px = Math.max(240, pixelHeight);
    this.sparkMat.uniforms.uPixelHeight.value = px;
    this.smokeMat.uniforms.uPixelHeight.value = px;
  }

  public clear(): void {
    this.flashIntensity = 0;
    this.flashLight.intensity = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.sparkLife[i] = 0;
      this.sparkAlpha[i] = 0;
      this.sparkPos[i * 3 + 1] = -9999;
    }
    for (let i = 0; i < MAX_DEBRIS; i++) {
      this.debrisLife[i] = 0;
      this.dummy.position.set(0, -9999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (let i = 0; i < MAX_SMOKE; i++) {
      this.smokeLife[i] = 0;
      this.smokeAlpha[i] = 0;
      this.smokePos[i * 3 + 1] = -9999;
    }
    this.sparkPosAttr.needsUpdate = true;
    this.sparkAlphaAttr.needsUpdate = true;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.smokePosAttr.needsUpdate = true;
    this.smokeAlphaAttr.needsUpdate = true;
  }

  private spawnSpark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
  ): void {
    const i = this.sparkCursor;
    this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
    const i3 = i * 3;
    this.sparkPos[i3] = x;
    this.sparkPos[i3 + 1] = y;
    this.sparkPos[i3 + 2] = z;
    this.sparkVel[i3] = vx;
    this.sparkVel[i3 + 1] = vy;
    this.sparkVel[i3 + 2] = vz;
    this.sparkLife[i] = life;
    this.sparkMaxLife[i] = life;
    this.sparkSize[i] = size;
    this.sparkAlpha[i] = 1;
    this.sparkColor[i3] = 1.0;
    this.sparkColor[i3 + 1] = 0.85;
    this.sparkColor[i3 + 2] = 0.45;
  }

  private spawnDebris(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    floorY: number,
    colorHex: number,
    scaleMult: number,
  ): void {
    const i = this.debrisCursor;
    this.debrisCursor = (this.debrisCursor + 1) % MAX_DEBRIS;
    const i3 = i * 3;
    this.debrisPos[i3] = x;
    this.debrisPos[i3 + 1] = y;
    this.debrisPos[i3 + 2] = z;
    this.debrisVel[i3] = vx;
    this.debrisVel[i3 + 1] = vy;
    this.debrisVel[i3 + 2] = vz;
    this.debrisRot[i3] = Math.random() * Math.PI * 2;
    this.debrisRot[i3 + 1] = Math.random() * Math.PI * 2;
    this.debrisRot[i3 + 2] = Math.random() * Math.PI * 2;
    this.debrisAngVel[i3] = (Math.random() - 0.5) * 18;
    this.debrisAngVel[i3 + 1] = (Math.random() - 0.5) * 18;
    this.debrisAngVel[i3 + 2] = (Math.random() - 0.5) * 18;
    this.debrisScale[i3] = (0.55 + Math.random() * 0.9) * scaleMult;
    this.debrisScale[i3 + 1] = (0.4 + Math.random() * 0.7) * scaleMult;
    this.debrisScale[i3 + 2] = (0.55 + Math.random() * 1.1) * scaleMult;
    this.debrisLife[i] = 1.8 + Math.random() * 1.4;
    this.debrisFloorY[i] = floorY;
    this.debrisMesh.setColorAt(i, _tmpDebrisColor.setHex(colorHex));
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  private spawnSmoke(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    life: number,
    sSize: number,
    eSize: number,
    alpha: number,
  ): void {
    const i = this.smokeCursor;
    this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;
    const i3 = i * 3;
    this.smokePos[i3] = x;
    this.smokePos[i3 + 1] = y;
    this.smokePos[i3 + 2] = z;
    this.smokeVel[i3] = vx;
    this.smokeVel[i3 + 1] = vy;
    this.smokeVel[i3 + 2] = vz;
    this.smokeColor[i3] = r;
    this.smokeColor[i3 + 1] = g;
    this.smokeColor[i3 + 2] = b;
    this.smokeLife[i] = life;
    this.smokeMaxLife[i] = life;
    this.smokeStartSize[i] = sSize;
    this.smokeEndSize[i] = eSize;
    this.smokePeakAlpha[i] = alpha;
    this.smokeSize[i] = sSize;
    this.smokeAlpha[i] = 0.01;
  }

  public emitCrashBurst(params: {
    x: number;
    y: number;
    z: number;
    nx: number;
    nz: number;
    carVx: number;
    carVz: number;
    intensity: number;
    carColorHex?: string;
    kind: 'rail' | 'car' | 'landing';
  }): void {
    const inten = THREE.MathUtils.clamp(params.intensity, 0.14, 1.35);

    // Spark flash lighting up asphalt & surroundings
    if (params.kind !== 'landing') {
      this.flashLight.position.set(params.x, params.y + 0.55, params.z);
      this.flashIntensity = Math.max(this.flashIntensity, 14 + inten * 38);
    }

    // 1. High-velocity molten metal sparks spraying along tangent & upward
    const sparkCount = params.kind === 'landing' ? 0 : Math.round(18 + inten * 58);
    const tx = -params.nz;
    const tz = params.nx;
    for (let i = 0; i < sparkCount; i++) {
      const tangentSpread = (Math.random() - 0.5) * 18 * (0.4 + inten);
      const normalBounce = (1.5 + Math.random() * 8.5) * (0.5 + inten);
      const vx = params.carVx * 0.42 + params.nx * normalBounce + tx * tangentSpread;
      const vz = params.carVz * 0.42 + params.nz * normalBounce + tz * tangentSpread;
      const vy = 2.2 + Math.random() * (6.5 + inten * 6.5);
      this.spawnSpark(
        params.x + (Math.random() - 0.5) * 0.65,
        params.y + 0.35 + Math.random() * 0.45,
        params.z + (Math.random() - 0.5) * 0.65,
        vx,
        vy,
        vz,
        0.26 + Math.random() * 0.48,
        0.18 + Math.random() * 0.24,
      );
    }

    // 2. Tumbling 3D debris chunks (car paint shards, carbon aero, shattered glass)
    if (params.kind !== 'landing' && inten > 0.24) {
      const debrisCount = Math.min(20, Math.round(4 + inten * 14));
      const paintInt = params.carColorHex ? _tmpDebrisColor.set(params.carColorHex).getHex() : 0x334155;
      const palette = [0x0f172a, 0x334155, 0x94a3b8, 0xcbd5e1, paintInt];
      for (let i = 0; i < debrisCount; i++) {
        const vx = params.carVx * 0.45 + params.nx * (2 + Math.random() * 7) + (Math.random() - 0.5) * 9;
        const vz = params.carVz * 0.45 + params.nz * (2 + Math.random() * 7) + (Math.random() - 0.5) * 9;
        const vy = 3.2 + Math.random() * (5.5 + inten * 5.0);
        this.spawnDebris(
          params.x + (Math.random() - 0.5) * 0.7,
          params.y + 0.4 + Math.random() * 0.45,
          params.z + (Math.random() - 0.5) * 0.7,
          vx,
          vy,
          vz,
          params.y + 0.04,
          palette[i % palette.length],
          0.75 + inten * 0.5,
        );
      }
    }

    // 3. Impact dust & dark crash smoke cloud
    const puffCount = Math.round(6 + inten * 12);
    for (let i = 0; i < puffCount; i++) {
      const shade = params.kind === 'landing' ? 0.52 : 0.24 + Math.random() * 0.14;
      this.spawnSmoke(
        params.x + (Math.random() - 0.5) * 1.1,
        params.y + 0.28 + Math.random() * 0.35,
        params.z + (Math.random() - 0.5) * 1.1,
        params.carVx * 0.18 + (Math.random() - 0.5) * 3.5,
        1.1 + Math.random() * 2.4,
        params.carVz * 0.18 + (Math.random() - 0.5) * 3.5,
        shade,
        shade,
        shade * 1.05,
        0.7 + Math.random() * 0.65,
        0.65,
        2.5 + inten * 1.5,
        0.34 + inten * 0.2,
      );
    }
  }

  public emitRailScrape(
    dt: number,
    x: number,
    y: number,
    z: number,
    nx: number,
    nz: number,
    carVx: number,
    carVz: number,
    scrapeIntensity: number,
  ): void {
    if (scrapeIntensity <= 0.05) return;
    this.scrapeEmitAccum += dt * (28 + scrapeIntensity * 55);
    const count = Math.min(8, Math.floor(this.scrapeEmitAccum));
    if (count > 0) {
      this.scrapeEmitAccum -= count;
      this.flashLight.position.set(x, y + 0.45, z);
      this.flashIntensity = Math.max(this.flashIntensity, 5 + scrapeIntensity * 12);
      for (let i = 0; i < count; i++) {
        this.spawnSpark(
          x + (Math.random() - 0.5) * 0.35,
          y + 0.25 + Math.random() * 0.35,
          z + (Math.random() - 0.5) * 0.35,
          carVx * 0.35 + nx * (1.2 + Math.random() * 4.5) + (Math.random() - 0.5) * 3.0,
          1.4 + Math.random() * 3.8,
          carVz * 0.35 + nz * (1.2 + Math.random() * 4.5) + (Math.random() - 0.5) * 3.0,
          0.18 + Math.random() * 0.28,
          0.15 + Math.random() * 0.15,
        );
      }
    }
  }

  public emitRadiatorSteam(
    dt: number,
    hoodX: number,
    hoodY: number,
    hoodZ: number,
    damageLevel: number,
    speedKmh: number,
  ): void {
    if (damageLevel < 0.62) return;
    const rate = (damageLevel - 0.58) * (speedKmh < 40 ? 14 : 6);
    this.steamEmitAccum += dt * rate;
    const count = Math.min(2, Math.floor(this.steamEmitAccum));
    if (count <= 0) return;
    this.steamEmitAccum -= count;
    for (let i = 0; i < count; i++) {
      this.spawnSmoke(
        hoodX + (Math.random() - 0.5) * 0.45,
        hoodY,
        hoodZ + (Math.random() - 0.5) * 0.45,
        (Math.random() - 0.5) * 0.7,
        1.5 + Math.random() * 1.3,
        (Math.random() - 0.5) * 0.7,
        0.72,
        0.75,
        0.8,
        0.65 + Math.random() * 0.45,
        0.35,
        1.45,
        0.16 * damageLevel,
      );
    }
  }

  public update(dt: number, groundY: number): void {
    // 1. Decay impact spark flash
    if (this.flashIntensity > 0.05) {
      this.flashIntensity *= Math.exp(-18 * dt);
      this.flashLight.intensity = this.flashIntensity;
    } else if (this.flashLight.intensity !== 0) {
      this.flashIntensity = 0;
      this.flashLight.intensity = 0;
    }

    // 2. Step Sparks (gravity + bounce + ember color cool-down)
    let sparksDirty = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      const rem = this.sparkLife[i];
      if (rem <= 0) continue;
      sparksDirty = true;
      const next = rem - dt;
      this.sparkLife[i] = next;
      if (next <= 0) {
        this.sparkAlpha[i] = 0;
        this.sparkPos[i * 3 + 1] = -9999;
        continue;
      }
      const i3 = i * 3;
      this.sparkVel[i3 + 1] -= 15.5 * dt;
      this.sparkVel[i3] *= Math.exp(-1.1 * dt);
      this.sparkVel[i3 + 2] *= Math.exp(-1.1 * dt);

      this.sparkPos[i3] += this.sparkVel[i3] * dt;
      this.sparkPos[i3 + 1] += this.sparkVel[i3 + 1] * dt;
      this.sparkPos[i3 + 2] += this.sparkVel[i3 + 2] * dt;

      if (this.sparkPos[i3 + 1] < groundY + 0.03) {
        this.sparkPos[i3 + 1] = groundY + 0.03;
        this.sparkVel[i3 + 1] = Math.abs(this.sparkVel[i3 + 1]) * 0.45;
        this.sparkVel[i3] *= 0.78;
        this.sparkVel[i3 + 2] *= 0.78;
      }

      const progress = 1 - next / this.sparkMaxLife[i];
      this.sparkAlpha[i] = Math.max(0, 1 - progress * progress);
      this.sparkColor[i3] = 1.0;
      this.sparkColor[i3 + 1] = THREE.MathUtils.lerp(0.92, 0.25, progress);
      this.sparkColor[i3 + 2] = THREE.MathUtils.lerp(0.55, 0.04, progress);
    }
    if (sparksDirty) {
      this.sparkPosAttr.needsUpdate = true;
      this.sparkSizeAttr.needsUpdate = true;
      this.sparkAlphaAttr.needsUpdate = true;
      this.sparkColAttr.needsUpdate = true;
    }

    // 3. Step 3D Tumbling Debris
    let debrisDirty = false;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const rem = this.debrisLife[i];
      if (rem <= 0) continue;
      debrisDirty = true;
      const next = rem - dt;
      this.debrisLife[i] = next;
      const i3 = i * 3;
      if (next <= 0) {
        this.dummy.position.set(0, -9999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      this.debrisVel[i3 + 1] -= 18.0 * dt;
      this.debrisPos[i3] += this.debrisVel[i3] * dt;
      this.debrisPos[i3 + 1] += this.debrisVel[i3 + 1] * dt;
      this.debrisPos[i3 + 2] += this.debrisVel[i3 + 2] * dt;

      const fy = Math.max(this.debrisFloorY[i], groundY + 0.03);
      if (this.debrisPos[i3 + 1] < fy) {
        this.debrisPos[i3 + 1] = fy;
        this.debrisVel[i3 + 1] = Math.abs(this.debrisVel[i3 + 1]) * 0.38;
        this.debrisVel[i3] *= 0.72;
        this.debrisVel[i3 + 2] *= 0.72;
        this.debrisAngVel[i3] *= 0.65;
        this.debrisAngVel[i3 + 1] *= 0.65;
        this.debrisAngVel[i3 + 2] *= 0.65;
      }

      this.debrisRot[i3] += this.debrisAngVel[i3] * dt;
      this.debrisRot[i3 + 1] += this.debrisAngVel[i3 + 1] * dt;
      this.debrisRot[i3 + 2] += this.debrisAngVel[i3 + 2] * dt;

      const shrink = Math.min(1, next / 0.35);
      this.dummy.position.set(
        this.debrisPos[i3],
        this.debrisPos[i3 + 1],
        this.debrisPos[i3 + 2],
      );
      this.dummy.rotation.set(
        this.debrisRot[i3],
        this.debrisRot[i3 + 1],
        this.debrisRot[i3 + 2],
      );
      this.dummy.scale.set(
        this.debrisScale[i3] * shrink,
        this.debrisScale[i3 + 1] * shrink,
        this.debrisScale[i3 + 2] * shrink,
      );
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (debrisDirty) {
      this.debrisMesh.instanceMatrix.needsUpdate = true;
    }

    // 4. Step Impact Smoke & Steam
    let smokeDirty = false;
    const smokeDrag = Math.exp(-2.2 * dt);
    for (let i = 0; i < MAX_SMOKE; i++) {
      const rem = this.smokeLife[i];
      if (rem <= 0) continue;
      smokeDirty = true;
      const next = rem - dt;
      this.smokeLife[i] = next;
      if (next <= 0) {
        this.smokeAlpha[i] = 0;
        this.smokePos[i * 3 + 1] = -9999;
        continue;
      }
      const i3 = i * 3;
      this.smokeVel[i3] *= smokeDrag;
      this.smokeVel[i3 + 2] *= smokeDrag;
      this.smokePos[i3] += this.smokeVel[i3] * dt;
      this.smokePos[i3 + 1] += this.smokeVel[i3 + 1] * dt;
      this.smokePos[i3 + 2] += this.smokeVel[i3 + 2] * dt;

      const progress = 1 - next / this.smokeMaxLife[i];
      const oneMinus = Math.max(0, 1 - progress);
      this.smokeSize[i] =
        this.smokeStartSize[i] +
        (this.smokeEndSize[i] - this.smokeStartSize[i]) * (1 - oneMinus * oneMinus);
      const fadeIn = Math.min(1, progress / 0.14);
      this.smokeAlpha[i] = this.smokePeakAlpha[i] * fadeIn * Math.pow(oneMinus, 1.35);
    }
    if (smokeDirty) {
      this.smokePosAttr.needsUpdate = true;
      this.smokeSizeAttr.needsUpdate = true;
      this.smokeAlphaAttr.needsUpdate = true;
      this.smokeColAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.debrisGeo.dispose();
    this.debrisMat.dispose();
    this.smokeGeo.dispose();
    this.smokeMat.dispose();
  }
}
