import * as THREE from 'three';
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
  headlightBeamLeft?: THREE.Mesh;
  headlightBeamRight?: THREE.Mesh;
  nitroFlames: THREE.Mesh[];
  setLights: (headlights: boolean, braking: boolean, nitro: boolean) => void;
  setWheels: (steerRad: number, spinDeltaRad: number) => void;
  setBodyTilt: (pitchRad: number, rollRad: number, heaveY: number) => void;
  dispose: () => void;
}

interface LoftStation {
  zFrac: number;
  halfW: number;
  yBottom: number;
  yShoulder: number;
  yCrown: number;
  crownWidth: number;
}

function getStationsForStyle(style: CarBaseSpec['bodyStyle']): LoftStation[] {
  if (style === 'hyper' || style === 'wedge') {
    // Sculpted 12-station teardrop mid-engine supercar (765LT / SF90 / Jesko proportions)
    return [
      { zFrac: -0.50, halfW: 0.86, yBottom: 0.16, yShoulder: 0.54, yCrown: 0.57, crownWidth: 0.54 },
      { zFrac: -0.44, halfW: 0.95, yBottom: 0.10, yShoulder: 0.62, yCrown: 0.64, crownWidth: 0.50 },
      { zFrac: -0.34, halfW: 1.00, yBottom: 0.08, yShoulder: 0.68, yCrown: 0.70, crownWidth: 0.46 },
      { zFrac: -0.22, halfW: 1.01, yBottom: 0.08, yShoulder: 0.69, yCrown: 0.72, crownWidth: 0.42 },
      { zFrac: -0.09, halfW: 0.94, yBottom: 0.08, yShoulder: 0.63, yCrown: 0.67, crownWidth: 0.40 },
      { zFrac: 0.05, halfW: 0.94, yBottom: 0.08, yShoulder: 0.60, yCrown: 0.64, crownWidth: 0.40 },
      { zFrac: 0.19, halfW: 0.98, yBottom: 0.08, yShoulder: 0.63, yCrown: 0.59, crownWidth: 0.37 },
      { zFrac: 0.31, halfW: 1.00, yBottom: 0.09, yShoulder: 0.64, yCrown: 0.53, crownWidth: 0.34 },
      { zFrac: 0.40, halfW: 0.95, yBottom: 0.10, yShoulder: 0.50, yCrown: 0.43, crownWidth: 0.35 },
      { zFrac: 0.46, halfW: 0.87, yBottom: 0.11, yShoulder: 0.35, yCrown: 0.32, crownWidth: 0.39 },
      { zFrac: 0.50, halfW: 0.75, yBottom: 0.12, yShoulder: 0.24, yCrown: 0.24, crownWidth: 0.44 },
    ];
  }
  // 10-station JDM / GT Sports Coupe
  return [
    { zFrac: -0.50, halfW: 0.89, yBottom: 0.15, yShoulder: 0.56, yCrown: 0.59, crownWidth: 0.54 },
    { zFrac: -0.40, halfW: 0.98, yBottom: 0.10, yShoulder: 0.64, yCrown: 0.66, crownWidth: 0.48 },
    { zFrac: -0.26, halfW: 1.01, yBottom: 0.09, yShoulder: 0.67, yCrown: 0.69, crownWidth: 0.45 },
    { zFrac: -0.08, halfW: 0.95, yBottom: 0.09, yShoulder: 0.61, yCrown: 0.64, crownWidth: 0.44 },
    { zFrac: 0.12, halfW: 0.96, yBottom: 0.09, yShoulder: 0.60, yCrown: 0.63, crownWidth: 0.44 },
    { zFrac: 0.28, halfW: 1.00, yBottom: 0.09, yShoulder: 0.62, yCrown: 0.60, crownWidth: 0.43 },
    { zFrac: 0.40, halfW: 0.95, yBottom: 0.10, yShoulder: 0.49, yCrown: 0.47, crownWidth: 0.41 },
    { zFrac: 0.46, halfW: 0.88, yBottom: 0.11, yShoulder: 0.38, yCrown: 0.37, crownWidth: 0.42 },
    { zFrac: 0.50, halfW: 0.79, yBottom: 0.13, yShoulder: 0.28, yCrown: 0.29, crownWidth: 0.44 },
  ];
}

