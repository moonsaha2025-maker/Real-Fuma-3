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
    lightningFlash?: number,
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
    phase: 0.0, // Realistic Moonlit Coastal Midnight (00:00)
    top: '#030816',
    mid: '#08142a',
    horizon: '#122440',
    sunCol: '#b7d0f7',
    hemiSky: '#1c3057',
    hemiGround: '#070a12',
    fog: '#0b1629',
    oceanDeep: '#030d1d',
    oceanShallow: '#09233b',
    cloud: '#16243b',
  },
  {
    phase: 0.21, // Pre-dawn twilight (05:00)
    top: '#071128',
    mid: '#182447',
    horizon: '#45355a',
    sunCol: '#f59e0b',
    hemiSky: '#2e3c68',
    hemiGround: '#0c101b',
    fog: '#1e233b',
    oceanDeep: '#041426',
    oceanShallow: '#0e3047',
    cloud: '#4b4464',
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
    phase: 0.81, // Deep Blue-Hour Dusk (19:25)
    top: '#060d20',
    mid: '#151e3d',
    horizon: '#382a4a',
    sunCol: '#93c5fd',
    hemiSky: '#233259',
    hemiGround: '#0a0e18',
    fog: '#141a2e',
    oceanDeep: '#041224',
    oceanShallow: '#0a283d',
    cloud: '#30394f',
  },
  {
    phase: 1.0, // Midnight Wrap (24:00)
    top: '#030816',
    mid: '#08142a',
    horizon: '#122440',
    sunCol: '#b7d0f7',
    hemiSky: '#1c3057',
    hemiGround: '#070a12',
    fog: '#0b1629',
    oceanDeep: '#030d1d',
    oceanShallow: '#09233b',
    cloud: '#16243b',
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

const _cloudyTop = new THREE.Color('#4a5f7a');
const _cloudyMid = new THREE.Color('#7f94ab');
const _cloudyHor = new THREE.Color('#b6c5d4');
const _cloudyFog = new THREE.Color('#97a8ba');

const _fogDayTop = new THREE.Color('#8da0b3');
const _fogDayMid = new THREE.Color('#b4c3d1');
const _fogDayHor = new THREE.Color('#cedae5');
const _fogDayFog = new THREE.Color('#c3d0dc');

const _stormTop = new THREE.Color('#1a2434');
const _stormMid = new THREE.Color('#2d3b4e');
const _stormHor = new THREE.Color('#4d5f73');
const _stormFog = new THREE.Color('#3b4a5c');

const _rainTop = new THREE.Color('#2c3c52');
const _rainMid = new THREE.Color('#4e627a');
const _rainHor = new THREE.Color('#778a9e');
const _rainFog = new THREE.Color('#64768a');

const _nightOvercastTop = new THREE.Color('#040812');
const _nightOvercastMid = new THREE.Color('#091120');
const _nightOvercastHor = new THREE.Color('#101d31');
const _nightFogMist = new THREE.Color('#0d1726');

const _overcastOceanDeep = new THREE.Color('#0d2c3e');
const _overcastOceanShallow = new THREE.Color('#235263');
const _nightOceanDeep = new THREE.Color('#030c18');
const _nightOceanShallow = new THREE.Color('#081e30');
const _overcastCloud = new THREE.Color('#7b8a9b');
const _nightOvercastCloud = new THREE.Color('#142033');

const _moonLightColor = new THREE.Color('#93b8f2');
const _lightningFogFlash = new THREE.Color('#b8d4f5');
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

  // 1. Atmospheric Scattering Sky Dome + Volumetric Procedural Cloud Deck + Cratered Moon + Milky Way
  const skyGeo = new THREE.SphereGeometry(1, 56, 36);
  const skyUniforms = {
    uTime: { value: 0 },
    uTopColor: { value: new THREE.Color('#0c54c7') },
    uMidColor: { value: new THREE.Color('#38bdf8') },
    uHorizonColor: { value: new THREE.Color('#bae6fd') },
    uSunColor: { value: new THREE.Color('#fff9db') },
    uCloudColor: { value: new THREE.Color('#ffffff') },
    uSunDir: { value: sunDirection.clone() },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.5, -0.5).normalize() },
    uSunStrength: { value: 0.9 },
    uMoonStrength: { value: 0.0 },
    uCloudCoverage: { value: 0.28 },
    uCloudDarkness: { value: 0.0 },
    uFogHorizonLift: { value: 0.0 },
    uLightningFlash: { value: 0.0 },
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
      uniform float uTime;
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunColor;
      uniform vec3 uCloudColor;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform float uSunStrength;
      uniform float uMoonStrength;
      uniform float uCloudCoverage;
      uniform float uCloudDarkness;
      uniform float uFogHorizonLift;
      uniform float uLightningFlash;
      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = rot * p * 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.22, h));
        col = mix(col, uTopColor, smoothstep(0.18, 0.82, h));

        // Faint Milky Way & celestial dusk dust band on clear dark nights
        if (uMoonStrength > 0.05) {
          float mwAxis = dir.x * 0.62 + dir.y * 0.54 - dir.z * 0.57;
          float bandMask = exp(-mwAxis * mwAxis * 13.0) * smoothstep(0.05, 0.45, h);
          float dustRift = fbm(dir.xz * 4.5 + dir.y * 2.2);
          vec3 mwCol = vec3(0.07, 0.11, 0.21) * bandMask * (0.45 + 0.75 * dustRift);
          col += mwCol * uMoonStrength * (1.0 - uCloudCoverage * 0.85);
        }

        // Solar Mie glow + crisp solar disc
        vec3 sDir = normalize(uSunDir);
        float sunAmt = max(dot(dir, sDir), 0.0);
        float halo = pow(sunAmt, 9.0) * 0.36 * uSunStrength + pow(sunAmt, 42.0) * 0.44 * uSunStrength;
        float core = smoothstep(0.9984, 0.9997, sunAmt) * 1.45 * uSunStrength;
        col += uSunColor * (halo + core);

        // Cratered Lunar Disc + Atmospheric Moonlight Ring
        vec3 mDir = normalize(uMoonDir);
        float moonAmt = max(dot(dir, mDir), 0.0);
        float moonHalo = pow(moonAmt, 24.0) * 0.28 * uMoonStrength + pow(moonAmt, 8.0) * 0.08 * uMoonStrength;
        float moonMask = smoothstep(0.9988, 0.99945, moonAmt) * uMoonStrength;
        float maria = 1.0;
        if (moonMask > 0.001) {
          vec3 mRight = normalize(cross(vec3(0.0, 1.0, 0.0), mDir));
          vec3 mUp = cross(mDir, mRight);
          vec2 mUv = vec2(dot(dir, mRight), dot(dir, mUp)) * 18.0;
          maria = mix(0.68, 1.08, fbm(mUv + 3.1));
        }
        col += vec3(0.84, 0.91, 1.0) * (moonHalo + moonMask * 1.15 * maria);

        // Volumetric Spherical FBM Cloud Deck (overhead cumulus, overcast stratus & storm anvils)
        if (dir.y > 0.01) {
          vec2 planeUv = dir.xz / (dir.y + 0.16);
          vec2 wind = vec2(uTime * 0.011, uTime * 0.005);
          float c1 = fbm(planeUv * 0.55 + wind);
          float c2 = fbm(planeUv * 1.35 - wind * 1.4 + c1 * 0.65);
          float cloudShape = mix(c1, c2, 0.42);

          // Offset threshold by coverage so sunny = wispy scattered, cloudy/storm = full dense sky
          float thresh = mix(0.66, 0.24, uCloudCoverage);
          float cloudAlpha = smoothstep(thresh, thresh + 0.28, cloudShape);
          // Soft horizon fade so clouds blend smoothly into distant mist
          cloudAlpha *= smoothstep(0.015, 0.16, dir.y);

          // Sun/moon silver-lining vs thick dark convective undersides
          float lightScatter = pow(max(sunAmt, moonAmt * 0.6), 5.0);
          float billowShade = clamp((cloudShape - thresh) * 2.2, 0.0, 1.0);
          vec3 litTop = uCloudColor * (1.0 + lightScatter * 0.42 * (1.0 - uCloudDarkness * 0.65));
          vec3 baseBottom = uCloudColor * mix(0.62, 0.22, uCloudDarkness);
          vec3 cloudFinal = mix(litTop, baseBottom, billowShade * (0.45 + uCloudDarkness * 0.5));

          // Internal cloud-to-cloud sheet lightning glow during thunderstorms
          if (uLightningFlash > 0.01) {
            float stormCell = smoothstep(0.45, 0.92, fbm(planeUv * 0.45 + 7.2));
            cloudFinal += vec3(0.78, 0.88, 1.0) * uLightningFlash * (0.45 + stormCell * 1.35);
          }

          col = mix(col, cloudFinal, cloudAlpha * mix(0.74, 0.96, uCloudCoverage));
        }

        // Dense horizon fog lift (elevates mist naturally into sky dome during fog & heavy storms)
        float horizonBlend = 1.0 - smoothstep(0.0, mix(0.14, 0.68, uFogHorizonLift), h);
        col = mix(col, uHorizonColor, horizonBlend * (0.35 + uFogHorizonLift * 0.65));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -100;
  skyMesh.scale.setScalar(900);
  group.add(skyMesh);

  // 2. Twinkling Custom-Shader Starfield Dome (1,350 stars with brightness hierarchy & scintillation)
  const starCount = 1350;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const starPhase = new Float32Array(starCount);
  let seed = 918273;
  const srnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < starCount; i++) {
    const theta = srnd() * Math.PI * 2;
    const u = 0.04 + srnd() * 0.96;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    starPos[i * 3] = Math.cos(theta) * r;
    starPos[i * 3 + 1] = u;
    starPos[i * 3 + 2] = Math.sin(theta) * r;

    const mag = Math.pow(srnd(), 2.1); // Realistic few bright beacons, many faint stars
    const bright = 0.42 + mag * 0.58;
    const temp = srnd();
    starCol[i * 3] = bright * (temp > 0.72 ? 1.0 : 0.84);
    starCol[i * 3 + 1] = bright * 0.92;
    starCol[i * 3 + 2] = bright * (temp < 0.35 ? 1.0 : 0.86);
    starSize[i] = 1.6 + mag * 3.0;
    starPhase[i] = srnd() * Math.PI * 2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));

  const starUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 color;
      attribute float aSize;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;

      void main() {
        vColor = color;
        vTwinkle = 0.65 + 0.35 * sin(uTime * (1.8 + fract(aPhase) * 2.2) + aPhase * 6.283);
        gl_PointSize = aSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uOpacity;

      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        if (r >= 1.0) discard;
        float core = exp(-r * r * 5.5);
        float a = core * uOpacity * vTwinkle;
        if (a <= 0.01) discard;
        gl_FragColor = vec4(vColor * (1.0 + core * 0.45), a);
      }
    `,
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = -95;
  group.add(starPoints);

  // 3. Coastal Ocean & Bay Plane (Day Sun Specular + Night Moonpath + Storm Chop + Lightning Glint)
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
    uStormChop: { value: 0.0 },
    uLightningFlash: { value: 0.0 },
  };

  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    transparent: true,
    vertexShader: `
      uniform float uTime;
      uniform float uStormChop;
      varying vec3 vWorldPos;
      void main() {
        vec3 pos = position;
        float amp = 1.0 + uStormChop * 2.4;
        pos.y += (sin(pos.x * 0.055 + uTime * (1.55 + uStormChop)) * 0.11 + cos(pos.z * 0.062 + uTime * 1.35) * 0.09) * amp;
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
      uniform float uStormChop;
      uniform float uLightningFlash;
      varying vec3 vWorldPos;

      void main() {
        vec2 p = vWorldPos.xz;
        float chop = 1.0 + uStormChop * 1.35;

        float w1 = sin(p.x * 0.18 + uTime * (1.9 + uStormChop) + cos(p.y * 0.11) * 1.3) * cos(p.y * 0.15 - uTime * 1.5);
        float w2 = sin(p.x * 0.41 - uTime * 2.4 + p.y * 0.33);
        float w3 = cos(p.x * 0.65 + p.y * 0.56 + uTime * 2.9) * 0.45;
        vec3 N = normalize(vec3((w1 * 0.10 + w2 * 0.06 + w3 * 0.04) * chop, 1.0, (w2 * 0.09 - w1 * 0.07 + w3 * 0.04) * chop));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

        float coastLine = -582.0 + sin(p.y * 0.0085) * 26.0 + cos(p.y * 0.021) * 10.0;
        float westShallow = smoothstep(coastLine - 280.0, coastLine - 12.0, p.x);
        float bayShallow = (1.0 - smoothstep(140.0, 420.0, length(p - vec2(45.0, 465.0)))) * smoothstep(210.0, 320.0, p.y);
        float shallowMix = clamp(max(westShallow, bayShallow), 0.0, 1.0);

        vec3 waterBase = mix(uDeepColor, uShallowColor, shallowMix * 0.78);
        vec3 col = mix(waterBase, uSkyColor, fresnel * 0.58);

        vec3 H = normalize(normalize(uSunDir) + V);
        float spec = pow(max(dot(N, H), 0.0), mix(150.0, 75.0, uStormChop)) * 0.68 * uSunStrength;
        col += uSunColor * spec;

        if (uLightningFlash > 0.01) {
          float stormGlint = pow(max(dot(N, V), 0.0), 6.0) * 0.18 + fresnel * 0.45;
          col += vec3(0.75, 0.88, 1.0) * uLightningFlash * stormGlint * 1.35;
        }

        float whitecap = smoothstep(0.85, 1.25, abs(w1) + abs(w2) * 0.45) * uStormChop * 0.35;
        float foamWave = sin(p.y * 0.09 + uTime * 2.1) * 4.5;
        float surfBand = smoothstep(coastLine - 34.0 + foamWave, coastLine - 16.0 + foamWave, p.x)
                       * (1.0 - smoothstep(coastLine - 14.0 + foamWave, coastLine + 4.0 + foamWave, p.x));
        col = mix(col, vec3(0.95, 0.99, 1.0), clamp(surfBand * 0.58 + whitecap, 0.0, 0.75));

        float distFade = clamp(length(cameraPosition.xz - p) / 1700.0, 0.0, 1.0);
        col = mix(col, uSkyColor, distFade * 0.85);

        gl_FragColor = vec4(col, 0.96);
      }
    `,
  });

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = SEA_LEVEL_Y;
  group.add(oceanMesh);

  // 4. Elevated Midground Cumulus & Mountain Ridge Cloud Sprites
  const cloudSprites: THREE.Sprite[] = [];
  const cloudMat = new THREE.SpriteMaterial({
    map: cloudMap,
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  for (let i = 0; i < 36; i++) {
    const sprite = new THREE.Sprite(cloudMat);
    const angle = (i / 36) * Math.PI * 2;
    const radius = 440 + (i % 4) * 125;
    const clusterY = 128 + (i % 5) * 28;
    sprite.position.set(
      Math.cos(angle) * radius,
      clusterY,
      Math.sin(angle) * radius,
    );
    sprite.scale.set(240 + (i % 5) * 48, 92 + (i % 3) * 22, 1);
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
    update: (
      timeSec,
      cyclePhase,
      playerX,
      playerZ,
      weather,
      cameraFar = 1600,
      lightningFlash = 0,
    ) => {
      const ph = ((cyclePhase % 1) + 1) % 1;
      skyMesh.position.set(playerX, 0, playerZ);
      skyMesh.scale.setScalar(Math.max(400, cameraFar * 0.82));
      starPoints.position.set(playerX, 0, playerZ);
      starPoints.scale.setScalar(Math.max(380, cameraFar * 0.78));
      starPoints.rotation.y = ph * Math.PI * 0.4;
      skyUniforms.uTime.value = timeSec;
      starUniforms.uTime.value = timeSec;
      oceanUniforms.uTime.value = timeSec;

      // Solar orbital trajectory
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
          Math.max(0.32, -rawSunY * 0.82),
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
      cloudMat.color.copy(kfA.cloud).lerp(kfB.cloud, t);

      // Smooth day/night blend metrics
      const dayVis = THREE.MathUtils.smoothstep(rawSunY, -0.06, 0.14);
      const nightFactor = THREE.MathUtils.smoothstep(rawSunY, 0.08, -0.14);
      const goldenBand =
        1.0 - THREE.MathUtils.smoothstep(Math.abs(rawSunY), 0.0, 0.28);

      // Distinct per-weather atmospheric profiles
      let cloudCoverage = 0.24;
      let cloudDarkness = 0.0;
      let fogHorizonLift = 0.0;
      let weatherMute = 0.0;
      let stormChop = 0.0;

      if (weather === 'cloudy') {
        cloudCoverage = 0.80;
        cloudDarkness = 0.34;
        fogHorizonLift = 0.10;
        weatherMute = 0.64;
        stormChop = 0.22;
        if (nightFactor > 0.5) {
          skyUniforms.uTopColor.value.lerp(_nightOvercastTop, 0.65);
          skyUniforms.uMidColor.value.lerp(_nightOvercastMid, 0.65);
          skyUniforms.uHorizonColor.value.lerp(_nightOvercastHor, 0.65);
          state.fogColor.lerp(_nightFogMist, 0.6);
        } else {
          skyUniforms.uTopColor.value.lerp(_cloudyTop, 0.72);
          skyUniforms.uMidColor.value.lerp(_cloudyMid, 0.72);
          skyUniforms.uHorizonColor.value.lerp(_cloudyHor, 0.72);
          state.fogColor.lerp(_cloudyFog, 0.7);
        }
      } else if (weather === 'fog') {
        cloudCoverage = 0.72;
        cloudDarkness = 0.22;
        fogHorizonLift = 0.88;
        weatherMute = 0.84;
        stormChop = 0.08;
        if (nightFactor > 0.5) {
          skyUniforms.uTopColor.value.lerp(_nightFogMist, 0.88);
          skyUniforms.uMidColor.value.lerp(_nightFogMist, 0.90);
          skyUniforms.uHorizonColor.value.lerp(_nightOvercastHor, 0.88);
          state.fogColor.lerp(_nightFogMist, 0.90);
        } else {
          skyUniforms.uTopColor.value.lerp(_fogDayTop, 0.84);
          skyUniforms.uMidColor.value.lerp(_fogDayMid, 0.86);
          skyUniforms.uHorizonColor.value.lerp(_fogDayHor, 0.90);
          state.fogColor.lerp(_fogDayFog, 0.90);
        }
      } else if (weather === 'rain') {
        cloudCoverage = 0.87;
        cloudDarkness = 0.62;
        fogHorizonLift = 0.24;
        weatherMute = 0.78;
        stormChop = 0.55;
        if (nightFactor > 0.5) {
          skyUniforms.uTopColor.value.lerp(_nightOvercastTop, 0.8);
          skyUniforms.uMidColor.value.lerp(_nightOvercastMid, 0.8);
          skyUniforms.uHorizonColor.value.lerp(_nightOvercastHor, 0.8);
          state.fogColor.lerp(_nightFogMist, 0.8);
        } else {
          skyUniforms.uTopColor.value.lerp(_rainTop, 0.82);
          skyUniforms.uMidColor.value.lerp(_rainMid, 0.82);
          skyUniforms.uHorizonColor.value.lerp(_rainHor, 0.82);
          state.fogColor.lerp(_rainFog, 0.82);
        }
      } else if (weather === 'heavy_rain' || weather === 'thunderstorm') {
        const isStorm = weather === 'thunderstorm';
        cloudCoverage = isStorm ? 0.96 : 0.92;
        cloudDarkness = isStorm ? 0.94 : 0.80;
        fogHorizonLift = isStorm ? 0.40 : 0.34;
        weatherMute = isStorm ? 0.92 : 0.86;
        stormChop = isStorm ? 1.0 : 0.82;
        if (nightFactor > 0.5) {
          skyUniforms.uTopColor.value.lerp(_nightOvercastTop, 0.92);
          skyUniforms.uMidColor.value.lerp(_nightOvercastMid, 0.92);
          skyUniforms.uHorizonColor.value.lerp(_nightOvercastHor, 0.92);
          state.fogColor.lerp(_nightFogMist, 0.9);
        } else {
          skyUniforms.uTopColor.value.lerp(_stormTop, weatherMute);
          skyUniforms.uMidColor.value.lerp(_stormMid, weatherMute);
          skyUniforms.uHorizonColor.value.lerp(_stormHor, weatherMute);
          state.fogColor.lerp(_stormFog, weatherMute);
        }
      }

      if (weatherMute > 0) {
        oceanUniforms.uDeepColor.value.lerp(
          nightFactor > 0.5 ? _nightOceanDeep : _overcastOceanDeep,
          weatherMute * 0.84,
        );
        oceanUniforms.uShallowColor.value.lerp(
          nightFactor > 0.5 ? _nightOceanShallow : _overcastOceanShallow,
          weatherMute * 0.84,
        );
        cloudMat.color.lerp(
          nightFactor > 0.5 ? _nightOvercastCloud : _overcastCloud,
          weatherMute * 0.86,
        );
      }

      // Sheet-lightning sky & horizon flash during thunderstorms
      if (lightningFlash > 0.005) {
        const flashTint = Math.min(1, lightningFlash * 0.45);
        skyUniforms.uHorizonColor.value.lerp(skyUniforms.uSunColor.value, flashTint * 0.4);
        state.fogColor.lerp(_lightningFogFlash, flashTint * 0.36);
      }

      oceanUniforms.uSkyColor.value.copy(skyUniforms.uHorizonColor.value);
      oceanUniforms.uStormChop.value = stormChop;
      oceanUniforms.uLightningFlash.value = lightningFlash;

      skyUniforms.uCloudColor.value.copy(cloudMat.color);
      skyUniforms.uCloudCoverage.value = cloudCoverage;
      skyUniforms.uCloudDarkness.value = cloudDarkness;
      skyUniforms.uFogHorizonLift.value = fogHorizonLift;
      skyUniforms.uLightningFlash.value = lightningFlash;

      // Active directional light smoothly transitions between Sun (day) and crisp silver Moon (night)
      const useMoon = rawSunY < 0.03;
      if (useMoon) {
        sunDirection.copy(_moonDir);
        state.keyColor.copy(_moonLightColor);
        const moonWeight = THREE.MathUtils.smoothstep(rawSunY, 0.03, -0.14);
        state.keyIntensity =
          THREE.MathUtils.lerp(0.24, 0.16, moonWeight) * (1 - weatherMute * 0.72);
      } else {
        sunDirection.copy(_sunTrueDir);
        state.keyColor.copy(skyUniforms.uSunColor.value);
        const sunWeight = THREE.MathUtils.smoothstep(rawSunY, 0.03, 0.24);
        state.keyIntensity =
          THREE.MathUtils.lerp(0.55, 2.58, sunWeight) * (1 - weatherMute * 0.58);
      }

      state.keyDirection.copy(sunDirection);
      state.sunElevation = rawSunY;
      state.nightFactor = nightFactor;
      state.dayFactor = dayVis * (1 - weatherMute * 0.48);

      // Balanced atmospheric ambient & reflections at night (never crushed black)
      state.hemiIntensity =
        THREE.MathUtils.lerp(0.68, 0.145, nightFactor) *
        (weather === 'fog' ? 1.12 : 1 - weatherMute * 0.18);
      state.envIntensity =
        THREE.MathUtils.lerp(1.08, 0.22, nightFactor) *
        (1 - weatherMute * 0.28);
      state.exposure =
        THREE.MathUtils.lerp(1.04, 0.88, nightFactor) -
        goldenBand * 0.05 -
        (weather === 'thunderstorm' ? 0.06 : 0);
      state.bloomStrength = Math.max(
        nightFactor * 0.42,
        goldenBand * 0.14,
        lightningFlash * 0.55,
      );

      if (nightFactor > 0.55) {
        state.derivedTimeOfDay = 'night';
      } else if (ph >= 0.2 && ph < 0.34) {
        state.derivedTimeOfDay = 'sunrise';
      } else if (ph >= 0.65 && ph < 0.83) {
        state.derivedTimeOfDay = 'sunset';
      } else {
        state.derivedTimeOfDay = 'day';
      }

      // Sky, stars & ocean uniforms
      skyUniforms.uSunDir.value.copy(_sunTrueDir);
      skyUniforms.uMoonDir.value.copy(_moonDir);
      skyUniforms.uSunStrength.value = dayVis * (1 - weatherMute * 0.86);
      skyUniforms.uMoonStrength.value = nightFactor * (1 - weatherMute * 0.90);

      // Stars fade realistically behind cloud cover and fog
      const cloudStarAtten = 1 - Math.max(weatherMute, (cloudCoverage - 0.24) * 1.15);
      starUniforms.uOpacity.value =
        Math.max(0, (nightFactor - 0.12) / 0.88) *
        0.95 *
        Math.max(0.0, Math.min(1.0, cloudStarAtten));
      starPoints.visible = starUniforms.uOpacity.value > 0.02;

      oceanUniforms.uSunDir.value.copy(useMoon ? _moonDir : _sunTrueDir);
      oceanUniforms.uSunColor.value.copy(
        useMoon ? _moonLightColor : skyUniforms.uSunColor.value,
      );
      oceanUniforms.uSunStrength.value = useMoon
        ? 0.36 * nightFactor * (1 - weatherMute * 0.82)
        : skyUniforms.uSunStrength.value;

      cloudMat.opacity =
        THREE.MathUtils.lerp(0.84, 0.22, nightFactor) * (1 - fogHorizonLift * 0.35) +
        weatherMute * 0.14;

      const maxCloudDist = Math.max(360, cameraFar * 0.64);
      for (let i = 0; i < cloudSprites.length; i++) {
        const speedMul = weather === 'thunderstorm' ? 0.0055 : 0.0026;
        const angle = (i / cloudSprites.length) * Math.PI * 2 + timeSec * speedMul;
        const radius = Math.min(maxCloudDist, 430 + (i % 4) * 115);
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
