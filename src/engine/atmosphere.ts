import * as THREE from 'three';
import { SEA_LEVEL_Y } from '../data/track';
import { TimeOfDay, WeatherType } from '../types/game';

export interface AtmosphereLightingState {
  keyDirection: THREE.Vector3;
  keyColor: THREE.Color;
  keyIntensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  envIntensity: number;
  exposure: number;
  bloomStrength: number;
  nightFactor: number; // 0 = bright day, 1 = deep night
  dayFactor: number; // 1 = bright day, 0 = night
  sunElevation: number; // -1..+1
  derivedTimeOfDay: TimeOfDay;
}

export interface AtmosphereSystem {
  group: THREE.Group;
  skyMesh: THREE.Mesh;
  oceanMesh: THREE.Mesh;
  cloudSprites: THREE.Sprite[];
  sunDirection: THREE.Vector3;
  state: AtmosphereLightingState;
  update: (
    timeSec: number,
    cyclePhase: number,
    playerX: number,
    playerZ: number,
    weather: WeatherType,
    cameraFar?: number,
  ) => void;
  dispose: () => void;
}

interface SkyKeyframe {
  phase: number;
  top: string;
  mid: string;
  horizon: string;
  sunCol: string;
  hemiSky: string;
  hemiGround: string;
  fog: string;
  oceanDeep: string;
  oceanShallow: string;
  cloud: string;
}

const SKY_KEYFRAMES: SkyKeyframe[] = [
  {
    phase: 0.0, // Pitch-Dark Midnight (00:00)
    top: '#000001',
    mid: '#000104',
    horizon: '#01030a',
    sunCol: '#94a3b8',
    hemiSky: '#02050d',
    hemiGround: '#000102',
    fog: '#000104',
    oceanDeep: '#000206',
    oceanShallow: '#010710',
    cloud: '#02040a',
  },
  {
    phase: 0.21, // Pre-dawn twilight (05:00)
    top: '#050b1c',
    mid: '#121936',
    horizon: '#352748',
    sunCol: '#f59e0b',
    hemiSky: '#283259',
    hemiGround: '#090c14',
    fog: '#191d33',
    oceanDeep: '#031121',
    oceanShallow: '#0b293d',
    cloud: '#3e3852',
  },
  {
    phase: 0.26, // Golden Sunrise (06:15)
    top: '#183d8c',
    mid: '#707bb8',
    horizon: '#f9a868',
    sunCol: '#fde08d',
    hemiSky: '#c7d2fe',
    hemiGround: '#242b38',
    fog: '#d8a68b',
    oceanDeep: '#084b6b',
    oceanShallow: '#1fa3b5',
    cloud: '#fed7aa',
  },
  {
    phase: 0.35, // Crisp Morning (08:25)
    top: '#0a61db',
    mid: '#3ec7ff',
    horizon: '#cff1ff',
    sunCol: '#fffaf0',
    hemiSky: '#c7ecff',
    hemiGround: '#2f4036',
    fog: '#b2e8ff',
    oceanDeep: '#0280c7',
    oceanShallow: '#2cead6',
    cloud: '#ffffff',
  },
  {
    phase: 0.5, // Midday Sunlit Tropical Coastal (12:00)
    top: '#0858d6',
    mid: '#3ac2ff',
    horizon: '#c9f0ff',
    sunCol: '#fffef5',
    hemiSky: '#d4f2ff',
    hemiGround: '#344438',
    fog: '#b5ebff',
    oceanDeep: '#0284cc',
    oceanShallow: '#30f0db',
    cloud: '#ffffff',
  },
  {
    phase: 0.68, // Late Afternoon Golden Hour (16:20)
    top: '#1246a0',
    mid: '#52a7d8',
    horizon: '#fde2a7',
    sunCol: '#ffd87a',
    hemiSky: '#bae6fd',
    hemiGround: '#38362e',
    fog: '#dbe1c5',
    oceanDeep: '#055f8f',
    oceanShallow: '#1bb3a8',
    cloud: '#fef3c7',
  },
  {
    phase: 0.75, // Fiery Coastal Sunset (18:00)
    top: '#1b265c',
    mid: '#9f3b62',
    horizon: '#fb8c42',
    sunCol: '#ffbe4d',
    hemiSky: '#fda4af',
    hemiGround: '#241f29',
    fog: '#df7857',
    oceanDeep: '#0c3759',
    oceanShallow: '#167c91',
    cloud: '#fdba74',
  },
  {
    phase: 0.81, // Deep Dusk (19:25)
    top: '#030817',
    mid: '#10142e',
    horizon: '#30203a',
    sunCol: '#93c5fd',
    hemiSky: '#1c2647',
    hemiGround: '#070910',
    fog: '#111426',
    oceanDeep: '#030e1c',
    oceanShallow: '#082033',
    cloud: '#282f40',
  },
  {
    phase: 1.0, // Pitch-Dark Midnight Wrap (24:00)
    top: '#000001',
    mid: '#000104',
    horizon: '#01030a',
    sunCol: '#94a3b8',
    hemiSky: '#02050d',
    hemiGround: '#000102',
    fog: '#000104',
    oceanDeep: '#000206',
    oceanShallow: '#010710',
    cloud: '#02040a',
  },
];

