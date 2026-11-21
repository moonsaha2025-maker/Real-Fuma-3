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
  updateDynamicWorld: (timeSec: number, isWet: boolean) => void;
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

export function buildRealFumaWorld(
  textures: ProceduralTexturePack,
): BuiltWorld {
  const worldGroup = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const dummy = new THREE.Object3D();

  // 1. High-Density Road-Carved Peninsula Terrain (~7m grid resolution)
  const terrainSize = WORLD_HALF_SIZE * 2;
  const segs = 250;
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
    } else if (x < -140 && z > -460 && z < 440) {
      // Sunset Coast & Palm Canyon warm lush green + sandstone bluffs
      tmpColor.set('#447838');
      if (slope > 0.16 || y > 13) {
        rockColor.set('#967a58');
        tmpColor.lerp(rockColor, Math.min(0.92, (slope - 0.11) * 2.8 + Math.max(0, y - 13) * 0.05));
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
        tmpColor.lerp(rockColor, Math.min(0.88, (slope - 0.13) * 2.5 + Math.max(0, y - 31) * 0.05));
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
    roughness: 0.92,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 2. Seamless Closed-Loop 720-Station Asphalt Ribbon + Thick Roadbed Side Skirts
  const asphaltRoadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltMap,
    bumpMap: textures.asphaltBumpMap,
    bumpScale: 0.04,
    roughness: 0.58,
    metalness: 0.08,
  });
  const shoulderSkirtMat = new THREE.MeshStandardMaterial({
    map: textures.concreteCurbMap,
    color: 0x94a3b8,
    roughness: 0.85,
    metalness: 0.08,
  });

  // 4 columns across road: Left edge skirt bottom -> Left deck edge -> Right deck edge -> Right edge skirt bottom
  const roadGeo = buildContinuousRibbonGeometry(
    TRACK_STATION_COUNT,
    (idx, col) => {
      const st = TRACK_STATIONS[idx];
      const hw = st.roadWidth * 0.5;
      const sSinB = Math.sin(st.bankRad);
      const vCoord = (idx / TRACK_STATION_COUNT) * (TRACK_LENGTH_M / 18);

      if (col === 0) {
        // Left skirt drop into terrain/bridge soffit
        return {
          x: st.x - st.rx * (hw + 0.7),
          y: st.y - hw * sSinB - 0.65,
          z: st.z - st.rz * (hw + 0.7),
          u: 0,
          v: vCoord,
        };
      }
      if (col === 1) {
        return {
          x: st.x - st.rx * hw,
          y: st.y - hw * sSinB,
          z: st.z - st.rz * hw,
          u: 0,
          v: vCoord,
        };
      }
      if (col === 2) {
        return {
          x: st.x + st.rx * hw,
          y: st.y + hw * sSinB,
          z: st.z + st.rz * hw,
          u: 1,
          v: vCoord,
        };
      }
      return {
        x: st.x + st.rx * (hw + 0.7),
        y: st.y + hw * sSinB - 0.65,
        z: st.z + st.rz * (hw + 0.7),
        u: 1,
        v: vCoord,
      };
    },
    4,
  );
  // Build clean UV-mapped deck only (cols 1..2) + concrete shoulder apron separately so UVs align strictly 0..1 across asphalt!
  roadGeo.dispose();

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
          const lat = side === -1 ? outerLat : outerLat;
          return { x: st.x + st.rx * lat, y: st.y + lat * sSinB + 0.04, z: st.z + st.rz * lat, u: 0.5, v };
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
        const yOff = active ? 0.055 : -0.55; // Tuck smoothly out of sight on straights
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
        const h = col === 0 ? 0.44 : 0.78;
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

  // Guardrail I-Beam Posts every 3 stations (~15m)
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
  let pIdx = 0;
  for (let i = 0; i < TRACK_STATION_COUNT; i += postStep) {
    const st = TRACK_STATIONS[i];
    const yaw = Math.atan2(st.tx, st.tz);
    for (const side of [-1, 1]) {
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
      pylonGroup.add(leg);
    }
    const topCross = new THREE.Mesh(new THREE.BoxGeometry(23.5, 2.6, 2.6), bridgeAccentMat);
    topCross.position.set(0, pt.y + 39, 0);
    const midCross = new THREE.Mesh(new THREE.BoxGeometry(22.5, 2.0, 2.2), bridgeConcreteMat);
    midCross.position.set(0, pt.y + 23, 0);
    pylonGroup.add(topCross, midCross);
    worldGroup.add(pylonGroup);

    // Stay cables fanning down to bridge edge
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
    arch.receiveShadow = true;
    worldGroup.add(arch);
  }
  disposables.push(tunnelArchGeo, tunnelArchMat);

  // 7. Sleek Multi-Tiered Fujimi Harbor Glass Towers (Overlooking the Bay, clear of track)
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
  worldGroup.add(podiumInst, shaftInst, crownInst);
  disposables.push(podiumGeo, podiumMat, shaftGeo, shaftMat, crownGeo, crownMat);

  // 8. Roadside Coastal Palms (Sunset Coast & Palm Canyon) — Strictly off road corridor
  const palmSpots: Array<{ x: number; y: number; z: number; s: number; lean: number }> = [];
  for (let i = 0; i < 68; i++) {
    const s = 0.015 + (i / 68) * 0.42;
    const st = TRACK_STATIONS[Math.floor(s * TRACK_STATION_COUNT) % TRACK_STATION_COUNT];
    const side = i % 2 === 0 ? -1 : 1;
    const dist = st.roadWidth * 0.5 + 8.5 + (i % 4) * 5.2;
    const px = st.x + st.rx * (side * dist);
    const pz = st.z + st.rz * (side * dist);
    const proj = projectOntoTrack(px, pz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 4.5) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 0.2) continue;
    palmSpots.push({ x: px, y: py, z: pz, s: 0.88 + (i % 5) * 0.12, lean: side * 0.14 });
  }
  if (palmSpots.length > 0) {
    const pTrunkGeo = new THREE.CylinderGeometry(0.22, 0.44, 10.5, 8);
    const pTrunkMat = new THREE.MeshStandardMaterial({ map: textures.barkMap, color: 0x9c7b56, roughness: 0.92 });
    const frondGeo = new THREE.BoxGeometry(0.66, 0.08, 4.6);
    frondGeo.translate(0, 0, 2.2);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68 });

    const frondsPerTree = 9;
    const pTrunkInst = new THREE.InstancedMesh(pTrunkGeo, pTrunkMat, palmSpots.length);
    const pFrondInst = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * frondsPerTree);
    pTrunkInst.castShadow = true;
    pFrondInst.castShadow = true;

    let fIdx = 0;
    palmSpots.forEach((p, idx) => {
      const topX = p.x + Math.sin(p.lean) * 1.4;
      const topY = p.y + 10.2 * p.s;
      dummy.position.set((p.x + topX) * 0.5, p.y + 5.1 * p.s, p.z);
      dummy.rotation.set(0, idx * 0.4, -p.lean);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      pTrunkInst.setMatrixAt(idx, dummy.matrix);

      for (let f = 0; f < frondsPerTree; f++) {
        const yaw = (f / frondsPerTree) * Math.PI * 2 + idx * 0.5;
        dummy.position.set(topX, topY, p.z);
        dummy.rotation.set(0.24 + (f % 3) * 0.16, yaw, 0, 'YXZ');
        dummy.scale.set(p.s, p.s, p.s);
        dummy.updateMatrix();
        pFrondInst.setMatrixAt(fIdx, dummy.matrix);
        pFrondInst.setColorAt(fIdx, new THREE.Color().setHSL(0.28 + (f % 3) * 0.02, 0.58, 0.25 + (f % 2) * 0.06));
        fIdx++;
      }
    });
    pTrunkInst.instanceMatrix.needsUpdate = true;
    pFrondInst.instanceMatrix.needsUpdate = true;
    if (pFrondInst.instanceColor) pFrondInst.instanceColor.needsUpdate = true;
    worldGroup.add(pTrunkInst, pFrondInst);
    disposables.push(pTrunkGeo, pTrunkMat, frondGeo, frondMat);
  }

  // 9. Alpine Conifer Pine Groves (Alpine Pass & Canyon Slopes)
  const pineSpots: Array<{ x: number; y: number; z: number; s: number }> = [];
  for (let i = 0; i < 240; i++) {
    const angle = i * 2.39996;
    const rad = 60 + (i % 55) * 9.5;
    const px = 220 + Math.cos(angle) * rad;
    const pz = -260 + Math.sin(angle) * rad;
    const proj = projectOntoTrack(px, pz);
    if (Math.abs(proj.lateralOffset) < proj.station.roadWidth * 0.5 + 11) continue;
    const py = getTerrainHeight(px, pz);
    if (py < 2.5 || py > 52) continue;
    pineSpots.push({ x: px, y: py, z: pz, s: 0.9 + (i % 5) * 0.16 });
  }
  if (pineSpots.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 4.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ map: textures.barkMap, color: 0x5c3e2a, roughness: 0.94 });
    const coneGeo = new THREE.ConeGeometry(1, 1, 7);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });

    const tiers = 3;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, pineSpots.length);
    const coneInst = new THREE.InstancedMesh(coneGeo, foliageMat, pineSpots.length * tiers);
    trunkInst.castShadow = true;
    coneInst.castShadow = true;

    let cIdx = 0;
    pineSpots.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 2.2 * p.s, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);

      const col = new THREE.Color().setHSL(0.35 + (idx % 3) * 0.015, 0.44, 0.14 + (idx % 3) * 0.025);
      for (let t = 0; t < tiers; t++) {
        const w = (3.4 - t * 0.75) * p.s;
        const h = (5.0 - t * 0.6) * p.s;
        dummy.position.set(p.x, p.y + (4.5 + t * 2.6) * p.s, p.z);
        dummy.scale.set(w, h, w);
        dummy.rotation.set(0, idx + t * 0.6, 0);
        dummy.updateMatrix();
        coneInst.setMatrixAt(cIdx, dummy.matrix);
        coneInst.setColorAt(cIdx, col);
        cIdx++;
      }
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    coneInst.instanceMatrix.needsUpdate = true;
    if (coneInst.instanceColor) coneInst.instanceColor.needsUpdate = true;
    worldGroup.add(trunkInst, coneInst);
    disposables.push(trunkGeo, trunkMat, coneGeo, foliageMat);
  }

  // 10. Sleek Highway Light Poles along Harbor & Suspension Bridge
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
  if (poleSpots.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7.6, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.35 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfef08a, emissiveIntensity: 1.4 });
    const lampGeo = new THREE.BoxGeometry(1.1, 0.22, 0.45);
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, poleSpots.length);
    const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, poleSpots.length);

    poleSpots.forEach((p, idx) => {
      dummy.position.set(p.x, p.y + 3.8, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(idx, dummy.matrix);

      const armOffX = Math.cos(p.yaw) * (-p.side * 0.85);
      const armOffZ = -Math.sin(p.yaw) * (-p.side * 0.85);
      dummy.position.set(p.x + armOffX, p.y + 7.5, p.z + armOffZ);
      dummy.updateMatrix();
      lampInst.setMatrixAt(idx, dummy.matrix);
    });
    poleInst.instanceMatrix.needsUpdate = true;
    lampInst.instanceMatrix.needsUpdate = true;
    worldGroup.add(poleInst, lampInst);
    disposables.push(poleGeo, poleMat, lampGeo, lampMat);
  }

  // 11. Active Race Checkpoint Gate Beacon
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
    updateDynamicWorld: (timeSec, isWet) => {
      const targetRough = isWet ? 0.16 : 0.58;
      const targetMetal = isWet ? 0.32 : 0.08;
      asphaltRoadMat.roughness += (targetRough - asphaltRoadMat.roughness) * 0.08;
      asphaltRoadMat.metalness += (targetMetal - asphaltRoadMat.metalness) * 0.08;
      if (checkpointBeacon.visible) {
        checkpointBeacon.rotation.y = timeSec * 1.6;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
