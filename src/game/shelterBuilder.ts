import * as THREE from 'three';
import { SHELTER_LAYOUT } from './shelterArrival';
import {
  SLOPE_GRADIENT,
  TRACK_LENGTH,
  getGroundHeightAt,
  getTrackCenterX,
  getTrackElevation,
  getTrackHalfWidth,
  getTrackSlopeTangentX,
} from './trackData';

/**
 * Pure architectural dimensions exported for deterministic clearance & layout tests.
 * Keeps the cabin footprint aligned with SHELTER_LAYOUT while matching the approved
 * rustic log-cabin reference facade (cobblestone plinth, 3-step wooden stairs,
 * arched plank door larger than Lofi, symmetrical 2x2 glowing windows, carved SHELTER sign,
 * snow-blanketed gabled roof, and stone-brick right chimney with snow cap).
 */
export const SHELTER_ARCHITECTURE = {
  /** Top of cobblestone foundation / porch landing deck above cabin ground grade (meters). */
  foundationHeight: 1.06,
  /** Horizontal log wall span from foundation top to roof eaves (meters). */
  logWallHeight: 4.58,
  /** Number of stacked horizontal timber log courses on main walls. */
  wallLogCourses: 7,
  /** Arched doorway dimensions (strictly larger than Lofi ~1.0m x 1.85m). */
  doorWidth: SHELTER_LAYOUT.doorWidth,
  doorHeight: SHELTER_LAYOUT.doorHeight,
  /** Forward projection of the 3-step entrance staircase beyond cabin front wall (meters). */
  stairsProjection: 2.25,
  /** Half-width of the bottom entrance step (meters) — stays clear of flanking greeter NPCs. */
  stairsHalfWidth: 2.66,
  /** Number of wooden entrance steps leading up to the porch landing. */
  stairSteps: 3,
} as const;

export interface MountainShelterHandles {
  /** Reposition cabin, flush checkered finish strip, and orange flag posts for a level's finish distance. */
  setLevelLength: (levelLength: number) => void;
  /** Animate lightweight chimney smoke puffs and gentle finish-flag breeze sway. */
  update: (time: number) => void;
  dispose: () => void;
}

/** Procedural warm horizontal wood-log grain texture + subtle bump map. */
function createLogWoodTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = w;
  cCanvas.height = h;
  const cctx = cCanvas.getContext('2d')!;

  const grad = cctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#6a3d1c');
  grad.addColorStop(0.28, '#8d572c');
  grad.addColorStop(0.55, '#7e4b24');
  grad.addColorStop(0.84, '#633718');
  grad.addColorStop(1, '#4c2911');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, w, h);

  const bCanvas = document.createElement('canvas');
  bCanvas.width = w;
  bCanvas.height = h;
  const bctx = bCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, w, h);

  // Fibrous horizontal timber grain streaks
  for (let i = 0; i < 95; i++) {
    const y = (i * 19.7) % h;
    const thickness = 1.2 + (i % 4) * 0.7;
    const dark = i % 3 === 0;
    cctx.fillStyle = dark ? 'rgba(46, 23, 9, 0.24)' : 'rgba(196, 132, 74, 0.16)';
    cctx.fillRect(0, y, w, thickness);

    bctx.fillStyle = dark ? 'rgba(65, 65, 65, 0.35)' : 'rgba(175, 175, 175, 0.28)';
    bctx.fillRect(0, y, w, thickness);
  }

  // Subtle knots
  for (let k = 0; k < 5; k++) {
    const kx = 55 + k * 96;
    const ky = 42 + ((k * 73) % (h - 84));
    cctx.strokeStyle = 'rgba(48, 24, 10, 0.26)';
    cctx.lineWidth = 2;
    cctx.beginPath();
    cctx.ellipse(kx, ky, 18, 6, 0, 0, Math.PI * 2);
    cctx.stroke();
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.min(8, maxAnisotropy);

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/** Procedural circular cut-log end-grain texture with warm golden-tan rings & bark rim. */
function createLogEndTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size * 0.5;
  const cy = size * 0.5;

  ctx.fillStyle = '#4c2912';
  ctx.fillRect(0, 0, size, size);

  const rad = ctx.createRadialGradient(cx, cy, 8, cx, cy, size * 0.48);
  rad.addColorStop(0, '#c08b53');
  rad.addColorStop(0.55, '#a8723d');
  rad.addColorStop(0.86, '#875427');
  rad.addColorStop(0.95, '#593115');
  rad.addColorStop(1, '#3f210d');
  ctx.fillStyle = rad;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  // Concentric growth rings
  for (let r = 16; r < size * 0.44; r += 14) {
    ctx.strokeStyle = 'rgba(72, 38, 15, 0.34)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx + Math.sin(r) * 2, cy + Math.cos(r) * 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle radial wood split check lines
  ctx.strokeStyle = 'rgba(58, 29, 10, 0.36)';
  ctx.lineWidth = 2.2;
  for (const ang of [0.4, 2.35, 4.7]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * size * 0.36, cy + Math.sin(ang) * size * 0.36);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Procedural vertical wood-plank texture for the centered arched shelter door. */
function createDoorPlankTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const plankCount = 7;
  const plankW = w / plankCount;

  for (let i = 0; i < plankCount; i++) {
    const x0 = i * plankW;
    const shade = (i % 3) * 6 - 6;
    const r = 132 + shade;
    const g = 81 + Math.round(shade * 0.7);
    const b = 41 + Math.round(shade * 0.5);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x0, 0, plankW, h);

    // Subtle vertical wood grain per plank
    for (let s = 0; s < 14; s++) {
      const gx = x0 + 4 + ((s * 17 + i * 11) % (plankW - 8));
      ctx.fillStyle = s % 2 === 0 ? 'rgba(56, 28, 10, 0.16)' : 'rgba(196, 134, 76, 0.12)';
      ctx.fillRect(gx, 0, 2.2, h);
    }

    // Crisp vertical groove seam between boards
    if (i > 0) {
      ctx.fillStyle = 'rgba(42, 20, 8, 0.72)';
      ctx.fillRect(x0 - 2.5, 0, 5, h);
      ctx.fillStyle = 'rgba(190, 128, 72, 0.22)';
      ctx.fillRect(x0 + 2.5, 0, 2, h);
    }
  }

  // Subtle warm top/bottom shading for depth inside the arched frame
  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, 'rgba(30, 14, 5, 0.26)');
  vignette.addColorStop(0.18, 'rgba(30, 14, 5, 0.0)');
  vignette.addColorStop(0.86, 'rgba(30, 14, 5, 0.0)');
  vignette.addColorStop(1, 'rgba(26, 12, 4, 0.24)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Procedural warm wooden carved "SHELTER" signboard matching the reference plaque. */
function createShelterSignTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 144;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Warm honey-cedar plank fill
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#b57b45');
  bg.addColorStop(0.45, '#a06735');
  bg.addColorStop(1, '#824e24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal wood grain streaks
  for (let i = 0; i < 28; i++) {
    const gy = (i * 11.3) % h;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(66, 36, 14, 0.14)' : 'rgba(225, 172, 114, 0.12)';
    ctx.fillRect(0, gy, w, 2.2);
  }

  // Carved inner plank bevel outline
  ctx.strokeStyle = 'rgba(62, 33, 13, 0.55)';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  ctx.strokeStyle = 'rgba(226, 174, 118, 0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Carved dark espresso "SHELTER" lettering with subtle lower edge catch-light
  ctx.font = '900 80px "Fredoka", "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(236, 188, 134, 0.48)';
  ctx.fillText('SHELTER', w * 0.5, h * 0.53 + 2.5);

  ctx.fillStyle = '#2d1608';
  ctx.fillText('SHELTER', w * 0.5, h * 0.52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Procedural warm glowing golden lantern windowpane texture (cozy interior warmth). */
function createWindowGlowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.54,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.68,
  );
  grad.addColorStop(0, '#fff2b0');
  grad.addColorStop(0.42, '#ffc957');
  grad.addColorStop(0.78, '#eb8c26');
  grad.addColorStop(1, '#b65814');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle warm interior window-pane shading around outer frame perimeter
  ctx.strokeStyle = 'rgba(110, 44, 10, 0.45)';
  ctx.lineWidth = 14;
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Procedural dark cobblestone fieldstone masonry texture + bump map for the cabin foundation. */
function createCobblestoneTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 512;
  const h = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = w;
  cCanvas.height = h;
  const cctx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = w;
  bCanvas.height = h;
  const bctx = bCanvas.getContext('2d')!;

  // Dark stone mortar base
  cctx.fillStyle = '#262523';
  cctx.fillRect(0, 0, w, h);
  bctx.fillStyle = '#262626';
  bctx.fillRect(0, 0, w, h);

  const rows = 4;
  const rowH = h / rows;
  const stonePalette = ['#56534e', '#4c4945', '#635f59', '#45433f', '#5d5953'];

  const drawRoundedStone = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    sw: number,
    sh: number,
    rad: number,
  ) => {
    const r = Math.min(rad, sw * 0.42, sh * 0.42);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + sw - r, y);
    ctx.quadraticCurveTo(x + sw, y, x + sw, y + r);
    ctx.lineTo(x + sw, y + sh - r);
    ctx.quadraticCurveTo(x + sw, y + sh, x + sw - r, y + sh);
    ctx.lineTo(x + r, y + sh);
    ctx.quadraticCurveTo(x, y + sh, x, y + sh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -38;
    let colIdx = 0;
    while (x < w + 48) {
      const seed = r * 31 + colIdx * 17;
      const sw = 58 + (seed % 34);
      const sh = rowH - 8;
      const sy = r * rowH + 4 + ((seed % 5) - 2);
      const sx = x + 4;
      const drawW = sw - 8;
      const color = stonePalette[seed % stonePalette.length];

      // Draw stone on color canvas (wrapped horizontally for seamless tiling)
      for (const ox of [0, -w, w]) {
        if (sx + ox + drawW < -10 || sx + ox > w + 10) continue;
        drawRoundedStone(cctx, sx + ox, sy, drawW, sh, 16);
        cctx.fillStyle = color;
        cctx.fill();

        // Soft upper bevel highlight on stone
        cctx.strokeStyle = 'rgba(195, 190, 182, 0.16)';
        cctx.lineWidth = 2.5;
        cctx.stroke();

        // Bump map raised stone face
        drawRoundedStone(bctx, sx + ox, sy, drawW, sh, 16);
        bctx.fillStyle = '#c8c8c8';
        bctx.fill();
      }

      x += sw;
      colIdx++;
    }
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3.4, 1);
  map.anisotropy = Math.min(8, maxAnisotropy);

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3.4, 1);

  return { map, bumpMap };
}