// Pre-parsed Three.js colors for zero per-frame allocations
const PARSED_FRAMES = SKY_KEYFRAMES.map((k) => ({
  phase: k.phase,
  top: new THREE.Color(k.top),
  mid: new THREE.Color(k.mid),
  horizon: new THREE.Color(k.horizon),
  sunCol: new THREE.Color(k.sunCol),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  fog: new THREE.Color(k.fog),
  oceanDeep: new THREE.Color(k.oceanDeep),
  oceanShallow: new THREE.Color(k.oceanShallow),
  cloud: new THREE.Color(k.cloud),
}));

const _overcastTop = new THREE.Color('#334155');
const _overcastMid = new THREE.Color('#64748b');
const _overcastHorizon = new THREE.Color('#94a3b8');
const _overcastOceanDeep = new THREE.Color('#0f3d52');
const _overcastOceanShallow = new THREE.Color('#2b6b7a');
const _overcastCloud = new THREE.Color('#94a3b8');
const _overcastFog = new THREE.Color('#7c8b9e');
const _nightOvercast = new THREE.Color('#020307');
const _moonLightColor = new THREE.Color('#7fa8e8');
const _sunTrueDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();

export function createAtmosphereSystem(
  cloudMap: THREE.Texture,
): AtmosphereSystem {
  const group = new THREE.Group();
  const sunDirection = new THREE.Vector3(0.4, 0.72, -0.55).normalize();

  const state: AtmosphereLightingState = {
    keyDirection: sunDirection.clone(),
    keyColor: new THREE.Color('#fff9db'),
    keyIntensity: 1.65,
    hemiSkyColor: new THREE.Color('#bae6fd'),
    hemiGroundColor: new THREE.Color('#334155'),
    hemiIntensity: 0.72,
    fogColor: new THREE.Color('#a4e4ff'),
    envIntensity: 1.05,
    exposure: 1.02,
    bloomStrength: 0.06,
    nightFactor: 0,
    dayFactor: 1,
    sunElevation: 0.72,
    derivedTimeOfDay: 'day',
  };

  // 1. Continuous Atmospheric Scattering Sky Dome (Sun + Moon + Horizon Scattering)
  const skyGeo = new THREE.SphereGeometry(1, 48, 32);
  const skyUniforms = {
    uTopColor: { value: new THREE.Color('#0c54c7') },
    uMidColor: { value: new THREE.Color('#38bdf8') },
    uHorizonColor: { value: new THREE.Color('#bae6fd') },
    uSunColor: { value: new THREE.Color('#fff9db') },
    uSunDir: { value: sunDirection.clone() },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.5, -0.5).normalize() },
    uSunStrength: { value: 0.9 },
    uMoonStrength: { value: 0.0 },
  };

  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform float uSunStrength;
      uniform float uMoonStrength;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.22, h));
        col = mix(col, uTopColor, smoothstep(0.18, 0.82, h));

        // Mie forward scattering near sun + crisp radiant solar disc
        float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
        float halo = pow(sunAmt, 9.0) * 0.38 * uSunStrength + pow(sunAmt, 42.0) * 0.45 * uSunStrength;
        float core = smoothstep(0.9984, 0.9997, sunAmt) * 1.45 * uSunStrength;
        col += uSunColor * (halo + core);

        // Cool nocturnal moon disc + atmospheric ring
        float moonAmt = max(dot(dir, normalize(uMoonDir)), 0.0);
        float moonHalo = pow(moonAmt, 36.0) * 0.22 * uMoonStrength;
        float moonDisc = smoothstep(0.9991, 0.9996, moonAmt) * 0.95 * uMoonStrength;
        col += vec3(0.80, 0.89, 1.0) * (moonHalo + moonDisc);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -100;
  skyMesh.scale.setScalar(900);
  group.add(skyMesh);

  // 2. Night Sky Starfield Dome (950 deterministic stars rendered behind mountains & trees)
  const starCount = 950;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  let seed = 918273;
  const srnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < starCount; i++) {
    const theta = srnd() * Math.PI * 2;
    const u = 0.04 + srnd() * 0.96; // Upper sky hemisphere strictly above horizon
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    starPos[i * 3] = Math.cos(theta) * r;
    starPos[i * 3 + 1] = u;
    starPos[i * 3 + 2] = Math.sin(theta) * r;

    const bright = 0.45 + srnd() * 0.55;
    const warm = srnd();
    starCol[i * 3] = bright * (warm > 0.7 ? 1.0 : 0.85);
    starCol[i * 3 + 1] = bright * 0.92;
    starCol[i * 3 + 2] = bright * (warm < 0.35 ? 1.0 : 0.86);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 2.1,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = -95;
  group.add(starPoints);

  // 3. Seamless Coastal Ocean & Bay Plane (Day Sun Specular + Night Moonpath Reflection)
  const oceanGeo = new THREE.PlaneGeometry(4200, 4200, 100, 100);
  oceanGeo.rotateX(-Math.PI / 2);

  const oceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: sunDirection.clone() },
    uDeepColor: { value: new THREE.Color('#0277b5') },
    uShallowColor: { value: new THREE.Color('#22d3ee') },
    uSkyColor: { value: new THREE.Color('#93dcff') },
    uSunColor: { value: new THREE.Color('#fffbeb') },
    uSunStrength: { value: 0.85 },
  };

  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    transparent: true,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      void main() {
        vec3 pos = position;
        pos.y += sin(pos.x * 0.055 + uTime * 1.55) * 0.11 + cos(pos.z * 0.062 + uTime * 1.35) * 0.09;
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uSkyColor;
      uniform vec3 uSunColor;
      uniform float uSunStrength;
      varying vec3 vWorldPos;

      void main() {
        vec2 p = vWorldPos.xz;

        float w1 = sin(p.x * 0.18 + uTime * 1.9 + cos(p.y * 0.11) * 1.3) * cos(p.y * 0.15 - uTime * 1.5);
        float w2 = sin(p.x * 0.41 - uTime * 2.4 + p.y * 0.33);
        float w3 = cos(p.x * 0.65 + p.y * 0.56 + uTime * 2.9) * 0.45;
        vec3 N = normalize(vec3(w1 * 0.10 + w2 * 0.06 + w3 * 0.04, 1.0, w2 * 0.09 - w1 * 0.07 + w3 * 0.04));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);

        float coastLine = -582.0 + sin(p.y * 0.0085) * 26.0 + cos(p.y * 0.021) * 10.0;
        float westShallow = smoothstep(coastLine - 280.0, coastLine - 12.0, p.x);
        float bayShallow = (1.0 - smoothstep(140.0, 420.0, length(p - vec2(45.0, 465.0)))) * smoothstep(210.0, 320.0, p.y);
        float shallowMix = clamp(max(westShallow, bayShallow), 0.0, 1.0);

        vec3 waterBase = mix(uDeepColor, uShallowColor, shallowMix * 0.78);
        vec3 col = mix(waterBase, uSkyColor, fresnel * 0.54);

        vec3 H = normalize(normalize(uSunDir) + V);
        float spec = pow(max(dot(N, H), 0.0), 150.0) * 0.68 * uSunStrength;
        col += uSunColor * spec;

        float foamWave = sin(p.y * 0.09 + uTime * 2.1) * 4.5;
        float surfBand = smoothstep(coastLine - 34.0 + foamWave, coastLine - 16.0 + foamWave, p.x)
                       * (1.0 - smoothstep(coastLine - 14.0 + foamWave, coastLine + 4.0 + foamWave, p.x));
        col = mix(col, vec3(0.95, 0.99, 1.0), surfBand * 0.58);

        float distFade = clamp(length(cameraPosition.xz - p) / 1700.0, 0.0, 1.0);
        col = mix(col, uSkyColor, distFade * 0.85);

        gl_FragColor = vec4(col, 0.96);
      }
    `,
  });

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = SEA_LEVEL_Y;
  group.add(oceanMesh);

  // 4. Elevated Cumulus Horizon Clouds
  const cloudSprites: THREE.Sprite[] = [];
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudMap,
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  for (let i = 0; i < 32; i++) {
    const sprite = new THREE.Sprite(cloudMat);
    const angle = (i / 32) * Math.PI * 2;
    const radius = 580 + (i % 4) * 130;
    const clusterY = 165 + (i % 5) * 30;
    sprite.position.set(
      Math.cos(angle) * radius,
      clusterY,
      Math.sin(angle) * radius,
    );
    sprite.scale.set(230 + (i % 5) * 45, 90 + (i % 3) * 20, 1);
    cloudSprites.push(sprite);
    group.add(sprite);
  }

  return {
    group,
    skyMesh,
    oceanMesh,
    cloudSprites,
    sunDirection,
    state,
    update: (timeSec, cyclePhase, playerX, playerZ, weather, cameraFar = 1600) => {
      const ph = ((cyclePhase % 1) + 1) % 1;
      skyMesh.position.set(playerX, 0, playerZ);
      skyMesh.scale.setScalar(Math.max(400, cameraFar * 0.82));
      starPoints.position.set(playerX, 0, playerZ);
      starPoints.scale.setScalar(Math.max(380, cameraFar * 0.78));
      starPoints.rotation.y = ph * Math.PI * 0.4;
      oceanUniforms.uTime.value = timeSec;

      // Solar orbital trajectory: Dawn(+X East) -> Midday(High South/North angle) -> Sunset(-X West ocean)
      const solarAngle = (ph - 0.25) * Math.PI * 2;
      const rawSunY = Math.sin(solarAngle);
      _sunTrueDir
        .set(
          Math.cos(solarAngle) * 0.94,
          rawSunY * 0.88,
          -0.46 - Math.cos(solarAngle) * 0.14,
        )
        .normalize();

      // Lunar opposite orbital arc for crisp silver night directional shadows
      _moonDir
        .set(
          -Math.cos(solarAngle) * 0.75,
          Math.max(0.28, -rawSunY * 0.82),
          -0.48 + Math.cos(solarAngle) * 0.14,
        )
        .normalize();

      // Interpolate adjacent sky keyframes smoothly
      let kfA = PARSED_FRAMES[0];
      let kfB = PARSED_FRAMES[PARSED_FRAMES.length - 1];
      for (let i = 0; i < PARSED_FRAMES.length - 1; i++) {
        if (ph >= PARSED_FRAMES[i].phase && ph <= PARSED_FRAMES[i + 1].phase) {
          kfA = PARSED_FRAMES[i];
          kfB = PARSED_FRAMES[i + 1];
          break;
        }
      }
      const span = Math.max(0.0001, kfB.phase - kfA.phase);
      const t = THREE.MathUtils.smoothstep((ph - kfA.phase) / span, 0, 1);

      skyUniforms.uTopColor.value.copy(kfA.top).lerp(kfB.top, t);
      skyUniforms.uMidColor.value.copy(kfA.mid).lerp(kfB.mid, t);
      skyUniforms.uHorizonColor.value.copy(kfA.horizon).lerp(kfB.horizon, t);
      skyUniforms.uSunColor.value.copy(kfA.sunCol).lerp(kfB.sunCol, t);

      state.hemiSkyColor.copy(kfA.hemiSky).lerp(kfB.hemiSky, t);
      state.hemiGroundColor.copy(kfA.hemiGround).lerp(kfB.hemiGround, t);
      state.fogColor.copy(kfA.fog).lerp(kfB.fog, t);
      oceanUniforms.uDeepColor.value.copy(kfA.oceanDeep).lerp(kfB.oceanDeep, t);
      oceanUniforms.uShallowColor.value.copy(kfA.oceanShallow).lerp(kfB.oceanShallow, t);
      oceanUniforms.uSkyColor.value.copy(skyUniforms.uHorizonColor.value);
      cloudMat.color.copy(kfA.cloud).lerp(kfB.cloud, t);

      // Smooth day/night blend metrics
      const dayVis = THREE.MathUtils.smoothstep(rawSunY, -0.06, 0.14);
      const nightFactor = THREE.MathUtils.smoothstep(rawSunY, 0.08, -0.14);
      const goldenBand =
        1.0 - THREE.MathUtils.smoothstep(Math.abs(rawSunY), 0.0, 0.28);

      const isOvercast =
        weather === 'cloudy' ||
        weather === 'rain' ||
        weather === 'heavy_rain' ||
        weather === 'thunderstorm' ||
        weather === 'fog';
      const weatherMute = isOvercast ? 0.72 : 0.0;

      if (weatherMute > 0) {
        const targetTop = nightFactor > 0.5 ? _nightOvercast : _overcastTop;
        const targetMid = nightFactor > 0.5 ? _nightOvercast : _overcastMid;
        const targetHor = nightFactor > 0.5 ? _nightOvercast : _overcastHorizon;
        const targetFog = nightFactor > 0.5 ? _nightOvercast : _overcastFog;
        skyUniforms.uTopColor.value.lerp(targetTop, weatherMute);
        skyUniforms.uMidColor.value.lerp(targetMid, weatherMute);
        skyUniforms.uHorizonColor.value.lerp(targetHor, weatherMute);
        state.fogColor.lerp(targetFog, weatherMute);
        oceanUniforms.uDeepColor.value.lerp(_overcastOceanDeep, weatherMute * 0.8);
        oceanUniforms.uShallowColor.value.lerp(_overcastOceanShallow, weatherMute * 0.8);
        oceanUniforms.uSkyColor.value.copy(skyUniforms.uHorizonColor.value);
        cloudMat.color.lerp(_overcastCloud, weatherMute);
      }

      // Active directional shadow caster smoothly switches between radiant Sun (day) and faint Moon (night)
      const useMoon = rawSunY < 0.03;
      if (useMoon) {
        sunDirection.copy(_moonDir);
        state.keyColor.copy(_moonLightColor);
        const moonWeight = THREE.MathUtils.smoothstep(rawSunY, 0.03, -0.14);
        state.keyIntensity =
          THREE.MathUtils.lerp(0.18, 0.042, moonWeight) * (1 - weatherMute * 0.65);
      } else {
        sunDirection.copy(_sunTrueDir);
        state.keyColor.copy(skyUniforms.uSunColor.value);
        const sunWeight = THREE.MathUtils.smoothstep(rawSunY, 0.03, 0.24);
        state.keyIntensity =
          THREE.MathUtils.lerp(0.55, 2.58, sunWeight) * (1 - weatherMute * 0.45);
      }

      state.keyDirection.copy(sunDirection);
      state.sunElevation = rawSunY;
      state.nightFactor = nightFactor;
      state.dayFactor = dayVis * (1 - weatherMute * 0.4);
      state.hemiIntensity =
        THREE.MathUtils.lerp(0.68, 0.008, nightFactor) * (1 - weatherMute * 0.16);
      state.envIntensity = THREE.MathUtils.lerp(1.08, 0.007, nightFactor);
      state.exposure =
        THREE.MathUtils.lerp(1.04, 0.64, nightFactor) - goldenBand * 0.06;
      state.bloomStrength = Math.max(
        nightFactor * 0.36,
        goldenBand * 0.14,
      );

      // Derive discrete TimeOfDay label cleanly for UI/headlights
      if (nightFactor > 0.55) {
        state.derivedTimeOfDay = 'night';
      } else if (ph >= 0.2 && ph < 0.34) {
        state.derivedTimeOfDay = 'sunrise';
      } else if (ph >= 0.65 && ph < 0.83) {
        state.derivedTimeOfDay = 'sunset';
      } else {
        state.derivedTimeOfDay = 'day';
      }

      // Apply sky, starfield & ocean uniforms
      skyUniforms.uSunDir.value.copy(_sunTrueDir);
      skyUniforms.uMoonDir.value.copy(_moonDir);
      skyUniforms.uSunStrength.value = dayVis * (1 - weatherMute * 0.85);
      skyUniforms.uMoonStrength.value = nightFactor * (1 - weatherMute * 0.88);

      starMat.opacity = Math.max(0, (nightFactor - 0.14) / 0.86) * 0.96 * (1 - weatherMute * 0.95);
      starPoints.visible = starMat.opacity > 0.02;

      oceanUniforms.uSunDir.value.copy(useMoon ? _moonDir : _sunTrueDir);
      oceanUniforms.uSunColor.value.copy(
        useMoon ? _moonLightColor : skyUniforms.uSunColor.value,
      );
      oceanUniforms.uSunStrength.value = useMoon
        ? 0.22 * nightFactor * (1 - weatherMute * 0.8)
        : skyUniforms.uSunStrength.value;

      cloudMat.opacity = THREE.MathUtils.lerp(0.88, 0.08, nightFactor) + weatherMute * 0.1;

      const maxCloudDist = Math.max(380, cameraFar * 0.68);
      for (let i = 0; i < cloudSprites.length; i++) {
        const angle = (i / cloudSprites.length) * Math.PI * 2 + timeSec * 0.0022;
        const radius = Math.min(maxCloudDist, 540 + (i % 4) * 110);
        cloudSprites[i].position.x = playerX + Math.cos(angle) * radius;
        cloudSprites[i].position.z = playerZ + Math.sin(angle) * radius;
      }
    },
    dispose: () => {
      skyGeo.dispose();
      skyMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      oceanGeo.dispose();
      oceanMat.dispose();
      cloudMat.dispose();
    },
  };
}
