import * as THREE from 'three';
import { CarBaseSpec, ControlInputState, WeatherType } from '../types/game';
import { VehiclePhysicsState } from './physics';

const RAIN_COUNT = 2200;
const SPLASH_COUNT = 220;
const SPRAY_COUNT = 280;
const FOG_BANK_COUNT = 44;

const _carFwd = new THREE.Vector3();
const _carRight = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _whiteColor = new THREE.Color(0xffffff);

export interface WeatherUpdateContext {
  dt: number;
  elapsedTime: number;
  weather: WeatherType;
  physics: VehiclePhysicsState;
  spec: CarBaseSpec;
  input: ControlInputState;
  headlightsOn: boolean;
  nightFactor: number;
  daylightFactor: number;
  lightningFlash: number;
  pixelHeight: number;
  isCockpit: boolean;
  isFirstPerson: boolean;
}

export class WeatherEffectsSystem {
  public readonly group = new THREE.Group();

  // 1. Velocity-aligned 3D Rain Streaks (two vertices per drop: tail + head)
  private readonly rainGeo: THREE.BufferGeometry;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly rainLines: THREE.LineSegments;
  private readonly rainPositions = new Float32Array(RAIN_COUNT * 6);
  private readonly rainT = new Float32Array(RAIN_COUNT * 2); // 0 = head, 1 = tail
  private readonly rainDropOffsets = new Float32Array(RAIN_COUNT * 3); // relative box coords
  private readonly rainDropSpeed = new Float32Array(RAIN_COUNT);

  // 2. Wet Asphalt Raindrop Impact Splash Rings
  private readonly splashGeo: THREE.BufferGeometry;
  private readonly splashMat: THREE.ShaderMaterial;
  private readonly splashPoints: THREE.Points;
  private readonly splashPos = new Float32Array(SPLASH_COUNT * 3);
  private readonly splashAge = new Float32Array(SPLASH_COUNT);
  private readonly splashLife = new Float32Array(SPLASH_COUNT);
  private readonly splashSize = new Float32Array(SPLASH_COUNT);

  // 3. Car Wheel Water Spray / Rooster-Tail Mist
  private readonly sprayGeo: THREE.BufferGeometry;
  private readonly sprayMat: THREE.ShaderMaterial;
  private readonly sprayPoints: THREE.Points;
  private readonly sprayPos = new Float32Array(SPRAY_COUNT * 3);
  private readonly sprayVel = new Float32Array(SPRAY_COUNT * 3);
  private readonly sprayLife = new Float32Array(SPRAY_COUNT);
  private readonly sprayMaxLife = new Float32Array(SPRAY_COUNT);
  private readonly sprayStartSize = new Float32Array(SPRAY_COUNT);
  private readonly sprayEndSize = new Float32Array(SPRAY_COUNT);
  private readonly spraySize = new Float32Array(SPRAY_COUNT);
  private readonly sprayAlpha = new Float32Array(SPRAY_COUNT);
  private readonly sprayRot = new Float32Array(SPRAY_COUNT);
  private readonly sprayPosAttr: THREE.BufferAttribute;
  private readonly spraySizeAttr: THREE.BufferAttribute;
  private readonly sprayAlphaAttr: THREE.BufferAttribute;
  private readonly sprayRotAttr: THREE.BufferAttribute;
  private sprayCursor = 0;
  private sprayAccum = 0;

  // 4. Drifting Ground-Hugging Volumetric Fog & Storm Mist Banks
  private readonly fogGeo: THREE.BufferGeometry;
  private readonly fogMat: THREE.ShaderMaterial;
  private readonly fogPoints: THREE.Points;
  private readonly fogPos = new Float32Array(FOG_BANK_COUNT * 3);
  private readonly fogOffset = new Float32Array(FOG_BANK_COUNT * 3); // base radial offset around player
  private readonly fogSize = new Float32Array(FOG_BANK_COUNT);
  private readonly fogSeed = new Float32Array(FOG_BANK_COUNT);
  private readonly fogAlpha = new Float32Array(FOG_BANK_COUNT);

  // 5. 3D Forked Cloud-to-Ground Storm Lightning Bolts (main trunk + branches)
  private readonly boltGeo: THREE.BufferGeometry;
  private readonly boltMat: THREE.LineBasicMaterial;
  private readonly boltLines: THREE.LineSegments;
  private readonly boltMaxVerts = 260;
  private readonly boltPositions = new Float32Array(260 * 3);
  private boltFade = 0;

