import * as THREE from 'three';
import { RegionId } from '../types/game';

export const TRACK_STATION_COUNT = 720;
export const WORLD_HALF_SIZE = 920; // Tightly bounded ~1.84km x 1.84km scenic coastal-to-alpine peninsula
export const SEA_LEVEL_Y = -1.35;

export interface TrackStation {
  idx: number;
  s: number; // 0..1 normalized loop parameter
  distM: number; // distance from start in meters
  x: number;
  y: number;
  z: number;
  tx: number; // unit forward tangent X
  ty: number; // unit forward tangent Y
  tz: number; // unit forward tangent Z
  rx: number; // unit horizontal right X (outward / starboard)
  rz: number; // unit horizontal right Z
  bankRad: number; // smooth super-elevation roll around forward tangent
  roadWidth: number;
  curvature: number; // signed horizontal curvature
  zoneId: RegionId;
  isBridge: boolean;
  hasTunnel: boolean;
  hasCurbLeft: boolean;
  hasCurbRight: boolean;
}

// 16 sculpted closed-loop control points forming a ~3.8 km Coastal-to-Mountain Highway Loop
const CONTROL_POINTS: THREE.Vector3[] = [
  new THREE.Vector3(-520, 1.8, 210),   // 0: Sunset Coast South Sweeper
  new THREE.Vector3(-555, 1.8, -10),   // 1: Sunset Coast Overlook & Start Straight
  new THREE.Vector3(-520, 2.3, -245),  // 2: Sunset Coast North Cove
  new THREE.Vector3(-400, 7.2, -445),  // 3: Palm Canyon Entry
  new THREE.Vector3(-215, 15.0, -485), // 4: Palm Canyon Chicane
  new THREE.Vector3(-35, 23.5, -605),  // 5: Palm Canyon Switchback
  new THREE.Vector3(210, 33.5, -610),  // 6: Alpine Pass Climb
  new THREE.Vector3(455, 42.0, -465),  // 7: Alpine Summit Ridge & Tunnel
  new THREE.Vector3(585, 34.0, -225),  // 8: Alpine Forest Descent
  new THREE.Vector3(545, 21.5, 35),    // 9: Alpine Fast Sweeper
  new THREE.Vector3(455, 14.5, 255),   // 10: Fujimi Glass Skyline Harbor
  new THREE.Vector3(295, 16.5, 425),   // 11: Fujimi Suspension Bridge East Approach
  new THREE.Vector3(75, 18.2, 465),    // 12: Fujimi Bay Bridge Mid-Span (over turquoise bay)
  new THREE.Vector3(-155, 15.2, 445),  // 13: Fujimi Suspension Bridge West Approach
  new THREE.Vector3(-355, 7.2, 390),   // 14: Harbor Bluff Descent
  new THREE.Vector3(-470, 2.8, 320),   // 15: Coastal Re-entry Bend
];

export const TRACK_CURVE = new THREE.CatmullRomCurve3(
  CONTROL_POINTS,
  true,
  'catmullrom',
  0.5,
);

export const TRACK_LENGTH_M = TRACK_CURVE.getLength();

function getZoneForFraction(s: number): RegionId {
  if (s < 0.25) return 'sunset_coast';
  if (s < 0.5) return 'palm_canyon';
  if (s < 0.76) return 'alpine_pass';
  return 'fujimi_bay';
}

