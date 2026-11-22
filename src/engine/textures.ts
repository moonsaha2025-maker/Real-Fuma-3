import * as THREE from 'three';

export interface ProceduralTexturePack {
  asphaltMap: THREE.CanvasTexture;
  asphaltNormalMap: THREE.DataTexture;
  asphaltRoughnessMap: THREE.CanvasTexture;
  concreteCurbMap: THREE.CanvasTexture;
  curbMap: THREE.CanvasTexture;
  buildingFacadeMap: THREE.CanvasTexture;
  buildingEmissiveMap: THREE.CanvasTexture;
  carbonMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  terrainDetailMap: THREE.CanvasTexture;
  terrainNormalMap: THREE.DataTexture;
  barkMap: THREE.CanvasTexture;
  barkNormalMap: THREE.DataTexture;
  palmFrondMap: THREE.CanvasTexture;
  pineBoughMap: THREE.CanvasTexture;
  grassTuftMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  dispose: () => void;
}

// Deterministic pseudo-random generator for reproducible procedural grain
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Compute tileable Sobel normal map DataTexture (linear space) from float heightfield
function buildNormalDataTexture(
  width: number,
  height: number,
  heights: Float32Array,
  strength: number,
  anisotropy: number,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const sample = (x: number, y: number) => {
    const wx = ((x % width) + width) % width;
    const wy = ((y % height) + height) % height;
    return heights[wy * width + wx];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * width + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(
  maxAnisotropy: number,
): ProceduralTexturePack {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));
  const rng = makeRng(420765);

  // 1. High-Detail Highway Asphalt Albedo (sRGB)
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 1024;
  asphaltCanvas.height = 1024;
  const actx = asphaltCanvas.getContext('2d')!;

  // Multi-tone bitumen gradient across lanes
  const roadGrad = actx.createLinearGradient(0, 0, 1024, 0);
  roadGrad.addColorStop(0.0, '#1c2028');
  roadGrad.addColorStop(0.06, '#272c36');
  roadGrad.addColorStop(0.25, '#232831');
  roadGrad.addColorStop(0.5, '#2b313c');
  roadGrad.addColorStop(0.75, '#232831');
  roadGrad.addColorStop(0.94, '#272c36');
  roadGrad.addColorStop(1.0, '#1c2028');
  actx.fillStyle = roadGrad;
  actx.fillRect(0, 0, 1024, 1024);

  // Longitudinal rubberized tire-track polish lanes
  for (const laneCenter of [248, 342, 682, 776]) {
    const tGrad = actx.createLinearGradient(laneCenter - 44, 0, laneCenter + 44, 0);
    tGrad.addColorStop(0, 'rgba(12, 14, 19, 0)');
    tGrad.addColorStop(0.5, 'rgba(10, 12, 17, 0.34)');
    tGrad.addColorStop(1, 'rgba(12, 14, 19, 0)');
    actx.fillStyle = tGrad;
    actx.fillRect(laneCenter - 44, 0, 88, 1024);
  }

  // Subtle asphalt blotches & weathered tonal patches
  for (let i = 0; i < 160; i++) {
    const px = rng() * 1024;
    const py = rng() * 1024;
    const pr = 18 + rng() * 55;
    const g = actx.createRadialGradient(px, py, 2, px, py, pr);
    const dark = rng() > 0.45 ? '14,17,22' : '52,58,68';
    g.addColorStop(0, `rgba(${dark}, 0.14)`);
    g.addColorStop(1, `rgba(${dark}, 0)`);
    actx.fillStyle = g;
    actx.beginPath();
    actx.arc(px, py, pr, 0, Math.PI * 2);
    actx.fill();
  }

  // Fine basalt/granite aggregate grain
  for (let i = 0; i < 95000; i++) {
    const x = rng() * 1024;
    const y = rng() * 1024;
    const v = 22 + Math.floor(rng() * 50);
    const warm = i % 11 === 0 ? 4 : 0;
    actx.fillStyle = `rgb(${v + warm},${v + 2},${v + 5})`;
    const sz = i % 9 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5;
    actx.fillRect(x, y, sz, sz);
  }

  // Hairline sealed tar repair seams (organic subtle road aging)
  actx.strokeStyle = 'rgba(11, 13, 17, 0.65)';
  actx.lineWidth = 2.2;
  for (let c = 0; c < 6; c++) {
    let cx = 80 + rng() * 860;
    let cy = rng() * 1024;
    actx.beginPath();
    actx.moveTo(cx, cy);
    for (let seg = 0; seg < 10; seg++) {
      cx += (rng() - 0.5) * 32;
      cy += 22 + rng() * 34;
      actx.lineTo(cx, cy);
    }
    actx.stroke();
  }

  // Crisp white outer shoulder lines with realistic micro-wear
  actx.fillStyle = '#e5e7eb';
  actx.fillRect(46, 0, 15, 1024);
  actx.fillRect(963, 0, 15, 1024);

  // Clean double amber-yellow center highway stripes
  actx.fillStyle = '#f59e0b';
  actx.fillRect(493, 0, 13, 1024);
  actx.fillRect(518, 0, 13, 1024);
  for (let i = 0; i < 1400; i++) {
    actx.fillStyle = 'rgba(32, 36, 44, 0.34)';
    actx.fillRect(491 + rng() * 42, rng() * 1024, 2 + rng() * 3, 2 + rng() * 4);
    if (i < 550) {
      const sideX = i % 2 === 0 ? 45 + rng() * 17 : 962 + rng() * 17;
      actx.fillRect(sideX, rng() * 1024, 2, 3);
    }
  }

  // Reflective Cat's-Eye highway studs along centerline & edge shoulders
  for (let y = 128; y < 1024; y += 256) {
    actx.fillStyle = '#fde68a';
    actx.fillRect(508, y - 5, 8, 10);
    actx.fillStyle = '#f8fafc';
    actx.fillRect(64, y - 4, 6, 8);
    actx.fillRect(954, y - 4, 6, 8);
  }

  const asphaltMap = new THREE.CanvasTexture(asphaltCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = aniso;

  // 1b. Asphalt Heightfield -> Tileable Tangent-Space Normal Map (linear)
  const nSize = 512;
  const aHeights = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      // Macro road crown + shallow rubber tire lane ruts
      const laneRut =
        -0.18 * Math.exp(-Math.pow((u - 0.28) * 14, 2)) -
        0.18 * Math.exp(-Math.pow((u - 0.72) * 14, 2));
      // Seamless multi-frequency mineral aggregate pebbles
      const coarse =
        Math.sin(x * 0.42 + y * 0.19) * Math.cos(y * 0.37 - x * 0.13) * 0.16;
      const grit = (rng() - 0.5) * 0.55;
      aHeights[y * nSize + x] = laneRut + coarse + grit;
    }
  }
  const asphaltNormalMap = buildNormalDataTexture(nSize, nSize, aHeights, 1.85, aniso);

  // 1c. Asphalt Roughness Map (linear grayscale: darker = shinier wheel tracks, brighter = matte aggregate)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 512;
  roughCanvas.height = 512;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#d4d4d4'; // ~0.83 base aggregate roughness
  rctx.fillRect(0, 0, 512, 512);

  for (const laneCenter of [124, 171, 341, 388]) {
    const lg = rctx.createLinearGradient(laneCenter - 26, 0, laneCenter + 26, 0);
    lg.addColorStop(0, 'rgba(135, 135, 135, 0)');
    lg.addColorStop(0.5, 'rgba(115, 115, 115, 0.75)'); // ~0.55 polished tire tracks
    lg.addColorStop(1, 'rgba(135, 135, 135, 0)');
    rctx.fillStyle = lg;
    rctx.fillRect(laneCenter - 26, 0, 52, 512);
  }
  for (let i = 0; i < 24000; i++) {
    const v = 165 + Math.floor(rng() * 82);
    rctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
    rctx.fillRect(rng() * 512, rng() * 512, 2, 2);
  }
  const asphaltRoughnessMap = new THREE.CanvasTexture(roughCanvas);
  asphaltRoughnessMap.wrapS = THREE.RepeatWrapping;
  asphaltRoughnessMap.wrapT = THREE.RepeatWrapping;
  asphaltRoughnessMap.anisotropy = aniso;

  // 2. Concrete Shoulder / Bridge Parapet Texture
  const ccCanvas = document.createElement('canvas');
  ccCanvas.width = 256;
  ccCanvas.height = 256;
  const ccctx = ccCanvas.getContext('2d')!;
  ccctx.fillStyle = '#cbd5e1';
  ccctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6500; i++) {
    const v = 172 + Math.floor(rng() * 52);
    ccctx.fillStyle = `rgb(${v},${v},${v - 4})`;
    ccctx.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  ccctx.fillStyle = 'rgba(71, 85, 105, 0.42)';
  for (let y = 0; y < 256; y += 64) {
    ccctx.fillRect(0, y, 256, 3);
  }
  const concreteCurbMap = new THREE.CanvasTexture(ccCanvas);
  concreteCurbMap.colorSpace = THREE.SRGBColorSpace;
  concreteCurbMap.wrapS = THREE.RepeatWrapping;
  concreteCurbMap.wrapT = THREE.RepeatWrapping;
  concreteCurbMap.anisotropy = aniso;

  // 3. FIA Red & White Apex Rumble Curb
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 128;
  curbCanvas.height = 128;
  const cctx = curbCanvas.getContext('2d')!;
  cctx.fillStyle = '#e11d48';
  cctx.fillRect(0, 0, 128, 64);
  cctx.fillStyle = '#f8fafc';
  cctx.fillRect(0, 64, 128, 64);
  for (let i = 0; i < 600; i++) {
    cctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    cctx.fillRect(rng() * 128, rng() * 128, 3, 2);
  }
  const curbMap = new THREE.CanvasTexture(curbCanvas);
  curbMap.colorSpace = THREE.SRGBColorSpace;
  curbMap.wrapS = THREE.RepeatWrapping;
  curbMap.wrapT = THREE.RepeatWrapping;
  curbMap.anisotropy = aniso;

  // 4. Architectural Glass Curtain-Wall Facade + Nocturnal Emissive Window Map
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 512;
  bCanvas.height = 1024;
  const fctx = bCanvas.getContext('2d')!;
  fctx.fillStyle = '#18212e';
  fctx.fillRect(0, 0, 512, 1024);

  const beCanvas = document.createElement('canvas');
  beCanvas.width = 512;
  beCanvas.height = 1024;
  const ectx = beCanvas.getContext('2d')!;
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 512, 1024);

  for (let r = 0; r < 32; r++) {
    fctx.fillStyle = '#263142';
    fctx.fillRect(0, r * 32, 512, 7);
    fctx.fillStyle = '#0f172a';
    fctx.fillRect(0, r * 32 + 7, 512, 2);
    const floorLitBias = rng() > 0.32 ? 0.42 : 0.14;
    for (let c = 0; c < 12; c++) {
      const gx = 8 + c * 42;
      const gy = r * 32 + 9;
      const rnd = rng();
      const paneGrad = fctx.createLinearGradient(gx, gy, gx, gy + 21);
      if (rnd > 0.9) {
        paneGrad.addColorStop(0, '#93c5fd');
        paneGrad.addColorStop(0.6, '#fde68a');
        paneGrad.addColorStop(1, '#334155');
      } else if (rnd > 0.52) {
        paneGrad.addColorStop(0, '#6293c4');
        paneGrad.addColorStop(0.6, '#395a7f');
        paneGrad.addColorStop(1, '#1e293b');
      } else {
        paneGrad.addColorStop(0, '#2c4460');
        paneGrad.addColorStop(1, '#162233');
      }
      fctx.fillStyle = paneGrad;
      fctx.fillRect(gx, gy, 34, 21);

      // Matching nocturnal lit window glow
      if (rng() < floorLitBias) {
        const warm = rng() > 0.28;
        ectx.fillStyle = warm
          ? rng() > 0.5
            ? '#fcd34d'
            : '#fdba74'
          : '#bae6fd';
        ectx.fillRect(gx + 1, gy + 2, 32, 17);
      }
    }
  }
  const buildingFacadeMap = new THREE.CanvasTexture(bCanvas);
  buildingFacadeMap.colorSpace = THREE.SRGBColorSpace;
  buildingFacadeMap.wrapS = THREE.RepeatWrapping;
  buildingFacadeMap.wrapT = THREE.RepeatWrapping;
  buildingFacadeMap.anisotropy = aniso;

  const buildingEmissiveMap = new THREE.CanvasTexture(beCanvas);
  buildingEmissiveMap.colorSpace = THREE.SRGBColorSpace;
  buildingEmissiveMap.wrapS = THREE.RepeatWrapping;
  buildingEmissiveMap.wrapT = THREE.RepeatWrapping;
  buildingEmissiveMap.anisotropy = aniso;

  // 5. Carbon Fiber Weave Texture
  const cfCanvas = document.createElement('canvas');
  cfCanvas.width = 128;
  cfCanvas.height = 128;
  const cfctx = cfCanvas.getContext('2d')!;
  cfctx.fillStyle = '#101216';
  cfctx.fillRect(0, 0, 128, 128);
  cfctx.fillStyle = '#252a34';
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      if (((x + y) / 8) % 2 === 0) {
        cfctx.fillRect(x, y, 4, 4);
      }
    }
  }
  const carbonMap = new THREE.CanvasTexture(cfCanvas);
  carbonMap.colorSpace = THREE.SRGBColorSpace;
  carbonMap.wrapS = THREE.RepeatWrapping;
  carbonMap.wrapT = THREE.RepeatWrapping;
  carbonMap.repeat.set(10, 10);

  // 6. Soft Radial Contact Shadow
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 256;
  shCanvas.height = 256;
  const sctx = shCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(128, 128, 22, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0,0,0,0.92)');
  grad.addColorStop(0.58, 'rgba(0,0,0,0.58)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);
  const contactShadowMap = new THREE.CanvasTexture(shCanvas);

  // 7. Organic Terrain Surface Detail Map + Micro-Relief Normal Map
  const tdCanvas = document.createElement('canvas');
  tdCanvas.width = 512;
  tdCanvas.height = 512;
  const tdctx = tdCanvas.getContext('2d')!;
  tdctx.fillStyle = '#e4e4e4';
  tdctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 480; i++) {
    const v = 192 + Math.floor(rng() * 54);
    tdctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
    tdctx.beginPath();
    tdctx.arc(rng() * 512, rng() * 512, 8 + rng() * 24, 0, Math.PI * 2);
    tdctx.fill();
  }
  for (let i = 0; i < 36000; i++) {
    const v = 175 + Math.floor(rng() * 75);
    tdctx.fillStyle = `rgb(${v},${v},${v})`;
    tdctx.fillRect(rng() * 512, rng() * 512, 2, 2);
  }
  const terrainDetailMap = new THREE.CanvasTexture(tdCanvas);
  terrainDetailMap.colorSpace = THREE.SRGBColorSpace;
  terrainDetailMap.wrapS = THREE.RepeatWrapping;
  terrainDetailMap.wrapT = THREE.RepeatWrapping;
  terrainDetailMap.repeat.set(145, 145);
  terrainDetailMap.anisotropy = aniso;

  const tSize = 256;
  const tHeights = new Float32Array(tSize * tSize);
  for (let y = 0; y < tSize; y++) {
    for (let x = 0; x < tSize; x++) {
      const wave =
        Math.sin(x * 0.14 + y * 0.08) * 0.25 +
        Math.cos(y * 0.22 - x * 0.1) * 0.2;
      tHeights[y * tSize + x] = wave + (rng() - 0.5) * 0.45;
    }
  }
  const terrainNormalMap = buildNormalDataTexture(tSize, tSize, tHeights, 1.35, aniso);
  terrainNormalMap.repeat.set(145, 145);

  // 8. Detailed Fibrous Tree Bark Albedo + Normal Map
  const bkSize = 256;
  const bkCanvas = document.createElement('canvas');
  bkCanvas.width = bkSize;
  bkCanvas.height = bkSize;
  const bkctx = bkCanvas.getContext('2d')!;
  bkctx.fillStyle = '#4e3623';
  bkctx.fillRect(0, 0, bkSize, bkSize);

  const bkHeights = new Float32Array(bkSize * bkSize);
  for (let y = 0; y < bkSize; y++) {
    for (let x = 0; x < bkSize; x++) {
      // Vertical bark ridges + subtle palm ring bands
      const ridge =
        Math.sin((x / bkSize) * Math.PI * 22 + Math.sin(y * 0.06) * 1.4) * 0.5 +
        Math.sin((x / bkSize) * Math.PI * 44) * 0.25;
      const ring = Math.sin((y / bkSize) * Math.PI * 16) * 0.22;
      const grain = (rng() - 0.5) * 0.35;
      bkHeights[y * bkSize + x] = ridge + ring + grain;
    }
  }

  for (let i = 0; i < 620; i++) {
    const x = rng() * bkSize;
    const y = rng() * bkSize;
    const h = 14 + rng() * 52;
    const tone = i % 3;
    bkctx.fillStyle =
      tone === 0
        ? 'rgba(26, 17, 10, 0.55)'
        : tone === 1
          ? 'rgba(112, 82, 54, 0.44)'
          : 'rgba(66, 78, 46, 0.24)'; // subtle moss/lichen
    bkctx.fillRect(x, y, 2 + rng() * 3.5, h);
  }
  // Subtle horizontal palm leaf-scar rings
  bkctx.fillStyle = 'rgba(28, 18, 10, 0.32)';
  for (let y = 8; y < bkSize; y += 16) {
    bkctx.fillRect(0, y, bkSize, 2);
  }
  const barkMap = new THREE.CanvasTexture(bkCanvas);
  barkMap.colorSpace = THREE.SRGBColorSpace;
  barkMap.wrapS = THREE.RepeatWrapping;
  barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.anisotropy = aniso;

  const barkNormalMap = buildNormalDataTexture(bkSize, bkSize, bkHeights, 2.2, aniso);

  // 9. Botanical Feathered Palm Frond Alpha-Cutout Texture (sRGB RGBA)
  const pfCanvas = document.createElement('canvas');
  pfCanvas.width = 512;
  pfCanvas.height = 512;
  const pfctx = pfCanvas.getContext('2d')!;
  pfctx.clearRect(0, 0, 512, 512);

  // Central woody rachis spine from bottom (y=512) to tip (y=12)
  const spineGrad = pfctx.createLinearGradient(256, 512, 256, 12);
  spineGrad.addColorStop(0, '#4d6b26');
  spineGrad.addColorStop(0.55, '#658f32');
  spineGrad.addColorStop(1, '#84a93c');
  pfctx.strokeStyle = spineGrad;
  pfctx.lineWidth = 10;
  pfctx.lineCap = 'round';
  pfctx.beginPath();
  pfctx.moveTo(256, 510);
  pfctx.lineTo(256, 16);
  pfctx.stroke();

  // Paired tapering feathered leaflets along spine
  const leafletPairs = 34;
  for (let i = 0; i < leafletPairs; i++) {
    const t = i / (leafletPairs - 1); // 0 = base, 1 = tip
    const yBase = 492 - t * 468;
    const envelope = Math.sin(Math.pow(t, 0.65) * Math.PI * 0.92 + 0.14);
    const len = 34 + envelope * 198;
    const droop = 18 + t * 28;
    const width = 9 + (1 - t) * 7;

    for (const side of [-1, 1]) {
      const tipX = 256 + side * len;
      const tipY = yBase - 42 + droop;
      const ctrlX = 256 + side * len * 0.52;
      const ctrlY = yBase - 34;

      const lGrad = pfctx.createLinearGradient(256, yBase, tipX, tipY);
      const shade = i % 2 === 0 ? '#3f7d2b' : '#4e9134';
      lGrad.addColorStop(0, '#2c5a1e');
      lGrad.addColorStop(0.45, shade);
      lGrad.addColorStop(1, '#79a83b');

      pfctx.fillStyle = lGrad;
      pfctx.beginPath();
      pfctx.moveTo(256, yBase - width * 0.45);
      pfctx.quadraticCurveTo(ctrlX, ctrlY - width * 0.55, tipX, tipY);
      pfctx.quadraticCurveTo(ctrlX, ctrlY + width * 0.35, 256, yBase + width * 0.45);
      pfctx.closePath();
      pfctx.fill();
    }
  }
  const palmFrondMap = new THREE.CanvasTexture(pfCanvas);
  palmFrondMap.colorSpace = THREE.SRGBColorSpace;
  palmFrondMap.anisotropy = aniso;

  // 10. Conifer Pine Needle Bough Alpha-Cutout Texture (sRGB RGBA)
  const pbCanvas = document.createElement('canvas');
  pbCanvas.width = 512;
  pbCanvas.height = 512;
  const pbctx = pbCanvas.getContext('2d')!;
  pbctx.clearRect(0, 0, 512, 512);

  // Woody inner branch twigs fanning upward/outward
  pbctx.strokeStyle = '#3d2a1a';
  pbctx.lineWidth = 9;
  pbctx.lineCap = 'round';
  pbctx.beginPath();
  pbctx.moveTo(256, 505);
  pbctx.lineTo(256, 52);
  pbctx.stroke();

  const subBranches = [
    { y0: 440, x1: 110, y1: 270 },
    { y0: 430, x1: 402, y1: 265 },
    { y0: 330, x1: 88, y1: 175 },
    { y0: 325, x1: 422, y1: 170 },
    { y0: 225, x1: 132, y1: 98 },
    { y0: 220, x1: 380, y1: 95 },
  ];
  pbctx.lineWidth = 5;
  for (const sb of subBranches) {
    pbctx.beginPath();
    pbctx.moveTo(256, sb.y0);
    pbctx.lineTo(sb.x1, sb.y1);
    pbctx.stroke();
  }

  // Dense layered pine needle clusters along trunk & sub-branches
  const drawNeedleFan = (cx: number, cy: number, baseAngle: number, scale: number, count: number) => {
    for (let n = 0; n < count; n++) {
      const a = baseAngle + (rng() - 0.5) * 1.35;
      const len = (22 + rng() * 26) * scale;
      const nx = cx + Math.sin(a) * len;
      const ny = cy - Math.cos(a) * len;
      const gTone = Math.floor(55 + rng() * 55);
      const rTone = Math.floor(24 + rng() * 34);
      const bTone = Math.floor(24 + rng() * 26);
      pbctx.strokeStyle = `rgb(${rTone},${gTone},${bTone})`;
      pbctx.lineWidth = 2.4 + rng() * 1.4;
      pbctx.beginPath();
      pbctx.moveTo(cx, cy);
      pbctx.lineTo(nx, ny);
      pbctx.stroke();
    }
  };

  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    const y = 475 - t * 425;
    drawNeedleFan(256, y, 0, 1.0 - t * 0.35, 34);
  }
  for (const sb of subBranches) {
    for (let k = 0.25; k <= 1.0; k += 0.15) {
      const bx = 256 + (sb.x1 - 256) * k;
      const by = sb.y0 + (sb.y1 - sb.y0) * k;
      const dir = Math.atan2(sb.x1 - 256, -(sb.y1 - sb.y0));
      drawNeedleFan(bx, by, dir, 0.85, 24);
    }
  }
  const pineBoughMap = new THREE.CanvasTexture(pbCanvas);
  pineBoughMap.colorSpace = THREE.SRGBColorSpace;
  pineBoughMap.anisotropy = aniso;

  // 11. Wild Meadow Grass Clump Alpha-Cutout Texture (sRGB RGBA)
  const grCanvas = document.createElement('canvas');
  grCanvas.width = 256;
  grCanvas.height = 256;
  const grctx = grCanvas.getContext('2d')!;
  grctx.clearRect(0, 0, 256, 256);

  const bladeCount = 13;
  for (let b = 0; b < bladeCount; b++) {
    const frac = b / (bladeCount - 1);
    const rootX = 88 + frac * 80 + (rng() - 0.5) * 12;
    const leanX = (frac - 0.5) * 125 + (rng() - 0.5) * 28;
    const tipY = 18 + Math.abs(frac - 0.5) * 58 + rng() * 26;
    const tipX = Math.max(10, Math.min(246, rootX + leanX));
    const ctrlX = rootX + leanX * 0.36;
    const ctrlY = 135;
    const halfBase = 6 + rng() * 4;

    const gGrad = grctx.createLinearGradient(rootX, 256, tipX, tipY);
    gGrad.addColorStop(0, '#2a4d1f');
    gGrad.addColorStop(0.45, b % 2 === 0 ? '#4e8a33' : '#5e9c3b');
    gGrad.addColorStop(1, '#a3c959');

    grctx.fillStyle = gGrad;
    grctx.beginPath();
    grctx.moveTo(rootX - halfBase, 256);
    grctx.quadraticCurveTo(ctrlX - halfBase * 0.45, ctrlY, tipX, tipY);
    grctx.quadraticCurveTo(ctrlX + halfBase * 0.45, ctrlY, rootX + halfBase, 256);
    grctx.closePath();
    grctx.fill();
  }
  const grassTuftMap = new THREE.CanvasTexture(grCanvas);
  grassTuftMap.colorSpace = THREE.SRGBColorSpace;
  grassTuftMap.anisotropy = aniso;

  // 12. Multi-Lobe Cloud Sprite Texture
  const clCanvas = document.createElement('canvas');
  clCanvas.width = 512;
  clCanvas.height = 256;
  const clctx = clCanvas.getContext('2d')!;
  const puffs = [
    { x: 165, y: 150, r: 78, a: 0.72 },
    { x: 256, y: 112, r: 98, a: 0.88 },
    { x: 345, y: 146, r: 82, a: 0.75 },
    { x: 215, y: 132, r: 84, a: 0.82 },
    { x: 298, y: 134, r: 80, a: 0.8 },
    { x: 112, y: 168, r: 54, a: 0.5 },
    { x: 398, y: 168, r: 56, a: 0.5 },
  ];
  for (const p of puffs) {
    const g = clctx.createRadialGradient(p.x, p.y - p.r * 0.12, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(255,255,255,${p.a})`);
    g.addColorStop(0.55, `rgba(242,249,255,${p.a * 0.52})`);
    g.addColorStop(1, 'rgba(230,244,255,0)');
    clctx.fillStyle = g;
    clctx.beginPath();
    clctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    clctx.fill();
  }
  const cloudMap = new THREE.CanvasTexture(clCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;

  return {
    asphaltMap,
    asphaltNormalMap,
    asphaltRoughnessMap,
    concreteCurbMap,
    curbMap,
    buildingFacadeMap,
    buildingEmissiveMap,
    carbonMap,
    contactShadowMap,
    terrainDetailMap,
    terrainNormalMap,
    barkMap,
    barkNormalMap,
    palmFrondMap,
    pineBoughMap,
    grassTuftMap,
    cloudMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltNormalMap.dispose();
      asphaltRoughnessMap.dispose();
      concreteCurbMap.dispose();
      curbMap.dispose();
      buildingFacadeMap.dispose();
      buildingEmissiveMap.dispose();
      carbonMap.dispose();
      contactShadowMap.dispose();
      terrainDetailMap.dispose();
      terrainNormalMap.dispose();
      barkMap.dispose();
      barkNormalMap.dispose();
      palmFrondMap.dispose();
      pineBoughMap.dispose();
      grassTuftMap.dispose();
      cloudMap.dispose();
    },
  };
}
