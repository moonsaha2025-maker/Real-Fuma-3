import * as THREE from 'three';

export interface ProceduralTexturePack {
  asphaltMap: THREE.CanvasTexture;
  asphaltBumpMap: THREE.CanvasTexture;
  concreteCurbMap: THREE.CanvasTexture;
  curbMap: THREE.CanvasTexture;
  buildingFacadeMap: THREE.CanvasTexture;
  carbonMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  terrainDetailMap: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(
  maxAnisotropy: number,
): ProceduralTexturePack {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  // 1. Crisp Highway Asphalt Texture (Double-Yellow Center + White Shoulders + Aggregate)
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 1024;
  asphaltCanvas.height = 1024;
  const actx = asphaltCanvas.getContext('2d')!;
  actx.fillStyle = '#252932';
  actx.fillRect(0, 0, 1024, 1024);

  // Subtle shoulder darkening
  actx.fillStyle = 'rgba(10, 12, 16, 0.34)';
  actx.fillRect(0, 0, 34, 1024);
  actx.fillRect(990, 0, 34, 1024);

  // Realistic tire-track wear paths
  actx.fillStyle = 'rgba(12, 15, 20, 0.24)';
  actx.fillRect(210, 0, 110, 1024);
  actx.fillRect(704, 0, 110, 1024);

  // Mineral aggregate grain
  for (let i = 0; i < 65000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const v = 26 + Math.floor(Math.random() * 42);
    actx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    actx.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
  }

  // Crisp white outer shoulder lines
  actx.fillStyle = '#e5e7eb';
  actx.fillRect(46, 0, 16, 1024);
  actx.fillRect(962, 0, 16, 1024);

  // Clean double amber-yellow center highway stripes
  actx.fillStyle = '#f59e0b';
  actx.fillRect(493, 0, 14, 1024);
  actx.fillRect(517, 0, 14, 1024);
  for (let i = 0; i < 700; i++) {
    actx.fillStyle = 'rgba(36, 40, 48, 0.32)';
    actx.fillRect(492 + Math.random() * 40, Math.random() * 1024, 3, 4);
  }

  const asphaltMap = new THREE.CanvasTexture(asphaltCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = aniso;

  // 1b. Asphalt Bump Map
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 28000; i++) {
    const v = 78 + Math.floor(Math.random() * 100);
    bctx.fillStyle = `rgb(${v},${v},${v})`;
    bctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const asphaltBumpMap = new THREE.CanvasTexture(bumpCanvas);
  asphaltBumpMap.wrapS = THREE.RepeatWrapping;
  asphaltBumpMap.wrapT = THREE.RepeatWrapping;
  asphaltBumpMap.anisotropy = aniso;

  // 2. Concrete Shoulder / Bridge Parapet Texture
  const ccCanvas = document.createElement('canvas');
  ccCanvas.width = 256;
  ccCanvas.height = 256;
  const ccctx = ccCanvas.getContext('2d')!;
  ccctx.fillStyle = '#cbd5e1';
  ccctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5500; i++) {
    const v = 178 + Math.floor(Math.random() * 46);
    ccctx.fillStyle = `rgb(${v},${v},${v - 4})`;
    ccctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ccctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
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
  const curbMap = new THREE.CanvasTexture(curbCanvas);
  curbMap.colorSpace = THREE.SRGBColorSpace;
  curbMap.wrapS = THREE.RepeatWrapping;
  curbMap.wrapT = THREE.RepeatWrapping;
  curbMap.anisotropy = aniso;

  // 4. Clean Architectural Glass Curtain-Wall Facade
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 512;
  bCanvas.height = 1024;
  const fctx = bCanvas.getContext('2d')!;
  fctx.fillStyle = '#18212e';
  fctx.fillRect(0, 0, 512, 1024);
  for (let r = 0; r < 32; r++) {
    fctx.fillStyle = '#263142';
    fctx.fillRect(0, r * 32, 512, 7);
    fctx.fillStyle = '#0f172a';
    fctx.fillRect(0, r * 32 + 7, 512, 2);
    for (let c = 0; c < 12; c++) {
      const gx = 8 + c * 42;
      const gy = r * 32 + 9;
      const rnd = Math.random();
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
    }
  }
  const buildingFacadeMap = new THREE.CanvasTexture(bCanvas);
  buildingFacadeMap.colorSpace = THREE.SRGBColorSpace;
  buildingFacadeMap.wrapS = THREE.RepeatWrapping;
  buildingFacadeMap.wrapT = THREE.RepeatWrapping;
  buildingFacadeMap.anisotropy = aniso;

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

  // 7. Organic Terrain Surface Detail Map
  const tdCanvas = document.createElement('canvas');
  tdCanvas.width = 512;
  tdCanvas.height = 512;
  const tdctx = tdCanvas.getContext('2d')!;
  tdctx.fillStyle = '#e4e4e4';
  tdctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 420; i++) {
    const v = 198 + Math.floor(Math.random() * 48);
    tdctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
    tdctx.beginPath();
    tdctx.arc(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 24, 0, Math.PI * 2);
    tdctx.fill();
  }
  for (let i = 0; i < 30000; i++) {
    const v = 180 + Math.floor(Math.random() * 70);
    tdctx.fillStyle = `rgb(${v},${v},${v})`;
    tdctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const terrainDetailMap = new THREE.CanvasTexture(tdCanvas);
  terrainDetailMap.colorSpace = THREE.SRGBColorSpace;
  terrainDetailMap.wrapS = THREE.RepeatWrapping;
  terrainDetailMap.wrapT = THREE.RepeatWrapping;
  terrainDetailMap.repeat.set(135, 135);
  terrainDetailMap.anisotropy = aniso;

  // 8. Tree Bark Texture
  const bkCanvas = document.createElement('canvas');
  bkCanvas.width = 256;
  bkCanvas.height = 256;
  const bkctx = bkCanvas.getContext('2d')!;
  bkctx.fillStyle = '#4a3220';
  bkctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 240; i++) {
    bkctx.fillStyle = i % 2 === 0 ? 'rgba(32, 20, 12, 0.5)' : 'rgba(98, 70, 46, 0.4)';
    bkctx.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 4, 18 + Math.random() * 48);
  }
  const barkMap = new THREE.CanvasTexture(bkCanvas);
  barkMap.colorSpace = THREE.SRGBColorSpace;
  barkMap.wrapS = THREE.RepeatWrapping;
  barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.anisotropy = aniso;

  // 9. Multi-Lobe Cloud Sprite Texture
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
    asphaltBumpMap,
    concreteCurbMap,
    curbMap,
    buildingFacadeMap,
    carbonMap,
    contactShadowMap,
    terrainDetailMap,
    barkMap,
    cloudMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltBumpMap.dispose();
      concreteCurbMap.dispose();
      curbMap.dispose();
      buildingFacadeMap.dispose();
      carbonMap.dispose();
      contactShadowMap.dispose();
      terrainDetailMap.dispose();
      barkMap.dispose();
      cloudMap.dispose();
    },
  };
}
