import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { getCarSpec } from '../data/cars';
import {
  getDriveSurfaceHeight,
  getRoadPointAt,
  projectOntoTrack,
  TRACK_STATIONS,
} from '../data/track';
import { getRegionAt, MAP_LANDMARKS, RACE_EVENTS } from '../data/world';
import {
  CameraMode,
  ControlInputState,
  GameSettings,
  LiveTelemetry,
  OwnedCarData,
  RaceEvent,
  RaceResultSummary,
  TimeOfDay,
  WeatherType,
} from '../types/game';
import { AtmosphereSystem, createAtmosphereSystem } from './atmosphere';
import { audioEngine } from './audio';
import { CarModelRig, createCarModel } from './carModel';
import { CrashEffectsSystem } from './crashEffects';
import {
  createInitialPhysicsStateAtS,
  stepVehiclePhysics,
  VehiclePhysicsState,
} from './physics';
import { createProceduralTextures, ProceduralTexturePack } from './textures';
import { NitroFireSystem } from './nitroFireParticles';
import { TireSkidmarkSystem } from './skidmarks';
import { TireSmokeSystem } from './tireSmoke';
import { CarHeadlightTarget, TrafficAndAIManager } from './trafficAndAI';
import { WeatherEffectsSystem } from './weatherEffects';
import { buildRealFumaWorld, BuiltWorld } from './worldBuilder';

export const SHOWCASE_S = 0.06;
export const DRIVE_SPAWN_S = 0.065;

const RadialSpeedBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBlurAmount: { value: 0.0 },
    uRainStreak: { value: 0.0 },
    uInnerRadius: { value: 0.15 },
    uCenter: { value: new THREE.Vector2(0.5, 0.46) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uBlurAmount;
    uniform float uRainStreak;
    uniform float uInnerRadius;
    uniform vec2 uCenter;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uBlurAmount <= 0.003 && uRainStreak <= 0.003) {
        gl_FragColor = base;
        return;
      }
      vec2 dir = vUv - uCenter;
      float dist = length(dir);
      float radialMask = smoothstep(uInnerRadius, 0.88, dist) * uBlurAmount;
      float rainEdge = smoothstep(max(0.08, uInnerRadius * 0.72), 0.92, dist);
      vec2 rainVec = vec2(0.14, 0.99) * uRainStreak * (0.015 + 0.024 * rainEdge);

      vec3 accum = base.rgb;
      for (int i = 1; i <= 7; i++) {
        float fi = float(i) / 7.0;
        vec2 radialOffset = dir * (-fi * radialMask * 0.16);
        vec2 rainOffset = rainVec * ((fi - 0.35) * 0.85);
        accum += texture2D(tDiffuse, clamp(vUv + radialOffset + rainOffset, 0.001, 0.999)).rgb;
      }
      vec3 blurred = accum / 8.0;
      float vig = 1.0 - smoothstep(0.56, 1.26, dist) * (uBlurAmount * 0.48 + uRainStreak * 0.18);
      gl_FragColor = vec4(blurred * vig, base.a);
    }
  `,
};

const RainLensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uIntensity: { value: 0.0 },
    uAspect: { value: 1.777 },
    uSpeedNorm: { value: 0.0 },
    uNightFactor: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    uniform float uAspect;
    uniform float uSpeedNorm;
    uniform float uNightFactor;
    varying vec2 vUv;

    float rHash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    vec2 rainLayer(vec2 uv, float scale, float t) {
      vec2 aspectUv = vec2(uv.x * uAspect, uv.y) * scale;
      vec2 grid = vec2(6.0, 2.6);
      vec2 st = aspectUv * grid;
      float colShift = floor(st.x);
      st.y += t * (0.65 + rHash21(vec2(colShift, 1.7)) * 0.6);
      vec2 id = floor(st);
      vec2 f = fract(st) - 0.5;
      float h = rHash21(id);
      if (h < 0.42) return vec2(0.0);

      float xOff = (h - 0.5) * 0.52 + sin(st.y * 1.4 + h * 12.0) * 0.14;
      float yOff = fract(h * 17.3 + t * 0.15) - 0.5;
      vec2 d = f - vec2(xOff, yOff);
      d.x *= 1.0;
      d.y *= 0.62;
      float drop = smoothstep(0.24, 0.04, length(d));
      // Subtle watery trail behind sliding drop
      float trail = smoothstep(0.09, 0.0, abs(f.x - xOff)) * smoothstep(0.45, -0.1, f.y - yOff) * step(yOff, f.y) * 0.35;
      return d * (drop + trail);
    }

    void main() {
      if (uIntensity <= 0.01) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      float t = uTime * (0.85 + uSpeedNorm * 1.15);
      vec2 off = rainLayer(vUv, 2.2, t) * 0.042 + rainLayer(vUv + 0.37, 3.6, t * 1.2) * 0.025;
      // Keep central focus crisp while perimeter beads rain realistically
      float edgeBoost = mix(0.55, 1.15, smoothstep(0.15, 0.72, length(vUv - 0.5)));
      vec2 refractedUv = clamp(vUv + off * uIntensity * edgeBoost, 0.002, 0.998);
      vec4 base = texture2D(tDiffuse, refractedUv);
      float spec = clamp(length(off) * 18.0, 0.0, 1.0) * uIntensity * edgeBoost;
      vec3 glintCol = mix(vec3(0.82, 0.90, 0.98), vec3(0.65, 0.80, 1.0), uNightFactor);
      gl_FragColor = vec4(base.rgb + glintCol * spec * 0.14, base.a);
    }
  `,
};

const _camTarget = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _roadTangent = new THREE.Vector3();
const _roadRight = new THREE.Vector3();
const _roadNormal = new THREE.Vector3();
const _qSurface = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _lightDir = new THREE.Vector3();
const _lightRight = new THREE.Vector3();
const _lightUp = new THREE.Vector3();
const _focusPt = new THREE.Vector3();
const _cockpitEyeWorld = new THREE.Vector3();
const _cockpitLookWorld = new THREE.Vector3();
const _cockpitUpWorld = new THREE.Vector3();
const _cockpitHeadOffset = new THREE.Vector3();
const _fpEuler = new THREE.Euler();
const _fpQuat = new THREE.Quaternion();
const _fpMatrix = new THREE.Matrix4();
const _fpWorldMatrix = new THREE.Matrix4();
const _fpBasisPos = new THREE.Vector3();
const _fpScale = new THREE.Vector3(1, 1, 1);
const _nitroAmberColor = new THREE.Color(0xf97316);
const _lightningKeyColor = new THREE.Color(0xcce4ff);
const _IDLE_INPUT: ControlInputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  nitro: false,
};

const SHADOW_HALF_EXTENT = 32;
const DEFAULT_SHADOW_MAP_RES = 1536;
const DRIFT_SMOKE_ANGLE_THRESHOLD_DEG = 10;

function timePresetToPhase(time: TimeOfDay): number {
  if (time === 'sunrise') return 0.265;
  if (time === 'sunset') return 0.745;
  if (time === 'night') return 0.96;
  return 0.44;
}

