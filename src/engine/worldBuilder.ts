import * as THREE from 'three';
import {
  getRoadPointAt,
  getTerrainHeight,
  projectOntoTrack,
  TRACK_LENGTH_M,
  TRACK_STATION_COUNT,
  TRACK_STATIONS,
  WORLD_HALF_SIZE,
} from '../data/track';
import { ProceduralTexturePack } from './textures';

export interface BuiltWorld {
  worldGroup: THREE.Group;
  asphaltRoadMat: THREE.MeshStandardMaterial;
  checkpointBeacon: THREE.Group;
  lampPositions: Array<{ x: number; y: number; z: number }>;
  updateDynamicWorld: (
    timeSec: number,
    isWet: boolean,
    nightFactor?: number,
    playerX?: number,
    playerZ?: number,
  ) => void;
  dispose: () => void;
}

function buildContinuousRibbonGeometry(
  stationCount: number,
  sampleVertex: (
    idx: number,
    col: number,
  ) => { x: number; y: number; z: number; u: number; v: number },
  cols: number,
): THREE.BufferGeometry {
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= stationCount; i++) {
    const stIdx = i % stationCount;
    for (let c = 0; c < cols; c++) {
      const pt = sampleVertex(stIdx, c);
      verts.push(pt.x, pt.y, pt.z);
      uvs.push(pt.u, pt.v);
    }
  }

  for (let i = 0; i < stationCount; i++) {
    const r0 = i * cols;
    const r1 = (i + 1) * cols;
    for (let c = 0; c < cols - 1; c++) {
      const a = r0 + c;
      const b = r0 + c + 1;
      const d = r1 + c;
      const e = r1 + c + 1;
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build arched 3D botanical palm frond geometry extending along +Z with downward droop & V-fold
function buildArchedPalmFrondGeometry(): THREE.BufferGeometry {
  const widthSegs = 2;
  const lenSegs = 7;
  const width = 1.9;
  const length = 4.9;
  const geo = new THREE.PlaneGeometry(width, length, widthSegs, lenSegs);
  // Rotate PlaneGeometry (XY -> XZ) so length goes along +Z (v=1 at tip, v=0 at base)
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, length * 0.5);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, z / length));
    // Graceful parabolic botanical arch + slight V-fold away from central rachis
    const archY = Math.sin(t * Math.PI * 0.65) * 0.42 - t * t * 1.65;
    const vFold = -Math.abs(x) * 0.16;
    pos.setY(i, archY + vFold);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Build 3-blade radiating conifer bough star geometry for natural pine silhouette & dappled shadows