function buildLoftedHullGeometry(
  spec: CarBaseSpec,
  widthScale: number,
): THREE.BufferGeometry {
  const L = spec.dimensions.length;
  const halfW = spec.dimensions.width * 0.5 * widthScale;
  const H = spec.dimensions.height;
  const clearance = spec.dimensions.groundClearance;
  const stations = getStationsForStyle(spec.bodyStyle);

  const ringPts = 11;
  const verts: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let sIdx = 0; sIdx < stations.length; sIdx++) {
    const st = stations[sIdx];
    const z = st.zFrac * L;
    const w = st.halfW * halfW;
    const yb = clearance + st.yBottom * H;
    const ys = clearance + st.yShoulder * H;
    const yc = clearance + st.yCrown * H;
    const cw = st.crownWidth;

    const ring: Array<[number, number]> = [
      [-w * 0.85, yb],
      [-w * 1.00, yb + (ys - yb) * 0.36],
      [-w * 0.98, ys * 0.94],
      [-w * 0.79, ys + (yc - ys) * 0.48],
      [-w * cw, yc],
      [0, yc + 0.022],
      [w * cw, yc],
      [w * 0.79, ys + (yc - ys) * 0.48],
      [w * 0.98, ys * 0.94],
      [w * 1.00, yb + (ys - yb) * 0.36],
      [w * 0.85, yb],
    ];

    for (let p = 0; p < ringPts; p++) {
      verts.push(ring[p][0], ring[p][1], z);
      uvs.push(p / (ringPts - 1), sIdx / (stations.length - 1));
    }
  }

  for (let sIdx = 0; sIdx < stations.length - 1; sIdx++) {
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
    indices.push(rowA + 10, rowB + 10, rowA);
    indices.push(rowA, rowB + 10, rowB);
  }

  const frontBase = (stations.length - 1) * ringPts;
  for (let p = 1; p < ringPts - 1; p++) {
    indices.push(0, p, p + 1);
    indices.push(frontBase, frontBase + p + 1, frontBase + p);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildCanopyGeometry(
  spec: CarBaseSpec,
  widthScale: number,
  scale = 1.0,
): THREE.BufferGeometry {
  const L = spec.dimensions.length;
  const halfW = spec.dimensions.width * 0.5 * widthScale * scale;
  const H = spec.dimensions.height;
  const clearance = spec.dimensions.groundClearance;

  const isHyper = spec.bodyStyle === 'hyper' || spec.bodyStyle === 'wedge';
  const stations = isHyper
    ? [
        { z: -0.35 * L, w: 0.40 * halfW, yBase: clearance + H * 0.62, yTop: clearance + H * 0.65 },
        { z: -0.22 * L, w: 0.60 * halfW, yBase: clearance + H * 0.65, yTop: clearance + H * 0.90 },
        { z: -0.06 * L, w: 0.68 * halfW, yBase: clearance + H * 0.63, yTop: clearance + H * 0.99 },
        { z: 0.08 * L, w: 0.70 * halfW, yBase: clearance + H * 0.61, yTop: clearance + H * 0.98 },
        { z: 0.24 * L, w: 0.58 * halfW, yBase: clearance + H * 0.55, yTop: clearance + H * 0.60 },
      ]
    : [
        { z: -0.37 * L, w: 0.52 * halfW, yBase: clearance + H * 0.63, yTop: clearance + H * 0.67 },
        { z: -0.22 * L, w: 0.68 * halfW, yBase: clearance + H * 0.65, yTop: clearance + H * 0.96 },
        { z: -0.04 * L, w: 0.72 * halfW, yBase: clearance + H * 0.64, yTop: clearance + H * 1.00 },
        { z: 0.10 * L, w: 0.71 * halfW, yBase: clearance + H * 0.62, yTop: clearance + H * 0.96 },
        { z: 0.23 * L, w: 0.64 * halfW, yBase: clearance + H * 0.57, yTop: clearance + H * 0.62 },
      ];

  const ringPts = 7;
  const verts: number[] = [];
  const indices: number[] = [];

  for (const st of stations) {
    const yt = st.yTop * (scale < 1 ? 0.96 : 1.0);
    const pts: Array<[number, number]> = [
      [-st.w, st.yBase],
      [-st.w * 0.84, st.yBase + (yt - st.yBase) * 0.62],
      [-st.w * 0.46, yt * 0.985],
      [0, yt + 0.018],
      [st.w * 0.46, yt * 0.985],
      [st.w * 0.84, st.yBase + (yt - st.yBase) * 0.62],
      [st.w, st.yBase],
    ];
    for (const [px, py] of pts) {
      verts.push(px, py, st.z);
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
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Smooth tapered roof panel curving seamlessly over the canopy (no boxy bricks!)
function buildContouredRoofGeometry(
  spec: CarBaseSpec,
  widthScale: number,
): THREE.BufferGeometry {
  const L = spec.dimensions.length;
  const halfW = spec.dimensions.width * 0.5 * widthScale;
  const H = spec.dimensions.height;
  const clearance = spec.dimensions.groundClearance;
  const isHyper = spec.bodyStyle === 'hyper' || spec.bodyStyle === 'wedge';

  const stations = isHyper
    ? [
        { z: -0.25 * L, w: 0.44 * halfW, y: clearance + H * 0.84 },
        { z: -0.11 * L, w: 0.52 * halfW, y: clearance + H * 0.995 },
        { z: 0.04 * L, w: 0.53 * halfW, y: clearance + H * 0.995 },
        { z: 0.11 * L, w: 0.50 * halfW, y: clearance + H * 0.94 },
      ]
    : [
        { z: -0.24 * L, w: 0.50 * halfW, y: clearance + H * 0.94 },
        { z: -0.08 * L, w: 0.55 * halfW, y: clearance + H * 1.005 },
        { z: 0.06 * L, w: 0.54 * halfW, y: clearance + H * 0.985 },
        { z: 0.13 * L, w: 0.51 * halfW, y: clearance + H * 0.91 },
      ];

  const ringPts = 5;
  const verts: number[] = [];
  const indices: number[] = [];

  for (const st of stations) {
    const pts: Array<[number, number]> = [
      [-st.w, st.y - 0.015],
      [-st.w * 0.5, st.y + 0.018],
      [0, st.y + 0.024],
      [st.w * 0.5, st.y + 0.018],
      [st.w, st.y - 0.015],
    ];
    for (const [px, py] of pts) {
      verts.push(px, py, st.z);
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
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createWheelMesh(
  radius: number,
  width: number,
  rimStyle: CarCustomization['rimStyle'],
  rimColor: string,
): THREE.Group {
  const wheelGroup = new THREE.Group();

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x15171c,
    roughness: 0.85,
    metalness: 0.06,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    roughness: 0.18,
    metalness: 0.94,
  });
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.34,
    metalness: 0.85,
  });
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xe11d48,
    roughness: 0.28,
    metalness: 0.55,
  });

  // Tire tread + rounded shoulder
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  tireMesh.castShadow = true;
  wheelGroup.add(tireMesh);

  const rimRadius = radius * 0.72;
  const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width + 0.008, 24);
  barrelGeo.rotateZ(Math.PI / 2);
  wheelGroup.add(
    new THREE.Mesh(
      barrelGeo,
      new THREE.MeshStandardMaterial({ color: 0x090b0f, roughness: 0.42, metalness: 0.72 }),
    ),
  );

  // Drilled Brake Disc
  const rotorGeo = new THREE.CylinderGeometry(rimRadius * 0.76, rimRadius * 0.76, 0.045, 20);
  rotorGeo.rotateZ(Math.PI / 2);
  wheelGroup.add(new THREE.Mesh(rotorGeo, rotorMat));

  // Alloy Spokes (5-spoke, 10-spoke GT mesh, or aero blade)
  const spokeCount = rimStyle === 'mesh_gt' ? 10 : rimStyle === 'blade_aero' ? 6 : 5;
  const spokeGeo = new THREE.BoxGeometry(0.03, rimRadius * 1.9, rimStyle === 'blade_aero' ? 0.075 : 0.036);
  for (let i = 0; i < spokeCount; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (i / spokeCount) * Math.PI;
    spoke.position.x = width * 0.47;
    wheelGroup.add(spoke);

    const spokeInner = spoke.clone();
    spokeInner.position.x = -width * 0.47;
    wheelGroup.add(spokeInner);
  }

  // Rim Outer Lip
  const lipGeo = new THREE.TorusGeometry(rimRadius, 0.022, 8, 28);
  lipGeo.rotateY(Math.PI / 2);
  const lipL = new THREE.Mesh(lipGeo, rimMat);
  lipL.position.x = width * 0.49;
  const lipR = lipL.clone();
  lipR.position.x = -width * 0.49;
  wheelGroup.add(lipL, lipR);

  // Hub & Brake Caliper
  const hubGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.15, width + 0.025, 12);
  hubGeo.rotateZ(Math.PI / 2);
  wheelGroup.add(new THREE.Mesh(hubGeo, rimMat));

  const caliperGeo = new THREE.BoxGeometry(width * 0.38, radius * 0.42, radius * 0.32);
  const caliper = new THREE.Mesh(caliperGeo, caliperMat);
  caliper.position.set(0, 0, radius * 0.34);
  wheelGroup.add(caliper);

  return wheelGroup;
}