// Build deterministic 720-station pre-sampled lookup table
export const TRACK_STATIONS: TrackStation[] = (() => {
  const stations: TrackStation[] = [];
  const rawPoints: THREE.Vector3[] = [];
  const rawTangents: THREE.Vector3[] = [];

  for (let i = 0; i < TRACK_STATION_COUNT; i++) {
    const s = i / TRACK_STATION_COUNT;
    const p = TRACK_CURVE.getPointAt(s);
    const t = TRACK_CURVE.getTangentAt(s).normalize();
    rawPoints.push(p);
    rawTangents.push(t);
  }

  for (let i = 0; i < TRACK_STATION_COUNT; i++) {
    const s = i / TRACK_STATION_COUNT;
    const p = rawPoints[i];
    const t = rawTangents[i];
    const tPrev = rawTangents[(i - 2 + TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
    const tNext = rawTangents[(i + 2) % TRACK_STATION_COUNT];

    // Horizontal right vector: cross(tangent, up(0,1,0)) = (-tz, 0, tx) normalized in XZ
    // Wait: in Three.js heading = atan2(tx, tz). Left = (+tz, -tx), Right = (-tz, +tx)
    const hLen = Math.max(0.0001, Math.hypot(t.x, t.z));
    const hx = t.x / hLen;
    const hz = t.z / hLen;
    const rx = -hz;
    const rz = hx;

    // Signed horizontal curvature rate for smooth Forza super-elevation banking & apex curbs
    const dtx = tNext.x - tPrev.x;
    const dtz = tNext.z - tPrev.z;
    const crossTurn = hx * dtz - hz * dtx; // > 0 turning right, < 0 turning left
    const curvature = THREE.MathUtils.clamp(crossTurn * 5.2, -1, 1);

    const isBridge = s >= 0.785 && s <= 0.905;
    const hasTunnel = s >= 0.485 && s <= 0.525;
    const zoneId = getZoneForFraction(s);

    const roadWidth = isBridge ? 17.5 : zoneId === 'sunset_coast' ? 17.0 : 16.0;
    const bankRad = isBridge ? 0 : THREE.MathUtils.clamp(-curvature * 0.085, -0.105, 0.105);

    stations.push({
      idx: i,
      s,
      distM: s * TRACK_LENGTH_M,
      x: p.x,
      y: p.y,
      z: p.z,
      tx: t.x,
      ty: t.y,
      tz: t.z,
      rx,
      rz,
      bankRad,
      roadWidth,
      curvature,
      zoneId,
      isBridge,
      hasTunnel,
      hasCurbLeft: !isBridge && curvature < -0.16,
      hasCurbRight: !isBridge && curvature > 0.16,
    });
  }

  return stations;
})();

// Pre-computed O(1) spatial bucket grid for lightning-fast nearest-station lookups
const GRID_RES = 48;
const GRID_MIN = -WORLD_HALF_SIZE;
const GRID_SPAN = WORLD_HALF_SIZE * 2;
const STATION_GRID: number[][] = Array.from({ length: GRID_RES * GRID_RES }, () => []);

(() => {
  for (let i = 0; i < TRACK_STATION_COUNT; i++) {
    const st = TRACK_STATIONS[i];
    const gx = Math.floor(((st.x - GRID_MIN) / GRID_SPAN) * GRID_RES);
    const gz = Math.floor(((st.z - GRID_MIN) / GRID_SPAN) * GRID_RES);
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        const cx = gx + ox;
        const cz = gz + oz;
        if (cx >= 0 && cx < GRID_RES && cz >= 0 && cz < GRID_RES) {
          STATION_GRID[cz * GRID_RES + cx].push(i);
        }
      }
    }
  }
})();

export interface TrackProjection {
  station: TrackStation;
  stationIdx: number;
  lateralOffset: number; // signed meters along station right vector
  distToCenterSq: number;
  surfaceY: number;
  bankRad: number;
}

export function projectOntoTrack(
  x: number,
  z: number,
  hintIdx?: number,
): TrackProjection {
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIdx !== undefined && hintIdx >= 0 && hintIdx < TRACK_STATION_COUNT) {
    // Fast local window search around previous station
    for (let k = -26; k <= 26; k++) {
      const idx = (hintIdx + k + TRACK_STATION_COUNT) % TRACK_STATION_COUNT;
      const st = TRACK_STATIONS[idx];
      const dx = x - st.x;
      const dz = z - st.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = idx;
      }
    }
  }

  // Fallback / spatial bucket search if no hint or far jump
  if (bestDistSq > 1600) {
    const gx = THREE.MathUtils.clamp(
      Math.floor(((x - GRID_MIN) / GRID_SPAN) * GRID_RES),
      0,
      GRID_RES - 1,
    );
    const gz = THREE.MathUtils.clamp(
      Math.floor(((z - GRID_MIN) / GRID_SPAN) * GRID_RES),
      0,
      GRID_RES - 1,
    );
    const bucket = STATION_GRID[gz * GRID_RES + gx];
    if (bucket.length > 0) {
      for (let i = 0; i < bucket.length; i++) {
        const idx = bucket[i];
        const st = TRACK_STATIONS[idx];
        const dx = x - st.x;
        const dz = z - st.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = idx;
        }
      }
    }
    if (bestDistSq > 9000) {
      for (let i = 0; i < TRACK_STATION_COUNT; i += 4) {
        const st = TRACK_STATIONS[i];
        const dx = x - st.x;
        const dz = z - st.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = i;
        }
      }
      const center = bestIdx;
      for (let k = -5; k <= 5; k++) {
        const idx = (center + k + TRACK_STATION_COUNT) % TRACK_STATION_COUNT;
        const st = TRACK_STATIONS[idx];
        const dx = x - st.x;
        const dz = z - st.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = idx;
        }
      }
    }
  }

  // Interpolate smoothly between bestIdx and its neighbor along tangent for zero step artifacts
  const st0 = TRACK_STATIONS[bestIdx];
  const stNext = TRACK_STATIONS[(bestIdx + 1) % TRACK_STATION_COUNT];
  const stPrev = TRACK_STATIONS[(bestIdx - 1 + TRACK_STATION_COUNT) % TRACK_STATION_COUNT];

  const segDx = stNext.x - stPrev.x;
  const segDz = stNext.z - stPrev.z;
  const segLenSq = Math.max(0.01, segDx * segDx + segDz * segDz);
  const relT = THREE.MathUtils.clamp(
    ((x - st0.x) * segDx + (z - st0.z) * segDz) / segLenSq,
    -0.5,
    0.5,
  );

  const neighbor = relT >= 0 ? stNext : stPrev;
  const alpha = Math.abs(relT) * 2;
  const cx = THREE.MathUtils.lerp(st0.x, neighbor.x, alpha * 0.5);
  const cy = THREE.MathUtils.lerp(st0.y, neighbor.y, alpha * 0.5);
  const cz = THREE.MathUtils.lerp(st0.z, neighbor.z, alpha * 0.5);
  const rx = THREE.MathUtils.lerp(st0.rx, neighbor.rx, alpha * 0.5);
  const rz = THREE.MathUtils.lerp(st0.rz, neighbor.rz, alpha * 0.5);
  const bankRad = THREE.MathUtils.lerp(st0.bankRad, neighbor.bankRad, alpha * 0.5);

  const lateralOffset = (x - cx) * rx + (z - cz) * rz;
  const surfaceY = cy + lateralOffset * Math.sin(bankRad);

  return {
    station: st0,
    stationIdx: bestIdx,
    lateralOffset,
    distToCenterSq: bestDistSq,
    surfaceY,
    bankRad,
  };
}