function buildPineTierGeometry(): THREE.BufferGeometry {
  const planes = 4;
  const width = 2.4;
  const height = 1.65;
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < planes; p++) {
    const yaw = (p / planes) * Math.PI * 2;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    // Slightly tilted outward bough fan
    const baseIdx = p * 4;
    const hw = width * 0.5;

    // 4 corners: bottom-left, bottom-right, top-left, top-right (apex narrowed slightly)
    const localPts: Array<[number, number, number, number, number]> = [
      [-hw * 0.55, 0.0, 0.35, 0, 0],
      [hw * 0.55, 0.0, 0.35, 1, 0],
      [-hw * 0.45, height, -0.35, 0, 1],
      [hw * 0.45, height, -0.35, 1, 1],
    ];

    for (const [lx, ly, lz, u, v] of localPts) {
      const wx = lx * cosY + lz * sinY;
      const wz = -lx * sinY + lz * cosY;
      verts.push(wx, ly, wz);
      uvs.push(u, v);
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
  }

  // Add subtle top skirt cone-like angled caps for fullness when viewed from above
  const capOffset = planes * 4;
  for (let q = 0; q < 2; q++) {
    const yaw = q * (Math.PI / 2) + Math.PI / 4;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const hw = width * 0.52;
    const pts: Array<[number, number, number, number, number]> = [
      [-hw, 0.28, -hw * 0.42, 0, 0],
      [hw, 0.28, -hw * 0.42, 1, 0],
      [-hw * 0.72, 0.85, hw * 0.42, 0, 1],
      [hw * 0.72, 0.85, hw * 0.42, 1, 1],
    ];
    const b = capOffset + q * 4;
    for (const [lx, ly, lz, u, v] of pts) {
      verts.push(lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY);
      uvs.push(u, v);
    }
    indices.push(b, b + 1, b + 2);
    indices.push(b + 1, b + 3, b + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build crossed 3-card tapered grass tuft geometry anchored cleanly at y=0
function buildGrassTuftGeometry(): THREE.BufferGeometry {
  const blades = 3;
  const w = 1.15;
  const h = 0.82;
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let b = 0; b < blades; b++) {
    const yaw = (b / blades) * Math.PI;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const hw = w * 0.5;
    const base = b * 4;

    // Slight outward lean at top for volume from overhead chase camera
    const lean = (b % 2 === 0 ? 1 : -1) * 0.14;
    const corners: Array<[number, number, number, number, number]> = [
      [-hw, 0, 0, 0, 0],
      [hw, 0, 0, 1, 0],
      [-hw * 1.06, h, lean, 0, 1],
      [hw * 1.06, h, lean, 1, 1],
    ];
    for (const [lx, ly, lz, u, v] of corners) {
      verts.push(lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build volumetric multi-card broadleaf canopy dome for Jungle Rain Trees, Shrubs & Blossom Trees
function buildBroadleafCanopyGeometry(): THREE.BufferGeometry {
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let idxOffset = 0;

  // 4 intersecting angled upright/tilted planes around crown center
  for (let p = 0; p < 4; p++) {
    const yaw = (p / 4) * Math.PI + 0.25;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const r = 1.55;
    const h0 = -0.55;
    const h1 = 1.25;
    const tilt = (p % 2 === 0 ? 1 : -1) * 0.28;
    const pts: Array<[number, number, number, number, number]> = [
      [-r, h0, -tilt, 0, 0],
      [r, h0, -tilt, 1, 0],
      [-r * 0.92, h1, tilt, 0, 1],
      [r * 0.92, h1, tilt, 1, 1],
    ];
    for (const [lx, ly, lz, u, v] of pts) {
      verts.push(lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY);
      uvs.push(u, v);
    }
    indices.push(idxOffset, idxOffset + 1, idxOffset + 2);
    indices.push(idxOffset + 1, idxOffset + 3, idxOffset + 2);
    idxOffset += 4;
  }

  // 2 horizontal/domed upper umbrella caps so canopy looks dense from chase camera
  for (let c = 0; c < 2; c++) {
    const yaw = c * (Math.PI / 2) + 0.35;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const r = 1.65;
    const yBase = 0.28 + c * 0.28;
    const pts: Array<[number, number, number, number, number]> = [
      [-r, yBase, -r * 0.85, 0, 0],
      [r, yBase, -r * 0.85, 1, 0],
      [-r * 0.85, yBase + 0.45, r * 0.85, 0, 1],
      [r * 0.85, yBase + 0.45, r * 0.85, 1, 1],
    ];
    for (const [lx, ly, lz, u, v] of pts) {
      verts.push(lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY);
      uvs.push(u, v);
    }
    indices.push(idxOffset, idxOffset + 1, idxOffset + 2);
    indices.push(idxOffset + 1, idxOffset + 3, idxOffset + 2);
    idxOffset += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build tall narrow columnar plume geometry for Coastal Cypress & Eucalyptus
function buildCypressPlumeGeometry(): THREE.BufferGeometry {
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const planes = 3;
  const hw = 1.05;
  const height = 4.2;

  for (let p = 0; p < planes; p++) {
    const yaw = (p / planes) * Math.PI;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const base = p * 4;
    const pts: Array<[number, number, number, number, number]> = [
      [-hw, 0, 0, 0, 0],
      [hw, 0, 0, 1, 0],
      [-hw * 0.85, height, 0, 0, 1],
      [hw * 0.85, height, 0, 1, 1],
    ];
    for (const [lx, ly, lz, u, v] of pts) {
      verts.push(lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Build 6-frond radiating Giant Tropical Jungle Fern rosette anchored at y=0
function buildJungleFernGeometry(): THREE.BufferGeometry {
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const fronds = 6;
  const hw = 0.62;
  const len = 1.65;

  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + (f % 2) * 0.14;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const base = f * 4;
    const tipY = 0.72 + (f % 2) * 0.24;
    const pts: Array<[number, number, number, number, number]> = [
      [-hw * 0.35, 0.04, 0.06, 0, 0],
      [hw * 0.35, 0.04, 0.06, 1, 0],
      [-hw, tipY, len, 0, 1],
      [hw, tipY, len, 1, 1],
    ];
    for (const [lx, ly, lz, u, v] of pts) {
      verts.push(lx * cosY + lz * sinY, ly, -lx * sinY + lz * cosY);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function attachWindSway(
  material: THREE.MeshStandardMaterial,
  windUniform: { value: number },
  mode: 'grass' | 'palm' | 'pine',
  playerPosUniform?: { value: THREE.Vector2 },
  cullRange?: [number, number],
): void {
  const hasCull = Boolean(playerPosUniform && cullRange);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    if (hasCull && playerPosUniform && cullRange) {
      shader.uniforms.uPlayerXZ = playerPosUniform;
      shader.uniforms.uCullRange = { value: new THREE.Vector2(cullRange[0], cullRange[1]) };
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWindTime;
         ${hasCull ? 'uniform vec2 uPlayerXZ; uniform vec2 uCullRange;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           #ifdef USE_INSTANCING
             vec4 wOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             float phase = wOrigin.x * 0.13 + wOrigin.z * 0.11 + uWindTime * 2.05;
             ${
               hasCull
                 ? `float dPlayer = distance(wOrigin.xz, uPlayerXZ);
                    float dScale = 1.0 - smoothstep(uCullRange.x, uCullRange.y, dPlayer);
                    if (dScale <= 0.01) {
                      transformed = vec3(0.0);
                    } else {
                      transformed *= dScale;`
                 : ''
             }
           #else
             float phase = uWindTime * 2.05;
           #endif
           ${
             mode === 'grass'
               ? `float w = clamp(transformed.y / 0.82, 0.0, 1.0);
                  float sway = (sin(phase) * 0.14 + sin(phase * 2.3 + 0.9) * 0.045) * w * w;
                  transformed.x += sway;
                  transformed.z += cos(phase * 0.85) * 0.075 * w * w;`
               : mode === 'palm'
                 ? `float w = clamp(transformed.z / 4.9, 0.0, 1.0);
                    float sway = (sin(phase * 0.72) * 0.24 + cos(phase * 1.45) * 0.08) * w * w;
                    transformed.y += sway * 0.7;
                    transformed.x += sway * 0.45;`
                 : `float w = clamp(length(transformed.xz) / 1.35, 0.0, 1.0);
                    float sway = sin(phase * 0.65) * 0.08 * w;
                    transformed.x += sway;
                    transformed.z += cos(phase * 0.55) * 0.06 * w;`
           }
           ${hasCull ? '#ifdef USE_INSTANCING\n}\n#endif' : ''}
         }`,
      );
  };
  material.customProgramCacheKey = () =>
    `wind_${mode}_${hasCull && cullRange ? `${cullRange[0]}_${cullRange[1]}` : 'all'}`;
}

// Partition static instanced world foliage into a 3x3 spatial grid so camera & shadow frustum culling skip off-screen chunks
function createSpatialChunkInstanced<T extends { x: number; z: number }>(
  worldGroup: THREE.Group,
  items: T[],
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  instancesPerItem: number,
  castShadow: boolean,
  receiveShadow: boolean,
  writeItem: (item: T, itemIdx: number, pushInstance: (matrix: THREE.Matrix4, color?: THREE.Color) => void) => void,
): void {
  if (items.length === 0) return;
  const gridN = 3;
  const buckets: number[][] = Array.from({ length: gridN * gridN }, () => []);
  const span = WORLD_HALF_SIZE * 2;
  for (let i = 0; i < items.length; i++) {
    const gx = THREE.MathUtils.clamp(Math.floor(((items[i].x + WORLD_HALF_SIZE) / span) * gridN), 0, gridN - 1);
    const gz = THREE.MathUtils.clamp(Math.floor(((items[i].z + WORLD_HALF_SIZE) / span) * gridN), 0, gridN - 1);
    buckets[gz * gridN + gx].push(i);
  }

  for (const bucket of buckets) {
    if (bucket.length === 0) continue;
    const inst = new THREE.InstancedMesh(geo, mat, bucket.length * instancesPerItem);
    inst.castShadow = castShadow;
    inst.receiveShadow = receiveShadow;
    let cursor = 0;
    let hasColor = false;
    const pushInstance = (matrix: THREE.Matrix4, color?: THREE.Color) => {
      inst.setMatrixAt(cursor, matrix);
      if (color) {
        inst.setColorAt(cursor, color);
        hasColor = true;
      }
      cursor++;
    };
    for (let k = 0; k < bucket.length; k++) {
      const idx = bucket[k];
      writeItem(items[idx], idx, pushInstance);
    }
    inst.count = cursor;
    inst.instanceMatrix.needsUpdate = true;
    if (hasColor && inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    worldGroup.add(inst);
  }
}

export function buildRealFumaWorld(
  textures: ProceduralTexturePack,
): BuiltWorld {
  const worldGroup = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const dummy = new THREE.Object3D();
  const tmpInstanceColor = new THREE.Color();
  const windUniform = { value: 0 };
  const playerPosUniform = { value: new THREE.Vector2(0, 0) };

  // 1. Road-Carved Peninsula Terrain (~10.5m grid resolution + normal relief)
  const terrainSize = WORLD_HALF_SIZE * 2;
  const segs = 172;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const tmpColor = new THREE.Color();
  const rockColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getTerrainHeight(x, z);
    posAttr.setY(i, y);

    const hx = getTerrainHeight(x + 7, z);
    const hz = getTerrainHeight(x, z + 7);
    const slope = Math.hypot(hx - y, hz - y) / 7;

    if (y < 0.75) {
      tmpColor.set('#dec296'); // Sunlit coastal sand & underwater shoals
    } else if (y > 52) {
      tmpColor.set('#e2e8f0'); // High alpine snow crests well above road
    } else if (x < 60 && z < -280) {
      // Palm Canyon & Tropical Jungle Floor: deep rainforest emerald moss & dark loam
      tmpColor.set('#224f23');
      if (slope > 0.21 || y > 26) {
        rockColor.set('#5a5143');
        tmpColor.lerp(
          rockColor,
          Math.min(0.84, (slope - 0.16) * 2.5 + Math.max(0, y - 26) * 0.04),
        );
      }
    } else if (x < -140 && z > -460 && z < 440) {
      // Sunset Coast lush tropical green + coastal sandstone bluffs
      tmpColor.set('#376e30');
      if (slope > 0.18 || y > 15) {
        rockColor.set('#8c7355');
        tmpColor.lerp(
          rockColor,
          Math.min(0.88, (slope - 0.13) * 2.6 + Math.max(0, y - 15) * 0.045),
        );
      }
    } else if (z > 120 && x > 180) {
      // Fujimi Harbor green coastal promenade
      tmpColor.set('#37643b');
      if (slope > 0.18) {
        rockColor.set('#64748b');
        tmpColor.lerp(rockColor, 0.5);
      }
    } else {
      // Alpine Pine Pass forest floor & granite peaks
      tmpColor.set('#2c5231');
      if (slope > 0.17 || y > 31) {
        rockColor.set('#5a626b');
        tmpColor.lerp(
          rockColor,
          Math.min(0.88, (slope - 0.13) * 2.5 + Math.max(0, y - 31) * 0.05),
        );
      }
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: textures.terrainDetailMap,
    normalMap: textures.terrainNormalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.9,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 2. Seamless Closed-Loop 720-Station Asphalt Ribbon + PBR Normal & Roughness Maps
  const asphaltRoadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltMap,
    normalMap: textures.asphaltNormalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: textures.asphaltRoughnessMap,
    roughness: 0.68,
    metalness: 0.1,
    envMapIntensity: 0.94,
  });
  const shoulderSkirtMat = new THREE.MeshStandardMaterial({
    map: textures.concreteCurbMap,
    color: 0x94a3b8,
    roughness: 0.85,
    metalness: 0.08,
  });

  const deckGeo = buildContinuousRibbonGeometry(
    TRACK_STATION_COUNT,
    (idx, col) => {
      const st = TRACK_STATIONS[idx];
      const hw = st.roadWidth * 0.5;
      const lat = col === 0 ? -hw : hw;
      return {
        x: st.x + st.rx * lat,
        y: st.y + lat * Math.sin(st.bankRad),
        z: st.z + st.rz * lat,
        u: col === 0 ? 0 : 1,
        v: (idx / TRACK_STATION_COUNT) * (TRACK_LENGTH_M / 18),
      };
    },
    2,
  );
  const deckMesh = new THREE.Mesh(deckGeo, asphaltRoadMat);
  deckMesh.receiveShadow = true;
  worldGroup.add(deckMesh);
  disposables.push(deckGeo, asphaltRoadMat);

  // Continuous Concrete Shoulder Aprons & Underside Edge Skirts (left & right)
  for (const side of [-1, 1]) {
    const skirtGeo = buildContinuousRibbonGeometry(
      TRACK_STATION_COUNT,
      (idx, col) => {
        const st = TRACK_STATIONS[idx];
        const hw = st.roadWidth * 0.5;
        const innerLat = side * hw;
        const outerLat = side * (hw + 0.85);
        const dropLat = side * (hw + 1.05);
        const sSinB = Math.sin(st.bankRad);
        const v = (idx / TRACK_STATION_COUNT) * (TRACK_LENGTH_M / 12);

        if (col === 0) {
          const lat = side === -1 ? dropLat : innerLat;
          const dy = side === -1 ? -0.75 : -0.02;
          return { x: st.x + st.rx * lat, y: st.y + lat * sSinB + dy, z: st.z + st.rz * lat, u: 0, v };
        }
        if (col === 1) {
          return { x: st.x + st.rx * outerLat, y: st.y + outerLat * sSinB + 0.04, z: st.z + st.rz * outerLat, u: 0.5, v };
        }
        const lat = side === -1 ? innerLat : dropLat;
        const dy = side === -1 ? -0.02 : -0.75;
        return { x: st.x + st.rx * lat, y: st.y + lat * sSinB + dy, z: st.z + st.rz * lat, u: 1, v };
      },
      3,
    );
    const skirtMesh = new THREE.Mesh(skirtGeo, shoulderSkirtMat);
    skirtMesh.receiveShadow = true;
    worldGroup.add(skirtMesh);
    disposables.push(skirtGeo);
  }
  disposables.push(shoulderSkirtMat);

  // 3. FIA Red-and-White Apex Curbs on Switchback & Canyon Turns
  const fiaCurbMat = new THREE.MeshStandardMaterial({
    map: textures.curbMap,
    roughness: 0.65,
    metalness: 0.06,
  });
  for (const side of [-1, 1]) {
    const curbGeo = buildContinuousRibbonGeometry(
      TRACK_STATION_COUNT,
      (idx, col) => {
        const st = TRACK_STATIONS[idx];
        const active = side === -1 ? st.hasCurbLeft : st.hasCurbRight;
        const hw = st.roadWidth * 0.5;
        const lat = side * (hw - (col === 0 ? 0.65 : -0.15));
        const yOff = active ? 0.055 : -0.55;
        return {
          x: st.x + st.rx * lat,
          y: st.y + lat * Math.sin(st.bankRad) + yOff,
          z: st.z + st.rz * lat,
          u: col === 0 ? 0 : 1,
          v: (idx / TRACK_STATION_COUNT) * (TRACK_LENGTH_M / 4.5),
        };
      },
      2,
    );
    const curbMesh = new THREE.Mesh(curbGeo, fiaCurbMat);
    curbMesh.receiveShadow = true;
    worldGroup.add(curbMesh);
    disposables.push(curbGeo);
  }
  disposables.push(fiaCurbMat);

  // 4. Continuous Armco Steel Guardrails + Galvanized Posts Along Both Edges
  const guardrailMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee9,
    metalness: 0.68,
    roughness: 0.36,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const railGeo = buildContinuousRibbonGeometry(
      TRACK_STATION_COUNT,
      (idx, col) => {
        const st = TRACK_STATIONS[idx];
        const lat = side * (st.roadWidth * 0.5 + 0.52);
        const baseY = st.y + lat * Math.sin(st.bankRad);
        const hidden = side === -1 && st.zoneId === 'sunset_coast';
        const h = hidden ? (col === 0 ? -1.4 : -1.1) : (col === 0 ? 0.44 : 0.78);
        return {
          x: st.x + st.rx * lat,
          y: baseY + h,
          z: st.z + st.rz * lat,
          u: col,
          v: idx / 10,
        };
      },
      2,
    );
    const railMesh = new THREE.Mesh(railGeo, guardrailMat);
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    worldGroup.add(railMesh);
    disposables.push(railGeo);
  }

  const postStep = 3;
  const postCount = Math.floor(TRACK_STATION_COUNT / postStep) * 2;
  const postGeo = new THREE.BoxGeometry(0.16, 0.92, 0.16);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.7,
    roughness: 0.4,
  });
  const postInst = new THREE.InstancedMesh(postGeo, postMat, postCount);
  postInst.castShadow = true;
  postInst.receiveShadow = true;
  let pIdx = 0;
  for (let i = 0; i < TRACK_STATION_COUNT; i += postStep) {
    const st = TRACK_STATIONS[i];
    const yaw = Math.atan2(st.tx, st.tz);
    for (const side of [-1, 1]) {
      if (side === -1 && st.zoneId === 'sunset_coast') continue;
      const lat = side * (st.roadWidth * 0.5 + 0.62);
      const y = st.y + lat * Math.sin(st.bankRad) + 0.42;
      dummy.position.set(st.x + st.rx * lat, y, st.z + st.rz * lat);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(pIdx++, dummy.matrix);
    }
  }
  postInst.count = pIdx;
  postInst.instanceMatrix.needsUpdate = true;
  postInst.computeBoundingSphere();
  worldGroup.add(postInst);
  disposables.push(guardrailMat, postGeo, postMat);

  // 5. Fujimi Bay Suspension Bridge Towers, Cables & Deck Soffit
  const bridgeConcreteMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.42,
    metalness: 0.25,
  });
  const bridgeAccentMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.38,
    metalness: 0.45,
  });
  const cableMat = new THREE.LineBasicMaterial({ color: 0xcbd5e1 });

  const towerGeo = new THREE.BoxGeometry(2.4, 52, 2.4);
  const pylonS = [0.815, 0.875];
  for (const ps of pylonS) {
    const pt = getRoadPointAt(ps, 0);
    const yaw = pt.heading;
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(pt.x, 0, pt.z);
    pylonGroup.rotation.y = yaw;

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(towerGeo, bridgeConcreteMat);
      leg.position.set(side * 10.6, pt.y + 15, 0);
      leg.castShadow = true;
      leg.receiveShadow = true;
      pylonGroup.add(leg);
    }
    const topCross = new THREE.Mesh(new THREE.BoxGeometry(23.5, 2.6, 2.6), bridgeAccentMat);
    topCross.position.set(0, pt.y + 39, 0);
    topCross.castShadow = true;
    const midCross = new THREE.Mesh(new THREE.BoxGeometry(22.5, 2.0, 2.2), bridgeConcreteMat);
    midCross.position.set(0, pt.y + 23, 0);
    midCross.castShadow = true;
    pylonGroup.add(topCross, midCross);
    worldGroup.add(pylonGroup);

    const cablePts: number[] = [];
    for (let c = -5; c <= 5; c++) {
      if (c === 0) continue;
      const targetS = ps + c * 0.0085;
      for (const side of [-1, 1]) {
        const anchor = getRoadPointAt(targetS, side * 9.4);
        const topWorld = new THREE.Vector3(side * 10.6, pt.y + 38, 0)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
          .add(new THREE.Vector3(pt.x, 0, pt.z));
        cablePts.push(topWorld.x, topWorld.y, topWorld.z, anchor.x, anchor.y + 0.6, anchor.z);
      }
    }
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
    worldGroup.add(new THREE.LineSegments(cableGeo, cableMat));
    disposables.push(cableGeo);
  }
  disposables.push(bridgeConcreteMat, bridgeAccentMat, cableMat, towerGeo);

  // 6. Alpine Pass Stone Tunnel Gallery (s in [0.49, 0.52])
  const tunnelArchMat = new THREE.MeshStandardMaterial({
    color: 0x3f4752,
    roughness: 0.88,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const tunnelArchGeo = new THREE.CylinderGeometry(11.2, 11.8, 12, 14, 1, true, 0, Math.PI);
  tunnelArchGeo.rotateZ(Math.PI / 2);
  tunnelArchGeo.rotateY(Math.PI / 2);
  const tunnelStartIdx = Math.floor(0.49 * TRACK_STATION_COUNT);
  const tunnelEndIdx = Math.floor(0.52 * TRACK_STATION_COUNT);
  for (let i = tunnelStartIdx; i <= tunnelEndIdx; i += 2) {
    const st = TRACK_STATIONS[i];
    const arch = new THREE.Mesh(tunnelArchGeo, tunnelArchMat);
    arch.position.set(st.x, st.y - 0.5, st.z);
    arch.rotation.y = Math.atan2(st.tx, st.tz);
    arch.castShadow = true;
    arch.receiveShadow = true;
    worldGroup.add(arch);
  }
  disposables.push(tunnelArchGeo, tunnelArchMat);

  // 7. Sleek Multi-Tiered Fujimi Harbor Glass Towers (with nocturnal emissive window glow)
  const bldgSpecs: Array<{ x: number; z: number; w: number; d: number; h: number }> = [
    { x: 245, z: 220, w: 34, d: 34, h: 118 },
    { x: 300, z: 185, w: 30, d: 28, h: 96 },
    { x: 185, z: 205, w: 28, d: 30, h: 88 },
    { x: 340, z: 255, w: 32, d: 30, h: 132 },
    { x: 270, z: 115, w: 34, d: 28, h: 82 },
    { x: 205, z: 130, w: 28, d: 28, h: 74 },
    { x: 145, z: 155, w: 26, d: 26, h: 66 },
    { x: 355, z: 135, w: 32, d: 32, h: 105 },
    { x: 380, z: 65, w: 28, d: 28, h: 78 },
    { x: 315, z: 45, w: 28, d: 28, h: 92 },
    { x: 240, z: 55, w: 30, d: 28, h: 68 },
    { x: 170, z: 75, w: 26, d: 26, h: 58 },
  ];

  const podiumGeo = new THREE.BoxGeometry(1, 1, 1);
  const podiumMat = new THREE.MeshStandardMaterial({ color: 0x1e2532, roughness: 0.78, metalness: 0.25 });
  const shaftGeo = new THREE.BoxGeometry(1, 1, 1);
  const shaftMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.buildingFacadeMap,
    emissive: 0xffdfad,
    emissiveMap: textures.buildingEmissiveMap,
    emissiveIntensity: 0.05,
    roughness: 0.22,
    metalness: 0.65,
    clearcoat: 0.35,
    clearcoatRoughness: 0.26,
    envMapIntensity: 0.6,
  });
  const crownGeo = new THREE.BoxGeometry(1, 1, 1);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c3648, roughness: 0.45, metalness: 0.72 });

  const podiumInst = new THREE.InstancedMesh(podiumGeo, podiumMat, bldgSpecs.length);
  const shaftInst = new THREE.InstancedMesh(shaftGeo, shaftMat, bldgSpecs.length);
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, bldgSpecs.length * 2);
  podiumInst.castShadow = true;
  podiumInst.receiveShadow = true;
  shaftInst.castShadow = true;
  shaftInst.receiveShadow = true;
  crownInst.castShadow = true;

  const glassTints = [0xcbd5e1, 0x93c5fd, 0x99f6e4, 0xdbeafe, 0xd6d3d1];
  bldgSpecs.forEach((b, idx) => {
    const baseY = Math.max(0, getTerrainHeight(b.x, b.z) - 2);
    const podiumH = Math.min(14, b.h * 0.2);
    const shaftH = b.h - podiumH;
    const crownH = Math.max(6, b.h * 0.14);

    dummy.position.set(b.x, baseY + podiumH * 0.5, b.z);
    dummy.scale.set(b.w * 1.12, podiumH, b.d * 1.12);
    dummy.rotation.set(0, 0.18 * (idx % 3), 0);
    dummy.updateMatrix();
    podiumInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(b.x, baseY + podiumH + shaftH * 0.5, b.z);
    dummy.scale.set(b.w * 0.94, shaftH, b.d * 0.94);
    dummy.updateMatrix();
    shaftInst.setMatrixAt(idx, dummy.matrix);
    shaftInst.setColorAt(idx, new THREE.Color(glassTints[idx % glassTints.length]));

    dummy.position.set(b.x, baseY + podiumH + shaftH + crownH * 0.5, b.z);
    dummy.scale.set(b.w * 0.72, crownH, b.d * 0.72);
    dummy.updateMatrix();
    crownInst.setMatrixAt(idx * 2, dummy.matrix);

    dummy.position.set(b.x, baseY + podiumH + shaftH + crownH + 4, b.z);
    dummy.scale.set(b.w * 0.32, 8, b.d * 0.32);
    dummy.updateMatrix();
    crownInst.setMatrixAt(idx * 2 + 1, dummy.matrix);
  });
  podiumInst.instanceMatrix.needsUpdate = true;
  shaftInst.instanceMatrix.needsUpdate = true;
  if (shaftInst.instanceColor) shaftInst.instanceColor.needsUpdate = true;
  crownInst.instanceMatrix.needsUpdate = true;
  podiumInst.computeBoundingSphere();
  shaftInst.computeBoundingSphere();
  crownInst.computeBoundingSphere();
  worldGroup.add(podiumInst, shaftInst, crownInst);
  disposables.push(podiumGeo, podiumMat, shaftGeo, shaftMat, crownGeo, crownMat);

  // 8. Sculpted Roadside Coastal Palms (Textured Bark + Normal + Feathered Alpha-Cutout Fronds + Wind Sway)
  const palmSpots: Array<{ x: number; y: number; z: number; s: number; lean: number }> = [];
  for (let i = 0; i < 105; i++) {
    const s = 0.012 + (i / 105) * 0.43;
    const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
    const side = i % 2 === 0 ? -1 : 1;
    const dist = st.roadWidth * 0.5 + 8.0 + (i % 5) * 4.8;
    const px = st.x + st.rx * (side * dist);
    const pz = st.z + st.rz * (side * dist);
    const proj = projectOntoTrack(px, pz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 4.2) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 0.25) continue;
    palmSpots.push({ x: px, y: py, z: pz, s: 0.86 + (i % 5) * 0.12, lean: side * (0.12 + (i % 3) * 0.03) });
  }
  if (palmSpots.length > 0) {
    // Organic curved tapered trunk
    const pTrunkGeo = new THREE.CylinderGeometry(0.19, 0.43, 10.6, 10, 5);
    const ptPos = pTrunkGeo.attributes.position;
    for (let i = 0; i < ptPos.count; i++) {
      const py = ptPos.getY(i); // -5.3..5.3
      const t = Math.max(0, Math.min(1, (py + 5.3) / 10.6));
      ptPos.setX(i, ptPos.getX(i) + Math.pow(t, 1.8) * 0.65);
    }
    ptPos.needsUpdate = true;
    pTrunkGeo.computeVertexNormals();
    pTrunkGeo.computeBoundingSphere();

    const pTrunkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: 0xa68663,
      roughness: 0.9,
    });

    const frondGeo = buildArchedPalmFrondGeometry();
    const frondMat = new THREE.MeshStandardMaterial({
      map: textures.palmFrondMap,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.02,
    });
    attachWindSway(frondMat, windUniform, 'palm');

    const coconutGeo = new THREE.SphereGeometry(0.24, 7, 6);
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.85 });

    const frondsPerTree = 11;
    createSpatialChunkInstanced(worldGroup, palmSpots, pTrunkGeo, pTrunkMat, 1, true, true, (p, idx, push) => {
      const yawTree = idx * 0.72;
      dummy.position.set(p.x, p.y + 5.1 * p.s, p.z);
      dummy.rotation.set(0, yawTree, -p.lean * 0.75);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      push(dummy.matrix);
    });
    createSpatialChunkInstanced(worldGroup, palmSpots, coconutGeo, coconutMat, 3, false, false, (p, idx, push) => {
      const yawTree = idx * 0.72;
      const topX = p.x + Math.cos(-yawTree) * 0.65 * p.s + Math.sin(p.lean) * 1.15;
      const topZ = p.z + Math.sin(-yawTree) * 0.65 * p.s;
      const topY = p.y + 10.2 * p.s;
      for (let c = 0; c < 3; c++) {
        const ca = (c / 3) * Math.PI * 2 + idx;
        dummy.position.set(topX + Math.cos(ca) * 0.25, topY - 0.35, topZ + Math.sin(ca) * 0.25);
        dummy.rotation.set(0, ca, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        push(dummy.matrix);
      }
    });
    createSpatialChunkInstanced(worldGroup, palmSpots, frondGeo, frondMat, frondsPerTree, true, true, (p, idx, push) => {
      const yawTree = idx * 0.72;
      const topX = p.x + Math.cos(-yawTree) * 0.65 * p.s + Math.sin(p.lean) * 1.15;
      const topZ = p.z + Math.sin(-yawTree) * 0.65 * p.s;
      const topY = p.y + 10.2 * p.s;
      for (let f = 0; f < frondsPerTree; f++) {
        const tier = f < 5 ? 0 : 1;
        const yaw = (f / frondsPerTree) * Math.PI * 2 + idx * 0.55;
        const pitch = tier === 0 ? -0.18 + (f % 2) * 0.12 : 0.14 + (f % 3) * 0.1;
        dummy.position.set(topX, topY - tier * 0.18, topZ);
        dummy.rotation.set(pitch, yaw, 0, 'YXZ');
        const fs = p.s * (tier === 0 ? 0.88 : 1.04);
        dummy.scale.set(fs, fs, fs);
        dummy.updateMatrix();
        push(dummy.matrix, tmpInstanceColor.setHSL(0.26 + (f % 3) * 0.018, 0.52, 0.56 + (f % 2) * 0.12));
      }
    });
    disposables.push(pTrunkGeo, pTrunkMat, frondGeo, frondMat, coconutGeo, coconutMat);
  }

  // 9. Alpine Conifer Pine Groves (Textured Bark + Alpha-Cutout Needle Boughs + Dappled Shadows)
  const pineSpots: Array<{ x: number; y: number; z: number; s: number }> = [];
  for (let i = 0; i < 310; i++) {
    const angle = i * 2.39996;
    const rad = 52 + (i % 62) * 9.5;
    const px = 220 + Math.cos(angle) * rad;
    const pz = -260 + Math.sin(angle) * rad;
    const proj = projectOntoTrack(px, pz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 10.5) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 2.2 || py > 50) continue;
    pineSpots.push({ x: px, y: py, z: pz, s: 0.9 + (i % 5) * 0.16 });
  }
  if (pineSpots.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.45, 7.6, 8);
    const trunkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(1.3, 1.3),
      color: 0x6b4b34,
      roughness: 0.94,
    });
    const boughGeo = buildPineTierGeometry();
    const foliageMat = new THREE.MeshStandardMaterial({
      map: textures.pineBoughMap,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.02,
    });
    attachWindSway(foliageMat, windUniform, 'pine');

    const tiers = 4;
    createSpatialChunkInstanced(worldGroup, pineSpots, trunkGeo, trunkMat, 1, true, true, (p, idx, push) => {
      dummy.position.set(p.x, p.y + 3.6 * p.s, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.updateMatrix();
      push(dummy.matrix);
    });
    createSpatialChunkInstanced(worldGroup, pineSpots, boughGeo, foliageMat, tiers, true, true, (p, idx, push) => {
      tmpInstanceColor.setHSL(
        0.32 + (idx % 4) * 0.015,
        0.44,
        0.52 + (idx % 3) * 0.09,
      );
      for (let t = 0; t < tiers; t++) {
        const w = (2.8 - t * 0.56) * p.s;
        const h = (3.4 - t * 0.42) * p.s;
        dummy.position.set(p.x, p.y + (2.5 + t * 2.0) * p.s, p.z);
        dummy.scale.set(w, h, w);
        dummy.rotation.set(0, idx * 0.9 + t * 0.78, 0);
        dummy.updateMatrix();
        push(dummy.matrix, tmpInstanceColor);
      }
    });
    disposables.push(trunkGeo, trunkMat, boughGeo, foliageMat);
  }

  // 9b. Dense Tropical Jungle Biome (Palm Canyon & Foothills: Giant Banyan Rain Trees + Shrubs + Ferns)
  const jungleSpots: Array<{ x: number; y: number; z: number; s: number; yaw: number }> = [];
  for (let i = 0; i < 340 && jungleSpots.length < 220; i++) {
    let jx = 0;
    let jz = 0;
    if (i < 175) {
      // Dense overhanging rainforest corridor framing Palm Canyon & northern coastal foothills
      const s = 0.2 + ((i * 13) % 175) / 175 * 0.295;
      const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
      if (st.hasTunnel || st.isBridge) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const dist = st.roadWidth * 0.5 + 8.5 + ((i * 29) % 100) * 0.65;
      jx = st.x + st.rx * (side * dist) + Math.sin(i * 1.9) * 3.0;
      jz = st.z + st.rz * (side * dist) + Math.cos(i * 2.7) * 3.0;
    } else {
      // Deep interior jungle basin & valley canopy clusters
      const k = i - 175;
      const a = k * 2.399963;
      const rad = 28 + Math.sqrt(k / 165) * 235;
      jx = -225 + Math.cos(a) * rad;
      jz = -345 + Math.sin(a) * rad;
    }

    if (Math.abs(jx) > WORLD_HALF_SIZE - 35 || Math.abs(jz) > WORLD_HALF_SIZE - 35) continue;
    const py = getTerrainHeight(jx, jz);
    if (py < 1.2 || py > 36) continue;

    const proj = projectOntoTrack(jx, jz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 7.2) continue;

    jungleSpots.push({
      x: jx,
      y: py,
      z: jz,
      s: 0.92 + (i % 7) * 0.14,
      yaw: (i * 1.47) % (Math.PI * 2),
    });
  }

  if (jungleSpots.length > 0) {
    // Fluted banyan / rain-tree trunk with curved upper lean
    const jTrunkGeo = new THREE.CylinderGeometry(0.32, 0.78, 9.6, 9, 5);
    const jtPos = jTrunkGeo.attributes.position;
    for (let i = 0; i < jtPos.count; i++) {
      const py = jtPos.getY(i);
      const t = Math.max(0, Math.min(1, (py + 4.8) / 9.6));
      jtPos.setX(i, jtPos.getX(i) + Math.sin(t * Math.PI * 0.85) * 0.55);
    }
    jtPos.needsUpdate = true;
    jTrunkGeo.computeVertexNormals();
    jTrunkGeo.computeBoundingSphere();

    const jTrunkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      color: 0x5c4738,
      roughness: 0.92,
    });

    const canopyGeo = buildBroadleafCanopyGeometry();
    const jungleCanopyMat = new THREE.MeshStandardMaterial({
      map: textures.jungleLeafMap,
      alphaTest: 0.38,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.02,
    });
    attachWindSway(jungleCanopyMat, windUniform, 'pine');

    const clustersPerTree = 4;
    const clusterOffsets: Array<[number, number, number, number]> = [
      [0, 9.4, 0, 2.25],
      [-2.3, 8.2, 1.4, 1.78],
      [2.2, 8.4, 1.1, 1.85],
      [0.2, 8.0, -2.2, 1.82],
    ];

    createSpatialChunkInstanced(worldGroup, jungleSpots, jTrunkGeo, jTrunkMat, 1, true, true, (j, _idx, push) => {
      dummy.position.set(j.x, j.y + 4.5 * j.s, j.z);
      dummy.rotation.set(0, j.yaw, 0);
      dummy.scale.set(j.s, j.s, j.s);
      dummy.updateMatrix();
      push(dummy.matrix);
    });
    createSpatialChunkInstanced(worldGroup, jungleSpots, canopyGeo, jungleCanopyMat, clustersPerTree, true, true, (j, idx, push) => {
      const cosY = Math.cos(j.yaw);
      const sinY = Math.sin(j.yaw);
      for (let c = 0; c < clustersPerTree; c++) {
        const [ox, oy, oz, cs] = clusterOffsets[c];
        const wx = j.x + (ox * cosY + oz * sinY) * j.s;
        const wz = j.z + (-ox * sinY + oz * cosY) * j.s;
        dummy.position.set(wx, j.y + oy * j.s, wz);
        dummy.rotation.set(0, j.yaw + c * 1.15, 0);
        dummy.scale.set(j.s * cs, j.s * cs * 0.78, j.s * cs);
        dummy.updateMatrix();
        push(dummy.matrix, tmpInstanceColor.setHSL(0.28 + ((idx + c) % 4) * 0.016, 0.48, 0.44 + ((idx + c) % 3) * 0.08));
      }
    });
    disposables.push(jTrunkGeo, jTrunkMat, canopyGeo, jungleCanopyMat);

    // Dense Jungle Understory Shrubs & Bushes (580 distance-culled instances)
    const bushSpots: Array<{ x: number; y: number; z: number; s: number; yaw: number }> = [];
    for (let i = 0; i < 900 && bushSpots.length < 580; i++) {
      const s = 0.18 + ((i * 17) % 1000) / 1000 * 0.34;
      const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
      if (st.hasTunnel || st.isBridge) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const dist = st.roadWidth * 0.5 + 4.4 + ((i * 41) % 100) * 0.52;
      const bx = st.x + st.rx * (side * dist) + Math.sin(i * 2.1) * 2.4;
      const bz = st.z + st.rz * (side * dist) + Math.cos(i * 1.7) * 2.4;
      if (Math.abs(bx) > WORLD_HALF_SIZE - 25 || Math.abs(bz) > WORLD_HALF_SIZE - 25) continue;
      const py = getTerrainHeight(bx, bz);
      if (py < 1.1 || py > 36) continue;
      const proj = projectOntoTrack(bx, bz);
      if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 4.2) continue;
      bushSpots.push({ x: bx, y: py - 0.1, z: bz, s: 0.75 + (i % 5) * 0.22, yaw: (i * 1.9) % (Math.PI * 2) });
    }
    if (bushSpots.length > 0) {
      const bushMat = jungleCanopyMat.clone();
      attachWindSway(bushMat, windUniform, 'pine', playerPosUniform, [175, 255]);
      disposables.push(bushMat);
      createSpatialChunkInstanced(worldGroup, bushSpots, canopyGeo, bushMat, 1, false, true, (b, idx, push) => {
        dummy.position.set(b.x, b.y + 0.7 * b.s, b.z);
        dummy.rotation.set(0, b.yaw, 0);
        dummy.scale.set(b.s * 1.15, b.s * 0.85, b.s * 1.15);
        dummy.updateMatrix();
        push(dummy.matrix, tmpInstanceColor.setHSL(0.26 + (idx % 5) * 0.015, 0.5, 0.4 + (idx % 4) * 0.07));
      });
    }
  }

  // 9c. Giant Tropical Jungle Ferns (1,050 Distance-Culled Ground-Cover Crowns in Palm Canyon)
  const fernSpots: Array<{ x: number; y: number; z: number; s: number; yaw: number }> = [];
  for (let i = 0; i < 1800 && fernSpots.length < 1050; i++) {
    let fx = 0;
    let fz = 0;
    if (i < 950) {
      const s = 0.16 + ((i * 23) % 1000) / 1000 * 0.37;
      const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
      if (st.hasTunnel || st.isBridge) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const dist = st.roadWidth * 0.5 + 2.5 + ((i * 31) % 100) * 0.34;
      fx = st.x + st.rx * (side * dist) + Math.sin(i * 1.4) * 2.0;
      fz = st.z + st.rz * (side * dist) + Math.cos(i * 2.1) * 2.0;
    } else {
      const k = i - 950;
      const a = k * 2.399963;
      const rad = 18 + Math.sqrt(k / 850) * 210;
      fx = -225 + Math.cos(a) * rad;
      fz = -345 + Math.sin(a) * rad;
    }
    if (Math.abs(fx) > WORLD_HALF_SIZE - 22 || Math.abs(fz) > WORLD_HALF_SIZE - 22) continue;
    const py = getTerrainHeight(fx, fz);
    if (py < 1.0 || py > 35) continue;
    const proj = projectOntoTrack(fx, fz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 2.3) continue;
    fernSpots.push({ x: fx, y: py - 0.05, z: fz, s: 0.72 + (i % 5) * 0.16, yaw: (i * 1.7) % (Math.PI * 2) });
  }
  if (fernSpots.length > 0) {
    const fernGeo = buildJungleFernGeometry();
    const fernMat = new THREE.MeshStandardMaterial({
      map: textures.fernFrondMap,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.74,
      metalness: 0.02,
    });
    attachWindSway(fernMat, windUniform, 'grass', playerPosUniform, [115, 175]);
    createSpatialChunkInstanced(worldGroup, fernSpots, fernGeo, fernMat, 1, false, true, (f, idx, push) => {
      dummy.position.set(f.x, f.y, f.z);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.set(f.s, f.s, f.s);
      dummy.updateMatrix();
      push(dummy.matrix, tmpInstanceColor.setHSL(0.27 + (idx % 4) * 0.015, 0.52, 0.46 + (idx % 3) * 0.08));
    });
    disposables.push(fernGeo, fernMat);
  }

  // 9d. Coastal Cypress & Eucalyptus Groves (Sunset Coast, Harbor Bluffs & Mountain Foot)
  const cypressSpots: Array<{ x: number; y: number; z: number; s: number }> = [];
  for (let i = 0; i < 240 && cypressSpots.length < 185; i++) {
    // Line Sunset Coast & Fujimi Harbor hillsides + alpine foothill transition
    const s = i < 110
      ? 0.02 + (i / 110) * 0.21
      : 0.65 + ((i - 110) / 130) * 0.15;
    const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
    if (st.hasTunnel || st.isBridge) continue;
    const side = i % 2 === 0 ? 1 : -1;
    const dist = st.roadWidth * 0.5 + 11 + ((i * 23) % 90) * 0.55;
    const cx = st.x + st.rx * (side * dist) + Math.sin(i * 2.4) * 2.5;
    const cz = st.z + st.rz * (side * dist) + Math.cos(i * 1.3) * 2.5;
    if (Math.abs(cx) > WORLD_HALF_SIZE - 30 || Math.abs(cz) > WORLD_HALF_SIZE - 30) continue;
    const py = getTerrainHeight(cx, cz);
    if (py < 1.3 || py > 44) continue;
    const proj = projectOntoTrack(cx, cz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 6.5) continue;
    cypressSpots.push({ x: cx, y: py, z: cz, s: 0.88 + (i % 5) * 0.16 });
  }
  if (cypressSpots.length > 0) {
    const cyTrunkGeo = new THREE.CylinderGeometry(0.14, 0.34, 7.2, 8);
    const cyTrunkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0x856d57,
      roughness: 0.9,
    });
    const plumeGeo = buildCypressPlumeGeometry();
    const plumeMat = new THREE.MeshStandardMaterial({
      map: textures.cypressFoliageMap,
      alphaTest: 0.38,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0.02,
    });
    attachWindSway(plumeMat, windUniform, 'pine');

    createSpatialChunkInstanced(worldGroup, cypressSpots, cyTrunkGeo, cyTrunkMat, 1, true, true, (c, idx, push) => {
      dummy.position.set(c.x, c.y + 3.5 * c.s, c.z);
      dummy.rotation.set(0, idx * 0.85, 0);
      dummy.scale.set(c.s, c.s, c.s);
      dummy.updateMatrix();
      push(dummy.matrix);
    });
    createSpatialChunkInstanced(worldGroup, cypressSpots, plumeGeo, plumeMat, 2, true, true, (c, idx, push) => {
      tmpInstanceColor.setHSL(0.36 + (idx % 4) * 0.015, 0.38, 0.45 + (idx % 3) * 0.08);
      for (let tier = 0; tier < 2; tier++) {
        const ts = c.s * (tier === 0 ? 1.15 : 0.85);
        dummy.position.set(c.x, c.y + (2.6 + tier * 3.1) * c.s, c.z);
        dummy.rotation.set(0, idx * 1.1 + tier * 0.6, 0);
        dummy.scale.set(ts, ts * 1.15, ts);
        dummy.updateMatrix();
        push(dummy.matrix, tmpInstanceColor);
      }
    });
    disposables.push(cyTrunkGeo, cyTrunkMat, plumeGeo, plumeMat);
  }

  // 9e. Ornamental Flowering Sakura & Tropical Flame Blossom Trees (Harbor, Coast & Jungle Clearings)
  const blossomSpots: Array<{ x: number; y: number; z: number; s: number; tint: THREE.Color }> = [];
  for (let i = 0; i < 120 && blossomSpots.length < 96; i++) {
    const isHarbor = i % 2 === 0;
    const s = isHarbor
      ? 0.72 + (i / 120) * 0.25
      : 0.08 + (i / 120) * 0.32;
    const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
    if (st.hasTunnel || st.isBridge) continue;
    const side = i % 4 < 2 ? 1 : -1;
    const dist = st.roadWidth * 0.5 + 8.5 + (i % 5) * 3.5;
    const bx = st.x + st.rx * (side * dist);
    const bz = st.z + st.rz * (side * dist);
    const py = getTerrainHeight(bx, bz);
    if (py < 1.2 || py > 34) continue;
    const proj = projectOntoTrack(bx, bz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 5.8) continue;

    // Sakura rose pink near Fujimi Harbor vs warm tropical flame coral-gold in Coast & Jungle
    const tint = isHarbor
      ? new THREE.Color().setHSL(0.93 + (i % 3) * 0.012, 0.72, 0.78)
      : new THREE.Color().setHSL(0.05 + (i % 3) * 0.025, 0.85, 0.66);
    blossomSpots.push({ x: bx, y: py, z: bz, s: 0.84 + (i % 4) * 0.13, tint });
  }
  if (blossomSpots.length > 0) {
    const blTrunkGeo = new THREE.CylinderGeometry(0.16, 0.38, 4.6, 8);
    const blTrunkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      color: 0x4b362b,
      roughness: 0.9,
    });
    const blCrownGeo = buildBroadleafCanopyGeometry();
    const blCrownMat = new THREE.MeshStandardMaterial({
      map: textures.blossomLeafMap,
      alphaTest: 0.38,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0.02,
    });
    attachWindSway(blCrownMat, windUniform, 'pine');

    createSpatialChunkInstanced(worldGroup, blossomSpots, blTrunkGeo, blTrunkMat, 1, true, true, (b, idx, push) => {
      dummy.position.set(b.x, b.y + 2.2 * b.s, b.z);
      dummy.rotation.set(0, idx * 1.2, 0);
      dummy.scale.set(b.s, b.s, b.s);
      dummy.updateMatrix();
      push(dummy.matrix);
    });
    createSpatialChunkInstanced(worldGroup, blossomSpots, blCrownGeo, blCrownMat, 2, true, true, (b, idx, push) => {
      for (let k = 0; k < 2; k++) {
        const off = k === 0 ? 0 : 1.1;
        dummy.position.set(b.x + off * 0.6, b.y + (4.5 + k * 0.7) * b.s, b.z - off * 0.4);
        dummy.rotation.set(0, idx * 0.9 + k * 1.4, 0);
        const cs = b.s * (k === 0 ? 1.5 : 1.18);
        dummy.scale.set(cs, cs * 0.82, cs);
        dummy.updateMatrix();
        push(dummy.matrix, b.tint);
      }
    });
    disposables.push(blTrunkGeo, blTrunkMat, blCrownGeo, blCrownMat);
  }

  // 10. Instanced Wind-Swayed & Distance-Culled Roadside Grass (6,400 Tufts across 3x3 spatial tiles)
  const grassSpots: Array<{ x: number; y: number; z: number; sx: number; sy: number; yaw: number; tint: THREE.Color }> = [];
  const grassTint = new THREE.Color();

  for (let i = 0; i < 12000 && grassSpots.length < 6400; i++) {
    let gx = 0;
    let gz = 0;
    if (i < 8200) {
      const stIdx = (i * 11) % TRACK_STATION_COUNT;
      const st = TRACK_STATIONS[stIdx];
      if (st.isBridge) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const latDist = st.roadWidth * 0.5 + 2.0 + ((i * 37) % 100) * 0.32;
      gx = st.x + st.rx * (side * latDist) + Math.sin(i * 1.7) * 2.2;
      gz = st.z + st.rz * (side * latDist) + Math.cos(i * 2.3) * 2.2;
    } else {
      const k = i - 8200;
      const a = k * 2.399963;
      const r = 38 + Math.sqrt(k / 3800) * 760;
      gx = Math.cos(a) * r;
      gz = Math.sin(a) * r;
    }

    if (Math.abs(gx) > WORLD_HALF_SIZE - 18 || Math.abs(gz) > WORLD_HALF_SIZE - 18) continue;
    const py = getTerrainHeight(gx, gz);
    if (py < 0.9 || py > 40) continue;

    const hx = getTerrainHeight(gx + 3, gz);
    const hz = getTerrainHeight(gx, gz + 3);
    const slope = Math.hypot(hx - py, hz - py) / 3;
    if (slope > 0.48) continue;

    const proj = projectOntoTrack(gx, gz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 1.85) continue;

    if (gx < 60 && gz < -280) {
      grassTint.setHSL(0.27 + (i % 5) * 0.014, 0.54, 0.42 + (i % 4) * 0.06);
    } else if (gx < -140 && gz > -460 && gz < 440) {
      grassTint.setHSL(0.23 + (i % 5) * 0.014, 0.48, 0.48 + (i % 4) * 0.06);
    } else if (gz > 120 && gx > 180) {
      grassTint.setHSL(0.27 + (i % 4) * 0.012, 0.5, 0.45 + (i % 3) * 0.05);
    } else {
      grassTint.setHSL(0.3 + (i % 5) * 0.012, 0.45, 0.36 + (i % 4) * 0.05);
    }

    grassSpots.push({
      x: gx,
      y: py - 0.05,
      z: gz,
      sx: 0.94 + (i % 5) * 0.18,
      sy: 0.8 + (i % 6) * 0.17,
      yaw: (i * 1.13) % (Math.PI * 2),
      tint: grassTint.clone(),
    });
  }

  if (grassSpots.length > 0) {
    const grassGeo = buildGrassTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      map: textures.grassTuftMap,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.86,
      metalness: 0.02,
    });
    attachWindSway(grassMat, windUniform, 'grass', playerPosUniform, [88, 138]);
    createSpatialChunkInstanced(worldGroup, grassSpots, grassGeo, grassMat, 1, false, true, (g, _idx, push) => {
      dummy.position.set(g.x, g.y, g.z);
      dummy.rotation.set(0, g.yaw, 0);
      dummy.scale.set(g.sx, g.sy, g.sx);
      dummy.updateMatrix();
      push(dummy.matrix, g.tint);
    });
    disposables.push(grassGeo, grassMat);
  }

  // 11. Sleek Highway Light Poles along Harbor, Coast & Tunnel Approaches (Nocturnal Reactive)
  const poleSpots: Array<{ x: number; y: number; z: number; yaw: number; side: number }> = [];
  for (let i = 0; i < TRACK_STATION_COUNT; i += 10) {
    const st = TRACK_STATIONS[i];
    if (st.zoneId === 'fujimi_bay' || st.zoneId === 'sunset_coast') {
      const side = (i / 10) % 2 === 0 ? 1 : -1;
      const lat = side * (st.roadWidth * 0.5 + 1.15);
      poleSpots.push({
        x: st.x + st.rx * lat,
        y: st.y + lat * Math.sin(st.bankRad),
        z: st.z + st.rz * lat,
        yaw: Math.atan2(st.tx, st.tz),
        side,
      });
    }
  }
  const lampPositions: Array<{ x: number; y: number; z: number }> = [];
  let lampMat: THREE.MeshStandardMaterial | null = null;
  if (poleSpots.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.35 });
    lampMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xffd57e,
      emissiveIntensity: 0.25,
    });
    const lampGeo = new THREE.BoxGeometry(1.1, 0.22, 0.45);
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, poleSpots.length);
    const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, poleSpots.length);
    poleInst.castShadow = true;

    poleSpots.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 3.8, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(idx, dummy.matrix);

      const armOffX = Math.cos(p.yaw) * (-p.side * 0.85);
      const armOffZ = -Math.sin(p.yaw) * (-p.side * 0.85);
      const lx = p.x + armOffX;
      const ly = p.y + 7.5;
      const lz = p.z + armOffZ;
      dummy.position.set(lx, ly, lz);
      dummy.updateMatrix();
      lampInst.setMatrixAt(idx, dummy.matrix);
      lampPositions.push({ x: lx, y: ly - 0.3, z: lz });
    });
    poleInst.instanceMatrix.needsUpdate = true;
    lampInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingSphere();
    lampInst.computeBoundingSphere();
    worldGroup.add(poleInst, lampInst);
    disposables.push(poleGeo, poleMat, lampGeo, lampMat);
  }

  // 11b. Sunset Coast Whitewashed Concrete Seawall & Boardwalk Promenade Rail
  const seawallMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.76,
    metalness: 0.04,
  });
  const seawallStart = 0;
  const seawallEnd = Math.floor(TRACK_STATION_COUNT * 0.245);
  const seawallCount = seawallEnd - seawallStart;
  if (seawallCount > 4) {
    const wallVerts: number[] = [];
    const wallIndices: number[] = [];
    for (let i = 0; i <= seawallCount; i++) {
      const st = TRACK_STATIONS[(seawallStart + i) % TRACK_STATION_COUNT];
      const lat = -(st.roadWidth * 0.5 + 1.05);
      const wx = st.x + st.rx * lat;
      const wz = st.z + st.rz * lat;
      const baseY = st.y + lat * Math.sin(st.bankRad);
      // Inner top, outer top, outer bottom
      wallVerts.push(wx - st.rx * 0.15, baseY + 0.52, wz - st.rz * 0.15);
      wallVerts.push(wx + st.rx * 0.25, baseY + 0.52, wz + st.rz * 0.25);
      wallVerts.push(wx + st.rx * 0.25, baseY - 1.6, wz + st.rz * 0.25);
    }
    for (let i = 0; i < seawallCount; i++) {
      const a = i * 3;
      const b = (i + 1) * 3;
      wallIndices.push(a, a + 1, b, a + 1, b + 1, b);
      wallIndices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();
    const wallMesh = new THREE.Mesh(wallGeo, seawallMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    worldGroup.add(wallMesh);
    disposables.push(wallGeo, seawallMat);

    // Coastal wooden-look promenade fence posts & rails atop seawall
    const fencePosts: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (let i = seawallStart; i < seawallEnd; i += 2) {
      const st = TRACK_STATIONS[i];
      const lat = -(st.roadWidth * 0.5 + 1.15);
      fencePosts.push({
        x: st.x + st.rx * lat,
        y: st.y + lat * Math.sin(st.bankRad) + 0.52,
        z: st.z + st.rz * lat,
        yaw: Math.atan2(st.tx, st.tz),
      });
    }
    if (fencePosts.length > 0) {
      const fPostGeo = new THREE.BoxGeometry(0.14, 0.82, 0.14);
      const fRailGeo = new THREE.BoxGeometry(0.08, 0.09, 5.5);
      const fMat = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.78 });
      const fPostInst = new THREE.InstancedMesh(fPostGeo, fMat, fencePosts.length);
      const fRailInst = new THREE.InstancedMesh(fRailGeo, fMat, fencePosts.length * 2);
      fPostInst.castShadow = true;
      fRailInst.castShadow = false;
      fencePosts.forEach((fp, idx) => {
        dummy.position.set(fp.x, fp.y + 0.41, fp.z);
        dummy.rotation.set(0, fp.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fPostInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(fp.x, fp.y + 0.68, fp.z);
        dummy.updateMatrix();
        fRailInst.setMatrixAt(idx * 2, dummy.matrix);
        dummy.position.set(fp.x, fp.y + 0.38, fp.z);
        dummy.updateMatrix();
        fRailInst.setMatrixAt(idx * 2 + 1, dummy.matrix);
      });
      fPostInst.instanceMatrix.needsUpdate = true;
      fRailInst.instanceMatrix.needsUpdate = true;
      fPostInst.computeBoundingSphere();
      fRailInst.computeBoundingSphere();
      worldGroup.add(fPostInst, fRailInst);
      disposables.push(fPostGeo, fRailGeo, fMat);
    }
  }

  // 11c. Colorful Resort Beach Umbrellas / Parasols along Sunset Coast & Terraces
  const umbrellaSpots: Array<{ x: number; y: number; z: number; s: number; color: number }> = [];
  const umbrellaColors = [0xec4899, 0xfb923c, 0x84cc16, 0x22d3ee, 0xfacc15, 0xc084fc, 0xf43f5e];
  for (let i = 0; i < 72; i++) {
    const isOceanSide = i < 52;
    const s = isOceanSide
      ? 0.008 + (i / 52) * 0.23
      : 0.04 + ((i - 52) / 20) * 0.19;
    const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
    const side = isOceanSide ? -1 : 1;
    const dist = isOceanSide
      ? st.roadWidth * 0.5 + 3.2 + (i % 4) * 2.6
      : st.roadWidth * 0.5 + 14.0 + (i % 3) * 4.5;
    const ux = st.x + st.rx * (side * dist);
    const uz = st.z + st.rz * (side * dist);
    const proj = projectOntoTrack(ux, uz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 2.5) continue;
    const uy = Math.max(-0.4, getTerrainHeight(ux, uz));
    umbrellaSpots.push({
      x: ux,
      y: uy,
      z: uz,
      s: 0.92 + (i % 4) * 0.1,
      color: umbrellaColors[i % umbrellaColors.length],
    });
  }
  if (umbrellaSpots.length > 0) {
    const uPoleGeo = new THREE.CylinderGeometry(0.055, 0.065, 2.7, 7);
    const uPoleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.35 });
    const uCanopyGeo = new THREE.ConeGeometry(2.05, 0.72, 10);
    const uCanopyMat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide });

    const uPoleInst = new THREE.InstancedMesh(uPoleGeo, uPoleMat, umbrellaSpots.length);
    const uCanopyInst = new THREE.InstancedMesh(uCanopyGeo, uCanopyMat, umbrellaSpots.length);
    uPoleInst.castShadow = true;
    uCanopyInst.castShadow = true;
    uCanopyInst.receiveShadow = true;

    umbrellaSpots.forEach((u, idx) => {
      dummy.position.set(u.x, u.y + 1.32 * u.s, u.z);
      dummy.rotation.set(0, idx * 0.65, 0);
      dummy.scale.setScalar(u.s);
      dummy.updateMatrix();
      uPoleInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(u.x, u.y + 2.55 * u.s, u.z);
      dummy.rotation.set((idx % 3 - 1) * 0.06, idx * 0.85, (idx % 2 === 0 ? 1 : -1) * 0.05);
      dummy.scale.setScalar(u.s);
      dummy.updateMatrix();
      uCanopyInst.setMatrixAt(idx, dummy.matrix);
      uCanopyInst.setColorAt(idx, new THREE.Color(u.color));
    });
    uPoleInst.instanceMatrix.needsUpdate = true;
    uCanopyInst.instanceMatrix.needsUpdate = true;
    if (uCanopyInst.instanceColor) uCanopyInst.instanceColor.needsUpdate = true;
    uPoleInst.computeBoundingSphere();
    uCanopyInst.computeBoundingSphere();
    worldGroup.add(uPoleInst, uCanopyInst);
    disposables.push(uPoleGeo, uPoleMat, uCanopyGeo, uCanopyMat);
  }

  // 12. Active Race Checkpoint Gate Beacon
  const checkpointBeacon = new THREE.Group();
  const cpRingGeo = new THREE.CylinderGeometry(8.2, 8.2, 16, 28, 1, true);
  const cpRingMat = new THREE.MeshBasicMaterial({
    color: 0xe11d48,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cpBeam = new THREE.Mesh(cpRingGeo, cpRingMat);
  cpBeam.position.y = 8;
  checkpointBeacon.add(cpBeam);
  checkpointBeacon.visible = false;
  worldGroup.add(checkpointBeacon);
  disposables.push(cpRingGeo, cpRingMat);

  return {
    worldGroup,
    asphaltRoadMat,
    checkpointBeacon,
    lampPositions,
    updateDynamicWorld: (timeSec, isWet, nightFactor = 0, playerX = 0, playerZ = 0) => {
      windUniform.value = timeSec;
      playerPosUniform.value.set(playerX, playerZ);
      const targetRough = isWet ? 0.22 : 0.68;
      const targetMetal = isWet ? 0.3 : 0.1;
      asphaltRoadMat.roughness += (targetRough - asphaltRoadMat.roughness) * 0.08;
      asphaltRoadMat.metalness += (targetMetal - asphaltRoadMat.metalness) * 0.08;

      // Nocturnal building window glow + coastal streetlamp ignition
      shaftMat.emissiveIntensity = nightFactor * 1.15;
      if (lampMat) {
        lampMat.emissiveIntensity = 0.12 + nightFactor * 2.25;
      }

      if (checkpointBeacon.visible) {
        checkpointBeacon.rotation.y = timeSec * 1.6;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