export function createCarModel(
  spec: CarBaseSpec,
  customization: CarCustomization,
  options?: {
    contactShadowMap?: THREE.Texture;
    carbonMap?: THREE.Texture;
    withLightCones?: boolean;
  },
): CarModelRig {
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
  const widthScale = isWide ? 1.04 : isStreetKit ? 1.0 : 0.97;

  const finish = customization.paintFinish;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: customization.paintColor,
    metalness: finish === 'metallic' ? 0.66 : finish === 'matte' ? 0.18 : 0.28,
    roughness: finish === 'matte' ? 0.65 : finish === 'metallic' ? 0.25 : 0.2,
    clearcoat: finish === 'matte' ? 0.05 : 0.42,
    clearcoatRoughness: finish === 'matte' ? 0.55 : 0.22,
    envMapIntensity: 0.46,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x161a22,
    map: options?.carbonMap ?? null,
    roughness: 0.44,
    metalness: 0.36,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c10,
    roughness: 0.78,
    metalness: 0.14,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x090f18,
    roughness: 0.15,
    metalness: 0.14,
    clearcoat: 0.34,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.42,
    transparent: true,
    opacity: Math.min(0.92, Math.max(0.62, 0.58 + customization.windowTint * 0.34)),
  });

  // 1. Sculpted Lofted Main Coachwork Hull
  const hullMesh = new THREE.Mesh(buildLoftedHullGeometry(spec, widthScale), bodyMaterial);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  chassisGroup.add(hullMesh);

  // 2. Dark Interior Cabin Core + Smooth Curved Glass Canopy + Contoured Painted Roof Panel
  const interiorCore = new THREE.Mesh(buildCanopyGeometry(spec, widthScale, 0.91), darkTrimMat);
  chassisGroup.add(interiorCore);

  const canopyMesh = new THREE.Mesh(buildCanopyGeometry(spec, widthScale, 1.0), glassMat);
  canopyMesh.castShadow = true;
  chassisGroup.add(canopyMesh);

  const isHyper = spec.bodyStyle === 'hyper' || spec.bodyStyle === 'wedge';
  const roofMesh = new THREE.Mesh(
    buildContouredRoofGeometry(spec, widthScale),
    isHyper ? carbonMat : bodyMaterial,
  );
  roofMesh.castShadow = true;
  chassisGroup.add(roofMesh);

  // Contoured A-pillars & Rear Flying Buttress C-pillars
  const aPillarGeo = new THREE.CylinderGeometry(0.024, 0.028, L * 0.24, 8);
  aPillarGeo.rotateX(Math.PI / 2);
  const cPillarGeo = new THREE.CylinderGeometry(0.032, 0.04, L * 0.22, 8);
  cPillarGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const aPillar = new THREE.Mesh(aPillarGeo, darkTrimMat);
    aPillar.position.set(side * W * 0.29 * widthScale, clearance + H * 0.78, L * 0.14);
    aPillar.rotation.x = 0.52;
    aPillar.rotation.y = side * -0.15;
    chassisGroup.add(aPillar);

    const cPillar = new THREE.Mesh(cPillarGeo, bodyMaterial);
    cPillar.position.set(side * W * 0.28 * widthScale, clearance + H * 0.78, -L * 0.20);
    cPillar.rotation.x = -0.44;
    cPillar.rotation.y = side * 0.18;
    chassisGroup.add(cPillar);
  }

  // Rear Engine Bay Louvers on mid-engine supercars
  if (isHyper) {
    const louverGeo = new THREE.BoxGeometry(W * 0.42, 0.02, 0.065);
    for (let li = 0; li < 4; li++) {
      const slat = new THREE.Mesh(louverGeo, darkTrimMat);
      slat.position.set(0, clearance + H * 0.72 - li * 0.022, -L * (0.24 + li * 0.045));
      slat.rotation.x = -0.18;
      chassisGroup.add(slat);
    }
  }

  // 3. Recessed Carbon Hood Vents & Sculpted Side Intakes
  const ventGeo = new THREE.BoxGeometry(0.24, 0.035, 0.48);
  for (const side of [-1, 1]) {
    const vent = new THREE.Mesh(ventGeo, darkTrimMat);
    vent.position.set(side * W * 0.16, clearance + H * 0.53, L * 0.29);
    vent.rotation.x = 0.24;
    chassisGroup.add(vent);

    const sideIntake = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, H * 0.25, L * 0.20),
      darkTrimMat,
    );
    sideIntake.position.set(side * W * 0.45 * widthScale, clearance + H * 0.39, -L * 0.08);
    chassisGroup.add(sideIntake);
  }

  // 4. Front Carbon Aero Splitter, Side Skirts & Rear Diffuser
  const splitterExtend = isWide ? 0.18 : isStreetKit ? 0.12 : 0.07;
  const frontLip = new THREE.Mesh(
    new THREE.BoxGeometry(W * widthScale * 0.99, 0.038, 0.32 + splitterExtend),
    carbonMat,
  );
  frontLip.position.set(0, clearance + 0.075, L * 0.44 + splitterExtend * 0.35);
  frontLip.castShadow = true;
  chassisGroup.add(frontLip);

  const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.54, H * 0.11, 0.07), darkTrimMat);
  frontGrille.position.set(0, clearance + H * 0.16, L * 0.492);
  chassisGroup.add(frontGrille);

  for (const side of [-1, 1]) {
    const sideSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.055, L * 0.64), carbonMat);
    sideSkirt.position.set(side * W * 0.47 * widthScale, clearance + 0.075, 0);
    chassisGroup.add(sideSkirt);

    // Aerodynamic tapered wing mirrors
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), carbonMat);
    mirror.scale.set(1.35, 0.55, 0.85);
    mirror.position.set(side * W * 0.49 * widthScale, clearance + H * 0.64, L * 0.14);
    chassisGroup.add(mirror);
  }

  const rearGrille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.74, H * 0.20, 0.055), darkTrimMat);
  rearGrille.position.set(0, clearance + H * 0.37, -L * 0.495);
  chassisGroup.add(rearGrille);

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.14, 0.16), carbonMat);
  diffuser.position.set(0, clearance + 0.12, -L * 0.498);
  chassisGroup.add(diffuser);

  const finGeo = new THREE.BoxGeometry(0.025, 0.14, 0.19);
  for (const fx of [-0.32, -0.11, 0.11, 0.32]) {
    const fin = new THREE.Mesh(finGeo, carbonMat);
    fin.position.set(fx * W * 0.5, clearance + 0.11, -L * 0.505);
    chassisGroup.add(fin);
  }

  // 5. Properly Oriented Semi-Circular Inner Wheel Well Liners (No protrusion glitches!)
  const archGeo = new THREE.CylinderGeometry(
    wheelR * 1.12,
    wheelR * 1.12,
    0.34,
    18,
    1,
    false,
    0,
    Math.PI,
  );
  archGeo.rotateZ(Math.PI / 2); // Cylinder axis -> X, curved top arch points +Y cleanly!
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0x07090d,
    roughness: 0.9,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const frontZ = L * 0.305;
  const rearZ = -L * 0.305;
  const trackX = W * 0.425 * widthScale;
  for (const [wx, wz] of [
    [trackX * 0.93, frontZ],
    [-trackX * 0.93, frontZ],
    [trackX * 0.93, rearZ],
    [-trackX * 0.93, rearZ],
  ]) {
    const well = new THREE.Mesh(archGeo, linerMat);
    well.position.set(wx, wheelR * 0.96, wz);
    chassisGroup.add(well);
  }

  // 6. Active / Sculpted Rear Wing or Ducktail Lip
  if (customization.spoiler !== 'none') {
    if (customization.spoiler === 'lip') {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.80, 0.042, 0.14), carbonMat);
      lip.position.set(0, clearance + H * 0.59, -L * 0.47);
      lip.rotation.x = -0.18;
      chassisGroup.add(lip);
    } else {
      const wingW = customization.spoiler === 'swan_neck' ? W * 0.98 : W * 0.90;
      const wingY = clearance + H * (customization.spoiler === 'swan_neck' ? 0.92 : 0.83);
      const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.04, 0.25), carbonMat);
      wingBlade.position.set(0, wingY, -L * 0.47);
      wingBlade.rotation.x = 0.08;
      wingBlade.castShadow = true;
      chassisGroup.add(wingBlade);

      const endGeo = new THREE.BoxGeometry(0.03, 0.14, 0.30);
      for (const side of [-1, 1]) {
        const ep = new THREE.Mesh(endGeo, carbonMat);
        ep.position.set(side * wingW * 0.5, wingY - 0.02, -L * 0.47);
        chassisGroup.add(ep);

        const upH = wingY - (clearance + H * 0.56);
        const u = new THREE.Mesh(new THREE.BoxGeometry(0.04, upH, 0.14), darkTrimMat);
        u.position.set(side * W * 0.22, wingY - upH * 0.5, -L * 0.45);
        chassisGroup.add(u);
      }
    }
  }

  // 7. Exhaust Tips & Twin/Quad Nitro Flames
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.16 });
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });
  const nitroFlames: THREE.Mesh[] = [];
  const exhaustOffsets =
    customization.exhaust === 'quad'
      ? [-0.34, -0.22, 0.22, 0.34]
      : customization.exhaust === 'titanium_center'
        ? [-0.085, 0.085]
        : [-0.28, 0.28];

  for (const ex of exhaustOffsets) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 12), exhaustMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(ex, clearance + 0.14, -L * 0.505);
    chassisGroup.add(tip);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.56, 8), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(ex, clearance + 0.14, -L * 0.55 - 0.24);
    flame.visible = false;
    chassisGroup.add(flame);
    nitroFlames.push(flame);
  }

  // 8. Selective-Bloom-Safe Boomerang LED Headlights & High-Contrast Taillight Blades
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xdbeafe,
    emissiveIntensity: 1.05,
    roughness: 0.16,
  });
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xff2244,
    emissiveIntensity: 0.95,
    roughness: 0.18,
  });

  const bucketGeo = new THREE.BoxGeometry(0.32, 0.11, 0.12);
  const drlGeo = new THREE.BoxGeometry(0.28, 0.022, 0.055);
  for (const side of [-1, 1]) {
    const bx = side * W * 0.33;
    const bucket = new THREE.Mesh(bucketGeo, darkTrimMat);
    bucket.position.set(bx, clearance + H * 0.32, L * 0.445);
    bucket.rotation.y = side * 0.24;
    chassisGroup.add(bucket);

    const drlTop = new THREE.Mesh(drlGeo, headlightMaterial);
    drlTop.position.set(bx, clearance + H * 0.345, L * 0.475);
    drlTop.rotation.y = side * 0.24;
    const drlBot = new THREE.Mesh(drlGeo, headlightMaterial);
    drlBot.position.set(bx, clearance + H * 0.295, L * 0.482);
    drlBot.rotation.y = side * 0.24;
    chassisGroup.add(drlTop, drlBot);
  }

  const tlHousingGeo = new THREE.BoxGeometry(W * 0.31, 0.09, 0.06);
  const tlBladeGeo = new THREE.BoxGeometry(W * 0.27, 0.024, 0.045);
  for (const side of [-1, 1]) {
    const tx = side * W * 0.26;
    const housing = new THREE.Mesh(tlHousingGeo, darkTrimMat);
    housing.position.set(tx, clearance + H * 0.45, -L * 0.492);
    housing.rotation.y = side * -0.08;
    chassisGroup.add(housing);

    const bladeTop = new THREE.Mesh(tlBladeGeo, taillightMaterial);
    bladeTop.position.set(tx, clearance + H * 0.468, -L * 0.503);
    bladeTop.rotation.y = side * -0.08;
    const bladeBot = new THREE.Mesh(tlBladeGeo, taillightMaterial);
    bladeBot.position.set(tx, clearance + H * 0.432, -L * 0.503);
    bladeBot.rotation.y = side * -0.08;
    chassisGroup.add(bladeTop, bladeBot);
  }

  let headlightBeamLeft: THREE.Mesh | undefined;
  let headlightBeamRight: THREE.Mesh | undefined;
  if (options?.withLightCones) {
    const beamGeo = new THREE.ConeGeometry(2.4, 20, 16, 1, true);
    beamGeo.translate(0, -10, 0);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    headlightBeamLeft = new THREE.Mesh(beamGeo, beamMat);
    headlightBeamLeft.position.set(-W * 0.33, clearance + H * 0.31, L * 0.49);
    headlightBeamLeft.visible = false;
    headlightBeamRight = new THREE.Mesh(beamGeo, beamMat);
    headlightBeamRight.position.set(W * 0.33, clearance + H * 0.31, L * 0.49);
    headlightBeamRight.visible = false;
    chassisGroup.add(headlightBeamLeft, headlightBeamRight);
  }

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
      opacity: 0.72,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.38, L * 1.24), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.025;
    root.add(shadowPlane);
  }

  // 11. Four Flush Independent Wheel Assemblies
  const wheelW = 0.27;

  const wheelSteerFL = new THREE.Group();
  wheelSteerFL.position.set(trackX, wheelR, frontZ);
  const wheelFL = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor);
  wheelSteerFL.add(wheelFL);
  root.add(wheelSteerFL);

  const wheelSteerFR = new THREE.Group();
  wheelSteerFR.position.set(-trackX, wheelR, frontZ);
  const wheelFR = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor);
  wheelSteerFR.add(wheelFR);
  root.add(wheelSteerFR);

  const wheelRL = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor);
  wheelRL.position.set(trackX, wheelR, rearZ);
  root.add(wheelRL);

  const wheelRR = createWheelMesh(wheelR, wheelW, customization.rimStyle, customization.rimColor);
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
    headlightBeamLeft,
    headlightBeamRight,
    nitroFlames,
    setLights: (headlights, braking, nitro) => {
      headlightMaterial.emissiveIntensity = headlights ? 1.65 : 0.95;
      taillightMaterial.emissiveIntensity = braking ? 2.15 : headlights ? 1.25 : 0.75;
      if (headlightBeamLeft) headlightBeamLeft.visible = headlights;
      if (headlightBeamRight) headlightBeamRight.visible = headlights;
      for (const f of nitroFlames) {
        f.visible = nitro;
        if (nitro) {
          f.scale.set(1, 0.85 + Math.random() * 0.65, 1);
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
    dispose: () => {
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