/** Procedural dark coursed stone-brick texture + bump map for the right-slope chimney. */
function createChimneyBrickTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 512;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = w;
  cCanvas.height = h;
  const cctx = cCanvas.getContext('2d')!;

  const bCanvas = document.createElement('canvas');
  bCanvas.width = w;
  bCanvas.height = h;
  const bctx = bCanvas.getContext('2d')!;

  cctx.fillStyle = '#252628';
  cctx.fillRect(0, 0, w, h);
  bctx.fillStyle = '#282828';
  bctx.fillRect(0, 0, w, h);

  const rows = 10;
  const cols = 3;
  const rowH = h / rows;
  const colW = w / cols;
  const tones = ['#4f5054', '#434549', '#5a5c60', '#3d3f43'];

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset + 3;
      const by = r * rowH + 3;
      const bw = colW - 6;
      const bh = rowH - 6;
      cctx.fillStyle = tones[(r * 7 + c + 12) % tones.length];
      cctx.fillRect(bx, by, bw, bh);
      cctx.fillStyle = 'rgba(210, 214, 222, 0.08)';
      cctx.fillRect(bx, by, bw, 4);

      bctx.fillStyle = '#c4c4c4';
      bctx.fillRect(bx, by, bw, bh);
    }
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.min(8, maxAnisotropy);

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/** Procedural dark-navy and snow-white checkered finish tape texture (2 rows x 16 cols). */
function createCheckeredFinishTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const cols = 16;
  const rows = 2;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#233952' : '#f4f9fe';
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

  ctx.fillStyle = '#4e6f8c';
  ctx.fillRect(0, 0, canvas.width, 7);
  ctx.fillRect(0, canvas.height - 7, canvas.width, 7);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Procedural soft radial warm welcome glow on snow outside the cabin entrance & windows. */
function createWarmFloorGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 206, 114, 0.44)');
  grad.addColorStop(0.55, 'rgba(255, 184, 88, 0.16)');
  grad.addColorStop(1, 'rgba(255, 180, 84, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Helper: create a rounded rectangle 2D Shape centered at (0, 0). */
function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const cr = Math.min(r, hw, hh);
  const s = new THREE.Shape();
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  s.lineTo(hw, hh - cr);
  s.quadraticCurveTo(hw, hh, hw - cr, hh);
  s.lineTo(-hw + cr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  s.lineTo(-hw, -hh + cr);
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return s;
}

/** Helper: create an arched doorway 2D Shape (bottom at y = 0, semi-circular arch top). */
function createArchedDoorShape(w: number, h: number): THREE.Shape {
  const hw = w * 0.5;
  const archRadius = hw;
  const straightH = Math.max(0.2, h - archRadius);
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, straightH);
  s.absarc(0, straightH, archRadius, 0, Math.PI, false);
  s.lineTo(-hw, 0);
  s.closePath();
  return s;
}