export function getStationAtS(s: number): TrackStation {
  const norm = ((s % 1) + 1) % 1;
  const idx = Math.floor(norm * TRACK_STATION_COUNT) % TRACK_STATION_COUNT;
  return TRACK_STATIONS[idx];
}

export function getRoadPointAt(
  s: number,
  lateralOffset = 0,
): {
  x: number;
  y: number;
  z: number;
  heading: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  rz: number;
  bankRad: number;
  station: TrackStation;
} {
  const norm = ((s % 1) + 1) % 1;
  const fIdx = norm * TRACK_STATION_COUNT;
  const i0 = Math.floor(fIdx) % TRACK_STATION_COUNT;
  const i1 = (i0 + 1) % TRACK_STATION_COUNT;
  const alpha = fIdx - Math.floor(fIdx);

  const st0 = TRACK_STATIONS[i0];
  const st1 = TRACK_STATIONS[i1];

  const cx = THREE.MathUtils.lerp(st0.x, st1.x, alpha);
  const cy = THREE.MathUtils.lerp(st0.y, st1.y, alpha);
  const cz = THREE.MathUtils.lerp(st0.z, st1.z, alpha);

  let tx = THREE.MathUtils.lerp(st0.tx, st1.tx, alpha);
  let ty = THREE.MathUtils.lerp(st0.ty, st1.ty, alpha);
  let tz = THREE.MathUtils.lerp(st0.tz, st1.tz, alpha);
  const tLen = Math.max(0.0001, Math.hypot(tx, ty, tz));
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  let rx = THREE.MathUtils.lerp(st0.rx, st1.rx, alpha);
  let rz = THREE.MathUtils.lerp(st0.rz, st1.rz, alpha);
  const rLen = Math.max(0.0001, Math.hypot(rx, rz));
  rx /= rLen;
  rz /= rLen;

  const bankRad = THREE.MathUtils.lerp(st0.bankRad, st1.bankRad, alpha);
  const x = cx + rx * lateralOffset;
  const z = cz + rz * lateralOffset;
  const y = cy + lateralOffset * Math.sin(bankRad);
  const heading = Math.atan2(tx, tz);

  return { x, y, z, heading, tx, ty, tz, rx, rz, bankRad, station: st0 };
}

// Coastal & Bay geography mask (0 = open water, 1 = solid dry land)
export function getLandMask(x: number, z: number): number {
  // Western Pacific Ocean along Sunset Coast + Southern Fujimi Bay under the suspension bridge
  const westCoastLine = -582 + Math.sin(z * 0.0085) * 26 + Math.cos(z * 0.021) * 10;
  const westLand = THREE.MathUtils.smoothstep(x, westCoastLine - 55, westCoastLine + 16);

  // Fujimi Bay water cove cutting under the bridge span (x in [-260, 340], z > 240)
  const bayDx = (x - 45) / 290;
  const bayDz = (z - 465) / 210;
  const bayDist = Math.hypot(bayDx, bayDz);
  const bayCarve = z > 235 ? THREE.MathUtils.smoothstep(bayDist, 0.72, 1.15) : 1.0;

  // Southern horizon ocean beyond harbor bluff
  const southOcean = 1.0 - THREE.MathUtils.smoothstep(z, 540, 660);

  return Math.min(westLand, bayCarve, southOcean);
}

