import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CarBaseSpec, CarCustomization } from '../types/game';

export interface CarModelRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  wheelSteerFL: THREE.Group;
  wheelSteerFR: THREE.Group;
  wheelSpinners: THREE.Group[];
  bodyMaterial: THREE.MeshPhysicalMaterial;
  taillightMaterial: THREE.MeshStandardMaterial;
  headlightMaterial: THREE.MeshStandardMaterial;
  nitroFlames: THREE.Mesh[];
  setLights: (
    headlights: boolean,
    braking: boolean,
    nitro: boolean,
    timeSec?: number,
    backfireOnly?: boolean,
  ) => void;
  setWheels: (steerRad: number, spinDeltaRad: number) => void;
  setBodyTilt: (pitchRad: number, rollRad: number, heaveY: number) => void;
  setDirt: (dirtLevel: number, washProgress?: number, washFoam?: number) => void;
  setDamage: (damageLevel: number) => void;
  getExhaustAnchors: () => readonly THREE.Vector3[];
  getCameraAnchors: () => {
    cockpitEyeLocal: THREE.Vector3;
    cockpitLookLocal: THREE.Vector3;
    hoodEyeLocal: THREE.Vector3;
    hoodLookLocal: THREE.Vector3;
    bumperEyeLocal: THREE.Vector3;
    bumperLookLocal: THREE.Vector3;
  };
  setCockpitMode: (inCockpit: boolean) => void;
  setCockpitState: (params: {
    active: boolean;
    steerRad: number;
    rpm: number;
    maxRpm: number;
    speedKmh: number;
    gear: number;
    nitro: number;
    nitroMax: number;
    headlightsOn: boolean;
    nitroActive: boolean;
    absActive: boolean;
    tcsActive: boolean;
  }) => void;
  dispose: () => void;
}

type CarArchetype = 'mclaren' | 'supra' | 'gtr' | 'porsche' | 'ferrari' | 'jesko';

function getArchetype(spec: CarBaseSpec): CarArchetype {
  if (spec.id.includes('mclaren')) return 'mclaren';
  if (spec.id.includes('supra')) return 'supra';
  if (spec.id.includes('gtr')) return 'gtr';
  if (spec.id.includes('porsche')) return 'porsche';
  if (spec.id.includes('ferrari')) return 'ferrari';
  if (spec.id.includes('koenigsegg') || spec.id.includes('jesk')) return 'jesko';
  if (spec.bodyStyle === 'wedge') return 'ferrari';
  if (spec.bodyStyle === 'gt') return 'porsche';
  if (spec.bodyStyle === 'jdm') return 'supra';
  return 'mclaren';
}

function prepareForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') {
      g.deleteAttribute(key);
    }
  }
  if (g !== geo) geo.dispose();
  return g;
}

function safeMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const prepared = parts.map(prepareForMerge);
  const merged = mergeGeometries(prepared, false);
  prepared.forEach((p) => p.dispose());
  return merged;
}

function addPart(
  list: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  px = 0,
  py = 0,
  pz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): void {
  if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
  if (rx !== 0) geo.rotateX(rx);
  if (ry !== 0) geo.rotateY(ry);
  if (rz !== 0) geo.rotateZ(rz);
  if (px !== 0 || py !== 0 || pz !== 0) geo.translate(px, py, pz);
  list.push(geo);
}

interface HullCurveSpec {
  midEngine: boolean;
  noseDrop: number;
  hoodSlope: number;
  tailHeight: number;
  waistPinch: number;
  fenderBulgeFront: number;
  fenderBulgeRear: number;
  ducktailLift: number;
  frontFenderPod: number; // Raised Porsche-style headlight fender ridges
  noseTaper: number;
  tailTaper: number;
}

function getHullCurveSpec(arch: CarArchetype): HullCurveSpec {
  switch (arch) {
    case 'mclaren':
      return {
        midEngine: true,
        noseDrop: 0.17,
        hoodSlope: 0.45,
        tailHeight: 0.62,
        waistPinch: 0.87,
        fenderBulgeFront: 1.03,
        fenderBulgeRear: 1.05,
        ducktailLift: 0.04,
        frontFenderPod: 0.03,
        noseTaper: 0.68,
        tailTaper: 0.82,
      };
    case 'ferrari':
      return {
        midEngine: true,
        noseDrop: 0.16,
        hoodSlope: 0.44,
        tailHeight: 0.63,
        waistPinch: 0.89,
        fenderBulgeFront: 1.02,
        fenderBulgeRear: 1.04,
        ducktailLift: 0.03,
        frontFenderPod: 0.02,
        noseTaper: 0.66,
        tailTaper: 0.85,
      };
    case 'jesko':
      return {
        midEngine: true,
        noseDrop: 0.15,
        hoodSlope: 0.43,
        tailHeight: 0.59,
        waistPinch: 0.86,
        fenderBulgeFront: 1.03,
        fenderBulgeRear: 1.06,
        ducktailLift: 0.05,
        frontFenderPod: 0.025,
        noseTaper: 0.64,
        tailTaper: 0.78,
      };
    case 'porsche':
      return {
        midEngine: false,
        noseDrop: 0.18,
        hoodSlope: 0.44,
        tailHeight: 0.62,
        waistPinch: 0.90,
        fenderBulgeFront: 1.02,
        fenderBulgeRear: 1.06,
        ducktailLift: 0.05,
        frontFenderPod: 0.075,
        noseTaper: 0.72,
        tailTaper: 0.84,
      };
    case 'gtr':
      return {
        midEngine: false,
        noseDrop: 0.24,
        hoodSlope: 0.55,
        tailHeight: 0.67,
        waistPinch: 0.94,
        fenderBulgeFront: 1.02,
        fenderBulgeRear: 1.04,
        ducktailLift: 0.03,
        frontFenderPod: 0.015,
        noseTaper: 0.78,
        tailTaper: 0.88,
      };
    case 'supra':
    default:
      return {
        midEngine: false,
        noseDrop: 0.21,
        hoodSlope: 0.52,
        tailHeight: 0.64,
        waistPinch: 0.89,
        fenderBulgeFront: 1.02,
        fenderBulgeRear: 1.07,
        ducktailLift: 0.07,
        frontFenderPod: 0.025,
        noseTaper: 0.74,
        tailTaper: 0.85,
      };
  }
}

/**
 * High-resolution 28-station lofted supercar body with true circular wheel-arch
 * cutouts, flared wheel lips, waist scallop, hood creases, and tapered aero ends.
 */