function formatCycleClock(phase: number): string {
  const norm = ((phase % 1) + 1) % 1;
  const totalMins = Math.floor(norm * 24 * 60);
  const hh = Math.floor(totalMins / 60) % 24;
  const mm = totalMins % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function buildCoastalSkyEnvironmentTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Equirectangular sunlit coastal sky (top half) -> bright horizon clouds -> turquoise sea & dark asphalt ground (bottom half)
  const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
  vGrad.addColorStop(0.0, '#0752cc');
  vGrad.addColorStop(0.24, '#29a8ff');
  vGrad.addColorStop(0.45, '#b8ebff');
  vGrad.addColorStop(0.50, '#ffffff');
  vGrad.addColorStop(0.54, '#38bdf8');
  vGrad.addColorStop(0.68, '#23698f');
  vGrad.addColorStop(0.85, '#3f4f63');
  vGrad.addColorStop(1.0, '#2d3a4b');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Soft sunlit cumulus horizon cloud band for natural car-hood sky reflections
  for (let i = 0; i < 16; i++) {
    const cx = ((i * 37) % 512);
    const cy = 104 + (i % 3) * 8;
    const rad = 28 + (i % 4) * 14;
    const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
    cg.addColorStop(0, 'rgba(255,255,255,0.75)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp radiant solar disc + warm Mie halo for glossy clearcoat hood speculars
  const sunX = 160;
  const sunY = 66;
  const sg = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 54);
  sg.addColorStop(0.0, 'rgba(255, 255, 245, 1.0)');
  sg.addColorStop(0.18, 'rgba(255, 244, 200, 0.85)');
  sg.addColorStop(0.55, 'rgba(255, 224, 150, 0.25)');
  sg.addColorStop(1.0, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 54, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildOvercastSkyEnvironmentTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Soft diffused slate-silver overcast sky & cool wet-asphalt reflection hemisphere
  const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
  vGrad.addColorStop(0.0, '#445366');
  vGrad.addColorStop(0.24, '#6e8094');
  vGrad.addColorStop(0.45, '#a2b0bf');
  vGrad.addColorStop(0.50, '#bac5d0');
  vGrad.addColorStop(0.54, '#647280');
  vGrad.addColorStop(0.72, '#3a4552');
  vGrad.addColorStop(1.0, '#222a34');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle multi-layered overcast cloud variation without sharp solar hotspots
  for (let i = 0; i < 18; i++) {
    const cx = ((i * 41 + 19) % 512);
    const cy = 62 + (i % 4) * 16;
    const rad = 36 + (i % 3) * 18;
    const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
    cg.addColorStop(0, 'rgba(210,220,232,0.28)');
    cg.addColorStop(1, 'rgba(210,220,232,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildNightSkyEnvironmentTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Deep midnight coastal sky -> muted horizon haze -> dark ocean & nocturnal asphalt floor
  const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
  vGrad.addColorStop(0.0, '#02050c');
  vGrad.addColorStop(0.28, '#050c1a');
  vGrad.addColorStop(0.46, '#0a162b');
  vGrad.addColorStop(0.50, '#0f1f38');
  vGrad.addColorStop(0.54, '#081222');
  vGrad.addColorStop(0.74, '#040912');
  vGrad.addColorStop(1.0, '#020408');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 512, 256);

  // Restraint cool moonlight rim sheen (subtle metallic edge highlights, never bright icy-white washout)
  const moonX = 160;
  const moonY = 72;
  const mg = ctx.createRadialGradient(moonX, moonY, 2, moonX, moonY, 44);
  mg.addColorStop(0.0, 'rgba(130, 165, 220, 0.34)');
  mg.addColorStop(0.35, 'rgba(72, 106, 162, 0.16)');
  mg.addColorStop(1.0, 'rgba(20, 38, 68, 0)');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 44, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class GameEngine {
  private container: HTMLElement;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private textures: ProceduralTexturePack;
  private atmosphere: AtmosphereSystem;
  private world: BuiltWorld;
  private trafficAI: TrafficAndAIManager;
  private dayEnvTex: THREE.Texture;
  private overcastEnvTex: THREE.Texture;
  private nightEnvTex: THREE.Texture;

  // Post-Processing Pipeline (Hardware GPU, MEDIUM/HIGH/ULTRA)
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private speedBlurPass: ShaderPass | null = null;
  private rainLensPass: ShaderPass | null = null;
  private usePostProcessing = false;

  private playerCarRig: CarModelRig | null = null;
  private currentCarData: OwnedCarData | null = null;
  private physics: VehiclePhysicsState = createInitialPhysicsStateAtS(SHOWCASE_S, 0);

  // Lighting
  private sunLight: THREE.DirectionalLight;
  private skyFillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private shadowTexelSize = (SHADOW_HALF_EXTENT * 2) / DEFAULT_SHADOW_MAP_RES;
  private headlightBeam: THREE.SpotLight;
  private taillightLight: THREE.PointLight;
  private streetLampLights: THREE.PointLight[] = [];
  private trafficHeadlights: THREE.PointLight[] = [];
  private nearestHeadlightTargets: CarHeadlightTarget[] = [];
  private softboxA: THREE.DirectionalLight | null = null;
  private softboxB: THREE.DirectionalLight | null = null;
  private showroomTurntable: THREE.Mesh;

  // Weather, Car Wash Spray, Crash VFX, Nitro Fire & Additive Tire Smoke Particles
  private weatherEffects: WeatherEffectsSystem;
  private washPoints: THREE.Points;
  private washPositions: Float32Array;
  private washVelocities: Float32Array;
  private washSpriteTex: THREE.CanvasTexture;
  private tireSmoke: TireSmokeSystem;
  private skidmarks: TireSkidmarkSystem;
  private crashEffects: CrashEffectsSystem;
  private nitroFire: NitroFireSystem;
  private wasDriftSmokeActive = false;
  private wasNitroFlameActive = false;

  // Vehicle Dirt & Garage Wash Animation State
  private carDirtLevel = 0;
  private washActive = false;
  private washTimer = 0;
  private washStartDirt = 0;
  private readonly washDuration = 3.2;

  // State
  private mode: 'showcase' | 'drive' = 'showcase';
  private paused = false;
  private photoMode = false;
  private contextLost = false;
  private settings: GameSettings;
  private weather: WeatherType = 'sunny';
  private timeOfDay: TimeOfDay = 'day';
  private cyclePhase = 0.385; // Start at crisp sunlit coastal morning (~09:14)
  private autoDayNightCycle = true;
  private cameraMode: CameraMode = 'chase';
  private headlightsManual: boolean | null = null;
  private lightningTimer = 0;
  private lightningFlash = 0;
  private thunderDelayTimer = -1;
  private smoothedSurfaceQuat = new THREE.Quaternion();
  private fpPitch = 0;
  private fpRoll = 0;
  private fpHeave = 0;

  // Showcase & Photo Mode Orbit
  private showcasePt = getRoadPointAt(SHOWCASE_S, 0);
  private orbitYaw = this.showcasePt.heading + 0.56;
  private orbitPitch = 0.14;
  private orbitDist = 4.15;
  private autoOrbit = true;
  private showcaseRightOffset = true;
  private showcasePanAmount = 1.05;
  private photoYaw = 0.55;
  private photoPitch = 0.14;
  private photoDist = 4.1;
  private photoHeight = 0.68;
  private photoFov = 44;
  private photoRollDeg = 0;
  private photoBlurEnabled = false;
  private photoBlurIntensity = 0.45;

  // Input
  private keysHeld = new Set<string>();
  private touchInput: ControlInputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false,
  };
  private smoothedDigitalSteer = 0;
  private gpPrevCamBtn = false;
  private gamepadBlocked = false;
  private manualShiftQueue: -1 | 0 | 1 = 0;
  private cameraShakeIntensity = 0;
  private cameraCrashRoll = 0;
  private cameraCrashJoltX = 0;
  private cameraCrashJoltZ = 0;
  private crashFlash = 0;
  private hitstopTimer = 0;

  // Race & Event State
  private activeEvent: RaceEvent | null = null;
  private raceState: LiveTelemetry['raceState'] = 'free_roam';
  private countdownTimer = 0;
  private lastCountdownInt = 4;
  private currentLap = 1;
  private checkpointIdx = 0;
  private raceElapsedSec = 0;
  private bestLapSec = 9999;
  private lapStartSec = 0;
  private raceTopSpeedKmh = 0;

  // Loop & Callbacks
  private frameId = 0;
  private disposed = false;
  private elapsedTime = 0;
  private fpsCounter = 60;
  private fpsAccumFrames = 0;
  private fpsAccumSec = 0;
  private telemetryTimer = 0;
  private freeRoamAccumDist = 0;
  private freeRoamAccumTimer = 0;
  private onTelemetry?: (t: LiveTelemetry) => void;
  private onRaceComplete?: (res: RaceResultSummary) => void;
  private onFreeRoamReward?: (
    cash: number,
    xp: number,
    rep: number,
    distKm: number,
    topSpeed: number,
    driftPts: number,
  ) => void;
  private onRegionUnlock?: (regionId: LiveTelemetry['regionId']) => void;
  private onDirtChange?: (carId: string, dirtLevel: number) => void;
  private onWashComplete?: () => void;
  private onNoBrakeDriftUpdate?: (seconds: number) => void;
  private continuousNoBrakeDriftSec = 0;
  private bestNoBrakeDriftReported = 0;

  constructor(
    container: HTMLElement,
    initialCar: OwnedCarData,
    settings: GameSettings,
    callbacks: {
      onTelemetry: (t: LiveTelemetry) => void;
      onRaceComplete: (res: RaceResultSummary) => void;
      onFreeRoamReward: (
        cash: number,
        xp: number,
        rep: number,
        distKm: number,
        topSpeed: number,
        driftPts: number,
      ) => void;
      onRegionUnlock: (regionId: LiveTelemetry['regionId']) => void;
      onDirtChange?: (carId: string, dirtLevel: number) => void;
      onWashComplete?: () => void;
      onNoBrakeDriftUpdate?: (seconds: number) => void;
    },
  ) {
    this.container = container;
    this.settings = settings;
    this.onTelemetry = callbacks.onTelemetry;
    this.onRaceComplete = callbacks.onRaceComplete;
    this.onFreeRoamReward = callbacks.onFreeRoamReward;
    this.onRegionUnlock = callbacks.onRegionUnlock;
    this.onDirtChange = callbacks.onDirtChange;
    this.onWashComplete = callbacks.onWashComplete;
    this.onNoBrakeDriftUpdate = callbacks.onNoBrakeDriftUpdate;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && settings.graphicsPreset !== 'LOW',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9ee0ff, 0.00052);

    this.camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      2400,
    );

    // Pre-baked day, overcast/fog, and midnight PMREM IBL maps so night metal/paint never reflects daytime white-blue sky
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const coastalEnvTex = buildCoastalSkyEnvironmentTexture();
    const overcastSrcTex = buildOvercastSkyEnvironmentTexture();
    const nightSrcTex = buildNightSkyEnvironmentTexture();
    this.dayEnvTex = pmrem.fromEquirectangular(coastalEnvTex).texture;
    this.overcastEnvTex = pmrem.fromEquirectangular(overcastSrcTex).texture;
    this.nightEnvTex = pmrem.fromEquirectangular(nightSrcTex).texture;
    coastalEnvTex.dispose();
    overcastSrcTex.dispose();
    nightSrcTex.dispose();
    pmrem.dispose();
    this.scene.environment = this.dayEnvTex;

    // Crisp coastal daylight rig + cool sky bounce fill + car-following texel-snapped shadow frustum
    this.hemiLight = new THREE.HemisphereLight(0xc8eeff, 0x3a4838, 0.68);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffcf0, 2.45);
    this.sunLight.position.set(this.showcasePt.x - 95, 115, this.showcasePt.z - 80);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(DEFAULT_SHADOW_MAP_RES, DEFAULT_SHADOW_MAP_RES);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 250;
    this.sunLight.shadow.camera.left = -SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.right = SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.top = SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.bottom = -SHADOW_HALF_EXTENT;
    this.sunLight.shadow.bias = -0.00018;
    this.sunLight.shadow.normalBias = 0.012;
    this.sunLight.shadow.radius = 1.45;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Opposite-azimuth daytime cool atmospheric sky bounce light (off at night)
    this.skyFillLight = new THREE.DirectionalLight(0x9fd8ff, 0.36);
    this.skyFillLight.castShadow = false;
    this.scene.add(this.skyFillLight);
    this.scene.add(this.skyFillLight.target);

    // Focused automotive LED forward beam projecting crisp illumination down dark & foggy roads
    this.headlightBeam = new THREE.SpotLight(
      0xf6f9ff,
      0,
      240,
      Math.PI / 3.7,
      0.72,
      1.08,
    );
    this.headlightBeam.castShadow = false;
    this.scene.add(this.headlightBeam);
    this.scene.add(this.headlightBeam.target);

    this.taillightLight = new THREE.PointLight(0xff2040, 0, 10, 1.9);
    this.scene.add(this.taillightLight);

    // Pooled warm-sodium highway streetlamp lights & oncoming traffic headlights for night, fog & storm
    for (let i = 0; i < 4; i++) {
      const lamp = new THREE.PointLight(0xffba63, 0, 76, 1.32);
      this.scene.add(lamp);
      this.streetLampLights.push(lamp);
    }
    for (let i = 0; i < 2; i++) {
      const thl = new THREE.PointLight(0xe4f0ff, 0, 68, 1.32);
      this.scene.add(thl);
      this.trafficHeadlights.push(thl);
    }

    if (!this.isSoftwareGl) {
      // Lightweight studio fill/rim DirectionalLights replacing expensive RectAreaLight LTC shaders
      this.softboxA = new THREE.DirectionalLight(0xffffff, 1.35);
      this.softboxA.castShadow = false;
      this.softboxA.position.set(this.showcasePt.x - 5, this.showcasePt.y + 6.5, this.showcasePt.z + 7);
      this.softboxA.target.position.set(this.showcasePt.x, this.showcasePt.y + 0.7, this.showcasePt.z);
      this.softboxA.target.updateMatrixWorld();

      this.softboxB = new THREE.DirectionalLight(0x7dd3fc, 0.85);
      this.softboxB.castShadow = false;
      this.softboxB.position.set(this.showcasePt.x + 6, this.showcasePt.y + 5, this.showcasePt.z - 6);
      this.softboxB.target.position.set(this.showcasePt.x, this.showcasePt.y + 0.7, this.showcasePt.z);
      this.softboxB.target.updateMatrixWorld();

      this.scene.add(this.softboxA, this.softboxA.target, this.softboxB, this.softboxB.target);
    }

    // Procedural Textures, Sky/Ocean Shader & Closed Spline Highway World
    this.textures = createProceduralTextures(
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.atmosphere = createAtmosphereSystem(this.textures.cloudMap);
    this.scene.add(this.atmosphere.group);

    this.world = buildRealFumaWorld(this.textures);
    this.scene.add(this.world.worldGroup);

    // Flush coastal overlook turntable (0.025m low-profile brushed slate disc sitting flush on highway)
    const plinthGeo = new THREE.CylinderGeometry(3.15, 3.3, 0.024, 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.28,
    });
    this.showroomTurntable = new THREE.Mesh(plinthGeo, plinthMat);
    this.showroomTurntable.position.set(
      this.showcasePt.x,
      this.showcasePt.y + 0.012,
      this.showcasePt.z,
    );
    this.showroomTurntable.receiveShadow = true;
    this.scene.add(this.showroomTurntable);

    // High-threshold selective bloom, radial speed blur & lens raindrop refraction composer (Hardware GPU)
    if (!this.isSoftwareGl) {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.0,
        0.28,
        1.35,
      );
      this.composer.addPass(this.bloomPass);
      this.speedBlurPass = new ShaderPass(RadialSpeedBlurShader);
      this.composer.addPass(this.speedBlurPass);
      this.rainLensPass = new ShaderPass(RainLensShader);
      this.rainLensPass.uniforms.uAspect.value = w / Math.max(1, h);
      this.rainLensPass.enabled = false;
      this.composer.addPass(this.rainLensPass);
      this.composer.addPass(new OutputPass());
    }

    this.trafficAI = new TrafficAndAIManager(
      this.textures.contactShadowMap,
      settings.trafficDensity ?? 'normal',
    );
    this.scene.add(this.trafficAI.group);

    // Comprehensive Weather VFX System (3D Streaks, Splashes, Spray, Fog Banks, Lightning, Beam Haze)
    this.weatherEffects = new WeatherEffectsSystem(
      Math.max(1, container.clientHeight) * this.renderer.getPixelRatio(),
    );
    this.scene.add(this.weatherEffects.group);

    // Pooled Garage High-Pressure Water & Soap Foam Spray Particles
    const wsCanvas = document.createElement('canvas');
    wsCanvas.width = 64;
    wsCanvas.height = 64;
    const wsCtx = wsCanvas.getContext('2d')!;
    const wsGrad = wsCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
    wsGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    wsGrad.addColorStop(0.45, 'rgba(224,242,254,0.65)');
    wsGrad.addColorStop(1, 'rgba(186,230,253,0)');
    wsCtx.fillStyle = wsGrad;
    wsCtx.fillRect(0, 0, 64, 64);
    this.washSpriteTex = new THREE.CanvasTexture(wsCanvas);
    this.washSpriteTex.colorSpace = THREE.SRGBColorSpace;

    const washCount = 240;
    this.washPositions = new Float32Array(washCount * 3);
    this.washVelocities = new Float32Array(washCount * 3);
    const washGeo = new THREE.BufferGeometry();
    washGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.washPositions, 3),
    );
    const washMat = new THREE.PointsMaterial({
      color: 0xf0f9ff,
      map: this.washSpriteTex,
      size: 0.28,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.washPoints = new THREE.Points(washGeo, washMat);
    this.washPoints.visible = false;
    this.washPoints.frustumCulled = false;
    this.scene.add(this.washPoints);

    // High-Fidelity Additive Tire Smoke, Asphalt Skidmarks & Crash VFX Systems
    this.tireSmoke = new TireSmokeSystem(
      Math.max(1, container.clientHeight) * this.renderer.getPixelRatio(),
    );
    this.scene.add(this.tireSmoke.points);

    this.skidmarks = new TireSkidmarkSystem();
    this.scene.add(this.skidmarks.mesh);

    this.crashEffects = new CrashEffectsSystem(
      Math.max(1, container.clientHeight) * this.renderer.getPixelRatio(),
    );
    this.scene.add(this.crashEffects.group);

    this.nitroFire = new NitroFireSystem(
      Math.max(1, container.clientHeight) * this.renderer.getPixelRatio(),
    );
    this.scene.add(this.nitroFire.group);

    // Spawn player showcase vehicle cleanly on coastal highway overlook
    this.setPlayerCar(initialCar);
    this.applySettings(settings);
    this.applyAtmosphere();
    this.syncCarPoseToTrack();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('fullscreenchange', this.handleFullscreenResize);
    document.addEventListener('webkitfullscreenchange', this.handleFullscreenResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);

    this.startLoop();
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
  };

  private syncCarPoseToTrack(dt = 0): void {
    if (!this.playerCarRig) return;
    const st = TRACK_STATIONS[this.physics.stationIdx] ?? TRACK_STATIONS[0];
    const bank = this.physics.trackBankRad;
    const cosB = Math.cos(bank);
    const sinB = Math.sin(bank);

    _roadTangent.set(st.tx, st.ty, st.tz).normalize();
    _roadRight.set(st.rx * cosB, sinB, st.rz * cosB).normalize();
    _roadNormal.crossVectors(_roadRight, _roadTangent).normalize();
    if (_roadNormal.y < 0) _roadNormal.negate();

    _qSurface.setFromUnitVectors(_worldUp, _roadNormal);
    if (dt > 0) {
      this.smoothedSurfaceQuat.slerp(_qSurface, 1 - Math.exp(-14 * dt));
    } else {
      this.smoothedSurfaceQuat.copy(_qSurface);
    }
    _qYaw.setFromAxisAngle(_worldUp, this.physics.heading);

    this.playerCarRig.root.position.set(
      this.physics.x,
      this.physics.y,
      this.physics.z,
    );
    this.playerCarRig.root.quaternion.copy(this.smoothedSurfaceQuat).multiply(_qYaw);
  }

  public setPlayerCar(carData: OwnedCarData): void {
    this.currentCarData = carData;
    this.carDirtLevel = carData.dirtLevel ?? 0;
    this.washActive = false;
    this.washTimer = 0;
    this.washPoints.visible = false;
    const spec = getCarSpec(carData.carId);
    audioEngine.setEngineProfile(spec.engineSoundProfile);

    if (this.playerCarRig) {
      this.scene.remove(this.playerCarRig.root);
      this.playerCarRig.dispose();
    }

    this.playerCarRig = createCarModel(spec, carData.customization, {
      contactShadowMap: this.textures.contactShadowMap,
      carbonMap: this.textures.carbonMap,
      dirtMap: this.textures.carDirtMap,
    });
    this.playerCarRig.setDirt(this.carDirtLevel, -1, 0);
    this.scene.add(this.playerCarRig.root);
    this.syncCarPoseToTrack();
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
    audioEngine.applySettings(settings);
    this.trafficAI.setTrafficDensity(settings.trafficDensity ?? 'normal');

    let dpr = 1;
    let shadowEnabled = !this.isSoftwareGl;
    let shadowRes = DEFAULT_SHADOW_MAP_RES;
    let farPlane = 1750;
    if (!this.isSoftwareGl) {
      const baseDpr = window.devicePixelRatio || 1;
      if (settings.graphicsPreset === 'LOW') {
        dpr = 0.8;
        shadowEnabled = false;
        farPlane = 950;
      } else if (settings.graphicsPreset === 'MEDIUM') {
        dpr = Math.min(baseDpr, 1.0);
        shadowRes = 1024;
        farPlane = 1250;
      } else if (settings.graphicsPreset === 'HIGH') {
        dpr = Math.min(baseDpr, 1.25);
        shadowRes = 1536;
        farPlane = 1550;
      } else {
        dpr = Math.min(baseDpr, 1.6);
        shadowRes = 2048;
        farPlane = 1950;
      }
    }
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = shadowEnabled;
    if (
      shadowEnabled &&
      this.sunLight.shadow.mapSize.width !== shadowRes
    ) {
      this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    this.shadowTexelSize = (SHADOW_HALF_EXTENT * 2) / shadowRes;
    this.camera.far = farPlane;
    this.camera.updateProjectionMatrix();

    this.usePostProcessing =
      !this.isSoftwareGl &&
      settings.graphicsPreset !== 'LOW' &&
      this.composer !== null;

    if (this.composer) {
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    const pxH = Math.max(1, this.container.clientHeight) * dpr;
    this.tireSmoke.setViewportHeight(pxH);
    this.crashEffects.setViewportHeight(pxH);
    this.nitroFire.setViewportHeight(pxH);
    this.weatherEffects.setViewportHeight(pxH);
    if (this.rainLensPass) {
      this.rainLensPass.uniforms.uAspect.value =
        Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
    }
    this.syncBloomStrength();
  }

  private syncBloomStrength(): void {
    if (!this.bloomPass) return;
    if (this.settings.graphicsPreset === 'LOW') {
      this.bloomPass.strength = 0;
      this.bloomPass.enabled = false;
    } else {
      const str = this.atmosphere.state.bloomStrength;
      this.bloomPass.strength = str;
      this.bloomPass.enabled = str > 0.015;
    }
  }

  public setAtmosphere(weather: WeatherType, time: TimeOfDay): void {
    this.weather = weather;
    this.timeOfDay = time;
    this.cyclePhase = timePresetToPhase(time);
    this.applyAtmosphere();
  }

  public setAutoDayNightCycle(enabled: boolean): void {
    this.autoDayNightCycle = enabled;
  }

  public toggleAutoDayNightCycle(): boolean {
    this.autoDayNightCycle = !this.autoDayNightCycle;
    return this.autoDayNightCycle;
  }

  private applyAtmosphere(): void {
    this.atmosphere.update(
      this.elapsedTime,
      this.cyclePhase,
      this.physics.x,
      this.physics.z,
      this.weather,
      this.camera.far,
      this.lightningFlash,
    );
    const atm = this.atmosphere.state;
    this.timeOfDay = atm.derivedTimeOfDay;

    let fogDensity = 0.00042;
    if (this.weather === 'fog') {
      fogDensity = 0.0145 + atm.nightFactor * 0.0025;
    } else if (this.weather === 'thunderstorm') {
      fogDensity = 0.0044 + atm.nightFactor * 0.0011;
    } else if (this.weather === 'heavy_rain') {
      fogDensity = 0.0038 + atm.nightFactor * 0.0010;
    } else if (this.weather === 'rain') {
      fogDensity = 0.0024 + atm.nightFactor * 0.0009;
    } else if (this.weather === 'cloudy') {
      fogDensity = 0.00145 + atm.nightFactor * 0.00085;
    } else {
      const goldenMist = Math.max(0, 1 - Math.abs(atm.sunElevation) * 4.2) * 0.00018;
      fogDensity += goldenMist + atm.nightFactor * 0.00095;
    }

    const targetEnvTex =
      atm.nightFactor > 0.45
        ? this.nightEnvTex
        : this.weather === 'fog' ||
            this.weather === 'cloudy' ||
            this.weather === 'rain' ||
            this.weather === 'heavy_rain' ||
            this.weather === 'thunderstorm'
          ? this.overcastEnvTex
          : this.dayEnvTex;
    if (this.scene.environment !== targetEnvTex) {
      this.scene.environment = targetEnvTex;
    }

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(atm.fogColor);
      this.scene.fog.density = fogDensity;
    } else {
      this.scene.fog = new THREE.FogExp2(atm.fogColor.getHex(), fogDensity);
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(atm.fogColor);
    } else {
      this.scene.background = atm.fogColor.clone();
    }

    this.sunLight.color.copy(atm.keyColor);
    this.sunLight.intensity = atm.keyIntensity;
    this.skyFillLight.intensity = atm.dayFactor * 0.38;
    this.skyFillLight.position.set(
      this.physics.x - atm.keyDirection.x * 70,
      this.physics.y + 52,
      this.physics.z - atm.keyDirection.z * 70,
    );
    this.skyFillLight.target.position.set(this.physics.x, this.physics.y, this.physics.z);
    this.skyFillLight.target.updateMatrixWorld();

    this.hemiLight.color.copy(atm.hemiSkyColor);
    this.hemiLight.groundColor.copy(atm.hemiGroundColor);
    this.hemiLight.intensity = atm.hemiIntensity + this.lightningFlash * 0.42;
    this.scene.environmentIntensity = atm.envIntensity + this.lightningFlash * 0.16;
    this.renderer.toneMappingExposure = atm.exposure;

    this.syncBloomStrength();
  }

  public setShowcaseMode(enabled: boolean): void {
    this.mode = enabled ? 'showcase' : 'drive';
    this.showroomTurntable.visible = enabled;
    if (this.softboxA) this.softboxA.intensity = enabled ? 1.35 : 0;
    if (this.softboxB) this.softboxB.intensity = enabled ? 0.85 : 0;

    this.smoothedDigitalSteer = 0;
    if (enabled) {
      this.paused = false;
      this.activeEvent = null;
      this.raceState = 'free_roam';
      this.trafficAI.clearRacers();
      this.tireSmoke.clear();
      this.wasDriftSmokeActive = false;
      this.continuousNoBrakeDriftSec = 0;
      this.skidmarks.clear();
      this.crashEffects.clear();
      this.nitroFire.clear();
      this.weatherEffects.clear();
      this.wasNitroFlameActive = false;
      this.crashFlash = 0;
      this.washActive = false;
      this.washPoints.visible = false;
      this.physics = createInitialPhysicsStateAtS(SHOWCASE_S, 0);
      this.physics.y = this.showcasePt.y + 0.02;
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
        this.speedBlurPass.uniforms.uRainStreak.value = 0;
        this.speedBlurPass.uniforms.uInnerRadius.value = 0.15;
      }
      if (this.currentCarData) {
        this.onDirtChange?.(this.currentCarData.carId, this.carDirtLevel);
      }
      if (this.playerCarRig) {
        this.syncCarPoseToTrack();
        this.playerCarRig.setBodyTilt(0, 0, 0);
        this.playerCarRig.setCockpitMode(false);
        this.playerCarRig.setLights(true, false, false);
        this.playerCarRig.setDirt(this.carDirtLevel, -1, 0);
        this.playerCarRig.setDamage(0);
      }
      audioEngine.updateContinuous({
        active: false,
        rpm: 0,
        maxRpm: 8500,
        throttle: 0,
        driftIntensity: 0,
        nitroActive: false,
        policeActive: false,
        policeDistanceM: 999,
        elapsedTime: 0,
      });
    } else {
      this.washActive = false;
      this.washPoints.visible = false;
      this.playerCarRig?.setDirt(this.carDirtLevel, -1, 0);
    }
  }

  public startCarWash(): boolean {
    if (this.mode !== 'showcase' || !this.playerCarRig || this.washActive) {
      return false;
    }
    this.washActive = true;
    this.washTimer = 0;
    this.washStartDirt = Math.max(0.06, this.carDirtLevel);

    const cx = this.physics.x;
    const cy = this.physics.y + 0.9;
    const cz = this.physics.z;
    for (let i = 0; i < this.washPositions.length; i += 3) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.8 + Math.random() * 1.9;
      this.washPositions[i] = cx + Math.cos(ang) * rad;
      this.washPositions[i + 1] = cy + (Math.random() - 0.2) * 1.1;
      this.washPositions[i + 2] = cz + Math.sin(ang) * rad;
      this.washVelocities[i] = Math.cos(ang) * (0.8 + Math.random() * 1.2);
      this.washVelocities[i + 1] = 0.6 + Math.random() * 1.1;
      this.washVelocities[i + 2] = Math.sin(ang) * (0.8 + Math.random() * 1.2);
    }
    this.washPoints.geometry.attributes.position.needsUpdate = true;
    this.washPoints.visible = true;
    audioEngine.playCarWash(this.washDuration);
    return true;
  }

  public adjustShowcaseOrbit(dx: number, dy: number, zoomDelta = 0): void {
    this.autoOrbit = false;
    this.orbitYaw -= dx * 0.008;
    this.orbitPitch = THREE.MathUtils.clamp(
      this.orbitPitch + dy * 0.006,
      0.08,
      0.85,
    );
    this.orbitDist = THREE.MathUtils.clamp(
      this.orbitDist + zoomDelta,
      2.9,
      8.5,
    );
  }

  public resetShowcaseOrbit(): void {
    this.autoOrbit = true;
    this.orbitYaw = this.showcasePt.heading + 0.56;
    this.orbitPitch = 0.14;
    this.orbitDist = 4.15;
  }

  public setShowcaseRightOffset(enabled: boolean): void {
    this.showcaseRightOffset = enabled;
  }

  private snapDrivingCamera(): void {
    this.fpPitch = 0;
    this.fpRoll = 0;
    this.fpHeave = 0;
    _cockpitHeadOffset.set(0, 0, 0);
    if (
      (this.cameraMode === 'cockpit' ||
        this.cameraMode === 'hood' ||
        this.cameraMode === 'bumper') &&
      this.playerCarRig
    ) {
      this.playerCarRig.setCockpitMode(this.cameraMode === 'cockpit');
      this.playerCarRig.root.updateMatrixWorld(true);
      const anchors = this.playerCarRig.getCameraAnchors();
      const eyeLocal =
        this.cameraMode === 'cockpit'
          ? anchors.cockpitEyeLocal
          : this.cameraMode === 'hood'
            ? anchors.hoodEyeLocal
            : anchors.bumperEyeLocal;
      const lookLocal =
        this.cameraMode === 'cockpit'
          ? anchors.cockpitLookLocal
          : this.cameraMode === 'hood'
            ? anchors.hoodLookLocal
            : anchors.bumperLookLocal;
      _cockpitEyeWorld.copy(eyeLocal).applyMatrix4(this.playerCarRig.root.matrixWorld);
      _cockpitLookWorld.copy(lookLocal).applyMatrix4(this.playerCarRig.root.matrixWorld);
      _cockpitUpWorld
        .set(0, 1, 0)
        .transformDirection(this.playerCarRig.root.matrixWorld)
        .normalize();
      this.camera.near = this.cameraMode === 'cockpit' ? 0.14 : 0.18;
      this.camera.fov =
        this.cameraMode === 'cockpit' ? 68 : this.cameraMode === 'hood' ? 62 : 66;
      this.camera.position.copy(_cockpitEyeWorld);
      this.camera.up.copy(_cockpitUpWorld);
      this.camera.lookAt(_cockpitLookWorld);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.playerCarRig?.setCockpitMode(false);
    this.camera.near = 0.2;
    this.camera.up.copy(_worldUp);
    const sinH = Math.sin(this.physics.heading);
    const cosH = Math.cos(this.physics.heading);
    const backDist = this.cameraMode === 'far' ? 5.45 : 3.85;
    const heightOffset = this.cameraMode === 'far' ? 2.05 : 1.3;
    const lookAhead = this.cameraMode === 'far' ? 15.0 : 14.0;
    const camX = this.physics.x - sinH * backDist;
    const camZ = this.physics.z - cosH * backDist;
    const surfaceAtCam = getDriveSurfaceHeight(camX, camZ, this.physics.stationIdx);
    const camY = Math.max(surfaceAtCam + 0.9, this.physics.y + heightOffset);
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(
      this.physics.x + sinH * lookAhead,
      this.physics.y + 0.78,
      this.physics.z + cosH * lookAhead,
    );
    this.camera.fov = this.cameraMode === 'far' ? 50 : 48;
    this.camera.updateProjectionMatrix();
  }

  public startFreeRoamAtS(s = DRIVE_SPAWN_S): void {
    audioEngine.init();
    this.setShowcaseMode(false);
    this.activeEvent = null;
    this.raceState = 'free_roam';
    this.trafficAI.clearRacers();
    this.crashEffects.clear();
    this.nitroFire.clear();
    this.weatherEffects.clear();
    this.wasNitroFlameActive = false;
    this.crashFlash = 0;
    this.cameraCrashRoll = 0;
    this.physics = createInitialPhysicsStateAtS(s, 0);
    this.playerCarRig?.setDamage(0);
    this.world.checkpointBeacon.visible = false;
    this.syncCarPoseToTrack();
    this.snapDrivingCamera();
  }

  public startFreeRoam(spawnX?: number, spawnZ?: number): void {
    if (spawnX !== undefined && spawnZ !== undefined) {
      const proj = projectOntoTrack(spawnX, spawnZ);
      this.startFreeRoamAtS(proj.station.s);
    } else {
      this.startFreeRoamAtS(DRIVE_SPAWN_S);
    }
  }

  public fastTravelTo(x: number, z: number): void {
    this.tireSmoke.clear();
    this.wasDriftSmokeActive = false;
    this.continuousNoBrakeDriftSec = 0;
    this.skidmarks.clear();
    this.crashEffects.clear();
    this.nitroFire.clear();
    this.weatherEffects.clear();
    this.wasNitroFlameActive = false;
    this.crashFlash = 0;
    this.cameraCrashRoll = 0;
    const proj = projectOntoTrack(x, z);
    this.physics = createInitialPhysicsStateAtS(proj.station.s, 0);
    this.playerCarRig?.setDamage(0);
    this.syncCarPoseToTrack();
    this.snapDrivingCamera();
  }

  public startRaceEvent(
    event: RaceEvent,
    weatherOverride?: WeatherType,
    timeOverride?: TimeOfDay,
  ): void {
    audioEngine.init();
    this.setShowcaseMode(false);
    this.activeEvent = event;
    this.setAtmosphere(
      weatherOverride ?? event.defaultWeather,
      timeOverride ?? event.defaultTime,
    );

    this.crashEffects.clear();
    this.nitroFire.clear();
    this.weatherEffects.clear();
    this.wasNitroFlameActive = false;
    this.crashFlash = 0;
    this.cameraCrashRoll = 0;
    this.physics = createInitialPhysicsStateAtS(event.startS, 0);
    this.physics.totalDriftScore = 0;
    this.playerCarRig?.setDamage(0);

    this.currentLap = 1;
    this.checkpointIdx = 0;
    this.raceElapsedSec = 0;
    this.bestLapSec = 9999;
    this.lapStartSec = 0;
    this.raceTopSpeedKmh = 0;

    this.trafficAI.spawnRaceOpponents(
      event.aiCount,
      event.startS,
      event.difficulty,
    );

    this.raceState = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownInt = 4;
    this.updateCheckpointBeacon();
    this.syncCarPoseToTrack();
    this.snapDrivingCamera();
  }

  public resetCarToRoad(): void {
    const st = TRACK_STATIONS[this.physics.stationIdx] ?? TRACK_STATIONS[0];
    this.physics = createInitialPhysicsStateAtS(st.s, 0);
    this.tireSmoke.clear();
    this.wasDriftSmokeActive = false;
    this.continuousNoBrakeDriftSec = 0;
    this.skidmarks.clear();
    this.crashEffects.clear();
    this.nitroFire.clear();
    this.weatherEffects.clear();
    this.wasNitroFlameActive = false;
    this.crashFlash = 0;
    this.cameraCrashRoll = 0;
    this.playerCarRig?.setDamage(0);
    this.syncCarPoseToTrack();
    this.snapDrivingCamera();
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (p) {
      this.keysHeld.clear();
      audioEngine.updateContinuous({
        active: false,
        rpm: 0,
        maxRpm: 8500,
        throttle: 0,
        driftIntensity: 0,
        nitroActive: false,
        policeActive: false,
        policeDistanceM: 999,
        elapsedTime: 0,
      });
    }
  }

  public setPhotoMode(enabled: boolean): void {
    if (this.mode !== 'drive') {
      this.photoMode = false;
      return;
    }
    this.photoMode = enabled;
    if (enabled) {
      this.playerCarRig?.setCockpitMode(false);
      this.keysHeld.clear();
      this.touchInput = {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
        nitro: false,
      };
      this.resetPhotoCamera();
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = this.photoBlurEnabled
          ? this.photoBlurIntensity * 0.95
          : 0;
        this.speedBlurPass.uniforms.uRainStreak.value = 0;
        this.speedBlurPass.uniforms.uInnerRadius.value = 0.15;
        (this.speedBlurPass.uniforms.uCenter.value as THREE.Vector2).set(0.5, 0.5);
      }
      audioEngine.updateContinuous({
        active: false,
        rpm: 0,
        maxRpm: 8500,
        throttle: 0,
        driftIntensity: 0,
        nitroActive: false,
        policeActive: false,
        policeDistanceM: 999,
        elapsedTime: 0,
      });
    } else {
      this.camera.rotation.z = 0;
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
        this.speedBlurPass.uniforms.uRainStreak.value = 0;
        this.speedBlurPass.uniforms.uInnerRadius.value = 0.15;
        (this.speedBlurPass.uniforms.uCenter.value as THREE.Vector2).set(0.5, 0.46);
      }
    }
  }

  public resetPhotoCamera(): void {
    this.photoYaw = this.physics.heading + 0.58;
    this.photoPitch = 0.14;
    this.photoDist = 4.1;
    this.photoHeight = 0.68;
    this.photoFov = 44;
    this.photoRollDeg = 0;
    this.photoBlurEnabled = false;
    this.photoBlurIntensity = 0.45;
    if (this.speedBlurPass) {
      this.speedBlurPass.uniforms.uBlurAmount.value = 0;
      this.speedBlurPass.uniforms.uRainStreak.value = 0;
      this.speedBlurPass.uniforms.uInnerRadius.value = 0.15;
    }
  }

  public adjustPhotoOrbit(dx: number, dy: number, zoomDelta = 0): void {
    this.photoYaw -= dx * 0.008;
    this.photoPitch = THREE.MathUtils.clamp(
      this.photoPitch + dy * 0.006,
      -0.06,
      1.18,
    );
    this.photoDist = THREE.MathUtils.clamp(
      this.photoDist + zoomDelta,
      2.6,
      16.0,
    );
  }

  public setPhotoCameraParams(patch: {
    fov?: number;
    height?: number;
    rollDeg?: number;
    dist?: number;
    motionBlur?: boolean;
    blurIntensity?: number;
  }): void {
    if (patch.fov !== undefined) {
      this.photoFov = THREE.MathUtils.clamp(patch.fov, 24, 85);
    }
    if (patch.height !== undefined) {
      this.photoHeight = THREE.MathUtils.clamp(patch.height, -0.25, 2.4);
    }
    if (patch.rollDeg !== undefined) {
      this.photoRollDeg = THREE.MathUtils.clamp(patch.rollDeg, -25, 25);
    }
    if (patch.dist !== undefined) {
      this.photoDist = THREE.MathUtils.clamp(patch.dist, 2.6, 16.0);
    }
    if (patch.motionBlur !== undefined) {
      this.photoBlurEnabled = patch.motionBlur;
    }
    if (patch.blurIntensity !== undefined) {
      this.photoBlurIntensity = THREE.MathUtils.clamp(patch.blurIntensity, 0, 1);
    }
    if (this.photoMode && this.speedBlurPass) {
      this.speedBlurPass.uniforms.uBlurAmount.value = this.photoBlurEnabled
        ? this.photoBlurIntensity * 0.95
        : 0;
      (this.speedBlurPass.uniforms.uCenter.value as THREE.Vector2).set(0.5, 0.5);
    }
  }

  public capturePhotoDataUrl(): string | null {
    if (this.contextLost) return null;
    try {
      const blurVal = this.speedBlurPass ? (this.speedBlurPass.uniforms.uBlurAmount.value as number) : 0;
      const rainStreakVal = this.speedBlurPass ? (this.speedBlurPass.uniforms.uRainStreak.value as number) : 0;
      if (this.speedBlurPass) {
        this.speedBlurPass.enabled = blurVal > 0.004 || rainStreakVal > 0.004;
      }
      const useComposerNow =
        this.composer !== null &&
        ((this.usePostProcessing && ((this.bloomPass?.enabled ?? false) || (this.speedBlurPass?.enabled ?? false))) ||
          (this.photoMode && this.photoBlurEnabled && this.photoBlurIntensity > 0.003));
      if (useComposerNow && this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      return this.renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  public cycleCamera(): void {
    const order: CameraMode[] = ['chase', 'far', 'hood', 'cockpit', 'bumper', 'cinematic'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
    this.playerCarRig?.setCockpitMode(next === 'cockpit');
    this.emitTelemetry();
  }

  public toggleHeadlights(): void {
    const autoOn =
      this.timeOfDay === 'night' ||
      this.timeOfDay === 'sunset' ||
      this.weather === 'fog' ||
      this.weather === 'rain' ||
      this.weather === 'heavy_rain' ||
      this.weather === 'thunderstorm';
    const current = this.headlightsManual ?? autoOn;
    this.headlightsManual = !current;
  }

  public setTouchInput(patch: Partial<ControlInputState>): void {
    Object.assign(this.touchInput, patch);
  }

  public shiftGear(delta: -1 | 1): void {
    this.manualShiftQueue = delta;
  }

  private updateCheckpointBeacon(): void {
    if (!this.activeEvent) {
      this.world.checkpointBeacon.visible = false;
      return;
    }
    const cpS = this.activeEvent.checkpointsS[this.checkpointIdx];
    if (cpS === undefined) {
      this.world.checkpointBeacon.visible = false;
      return;
    }
    const pt = getRoadPointAt(cpS, 0);
    this.world.checkpointBeacon.position.set(pt.x, pt.y, pt.z);
    this.world.checkpointBeacon.visible = true;
  }

  private computeRacePosition(): number {
    if (!this.activeEvent || this.trafficAI.racers.length === 0) return 1;
    const relS = ((this.physics.trackProgress - this.activeEvent.startS) % 1 + 1) % 1;
    // Near start line before passing checkpoint 0, don't wrap backwards to 0.99
    const adjustedRelS = this.checkpointIdx === 0 && relS > 0.8 ? relS - 1 : relS;
    const playerTotalS = (this.currentLap - 1) + adjustedRelS;

    let pos = 1;
    for (const r of this.trafficAI.racers) {
      if (r.totalS > playerTotalS) pos++;
    }
    return pos;
  }

  private finishRace(won: boolean): void {
    this.raceState = 'finished';
    this.world.checkpointBeacon.visible = false;
    if (!this.activeEvent) return;

    const totalRacers = this.trafficAI.racers.length + 1;
    let position = 1;
    if (
      this.activeEvent.mode !== 'drift' &&
      this.activeEvent.mode !== 'time_attack'
    ) {
      position = this.computeRacePosition();
      won = position === 1;
    }

    const rewardScale = won ? 1.0 : position === 2 ? 0.55 : 0.3;
    const summary: RaceResultSummary = {
      eventId: this.activeEvent.id,
      eventTitle: this.activeEvent.title,
      mode: this.activeEvent.mode,
      position,
      totalRacers,
      timeSec: this.raceElapsedSec,
      bestLapSec:
        this.bestLapSec < 9000 ? this.bestLapSec : this.raceElapsedSec,
      driftScore: Math.round(
        this.physics.totalDriftScore + this.physics.currentDriftPoints,
      ),
      topSpeedKmh: Math.round(this.raceTopSpeedKmh),
      cashEarned: Math.round(this.activeEvent.rewardCash * rewardScale),
      xpEarned: Math.round(this.activeEvent.rewardXp * rewardScale),
      repEarned: Math.round(this.activeEvent.rewardRep * rewardScale),
      won,
    };

    this.onRaceComplete?.(summary);
  }

  private getCombinedInput(dt: number): ControlInputState {
    let throttle = this.touchInput.throttle;
    let brake = this.touchInput.brake;
    let handbrake = this.touchInput.handbrake;
    let nitro = this.touchInput.nitro;

    // Keyboard state
    let keySteer = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) throttle = 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) brake = 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) keySteer -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) keySteer += 1;
    if (this.keysHeld.has('Space')) handbrake = true;
    if (
      this.keysHeld.has('ShiftLeft') ||
      this.keysHeld.has('ShiftRight') ||
      this.keysHeld.has('KeyN') ||
      this.keysHeld.has('KeyX')
    ) {
      nitro = true;
    }

    // HTML5 Gamepad API polling (safely guarded against iframe Permissions-Policy blocks)
    let gpSteer = 0;
    if (
      !this.gamepadBlocked &&
      typeof navigator !== 'undefined' &&
      typeof navigator.getGamepads === 'function'
    ) {
      try {
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
          const gp = pads[i];
          if (!gp || !gp.connected) continue;
          const rawX = gp.axes[0] ?? 0;
          if (Math.abs(rawX) > 0.12) {
            const norm = (Math.abs(rawX) - 0.12) / 0.88;
            gpSteer = Math.sign(rawX) * norm * norm * 0.7 + Math.sign(rawX) * norm * 0.3;
          }
          const rt = gp.buttons[7]?.value ?? 0;
          const lt = gp.buttons[6]?.value ?? 0;
          if (rt > 0.05) throttle = Math.max(throttle, rt);
          if (lt > 0.05) brake = Math.max(brake, lt);
          if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) handbrake = true;
          if (gp.buttons[1]?.pressed || gp.buttons[5]?.pressed) nitro = true;
          const camBtn = !!gp.buttons[3]?.pressed;
          if (camBtn && !this.gpPrevCamBtn) {
            this.cycleCamera();
          }
          this.gpPrevCamBtn = camBtn;
          break;
        }
      } catch {
        this.gamepadBlocked = true;
      }
    }

    // Separate analog touch (wheel / tilt / rocker drag) vs digital keyboard/button taps
    const touchAbs = Math.abs(this.touchInput.steer);
    const isAnalogTouch =
      this.settings.controlScheme === 'wheel' ||
      this.settings.controlScheme === 'tilt' ||
      (touchAbs > 0.01 && touchAbs < 0.99);

    let finalSteer = 0;
    if (Math.abs(gpSteer) > 0.01) {
      this.smoothedDigitalSteer *= Math.exp(-10 * dt);
      finalSteer = gpSteer;
    } else if (isAnalogTouch && keySteer === 0) {
      this.smoothedDigitalSteer *= Math.exp(-10 * dt);
      finalSteer = this.touchInput.steer;
    } else {
      const targetDigital =
        keySteer !== 0
          ? THREE.MathUtils.clamp(keySteer, -1, 1)
          : Math.sign(this.touchInput.steer);

      const speedNorm = THREE.MathUtils.clamp(this.physics.speedKmh / 240, 0, 1);
      if (targetDigital === 0) {
        // Fast center return so taps straighten out cleanly
        const returnRate = 10.5;
        this.smoothedDigitalSteer +=
          (0 - this.smoothedDigitalSteer) * Math.min(1, dt * returnRate);
        if (Math.abs(this.smoothedDigitalSteer) < 0.01) this.smoothedDigitalSteer = 0;
      } else {
        const reversingDir = targetDigital * this.smoothedDigitalSteer < 0;
        const rampRate = reversingDir
          ? 8.8
          : 5.4 - speedNorm * 1.9;
        this.smoothedDigitalSteer +=
          (targetDigital - this.smoothedDigitalSteer) * Math.min(1, dt * rampRate);
      }
      finalSteer = this.smoothedDigitalSteer;
    }

    const steer = THREE.MathUtils.clamp(
      finalSteer * this.settings.steeringSensitivity,
      -1,
      1,
    );
    return { throttle, brake, steer, handbrake, nitro };
  }

  private handleResize = (): void => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
    const pxH = h * this.renderer.getPixelRatio();
    this.tireSmoke.setViewportHeight(pxH);
    this.crashEffects.setViewportHeight(pxH);
    this.nitroFire.setViewportHeight(pxH);
    this.weatherEffects.setViewportHeight(pxH);
    if (this.rainLensPass) {
      this.rainLensPass.uniforms.uAspect.value = w / h;
    }
  };

  private handleFullscreenResize = (): void => {
    this.handleResize();
    window.setTimeout(() => {
      if (!this.disposed) this.handleResize();
    }, 65);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
        e.code,
      )
    ) {
      e.preventDefault();
    }
    if (
      this.mode === 'drive' &&
      !this.paused &&
      document.activeElement instanceof HTMLButtonElement
    ) {
      document.activeElement.blur();
    }
    this.keysHeld.add(e.code);
    audioEngine.init();
    if (e.code === 'KeyC') this.cycleCamera();
    if (e.code === 'KeyL') this.toggleHeadlights();
    if (e.code === 'KeyR' && this.mode === 'drive' && !this.paused) {
      this.resetCarToRoad();
    }
    if (e.code === 'KeyE') this.manualShiftQueue = 1;
    if (e.code === 'KeyQ') this.manualShiftQueue = -1;
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private handleBlur = (): void => {
    this.keysHeld.clear();
    this.smoothedDigitalSteer = 0;
    this.touchInput = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      nitro: false,
    };
  };

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      if (rawDt > 0.0001) {
        this.fpsAccumFrames += 1;
        this.fpsAccumSec += rawDt;
        if (this.fpsAccumSec >= 0.35) {
          this.fpsCounter = this.fpsAccumFrames / this.fpsAccumSec;
          this.fpsAccumFrames = 0;
          this.fpsAccumSec = 0;
        }
      }

      if (!this.contextLost) {
        this.stepSimulation(dt);
        const blurVal = this.speedBlurPass ? (this.speedBlurPass.uniforms.uBlurAmount.value as number) : 0;
        const rainStreakVal = this.speedBlurPass ? (this.speedBlurPass.uniforms.uRainStreak.value as number) : 0;
        if (this.speedBlurPass) {
          this.speedBlurPass.enabled = blurVal > 0.004 || rainStreakVal > 0.004;
        }
        const rainLensActive = this.rainLensPass ? (this.rainLensPass.uniforms.uIntensity.value as number) > 0.01 && !this.photoMode : false;
        if (this.rainLensPass) this.rainLensPass.enabled = rainLensActive;
        const useComposerNow =
          this.composer !== null &&
          ((this.usePostProcessing &&
            ((this.bloomPass?.enabled ?? false) ||
              (this.speedBlurPass?.enabled ?? false) ||
              rainLensActive)) ||
            (this.photoMode && this.photoBlurEnabled && this.photoBlurIntensity > 0.003));
        if (useComposerNow && this.composer) {
          this.composer.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 4);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 16);
      }
    };
    this.frameId = window.setTimeout(poll, 4);
  }

  private updateTexelSnappedShadows(): void {
    const sd = this.atmosphere.state.keyDirection;
    _lightDir.copy(sd).normalize();

    // Bias shadow center slightly ahead of player along forward direction when driving
    const ahead = this.mode === 'drive' ? 10 : 0;
    const fx = this.physics.x + Math.sin(this.physics.heading) * ahead;
    const fy = this.physics.y;
    const fz = this.physics.z + Math.cos(this.physics.heading) * ahead;
    _focusPt.set(fx, fy, fz);

    // Construct orthonormal light basis & snap target to exact shadow texel grid to prevent shadow crawl
    _lightRight.crossVectors(_worldUp, _lightDir);
    if (_lightRight.lengthSq() < 1e-4) {
      _lightRight.set(1, 0, 0);
    } else {
      _lightRight.normalize();
    }
    _lightUp.crossVectors(_lightDir, _lightRight).normalize();

    const texel = this.shadowTexelSize;
    const projR = Math.round(_focusPt.dot(_lightRight) / texel) * texel;
    const projU = Math.round(_focusPt.dot(_lightUp) / texel) * texel;
    const projD = _focusPt.dot(_lightDir);

    this.sunLight.target.position
      .set(0, 0, 0)
      .addScaledVector(_lightRight, projR)
      .addScaledVector(_lightUp, projU)
      .addScaledVector(_lightDir, projD);
    this.sunLight.target.updateMatrixWorld();

    this.sunLight.position
      .copy(this.sunLight.target.position)
      .addScaledVector(_lightDir, 125);
  }

  private stepSimulation(dt: number): void {
    this.elapsedTime += dt;

    // Advance continuous 24h Day-Night cycle (frozen when paused or in Photo Mode)
    if (
      this.autoDayNightCycle &&
      !(this.mode === 'drive' && (this.paused || this.photoMode))
    ) {
      const cycleRate = this.mode === 'drive' ? 1 / 145 : 1 / 240;
      this.cyclePhase = (this.cyclePhase + dt * cycleRate) % 1;
    }

    const isWet =
      this.weather === 'rain' ||
      this.weather === 'heavy_rain' ||
      this.weather === 'thunderstorm';
    const rainLevel =
      this.weather === 'thunderstorm'
        ? 1.0
        : this.weather === 'heavy_rain'
          ? 0.88
          : this.weather === 'rain'
            ? 0.48
            : 0.0;

    if (this.weather === 'thunderstorm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningFlash = 1.0;
        this.lightningTimer = 3.2 + Math.random() * 5.8;
        this.thunderDelayTimer = 0.25 + Math.random() * 0.55;
        this.weatherEffects.triggerLightningBolt(
          this.physics.x,
          this.physics.y,
          this.physics.z,
          this.physics.heading,
        );
      }
      if (this.thunderDelayTimer > 0) {
        this.thunderDelayTimer -= dt;
        if (this.thunderDelayTimer <= 0) {
          this.thunderDelayTimer = -1;
          audioEngine.playThunder(0.75 + Math.random() * 0.25);
        }
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.8);
      }
    } else {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 5.0);
      this.thunderDelayTimer = -1;
    }

    this.applyAtmosphere();
    const atm = this.atmosphere.state;
    if (this.lightningFlash > 0.01) {
      const flicker =
        this.lightningFlash > 0.68
          ? 1.0
          : this.lightningFlash > 0.48
            ? 0.35
            : this.lightningFlash;
      this.sunLight.color.lerp(_lightningKeyColor, Math.min(1, flicker * 0.85));
      this.sunLight.intensity = atm.keyIntensity + flicker * 3.4;
    }

    this.world.updateDynamicWorld(
      this.elapsedTime,
      isWet,
      atm.nightFactor,
      this.physics.x,
      this.physics.z,
      rainLevel,
      this.weather === 'fog',
    );
    this.updateTexelSnappedShadows();

    // Update pooled warm-sodium streetlamp lights near player/showcase at night, fog & storm
    this.updateStreetLampLights(atm.nightFactor);

    if (this.rainLensPass) {
      this.rainLensPass.uniforms.uTime.value = this.elapsedTime;
      const camMult =
        this.cameraMode === 'cockpit' ||
        this.cameraMode === 'hood' ||
        this.cameraMode === 'bumper'
          ? 0.85
          : 0.42;
      this.rainLensPass.uniforms.uIntensity.value =
        this.mode === 'drive' && !this.photoMode ? rainLevel * camMult : rainLevel * 0.28;
      this.rainLensPass.uniforms.uSpeedNorm.value = THREE.MathUtils.clamp(
        this.physics.speedKmh / 180,
        0,
        1,
      );
      this.rainLensPass.uniforms.uNightFactor.value = atm.nightFactor;
    }

    if (this.mode === 'showcase') {
      this.headlightBeam.intensity = 0;
      this.taillightLight.intensity = 0;
      for (const tl of this.trafficHeadlights) tl.intensity = 0;
      const showcaseHl =
        atm.nightFactor > 0.25 || this.weather === 'fog' || isWet;
      if (this.playerCarRig) {
        this.playerCarRig.setLights(showcaseHl, false, false);
      }
      if (this.currentCarData) {
        this.weatherEffects.update({
          dt,
          elapsedTime: this.elapsedTime,
          weather: this.weather,
          physics: this.physics,
          spec: getCarSpec(this.currentCarData.carId),
          input: _IDLE_INPUT,
          headlightsOn: showcaseHl,
          nightFactor: atm.nightFactor,
          daylightFactor: atm.dayFactor,
          lightningFlash: this.lightningFlash,
          pixelHeight: Math.max(1, this.container.clientHeight) * this.renderer.getPixelRatio(),
          isCockpit: false,
          isFirstPerson: false,
        });
      }

      if (this.washActive && this.playerCarRig) {
        this.washTimer += dt;
        const tNorm = Math.min(1, this.washTimer / this.washDuration);
        const washProgress = tNorm * 1.12;
        const washFoam = Math.sin(tNorm * Math.PI) * 1.15;

        this.playerCarRig.setDirt(this.washStartDirt, washProgress, washFoam);
        this.carDirtLevel = Math.max(0, this.washStartDirt * (1 - tNorm));

        // Dual sweeping high-pressure spray nozzles orbiting the vehicle
        const sweepAngle = tNorm * Math.PI * 4.0 + this.physics.heading;
        const sprayY = this.physics.y + 1.45 - tNorm * 1.15;
        for (let i = 0; i < this.washPositions.length; i += 3) {
          this.washPositions[i] += this.washVelocities[i] * dt;
          this.washPositions[i + 1] += this.washVelocities[i + 1] * dt;
          this.washPositions[i + 2] += this.washVelocities[i + 2] * dt;
          this.washVelocities[i + 1] -= 4.2 * dt;

          if (this.washPositions[i + 1] < this.physics.y + 0.04) {
            const side = (i / 3) % 2 === 0 ? 1 : -1;
            const jetAng = sweepAngle + side * Math.PI * 0.5 + (Math.random() - 0.5) * 0.65;
            const nozzleR = 2.45;
            const targetR = 0.75 + Math.random() * 0.6;
            const nx = this.physics.x + Math.cos(jetAng) * nozzleR;
            const nz = this.physics.z + Math.sin(jetAng) * nozzleR;
            const tx = this.physics.x + Math.cos(jetAng) * targetR;
            const tz = this.physics.z + Math.sin(jetAng) * targetR;
            this.washPositions[i] = THREE.MathUtils.lerp(nx, tx, Math.random() * 0.35);
            this.washPositions[i + 1] = sprayY + (Math.random() - 0.4) * 0.45;
            this.washPositions[i + 2] = THREE.MathUtils.lerp(nz, tz, Math.random() * 0.35);
            this.washVelocities[i] = (tx - nx) * 2.4 + (Math.random() - 0.5) * 1.6;
            this.washVelocities[i + 1] = 0.65 + Math.random() * 1.4;
            this.washVelocities[i + 2] = (tz - nz) * 2.4 + (Math.random() - 0.5) * 1.6;
          }
        }
        this.washPoints.geometry.attributes.position.needsUpdate = true;

        this.telemetryTimer += dt;
        if (this.telemetryTimer >= 0.08) {
          this.telemetryTimer = 0;
          this.emitTelemetry();
        }

        if (this.washTimer >= this.washDuration) {
          this.washActive = false;
          this.washPoints.visible = false;
          this.carDirtLevel = 0;
          this.physics.damageLevel = 0;
          this.playerCarRig.setDirt(0, -1, 0);
          this.playerCarRig.setDamage(0);
          if (this.currentCarData) {
            this.onDirtChange?.(this.currentCarData.carId, 0);
          }
          this.onWashComplete?.();
          this.emitTelemetry();
        }
      }

      if (this.autoOrbit) {
        this.orbitYaw += dt * (this.washActive ? 0.58 : 0.22);
      }
      const targetPan = this.showcaseRightOffset && !this.washActive ? 1.05 : 0;
      this.showcasePanAmount = THREE.MathUtils.damp(
        this.showcasePanAmount,
        targetPan,
        6,
        dt,
      );
      const leftX = -Math.cos(this.orbitYaw) * this.showcasePanAmount;
      const leftZ = Math.sin(this.orbitYaw) * this.showcasePanAmount;
      const cx =
        this.physics.x +
        leftX +
        Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      const cy =
        this.physics.y + 0.72 + Math.sin(this.orbitPitch) * this.orbitDist;
      const cz =
        this.physics.z +
        leftZ +
        Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      this.camera.near = 0.2;
      this.camera.up.copy(_worldUp);
      this.camera.position.lerp(_camTarget.set(cx, cy, cz), Math.min(1, dt * 8));
      this.camera.lookAt(
        this.physics.x + leftX,
        this.physics.y + 0.64,
        this.physics.z + leftZ,
      );
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 44, 6, dt);
      this.camera.updateProjectionMatrix();
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
        this.speedBlurPass.uniforms.uRainStreak.value = 0;
      }
      return;
    }

    if (this.photoMode && this.mode === 'drive') {
      const horiz = Math.cos(this.photoPitch) * this.photoDist;
      const cx = this.physics.x + Math.sin(this.photoYaw) * horiz;
      const cz = this.physics.z + Math.cos(this.photoYaw) * horiz;
      const surfaceAtCam = getDriveSurfaceHeight(cx, cz, this.physics.stationIdx);
      const cy = Math.max(
        surfaceAtCam + 0.3,
        this.physics.y + this.photoHeight + Math.sin(this.photoPitch) * this.photoDist,
      );
      this.camera.near = 0.2;
      this.camera.up.copy(_worldUp);
      this.camera.position.lerp(_camTarget.set(cx, cy, cz), Math.min(1, dt * 14));
      this.camera.lookAt(
        this.physics.x,
        this.physics.y + this.photoHeight,
        this.physics.z,
      );
      if (Math.abs(this.photoRollDeg) > 0.05) {
        this.camera.rotateZ(THREE.MathUtils.degToRad(this.photoRollDeg));
      }
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, this.photoFov, 10, dt);
      this.camera.updateProjectionMatrix();
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = this.photoBlurEnabled
          ? this.photoBlurIntensity * 0.95
          : 0;
        this.speedBlurPass.uniforms.uRainStreak.value = 0;
        this.speedBlurPass.uniforms.uInnerRadius.value = 0.15;
        (this.speedBlurPass.uniforms.uCenter.value as THREE.Vector2).set(0.5, 0.5);
      }
      return;
    }

    if (this.paused || !this.currentCarData || !this.playerCarRig) return;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    let input = this.getCombinedInput(dt);
    if (this.raceState === 'countdown') {
      this.countdownTimer -= dt;
      const ceilVal = Math.ceil(this.countdownTimer);
      if (ceilVal < this.lastCountdownInt && ceilVal >= 0) {
        this.lastCountdownInt = ceilVal;
        audioEngine.playCountdownBeep(ceilVal === 0);
      }
      if (this.countdownTimer <= 0) {
        this.raceState = 'racing';
      } else {
        input = {
          throttle: input.throttle * 0.25,
          brake: 1,
          steer: 0,
          handbrake: false,
          nitro: false,
        };
      }
    }

    const spec = getCarSpec(this.currentCarData.carId);
    const prevX = this.physics.x;
    const prevZ = this.physics.z;

    if (this.raceState === 'free_roam' || this.raceState === 'racing') {
      stepVehiclePhysics(this.physics, input, spec, this.currentCarData.upgrades, {
        dt,
        weather: this.weather,
        transmission: this.settings.transmission,
        abs: this.settings.abs,
        tractionControl: this.settings.tractionControl,
        manualShiftRequest: this.manualShiftQueue,
      });
      this.manualShiftQueue = 0;
    }

    if (this.physics.justShifted) {
      audioEngine.playShiftPop();
    }

    const movedM = Math.hypot(this.physics.x - prevX, this.physics.z - prevZ);
    this.raceTopSpeedKmh = Math.max(this.raceTopSpeedKmh, this.physics.speedKmh);

    const autoHL =
      atm.nightFactor > 0.22 ||
      this.timeOfDay === 'night' ||
      this.timeOfDay === 'sunset' ||
      this.weather === 'fog' ||
      isWet;
    const hlOn = this.headlightsManual ?? autoHL;

    this.crashFlash = Math.max(0, this.crashFlash - dt * 2.8);
    this.cameraCrashRoll *= Math.exp(-7.5 * dt);
    this.cameraCrashJoltX *= Math.exp(-10 * dt);
    this.cameraCrashJoltZ *= Math.exp(-10 * dt);

    const aiRes = this.trafficAI.update(
      dt,
      this.physics,
      spec.massKg,
      this.raceState === 'racing',
      hlOn,
    );

    const maxImpact = Math.max(
      this.physics.lastCollisionImpact,
      aiRes.collisionImpact,
    );
    if (maxImpact > 0.1) {
      const kind = this.physics.lastCollisionKind === 'none' ? 'car' : this.physics.lastCollisionKind;
      audioEngine.playCollision(maxImpact, kind);
      this.crashEffects.emitCrashBurst({
        x: this.physics.lastCollisionPointX,
        y: this.physics.lastCollisionPointY,
        z: this.physics.lastCollisionPointZ,
        nx: this.physics.lastCollisionNx,
        nz: this.physics.lastCollisionNz,
        carVx: this.physics.vx,
        carVz: this.physics.vz,
        intensity: maxImpact,
        carColorHex: this.currentCarData.customization.paintColor,
        kind,
      });
      if (this.settings.cameraShake) {
        this.cameraShakeIntensity = Math.min(0.85, maxImpact * 0.72);
      }
      if (kind !== 'landing') {
        this.crashFlash = Math.min(1, maxImpact * 0.92);
        const crashSide =
          Math.cos(this.physics.heading) * this.physics.lastCollisionNx -
          Math.sin(this.physics.heading) * this.physics.lastCollisionNz;
        this.cameraCrashRoll = THREE.MathUtils.clamp(
          this.cameraCrashRoll + crashSide * maxImpact * 0.14,
          -0.18,
          0.18,
        );
        this.cameraCrashJoltX = -this.physics.lastCollisionNx * Math.min(0.55, maxImpact * 0.48);
        this.cameraCrashJoltZ = -this.physics.lastCollisionNz * Math.min(0.55, maxImpact * 0.48);
        if (maxImpact > 0.56) {
          this.hitstopTimer = 0.042;
        }
      }
    }

    if (this.physics.railScrapeIntensity > 0.05) {
      this.crashEffects.emitRailScrape(
        dt,
        this.physics.lastCollisionPointX,
        this.physics.lastCollisionPointY,
        this.physics.lastCollisionPointZ,
        this.physics.lastCollisionNx,
        this.physics.lastCollisionNz,
        this.physics.vx,
        this.physics.vz,
        this.physics.railScrapeIntensity,
      );
    }

    // Apply banked & sloped track pose + suspension posture to Player Car Rig
    this.syncCarPoseToTrack(dt);
    this.playerCarRig.setWheels(
      this.physics.steerAngle,
      this.physics.wheelSpinRad,
    );
    this.playerCarRig.setBodyTilt(
      this.physics.pitchRad,
      this.physics.rollRad,
      this.physics.heaveY,
    );
    this.playerCarRig.setDamage(this.physics.damageLevel);
    const flameVisible =
      this.physics.nitroActive || this.physics.exhaustFlameTimer > 0;
    const backfireOnly =
      !this.physics.nitroActive && this.physics.exhaustFlameTimer > 0;
    const damagedFlicker =
      this.physics.damageLevel > 0.78 && Math.sin(this.elapsedTime * 37) > 0.72
        ? false
        : hlOn;
    this.playerCarRig.setLights(
      damagedFlicker,
      input.brake > 0.1,
      flameVisible,
      this.elapsedTime,
      backfireOnly,
    );
    this.playerCarRig.setCockpitState({
      active: this.cameraMode === 'cockpit',
      steerRad: this.physics.steerAngle,
      rpm: this.physics.rpm,
      maxRpm: this.physics.maxRpm,
      speedKmh: this.physics.speedKmh,
      gear: this.physics.gear,
      nitro: this.physics.nitro,
      nitroMax: 100 + this.currentCarData.upgrades.nitro * 25,
      headlightsOn: damagedFlicker,
      nitroActive: this.physics.nitroActive,
      absActive: this.physics.absActive,
      tcsActive: this.physics.tcsActive,
    });

    // Dynamic Mud & Road Grime Accumulation during driving / free roam
    if (this.physics.speedKmh > 3) {
      const speedFactor = THREE.MathUtils.clamp(this.physics.speedKmh / 95, 0.08, 1.85);
      const driftBoost = this.physics.isDrifting ? 1.45 : 1.0;
      let accumRate = isWet ? 0.007 : 0.0012;
      if (this.physics.surface === 'dirt') accumRate = 0.056;
      else if (this.physics.surface === 'sand') accumRate = 0.042;
      else if (this.physics.surface === 'grass') accumRate = 0.036;
      else if (this.physics.surface === 'snow') accumRate = 0.024;
      else if (this.physics.surface === 'water') accumRate = -0.032;

      const minFloor = this.physics.surface === 'water' ? 0.04 : 0;
      this.carDirtLevel = THREE.MathUtils.clamp(
        this.carDirtLevel + accumRate * speedFactor * driftBoost * dt,
        minFloor,
        1,
      );
    }
    this.playerCarRig.setDirt(this.carDirtLevel, -1, 0);

    const sinH = Math.sin(this.physics.heading);
    const cosH = Math.cos(this.physics.heading);

    // Subtle NOS chassis vibration & engine surge feedback
    if (this.physics.nitroActive && this.settings.cameraShake) {
      this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, 0.045);
    }

    // Focused automotive LED beam cutting through dark nights, fog & driving rain
    if (hlOn) {
      const flickMult = damagedFlicker ? 1.0 : 0.35;
      const weatherBeamBoost = this.weather === 'fog' ? 115 : isWet ? 75 : 0;
      const beamStrength = (26 + atm.nightFactor * 310 + weatherBeamBoost) * flickMult;
      this.headlightBeam.position.set(
        this.physics.x + sinH * 2.15,
        this.physics.y + 0.84,
        this.physics.z + cosH * 2.15,
      );
      this.headlightBeam.target.position.set(
        this.physics.x + sinH * 115,
        this.physics.y - 0.12,
        this.physics.z + cosH * 115,
      );
      this.headlightBeam.target.updateMatrixWorld();
      this.headlightBeam.intensity = beamStrength;
    } else {
      this.headlightBeam.intensity = 0;
    }

    // Merged rear crimson taillight/brake & flickering cyan-to-amber afterburner PointLight pushed cleanly back behind diffuser
    const brakeBoost = input.brake > 0.1 ? 1.0 : 0.0;
    const rearGlowNeed = Math.max(atm.nightFactor, isWet ? 0.52 : this.weather === 'fog' ? 0.6 : 0);
    if (flameVisible) {
      if (backfireOnly) {
        this.taillightLight.color.setHex(0xf97316);
        this.taillightLight.intensity = 3.2 + Math.random() * 1.4;
      } else {
        const emberPulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 43);
        this.taillightLight.color
          .setHex(0x38bdf8)
          .lerp(_nitroAmberColor, emberPulse * 0.28);
        this.taillightLight.intensity = 5.0 + Math.random() * 2.6;
      }
      this.taillightLight.position.set(
        this.physics.x - sinH * 2.85,
        this.physics.y + 0.44,
        this.physics.z - cosH * 2.85,
      );
    } else if (rearGlowNeed > 0.18 || brakeBoost > 0) {
      this.taillightLight.color.setHex(0xff2040);
      this.taillightLight.position.set(
        this.physics.x - sinH * 2.85,
        this.physics.y + 0.50,
        this.physics.z - cosH * 2.85,
      );
      this.taillightLight.intensity = rearGlowNeed * (1.25 + brakeBoost * 2.4) + brakeBoost * 0.55;
    } else {
      this.taillightLight.intensity = 0;
    }

    // Pooled dynamic headlight pool on nearest oncoming/opponent cars at night / fog / storm
    const trafficLightFactor = Math.max(atm.nightFactor, isWet ? 0.45 : this.weather === 'fog' ? 0.55 : 0);
    if (trafficLightFactor > 0.2 && this.trafficHeadlights.length > 0) {
      const count = this.trafficAI.getNearestHeadlights(
        this.physics.x,
        this.physics.z,
        this.nearestHeadlightTargets,
        this.trafficHeadlights.length,
      );
      for (let i = 0; i < this.trafficHeadlights.length; i++) {
        const tl = this.trafficHeadlights[i];
        if (i < count) {
          const tgt = this.nearestHeadlightTargets[i];
          const ts = Math.sin(tgt.heading);
          const tc = Math.cos(tgt.heading);
          tl.position.set(tgt.x + ts * 6.5, tgt.y + 0.9, tgt.z + tc * 6.5);
          tl.intensity = 44 * trafficLightFactor;
        } else {
          tl.intensity = 0;
        }
      }
    } else {
      for (const tl of this.trafficHeadlights) tl.intensity = 0;
    }

    // Crash debris, molten sparks, impact smoke & radiator steam
    this.crashEffects.emitRadiatorSteam(
      dt,
      this.physics.x + sinH * 1.45,
      this.physics.y + 0.85,
      this.physics.z + cosH * 1.45,
      this.physics.damageLevel,
      this.physics.speedKmh,
    );
    this.crashEffects.update(dt, this.physics.y);

    // Volumetric Nitro Fire Tongues, Incandescent Embers & Heat-Soot Particles
    this.playerCarRig.chassisGroup.updateMatrixWorld(true);
    const exhaustAnchors = this.playerCarRig.getExhaustAnchors();
    if (flameVisible && !this.wasNitroFlameActive) {
      this.nitroFire.emitIgnitionBurst(
        this.playerCarRig.chassisGroup.matrixWorld,
        exhaustAnchors,
        this.physics.vx,
        this.physics.vz,
        this.physics.nitroActive,
      );
    }
    this.wasNitroFlameActive = flameVisible;
    this.nitroFire.update(dt, {
      chassisMatrixWorld: this.playerCarRig.chassisGroup.matrixWorld,
      exhaustAnchors,
      carVx: this.physics.vx,
      carVz: this.physics.vz,
      speedKmh: this.physics.speedKmh,
      nitroActive: this.physics.nitroActive,
      backfireActive: backfireOnly,
      roadY: this.physics.y,
      daylightFactor: atm.dayFactor,
    });

    // Velocity-aligned 3D rain streaks, asphalt splashes, tire spray, fog banks & volumetric beam haze
    this.weatherEffects.update({
      dt,
      elapsedTime: this.elapsedTime,
      weather: this.weather,
      physics: this.physics,
      spec,
      input,
      headlightsOn: hlOn,
      nightFactor: atm.nightFactor,
      daylightFactor: atm.dayFactor,
      lightningFlash: this.lightningFlash,
      pixelHeight: Math.max(1, this.container.clientHeight) * this.renderer.getPixelRatio(),
      isCockpit: this.cameraMode === 'cockpit',
      isFirstPerson:
        this.cameraMode === 'cockpit' ||
        this.cameraMode === 'hood' ||
        this.cameraMode === 'bumper',
    });

    // Volumetric Tire Smoke triggered when driftAngleDeg exceeds threshold + Asphalt Skidmarks
    const isBurnout =
      this.physics.surface === 'asphalt' &&
      input.throttle > 0.65 &&
      input.brake > 0.35 &&
      this.physics.speedKmh < 28;
    const driftAngleExceeded =
      this.physics.driftAngleDeg > DRIFT_SMOKE_ANGLE_THRESHOLD_DEG &&
      this.physics.speedKmh > 14;
    const driftSmokeActive =
      this.physics.grounded &&
      (driftAngleExceeded ||
        (input.handbrake && this.physics.speedKmh > 18) ||
        isBurnout);

    if (driftSmokeActive && !this.wasDriftSmokeActive && driftAngleExceeded) {
      this.tireSmoke.emitDriftEntryBurst(this.physics, spec, atm.dayFactor);
    }
    this.wasDriftSmokeActive = driftSmokeActive;

    this.tireSmoke.update(dt, this.physics, spec, input, this.weather, {
      driftThresholdDeg: DRIFT_SMOKE_ANGLE_THRESHOLD_DEG,
      daylightFactor: atm.dayFactor,
      driftActive: driftSmokeActive,
    });
    this.skidmarks.update(this.physics, spec, input.handbrake, isBurnout);

    // Track continuous drifting duration without pressing brake for Quest
    const activelyDriftingNoBrake =
      this.physics.grounded &&
      input.brake <= 0.08 &&
      (this.physics.isDrifting ||
        (this.physics.driftAngleDeg >= 9 && this.physics.speedKmh > 16));
    if (input.brake > 0.08 || !activelyDriftingNoBrake) {
      this.continuousNoBrakeDriftSec = 0;
    } else {
      this.continuousNoBrakeDriftSec += dt;
      const crossedTen =
        this.continuousNoBrakeDriftSec >= 10 &&
        this.bestNoBrakeDriftReported < 10;
      const halfSecTick =
        Math.floor(this.continuousNoBrakeDriftSec * 2) >
        Math.floor(this.bestNoBrakeDriftReported * 2);
      if (crossedTen || halfSecTick) {
        this.bestNoBrakeDriftReported = Math.max(
          this.bestNoBrakeDriftReported,
          this.continuousNoBrakeDriftSec,
        );
        this.onNoBrakeDriftUpdate?.(this.continuousNoBrakeDriftSec);
      }
    }

    const driftAudioLevel = Math.max(
      this.physics.isDrifting ? Math.min(1, this.physics.driftAngleDeg / 38) : 0,
      input.handbrake && this.physics.speedKmh > 18 ? 0.55 : 0,
      isBurnout ? 0.72 : 0,
    );

    audioEngine.updateContinuous({
      active:
        this.raceState === 'free_roam' ||
        this.raceState === 'racing' ||
        this.raceState === 'countdown',
      rpm: this.physics.rpm,
      maxRpm: this.physics.maxRpm,
      throttle: this.physics.nitroActive ? 1.0 : input.throttle,
      driftIntensity: driftAudioLevel,
      railScrape: this.physics.railScrapeIntensity,
      nitroActive: this.physics.nitroActive,
      policeActive: false,
      policeDistanceM: 999,
      elapsedTime: this.elapsedTime,
      rainLevel,
      inCockpit: this.cameraMode === 'cockpit',
    });

    // Spline Checkpoints & Race Completion
    if (this.raceState === 'racing' && this.activeEvent) {
      this.raceElapsedSec += dt;
      const cps = this.activeEvent.checkpointsS;
      const targetS = cps[this.checkpointIdx];
      if (targetS !== undefined) {
        const cpPt = getRoadPointAt(targetS, 0);
        const distCp = Math.hypot(
          cpPt.x - this.physics.x,
          cpPt.z - this.physics.z,
        );
        if (distCp < 24) {
          audioEngine.playUiClick();
          this.checkpointIdx += 1;
          if (this.checkpointIdx >= cps.length) {
            const lapDur = this.raceElapsedSec - this.lapStartSec;
            if (lapDur > 3 && lapDur < this.bestLapSec) {
              this.bestLapSec = lapDur;
            }
            this.lapStartSec = this.raceElapsedSec;

            if (this.currentLap >= this.activeEvent.laps) {
              let won = true;
              if (
                this.activeEvent.mode === 'drift' &&
                this.activeEvent.targetDriftScore
              ) {
                won =
                  this.physics.totalDriftScore +
                    this.physics.currentDriftPoints >=
                  this.activeEvent.targetDriftScore;
              } else if (
                this.activeEvent.mode === 'time_attack' &&
                this.activeEvent.targetTimeSec
              ) {
                won = this.bestLapSec <= this.activeEvent.targetTimeSec;
              }
              this.finishRace(won);
            } else {
              this.currentLap += 1;
              this.checkpointIdx = 0;
              this.updateCheckpointBeacon();
            }
          } else {
            this.updateCheckpointBeacon();
          }
        }
      }
    } else if (this.raceState === 'free_roam') {
      this.freeRoamAccumDist += movedM / 1000;
      this.freeRoamAccumTimer += dt;
      if (this.freeRoamAccumTimer >= 5) {
        const driftBank = Math.round(this.physics.totalDriftScore);
        this.physics.totalDriftScore = 0;
        const cashReward =
          Math.round(this.freeRoamAccumDist * 450) +
          Math.round(driftBank * 0.25);
        if (cashReward > 0 || this.freeRoamAccumDist > 0.02) {
          this.onFreeRoamReward?.(
            cashReward,
            Math.round(this.freeRoamAccumDist * 40),
            Math.round(this.freeRoamAccumDist * 15),
            this.freeRoamAccumDist,
            Math.round(this.physics.speedKmh),
            driftBank,
          );
        }
        if (this.currentCarData) {
          this.onDirtChange?.(this.currentCarData.carId, this.carDirtLevel);
        }
        this.freeRoamAccumDist = 0;
        this.freeRoamAccumTimer = 0;
      }
    }

    this.updateDrivingCamera(dt);

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.05) {
      this.telemetryTimer = 0;
      this.emitTelemetry();
    }
  }

  private updateDrivingCamera(dt: number): void {
    if (
      (this.cameraMode === 'cockpit' ||
        this.cameraMode === 'hood' ||
        this.cameraMode === 'bumper') &&
      this.playerCarRig
    ) {
      const isCockpit = this.cameraMode === 'cockpit';
      this.playerCarRig.root.updateMatrixWorld(true);
      const anchors = this.playerCarRig.getCameraAnchors();

      // Stabilized horizon damping (absorbs high-frequency road chatter while letting dash/hood respond naturally)
      this.fpPitch = THREE.MathUtils.damp(this.fpPitch, this.physics.pitchRad * 0.35, 11, dt);
      this.fpRoll = THREE.MathUtils.damp(this.fpRoll, this.physics.rollRad * 0.35, 11, dt);
      this.fpHeave = THREE.MathUtils.damp(this.fpHeave, this.physics.heaveY * 0.35, 12, dt);

      _fpEuler.set(this.fpPitch, 0, this.fpRoll, 'XYZ');
      _fpQuat.setFromEuler(_fpEuler);
      _fpBasisPos.set(0, this.fpHeave, 0);
      _fpMatrix.compose(_fpBasisPos, _fpQuat, _fpScale);
      _fpWorldMatrix.multiplyMatrices(this.playerCarRig.root.matrixWorld, _fpMatrix);

      if (isCockpit) {
        const targetLeanX = THREE.MathUtils.clamp(-this.physics.lateralG * 0.010, -0.018, 0.018);
        const targetBraceZ = THREE.MathUtils.clamp(-this.physics.longitudinalG * 0.006, -0.012, 0.012);
        _cockpitHeadOffset.x = THREE.MathUtils.damp(_cockpitHeadOffset.x, targetLeanX, 8, dt);
        _cockpitHeadOffset.z = THREE.MathUtils.damp(_cockpitHeadOffset.z, targetBraceZ, 9, dt);
        _cockpitHeadOffset.y = 0;
      } else {
        _cockpitHeadOffset.set(0, 0, 0);
      }

      if (this.cameraShakeIntensity > 0.005) {
        const microShake = Math.min(0.018, this.cameraShakeIntensity * 0.045);
        _cockpitHeadOffset.x += (Math.random() - 0.5) * microShake;
        _cockpitHeadOffset.y += (Math.random() - 0.5) * microShake * 0.7;
        this.cameraShakeIntensity *= Math.exp(-9 * dt);
      }

      const eyeLocal = isCockpit
        ? anchors.cockpitEyeLocal
        : this.cameraMode === 'hood'
          ? anchors.hoodEyeLocal
          : anchors.bumperEyeLocal;
      const lookLocal = isCockpit
        ? anchors.cockpitLookLocal
        : this.cameraMode === 'hood'
          ? anchors.hoodLookLocal
          : anchors.bumperLookLocal;

      _cockpitEyeWorld.copy(eyeLocal).add(_cockpitHeadOffset).applyMatrix4(_fpWorldMatrix);
      _cockpitLookWorld.copy(lookLocal).applyMatrix4(_fpWorldMatrix);
      _cockpitUpWorld.set(0, 1, 0).transformDirection(_fpWorldMatrix).normalize();

      this.camera.position.copy(_cockpitEyeWorld);
      this.camera.up.copy(_cockpitUpWorld);
      this.camera.lookAt(_cockpitLookWorld);

      if (Math.abs(this.cameraCrashRoll) > 0.001) {
        this.camera.rotateZ(THREE.MathUtils.clamp(this.cameraCrashRoll * 0.45, -0.08, 0.08));
      }

      const baseFov = isCockpit ? 68 : this.cameraMode === 'hood' ? 62 : 66;
      const targetFpFov =
        baseFov +
        Math.min(5.5, this.physics.speedKmh * 0.016) +
        (this.physics.nitroActive ? 4.5 : 0);
      this.camera.near = isCockpit ? 0.14 : 0.18;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFpFov, 7.5, dt);
      this.camera.updateProjectionMatrix();

      this.updateDrivingMotionBlur(dt, isCockpit);
      return;
    }

    this.camera.near = 0.2;
    this.camera.up.copy(_worldUp);

    const sinH = Math.sin(this.physics.heading);
    const cosH = Math.cos(this.physics.heading);

    let backDist = 3.85;
    let heightOffset = 1.3;
    let lookAhead = 14.0;
    let lateralSwing = -this.physics.angularVel * 0.22;
    let targetFov =
      48 +
      Math.min(9, this.physics.speedKmh * 0.032) +
      (this.physics.nitroActive ? 5 : 0);

    // Weight-feel G-force chase camera breathing: compresses closer on hard braking, stretches slightly under hard launch/NOS
    const gLongLag = THREE.MathUtils.clamp(this.physics.longitudinalG * 0.1, -0.16, 0.2);

    if (this.cameraMode === 'far') {
      backDist = 5.45 + gLongLag * 0.8;
      heightOffset = 2.05;
      lookAhead = 15;
      targetFov =
        50 +
        Math.min(8, this.physics.speedKmh * 0.028) +
        (this.physics.nitroActive ? 4 : 0);
    } else if (this.cameraMode === 'cinematic') {
      const sweep = this.elapsedTime * 0.45;
      _camTarget.set(
        this.physics.x + Math.sin(sweep) * 5.6,
        this.physics.y + 2.1,
        this.physics.z + Math.cos(sweep) * 5.6,
      );
      this.camera.position.lerp(_camTarget, 1 - Math.exp(-5 * dt));
      this.camera.lookAt(this.physics.x, this.physics.y + 0.8, this.physics.z);
      this.camera.updateProjectionMatrix();
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
        this.speedBlurPass.uniforms.uRainStreak.value = 0;
      }
      return;
    } else {
      backDist += gLongLag;
    }

    const camX =
      this.physics.x - sinH * backDist + cosH * lateralSwing + this.cameraCrashJoltX;
    const camZ =
      this.physics.z - cosH * backDist - sinH * lateralSwing + this.cameraCrashJoltZ;
    const surfaceAtCam = getDriveSurfaceHeight(camX, camZ, this.physics.stationIdx);
    const camY = Math.max(surfaceAtCam + 0.9, this.physics.y + heightOffset);

    _camTarget.set(camX, camY, camZ);
    const dampLambda =
      this.cameraMode === 'hood' || this.cameraMode === 'bumper' ? 28 : 14.5;
    this.camera.position.lerp(_camTarget, 1 - Math.exp(-dampLambda * dt));

    if (this.cameraShakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.camera.position.y +=
        (Math.random() - 0.5) * this.cameraShakeIntensity * 0.55;
      this.cameraShakeIntensity *= Math.exp(-9 * dt);
    }

    _camLook.set(
      this.physics.x + sinH * lookAhead,
      this.physics.y + 0.78,
      this.physics.z + cosH * lookAhead,
    );
    this.camera.lookAt(_camLook);
    const dynRollHorizon = THREE.MathUtils.clamp(
      this.physics.lateralG * 0.012 + this.cameraCrashRoll,
      -0.22,
      0.22,
    );
    if (Math.abs(dynRollHorizon) > 0.001) {
      this.camera.rotateZ(dynRollHorizon);
    }
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7.5, dt);
    this.camera.updateProjectionMatrix();

    this.updateDrivingMotionBlur(dt, false);
  }

  private updateDrivingMotionBlur(dt: number, isCockpit: boolean): void {
    if (!this.speedBlurPass) return;

    const blurEnabled = this.settings.motionBlur !== false;
    const isRaining =
      this.weather === 'rain' ||
      this.weather === 'heavy_rain' ||
      this.weather === 'thunderstorm';
    const rainBase =
      this.weather === 'thunderstorm'
        ? 0.65
        : this.weather === 'heavy_rain'
          ? 0.48
          : this.weather === 'rain'
            ? 0.28
            : 0.0;

    const speedKmh = this.physics.speedKmh;
    const highSpeedNorm = THREE.MathUtils.clamp((speedKmh - 70) / 185, 0, 1);
    const rainSpeedFactor = 0.55 + 0.45 * THREE.MathUtils.clamp(speedKmh / 130, 0, 1);
    const cockpitAtten = isCockpit ? 0.62 : 1.0;

    const targetBlur = blurEnabled
      ? (highSpeedNorm * 0.34 +
          (this.physics.nitroActive ? 0.24 : 0) +
          (isRaining ? rainBase * 0.26 * rainSpeedFactor : 0)) *
          cockpitAtten +
        this.crashFlash * (isCockpit ? 0.24 : 0.42)
      : this.crashFlash * (isCockpit ? 0.2 : 0.32);

    const targetRainStreak =
      blurEnabled && isRaining
        ? rainBase * rainSpeedFactor * (isCockpit ? 0.78 : 1.0)
        : 0;

    const targetInnerRadius = isCockpit ? 0.36 : 0.15;

    const curBlur = this.speedBlurPass.uniforms.uBlurAmount.value as number;
    const curRain = this.speedBlurPass.uniforms.uRainStreak.value as number;
    const curInner = this.speedBlurPass.uniforms.uInnerRadius.value as number;

    this.speedBlurPass.uniforms.uBlurAmount.value = THREE.MathUtils.damp(
      curBlur,
      targetBlur,
      8,
      dt,
    );
    this.speedBlurPass.uniforms.uRainStreak.value = THREE.MathUtils.damp(
      curRain,
      targetRainStreak,
      7,
      dt,
    );
    this.speedBlurPass.uniforms.uInnerRadius.value = THREE.MathUtils.damp(
      curInner,
      targetInnerRadius,
      10,
      dt,
    );
  }

  private updateStreetLampLights(nightFactor: number): void {
    const lamps = this.world.lampPositions;
    const lampNeed = Math.max(
      nightFactor,
      this.weather === 'fog'
        ? 0.65
        : this.weather === 'thunderstorm' || this.weather === 'heavy_rain'
          ? 0.48
          : 0,
    );
    if (lampNeed <= 0.12 || lamps.length === 0) {
      for (const l of this.streetLampLights) l.intensity = 0;
      return;
    }

    // Track closest 4 coastal/harbor streetlamps to the player with zero allocation
    const slotCount = this.streetLampLights.length;
    if (slotCount === 0) return;
    const px = this.physics.x;
    const pz = this.physics.z;
    const bestIdx = [-1, -1, -1, -1];
    const bestDist = [Infinity, Infinity, Infinity, Infinity];
    const maxRangeSq = 88 * 88;

    for (let i = 0; i < lamps.length; i++) {
      const lp = lamps[i];
      const dx = lp.x - px;
      const dz = lp.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxRangeSq) continue;
      for (let s = 0; s < slotCount; s++) {
        if (d2 < bestDist[s]) {
          for (let shift = slotCount - 1; shift > s; shift--) {
            bestDist[shift] = bestDist[shift - 1];
            bestIdx[shift] = bestIdx[shift - 1];
          }
          bestDist[s] = d2;
          bestIdx[s] = i;
          break;
        }
      }
    }

    for (let s = 0; s < slotCount; s++) {
      const light = this.streetLampLights[s];
      const idx = bestIdx[s];
      if (idx >= 0) {
        const lp = lamps[idx];
        light.position.set(lp.x, lp.y, lp.z);
        const fade = 1 - THREE.MathUtils.smoothstep(Math.sqrt(bestDist[s]), 44, 88);
        light.intensity = 72 * lampNeed * fade;
      } else {
        light.intensity = 0;
      }
    }
  }

  private emitTelemetry(): void {
    const region = getRegionAt(
      this.physics.x,
      this.physics.z,
      this.physics.stationIdx,
    );
    this.onRegionUnlock?.(region.id);

    let nearLandmark = null;
    for (const lm of MAP_LANDMARKS) {
      if (Math.hypot(lm.x - this.physics.x, lm.z - this.physics.z) < 24) {
        nearLandmark = lm;
        break;
      }
    }

    let nearEvent: RaceEvent | null = null;
    if (this.raceState === 'free_roam') {
      for (const evt of RACE_EVENTS) {
        const wp = getRoadPointAt(evt.startS, 0);
        if (Math.hypot(wp.x - this.physics.x, wp.z - this.physics.z) < 24) {
          nearEvent = evt;
          break;
        }
      }
    }

    const autoHL =
      this.timeOfDay === 'night' ||
      this.timeOfDay === 'sunset' ||
      this.weather === 'fog' ||
      this.weather === 'rain' ||
      this.weather === 'heavy_rain' ||
      this.weather === 'thunderstorm';

    this.onTelemetry?.({
      speedKmh: Math.round(this.physics.speedKmh),
      rpm: Math.round(this.physics.rpm),
      maxRpm: this.physics.maxRpm,
      gear: this.physics.gear,
      nitro: Math.round(this.physics.nitro),
      nitroActive: this.physics.nitroActive,
      driftAngleDeg: this.physics.driftAngleDeg,
      isDrifting: this.physics.isDrifting,
      currentDriftPoints: Math.round(this.physics.currentDriftPoints),
      totalDriftScore: Math.round(this.physics.totalDriftScore),
      headlightsOn: this.headlightsManual ?? autoHL,
      absActive: this.physics.absActive,
      tcsActive: this.physics.tcsActive,
      surface: this.physics.surface,
      regionId: region.id,
      regionName: region.name,
      playerX: this.physics.x,
      playerZ: this.physics.z,
      playerHeading: this.physics.heading,
      trackProgress: this.physics.trackProgress,
      raceState: this.raceState,
      countdownValue: Math.max(0, Math.ceil(this.countdownTimer)),
      racePosition: this.computeRacePosition(),
      totalRacers: this.activeEvent ? this.trafficAI.racers.length + 1 : 1,
      currentLap: this.currentLap,
      totalLaps: this.activeEvent?.laps ?? 1,
      checkpointIndex: this.checkpointIdx,
      totalCheckpoints: this.activeEvent?.checkpointsS.length ?? 0,
      raceElapsedSec: this.raceElapsedSec,
      nearLandmark,
      nearEvent,
      cameraMode: this.cameraMode,
      weather: this.weather,
      timeOfDay: this.timeOfDay,
      cycleTimeLabel: formatCycleClock(this.cyclePhase),
      autoDayNightCycle: this.autoDayNightCycle,
      fps: Math.round(this.fpsCounter),
      dirtLevel: this.carDirtLevel,
      damageLevel: this.physics.damageLevel,
      crashFlash: this.crashFlash,
      noBrakeDriftSec: this.continuousNoBrakeDriftSec,
      opponents: this.trafficAI.racers.map((r) => ({
        x: r.x,
        z: r.z,
        name: r.name,
      })),
      trafficPositions:
        this.trafficAI.racers.length === 0
          ? this.trafficAI.traffic
              .filter((t) => t.carRig.root.visible)
              .map((t) => ({ x: t.x, z: t.z }))
          : [],
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('fullscreenchange', this.handleFullscreenResize);
    document.removeEventListener('webkitfullscreenchange', this.handleFullscreenResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.playerCarRig?.dispose();
    this.trafficAI.dispose();
    this.atmosphere.dispose();
    this.world.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.weatherEffects.dispose();
    this.washPoints.geometry.dispose();
    (this.washPoints.material as THREE.Material).dispose();
    this.washSpriteTex.dispose();
    this.tireSmoke.dispose();
    this.skidmarks.dispose();
    this.crashEffects.dispose();
    this.nitroFire.dispose();
    this.dayEnvTex.dispose();
    this.overcastEnvTex.dispose();
    this.nightEnvTex.dispose();
    this.showroomTurntable.geometry.dispose();
    (this.showroomTurntable.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