// Natural un-carved peninsula relief (sculpted coastal cliffs, central canyon highlands, alpine peaks)
function getNaturalLandscapeHeight(x: number, z: number): number {
  const land = getLandMask(x, z);
  if (land < 0.02) {
    return -4.2;
  }

  // Rolling canyon hills + dramatic NE alpine mountain massif
  const alpinePeakDist = Math.hypot(x - 360, z + 520);
  const alpineMassif =
    Math.max(0, 1 - alpinePeakDist / 520) ** 1.35 * 62;

  const centralRidgeDist = Math.hypot(x - 50, z + 110);
  const centralBluffs =
    Math.max(0, 1 - centralRidgeDist / 440) ** 1.2 * 24;

  const coastalCliffDist = Math.hypot(x + 280, z - 20);
  const coastalHills =
    Math.max(0, 1 - coastalCliffDist / 320) ** 1.3 * 16;

  const wave1 = Math.sin(x * 0.011 + z * 0.009) * 5.2;
  const wave2 = Math.cos(x * 0.023 - z * 0.018) * 2.6;
  const detail = Math.sin(x * 0.047 + z * 0.039) * 0.9;

  const rawLandY =
    0.8 + alpineMassif + centralBluffs + coastalHills + wave1 + wave2 + detail;

  return THREE.MathUtils.lerp(-4.2, rawLandY, land);
}

// Road-carved terrain heightfield (NEVER clips through asphalt or bridges)
export function getTerrainHeight(x: number, z: number): number {
  const raw = getNaturalLandscapeHeight(x, z);
  const proj = projectOntoTrack(x, z);
  const st = proj.station;
  const distCenter = Math.sqrt(proj.distToCenterSq);
  const halfW = st.roadWidth * 0.5;

  // Under the Fujimi Bay suspension bridge, drop terrain smoothly to seabed so bay water flows uninterrupted
  if (st.isBridge) {
    const seaDrop = THREE.MathUtils.smoothstep(distCenter, 12, 48);
    return THREE.MathUtils.lerp(-4.2, raw, seaDrop);
  }

  // Beneath roadbed & shoulder curb: cleanly depressed 0.32m below road deck
  if (distCenter <= halfW + 2.2) {
    return proj.surfaceY - 0.32;
  }

  // Smooth graded shoulder blend out to natural hills / coastal beach
  if (distCenter < halfW + 28) {
    const t = (distCenter - (halfW + 2.2)) / 25.8;
    const s = t * t * (3 - 2 * t);
    // Keep outer coastal beach side low so view to ocean is wide open!
    let targetRaw = raw;
    if (st.zoneId === 'sunset_coast' && proj.lateralOffset < 0) {
      targetRaw = Math.min(raw, THREE.MathUtils.lerp(st.y - 0.35, -3.5, Math.min(1, (-proj.lateralOffset - halfW) / 48)));
    }
    return (proj.surfaceY - 0.24) * (1 - s) + targetRaw * s;
  }

  return raw;
}

export function getDriveSurfaceHeight(x: number, z: number, hintIdx?: number): number {
  const proj = projectOntoTrack(x, z, hintIdx);
  const halfW = proj.station.roadWidth * 0.5;
  if (Math.abs(proj.lateralOffset) <= halfW + 1.5) {
    return proj.surfaceY;
  }
  return getTerrainHeight(x, z);
}

export function getSurfaceAt(
  x: number,
  z: number,
  hintIdx?: number,
): 'asphalt' | 'dirt' | 'sand' | 'snow' | 'grass' | 'water' {
  const proj = projectOntoTrack(x, z, hintIdx);
  const halfW = proj.station.roadWidth * 0.5;
  if (Math.abs(proj.lateralOffset) <= halfW + 0.8) {
    return 'asphalt';
  }
  const h = getTerrainHeight(x, z);
  if (h < SEA_LEVEL_Y + 0.15) return 'water';
  if (h > 52) return 'snow';
  if (proj.station.zoneId === 'sunset_coast' && proj.lateralOffset < 0 && h < 2.2) {
    return 'sand';
  }
  if (Math.abs(proj.lateralOffset) <= halfW + 4.0) {
    return 'dirt';
  }
  return 'grass';
}