function buildSculptedHullGeometry(
  spec: CarBaseSpec,
  arch: CarArchetype,
  widthScale: number,
): THREE.BufferGeometry {
  const L = spec.dimensions.length;
  const halfW = spec.dimensions.width * 0.5 * widthScale;
  const H = spec.dimensions.height;
  const wheelR = spec.dimensions.wheelRadius;
  const clearance = spec.dimensions.groundClearance;
  const curve = getHullCurveSpec(arch);

  const frontZ = L * 0.305;
  const rearZ = -L * 0.305;
  const archR = wheelR * 1.18;

  // 28 densely placed stations concentrated around nose, arches, and tail
  const zFracs = [
    -0.500, -0.482, -0.450, -0.405, -0.365, -0.335, -0.305, -0.275, -0.245, -0.205,
    -0.145, -0.075, 0.000, 0.075, 0.145, 0.205, 0.245, 0.275, 0.305, 0.335,
    0.365, 0.405, 0.445, 0.475, 0.493, 0.500,
  ];

  // Cross-section ring: 17 points from bottom-left -> left sill/arch -> shoulder -> crown -> right sill/arch -> bottom-right
  const ringPts = 17;
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let sIdx = 0; sIdx < zFracs.length; sIdx++) {
    const zf = zFracs[sIdx];
    const z = zf * L;

    // Width envelope along car length
    let wFrac = 0.96;
    if (zf < -0.38) {
      const t = (-zf - 0.38) / 0.12;
      wFrac = THREE.MathUtils.lerp(curve.fenderBulgeRear, curve.tailTaper, t * t);
    } else if (zf < -0.18) {
      const t = (zf + 0.38) / 0.20;
      const bell = Math.sin(t * Math.PI);
      wFrac = THREE.MathUtils.lerp(curve.fenderBulgeRear, curve.waistPinch, t) + bell * 0.03;
    } else if (zf < 0.18) {
      const t = (zf + 0.18) / 0.36;
      wFrac = curve.waistPinch + (1 - Math.abs(t * 2 - 1)) * 0.02;
      wFrac = THREE.MathUtils.lerp(wFrac, curve.fenderBulgeFront, Math.max(0, t - 0.5) * 2);
    } else if (zf < 0.38) {
      const t = (zf - 0.18) / 0.20;
      const bell = Math.sin(t * Math.PI);
      wFrac = curve.fenderBulgeFront + bell * 0.025;
    } else {
      const t = (zf - 0.38) / 0.12;
      wFrac = THREE.MathUtils.lerp(curve.fenderBulgeFront, curve.noseTaper, Math.pow(t, 1.35));
    }

    // Shoulder & Crown height envelope
    let ysFrac = 0.58;
    let ycFrac = 0.61;
    if (zf < -0.30) {
      const t = (-zf - 0.30) / 0.20;
      ysFrac = THREE.MathUtils.lerp(0.68, curve.tailHeight - 0.03, t);
      ycFrac = THREE.MathUtils.lerp(0.71, curve.tailHeight + curve.ducktailLift, Math.pow(t, 0.85));
    } else if (zf < 0.0) {
      const t = (zf + 0.30) / 0.30;
      ysFrac = THREE.MathUtils.lerp(0.68, 0.59, t);
      ycFrac = THREE.MathUtils.lerp(0.71, 0.62, t);
    } else if (zf < 0.28) {
      const t = zf / 0.28;
      ysFrac = THREE.MathUtils.lerp(0.59, curve.hoodSlope + 0.05, t);
      ycFrac = THREE.MathUtils.lerp(0.62, curve.hoodSlope, t);
    } else {
      const t = (zf - 0.28) / 0.22;
      const pod = Math.sin(Math.min(1, t * 1.4) * Math.PI) * curve.frontFenderPod;
      ysFrac = THREE.MathUtils.lerp(curve.hoodSlope + 0.05, curve.noseDrop, Math.pow(t, 1.25)) + pod;
      ycFrac = THREE.MathUtils.lerp(curve.hoodSlope, curve.noseDrop - 0.015, Math.pow(t, 1.2));
    }

    // Smoothly taper front & rear lower floor upward (aero diffuser & front splitter clearance)
    let ybFrac = 0.03;
    if (zf > 0.43) ybFrac += ((zf - 0.43) / 0.07) * 0.08;
    if (zf < -0.43) ybFrac += ((-zf - 0.43) / 0.07) * 0.14;

    // Circular wheel-arch carve on front & rear wheels + muscular fender-arch crest over tires
    const dzFront = Math.abs(z - frontZ);
    const dzRear = Math.abs(z - rearZ);
    let archLift = 0;
    let archFlare = 0;
    let frontArchCrest = 0;
    let rearArchCrest = 0;
    if (dzFront < archR * 1.35) {
      const u = dzFront / (archR * 1.35);
      frontArchCrest = Math.cos(u * Math.PI * 0.5) * (0.085 + curve.frontFenderPod * 0.65);
    }
    if (dzRear < archR * 1.35) {
      const u = dzRear / (archR * 1.35);
      rearArchCrest = Math.cos(u * Math.PI * 0.5) * 0.075;
    }
    if (dzFront < archR) {
      const h = Math.sqrt(Math.max(0, archR * archR - dzFront * dzFront));
      archLift = Math.max(archLift, h);
      archFlare = Math.max(archFlare, (h / archR) * 0.042);
    }
    if (dzRear < archR) {
      const h = Math.sqrt(Math.max(0, archR * archR - dzRear * dzRear));
      archLift = Math.max(archLift, h);
      archFlare = Math.max(archFlare, (h / archR) * 0.052);
    }

    const w = (wFrac + archFlare) * halfW;
    const ybBase = clearance + ybFrac * H;
    const ys = clearance + (ysFrac + frontArchCrest + rearArchCrest) * H;
    const yc = clearance + (ycFrac + frontArchCrest * 0.25 + rearArchCrest * 0.35) * H;

    const wheelArchY =
      archLift > 0.02
        ? Math.min(ys - 0.045, Math.max(ybBase, wheelR * 0.96 + archLift - wheelR * 0.04))
        : ybBase;

    // Slight sculptural crease inward on lower door waist
    const doorScallop =
      curve.midEngine && zf > -0.22 && zf < 0.14
        ? 0.055 * Math.sin(((zf + 0.22) / 0.36) * Math.PI)
        : 0.015;

    // Taper inner underbody width inside wheel arches so tire doesn't collide
    const innerFootW = archLift > 0.02 ? w * 0.54 : w * 0.78;
    const outerSillY = Math.min(ys - 0.04, Math.max(wheelArchY, ybBase + 0.035));

    const ring: Array<[number, number]> = [
      [-innerFootW, ybBase],                                       // 0: Left underbody floor edge
      [-w * 0.91, outerSillY],                                     // 1: Left rocker/arch cutout lip
      [-w * (0.99 - doorScallop), outerSillY + (ys - outerSillY) * 0.32], // 2: Lower flank / door crease
      [-w * 1.00, outerSillY + (ys - outerSillY) * 0.68],         // 3: Muscular hip / arch flare
      [-w * 0.95, ys],                                             // 4: Beltline fender ridge
      [-w * 0.80, ys + (yc - ys) * 0.55],                          // 5: Upper fender crown
      [-w * 0.54, yc],                                             // 6: Hood/Deck outer crease
      [-w * 0.24, yc + 0.012],                                     // 7: Inner hood sculpt
      [0, yc + 0.022],                                             // 8: Center spine
      [w * 0.24, yc + 0.012],                                      // 9
      [w * 0.54, yc],                                              // 10
      [w * 0.80, ys + (yc - ys) * 0.55],                           // 11
      [w * 0.95, ys],                                              // 12
      [w * 1.00, outerSillY + (ys - outerSillY) * 0.68],          // 13
      [w * (0.99 - doorScallop), outerSillY + (ys - outerSillY) * 0.32], // 14
      [w * 0.91, outerSillY],                                      // 15
      [innerFootW, ybBase],                                        // 16: Right underbody floor edge
    ];

    for (let p = 0; p < ringPts; p++) {
      verts.push(ring[p][0], ring[p][1], z);
      uvs.push(p / (ringPts - 1), sIdx / (zFracs.length - 1));
    }
  }

  for (let sIdx = 0; sIdx < zFracs.length - 1; sIdx++) {
    const rowA = sIdx * ringPts;
    const rowB = (sIdx + 1) * ringPts;
    for (let p = 0; p < ringPts - 1; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p;
      const d = rowB + p + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
    // Underbody belly close
    indices.push(rowA + (ringPts - 1), rowB + (ringPts - 1), rowA);
    indices.push(rowA, rowB + (ringPts - 1), rowB);
  }

  // Close rear and front caps with crisp independent end-cap vertices so side normals stay silky smooth
  const rearCapStart = verts.length / 3;
  for (let p = 0; p < ringPts; p++) {
    const src = p * 3;
    verts.push(verts[src], verts[src + 1], verts[src + 2]);
    uvs.push(p / (ringPts - 1), 0);
  }
  for (let p = 1; p < ringPts - 1; p++) {
    indices.push(rearCapStart, rearCapStart + p, rearCapStart + p + 1);
  }

  const frontSrcBase = (zFracs.length - 1) * ringPts;
  const frontCapStart = verts.length / 3;
  for (let p = 0; p < ringPts; p++) {
    const src = (frontSrcBase + p) * 3;
    verts.push(verts[src], verts[src + 1], verts[src + 2]);
    uvs.push(p / (ringPts - 1), 1);
  }
  for (let p = 1; p < ringPts - 1; p++) {
    indices.push(frontCapStart, frontCapStart + p + 1, frontCapStart + p);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Wrap-around sculpted glass canopy (curved windshield + teardrop side glass + fastback rear glass).
 */
function buildCanopyGeometry(
  spec: CarBaseSpec,
  arch: CarArchetype,
  widthScale: number,
): THREE.BufferGeometry {
  const L = spec.dimensions.length;
  const halfW = spec.dimensions.width * 0.5 * widthScale;
  const H = spec.dimensions.height;
  const clearance = spec.dimensions.groundClearance;

  const isPorsche = arch === 'porsche';
  const isCabForward = arch === 'mclaren' || arch === 'ferrari' || arch === 'jesko';

  const stations = isCabForward
    ? [
        { z: -0.34 * L, w: 0.42 * halfW, yBase: clearance + H * 0.65, yTop: clearance + H * 0.67 },
        { z: -0.24 * L, w: 0.56 * halfW, yBase: clearance + H * 0.66, yTop: clearance + H * 0.87 },
        { z: -0.11 * L, w: 0.66 * halfW, yBase: clearance + H * 0.63, yTop: clearance + H * 0.99 },
        { z: 0.03 * L, w: 0.69 * halfW, yBase: clearance + H * 0.61, yTop: clearance + H * 1.00 },
        { z: 0.14 * L, w: 0.67 * halfW, yBase: clearance + H * 0.59, yTop: clearance + H * 0.94 },
        { z: 0.26 * L, w: 0.57 * halfW, yBase: clearance + H * 0.54, yTop: clearance + H * 0.60 },
      ]
    : isPorsche
      ? [
          { z: -0.40 * L, w: 0.50 * halfW, yBase: clearance + H * 0.64, yTop: clearance + H * 0.66 },
          { z: -0.28 * L, w: 0.64 * halfW, yBase: clearance + H * 0.66, yTop: clearance + H * 0.85 },
          { z: -0.12 * L, w: 0.70 * halfW, yBase: clearance + H * 0.65, yTop: clearance + H * 0.99 },
          { z: 0.02 * L, w: 0.71 * halfW, yBase: clearance + H * 0.63, yTop: clearance + H * 1.00 },
          { z: 0.12 * L, w: 0.68 * halfW, yBase: clearance + H * 0.60, yTop: clearance + H * 0.88 },
          { z: 0.23 * L, w: 0.60 * halfW, yBase: clearance + H * 0.55, yTop: clearance + H * 0.59 },
        ]
      : [
          { z: -0.37 * L, w: 0.52 * halfW, yBase: clearance + H * 0.64, yTop: clearance + H * 0.67 },
          { z: -0.24 * L, w: 0.66 * halfW, yBase: clearance + H * 0.66, yTop: clearance + H * 0.95 },
          { z: -0.06 * L, w: 0.71 * halfW, yBase: clearance + H * 0.64, yTop: clearance + H * 1.00 },
          { z: 0.07 * L, w: 0.70 * halfW, yBase: clearance + H * 0.62, yTop: clearance + H * 0.97 },
          { z: 0.16 * L, w: 0.66 * halfW, yBase: clearance + H * 0.59, yTop: clearance + H * 0.80 },
          { z: 0.25 * L, w: 0.59 * halfW, yBase: clearance + H * 0.55, yTop: clearance + H * 0.59 },
        ];

  const ringPts = 9;
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let sIdx = 0; sIdx < stations.length; sIdx++) {
    const st = stations[sIdx];
    const yt = st.yTop;
    const pts: Array<[number, number]> = [
      [-st.w, st.yBase],
      [-st.w * 0.92, st.yBase + (yt - st.yBase) * 0.42],
      [-st.w * 0.74, st.yBase + (yt - st.yBase) * 0.80],
      [-st.w * 0.42, yt * 0.992],
      [0, yt + 0.015],
      [st.w * 0.42, yt * 0.992],
      [st.w * 0.74, st.yBase + (yt - st.yBase) * 0.80],
      [st.w * 0.92, st.yBase + (yt - st.yBase) * 0.42],
      [st.w, st.yBase],
    ];
    for (let p = 0; p < pts.length; p++) {
      verts.push(pts[p][0], pts[p][1], st.z);
      uvs.push(p / (ringPts - 1), sIdx / (stations.length - 1));
    }
  }

  for (let s = 0; s < stations.length - 1; s++) {
    const a0 = s * ringPts;
    const b0 = (s + 1) * ringPts;
    for (let p = 0; p < ringPts - 1; p++) {
      indices.push(a0 + p, b0 + p, a0 + p + 1);
      indices.push(a0 + p + 1, b0 + p, b0 + p + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Painted/Carbon contoured roof skin (double-bubble on Supra, smooth fastback on 911,
 * teardrop visor-capped on McLaren/Jesko/Ferrari).
 */
function buildContouredRoofGeometry(
  spec: CarBaseSpec,
  arch: CarArchetype,
  widthScale: number,
): THREE.BufferGeometry {
  const L = spec.dimensions.length;
  const halfW = spec.dimensions.width * 0.5 * widthScale;
  const H = spec.dimensions.height;
  const clearance = spec.dimensions.groundClearance;

  const isCabForward = arch === 'mclaren' || arch === 'ferrari' || arch === 'jesko';
  const isPorsche = arch === 'porsche';
  const isDoubleBubble = arch === 'supra';

  const stations = isCabForward
    ? [
        { z: -0.23 * L, w: 0.44 * halfW, y: clearance + H * 0.875 },
        { z: -0.11 * L, w: 0.50 * halfW, y: clearance + H * 0.995 },
        { z: 0.03 * L, w: 0.52 * halfW, y: clearance + H * 1.005 },
        { z: 0.13 * L, w: 0.50 * halfW, y: clearance + H * 0.945 },
      ]
    : isPorsche
      ? [
          { z: -0.34 * L, w: 0.44 * halfW, y: clearance + H * 0.74 },
          { z: -0.20 * L, w: 0.52 * halfW, y: clearance + H * 0.94 },
          { z: -0.05 * L, w: 0.54 * halfW, y: clearance + H * 1.005 },
          { z: 0.06 * L, w: 0.53 * halfW, y: clearance + H * 0.975 },
        ]
      : [
          { z: -0.24 * L, w: 0.51 * halfW, y: clearance + H * 0.95 },
          { z: -0.09 * L, w: 0.55 * halfW, y: clearance + H * 1.008 },
          { z: 0.05 * L, w: 0.54 * halfW, y: clearance + H * 0.985 },
          { z: 0.11 * L, w: 0.51 * halfW, y: clearance + H * 0.915 },
        ];

  const ringPts = 7;
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let sIdx = 0; sIdx < stations.length; sIdx++) {
    const st = stations[sIdx];
    const bubbleBump = isDoubleBubble ? 0.018 : 0.0;
    const centerDip = isDoubleBubble ? 0.008 : 0.025;
    const pts: Array<[number, number]> = [
      [-st.w, st.y - 0.015],
      [-st.w * 0.68, st.y + 0.012],
      [-st.w * 0.34, st.y + 0.020 + bubbleBump],
      [0, st.y + centerDip],
      [st.w * 0.34, st.y + 0.020 + bubbleBump],
      [st.w * 0.68, st.y + 0.012],
      [st.w, st.y - 0.015],
    ];
    for (let p = 0; p < pts.length; p++) {
      verts.push(pts[p][0], pts[p][1], st.z);
      uvs.push(p / (ringPts - 1), sIdx / (stations.length - 1));
    }
  }

  for (let s = 0; s < stations.length - 1; s++) {
    const a0 = s * ringPts;
    const b0 = (s + 1) * ringPts;
    for (let p = 0; p < ringPts - 1; p++) {
      indices.push(a0 + p, b0 + p, a0 + p + 1);
      indices.push(a0 + p + 1, b0 + p, b0 + p + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved NACA-like cambered airfoil wing blade geometry extruded cleanly across width.
 */
function buildAirfoilWingGeometry(width: number, chord: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-chord * 0.5, 0.012);
  shape.quadraticCurveTo(0, 0.032, chord * 0.48, 0.004);
  shape.lineTo(chord * 0.5, -0.004);
  shape.quadraticCurveTo(0, -0.012, -chord * 0.48, -0.002);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  // Extrude is along +Z (0..width). Rotate so span is along X centered at 0, chord along Z.
  geo.translate(0, 0, -width * 0.5);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/**
 * Curved front carbon aero splitter following the tapered nose contour.
 */
function buildCurvedSplitterGeometry(halfW: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.quadraticCurveTo(-halfW * 0.72, depth * 0.92, 0, depth);
  shape.quadraticCurveTo(halfW * 0.72, depth * 0.92, halfW, 0);
  shape.lineTo(halfW * 0.86, -depth * 0.35);
  shape.lineTo(-halfW * 0.86, -depth * 0.35);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.007,
    bevelSegments: 2,
  });
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Photorealistic performance tire (`LatheGeometry` rounded sidewall & shoulder tread)
 * + concave forged alloy spokes + cross-drilled rotor + Brembo caliper.
 */
function createWheelMesh(
  radius: number,
  width: number,
  rimStyle: CarCustomization['rimStyle'],
  rimColor: string,
  caliperHex: number,
  side: 1 | -1,
  lightweight = false,
): THREE.Group {
  const wheelGroup = new THREE.Group();
  const radialSegs = lightweight ? 16 : 28;

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.84,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.16,
    metalness: 0.94,
  });

  const rimRadius = radius * 0.73;
  const hw = width * 0.5;

  // Lathe tire profile: rounded performance Michelin shoulder & sidewall bulge
  const tireProfile: THREE.Vector2[] = [
    new THREE.Vector2(rimRadius * 0.96, -hw * 0.92),
    new THREE.Vector2(rimRadius + (radius - rimRadius) * 0.45, -hw * 1.03),
    new THREE.Vector2(radius * 0.975, -hw * 0.96),
    new THREE.Vector2(radius, -hw * 0.74),
    new THREE.Vector2(radius, hw * 0.74),
    new THREE.Vector2(radius * 0.975, hw * 0.96),
    new THREE.Vector2(rimRadius + (radius - rimRadius) * 0.45, hw * 1.03),
    new THREE.Vector2(rimRadius * 0.96, hw * 0.92),
  ];
  const tireGeo = new THREE.LatheGeometry(tireProfile, radialSegs);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = !lightweight;
  wheelGroup.add(tireMesh);

  // Dark inner alloy barrel
  const barrelGeo = new THREE.CylinderGeometry(rimRadius * 0.97, rimRadius * 0.97, width * 0.94, radialSegs, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  wheelGroup.add(
    new THREE.Mesh(
      barrelGeo,
      new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.36, metalness: 0.78, side: THREE.DoubleSide }),
    ),
  );

  // Concave Forged Alloy Spokes (angled inward from outer lip to recessed hub) + Stepped Outer Lips
  const rimParts: THREE.BufferGeometry[] = [];
  const spokePairs = rimStyle === 'mesh_gt' ? 5 : rimStyle === 'blade_aero' ? 6 : 5;
  const dishX = side * width * 0.44;
  const hubX = side * width * 0.30;
  const dishAngle = Math.atan2(dishX - hubX, rimRadius * 0.85);

  for (let i = 0; i < spokePairs; i++) {
    const baseAngle = (i / spokePairs) * Math.PI * 2;
    if (rimStyle === 'mesh_gt') {
      // Y-split twin spokes per sector (authentic BBS/HRE forged GT wheel!)
      for (const splay of [-0.17, 0.17]) {
        const spoke = new THREE.BoxGeometry(0.022, rimRadius * 0.94, 0.026);
        spoke.rotateZ(-dishAngle);
        spoke.translate((dishX + hubX) * 0.5, rimRadius * 0.48, 0);
        spoke.rotateX(baseAngle + splay);
        rimParts.push(spoke);
      }
    } else if (rimStyle === 'blade_aero') {
      const blade = new THREE.BoxGeometry(0.022, rimRadius * 0.94, 0.072);
      blade.rotateZ(-dishAngle);
      blade.translate((dishX + hubX) * 0.5, rimRadius * 0.48, 0);
      blade.rotateY(side * 0.24);
      blade.rotateX(baseAngle);
      rimParts.push(blade);
    } else {
      const spoke = new THREE.BoxGeometry(0.026, rimRadius * 0.94, 0.044);
      spoke.rotateZ(-dishAngle);
      spoke.translate((dishX + hubX) * 0.5, rimRadius * 0.48, 0);
      spoke.rotateX(baseAngle);
      rimParts.push(spoke);
    }
  }

  // Stepped Outer & Inner Rim Lip
  const lipSegs = lightweight ? 16 : 26;
  const lipOut = new THREE.TorusGeometry(rimRadius * 0.97, 0.020, 6, lipSegs);
  lipOut.rotateY(Math.PI / 2);
  lipOut.translate(side * width * 0.47, 0, 0);
  rimParts.push(lipOut);

  if (!lightweight) {
    const lipIn = new THREE.TorusGeometry(rimRadius * 0.97, 0.018, 6, lipSegs);
    lipIn.rotateY(Math.PI / 2);
    lipIn.translate(-side * width * 0.47, 0, 0);
    rimParts.push(lipIn);
  }

  // Centerlock Hub Cap
  const hubGeo = new THREE.CylinderGeometry(radius * 0.14, radius * 0.17, width * 0.72, 12);
  hubGeo.rotateZ(Math.PI / 2);
  rimParts.push(hubGeo);

  const mergedRimGeo = safeMerge(rimParts);
  if (mergedRimGeo) {
    wheelGroup.add(new THREE.Mesh(mergedRimGeo, rimMat));
  }

  // Cross-Drilled Brake Rotor + Colored 6-Piston Brembo Caliper
  if (!lightweight) {
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x7c8696,
      roughness: 0.28,
      metalness: 0.88,
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: caliperHex,
      roughness: 0.26,
      metalness: 0.52,
    });

    const rotorGeo = new THREE.CylinderGeometry(rimRadius * 0.76, rimRadius * 0.76, 0.036, 18);
    rotorGeo.rotateZ(Math.PI / 2);
    rotorGeo.translate(side * width * 0.08, 0, 0);
    wheelGroup.add(new THREE.Mesh(rotorGeo, rotorMat));

    const caliperGeo = new THREE.BoxGeometry(width * 0.34, radius * 0.36, radius * 0.22);
    const caliper = new THREE.Mesh(caliperGeo, caliperMat);
    caliper.position.set(side * width * 0.10, radius * 0.08, radius * 0.34);
    wheelGroup.add(caliper);
  }

  return wheelGroup;
}

export function createCarModel(
  spec: CarBaseSpec,
  customization: CarCustomization,
  options?: {
    contactShadowMap?: THREE.Texture;
    carbonMap?: THREE.Texture;
    dirtMap?: THREE.Texture;
    lightweight?: boolean;
  },
): CarModelRig {
  const lightweight = Boolean(options?.lightweight);
  const arch = getArchetype(spec);
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const L = spec.dimensions.length;
  const W = spec.dimensions.width;
  const H = spec.dimensions.height;
  const wheelR = spec.dimensions.wheelRadius;
  const clearance = spec.dimensions.groundClearance;

  const isWide = customization.bodyKit === 'widebody_gt';
  const isStreetKit = customization.bodyKit === 'street';
  const widthScale = isWide ? 1.045 : isStreetKit ? 1.01 : 0.99;

  const finish = customization.paintFinish;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: customization.paintColor,
    metalness: finish === 'metallic' ? 0.36 : finish === 'matte' ? 0.10 : 0.08,
    roughness: finish === 'matte' ? 0.54 : finish === 'metallic' ? 0.16 : 0.13,
    clearcoat: finish === 'matte' ? 0.10 : 1.0,
    clearcoatRoughness: finish === 'matte' ? 0.45 : 0.035,
    ior: 1.54,
    reflectivity: 0.94,
    envMapIntensity: 1.32,
  });

  const carbonMat = new THREE.MeshPhysicalMaterial({
    color: 0x181c24,
    map: options?.carbonMap ?? null,
    roughness: 0.30,
    metalness: 0.32,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x090b0f,
    roughness: 0.74,
    metalness: 0.18,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1524,
    roughness: 0.06,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 0.96,
    envMapIntensity: 1.4,
    transparent: true,
    opacity: Math.min(0.90, Math.max(0.64, 0.56 + customization.windowTint * 0.34)),
  });

  // Dynamic PBR Mud/Dirt Accumulation, Crash Scuff Damage & High-Pressure Soap Wash Shader
  const dirtUniforms = {
    uDirtMap: { value: options?.dirtMap ?? null },
    uDirtLevel: { value: 0.0 },
    uDamageLevel: { value: 0.0 },
    uWashProgress: { value: -1.0 },
    uWashFoam: { value: 0.0 },
    uCarBounds: { value: new THREE.Vector3(W * 0.5 * widthScale, clearance, H) },
    uCarLength: { value: L },
  };

  if (!lightweight && options?.dirtMap) {
    const attachDirtShader = (
      mat: THREE.MeshPhysicalMaterial,
      tag: string,
      isGlass: boolean,
    ) => {
      mat.customProgramCacheKey = () => `car_dirt_${tag}_v3`;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uDirtMap = dirtUniforms.uDirtMap;
        shader.uniforms.uDirtLevel = dirtUniforms.uDirtLevel;
        shader.uniforms.uDamageLevel = dirtUniforms.uDamageLevel;
        shader.uniforms.uWashProgress = dirtUniforms.uWashProgress;
        shader.uniforms.uWashFoam = dirtUniforms.uWashFoam;
        shader.uniforms.uCarBounds = dirtUniforms.uCarBounds;
        shader.uniforms.uCarLength = dirtUniforms.uCarLength;

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec3 vCarLocalPos;
            varying vec3 vCarLocalNormal;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vCarLocalPos = position;
            vCarLocalNormal = normal;`,
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform sampler2D uDirtMap;
            uniform float uDirtLevel;
            uniform float uDamageLevel;
            uniform float uWashProgress;
            uniform float uWashFoam;
            uniform vec3 uCarBounds;
            uniform float uCarLength;
            varying vec3 vCarLocalPos;
            varying vec3 vCarLocalNormal;`,
          )
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float carMudMask = 0.0;
            float carFoamMask = 0.0;
            float carWetMask = 0.0;
            float carDmgMask = 0.0;
            float isGlassMat = ${isGlass ? '1.0' : '0.0'};

            if (uDirtLevel > 0.004 || uWashFoam > 0.004 || uDamageLevel > 0.004) {
              float hNorm = clamp((vCarLocalPos.y - uCarBounds.y) / max(0.15, uCarBounds.z), 0.0, 1.0);
              vec2 uvSide = vec2(vCarLocalPos.z * 0.65, (vCarLocalPos.y - uCarBounds.y) * 1.15);
              vec2 uvTop = vec2(vCarLocalPos.x * 0.72, vCarLocalPos.z * 0.65);
              vec3 nAbs = abs(normalize(vCarLocalNormal));
              vec3 dSide = texture2D(uDirtMap, uvSide).rgb;
              vec3 dTop = texture2D(uDirtMap, uvTop).rgb;
              vec3 dirtTex = mix(dTop, dSide, smoothstep(0.22, 0.72, nAbs.x + nAbs.z * 0.72));

              // Confine mud kickup realistically to lower rocker panels & behind wheel wells
              float sideEdge = smoothstep(uCarBounds.x * 0.45, uCarBounds.x * 0.96, abs(vCarLocalPos.x));
              float frontPlume = smoothstep(0.55, 0.0, abs(vCarLocalPos.z - uCarLength * 0.14));
              float rearPlume = smoothstep(0.62, 0.0, abs(vCarLocalPos.z + uCarLength * 0.40));
              float rockerBand = 1.0 - smoothstep(0.04, 0.36, hNorm);
              float wheelSprayZone = clamp(rockerBand + (frontPlume * 0.55 + rearPlume * 0.65) * sideEdge * (1.0 - smoothstep(0.25, 0.55, hNorm)), 0.0, 1.0);

              float splatterPattern = dirtTex.r * 0.60 + dirtTex.g * 0.40;
              float mudSupply = uDirtLevel * wheelSprayZone;
              float rawMud = smoothstep(0.32, 0.92, splatterPattern * (0.45 + mudSupply * 0.95)) * mudSupply * 0.62;
              float dustVeil = uDirtLevel * (0.04 + dirtTex.b * 0.08) * (1.0 - hNorm * 0.55);

              if (isGlassMat > 0.5) {
                float edgeGlass = smoothstep(0.35, 0.85, abs(vCarLocalPos.x) / max(0.2, uCarBounds.x));
                rawMud *= edgeGlass * 0.18;
                dustVeil *= 0.28;
              }

              float effectiveDirt = clamp(max(rawMud, dustVeil), 0.0, isGlassMat > 0.5 ? 0.16 : 0.64);

              // Car wash sweep curtain: descends top-to-bottom & sweeps front-to-rear
              if (uWashProgress >= 0.0) {
                float washCoord = (1.0 - hNorm) * 0.62 + (0.5 - vCarLocalPos.z / max(1.0, uCarLength)) * 0.38;
                float edgeNoise = (dirtTex.r - 0.5) * 0.12 + (dirtTex.b - 0.5) * 0.06;
                float waveFront = uWashProgress * 1.24 - 0.12;
                float washedMask = smoothstep(waveFront + 0.07, waveFront - 0.07, washCoord + edgeNoise);

                effectiveDirt *= (1.0 - washedMask);

                float foamBand = exp(-pow((washCoord + edgeNoise - waveFront) / 0.11, 2.0));
                carFoamMask = clamp(foamBand * uWashFoam * (0.55 + dirtTex.r * 0.65), 0.0, 0.94);
                carWetMask = clamp(washedMask * uWashFoam * 1.25, 0.0, 1.0);
              }

              carMudMask = effectiveDirt;

              // Crash damage scuffs, scraped primer/bare metal around bumper corners & rocker flanks
              if (uDamageLevel > 0.01) {
                float bumperZone = smoothstep(uCarLength * 0.30, uCarLength * 0.49, abs(vCarLocalPos.z));
                float flankZone = smoothstep(uCarBounds.x * 0.66, uCarBounds.x * 0.96, abs(vCarLocalPos.x));
                float streakNoise = texture2D(uDirtMap, vec2(vCarLocalPos.z * 2.2, vCarLocalPos.y * 5.8)).r;
                float scratchFactor = (0.15 + bumperZone * 0.72 + flankZone * 0.65) * (1.0 - smoothstep(0.15, 0.62, hNorm));
                float rawScuff = smoothstep(0.76 - uDamageLevel * 0.48 * scratchFactor, 0.98, streakNoise + uDamageLevel * 0.25) * scratchFactor;
                if (isGlassMat > 0.5) {
                  float crackEdge = smoothstep(0.45, 0.92, abs(vCarLocalPos.x) / max(0.2, uCarBounds.x));
                  rawScuff *= crackEdge * 0.48;
                }
                carDmgMask = clamp(rawScuff * uDamageLevel * 0.72, 0.0, 0.58);
              }

              vec3 dryDustCol = vec3(0.32, 0.28, 0.23);
              vec3 wetMudCol = vec3(0.18, 0.12, 0.07);
              float mudClodMix = clamp(rawMud * 1.45, 0.0, 1.0);
              vec3 grimeColor = mix(dryDustCol, wetMudCol, mudClodMix);
              vec3 scrapeColor = isGlassMat > 0.5 ? vec3(0.76, 0.82, 0.88) : mix(vec3(0.14, 0.16, 0.19), vec3(0.48, 0.52, 0.56), dSide.g);

              diffuseColor.rgb *= (1.0 - carWetMask * 0.10);
              diffuseColor.rgb = mix(diffuseColor.rgb, scrapeColor, carDmgMask);
              diffuseColor.rgb = mix(diffuseColor.rgb, grimeColor, carMudMask);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), carFoamMask * 0.86);

              if (isGlassMat > 0.5) {
                diffuseColor.a = clamp(diffuseColor.a + carMudMask * 0.15 + carFoamMask * 0.32 + carDmgMask * 0.15, 0.0, 0.96);
              }
            }`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, 0.68, carDmgMask);
            roughnessFactor = mix(roughnessFactor, 0.94, carMudMask);
            roughnessFactor = mix(roughnessFactor, 0.06, carWetMask * (1.0 - carMudMask) * 0.78);
            roughnessFactor = mix(roughnessFactor, 0.28, carFoamMask);`,
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
            metalnessFactor = mix(metalnessFactor, 0.75, carDmgMask * (1.0 - carMudMask));
            metalnessFactor = mix(metalnessFactor, 0.0, clamp(carMudMask + carFoamMask, 0.0, 1.0));`,
          )
          .replace(
            '#include <lights_physical_fragment>',
            `#include <lights_physical_fragment>
            #ifdef USE_CLEARCOAT
              material.clearcoat = mix(material.clearcoat, 0.0, clamp(carMudMask * 1.15 + carDmgMask * 1.1 + carFoamMask, 0.0, 1.0));
              material.clearcoat = mix(material.clearcoat, 1.0, carWetMask * (1.0 - carMudMask) * 0.9);
              material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.85, max(carMudMask, carDmgMask));
              material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.03, carWetMask * (1.0 - carMudMask));
            #endif`,
          );
      };
    };

    attachDirtShader(bodyMaterial, 'body', false);
    attachDirtShader(carbonMat, 'carbon', false);
    attachDirtShader(glassMat, 'glass', true);
  }

  // 1. High-Resolution Sculpted Lofted Coachwork Hull with Carved Wheel Arches
  const hullMesh = new THREE.Mesh(
    buildSculptedHullGeometry(spec, arch, widthScale),
    bodyMaterial,
  );
  hullMesh.castShadow = !lightweight;
  hullMesh.receiveShadow = true;
  chassisGroup.add(hullMesh);

  // 2. Curved Wrap-Around Glass Canopy + Contoured Painted/Carbon Roof + Cockpit Interior
  const canopyMesh = new THREE.Mesh(
    buildCanopyGeometry(spec, arch, widthScale),
    glassMat,
  );
  canopyMesh.castShadow = !lightweight;
  chassisGroup.add(canopyMesh);

  const isCarbonRoof = arch === 'mclaren' || arch === 'ferrari' || arch === 'jesko';
  const roofMesh = new THREE.Mesh(
    buildContouredRoofGeometry(spec, arch, widthScale),
    isCarbonRoof ? carbonMat : bodyMaterial,
  );
  roofMesh.castShadow = !lightweight;
  chassisGroup.add(roofMesh);

  // Batched geometry pools per material so draw calls stay tiny!
  const darkTrimParts: THREE.BufferGeometry[] = [];
  const carbonParts: THREE.BufferGeometry[] = [];
  const bodyTrimParts: THREE.BufferGeometry[] = [];
  const chromeParts: THREE.BufferGeometry[] = [];

  // Cockpit geometry & dynamic interior gauges + animated steering wheel + first-person anchors
  const isCabForward = arch === 'mclaren' || arch === 'ferrari' || arch === 'jesko';
  const driverX = W * 0.172; // Left-hand drive (+X is driver left when facing +Z)
  const eyeY = clearance + H * 0.855;
  const eyeZ = isCabForward ? L * 0.012 : -L * 0.008;
  const cockpitEyeLocal = new THREE.Vector3(driverX, eyeY, eyeZ);
  const cockpitLookLocal = new THREE.Vector3(driverX, eyeY - 0.11, eyeZ + 20.0);
  const hoodEyeLocal = new THREE.Vector3(0, clearance + H * 0.68, L * 0.20);
  const hoodLookLocal = new THREE.Vector3(0, clearance + H * 0.50, L * 0.20 + 24.0);
  const bumperEyeLocal = new THREE.Vector3(0, clearance + H * 0.44, L * 0.53);
  const bumperLookLocal = new THREE.Vector3(0, clearance + H * 0.40, L * 0.53 + 28.0);

  let steeringWheelRollPivot: THREE.Group | null = null;
  let gaugeTex: THREE.CanvasTexture | null = null;
  let gaugeMat: THREE.MeshStandardMaterial | null = null;
  let cockpitGroupRef: THREE.Group | null = null;
  let updateGaugeCanvas: ((params: {
    active: boolean;
    steerRad: number;
    rpm: number;
    maxRpm: number;
    speedKmh: number;
    gear: number;
    nitro: number;
    nitroMax: number;
    headlightsOn: boolean;
    nitroActive: boolean;
    absActive: boolean;
    tcsActive: boolean;
  }) => void) | null = null;

  if (!lightweight) {
    // Bucket seats with bolsters & headrests (placed safely behind driver eyeZ)
    for (const side of [-1, 1]) {
      const sx = side * W * 0.172;
      addPart(darkTrimParts, new THREE.BoxGeometry(0.32, 0.34, 0.12), sx, clearance + H * 0.58, -L * 0.095, -0.22);
      addPart(darkTrimParts, new THREE.BoxGeometry(0.17, 0.13, 0.08), sx, clearance + H * 0.78, -L * 0.13, -0.14);
    }

    // Interior cockpit assembly attached to chassisGroup so pitch/roll/heave animate naturally
    const cockpitGroup = new THREE.Group();
    cockpitGroupRef = cockpitGroup;
    chassisGroup.add(cockpitGroup);

    const alcantaraMat = new THREE.MeshStandardMaterial({
      color: 0x11141a,
      roughness: 0.86,
      metalness: 0.08,
    });
    const alloyTrimMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.26,
      metalness: 0.86,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.2,
    });

    const dashZ = eyeZ + 0.42;
    const dashDeckY = clearance + H * 0.678;
    const gaugeY = clearance + H * 0.735;
    const swZ = eyeZ + 0.32;
    const swY = clearance + H * 0.702;

    // 1. Sculpted dashboard main shelf (narrowed cleanly inside tapered canopy) & gauge cowl
    const dashDeck = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.48, 0.068, 0.19),
      alcantaraMat,
    );
    dashDeck.position.set(0, dashDeckY, dashZ + 0.03);
    dashDeck.rotation.x = 0.06;
    cockpitGroup.add(dashDeck);

    // Carbon fascia strip across dashboard front
    const dashFascia = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.46, 0.040, 0.032),
      carbonMat,
    );
    dashFascia.position.set(0, dashDeckY - 0.008, dashZ - 0.065);
    cockpitGroup.add(dashFascia);

    // Subtle colored accent pin-stripe matching car body color across passenger dash
    const accentPin = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.18, 0.008, 0.012),
      bodyMaterial,
    );
    accentPin.position.set(-W * 0.105, dashDeckY + 0.005, dashZ - 0.084);
    cockpitGroup.add(accentPin);

    // Hooded instrument binnacle brow directly ahead of driver
    const binnacleBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.275, 0.122, 0.070),
      alcantaraMat,
    );
    binnacleBack.position.set(driverX, gaugeY, dashZ - 0.012);
    binnacleBack.rotation.x = 0.20;
    cockpitGroup.add(binnacleBack);

    const binnacleVisor = new THREE.Mesh(
      new THREE.BoxGeometry(0.290, 0.020, 0.105),
      carbonMat,
    );
    binnacleVisor.position.set(driverX, gaugeY + 0.068, dashZ - 0.032);
    binnacleVisor.rotation.x = 0.14;
    cockpitGroup.add(binnacleVisor);

    // Center console bridge (strictly above hull spine to avoid Z-fighting) + infotainment pod
    const consoleBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.046, 0.48),
      carbonMat,
    );
    consoleBridge.position.set(0, clearance + H * 0.660, eyeZ + 0.18);
    cockpitGroup.add(consoleBridge);

    const centerScreenFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.135, 0.076, 0.022),
      alcantaraMat,
    );
    centerScreenFrame.position.set(0, dashDeckY + 0.022, dashZ - 0.068);
    centerScreenFrame.rotation.x = 0.28;
    centerScreenFrame.rotation.y = -0.14;
    cockpitGroup.add(centerScreenFrame);

    const centerScreenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.118, 0.060),
      new THREE.MeshBasicMaterial({
        color: 0x0c2438,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    centerScreenGlow.position.set(0, 0, -0.016);
    centerScreenGlow.rotation.y = Math.PI;
    centerScreenFrame.add(centerScreenGlow);

    const shifterBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.034, 0.020, 12),
      alloyTrimMat,
    );
    shifterBase.position.set(0, clearance + H * 0.692, eyeZ + 0.20);
    cockpitGroup.add(shifterBase);

    const shifterKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.011, 0.062, 10),
      alloyTrimMat,
    );
    shifterKnob.position.set(0, clearance + H * 0.726, eyeZ + 0.195);
    shifterKnob.rotation.x = -0.16;
    cockpitGroup.add(shifterKnob);

    // Interior Rearview Mirror
    const mirrorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, 0.036, 0.022),
      alcantaraMat,
    );
    mirrorHousing.position.set(0, clearance + H * 0.916, eyeZ + 0.34);
    mirrorHousing.rotation.x = -0.12;
    cockpitGroup.add(mirrorHousing);

    const mirrorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.132, 0.028),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.92,
        roughness: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    mirrorGlass.position.set(0, 0, -0.016);
    mirrorGlass.rotation.y = Math.PI;
    mirrorHousing.add(mirrorGlass);

    // 2. Functional Dynamic Dashboard Gauge Cluster (512x256 CanvasTexture)
    const gaugeW = 512;
    const gaugeH = 256;
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = gaugeW;
    bgCanvas.height = gaugeH;
    const bgCtx = bgCanvas.getContext('2d')!;

    // Pre-render static high-contrast analog/digital dial faceplate once
    const bgGrad = bgCtx.createLinearGradient(0, 0, 0, gaugeH);
    bgGrad.addColorStop(0, '#070b14');
    bgGrad.addColorStop(1, '#03050a');
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, gaugeW, gaugeH);

    // Subtle carbon horizontal scanlines
    bgCtx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < gaugeH; y += 4) {
      bgCtx.fillRect(0, y, gaugeW, 1);
    }

    const drawDialBase = (
      cx: number,
      cy: number,
      r: number,
      maxVal: number,
      step: number,
      redlineFrom: number,
      unitLabel: string,
      accent: string,
    ) => {
      const startDeg = 140;
      const sweepDeg = 260;
      const toRad = (deg: number) => (deg * Math.PI) / 180;

      // Outer bezel ring
      bgCtx.beginPath();
      bgCtx.arc(cx, cy, r + 6, toRad(startDeg - 4), toRad(startDeg + sweepDeg + 4));
      bgCtx.strokeStyle = 'rgba(148,163,184,0.22)';
      bgCtx.lineWidth = 3;
      bgCtx.stroke();

      // Colored base track arc
      bgCtx.beginPath();
      bgCtx.arc(cx, cy, r - 4, toRad(startDeg), toRad(startDeg + sweepDeg));
      bgCtx.strokeStyle = accent;
      bgCtx.lineWidth = 4;
      bgCtx.stroke();

      // Redline arc if applicable
      if (redlineFrom < maxVal) {
        const redFrac = redlineFrom / maxVal;
        bgCtx.beginPath();
        bgCtx.arc(
          cx,
          cy,
          r - 4,
          toRad(startDeg + sweepDeg * redFrac),
          toRad(startDeg + sweepDeg),
        );
        bgCtx.strokeStyle = '#ef4444';
        bgCtx.lineWidth = 5;
        bgCtx.stroke();
      }

      // Tick marks & crisp numerals
      bgCtx.textAlign = 'center';
      bgCtx.textBaseline = 'middle';
      bgCtx.font = '700 13px monospace';
      for (let v = 0; v <= maxVal; v += step * 0.5) {
        const frac = v / maxVal;
        const ang = toRad(startDeg + sweepDeg * frac);
        const isMajor = Math.abs(v / step - Math.round(v / step)) < 0.01;
        const isRed = v >= redlineFrom;
        const rIn = isMajor ? r - 18 : r - 11;
        const rOut = r - 4;

        bgCtx.beginPath();
        bgCtx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
        bgCtx.lineTo(cx + Math.cos(ang) * rOut, cy + Math.sin(ang) * rOut);
        bgCtx.strokeStyle = isRed ? '#f87171' : isMajor ? '#f8fafc' : 'rgba(203,213,225,0.45)';
        bgCtx.lineWidth = isMajor ? 2.6 : 1.3;
        bgCtx.stroke();

        if (isMajor) {
          const rTxt = r - 31;
          bgCtx.fillStyle = isRed ? '#fca5a5' : '#e2e8f0';
          bgCtx.fillText(String(Math.round(v)), cx + Math.cos(ang) * rTxt, cy + Math.sin(ang) * rTxt);
        }
      }

      bgCtx.fillStyle = 'rgba(148,163,184,0.85)';
      bgCtx.font = '700 11px sans-serif';
      bgCtx.fillText(unitLabel, cx, cy + r * 0.44);
    };

    drawDialBase(116, 146, 86, 9, 1, 7.2, 'RPM x1000', 'rgba(56,189,248,0.45)');
    drawDialBase(396, 146, 86, 400, 50, 999, 'KM/H', 'rgba(245,158,11,0.42)');

    // Center digital telemetry frame
    bgCtx.fillStyle = 'rgba(15,23,42,0.88)';
    bgCtx.fillRect(204, 48, 104, 178);
    bgCtx.strokeStyle = 'rgba(56,189,248,0.35)';
    bgCtx.lineWidth = 2;
    bgCtx.strokeRect(204, 48, 104, 178);

    const liveCanvas = document.createElement('canvas');
    liveCanvas.width = gaugeW;
    liveCanvas.height = gaugeH;
    const liveCtx = liveCanvas.getContext('2d')!;
    liveCtx.drawImage(bgCanvas, 0, 0);

    gaugeTex = new THREE.CanvasTexture(liveCanvas);
    gaugeTex.colorSpace = THREE.SRGBColorSpace;
    gaugeTex.generateMipmaps = false;
    gaugeTex.minFilter = THREE.LinearFilter;
    gaugeTex.magFilter = THREE.LinearFilter;

    gaugeMat = new THREE.MeshStandardMaterial({
      map: gaugeTex,
      emissiveMap: gaugeTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.92,
      roughness: 0.22,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // Attach directly as child of binnacleBack with 9mm clean clearance (zero Z-fighting)
    const gaugePanel = new THREE.Mesh(new THREE.PlaneGeometry(0.255, 0.112), gaugeMat);
    gaugePanel.position.set(0, 0, -0.044);
    gaugePanel.rotation.y = Math.PI; // Normal points toward driver (-Z) with upright non-mirrored UVs
    binnacleBack.add(gaugePanel);

    let smoothedGaugeRpmNorm = 0.1;
    let smoothedGaugeSpeed = 0;
    let lastDrawStamp = '';

    const drawNeedle = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      r: number,
      frac: number,
      needleColor: string,
    ) => {
      const ang = ((140 + 260 * THREE.MathUtils.clamp(frac, 0, 1)) * Math.PI) / 180;
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);

      // Soft needle glow
      ctx.save();
      ctx.strokeStyle = needleColor;
      ctx.shadowColor = needleColor;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - nx * 12, cy - ny * 12);
      ctx.lineTo(cx + nx * (r - 12), cy + ny * (r - 12));
      ctx.stroke();

      // Center cap
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    updateGaugeCanvas = ({
      active,
      rpm,
      maxRpm,
      speedKmh,
      gear,
      nitro,
      nitroMax,
      headlightsOn,
      nitroActive,
      absActive,
      tcsActive,
    }) => {
      if (!gaugeTex || !gaugeMat) return;
      gaugeMat.emissiveIntensity = headlightsOn ? 1.15 : 0.92;
      if (!active) return;

      const targetRpmNorm = THREE.MathUtils.clamp(rpm / Math.max(1000, maxRpm), 0, 1);
      smoothedGaugeRpmNorm += (targetRpmNorm - smoothedGaugeRpmNorm) * 0.35;
      smoothedGaugeSpeed += (speedKmh - smoothedGaugeSpeed) * 0.35;

      const speedInt = Math.round(smoothedGaugeSpeed);
      const rpmBucket = Math.round(smoothedGaugeRpmNorm * 180);
      const nitroBucket = Math.round((nitro / Math.max(1, nitroMax)) * 40);
      const stamp = `${speedInt}|${rpmBucket}|${gear}|${nitroBucket}|${headlightsOn ? 1 : 0}|${nitroActive ? 1 : 0}|${absActive ? 1 : 0}|${tcsActive ? 1 : 0}`;
      if (stamp === lastDrawStamp) return;
      lastDrawStamp = stamp;

      liveCtx.drawImage(bgCanvas, 0, 0);

      // Top 7-LED RPM shift light bar
      const ledColors = ['#22c55e', '#22c55e', '#22c55e', '#f59e0b', '#f59e0b', '#ef4444', '#ef4444'];
      for (let i = 0; i < 7; i++) {
        const thresh = 0.52 + i * 0.068;
        const lit = smoothedGaugeRpmNorm >= thresh;
        const lx = 190 + i * 22;
        liveCtx.fillStyle = lit ? ledColors[i] : 'rgba(51,65,85,0.45)';
        liveCtx.beginPath();
        liveCtx.arc(lx, 20, 6, 0, Math.PI * 2);
        liveCtx.fill();
      }

      // Active RPM sweep glow arc
      const rpmEndRad = ((140 + 260 * smoothedGaugeRpmNorm) * Math.PI) / 180;
      liveCtx.beginPath();
      liveCtx.arc(116, 146, 82, (140 * Math.PI) / 180, rpmEndRad);
      liveCtx.strokeStyle = smoothedGaugeRpmNorm > 0.84 ? '#ef4444' : '#38bdf8';
      liveCtx.lineWidth = 6;
      liveCtx.stroke();

      // Analog needles (Tach scaled to 9000 RPM dial, Speedo scaled to 400 km/h)
      const tachFrac = THREE.MathUtils.clamp((rpm / Math.max(1000, maxRpm)) * (Math.min(9000, maxRpm) / 9000), 0, 1);
      const speedFrac = THREE.MathUtils.clamp(smoothedGaugeSpeed / 400, 0, 1);
      drawNeedle(liveCtx, 116, 146, 86, tachFrac, '#ff3b5c');
      drawNeedle(liveCtx, 396, 146, 86, speedFrac, '#38bdf8');

      // Center Gear Box
      const gearStr = gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear);
      liveCtx.textAlign = 'center';
      liveCtx.textBaseline = 'middle';
      liveCtx.fillStyle = nitroActive ? '#38bdf8' : smoothedGaugeRpmNorm > 0.88 ? '#ef4444' : '#fbbf24';
      liveCtx.font = '800 50px sans-serif';
      liveCtx.fillText(gearStr, 256, 88);

      // Center Digital Speed
      liveCtx.fillStyle = '#f8fafc';
      liveCtx.font = '700 32px monospace';
      liveCtx.fillText(String(Math.max(0, Math.round(speedKmh))), 256, 140);
      liveCtx.fillStyle = '#94a3b8';
      liveCtx.font = '700 10px sans-serif';
      liveCtx.fillText('KM/H', 256, 163);

      // Center NOS Gauge Bar
      const nitroRatio = THREE.MathUtils.clamp(nitro / Math.max(1, nitroMax), 0, 1);
      liveCtx.fillStyle = '#0f172a';
      liveCtx.fillRect(216, 180, 80, 10);
      liveCtx.fillStyle = nitroActive ? '#7dd3fc' : '#0ea5e9';
      liveCtx.fillRect(216, 180, 80 * nitroRatio, 10);
      liveCtx.fillStyle = nitroActive ? '#e0f2fe' : '#64748b';
      liveCtx.font = '700 9px sans-serif';
      liveCtx.fillText(nitroActive ? 'NOS ACTIVE' : 'NOS', 256, 198);

      // Telltale warning indicators (HL / ABS / TCS)
      liveCtx.font = '800 9px sans-serif';
      liveCtx.fillStyle = headlightsOn ? '#38bdf8' : 'rgba(71,85,105,0.45)';
      liveCtx.fillText('BEAM', 222, 216);
      liveCtx.fillStyle = absActive ? '#fbbf24' : 'rgba(71,85,105,0.45)';
      liveCtx.fillText('ABS', 256, 216);
      liveCtx.fillStyle = tcsActive ? '#fbbf24' : 'rgba(71,85,105,0.45)';
      liveCtx.fillText('TCS', 288, 216);

      gaugeTex.needsUpdate = true;
    };

    // 3. Functional Tilted 3D Racing Steering Wheel & Column
    const columnPivot = new THREE.Group();
    columnPivot.position.set(driverX, swY, swZ);
    // Tilt column +X so wheel face normal (0,0,-1) angles slightly upward toward driver's eyes
    columnPivot.rotation.x = 0.24;
    cockpitGroup.add(columnPivot);

    const columnShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.032, 0.22, 12),
      carbonMat,
    );
    columnShaft.rotation.x = Math.PI / 2;
    columnShaft.position.set(0, 0, 0.11);
    columnPivot.add(columnShaft);

    steeringWheelRollPivot = new THREE.Group();
    columnPivot.add(steeringWheelRollPivot);

    // Outer wheel rim
    const swR = 0.116;
    const swRim = new THREE.Mesh(
      new THREE.TorusGeometry(swR, 0.0145, 10, 28),
      alcantaraMat,
    );
    steeringWheelRollPivot.add(swRim);

    // Sculpted side grip bolsters (9 & 3 o'clock)
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0175, 0.0175, 0.068, 10),
        carbonMat,
      );
      grip.position.set(side * swR, 0, 0);
      steeringWheelRollPivot.add(grip);

      // Horizontal brushed aluminum spoke
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(swR * 0.92, 0.024, 0.012),
        alloyTrimMat,
      );
      spoke.position.set(side * swR * 0.46, -0.008, 0.004);
      steeringWheelRollPivot.add(spoke);

      // Shift paddle behind rim
      const paddle = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.056, 0.006),
        alloyTrimMat,
      );
      paddle.position.set(side * (swR * 0.68), 0.012, 0.024);
      paddle.rotation.z = side * -0.14;
      steeringWheelRollPivot.add(paddle);
    }

    // Bottom 6-o'clock vertical spoke
    const bottomSpoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, swR * 0.9, 0.012),
      alloyTrimMat,
    );
    bottomSpoke.position.set(0, -swR * 0.46, 0.004);
    steeringWheelRollPivot.add(bottomSpoke);

    // Vivid 12-o'clock centering stripe (makes steering angle unmistakable at speed!)
    const topBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0165, 0.0165, 0.024, 12),
      stripeMat,
    );
    topBand.rotation.z = Math.PI / 2;
    topBand.position.set(0, swR, 0);
    steeringWheelRollPivot.add(topBand);

    // Center hub boss + metallic emblem ring
    const swHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.048, 0.032, 18),
      alcantaraMat,
    );
    swHub.rotation.x = Math.PI / 2;
    swHub.position.set(0, -0.006, 0.004);
    steeringWheelRollPivot.add(swHub);

    const hubRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.0035, 6, 18),
      alloyTrimMat,
    );
    hubRing.position.set(0, -0.006, -0.013);
    steeringWheelRollPivot.add(hubRing);

    const hubBadge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.004, 14),
      bodyMaterial,
    );
    hubBadge.rotation.x = Math.PI / 2;
    hubBadge.position.set(0, -0.006, -0.016);
    steeringWheelRollPivot.add(hubBadge);

    // Ensure exterior directional shadow crawl never flickers across interior gauges/trim
    cockpitGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });
  }

  // Flush A-pillars tucked inside windshield side edges & Flying Buttress C-pillars
  for (const side of [-1, 1]) {
    const aPillar = new THREE.CylinderGeometry(0.016, 0.022, L * 0.16, 8);
    aPillar.rotateX(Math.PI / 2);
    addPart(
      darkTrimParts,
      aPillar,
      side * W * 0.268 * widthScale,
      clearance + H * 0.75,
      L * 0.185,
      0.72,
      side * -0.14,
    );

    if (arch === 'mclaren' || arch === 'ferrari' || arch === 'jesko') {
      // Flying buttress aero bridges flanking rear engine deck flush to roof
      const buttress = new THREE.BoxGeometry(0.068, 0.055, L * 0.22);
      addPart(
        bodyTrimParts,
        buttress,
        side * W * 0.258 * widthScale,
        clearance + H * 0.74,
        -L * 0.19,
        -0.36,
        side * 0.12,
      );
    }
  }

  // 3. Bespoke Archetype Details (Engine Louvers, Dorsal Fins, Fender Vents, Side Intakes)
  if (arch === 'jesko') {
    // Jesko Absolut twin vertical dorsal aero stabilizer fins
    for (const side of [-1, 1]) {
      const fin = new THREE.BoxGeometry(0.032, H * 0.34, L * 0.28);
      addPart(carbonParts, fin, side * W * 0.20, clearance + H * 0.76, -L * 0.31, -0.18);
    }
  } else if (arch === 'mclaren' || arch === 'ferrari') {
    // Rear engine bay louvered slats
    for (let li = 0; li < 4; li++) {
      addPart(
        darkTrimParts,
        new THREE.BoxGeometry(W * 0.40, 0.018, 0.055),
        0,
        clearance + H * 0.70 - li * 0.022,
        -L * (0.24 + li * 0.045),
        -0.16,
      );
    }
    if (arch === 'ferrari') {
      // Signature twin crimson intake manifold valve covers visible behind rear deck
      const manifoldMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.35,
        metalness: 0.45,
      });
      const valveGeo = new THREE.BoxGeometry(0.11, 0.05, L * 0.16);
      for (const side of [-1, 1]) {
        const vc = new THREE.Mesh(valveGeo, manifoldMat);
        vc.position.set(side * 0.14, clearance + H * 0.65, -L * 0.28);
        chassisGroup.add(vc);
      }
    }
  }

  // Front Hood NACA/Extraction Vents & Sculpted Side Air Blades
  for (const side of [-1, 1]) {
    addPart(
      darkTrimParts,
      new THREE.BoxGeometry(0.18, 0.026, 0.36),
      side * W * 0.16,
      clearance + H * 0.50,
      L * 0.30,
      0.24,
    );

    if (arch === 'mclaren' || arch === 'ferrari' || arch === 'jesko') {
      // Deep sculpted side intake ducts + carbon air splitter strake
      addPart(
        darkTrimParts,
        new THREE.BoxGeometry(0.09, H * 0.26, L * 0.19),
        side * W * 0.44 * widthScale,
        clearance + H * 0.39,
        -L * 0.09,
      );
      addPart(
        carbonParts,
        new THREE.BoxGeometry(0.025, H * 0.28, 0.12),
        side * W * 0.475 * widthScale,
        clearance + H * 0.39,
        -L * 0.04,
      );
    }

    // Teardrop stalk side mirrors
    const stalk = new THREE.CylinderGeometry(0.014, 0.018, 0.11, 6);
    addPart(
      carbonParts,
      stalk,
      side * W * 0.455 * widthScale,
      clearance + H * 0.61,
      L * 0.14,
      0,
      0,
      side * -0.75,
    );
    const mirrorHousing = new THREE.SphereGeometry(0.072, 10, 8);
    mirrorHousing.scale(1.35, 0.52, 0.85);
    addPart(
      carbonParts,
      mirrorHousing,
      side * W * 0.505 * widthScale,
      clearance + H * 0.655,
      L * 0.135,
      0,
      side * -0.18,
    );
  }

  // 4. Sculpted Curved Front Splitter + Corner Dive-Plane Canards + Side Skirts + Rear Diffuser
  const splitterExtend = isWide ? 0.16 : isStreetKit ? 0.11 : 0.07;
  addPart(
    carbonParts,
    buildCurvedSplitterGeometry(W * widthScale * 0.48, 0.22 + splitterExtend),
    0,
    clearance + 0.032,
    L * 0.39,
  );

  if (isWide || arch === 'porsche' || arch === 'mclaren' || arch === 'jesko') {
    // Front corner aero canard dive-planes
    for (const side of [-1, 1]) {
      addPart(
        carbonParts,
        new THREE.BoxGeometry(0.09, 0.02, 0.24),
        side * W * 0.445 * widthScale,
        clearance + H * 0.16,
        L * 0.425,
        -0.14,
        side * 0.35,
        side * 0.18,
      );
    }
  }

  // Front mesh radiator mouth + Rear exhaust fascia grille + Multi-strake Diffuser
  addPart(darkTrimParts, new THREE.BoxGeometry(W * 0.56, H * 0.10, 0.07), 0, clearance + H * 0.14, L * 0.488);
  addPart(darkTrimParts, new THREE.BoxGeometry(W * 0.70, H * 0.18, 0.05), 0, clearance + H * 0.36, -L * 0.494);
  addPart(carbonParts, new THREE.BoxGeometry(W * 0.80, 0.11, 0.15), 0, clearance + 0.10, -L * 0.498);

  for (const fx of [-0.34, -0.17, 0, 0.17, 0.34]) {
    addPart(carbonParts, new THREE.BoxGeometry(0.022, 0.13, 0.18), fx * W * 0.5, clearance + 0.10, -L * 0.504);
  }

  for (const side of [-1, 1]) {
    addPart(
      carbonParts,
      new THREE.BoxGeometry(0.095, 0.042, L * 0.48),
      side * W * 0.465 * widthScale,
      clearance + 0.048,
      0,
    );
    // Rear side-skirt aero flick
    addPart(
      carbonParts,
      new THREE.BoxGeometry(0.025, 0.11, 0.16),
      side * W * 0.485 * widthScale,
      clearance + 0.095,
      -L * 0.19,
    );
  }

  // 5. Recessed Wheel-Well Arch Inner Liners
  const archGeo = new THREE.CylinderGeometry(wheelR * 1.12, wheelR * 1.12, 0.34, 16, 1, false, 0, Math.PI);
  archGeo.rotateZ(Math.PI / 2);
  const frontZ = L * 0.305;
  const rearZ = -L * 0.305;
  const trackX = W * 0.425 * widthScale;
  for (const [wx, wz] of [
    [trackX * 0.92, frontZ],
    [-trackX * 0.92, frontZ],
    [trackX * 0.92, rearZ],
    [-trackX * 0.92, rearZ],
  ]) {
    addPart(darkTrimParts, archGeo.clone(), wx, wheelR * 0.94, wz);
  }
  archGeo.dispose();

  // 6. Sculpted Cambered Airfoil Rear Wing or Integrated Ducktail
  if (customization.spoiler !== 'none') {
    if (customization.spoiler === 'lip') {
      addPart(
        carbonParts,
        buildAirfoilWingGeometry(W * 0.78, 0.12),
        0,
        clearance + H * 0.62,
        -L * 0.465,
        -0.18,
      );
    } else {
      const isSwan = customization.spoiler === 'swan_neck' || arch === 'porsche' || arch === 'mclaren';
      const wingW = isSwan ? W * 0.96 : W * 0.88;
      const wingY = clearance + H * (isSwan ? 0.94 : 0.84);
      addPart(
        carbonParts,
        buildAirfoilWingGeometry(wingW, 0.24),
        0,
        wingY,
        -L * 0.468,
        0.09,
      );

      for (const side of [-1, 1]) {
        // Trapezoidal carbon endplate
        addPart(
          carbonParts,
          new THREE.BoxGeometry(0.022, 0.15, 0.31),
          side * wingW * 0.5,
          wingY - 0.015,
          -L * 0.468,
        );
        // Swept swan-neck upright pylon
        const upH = wingY - (clearance + H * 0.58);
        addPart(
          darkTrimParts,
          new THREE.BoxGeometry(0.032, upH, 0.12),
          side * W * 0.21,
          wingY - upH * 0.5,
          -L * 0.445,
          -0.16,
        );
      }
    }
  }

  // 7. Chrome/Titanium Exhaust Tips & Volumetric Multi-Stage Mach-Diamond Nitro Afterburners
  const nitroFlames: THREE.Mesh[] = [];
  const exhaustAnchors: THREE.Vector3[] = [];
  const nozzleGlowMeshes: THREE.Mesh[] = [];
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.96,
    roughness: 0.14,
  });

  const buildPlumeLathe = (maxR: number, len: number): THREE.LatheGeometry => {
    const pts: THREE.Vector2[] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const expand = t < 0.16 ? THREE.MathUtils.lerp(0.62, 1.05, t / 0.16) : 1.05 * Math.pow(1 - (t - 0.16) / 0.84, 0.72);
      const shockWave = 1 + Math.sin(t * Math.PI * 5.0) * 0.08 * (1 - t);
      pts.push(new THREE.Vector2(Math.max(0.003, maxR * expand * shockWave), t * len));
    }
    return new THREE.LatheGeometry(pts, 18);
  };

  const flameOuterGeo = buildPlumeLathe(0.078, 1.12);
  const flameInnerGeo = buildPlumeLathe(0.044, 0.78);
  const nozzleDiscGeo = new THREE.CircleGeometry(0.041, 14);

  const flameUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
    uBackfire: { value: 0 },
  };

  const flameOuterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: flameUniforms.uTime,
      uIntensity: flameUniforms.uIntensity,
      uBackfire: flameUniforms.uBackfire,
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float axial = uv.y;
        float flutter = pow(axial, 1.25);
        float waveA = sin(axial * 19.0 - uTime * 52.0 + pos.x * 16.0);
        float waveB = cos(axial * 27.0 - uTime * 68.0 + pos.z * 16.0);
        pos.x += waveA * 0.018 * flutter;
        pos.z += waveB * 0.018 * flutter;

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uBackfire;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        float t = clamp(vUv.y, 0.0, 1.0);
        float fresnel = pow(abs(dot(normalize(vViewNormal), normalize(vViewDir))), 1.35);

        // Turbulent supersonic combustion streaks & Mach shock diamonds
        float flow = t * 14.0 - uTime * 42.0;
        float streaks = 0.5 + 0.5 * sin(vUv.x * 18.85 + sin(flow * 0.65) * 2.2);
        float turbulence = 0.65 + 0.35 * sin(flow * 1.4 + vUv.x * 12.56);
        float shockDiamond = pow(max(0.0, sin(t * 22.0 - uTime * 22.0)), 4.0) * (1.0 - t * 0.8);

        // Root fade-in + ragged licking tail dissolve
        float rootIn = smoothstep(0.0, 0.08, t);
        float tailCut = smoothstep(1.0, 0.28 + streaks * 0.22, t);
        float alpha = rootIn * tailCut * fresnel * turbulence * uIntensity;
        if (alpha <= 0.01) discard;

        // Multi-stage Nitro color temperature (White-Cyan Plasma -> Electric Blue -> Fiery Orange/Red)
        vec3 rootCyan = vec3(0.75, 0.96, 1.0);
        vec3 midViolet = vec3(0.26, 0.62, 1.0);
        vec3 flameOrange = vec3(1.0, 0.46, 0.08);
        vec3 tailCrimson = vec3(0.95, 0.16, 0.03);

        vec3 nitroCol = mix(rootCyan, midViolet, smoothstep(0.06, 0.34, t));
        nitroCol = mix(nitroCol, flameOrange, smoothstep(0.28, 0.66, t));
        nitroCol = mix(nitroCol, tailCrimson, smoothstep(0.62, 0.96, t));
        nitroCol += vec3(0.55, 0.85, 1.0) * shockDiamond * 0.85;

        // Backfire pop palette (molten gold-orange unburnt fuel blast)
        vec3 bfCol = mix(vec3(1.0, 0.92, 0.55), vec3(1.0, 0.40, 0.06), smoothstep(0.08, 0.55, t));
        bfCol = mix(bfCol, tailCrimson, smoothstep(0.52, 0.95, t));

        vec3 finalRgb = mix(nitroCol, bfCol, clamp(uBackfire, 0.0, 1.0));
        gl_FragColor = vec4(finalRgb * (1.15 + shockDiamond * 0.6), clamp(alpha * 0.86, 0.0, 1.0));
      }
    `,
  });

  const flameInnerMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: flameUniforms.uTime,
      uIntensity: flameUniforms.uIntensity,
      uBackfire: flameUniforms.uBackfire,
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vec3 pos = position;
        float flutter = pow(uv.y, 1.4);
        pos.x += sin(uv.y * 24.0 - uTime * 64.0) * 0.009 * flutter;
        pos.z += cos(uv.y * 24.0 - uTime * 64.0) * 0.009 * flutter;
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uBackfire;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewDir;

      void main() {
        float t = clamp(vUv.y, 0.0, 1.0);
        float fresnel = pow(abs(dot(normalize(vViewNormal), normalize(vViewDir))), 1.1);
        float diamonds = 0.55 + 0.45 * pow(max(0.0, sin(t * 25.0 - uTime * 28.0)), 3.0);
        float alpha = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.18, t) * fresnel * uIntensity;
        if (alpha <= 0.01) discard;

        vec3 coreNitro = mix(vec3(0.96, 0.99, 1.0), vec3(0.35, 0.84, 1.0), smoothstep(0.15, 0.85, t));
        vec3 coreBf = mix(vec3(1.0, 0.97, 0.78), vec3(1.0, 0.58, 0.14), smoothstep(0.15, 0.85, t));
        vec3 col = mix(coreNitro, coreBf, clamp(uBackfire, 0.0, 1.0)) * (1.35 * diamonds);
        gl_FragColor = vec4(col, clamp(alpha * 0.95, 0.0, 1.0));
      }
    `,
  });

  const nozzleGlowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const isCenterExhaust =
    customization.exhaust === 'titanium_center' || arch === 'mclaren' || arch === 'porsche' || arch === 'ferrari';
  const exhaustY =
    arch === 'mclaren'
      ? clearance + H * 0.45
      : arch === 'ferrari'
        ? clearance + H * 0.32
        : clearance + 0.13;
  const exhaustOffsets =
    customization.exhaust === 'quad'
      ? isCenterExhaust
        ? [-0.18, -0.06, 0.06, 0.18]
        : [-0.34, -0.22, 0.22, 0.34]
      : isCenterExhaust
        ? [-0.085, 0.085]
        : [-0.28, 0.28];

  for (const ex of exhaustOffsets) {
    const tipGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.14, 12, 1, true);
    tipGeo.rotateX(Math.PI / 2);
    addPart(chromeParts, tipGeo, ex, exhaustY, -L * 0.50);

    exhaustAnchors.push(new THREE.Vector3(ex, exhaustY, -L * 0.515));

    const nozzleDisc = new THREE.Mesh(nozzleDiscGeo, nozzleGlowMat);
    nozzleDisc.rotation.y = Math.PI;
    nozzleDisc.position.set(ex, exhaustY, -L * 0.485);
    nozzleDisc.visible = false;
    chassisGroup.add(nozzleDisc);
    nozzleGlowMeshes.push(nozzleDisc);

    const outerFlame = new THREE.Mesh(flameOuterGeo, flameOuterMat);
    outerFlame.rotation.x = -Math.PI / 2;
    outerFlame.position.set(ex, exhaustY, -L * 0.505);
    outerFlame.visible = false;

    const innerFlame = new THREE.Mesh(flameInnerGeo, flameInnerMat);
    outerFlame.add(innerFlame);

    chassisGroup.add(outerFlame);
    nitroFlames.push(outerFlame);
  }

  // Merge all batched detail meshes into just 4 ultra-fast draw calls!
  const mergedDark = safeMerge(darkTrimParts);
  if (mergedDark) {
    const m = new THREE.Mesh(mergedDark, darkTrimMat);
    chassisGroup.add(m);
  }
  const mergedCarbon = safeMerge(carbonParts);
  if (mergedCarbon) {
    const m = new THREE.Mesh(mergedCarbon, carbonMat);
    m.castShadow = !lightweight;
    chassisGroup.add(m);
  }
  const mergedBodyTrim = safeMerge(bodyTrimParts);
  if (mergedBodyTrim) {
    const m = new THREE.Mesh(mergedBodyTrim, bodyMaterial);
    m.castShadow = !lightweight;
    chassisGroup.add(m);
  }
  const mergedChrome = safeMerge(chromeParts);
  if (mergedChrome) {
    chassisGroup.add(new THREE.Mesh(mergedChrome, exhaustMat));
  }

  // 8. Bespoke Signature Headlights & Taillights Per Car Archetype
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xdbeafe,
    emissiveIntensity: 1.05,
    roughness: 0.14,
  });
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xff2244,
    emissiveIntensity: 0.95,
    roughness: 0.16,
  });

  const headParts: THREE.BufferGeometry[] = [];
  const tailParts: THREE.BufferGeometry[] = [];
  const lampBucketParts: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1]) {
    if (arch === 'porsche') {
      // Iconic raised oval 911 frog-eye headlamp pods
      const pod = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 16);
      pod.rotateX(Math.PI * 0.34);
      addPart(lampBucketParts, pod.clone(), side * W * 0.33, clearance + H * 0.38, L * 0.415, 0, side * 0.14);
      const lens = new THREE.CylinderGeometry(0.095, 0.095, 0.03, 16);
      lens.rotateX(Math.PI * 0.34);
      addPart(headParts, lens, side * W * 0.33, clearance + H * 0.388, L * 0.425, 0, side * 0.14);
      pod.dispose();
    } else if (arch === 'mclaren') {
      // McLaren eye-socket recess + crisp twin-bar curved boomerang LED DRL signature
      addPart(
        lampBucketParts,
        new THREE.BoxGeometry(0.30, 0.125, 0.105),
        side * W * 0.325,
        clearance + H * 0.288,
        L * 0.452,
        0.18,
        side * 0.34,
      );
      addPart(
        headParts,
        new THREE.BoxGeometry(0.28, 0.024, 0.055),
        side * W * 0.33,
        clearance + H * 0.315,
        L * 0.468,
        0.18,
        side * 0.34,
      );
      addPart(
        headParts,
        new THREE.BoxGeometry(0.25, 0.020, 0.052),
        side * W * 0.33,
        clearance + H * 0.268,
        L * 0.474,
        0.18,
        side * 0.34,
      );
    } else {
      // Aggressive swept twin LED projector blade headlights (Ferrari / Jesko / Supra / GT-R)
      addPart(
        lampBucketParts,
        new THREE.BoxGeometry(0.30, 0.095, 0.10),
        side * W * 0.325,
        clearance + H * 0.315,
        L * 0.452,
        0.15,
        side * 0.28,
      );
      addPart(
        headParts,
        new THREE.BoxGeometry(0.26, 0.022, 0.045),
        side * W * 0.33,
        clearance + H * 0.335,
        L * 0.468,
        0.15,
        side * 0.28,
      );
      addPart(
        headParts,
        new THREE.BoxGeometry(0.23, 0.018, 0.045),
        side * W * 0.33,
        clearance + H * 0.295,
        L * 0.474,
        0.15,
        side * 0.28,
      );
    }

    // Taillight signature per archetype
    if (arch === 'gtr') {
      // Classic Quad Afterburner Ring Taillights (Nissan GT-R!)
      for (const ringOff of [0.22, 0.36]) {
        const ring = new THREE.TorusGeometry(0.058, 0.015, 8, 18);
        addPart(tailParts, ring, side * W * ringOff, clearance + H * 0.46, -L * 0.502);
      }
    } else if (arch === 'ferrari') {
      // Twin rounded-square Ferrari afterburner lamps
      for (const lampOff of [0.23, 0.35]) {
        addPart(
          tailParts,
          new THREE.BoxGeometry(0.095, 0.068, 0.03),
          side * W * lampOff,
          clearance + H * 0.45,
          -L * 0.503,
        );
      }
    } else if (arch === 'jesko') {
      // Vertical razor blade LED rear lamps
      addPart(
        tailParts,
        new THREE.BoxGeometry(0.045, 0.18, 0.04),
        side * W * 0.33,
        clearance + H * 0.44,
        -L * 0.501,
        0,
        0,
        side * -0.18,
      );
    } else {
      // Sleek razor LED tail blades
      addPart(
        tailParts,
        new THREE.BoxGeometry(W * 0.26, 0.022, 0.04),
        side * W * 0.27,
        clearance + H * 0.46,
        -L * 0.503,
        0,
        side * -0.10,
      );
    }
  }

  if (arch === 'porsche') {
    // Full-width Porsche rear lightbar connecting both wings
    addPart(
      tailParts,
      new THREE.BoxGeometry(W * 0.72, 0.026, 0.036),
      0,
      clearance + H * 0.47,
      -L * 0.504,
    );
  }

  const mergedBuckets = safeMerge(lampBucketParts);
  if (mergedBuckets) chassisGroup.add(new THREE.Mesh(mergedBuckets, darkTrimMat));
  const mergedHeads = safeMerge(headParts);
  if (mergedHeads) chassisGroup.add(new THREE.Mesh(mergedHeads, headlightMaterial));
  const mergedTails = safeMerge(tailParts);
  if (mergedTails) chassisGroup.add(new THREE.Mesh(mergedTails, taillightMaterial));

  // 9. Optional Underglow
  if (customization.neonColor !== 'none') {
    const neonMat = new THREE.MeshBasicMaterial({
      color: customization.neonColor,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const neonPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.15, L * 0.92), neonMat);
    neonPlane.rotation.x = -Math.PI / 2;
    neonPlane.position.y = 0.035;
    root.add(neonPlane);
  }

  // 10. Grounded Radial Contact Shadow
  if (options?.contactShadowMap) {
    const shadowMat = new THREE.MeshBasicMaterial({
      map: options.contactShadowMap,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.38, L * 1.24), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.025;
    root.add(shadowPlane);
  }

  // 11. Four Flush Independent Michelin-Profile Wheel Assemblies
  const wheelW = 0.28;
  const caliperHex =
    arch === 'mclaren' || arch === 'ferrari'
      ? 0xe11d48
      : arch === 'porsche'
        ? 0xf59e0b
        : 0xdc2626;

  const wheelSteerFL = new THREE.Group();
  wheelSteerFL.position.set(trackX, wheelR, frontZ);
  const wheelFL = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor, caliperHex, 1, lightweight);
  wheelSteerFL.add(wheelFL);
  root.add(wheelSteerFL);

  const wheelSteerFR = new THREE.Group();
  wheelSteerFR.position.set(-trackX, wheelR, frontZ);
  const wheelFR = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor, caliperHex, -1, lightweight);
  wheelSteerFR.add(wheelFR);
  root.add(wheelSteerFR);

  const wheelRL = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor, caliperHex, 1, lightweight);
  wheelRL.position.set(trackX, wheelR, rearZ);
  root.add(wheelRL);

  const wheelRR = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor, caliperHex, -1, lightweight);
  wheelRR.position.set(-trackX, wheelR, rearZ);
  root.add(wheelRR);

  const wheelSpinners = [wheelFL, wheelFR, wheelRL, wheelRR];

  return {
    root,
    chassisGroup,
    wheelSteerFL,
    wheelSteerFR,
    wheelSpinners,
    bodyMaterial,
    taillightMaterial,
    headlightMaterial,
    nitroFlames,
    setLights: (headlights, braking, nitro, timeSec = 0, backfireOnly = false) => {
      headlightMaterial.emissiveIntensity = headlights ? 1.65 : 0.95;
      taillightMaterial.emissiveIntensity = braking ? 2.15 : headlights ? 1.25 : 0.75;
      flameUniforms.uTime.value = timeSec;
      flameUniforms.uBackfire.value = backfireOnly ? 1.0 : 0.0;
      flameUniforms.uIntensity.value = backfireOnly ? 0.92 : 1.05;
      nozzleGlowMat.color.setHex(backfireOnly ? 0xf97316 : 0x38bdf8);

      for (let i = 0; i < nitroFlames.length; i++) {
        const f = nitroFlames[i];
        f.visible = nitro;
        if (nozzleGlowMeshes[i]) {
          nozzleGlowMeshes[i].visible = nitro;
        }
        if (nitro) {
          const pulse =
            Math.sin(timeSec * 58 + i * 2.1) * 0.12 +
            Math.cos(timeSec * 89 + i * 1.3) * 0.08;
          const baseLen = backfireOnly ? 0.62 : 1.05;
          const radial = backfireOnly ? 0.92 : 1.0 + pulse * 0.35;
          f.scale.set(radial, Math.max(0.38, baseLen + pulse), radial);
        }
      }
    },
    setWheels: (steerRad, spinDeltaRad) => {
      wheelSteerFL.rotation.y = steerRad;
      wheelSteerFR.rotation.y = steerRad;
      for (const w of wheelSpinners) {
        w.rotation.x += spinDeltaRad;
      }
    },
    setBodyTilt: (pitchRad, rollRad, heaveY) => {
      chassisGroup.rotation.x = pitchRad;
      chassisGroup.rotation.z = rollRad;
      chassisGroup.position.y = heaveY;
    },
    setDirt: (dirtLevel, washProgress = -1, washFoam = 0) => {
      dirtUniforms.uDirtLevel.value = THREE.MathUtils.clamp(dirtLevel, 0, 1);
      dirtUniforms.uWashProgress.value = washProgress;
      dirtUniforms.uWashFoam.value = washFoam;
    },
    setDamage: (damageLevel) => {
      dirtUniforms.uDamageLevel.value = THREE.MathUtils.clamp(damageLevel, 0, 1);
    },
    getExhaustAnchors: () => exhaustAnchors,
    getCameraAnchors: () => ({
      cockpitEyeLocal,
      cockpitLookLocal,
      hoodEyeLocal,
      hoodLookLocal,
      bumperEyeLocal,
      bumperLookLocal,
    }),
    setCockpitMode: (inCockpit) => {
      canopyMesh.visible = !inCockpit;
      if (cockpitGroupRef) cockpitGroupRef.visible = true;
    },
    setCockpitState: (params) => {
      canopyMesh.visible = !params.active;
      if (steeringWheelRollPivot) {
        // Negative Z rotation turns 12-o'clock toward +X (driver's left) when steerRad > 0
        steeringWheelRollPivot.rotation.z = -params.steerRad * 3.4;
      }
      updateGaugeCanvas?.(params);
    },
    dispose: () => {
      gaugeTex?.dispose();
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    },
  };
}
