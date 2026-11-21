import * as THREE from 'three';
import { SEA_LEVEL_Y } from '../data/track';
import { TimeOfDay, WeatherType } from '../types/game';

export interface AtmosphereSystem {
  group: THREE.Group;
  skyMesh: THREE.Mesh;
  oceanMesh: THREE.Mesh;
  cloudSprites: THREE.Sprite[];
  sunDirection: THREE.Vector3;
  update: (
    timeSec: number,
    playerX: number,
    playerZ: number,
    weather: WeatherType,
    timeOfDay: TimeOfDay,
    cameraFar?: number,
  ) => void;
  dispose: () => void;
}

export function createAtmosphereSystem(
  cloudMap: THREE.Texture,
): AtmosphereSystem {
  const group = new THREE.Group();
  const sunDirection = new THREE.Vector3(-0.72, 0.38, -0.58).normalize();

  // 1. Atmospheric Sky Dome (Unit Sphere scaled safely inside camera.far)
  const skyGeo = new THREE.SphereGeometry(1, 48, 32);
  const skyUniforms = {
    uTopColor: { value: new THREE.Color('#0c54c7') },
    uMidColor: { value: new THREE.Color('#38bdf8') },
    uHorizonColor: { value: new THREE.Color('#bae6fd') },
    uSunColor: { value: new THREE.Color('#fff9db') },
    uSunDir: { value: sunDirection.clone() },
    uSunStrength: { value: 0.85 },
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
      uniform float uSunStrength;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.24, h));
        col = mix(col, uTopColor, smoothstep(0.20, 0.82, h));

        float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
        float halo = pow(sunAmt, 14.0) * 0.22 * uSunStrength;
        float core = pow(sunAmt, 420.0) * 0.88 * uSunStrength;
        col += uSunColor * (halo + core);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -100;
  skyMesh.scale.setScalar(900);
  group.add(skyMesh);

  // 2. Seamless Coastal Ocean & Bay Plane (Hardware depth-buffered against road-carved shoreline)
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

        // Multi-directional wave normals (using p.x and p.y strictly for XZ coordinates)
        float w1 = sin(p.x * 0.18 + uTime * 1.9 + cos(p.y * 0.11) * 1.3) * cos(p.y * 0.15 - uTime * 1.5);
        float w2 = sin(p.x * 0.41 - uTime * 2.4 + p.y * 0.33);
        float w3 = cos(p.x * 0.65 + p.y * 0.56 + uTime * 2.9) * 0.45;
        vec3 N = normalize(vec3(w1 * 0.10 + w2 * 0.06 + w3 * 0.04, 1.0, w2 * 0.09 - w1 * 0.07 + w3 * 0.04));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);

        // Shallow turquoise glow along Sunset Coast (-585) and Fujimi Bay cove
        float coastLine = -582.0 + sin(p.y * 0.0085) * 26.0 + cos(p.y * 0.021) * 10.0;
        float westShallow = smoothstep(coastLine - 280.0, coastLine - 12.0, p.x);
        float bayShallow = (1.0 - smoothstep(140.0, 420.0, length(p - vec2(45.0, 465.0)))) * smoothstep(210.0, 320.0, p.y);
        float shallowMix = clamp(max(westShallow, bayShallow), 0.0, 1.0);

        vec3 waterBase = mix(uDeepColor, uShallowColor, shallowMix * 0.78);
        vec3 col = mix(waterBase, uSkyColor, fresnel * 0.52);

        // Controlled crisp sun shimmer
        vec3 H = normalize(normalize(uSunDir) + V);
        float spec = pow(max(dot(N, H), 0.0), 150.0) * 0.62 * uSunStrength;
        col += uSunColor * spec;

        // Animated coastal surf foam along western shoreline
        float foamWave = sin(p.y * 0.09 + uTime * 2.1) * 4.5;
        float surfBand = smoothstep(coastLine - 34.0 + foamWave, coastLine - 16.0 + foamWave, p.x)
                       * (1.0 - smoothstep(coastLine - 14.0 + foamWave, coastLine + 4.0 + foamWave, p.x));
        col = mix(col, vec3(0.95, 0.99, 1.0), surfBand * 0.62);

        float distFade = clamp(length(cameraPosition.xz - p) / 1700.0, 0.0, 1.0);
        col = mix(col, uSkyColor, distFade * 0.85);

        gl_FragColor = vec4(col, 0.96);
      }
    `,
  });

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = SEA_LEVEL_Y;
  group.add(oceanMesh);

  // 3. Elevated Cumulus Horizon Clouds
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
    update: (timeSec, playerX, playerZ, weather, timeOfDay, cameraFar = 1600) => {
      skyMesh.position.set(playerX, 0, playerZ);
      skyMesh.scale.setScalar(Math.max(400, cameraFar * 0.82));
      oceanUniforms.uTime.value = timeSec;

      const isNight = timeOfDay === 'night';
      const isSunset = timeOfDay === 'sunset';
      const isSunrise = timeOfDay === 'sunrise';
      const isOvercast =
        weather === 'cloudy' ||
        weather === 'rain' ||
        weather === 'heavy_rain' ||
        weather === 'thunderstorm' ||
        weather === 'fog';

      if (isNight) {
        sunDirection.set(-0.55, 0.38, -0.74).normalize();
        skyUniforms.uTopColor.value.set('#040814');
        skyUniforms.uMidColor.value.set('#0b172c');
        skyUniforms.uHorizonColor.value.set('#162440');
        skyUniforms.uSunColor.value.set('#cbd5e1');
        skyUniforms.uSunStrength.value = 0.22;
        oceanUniforms.uDeepColor.value.set('#041629');
        oceanUniforms.uShallowColor.value.set('#0a314d');
        oceanUniforms.uSkyColor.value.set('#162440');
        cloudMat.color.set('#334155');
      } else if (isSunset) {
        sunDirection.set(-0.85, 0.18, -0.5).normalize();
        skyUniforms.uTopColor.value.set('#1d2b64');
        skyUniforms.uMidColor.value.set('#9d3862');
        skyUniforms.uHorizonColor.value.set('#fb923c');
        skyUniforms.uSunColor.value.set('#fde047');
        skyUniforms.uSunStrength.value = 0.95;
        oceanUniforms.uDeepColor.value.set('#0c3b5e');
        oceanUniforms.uShallowColor.value.set('#14879c');
        oceanUniforms.uSkyColor.value.set('#fb923c');
        cloudMat.color.set('#fed7aa');
      } else if (isSunrise) {
        sunDirection.set(0.75, 0.24, -0.62).normalize();
        skyUniforms.uTopColor.value.set('#1e40af');
        skyUniforms.uMidColor.value.set('#60a5fa');
        skyUniforms.uHorizonColor.value.set('#fde68a');
        skyUniforms.uSunColor.value.set('#fef08a');
        skyUniforms.uSunStrength.value = 0.9;
        oceanUniforms.uDeepColor.value.set('#065f7a');
        oceanUniforms.uShallowColor.value.set('#22d3ee');
        oceanUniforms.uSkyColor.value.set('#bae6fd');
        cloudMat.color.set('#fef3c7');
      } else {
        sunDirection.set(-0.72, 0.38, -0.58).normalize();
        if (isOvercast) {
          skyUniforms.uTopColor.value.set('#334155');
          skyUniforms.uMidColor.value.set('#64748b');
          skyUniforms.uHorizonColor.value.set('#94a3b8');
          skyUniforms.uSunStrength.value = 0.2;
          oceanUniforms.uDeepColor.value.set('#0f3d52');
          oceanUniforms.uShallowColor.value.set('#2b6b7a');
          oceanUniforms.uSkyColor.value.set('#94a3b8');
          cloudMat.color.set('#94a3b8');
        } else {
          skyUniforms.uTopColor.value.set('#0d5be1');
          skyUniforms.uMidColor.value.set('#38bdf8');
          skyUniforms.uHorizonColor.value.set('#bae6fd');
          skyUniforms.uSunColor.value.set('#fff9db');
          skyUniforms.uSunStrength.value = 0.85;
          oceanUniforms.uDeepColor.value.set('#0277b5');
          oceanUniforms.uShallowColor.value.set('#26c6b8');
          oceanUniforms.uSkyColor.value.set('#93dcff');
          cloudMat.color.set('#ffffff');
        }
      }

      skyUniforms.uSunDir.value.copy(sunDirection);
      oceanUniforms.uSunDir.value.copy(sunDirection);
      oceanUniforms.uSunStrength.value = skyUniforms.uSunStrength.value;
      cloudMat.opacity = isNight ? 0.2 : isOvercast ? 0.84 : 0.76;

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
      oceanGeo.dispose();
      oceanMat.dispose();
      cloudMat.dispose();
    },
  };
}
