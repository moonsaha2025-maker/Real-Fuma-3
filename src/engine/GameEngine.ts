import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
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
import {
  createInitialPhysicsStateAtS,
  stepVehiclePhysics,
  VehiclePhysicsState,
} from './physics';
import { createProceduralTextures, ProceduralTexturePack } from './textures';
import { TireSkidmarkSystem } from './skidmarks';
import { TireSmokeSystem } from './tireSmoke';
import { TrafficAndAIManager } from './trafficAndAI';
import { buildRealFumaWorld, BuiltWorld } from './worldBuilder';

export const SHOWCASE_S = 0.06;
export const DRIVE_SPAWN_S = 0.065;

const RadialSpeedBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBlurAmount: { value: 0.0 },
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
    uniform vec2 uCenter;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uBlurAmount <= 0.003) {
        gl_FragColor = base;
        return;
      }
      vec2 dir = vUv - uCenter;
      float dist = length(dir);
      float mask = smoothstep(0.16, 0.88, dist) * uBlurAmount;
      vec3 accum = base.rgb;
      for (int i = 1; i <= 7; i++) {
        float fi = float(i) / 7.0;
        vec2 offset = dir * (-fi * mask * 0.14);
        accum += texture2D(tDiffuse, clamp(vUv + offset, 0.001, 0.999)).rgb;
      }
      vec3 blurred = accum / 8.0;
      float vig = 1.0 - smoothstep(0.55, 1.25, dist) * (uBlurAmount * 0.55);
      gl_FragColor = vec4(blurred * vig, base.a);
    }
  `,
};

// Pre-allocated math helpers for zero GC inside render loop
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

const SHADOW_HALF_EXTENT = 38;
const SHADOW_MAP_RES = 2048;
const SHADOW_TEXEL_SIZE = (SHADOW_HALF_EXTENT * 2) / SHADOW_MAP_RES;

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

  // Post-Processing Pipeline (Hardware GPU, MEDIUM/HIGH/ULTRA)
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private speedBlurPass: ShaderPass | null = null;
  private usePostProcessing = false;

  private playerCarRig: CarModelRig | null = null;
  private currentCarData: OwnedCarData | null = null;
  private physics: VehiclePhysicsState = createInitialPhysicsStateAtS(SHOWCASE_S, 0);

  // Lighting
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private headlightSpot: THREE.SpotLight | null = null;
  private exhaustLight: THREE.PointLight | null = null;
  private softboxA: THREE.RectAreaLight | null = null;
  private softboxB: THREE.RectAreaLight | null = null;
  private showroomTurntable: THREE.Mesh;

  // Weather & Additive Tire Smoke Particles
  private rainPoints: THREE.Points;
  private rainPositions: Float32Array;
  private tireSmoke: TireSmokeSystem;
  private skidmarks: TireSkidmarkSystem;

  // State
  private mode: 'showcase' | 'drive' = 'showcase';
  private paused = false;
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

  // Showcase Orbit
  private showcasePt = getRoadPointAt(SHOWCASE_S, 0);
  private orbitYaw = this.showcasePt.heading + 0.56;
  private orbitPitch = 0.16;
  private orbitDist = 5.45;
  private autoOrbit = true;

  // Input
  private keysHeld = new Set<string>();
  private touchInput: ControlInputState = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    nitro: false,
  };
  private manualShiftQueue: -1 | 0 | 1 = 0;
  private cameraShakeIntensity = 0;
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
    },
  ) {
    this.container = container;
    this.settings = settings;
    this.onTelemetry = callbacks.onTelemetry;
    this.onRaceComplete = callbacks.onRaceComplete;
    this.onFreeRoamReward = callbacks.onFreeRoamReward;
    this.onRegionUnlock = callbacks.onRegionUnlock;

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
      52,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      2400,
    );

    // Forza-style crisp RoomEnvironment IBL with soft blur to eliminate chrome/roof blowouts
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.08).texture;
    pmrem.dispose();

    // Crisp coastal daylight rig + car-following texel-snapped 2048x2048 shadow frustum
    this.hemiLight = new THREE.HemisphereLight(0xc2ebff, 0x334155, 0.74);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
    this.sunLight.position.set(this.showcasePt.x - 95, 115, this.showcasePt.z - 80);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(SHADOW_MAP_RES, SHADOW_MAP_RES);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.camera.left = -SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.right = SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.top = SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.bottom = -SHADOW_HALF_EXTENT;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.016;
    this.sunLight.shadow.radius = 2.2;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    if (!this.isSoftwareGl) {
      // Dynamic Car Headlight Beam Spotlight (non-shadow-casting for zero overhead)
      this.headlightSpot = new THREE.SpotLight(0xeef6ff, 0, 90, Math.PI / 4.2, 0.65, 1.35);
      this.headlightSpot.castShadow = false;
      this.scene.add(this.headlightSpot);
      this.scene.add(this.headlightSpot.target);

      this.exhaustLight = new THREE.PointLight(0x38bdf8, 0, 14, 2);
      this.scene.add(this.exhaustLight);

      RectAreaLightUniformsLib.init();
      this.softboxA = new THREE.RectAreaLight(0xffffff, 1.5, 9, 4);
      this.softboxA.position.set(this.showcasePt.x - 5, this.showcasePt.y + 6.5, this.showcasePt.z + 7);
      this.softboxA.lookAt(this.showcasePt.x, this.showcasePt.y + 0.7, this.showcasePt.z);
      this.softboxB = new THREE.RectAreaLight(0x38bdf8, 1.0, 8, 3);
      this.softboxB.position.set(this.showcasePt.x + 6, this.showcasePt.y + 5, this.showcasePt.z - 6);
      this.softboxB.lookAt(this.showcasePt.x, this.showcasePt.y + 0.7, this.showcasePt.z);
      this.scene.add(this.softboxA, this.softboxB);
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

    // High-threshold selective bloom & radial speed blur composer (Hardware GPU)
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
      this.composer.addPass(new OutputPass());
    }

    this.trafficAI = new TrafficAndAIManager(this.textures.contactShadowMap);
    this.scene.add(this.trafficAI.group);

    // Pooled Rain Particle System
    const rainCount = 850;
    this.rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 90;
      this.rainPositions[i * 3 + 1] = Math.random() * 32;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3),
    );
    const rainMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.24,
      transparent: true,
      opacity: 0.55,
    });
    this.rainPoints = new THREE.Points(rainGeo, rainMat);
    this.rainPoints.visible = false;
    this.rainPoints.frustumCulled = false;
    this.scene.add(this.rainPoints);

    // High-Fidelity Additive Tire Smoke & Asphalt Skidmark Systems
    this.tireSmoke = new TireSmokeSystem(
      Math.max(1, container.clientHeight) * this.renderer.getPixelRatio(),
    );
    this.scene.add(this.tireSmoke.points);

    this.skidmarks = new TireSkidmarkSystem();
    this.scene.add(this.skidmarks.mesh);

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

    this.startLoop();
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
  };

  private syncCarPoseToTrack(): void {
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
    _qYaw.setFromAxisAngle(_worldUp, this.physics.heading);

    this.playerCarRig.root.position.set(
      this.physics.x,
      this.physics.y,
      this.physics.z,
    );
    this.playerCarRig.root.quaternion.copy(_qSurface).multiply(_qYaw);
  }

  public setPlayerCar(carData: OwnedCarData): void {
    this.currentCarData = carData;
    const spec = getCarSpec(carData.carId);
    audioEngine.setEngineProfile(spec.engineSoundProfile);

    if (this.playerCarRig) {
      this.scene.remove(this.playerCarRig.root);
      this.playerCarRig.dispose();
    }

    this.playerCarRig = createCarModel(spec, carData.customization, {
      contactShadowMap: this.textures.contactShadowMap,
      carbonMap: this.textures.carbonMap,
    });
    this.scene.add(this.playerCarRig.root);
    this.syncCarPoseToTrack();
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
    audioEngine.applySettings(settings);

    let dpr = 1;
    let shadowEnabled = !this.isSoftwareGl;
    let farPlane = 1750;
    if (!this.isSoftwareGl) {
      const baseDpr = window.devicePixelRatio || 1;
      if (settings.graphicsPreset === 'LOW') {
        dpr = 0.85;
        shadowEnabled = false;
        farPlane = 1050;
      } else if (settings.graphicsPreset === 'MEDIUM') {
        dpr = Math.min(baseDpr, 1.25);
        farPlane = 1450;
      } else if (settings.graphicsPreset === 'HIGH') {
        dpr = Math.min(baseDpr, 1.65);
        farPlane = 1900;
      } else {
        dpr = Math.min(baseDpr, 2.0);
        farPlane = 2400;
      }
    }
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = shadowEnabled;
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
    this.tireSmoke.setViewportHeight(
      Math.max(1, this.container.clientHeight) * dpr,
    );
    this.syncBloomStrength();
  }

  private syncBloomStrength(): void {
    if (!this.bloomPass) return;
    if (this.settings.graphicsPreset === 'LOW') {
      this.bloomPass.strength = 0;
    } else {
      this.bloomPass.strength = this.atmosphere.state.bloomStrength;
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
    );
    const atm = this.atmosphere.state;
    this.timeOfDay = atm.derivedTimeOfDay;

    let fogDensity = 0.00046;
    if (this.weather === 'fog') fogDensity = 0.0036;
    else if (this.weather === 'heavy_rain' || this.weather === 'thunderstorm') fogDensity = 0.0018;
    else if (this.weather === 'rain') fogDensity = 0.0011;
    else {
      // Slight atmospheric twilight mist near sunset/dawn
      const goldenMist = Math.max(0, 1 - Math.abs(atm.sunElevation) * 4.2) * 0.00018;
      fogDensity += goldenMist + atm.nightFactor * 0.00014;
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
    this.hemiLight.color.copy(atm.hemiSkyColor);
    this.hemiLight.groundColor.copy(atm.hemiGroundColor);
    this.hemiLight.intensity = atm.hemiIntensity;
    this.scene.environmentIntensity = atm.envIntensity;
    this.renderer.toneMappingExposure = atm.exposure;

    this.syncBloomStrength();

    const rainActive =
      this.weather === 'rain' ||
      this.weather === 'heavy_rain' ||
      this.weather === 'thunderstorm';
    this.rainPoints.visible = rainActive;
    const mat = this.rainPoints.material as THREE.PointsMaterial;
    mat.color.setHex(0xcbd5e1);
    mat.size =
      this.weather === 'heavy_rain' || this.weather === 'thunderstorm' ? 0.34 : 0.22;
    mat.opacity = 0.55;
  }

  public setShowcaseMode(enabled: boolean): void {
    this.mode = enabled ? 'showcase' : 'drive';
    this.showroomTurntable.visible = enabled;
    if (this.softboxA) this.softboxA.intensity = enabled ? 1.5 : 0;
    if (this.softboxB) this.softboxB.intensity = enabled ? 1.0 : 0;

    if (enabled) {
      this.paused = false;
      this.activeEvent = null;
      this.raceState = 'free_roam';
      this.trafficAI.clearRacers();
      this.tireSmoke.clear();
      this.skidmarks.clear();
      this.physics = createInitialPhysicsStateAtS(SHOWCASE_S, 0);
      this.physics.y = this.showcasePt.y + 0.02;
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
      }
      if (this.playerCarRig) {
        this.syncCarPoseToTrack();
        this.playerCarRig.setBodyTilt(0, 0, 0);
        this.playerCarRig.setLights(true, false, false);
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
    }
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
      3.8,
      11.5,
    );
  }

  public resetShowcaseOrbit(): void {
    this.autoOrbit = true;
    this.orbitYaw = this.showcasePt.heading + 0.56;
    this.orbitPitch = 0.16;
    this.orbitDist = 5.45;
  }

  public startFreeRoamAtS(s = DRIVE_SPAWN_S): void {
    audioEngine.init();
    this.setShowcaseMode(false);
    this.activeEvent = null;
    this.raceState = 'free_roam';
    this.trafficAI.clearRacers();
    this.physics = createInitialPhysicsStateAtS(s, 0);
    this.world.checkpointBeacon.visible = false;
    this.syncCarPoseToTrack();
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
    this.skidmarks.clear();
    const proj = projectOntoTrack(x, z);
    this.physics = createInitialPhysicsStateAtS(proj.station.s, 0);
    this.syncCarPoseToTrack();
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

    this.physics = createInitialPhysicsStateAtS(event.startS, 0);
    this.physics.totalDriftScore = 0;

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
  }

  public resetCarToRoad(): void {
    const st = TRACK_STATIONS[this.physics.stationIdx] ?? TRACK_STATIONS[0];
    this.physics = createInitialPhysicsStateAtS(st.s, 0);
    this.tireSmoke.clear();
    this.skidmarks.clear();
    this.syncCarPoseToTrack();
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

  public cycleCamera(): void {
    const order: CameraMode[] = ['chase', 'far', 'hood', 'bumper', 'cinematic'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
  }

  public toggleHeadlights(): void {
    const autoOn =
      this.timeOfDay === 'night' ||
      this.timeOfDay === 'sunset' ||
      this.weather === 'fog' ||
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

  private getCombinedInput(): ControlInputState {
    let throttle = this.touchInput.throttle;
    let brake = this.touchInput.brake;
    let steer = this.touchInput.steer;
    let handbrake = this.touchInput.handbrake;
    let nitro = this.touchInput.nitro;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) throttle = 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) brake = 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) steer -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) steer += 1;
    if (this.keysHeld.has('Space')) handbrake = true;
    if (
      this.keysHeld.has('ShiftLeft') ||
      this.keysHeld.has('ShiftRight') ||
      this.keysHeld.has('KeyN') ||
      this.keysHeld.has('KeyX')
    ) {
      nitro = true;
    }

    steer = THREE.MathUtils.clamp(
      steer * this.settings.steeringSensitivity,
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
    this.tireSmoke.setViewportHeight(h * this.renderer.getPixelRatio());
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(
        e.code,
      )
    ) {
      e.preventDefault();
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
        if (this.usePostProcessing && this.composer) {
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

    const projR = Math.round(_focusPt.dot(_lightRight) / SHADOW_TEXEL_SIZE) * SHADOW_TEXEL_SIZE;
    const projU = Math.round(_focusPt.dot(_lightUp) / SHADOW_TEXEL_SIZE) * SHADOW_TEXEL_SIZE;
    const projD = _focusPt.dot(_lightDir);

    this.sunLight.target.position
      .set(0, 0, 0)
      .addScaledVector(_lightRight, projR)
      .addScaledVector(_lightUp, projU)
      .addScaledVector(_lightDir, projD);
    this.sunLight.target.updateMatrixWorld();

    this.sunLight.position
      .copy(this.sunLight.target.position)
      .addScaledVector(_lightDir, 130);
  }

  private stepSimulation(dt: number): void {
    this.elapsedTime += dt;

    // Advance continuous 24h Day-Night cycle
    if (this.autoDayNightCycle && !(this.mode === 'drive' && this.paused)) {
      const cycleRate = this.mode === 'drive' ? 1 / 145 : 1 / 240;
      this.cyclePhase = (this.cyclePhase + dt * cycleRate) % 1;
    }

    const isWet =
      this.weather === 'rain' ||
      this.weather === 'heavy_rain' ||
      this.weather === 'thunderstorm';

    this.applyAtmosphere();
    const atm = this.atmosphere.state;
    this.world.updateDynamicWorld(this.elapsedTime, isWet, atm.nightFactor);
    this.updateTexelSnappedShadows();

    if (this.weather === 'thunderstorm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningFlash = 1.0;
        this.lightningTimer = 3.5 + Math.random() * 6.5;
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.5);
        this.sunLight.intensity = atm.keyIntensity + this.lightningFlash * 4.0;
      }
    }

    if (this.mode === 'showcase') {
      if (this.headlightSpot) this.headlightSpot.intensity = 0;
      if (this.exhaustLight) this.exhaustLight.intensity = 0;
      if (this.autoOrbit) {
        this.orbitYaw += dt * 0.22;
      }
      const cx =
        this.physics.x +
        Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      const cy =
        this.physics.y + 0.72 + Math.sin(this.orbitPitch) * this.orbitDist;
      const cz =
        this.physics.z +
        Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      this.camera.position.lerp(_camTarget.set(cx, cy, cz), Math.min(1, dt * 8));
      this.camera.lookAt(this.physics.x, this.physics.y + 0.68, this.physics.z);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 47, 6, dt);
      this.camera.updateProjectionMatrix();
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
      }
      return;
    }

    if (this.paused || !this.currentCarData || !this.playerCarRig) return;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    let input = this.getCombinedInput();
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
      this.timeOfDay === 'night' ||
      this.timeOfDay === 'sunset' ||
      this.weather === 'fog' ||
      this.weather === 'thunderstorm';
    const hlOn = this.headlightsManual ?? autoHL;

    const aiRes = this.trafficAI.update(
      dt,
      this.physics,
      this.raceState === 'racing',
      hlOn,
    );

    const maxImpact = Math.max(
      this.physics.lastCollisionImpact,
      aiRes.collisionImpact,
    );
    if (maxImpact > 0.14) {
      audioEngine.playCollision(maxImpact);
      if (this.settings.cameraShake) {
        this.cameraShakeIntensity = Math.min(0.6, maxImpact * 0.5);
      }
      if (maxImpact > 0.58) {
        this.hitstopTimer = 0.035;
      }
    }

    // Apply banked & sloped track pose + suspension posture to Player Car Rig
    this.syncCarPoseToTrack();
    this.playerCarRig.setWheels(
      this.physics.steerAngle,
      this.physics.wheelSpinRad,
    );
    this.playerCarRig.setBodyTilt(
      this.physics.pitchRad,
      this.physics.rollRad,
      this.physics.heaveY,
    );
    const flameVisible =
      this.physics.nitroActive || this.physics.exhaustFlameTimer > 0;
    this.playerCarRig.setLights(hlOn, input.brake > 0.1, flameVisible);

    // Dynamic afterburner PointLight illuminating asphalt behind exhaust tips
    const sinH = Math.sin(this.physics.heading);
    const cosH = Math.cos(this.physics.heading);
    if (this.exhaustLight) {
      if (flameVisible) {
        this.exhaustLight.position.set(
          this.physics.x - sinH * 2.55,
          this.physics.y + 0.42,
          this.physics.z - cosH * 2.55,
        );
        this.exhaustLight.intensity = this.physics.nitroActive
          ? 7.5 + Math.random() * 3.5
          : 4.5;
      } else {
        this.exhaustLight.intensity = 0;
      }
    }

    // Subtle NOS chassis vibration & engine surge feedback
    if (this.physics.nitroActive && this.settings.cameraShake) {
      this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, 0.045);
    }

    // Real dynamic car headlight pool illuminating highway & foliage at dusk/night
    if (this.headlightSpot) {
      if (hlOn) {
        this.headlightSpot.position.set(
          this.physics.x + sinH * 2.0,
          this.physics.y + 0.78,
          this.physics.z + cosH * 2.0,
        );
        this.headlightSpot.target.position.set(
          this.physics.x + sinH * 28,
          this.physics.y - 0.85,
          this.physics.z + cosH * 28,
        );
        this.headlightSpot.target.updateMatrixWorld();
        this.headlightSpot.intensity = 18 + atm.nightFactor * 42;
      } else {
        this.headlightSpot.intensity = 0;
      }
    }

    // Rain particles around car
    if (this.rainPoints.visible) {
      for (let i = 0; i < this.rainPositions.length; i += 3) {
        this.rainPositions[i] -= 4 * dt;
        this.rainPositions[i + 1] -= 36 * dt;
        if (this.rainPositions[i + 1] < this.physics.y - 2) {
          this.rainPositions[i] = this.physics.x + (Math.random() - 0.5) * 85;
          this.rainPositions[i + 1] = this.physics.y + 24 + Math.random() * 10;
          this.rainPositions[i + 2] = this.physics.z + (Math.random() - 0.5) * 85;
        }
      }
      this.rainPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Additive Tire Smoke & Asphalt Rubber Skidmark Systems
    this.tireSmoke.update(dt, this.physics, spec, input, this.weather);
    const isBurnout =
      this.physics.surface === 'asphalt' &&
      input.throttle > 0.65 &&
      input.brake > 0.35 &&
      this.physics.speedKmh < 28;
    this.skidmarks.update(this.physics, spec, input.handbrake, isBurnout);

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
      nitroActive: this.physics.nitroActive,
      policeActive: false,
      policeDistanceM: 999,
      elapsedTime: this.elapsedTime,
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
    const sinH = Math.sin(this.physics.heading);
    const cosH = Math.cos(this.physics.heading);

    let backDist = 5.35;
    let heightOffset = 1.6;
    let lookAhead = 11.5;
    let lateralSwing = -this.physics.angularVel * 0.42;
    let targetFov =
      55 +
      Math.min(20, this.physics.speedKmh * 0.068) +
      (this.physics.nitroActive ? 11 : 0);

    if (this.cameraMode === 'far') {
      backDist = 9.0;
      heightOffset = 3.3;
      lookAhead = 12;
    } else if (this.cameraMode === 'hood') {
      backDist = -0.35;
      heightOffset = 1.32;
      lookAhead = 22;
      lateralSwing = 0;
      targetFov = 65 + (this.physics.nitroActive ? 9 : 0);
    } else if (this.cameraMode === 'bumper') {
      backDist = -2.25;
      heightOffset = 0.7;
      lookAhead = 28;
      lateralSwing = 0;
      targetFov = 70 + (this.physics.nitroActive ? 9 : 0);
    } else if (this.cameraMode === 'cinematic') {
      const sweep = this.elapsedTime * 0.45;
      _camTarget.set(
        this.physics.x + Math.sin(sweep) * 9.5,
        this.physics.y + 3.0,
        this.physics.z + Math.cos(sweep) * 9.5,
      );
      this.camera.position.lerp(_camTarget, 1 - Math.exp(-5 * dt));
      this.camera.lookAt(this.physics.x, this.physics.y + 0.9, this.physics.z);
      if (this.speedBlurPass) {
        this.speedBlurPass.uniforms.uBlurAmount.value = 0;
      }
      return;
    }

    const camX = this.physics.x - sinH * backDist + cosH * lateralSwing;
    const camZ = this.physics.z - cosH * backDist - sinH * lateralSwing;
    const surfaceAtCam = getDriveSurfaceHeight(camX, camZ, this.physics.stationIdx);
    const camY = Math.max(surfaceAtCam + 1.0, this.physics.y + heightOffset);

    _camTarget.set(camX, camY, camZ);
    const dampLambda =
      this.cameraMode === 'hood' || this.cameraMode === 'bumper' ? 28 : 11.0;
    this.camera.position.lerp(_camTarget, 1 - Math.exp(-dampLambda * dt));

    if (this.cameraShakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.camera.position.y +=
        (Math.random() - 0.5) * this.cameraShakeIntensity * 0.55;
      this.cameraShakeIntensity *= Math.exp(-9 * dt);
    }

    _camLook.set(
      this.physics.x + sinH * lookAhead,
      this.physics.y + 0.85,
      this.physics.z + cosH * lookAhead,
    );
    this.camera.lookAt(_camLook);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7.5, dt);
    this.camera.updateProjectionMatrix();

    if (this.speedBlurPass) {
      const speedNorm = THREE.MathUtils.clamp(
        (this.physics.speedKmh - 95) / 230,
        0,
        1,
      );
      const targetBlur = speedNorm * 0.19 + (this.physics.nitroActive ? 0.18 : 0);
      const curBlur = this.speedBlurPass.uniforms.uBlurAmount.value as number;
      this.speedBlurPass.uniforms.uBlurAmount.value = THREE.MathUtils.damp(
        curBlur,
        targetBlur,
        8,
        dt,
      );
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
      opponents: this.trafficAI.racers.map((r) => ({
        x: r.x,
        z: r.z,
        name: r.name,
      })),
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
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.playerCarRig?.dispose();
    this.trafficAI.dispose();
    this.atmosphere.dispose();
    this.world.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.rainPoints.geometry.dispose();
    (this.rainPoints.material as THREE.Material).dispose();
    this.tireSmoke.dispose();
    this.skidmarks.dispose();
    this.showroomTurntable.geometry.dispose();
    (this.showroomTurntable.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