  // 6. Soft Volumetric Headlight Mist Beams (visible in Fog, Heavy Rain, Storm & Night)
  private readonly beamGroup = new THREE.Group();
  private readonly beamGeo: THREE.BufferGeometry;
  private readonly beamMat: THREE.ShaderMaterial;
  private readonly beamMeshL: THREE.Mesh;
  private readonly beamMeshR: THREE.Mesh;

  constructor(initialViewportHeightPx = 720) {
    const pxH = Math.max(240, initialViewportHeightPx);

    // --- 1. Velocity-Stretched Headlight-Reactive 3D Rain Streaks ---
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainDropOffsets[i * 3] = (Math.random() - 0.5) * 68;
      this.rainDropOffsets[i * 3 + 1] = Math.random() * 28;
      this.rainDropOffsets[i * 3 + 2] = (Math.random() - 0.5) * 68;
      this.rainDropSpeed[i] = 28 + Math.random() * 14;
      this.rainT[i * 2] = 0.0;
      this.rainT[i * 2 + 1] = 1.0;
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    this.rainGeo.setAttribute(
      'aEnd',
      new THREE.BufferAttribute(this.rainT, 1),
    );

    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uOpacity: { value: 0.0 },
        uDayColor: { value: new THREE.Color(0xc8dcf0) },
        uNightColor: { value: new THREE.Color(0x6b88ab) },
        uNightFactor: { value: 0.0 },
        uLightning: { value: 0.0 },
        uCarPos: { value: new THREE.Vector3() },
        uCarFwd: { value: new THREE.Vector3(0, 0, 1) },
        uHeadlights: { value: 0.0 },
      },
      vertexShader: `
        attribute float aEnd;
        varying float vEnd;
        varying float vHeadlightGlint;
        varying float vDistAlpha;
        uniform vec3 uCarPos;
        uniform vec3 uCarFwd;
        uniform float uHeadlights;

        void main() {
          vEnd = aEnd;
          vec3 rel = position - uCarPos;
          float dCam = length(cameraPosition - position);
          vDistAlpha = (1.0 - smoothstep(14.0, 36.0, dCam)) * smoothstep(1.2, 4.0, dCam);

          float fwdDist = dot(rel, uCarFwd);
          float beam = 0.0;
          if (uHeadlights > 0.5 && fwdDist > 1.2 && fwdDist < 48.0) {
            vec3 lateral = rel - uCarFwd * fwdDist;
            float coneR = 2.6 + fwdDist * 0.24;
            float radialMask = 1.0 - smoothstep(coneR * 0.35, coneR, length(lateral));
            float lenMask = 1.0 - smoothstep(12.0, 48.0, fwdDist);
            beam = radialMask * lenMask;
          }
          vHeadlightGlint = beam;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vEnd;
        varying float vHeadlightGlint;
        varying float vDistAlpha;
        uniform float uOpacity;
        uniform vec3 uDayColor;
        uniform vec3 uNightColor;
        uniform float uNightFactor;
        uniform float uLightning;

        void main() {
          if (uOpacity <= 0.004 || vDistAlpha <= 0.004) discard;
          vec3 baseCol = mix(uDayColor, uNightColor, uNightFactor);
          baseCol = mix(baseCol, vec3(0.92, 0.97, 1.0), min(1.0, vHeadlightGlint * 0.95 + uLightning * 0.85));
          // Tapered streak brightness: crisp head tip, soft fading upper tail
          float taper = mix(1.0, 0.14, vEnd);
          float alpha = uOpacity * taper * vDistAlpha * (0.65 + vHeadlightGlint * 1.15 + uLightning * 0.55);
          gl_FragColor = vec4(baseCol, clamp(alpha, 0.0, 0.85));
        }
      `,
    });

    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.visible = false;
    this.rainLines.frustumCulled = false;
    this.rainLines.renderOrder = 10;
    this.group.add(this.rainLines);

    // --- 2. Asphalt Raindrop Splash Rings ---
    for (let i = 0; i < SPLASH_COUNT; i++) {
      this.splashPos[i * 3 + 1] = -9999;
      this.splashAge[i] = Math.random();
      this.splashLife[i] = 0.22 + Math.random() * 0.18;
      this.splashSize[i] = 0.26 + Math.random() * 0.22;
    }
    this.splashGeo = new THREE.BufferGeometry();
    this.splashGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.splashPos, 3),
    );
    this.splashGeo.setAttribute(
      'aAge',
      new THREE.BufferAttribute(this.splashAge, 1),
    );
    this.splashGeo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.splashSize, 1),
    );

    this.splashMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelHeight: { value: pxH },
        uStrength: { value: 0.0 },
        uColor: { value: new THREE.Color(0xdbeafe) },
      },
      vertexShader: `
        attribute float aAge;
        attribute float aSize;
        varying float vAge;
        uniform float uPixelHeight;

        void main() {
          vAge = aAge;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float expand = 0.35 + aAge * 1.15;
          gl_PointSize = clamp((aSize * expand * uPixelHeight) / max(1.0, -mv.z), 1.5, 44.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAge;
        uniform float uStrength;
        uniform vec3 uColor;

        void main() {
          if (uStrength <= 0.01) discard;
          vec2 p = (gl_PointCoord - 0.5) * 2.0;
          // Squash vertically to suggest perspective on road plane
          p.y *= 1.65;
          float r = length(p);
          float ringR = 0.22 + vAge * 0.72;
          float ring = exp(-pow((r - ringR) * 7.5, 2.0));
          float crown = smoothstep(0.32, 0.0, length(vec2(p.x * 1.4, p.y + 0.12))) * (1.0 - smoothstep(0.0, 0.45, vAge));
          float alpha = (ring * 0.65 + crown * 0.75) * (1.0 - vAge) * uStrength;
          if (alpha <= 0.008) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.splashPoints = new THREE.Points(this.splashGeo, this.splashMat);
    this.splashPoints.visible = false;
    this.splashPoints.frustumCulled = false;
    this.splashPoints.renderOrder = 6;
    this.group.add(this.splashPoints);

    // --- 3. Car Tire Wet Water Spray Mist ---
    for (let i = 0; i < SPRAY_COUNT; i++) {
      this.sprayPos[i * 3 + 1] = -9999;
      this.sprayLife[i] = 0;
      this.sprayAlpha[i] = 0;
      this.spraySize[i] = 1;
    }
    this.sprayGeo = new THREE.BufferGeometry();
    this.sprayPosAttr = new THREE.BufferAttribute(this.sprayPos, 3);
    this.spraySizeAttr = new THREE.BufferAttribute(this.spraySize, 1);
    this.sprayAlphaAttr = new THREE.BufferAttribute(this.sprayAlpha, 1);
    this.sprayRotAttr = new THREE.BufferAttribute(this.sprayRot, 1);
    this.sprayGeo.setAttribute('position', this.sprayPosAttr);
    this.sprayGeo.setAttribute('aSize', this.spraySizeAttr);
    this.sprayGeo.setAttribute('aAlpha', this.sprayAlphaAttr);
    this.sprayGeo.setAttribute('aRotation', this.sprayRotAttr);

    this.sprayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uPixelHeight: { value: pxH },
        uTint: { value: new THREE.Color(0xcbd5e1) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aRotation;
        varying float vAlpha;
        varying float vRotation;
        uniform float uPixelHeight;

        void main() {
          vAlpha = aAlpha;
          vRotation = aRotation;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp((aSize * uPixelHeight) / max(1.0, -mv.z), 0.0, 280.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vRotation;
        uniform vec3 uTint;

        void main() {
          if (vAlpha <= 0.004) discard;
          vec2 c = gl_PointCoord - 0.5;
          float co = cos(vRotation);
          float si = sin(vRotation);
          vec2 p = vec2(co * c.x - si * c.y, si * c.x + co * c.y) * 2.0;
          float n = sin(p.x * 5.2) * cos(p.y * 5.2) * 0.14;
          float r = length(p) + n;
          if (r >= 1.0) discard;
          float a = pow(smoothstep(1.0, 0.15, r), 1.65) * vAlpha;
          gl_FragColor = vec4(uTint, a);
        }
      `,
    });

    this.sprayPoints = new THREE.Points(this.sprayGeo, this.sprayMat);
    this.sprayPoints.frustumCulled = false;
    this.sprayPoints.renderOrder = 7;
    this.group.add(this.sprayPoints);

    // --- 4. Drifting Ground-Hugging Volumetric Fog & Mist Banks ---
    for (let i = 0; i < FOG_BANK_COUNT; i++) {
      const ang = (i / FOG_BANK_COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const dist = 16 + Math.pow(Math.random(), 0.7) * 140;
      this.fogOffset[i * 3] = Math.cos(ang) * dist;
      this.fogOffset[i * 3 + 1] = 0.6 + Math.random() * 5.8;
      this.fogOffset[i * 3 + 2] = Math.sin(ang) * dist;
      this.fogSize[i] = 18 + Math.random() * 26;
      this.fogSeed[i] = Math.random() * 6.283;
      this.fogAlpha[i] = 0.0;
    }
    this.fogGeo = new THREE.BufferGeometry();
    this.fogGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.fogPos, 3),
    );
    this.fogGeo.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.fogSize, 1),
    );
    this.fogGeo.setAttribute(
      'aSeed',
      new THREE.BufferAttribute(this.fogSeed, 1),
    );
    this.fogGeo.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.fogAlpha, 1),
    );

    this.fogMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uPixelHeight: { value: pxH },
        uTime: { value: 0 },
        uFogTint: { value: new THREE.Color(0xcbd5e1) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aSeed;
        attribute float aAlpha;
        varying float vAlpha;
        varying float vSeed;
        uniform float uPixelHeight;

        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float camDist = max(1.0, -mv.z);
          // Fade softly near camera to eliminate popping or screen-blocking planes
          float nearFade = smoothstep(5.0, 22.0, camDist);
          float farFade = 1.0 - smoothstep(105.0, 175.0, camDist);
          vAlpha = aAlpha * nearFade * farFade;
          vSeed = aSeed;
          gl_PointSize = clamp((aSize * uPixelHeight) / camDist, 0.0, 520.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vSeed;
        uniform float uTime;
        uniform vec3 uFogTint;

        float hash2(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
            mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          if (vAlpha <= 0.004) discard;
          vec2 uv = (gl_PointCoord - 0.5) * 2.0;
          // Slightly wider horizontally like low coastal fog layers
          vec2 e = vec2(uv.x * 0.85, uv.y * 1.25);
          float r = length(e);
          if (r >= 1.0) discard;
          float wisps = vnoise(uv * 2.4 + vec2(uTime * 0.06 + vSeed, vSeed * 0.7)) * 0.55
                      + vnoise(uv * 5.0 - vec2(uTime * 0.04, vSeed)) * 0.45;
          float falloff = smoothstep(1.0, 0.12, r);
          float density = falloff * falloff * mix(0.55, 1.15, wisps);
          gl_FragColor = vec4(uFogTint, clamp(density * vAlpha, 0.0, 0.48));
        }
      `,
    });

    this.fogPoints = new THREE.Points(this.fogGeo, this.fogMat);
    this.fogPoints.visible = false;
    this.fogPoints.frustumCulled = false;
    this.fogPoints.renderOrder = 8;
    this.group.add(this.fogPoints);

    // --- 5. Forked 3D Storm Lightning Bolt Geometry ---
    this.boltGeo = new THREE.BufferGeometry();
    this.boltGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.boltPositions, 3),
    );
    this.boltGeo.setDrawRange(0, 0);
    this.boltMat = new THREE.LineBasicMaterial({
      color: 0xe6f2ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.boltLines = new THREE.LineSegments(this.boltGeo, this.boltMat);
    this.boltLines.frustumCulled = false;
    this.boltLines.renderOrder = 15;
    this.group.add(this.boltLines);

    // --- 6. Volumetric Headlight Mist Beams (for Fog / Heavy Rain / Night) ---
    this.beamGeo = new THREE.ConeGeometry(4.2, 26.0, 18, 1, true);
    // Point apex at local z=0, flare forward along +Z
    this.beamGeo.translate(0, -13.0, 0);
    this.beamGeo.rotateX(-Math.PI / 2);

    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0xdbeafe) },
        uOpacity: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        varying float vAxial;
        void main() {
          vAxial = clamp(position.z / 26.0, 0.0, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormalView;
        varying vec3 vViewPos;
        varying float vAxial;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          if (uOpacity <= 0.003) discard;
          vec3 V = normalize(-vViewPos);
          float edgeFade = pow(abs(dot(normalize(vNormalView), V)), 2.2);
          float axialFade = smoothstep(0.0, 0.14, vAxial) * pow(1.0 - vAxial, 1.85);
          float a = edgeFade * axialFade * uOpacity;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });

    this.beamMeshL = new THREE.Mesh(this.beamGeo, this.beamMat);
    this.beamMeshR = new THREE.Mesh(this.beamGeo, this.beamMat);
    this.beamMeshL.frustumCulled = false;
    this.beamMeshR.frustumCulled = false;
    this.beamMeshL.renderOrder = 9;
    this.beamMeshR.renderOrder = 9;
    this.beamGroup.add(this.beamMeshL, this.beamMeshR);
    this.beamGroup.visible = false;
    this.group.add(this.beamGroup);
  }

  public setViewportHeight(pixelHeight: number): void {
    const h = Math.max(240, pixelHeight);
    this.splashMat.uniforms.uPixelHeight.value = h;
    this.sprayMat.uniforms.uPixelHeight.value = h;
    this.fogMat.uniforms.uPixelHeight.value = h;
  }

  public triggerLightningBolt(
    playerX: number,
    playerY: number,
    playerZ: number,
    heading: number,
  ): void {
    // Spawn a dramatic branching bolt forward-ish in the storm sky so the driver sees it cleanly
    const ang = heading + (Math.random() - 0.5) * 1.45;
    const dist = 210 + Math.random() * 240;
    const baseX = playerX + Math.sin(ang) * dist;
    const baseZ = playerZ + Math.cos(ang) * dist;
    const topY = playerY + 145 + Math.random() * 75;
    const groundY = Math.max(2, playerY - 18);

    let cursor = 0;
    const pushSeg = (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ) => {
      if (cursor + 6 > this.boltPositions.length) return;
      this.boltPositions[cursor++] = x1;
      this.boltPositions[cursor++] = y1;
      this.boltPositions[cursor++] = z1;
      this.boltPositions[cursor++] = x2;
      this.boltPositions[cursor++] = y2;
      this.boltPositions[cursor++] = z2;
    };

    const steps = 16;
    let cx = baseX;
    let cy = topY;
    let cz = baseZ;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ny = THREE.MathUtils.lerp(topY, groundY, t);
      const jitter = (1 - t * 0.45) * 16;
      const nx = baseX + (Math.random() - 0.5) * jitter * 2.2;
      const nz = baseZ + (Math.random() - 0.5) * jitter * 2.2;
      pushSeg(cx, cy, cz, nx, ny, nz);

      // Spawn jagged secondary forks off upper/mid trunk
      if (i >= 3 && i <= 12 && Math.random() < 0.45) {
        let bx = nx;
        let by = ny;
        let bz = nz;
        const bDirX = (Math.random() - 0.5) * 26;
        const bDirZ = (Math.random() - 0.5) * 26;
        for (let b = 0; b < 4; b++) {
          const bnx = bx + bDirX * 0.45 + (Math.random() - 0.5) * 9;
          const bny = by - (9 + Math.random() * 8);
          const bnz = bz + bDirZ * 0.45 + (Math.random() - 0.5) * 9;
          pushSeg(bx, by, bz, bnx, bny, bnz);
          bx = bnx;
          by = bny;
          bz = bnz;
        }
      }
      cx = nx;
      cy = ny;
      cz = nz;
    }

    this.boltGeo.attributes.position.needsUpdate = true;
    this.boltGeo.setDrawRange(0, cursor / 3);
    this.boltFade = 1.0;
    this.boltLines.visible = true;
  }

  public clear(): void {
    this.sprayAccum = 0;
    this.boltFade = 0;
    this.boltLines.visible = false;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      this.sprayLife[i] = 0;
      this.sprayAlpha[i] = 0;
      this.sprayPos[i * 3 + 1] = -9999;
    }
    this.sprayPosAttr.needsUpdate = true;
    this.sprayAlphaAttr.needsUpdate = true;
  }

  private spawnSpray(
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
    const idx = this.sprayCursor;
    this.sprayCursor = (this.sprayCursor + 1) % SPRAY_COUNT;
    const i3 = idx * 3;
    this.sprayPos[i3] = x;
    this.sprayPos[i3 + 1] = y;
    this.sprayPos[i3 + 2] = z;
    this.sprayVel[i3] = vx;
    this.sprayVel[i3 + 1] = vy;
    this.sprayVel[i3 + 2] = vz;
    this.sprayLife[idx] = lifeSec;
    this.sprayMaxLife[idx] = lifeSec;
    this.sprayStartSize[idx] = startSz;
    this.sprayEndSize[idx] = endSz;
    this.spraySize[idx] = startSz;
    this.sprayAlpha[idx] = alpha;
    this.sprayRot[idx] = Math.random() * Math.PI * 2;
  }

  public update(ctx: WeatherUpdateContext): void {
    const {
      dt,
      elapsedTime,
      weather,
      physics,
      spec,
      headlightsOn,
      nightFactor,
      daylightFactor,
      lightningFlash,
    } = ctx;

    const isRain = weather === 'rain';
    const isHeavyRain = weather === 'heavy_rain';
    const isStorm = weather === 'thunderstorm';
    const isFog = weather === 'fog';
    const rainLevel = isStorm ? 1.0 : isHeavyRain ? 0.88 : isRain ? 0.48 : 0.0;
    const isWet = rainLevel > 0;

    const sinH = Math.sin(physics.heading);
    const cosH = Math.cos(physics.heading);
    _carFwd.set(sinH, 0, cosH);
    _carRight.set(cosH, 0, -sinH);

    // 1. Velocity-Stretched 3D Rain Streaks
    if (isWet) {
      this.rainLines.visible = true;
      const activeDrops = isStorm
        ? RAIN_COUNT
        : isHeavyRain
          ? Math.floor(RAIN_COUNT * 0.85)
          : Math.floor(RAIN_COUNT * 0.48);
      this.rainGeo.setDrawRange(0, activeDrops * 2);

      // Wind gust crossflow + car apparent velocity makes streaks slant dynamically!
      const gustX = Math.sin(elapsedTime * 0.85) * (isStorm ? 7.5 : 3.2) - 2.4;
      const gustZ = Math.cos(elapsedTime * 0.65) * (isStorm ? 5.2 : 2.1);
      const streakDur = isStorm ? 0.042 : isHeavyRain ? 0.036 : 0.028;

      const relStreakX = (gustX - physics.vx * 0.55) * streakDur;
      const relStreakZ = (gustZ - physics.vz * 0.55) * streakDur;

      for (let i = 0; i < activeDrops; i++) {
        const i3 = i * 3;
        const fallSpeed = this.rainDropSpeed[i] * (isStorm ? 1.24 : isHeavyRain ? 1.12 : 0.94);

        this.rainDropOffsets[i3] += gustX * dt;
        this.rainDropOffsets[i3 + 1] -= fallSpeed * dt;
        this.rainDropOffsets[i3 + 2] += gustZ * dt;

        if (this.rainDropOffsets[i3 + 1] < -2.2) {
          this.rainDropOffsets[i3] = (Math.random() - 0.5) * 66;
          this.rainDropOffsets[i3 + 1] = 24 + Math.random() * 6;
          this.rainDropOffsets[i3 + 2] = (Math.random() - 0.5) * 66;
        }
        // Keep horizontal wrap centered around car
        if (this.rainDropOffsets[i3] > 33) this.rainDropOffsets[i3] -= 66;
        else if (this.rainDropOffsets[i3] < -33) this.rainDropOffsets[i3] += 66;
        if (this.rainDropOffsets[i3 + 2] > 33) this.rainDropOffsets[i3 + 2] -= 66;
        else if (this.rainDropOffsets[i3 + 2] < -33) this.rainDropOffsets[i3 + 2] += 66;

        const hx = physics.x + this.rainDropOffsets[i3];
        const hy = physics.y + this.rainDropOffsets[i3 + 1];
        const hz = physics.z + this.rainDropOffsets[i3 + 2];

        const p6 = i * 6;
        this.rainPositions[p6] = hx;
        this.rainPositions[p6 + 1] = hy;
        this.rainPositions[p6 + 2] = hz;
        this.rainPositions[p6 + 3] = hx - relStreakX;
        this.rainPositions[p6 + 4] = hy + fallSpeed * streakDur;
        this.rainPositions[p6 + 5] = hz - relStreakZ;
      }
      this.rainGeo.attributes.position.needsUpdate = true;

      this.rainMat.uniforms.uOpacity.value = isStorm ? 0.52 : isHeavyRain ? 0.45 : 0.34;
      this.rainMat.uniforms.uNightFactor.value = nightFactor;
      this.rainMat.uniforms.uLightning.value = lightningFlash;
      (this.rainMat.uniforms.uCarPos.value as THREE.Vector3).set(
        physics.x + sinH * 1.6,
        physics.y + 0.65,
        physics.z + cosH * 1.6,
      );
      (this.rainMat.uniforms.uCarFwd.value as THREE.Vector3).copy(_carFwd);
      this.rainMat.uniforms.uHeadlights.value = headlightsOn ? 1.0 : 0.0;
    } else {
      this.rainLines.visible = false;
    }

    // 2. Road Raindrop Splash Rings
    if (isWet) {
      this.splashPoints.visible = true;
      const activeSplashes = isStorm ? SPLASH_COUNT : isHeavyRain ? 185 : 105;
      this.splashGeo.setDrawRange(0, activeSplashes);
      for (let i = 0; i < activeSplashes; i++) {
        this.splashAge[i] += dt / this.splashLife[i];
        if (this.splashAge[i] >= 1.0) {
          this.splashAge[i] = 0;
          this.splashLife[i] = 0.16 + Math.random() * 0.18;
          // Concentrate splashes ahead of & around car along highway corridor
          const fwd = -6 + Math.random() * 34;
          const lat = (Math.random() - 0.5) * 18;
          this.splashPos[i * 3] = physics.x + sinH * fwd + cosH * lat;
          this.splashPos[i * 3 + 1] = physics.y + 0.04;
          this.splashPos[i * 3 + 2] = physics.z + cosH * fwd - sinH * lat;
        }
      }
      this.splashGeo.attributes.position.needsUpdate = true;
      this.splashGeo.attributes.aAge.needsUpdate = true;
      this.splashMat.uniforms.uStrength.value =
        (isStorm ? 0.72 : isHeavyRain ? 0.62 : 0.44) *
        (0.45 + daylightFactor * 0.4 + lightningFlash * 0.45);
      _tmpColor
        .setHex(0xcbd5e1)
        .lerp(_whiteColor, lightningFlash * 0.7);
      (this.splashMat.uniforms.uColor.value as THREE.Color).copy(_tmpColor);
    } else {
      this.splashPoints.visible = false;
    }

    // 3. Wheel Wet Road Water Spray / Rooster-Tail Mist
    const emitSpray = isWet && physics.grounded && physics.speedKmh > 22;
    if (emitSpray) {
      const speedNorm = THREE.MathUtils.clamp((physics.speedKmh - 20) / 160, 0.12, 1.0);
      const rate = (isStorm ? 160 : isHeavyRain ? 135 : 85) * speedNorm;
      this.sprayAccum += rate * dt;
      const halfTrack = spec.dimensions.width * 0.44;
      const halfWheelBase = spec.dimensions.length * 0.34;
      const wheelY = physics.y + 0.22;

      while (this.sprayAccum >= 1) {
        this.sprayAccum -= 1;
        // Emit predominantly from rear tires + lighter front mist
        for (const isFront of [false, true]) {
          if (isFront && Math.random() > 0.42) continue;
          const zOff = isFront ? halfWheelBase * 0.85 : -halfWheelBase * 1.02;
          for (const side of [-1, 1]) {
            const xOff = side * halfTrack;
            const wx = physics.x + sinH * zOff + cosH * xOff + (Math.random() - 0.5) * 0.14;
            const wz = physics.z + cosH * zOff - sinH * xOff + (Math.random() - 0.5) * 0.14;
            const sprayUp = (1.6 + speedNorm * 2.8) * (isFront ? 0.6 : 1.0);
            const sideKick = side * (0.6 + Math.random() * 1.1);
            this.spawnSpray(
              wx,
              wheelY,
              wz,
              physics.vx * 0.28 - sinH * (2.5 + speedNorm * 4.0) + cosH * sideKick,
              sprayUp + Math.random() * 0.9,
              physics.vz * 0.28 - cosH * (2.5 + speedNorm * 4.0) - sinH * sideKick,
              0.38 + Math.random() * 0.36,
              0.38 + speedNorm * 0.28,
              1.65 + speedNorm * 1.6 + (isHeavyRain || isStorm ? 0.6 : 0),
              (isFront ? 0.12 : 0.22) * rainLevel * (0.55 + speedNorm * 0.45),
            );
          }
        }
      }
    } else {
      this.sprayAccum = 0;
    }

    let sprayAlive = false;
    for (let i = 0; i < SPRAY_COUNT; i++) {
      const life = this.sprayLife[i];
      if (life <= 0) {
        this.sprayAlpha[i] = 0;
        continue;
      }
      sprayAlive = true;
      const next = life - dt;
      this.sprayLife[i] = next;
      if (next <= 0) {
        this.sprayAlpha[i] = 0;
        this.sprayPos[i * 3 + 1] = -9999;
        continue;
      }
      const i3 = i * 3;
      const drag = Math.exp(-3.2 * dt);
      this.sprayVel[i3] *= drag;
      this.sprayVel[i3 + 1] = this.sprayVel[i3 + 1] * drag - 1.4 * dt;
      this.sprayVel[i3 + 2] *= drag;
      this.sprayPos[i3] += this.sprayVel[i3] * dt;
      this.sprayPos[i3 + 1] = Math.max(physics.y + 0.08, this.sprayPos[i3 + 1] + this.sprayVel[i3 + 1] * dt);
      this.sprayPos[i3 + 2] += this.sprayVel[i3 + 2] * dt;

      const p = 1 - next / this.sprayMaxLife[i];
      this.spraySize[i] = THREE.MathUtils.lerp(
        this.sprayStartSize[i],
        this.sprayEndSize[i],
        Math.sqrt(p),
      );
      this.sprayAlpha[i] =
        (isStorm ? 0.22 : 0.18) * Math.sin(Math.min(1, p / 0.18) * Math.PI * 0.5) * Math.pow(1 - p, 1.35);
      this.sprayRot[i] += dt * 1.8;
    }
    if (sprayAlive || emitSpray) {
      this.sprayPosAttr.needsUpdate = true;
      this.spraySizeAttr.needsUpdate = true;
      this.sprayAlphaAttr.needsUpdate = true;
      this.sprayRotAttr.needsUpdate = true;
    }
    const sprayBright = 0.24 + daylightFactor * 0.62 + lightningFlash * 0.45;
    (this.sprayMat.uniforms.uTint.value as THREE.Color).setRGB(
      sprayBright * 0.92,
      sprayBright * 0.96,
      sprayBright,
    );

    // 4. Drifting Volumetric Ground Fog / Squall Mist Banks
    const fogBankStrength = isFog
      ? 0.44
      : isStorm
        ? 0.22
        : isHeavyRain
          ? 0.18
          : weather === 'cloudy'
            ? 0.08
            : nightFactor * 0.07;

    if (fogBankStrength > 0.015) {
      this.fogPoints.visible = true;
      this.fogMat.uniforms.uTime.value = elapsedTime;
      const driftSpd = isStorm ? 4.2 : isFog ? 1.4 : 2.2;
      for (let i = 0; i < FOG_BANK_COUNT; i++) {
        const i3 = i * 3;
        this.fogOffset[i3] += driftSpd * dt * (i % 2 === 0 ? 1 : 0.7);
        this.fogOffset[i3 + 2] += driftSpd * 0.45 * dt;
        if (this.fogOffset[i3] > 155) this.fogOffset[i3] -= 310;
        if (this.fogOffset[i3 + 2] > 155) this.fogOffset[i3 + 2] -= 310;

        this.fogPos[i3] = physics.x + this.fogOffset[i3];
        this.fogPos[i3 + 1] = physics.y + this.fogOffset[i3 + 1];
        this.fogPos[i3 + 2] = physics.z + this.fogOffset[i3 + 2];
        this.fogAlpha[i] = fogBankStrength * (0.65 + 0.35 * Math.sin(this.fogSeed[i] + elapsedTime * 0.25));
      }
      this.fogGeo.attributes.position.needsUpdate = true;
      this.fogGeo.attributes.aAlpha.needsUpdate = true;

      const fogLuma = isFog
        ? THREE.MathUtils.lerp(0.76, 0.16, nightFactor)
        : THREE.MathUtils.lerp(0.58, 0.12, nightFactor) + lightningFlash * 0.35;
      (this.fogMat.uniforms.uFogTint.value as THREE.Color).setRGB(
        fogLuma * 0.90,
        fogLuma * 0.94,
        fogLuma,
      );
    } else {
      this.fogPoints.visible = false;
    }

    // 5. 3D Forked Lightning Bolt Decay
    if (this.boltFade > 0) {
      this.boltFade = Math.max(0, this.boltFade - dt * 3.2);
      // Natural multi-stroke flicker curve
      const flicker =
        this.boltFade > 0.72
          ? 1.0
          : this.boltFade > 0.56
            ? 0.35
            : this.boltFade > 0.38
              ? 0.92
              : this.boltFade * 1.4;
      this.boltMat.opacity = Math.min(1.0, flicker);
      if (this.boltFade <= 0.005) {
        this.boltLines.visible = false;
      }
    }

    // 6. Volumetric Headlight Haze Beams in Fog / Storm / Heavy Rain / Night
    const hazeFactor = isFog
      ? 0.22
      : isStorm || isHeavyRain
        ? 0.14
        : isRain
          ? 0.09
          : nightFactor * 0.075;
    if (headlightsOn && hazeFactor > 0.01 && !ctx.isFirstPerson) {
      this.beamGroup.visible = true;
      const halfW = spec.dimensions.width * 0.31;
      const beamY = physics.y + spec.dimensions.groundClearance + spec.dimensions.height * 0.32;
      const frontOff = spec.dimensions.length * 0.51;

      this.beamMeshL.position.set(
        physics.x + sinH * frontOff + cosH * halfW,
        beamY,
        physics.z + cosH * frontOff - sinH * halfW,
      );
      this.beamMeshL.rotation.set(0.06, physics.heading + 0.04, 0, 'YXZ');

      this.beamMeshR.position.set(
        physics.x + sinH * frontOff - cosH * halfW,
        beamY,
        physics.z + cosH * frontOff + sinH * halfW,
      );
      this.beamMeshR.rotation.set(0.06, physics.heading - 0.04, 0, 'YXZ');

      this.beamMat.uniforms.uOpacity.value = hazeFactor * (0.65 + nightFactor * 0.65);
    } else {
      this.beamGroup.visible = false;
    }
  }

  public dispose(): void {
    this.rainGeo.dispose();
    this.rainMat.dispose();
    this.splashGeo.dispose();
    this.splashMat.dispose();
    this.sprayGeo.dispose();
    this.sprayMat.dispose();
    this.fogGeo.dispose();
    this.fogMat.dispose();
    this.boltGeo.dispose();
    this.boltMat.dispose();
    this.beamGeo.dispose();
    this.beamMat.dispose();
  }
}