/** Helper: create a hollow arched door frame (outer arch with inner arch cutout) for true 3D recess. */
function createHollowArchedFrameShape(
  outerW: number,
  outerH: number,
  frameThickness: number,
): THREE.Shape {
  const shape = createArchedDoorShape(outerW, outerH);
  const innerW = outerW - frameThickness * 2;
  const innerH = outerH - frameThickness;
  const ihw = innerW * 0.5;
  const straightH = Math.max(0.15, innerH - ihw);

  const hole = new THREE.Path();
  hole.moveTo(-ihw, 0);
  hole.lineTo(-ihw, straightH);
  hole.absarc(0, straightH, ihw, Math.PI, 0, true);
  hole.lineTo(ihw, 0);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

/** Normalize ExtrudeGeometry planar XY UVs into [0..1] for clean canvas texture projection. */
function normalizePlanarXYUvs(
  geo: THREE.BufferGeometry,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const spanX = Math.max(1e-5, maxX - minX);
  const spanY = Math.max(1e-5, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - minX) / spanX;
    const v = (pos.getY(i) - minY) / spanY;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Stylized 3D Mountain Rescue Shelter + Flush Checkered Finish Area:
 * Rebuilt faithfully from the front-view shelter reference as a complete 3D log cabin
 * (horizontal stacked logs with corner cut ends, cobblestone foundation, 3-step wooden stairs,
 * centered arched vertical-plank door with dark lintel & iron ring handle, two symmetrical
 * warm-glowing 2x2 mullioned windows, carved wooden "SHELTER" plaque, warm timber pitched
 * roof with thick rounded snow blanket, and stone-brick right chimney with snow cap).
 */
export function createMountainShelter(
  scene: THREE.Scene,
  maxAnisotropy: number,
): MountainShelterHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const { map: logMap, bumpMap: logBump } = createLogWoodTextures(maxAnisotropy);
  const logEndTex = createLogEndTexture(maxAnisotropy);
  const doorPlankTex = createDoorPlankTexture(maxAnisotropy);
  const signTex = createShelterSignTexture(maxAnisotropy);
  const windowGlowTex = createWindowGlowTexture(maxAnisotropy);
  const { map: cobbleMap, bumpMap: cobbleBump } = createCobblestoneTextures(maxAnisotropy);
  const { map: chimneyMap, bumpMap: chimneyBump } = createChimneyBrickTextures(maxAnisotropy);
  const checkerTex = createCheckeredFinishTexture(maxAnisotropy);
  const warmFloorTex = createWarmFloorGlowTexture();
  disposables.push(
    logMap,
    logBump,
    logEndTex,
    doorPlankTex,
    signTex,
    windowGlowTex,
    cobbleMap,
    cobbleBump,
    chimneyMap,
    chimneyBump,
    checkerTex,
    warmFloorTex,
  );

  // --- Cohesive Stylized Cabin Materials ---
  const matWoodCore = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4c2c16,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const matLogWarm = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: logMap,
      bumpMap: logBump,
      bumpScale: 0.05,
      roughness: 0.82,
      metalness: 0.02,
    }),
  );
  const matLogRich = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xebd3bc,
      map: logMap,
      bumpMap: logBump,
      bumpScale: 0.05,
      roughness: 0.84,
      metalness: 0.02,
    }),
  );
  const matLogEnd = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: logEndTex,
      roughness: 0.8,
      metalness: 0.02,
    }),
  );
  const matWoodTrim = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x855229,
      map: logMap,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  const matWoodRoof = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6a3e1d,
      map: logMap,
      bumpMap: logBump,
      bumpScale: 0.04,
      roughness: 0.82,
      metalness: 0.03,
    }),
  );
  const matWoodStairs = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8d582d,
      map: logMap,
      roughness: 0.8,
      metalness: 0.02,
    }),
  );
  const matWoodStairRiser = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x573318,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );
  const matDoorPlank = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: doorPlankTex,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  const matLintelDark = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3f3734,
      roughness: 0.84,
      metalness: 0.06,
    }),
  );
  const matIronHardware = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x26282c,
      roughness: 0.42,
      metalness: 0.62,
    }),
  );
  const matSignFront = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: signTex,
      roughness: 0.64,
      metalness: 0.02,
    }),
  );
  const matSignEdge = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7b4922,
      roughness: 0.78,
      metalness: 0.02,
    }),
  );
  const matWindowGlow = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: windowGlowTex,
      emissive: 0xffa630,
      emissiveMap: windowGlowTex,
      emissiveIntensity: 0.95,
      roughness: 0.25,
      metalness: 0.0,
    }),
  );
  const matSnowThick = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf2f7ff,
      roughness: 0.78,
      metalness: 0.01,
    }),
  );
  const matFoundationCobble = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: cobbleMap,
      bumpMap: cobbleBump,
      bumpScale: 0.08,
      roughness: 0.9,
      metalness: 0.03,
    }),
  );
  const matFoundationCap = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x524f4b,
      roughness: 0.88,
      metalness: 0.04,
    }),
  );
  const matChimneyBrick = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: chimneyMap,
      bumpMap: chimneyBump,
      bumpScale: 0.07,
      roughness: 0.88,
      metalness: 0.04,
    }),
  );
  const matChimneyCrown = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x45474b,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const matPostNavy = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x263d56,
      roughness: 0.62,
      metalness: 0.08,
    }),
  );
  const matFlagOrange = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef8d38,
      roughness: 0.46,
      metalness: 0.03,
    }),
  );
  const matCheckered = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: checkerTex,
      roughness: 0.84,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  const matWarmFloor = trackMat(
    new THREE.MeshBasicMaterial({
      map: warmFloorTex,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  // =========================================================================
  // 1. 3D MOUNTAIN LOG SHELTER CABIN (Replaces previous cabin cleanly in place)
  // =========================================================================
  const cabinGroup = new THREE.Group();
  scene.add(cabinGroup);

  const W = SHELTER_LAYOUT.cabinWidth; // 15.6m
  const D = SHELTER_LAYOUT.cabinHalfDepth * 2; // 8.6m
  const halfW = W * 0.5; // 7.8m
  const halfD = D * 0.5; // 4.3m
  const foundationH = SHELTER_ARCHITECTURE.foundationHeight; // 1.06m
  const wallH = SHELTER_ARCHITECTURE.logWallHeight; // 4.58m
  const eaveY = foundationH + wallH; // 5.64m

  // 1A. Cobblestone Foundation + Deep Buried Sub-Foundation (never floats on downhill slope)
  const subFoundationGeo = trackGeo(new THREE.BoxGeometry(W + 0.52, 5.2, D + 0.52));
  const subFoundation = new THREE.Mesh(subFoundationGeo, matFoundationCap);
  subFoundation.position.y = -2.55;
  subFoundation.receiveShadow = true;
  cabinGroup.add(subFoundation);

  const cobbleGeo = trackGeo(new THREE.BoxGeometry(W + 0.58, foundationH, D + 0.58));
  const cobbleBase = new THREE.Mesh(cobbleGeo, matFoundationCobble);
  cobbleBase.position.y = foundationH * 0.5;
  cobbleBase.castShadow = true;
  cobbleBase.receiveShadow = true;
  cabinGroup.add(cobbleBase);

  // Stepped dark stone coping cap crowning the cobblestone foundation
  const cobbleCapGeo = trackGeo(new THREE.BoxGeometry(W + 0.82, 0.17, D + 0.82));
  const cobbleCap = new THREE.Mesh(cobbleCapGeo, matFoundationCap);
  cobbleCap.position.y = foundationH - 0.02;
  cobbleCap.castShadow = true;
  cobbleCap.receiveShadow = true;
  cabinGroup.add(cobbleCap);

  // 1B. Solid Recessed Inner Timber Core (prevents any light leak between stacked horizontal logs)
  const innerCoreGeo = trackGeo(new THREE.BoxGeometry(W - 0.52, wallH + 0.1, D - 0.52));
  const innerCore = new THREE.Mesh(innerCoreGeo, matWoodCore);
  innerCore.position.y = foundationH + wallH * 0.5;
  innerCore.castShadow = true;
  innerCore.receiveShadow = true;
  cabinGroup.add(innerCore);

  // 1C. Horizontal Stacked Timber Logs (front, back, & protruding circular-end side logs)
  const logRadius = 0.34;
  const logCourses = SHELTER_ARCHITECTURE.wallLogCourses; // 7 courses
  const logStepY = wallH / logCourses; // ~0.654m

  const frontBackLogGeo = trackGeo(
    new THREE.CylinderGeometry(logRadius, logRadius, W + 0.2, 14, 1, false),
  );
  frontBackLogGeo.rotateZ(Math.PI / 2);

  const sideLogGeo = trackGeo(
    new THREE.CylinderGeometry(logRadius, logRadius, D + 0.78, 14, 1, false),
  );
  sideLogGeo.rotateX(Math.PI / 2);

  const sideLogMatsWarm = [matLogWarm, matLogEnd, matLogEnd];
  const sideLogMatsRich = [matLogRich, matLogEnd, matLogEnd];

  for (let i = 0; i < logCourses; i++) {
    const ly = foundationH + logRadius + i * logStepY;
    const isEven = i % 2 === 0;
    const matMain = isEven ? matLogWarm : matLogRich;

    // Front (+Z) & Back (-Z) horizontal logs
    for (const zPos of [halfD, -halfD]) {
      const log = new THREE.Mesh(frontBackLogGeo, matMain);
      log.position.set(0, ly, zPos);
      log.castShadow = true;
      log.receiveShadow = true;
      cabinGroup.add(log);
    }

    // Left (-X) & Right (+X) side wall logs with circular cut-grain ends protruding forward/back
    for (const xPos of [-halfW + 0.14, halfW - 0.14]) {
      const sideLog = new THREE.Mesh(
        sideLogGeo,
        isEven ? sideLogMatsWarm : sideLogMatsRich,
      );
      sideLog.position.set(xPos, ly, 0);
      sideLog.castShadow = true;
      sideLog.receiveShadow = true;
      cabinGroup.add(sideLog);
    }
  }

  // 1D. Triangular Pitched Gable Wall (Recessed Fill + Stacked Horizontal Gable Logs + Carpentry Brackets)
  const roofHalfSpan = halfW + 2.08; // 9.88m each side -> wide cozy chalet overhang
  const roofPeakH = 4.62; // Peak rises 4.62m above eaves -> balanced ~25° gable matching reference
  const roofDepth = D + 3.0; // 11.6m deep -> 1.5m front & back overhang

  const gableFillShape = new THREE.Shape();
  gableFillShape.moveTo(-halfW + 0.12, 0);
  gableFillShape.lineTo(0, roofPeakH - 0.38);
  gableFillShape.lineTo(halfW - 0.12, 0);
  gableFillShape.closePath();

  const gableFillGeo = trackGeo(
    new THREE.ExtrudeGeometry(gableFillShape, {
      depth: D - 0.36,
      bevelEnabled: false,
    }),
  );
  gableFillGeo.translate(0, 0, -(D - 0.36) * 0.5);
  const gableFill = new THREE.Mesh(gableFillGeo, matWoodCore);
  gableFill.position.y = eaveY - 0.08;
  gableFill.castShadow = true;
  gableFill.receiveShadow = true;
  cabinGroup.add(gableFill);

  // Stacked horizontal logs filling the triangular front & back gable faces
  const gableLogCount = 6;
  for (let i = 0; i < gableLogCount; i++) {
    const relY = 0.24 + i * 0.62;
    if (relY >= roofPeakH - 0.72) break;
    const tHeight = relY / (roofPeakH - 0.15);
    const spanW = Math.max(1.6, (halfW * 2 - 0.2) * (1 - tHeight));
    const gLogGeo = trackGeo(
      new THREE.CylinderGeometry(0.32, 0.32, spanW, 12, 1, false),
    );
    gLogGeo.rotateZ(Math.PI / 2);
    const matG = i % 2 === 0 ? matLogRich : matLogWarm;

    for (const zPos of [halfD, -halfD]) {
      const gLog = new THREE.Mesh(gLogGeo, matG);
      gLog.position.set(0, eaveY + relY, zPos);
      gLog.castShadow = true;
      gLog.receiveShadow = true;
      cabinGroup.add(gLog);
    }
  }

  // Front & back gable timber brackets (center king-post, twin mid purlin corbels, outer eave corbels)
  const kingPostGeo = trackGeo(new THREE.BoxGeometry(0.68, 1.18, 1.05));
  const purlinCorbelGeo = trackGeo(new THREE.BoxGeometry(0.64, 1.04, 1.05));
  const eaveCorbelGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.9, 1.16));

  for (const sideZ of [1, -1]) {
    const zBracket = sideZ * (halfD + 0.52);

    const kingPost = new THREE.Mesh(kingPostGeo, matWoodTrim);
    kingPost.position.set(0, eaveY + roofPeakH - 1.16, zBracket);
    kingPost.castShadow = true;
    cabinGroup.add(kingPost);

    for (const sx of [-4.25, 4.25]) {
      const corbel = new THREE.Mesh(purlinCorbelGeo, matWoodTrim);
      corbel.position.set(sx, eaveY + 1.48, zBracket);
      corbel.castShadow = true;
      cabinGroup.add(corbel);
    }

    for (const sx of [-halfW + 0.14, halfW - 0.14]) {
      const eaveCorbel = new THREE.Mesh(eaveCorbelGeo, matWoodTrim);
      eaveCorbel.position.set(sx, eaveY + 0.1, sideZ * (halfD + 0.42));
      eaveCorbel.castShadow = true;
      cabinGroup.add(eaveCorbel);
    }
  }

  // 1E. Warm Timber Gabled Roof Overhang + Thick Rounded Pillowy Snow Blanket
  const roofShellShape = new THREE.Shape();
  roofShellShape.moveTo(-roofHalfSpan, -0.42);
  roofShellShape.lineTo(0, roofPeakH);
  roofShellShape.lineTo(roofHalfSpan, -0.42);
  roofShellShape.lineTo(roofHalfSpan - 0.62, -1.04);
  roofShellShape.lineTo(0, roofPeakH - 0.78);
  roofShellShape.lineTo(-roofHalfSpan + 0.62, -1.04);
  roofShellShape.closePath();

  const roofShellGeo = trackGeo(
    new THREE.ExtrudeGeometry(roofShellShape, {
      depth: roofDepth,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.12,
      bevelSegments: 2,
    }),
  );
  roofShellGeo.translate(0, 0, -roofDepth * 0.5);
  const roofShell = new THREE.Mesh(roofShellGeo, matWoodRoof);
  roofShell.position.y = eaveY + 0.28;
  roofShell.castShadow = true;
  roofShell.receiveShadow = true;
  cabinGroup.add(roofShell);

  // Thick, rounded snow blanket draped smoothly over both gabled roof slopes
  const slopeDx = roofHalfSpan + 0.24;
  const slopeDy = roofPeakH + 0.42;
  const slopeLen = Math.hypot(slopeDx, slopeDy);
  const slopeAngle = Math.atan2(slopeDy, slopeDx);

  const snowSlabShape = createRoundedRectShape(slopeLen + 0.55, 0.84, 0.4);
  const snowSlabGeo = trackGeo(
    new THREE.ExtrudeGeometry(snowSlabShape, {
      depth: roofDepth + 0.36,
      bevelEnabled: true,
      bevelThickness: 0.32,
      bevelSize: 0.26,
      bevelSegments: 4,
    }),
  );
  snowSlabGeo.translate(0, 0, -(roofDepth + 0.36) * 0.5);

  ([-1, 1] as const).forEach((side) => {
    const snowSlope = new THREE.Mesh(snowSlabGeo, matSnowThick);
    snowSlope.position.set(
      side * (slopeDx * 0.5),
      eaveY + 0.38 + slopeDy * 0.5,
      0,
    );
    snowSlope.rotation.z = side * -slopeAngle;
    snowSlope.castShadow = true;
    snowSlope.receiveShadow = true;
    cabinGroup.add(snowSlope);
  });

  // Soft pillowy snow ridge crown & thick bulbous overhanging eave pillows
  const ridgeRollGeo = trackGeo(
    new THREE.CapsuleGeometry(0.62, roofDepth + 0.44, 8, 14),
  );
  ridgeRollGeo.rotateX(Math.PI / 2);
  const ridgeRoll = new THREE.Mesh(ridgeRollGeo, matSnowThick);
  ridgeRoll.position.set(0, eaveY + roofPeakH + 0.62, 0);
  ridgeRoll.castShadow = true;
  ridgeRoll.receiveShadow = true;
  cabinGroup.add(ridgeRoll);

  const eaveRollGeo = trackGeo(
    new THREE.CapsuleGeometry(0.62, roofDepth + 0.38, 8, 14),
  );
  eaveRollGeo.rotateX(Math.PI / 2);
  ([-1, 1] as const).forEach((side) => {
    const eaveRoll = new THREE.Mesh(eaveRollGeo, matSnowThick);
    eaveRoll.position.set(side * (roofHalfSpan + 0.14), eaveY + 0.08, 0);
    eaveRoll.castShadow = true;
    eaveRoll.receiveShadow = true;
    cabinGroup.add(eaveRoll);
  });

  // Subtle organic pillowy snow swells along the front gable overhang (matching soft wavy silhouette)
  const billowGeo = trackGeo(new THREE.SphereGeometry(1, 14, 10));
  const frontSnowZ = roofDepth * 0.5 + 0.04;
  const frontBillows: Array<[number, number, number, number, number]> = [
    [0, eaveY + roofPeakH + 0.66, 1.35, 0.74, 0.85],
    [-2.5, eaveY + roofPeakH - 0.52, 1.45, 0.64, 0.78],
    [2.5, eaveY + roofPeakH - 0.52, 1.45, 0.64, 0.78],
    [-5.3, eaveY + roofPeakH - 1.92, 1.55, 0.66, 0.78],
    [5.3, eaveY + roofPeakH - 1.92, 1.55, 0.66, 0.78],
    [-8.1, eaveY + roofPeakH - 3.32, 1.4, 0.64, 0.78],
    [8.1, eaveY + roofPeakH - 3.32, 1.4, 0.64, 0.78],
    [-roofHalfSpan - 0.18, eaveY + 0.12, 0.96, 0.76, 0.86],
    [roofHalfSpan + 0.18, eaveY + 0.12, 0.96, 0.76, 0.86],
  ];
  for (const [bx, by, sx, sy, sz] of frontBillows) {
    const b = new THREE.Mesh(billowGeo, matSnowThick);
    b.position.set(bx, by, frontSnowZ);
    b.scale.set(sx, sy, sz);
    b.receiveShadow = true;
    cabinGroup.add(b);
  }

  // 1F. Centered Arched Vertical-Plank Wooden Door + Dark Rectangular Lintel + Iron Ring Handle
  const doorW = SHELTER_ARCHITECTURE.doorWidth; // 3.4m (larger than Lofi)
  const doorH = SHELTER_ARCHITECTURE.doorHeight; // 4.1m (larger than Lofi)
  const doorBaseY = foundationH;

  // Dark stone/timber rectangular lintel backing strictly behind door leaf (shows cleanly at outer arch spandrels)
  const lintelBackGeo = trackGeo(new THREE.BoxGeometry(doorW + 0.72, 1.56, 0.24));
  const lintelBack = new THREE.Mesh(lintelBackGeo, matLintelDark);
  lintelBack.position.set(0, doorBaseY + doorH - 0.36, halfD + 0.26);
  lintelBack.castShadow = true;
  cabinGroup.add(lintelBack);

  const lintelCapGeo = trackGeo(new THREE.BoxGeometry(doorW + 1.02, 0.32, 0.5));
  const lintelCap = new THREE.Mesh(lintelCapGeo, matLintelDark);
  lintelCap.position.set(0, doorBaseY + doorH + 0.38, halfD + 0.4);
  lintelCap.castShadow = true;
  cabinGroup.add(lintelCap);

  // Hollow 3D beveled arched wooden door surround (proud of door panel -> zero z-fighting!)
  const doorSurroundShape = createHollowArchedFrameShape(doorW + 0.56, doorH + 0.24, 0.34);
  const doorSurroundGeo = trackGeo(
    new THREE.ExtrudeGeometry(doorSurroundShape, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
    }),
  );
  const doorSurround = new THREE.Mesh(doorSurroundGeo, matWoodTrim);
  doorSurround.position.set(0, doorBaseY, halfD + 0.2);
  doorSurround.castShadow = true;
  doorSurround.receiveShadow = true;
  cabinGroup.add(doorSurround);

  // Arched vertical-plank wooden door leaf seated cleanly in front of lintelBack and inside hollow surround
  const doorLeafW = doorW - 0.04;
  const doorLeafH = doorH - 0.04;
  const doorLeafShape = createArchedDoorShape(doorLeafW, doorLeafH);
  const doorLeafGeo = trackGeo(
    new THREE.ExtrudeGeometry(doorLeafShape, {
      depth: 0.14,
      bevelEnabled: false,
    }),
  );
  normalizePlanarXYUvs(doorLeafGeo, -doorLeafW * 0.5, doorLeafW * 0.5, 0, doorLeafH);
  const doorLeaf = new THREE.Mesh(doorLeafGeo, matDoorPlank);
  doorLeaf.position.set(0, doorBaseY, halfD + 0.41);
  doorLeaf.receiveShadow = true;
  cabinGroup.add(doorLeaf);

  // Forged dark-iron ring handle / knocker mounted on the right side of the arched door
  const handleGroup = new THREE.Group();
  handleGroup.position.set(doorW * 0.27, doorBaseY + doorH * 0.46, halfD + 0.57);
  cabinGroup.add(handleGroup);

  const rosetteGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.16, 0.08, 12));
  rosetteGeo.rotateX(Math.PI / 2);
  const rosette = new THREE.Mesh(rosetteGeo, matIronHardware);
  handleGroup.add(rosette);

  const ringGeo = trackGeo(new THREE.TorusGeometry(0.21, 0.058, 8, 18));
  const handleRing = new THREE.Mesh(ringGeo, matIronHardware);
  handleRing.position.set(0, -0.17, 0.05);
  handleGroup.add(handleRing);

  // 1G. Two Symmetrical Warm Glowing 2x2 Cross-Mullion Windows (left & right of door)
  const winW = 2.45;
  const winH = 2.28;
  const winY = foundationH + 2.38;
  const frameBar = 0.24;

  const winPaneGeo = trackGeo(new THREE.PlaneGeometry(winW - 0.04, winH - 0.04));
  const winJambGeo = trackGeo(new THREE.BoxGeometry(frameBar, winH + frameBar * 0.5, 0.46));
  const winHeadGeo = trackGeo(new THREE.BoxGeometry(winW + frameBar * 2.5, frameBar * 1.05, 0.5));
  const winSillGeo = trackGeo(new THREE.BoxGeometry(winW + frameBar * 2.8, frameBar * 1.15, 0.62));
  const mullionVGeo = trackGeo(new THREE.BoxGeometry(0.16, winH - 0.04, 0.14));
  const mullionHGeo = trackGeo(new THREE.BoxGeometry(winW - 0.04, 0.16, 0.14));

  ([-4.78, 4.78] as const).forEach((wx) => {
    const winGroup = new THREE.Group();
    winGroup.position.set(wx, winY, halfD + 0.34);
    cabinGroup.add(winGroup);

    // Warm golden glowing glass pane recessed cleanly inside the timber casing
    const pane = new THREE.Mesh(winPaneGeo, matWindowGlow);
    pane.position.z = 0.08;
    winGroup.add(pane);

    // 2x2 cross mullions cleanly in front of the glowing glass
    const mv = new THREE.Mesh(mullionVGeo, matWoodTrim);
    mv.position.z = 0.15;
    winGroup.add(mv);

    const mh = new THREE.Mesh(mullionHGeo, matWoodTrim);
    mh.position.z = 0.15;
    winGroup.add(mh);

    // Left & right vertical window jambs
    for (const jx of [-(winW * 0.5 + frameBar * 0.4), winW * 0.5 + frameBar * 0.4]) {
      const jamb = new THREE.Mesh(winJambGeo, matWoodTrim);
      jamb.position.set(jx, 0, 0.08);
      jamb.castShadow = true;
      winGroup.add(jamb);
    }

    // Top wooden window header
    const head = new THREE.Mesh(winHeadGeo, matWoodTrim);
    head.position.set(0, winH * 0.5 + frameBar * 0.45, 0.1);
    head.castShadow = true;
    winGroup.add(head);

    // Sturdy protruding wooden windowsill
    const sill = new THREE.Mesh(winSillGeo, matWoodTrim);
    sill.position.set(0, -(winH * 0.5 + frameBar * 0.45), 0.16);
    sill.castShadow = true;
    sill.receiveShadow = true;
    winGroup.add(sill);
  });

  // 1H. Carved Warm-Wood "SHELTER" Plaque Mounted Centered Above the Door
  const signW = 5.2;
  const signH = 1.36;
  const signBackShape = createRoundedRectShape(signW, signH, 0.24);
  const signBackGeo = trackGeo(
    new THREE.ExtrudeGeometry(signBackShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    }),
  );
  const signBack = new THREE.Mesh(signBackGeo, matSignEdge);
  signBack.position.set(0, eaveY + 1.04, halfD + 0.34);
  signBack.castShadow = true;
  cabinGroup.add(signBack);

  const signFaceShape = createRoundedRectShape(signW - 0.12, signH - 0.12, 0.2);
  const signFaceGeo = trackGeo(new THREE.ShapeGeometry(signFaceShape, 12));
  normalizePlanarXYUvs(
    signFaceGeo,
    -(signW - 0.12) * 0.5,
    (signW - 0.12) * 0.5,
    -(signH - 0.12) * 0.5,
    (signH - 0.12) * 0.5,
  );
  const signFace = new THREE.Mesh(signFaceGeo, matSignFront);
  signFace.position.set(0, eaveY + 1.04, halfD + 0.66);
  cabinGroup.add(signFace);

  // 1I. 3-Step Wooden Entrance Staircase + Top Porch Landing (flush to foundation, clear of stopping lane)
  const stairsGroup = new THREE.Group();
  stairsGroup.position.set(0, 0, halfD + 0.26);
  cabinGroup.add(stairsGroup);

  // Step 3 (top landing deck aligned with door threshold y = foundationH)
  const landingTreadGeo = trackGeo(new THREE.BoxGeometry(5.12, 0.2, 1.08));
  const landingTread = new THREE.Mesh(landingTreadGeo, matWoodStairs);
  landingTread.position.set(0, foundationH - 0.08, 0.52);
  landingTread.castShadow = true;
  landingTread.receiveShadow = true;
  stairsGroup.add(landingTread);

  const landingBaseGeo = trackGeo(new THREE.BoxGeometry(4.84, foundationH + 0.3, 0.96));
  const landingBase = new THREE.Mesh(landingBaseGeo, matWoodStairRiser);
  landingBase.position.set(0, (foundationH - 0.46) * 0.5, 0.46);
  landingBase.receiveShadow = true;
  stairsGroup.add(landingBase);

  // Step 2 (middle step)
  const step2TreadGeo = trackGeo(new THREE.BoxGeometry(5.2, 0.18, 0.56));
  const step2Tread = new THREE.Mesh(step2TreadGeo, matWoodStairs);
  step2Tread.position.set(0, foundationH * 0.66 - 0.06, 1.24);
  step2Tread.castShadow = true;
  step2Tread.receiveShadow = true;
  stairsGroup.add(step2Tread);

  const step2RiserGeo = trackGeo(new THREE.BoxGeometry(4.92, foundationH * 0.66 + 0.3, 0.48));
  const step2Riser = new THREE.Mesh(step2RiserGeo, matWoodStairRiser);
  step2Riser.position.set(0, (foundationH * 0.66 - 0.44) * 0.5, 1.18);
  step2Riser.receiveShadow = true;
  stairsGroup.add(step2Riser);

  // Step 1 (bottom step — front edge at halfD + 0.26 + 1.99 = halfD + 2.25m, deeply skirted into snow)
  const step1TreadGeo = trackGeo(new THREE.BoxGeometry(SHELTER_ARCHITECTURE.stairsHalfWidth * 2, 0.18, 0.58));
  const step1Tread = new THREE.Mesh(step1TreadGeo, matWoodStairs);
  step1Tread.position.set(0, foundationH * 0.33 - 0.04, 1.7);
  step1Tread.castShadow = true;
  step1Tread.receiveShadow = true;
  stairsGroup.add(step1Tread);

  const step1RiserGeo = trackGeo(new THREE.BoxGeometry(5.06, foundationH * 0.33 + 0.52, 0.5));
  const step1Riser = new THREE.Mesh(step1RiserGeo, matWoodStairRiser);
  step1Riser.position.set(0, (foundationH * 0.33 - 0.64) * 0.5, 1.64);
  step1Riser.receiveShadow = true;
  stairsGroup.add(step1Riser);

  // 1J. Dark Stone-Brick Chimney on Right Roof Slope + Rounded Snow Cap + Rising Smoke Puffs
  const chimneyGroup = new THREE.Group();
  chimneyGroup.position.set(5.45, eaveY + 1.5, 0.65);
  cabinGroup.add(chimneyGroup);

  const chimneyShaftGeo = trackGeo(new THREE.BoxGeometry(1.86, 4.95, 1.86));
  const chimneyShaft = new THREE.Mesh(chimneyShaftGeo, matChimneyBrick);
  chimneyShaft.position.y = 2.45;
  chimneyShaft.castShadow = true;
  chimneyShaft.receiveShadow = true;
  chimneyGroup.add(chimneyShaft);

  // Projecting stone-brick crown collar just below the snow cap (matches reference chimney silhouette)
  const chimneyCrownGeo = trackGeo(new THREE.BoxGeometry(2.16, 0.46, 2.16));
  const chimneyCrown = new THREE.Mesh(chimneyCrownGeo, matChimneyCrown);
  chimneyCrown.position.y = 4.82;
  chimneyCrown.castShadow = true;
  chimneyGroup.add(chimneyCrown);

  // Thick pillowy rounded snow cushion cap on top of the chimney
  const capShape = createRoundedRectShape(2.14, 2.14, 0.48);
  const capGeo = trackGeo(
    new THREE.ExtrudeGeometry(capShape, {
      depth: 0.48,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.16,
      bevelSegments: 3,
    }),
  );
  capGeo.rotateX(-Math.PI / 2);
  const chimneyCap = new THREE.Mesh(capGeo, matSnowThick);
  chimneyCap.position.y = 5.14;
  chimneyCap.castShadow = true;
  chimneyGroup.add(chimneyCap);

  // 5 lightweight animated rising smoke puffs
  const smokeGeo = trackGeo(new THREE.SphereGeometry(0.58, 10, 8));
  const smokePuffs: Array<{
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    phase: number;
  }> = [];
  for (let i = 0; i < 5; i++) {
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf4f9ff,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    const puff = new THREE.Mesh(smokeGeo, mat);
    puff.position.set(0, 5.85 + i * 0.9, 0);
    chimneyGroup.add(puff);
    smokePuffs.push({ mesh: puff, mat, phase: i / 5 });
  }

  // 1K. Subtle Corner & Side Snow Drifts (keeps cobblestone foundation & flanking greeters clearly visible)
  const driftGeo = trackGeo(new THREE.SphereGeometry(1, 12, 8));
  const sideDrifts: Array<[number, number, number, number, number, number]> = [
    [-halfW - 0.55, -0.04, halfD - 0.9, 1.95, 0.82, 2.3],
    [halfW + 0.55, -0.04, halfD - 0.9, 1.95, 0.82, 2.3],
    [-halfW - 0.65, -0.02, -2.1, 2.2, 0.92, 3.0],
    [halfW + 0.65, -0.02, -2.1, 2.2, 0.92, 3.0],
  ];
  for (const [x, y, z, sx, sy, sz] of sideDrifts) {
    const drift = new THREE.Mesh(driftGeo, matSnowThick);
    drift.position.set(x, y, z);
    drift.scale.set(sx, sy, sz);
    drift.receiveShadow = true;
    cabinGroup.add(drift);
  }

  // 1L. Balanced Warm Cabin Welcome Light (cozy golden warmth from windows onto steps & snow)
  const warmLight = new THREE.PointLight(0xffb454, 10.2, 24, 1.8);
  warmLight.position.set(0, 3.8, halfD + 3.4);
  cabinGroup.add(warmLight);

  const floorGlowGeo = trackGeo(new THREE.PlaneGeometry(14.0, 8.6));
  floorGlowGeo.rotateX(-Math.PI / 2 - Math.atan(SLOPE_GRADIENT));
  const floorGlow = new THREE.Mesh(floorGlowGeo, matWarmFloor);
  floorGlow.position.set(0, 0.62, halfD + 4.8);
  floorGlow.renderOrder = 2;
  cabinGroup.add(floorGlow);

  // =========================================================================
  // 2. FLUSH TERRAIN-CONFORMING CHECKERED FINISH LINE + 2 ORANGE FLAG POSTS
  // =========================================================================
  const FINISH_SEGS_X = 28;
  const FINISH_SEGS_Z = 4;
  const finishStripGeo = trackGeo(
    new THREE.PlaneGeometry(1, 1, FINISH_SEGS_X, FINISH_SEGS_Z),
  );
  const finishStripMesh = new THREE.Mesh(finishStripGeo, matCheckered);
  finishStripMesh.receiveShadow = true;
  finishStripMesh.renderOrder = 3;
  scene.add(finishStripMesh);

  const flagPostsGroup = new THREE.Group();
  scene.add(flagPostsGroup);

  const postPoleGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.17, 3.85, 10));
  const postCapGeo = trackGeo(new THREE.SphereGeometry(0.21, 10, 8));
  const postBaseSnowGeo = trackGeo(new THREE.SphereGeometry(0.62, 10, 8));

  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(2.45, 0);
  flagShape.lineTo(2.05, -0.82);
  flagShape.lineTo(0, -0.82);
  flagShape.closePath();

  const flagGeo = trackGeo(
    new THREE.ExtrudeGeometry(flagShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 1,
    }),
  );
  flagGeo.translate(0, 0, -0.04);

  interface FlagPostRef {
    group: THREE.Group;
    flagPivot: THREE.Group;
    side: -1 | 1;
  }
  const flagPosts: FlagPostRef[] = [];

  ([-1, 1] as const).forEach((side) => {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(postPoleGeo, matPostNavy);
    pole.position.y = 1.6;
    pole.castShadow = true;
    group.add(pole);

    const cap = new THREE.Mesh(postCapGeo, matPostNavy);
    cap.position.y = 3.56;
    group.add(cap);

    const baseSnow = new THREE.Mesh(postBaseSnowGeo, matSnowThick);
    baseSnow.scale.set(1.1, 0.45, 1.1);
    baseSnow.position.y = 0.08;
    group.add(baseSnow);

    const flagPivot = new THREE.Group();
    flagPivot.position.set(0, 3.35, 0);
    const flagMesh = new THREE.Mesh(flagGeo, matFlagOrange);
    flagMesh.castShadow = true;
    flagPivot.add(flagMesh);
    group.add(flagPivot);

    flagPostsGroup.add(group);
    flagPosts.push({ group, flagPivot, side });
  });

  // =========================================================================
  // 3. POSITIONING & TERRAIN CONFORMANCE PER LEVEL LENGTH (UNCHANGED FINISH FLOW)
  // =========================================================================
  const setLevelLength = (levelLength: number) => {
    const shelterZ = levelLength + SHELTER_LAYOUT.cabinOffsetFromFinish;
    const frontFacadeZ = shelterZ - SHELTER_LAYOUT.cabinHalfDepth;
    const shelterCenterX = getTrackCenterX(shelterZ);
    const frontSnowY = getTrackElevation(frontFacadeZ);
    const shelterYaw = -Math.atan(getTrackSlopeTangentX(shelterZ));
    cabinGroup.position.set(shelterCenterX, frontSnowY - 0.14, -shelterZ);
    cabinGroup.rotation.set(0, shelterYaw, 0);

    const finishCenterZ = levelLength;
    const halfTrackW = Math.max(8.2, getTrackHalfWidth(finishCenterZ) - 1.1);
    const stripWidth = halfTrackW * 2;
    const stripDepth = SHELTER_LAYOUT.finishStripDepth;

    const posAttr = finishStripGeo.attributes.position as THREE.BufferAttribute;
    let vIdx = 0;
    for (let iz = 0; iz <= FINISH_SEGS_Z; iz++) {
      const tz = 0.5 - iz / FINISH_SEGS_Z;
      const distZ = finishCenterZ + tz * stripDepth;
      const trackCX = getTrackCenterX(distZ);

      for (let ix = 0; ix <= FINISH_SEGS_X; ix++) {
        const tx = ix / FINISH_SEGS_X - 0.5;
        const wx = trackCX + tx * stripWidth;
        const wy = getGroundHeightAt(wx, distZ) + 0.11;
        posAttr.setXYZ(vIdx, wx, wy, -distZ);
        vIdx++;
      }
    }
    posAttr.needsUpdate = true;
    finishStripGeo.computeVertexNormals();
    finishStripGeo.computeBoundingSphere();

    const postYaw = -Math.atan(getTrackSlopeTangentX(finishCenterZ));
    const finishCX = getTrackCenterX(finishCenterZ);
    for (const fp of flagPosts) {
      const px = finishCX + fp.side * (halfTrackW + 0.55);
      const py = getGroundHeightAt(px, finishCenterZ);
      fp.group.position.set(px, py - 0.12, -finishCenterZ);
      fp.group.rotation.set(0, postYaw, 0);
    }
  };

  setLevelLength(TRACK_LENGTH);

  // =========================================================================
  // 4. LIGHTWEIGHT AMBIENT ANIMATION (Chimney Smoke + Flag Breeze)
  // =========================================================================
  const update = (time: number) => {
    for (let i = 0; i < smokePuffs.length; i++) {
      const sp = smokePuffs[i];
      const life = (time * 0.24 + sp.phase) % 1;
      const riseY = 5.75 + life * 4.2;
      const driftX = Math.sin(life * Math.PI * 1.4 + i) * 0.65 + life * 0.55;
      const driftZ = Math.cos(life * Math.PI + i) * 0.3;
      const scale = 0.55 + life * 1.15;
      sp.mesh.position.set(driftX, riseY, driftZ);
      sp.mesh.scale.setScalar(scale);
      const alpha = life < 0.2 ? (life / 0.2) * 0.3 : (1 - (life - 0.2) / 0.8) * 0.3;
      sp.mat.opacity = Math.max(0, alpha);
    }

    for (let i = 0; i < flagPosts.length; i++) {
      const fp = flagPosts[i];
      fp.flagPivot.rotation.y = Math.sin(time * 3.1 + i * 1.2) * 0.14;
    }
  };

  const dispose = () => {
    scene.remove(cabinGroup);
    scene.remove(finishStripMesh);
    scene.remove(flagPostsGroup);
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return { setLevelLength, update, dispose };
}
