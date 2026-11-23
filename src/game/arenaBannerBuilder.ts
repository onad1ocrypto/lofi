import * as THREE from 'three';
import {
  ARENA_BANNER_CONFIG,
  computeArenaBannerPlacements,
  evaluateBannerClothVertex,
  type ArenaBannerPlacement,
  type ClothVertexOffsetOut,
} from './arenaBannerLogic';
import { getGroundHeightAt } from './trackData';
import type { TrackRamp } from './types';

export interface ArenaBannerSystem {
  syncForLevel: (
    levelNumber: number,
    levelLength: number,
    ramps: readonly TrackRamp[],
  ) => void;
  update: (time: number, windForce?: number) => void;
  getGateCount: () => number;
  dispose: () => void;
}

const CLOTH_SEGMENTS_X = 20;
const CLOTH_SEGMENTS_Y = 4;

/** Draws a crisp 6-point winter snowflake motif matching the reference banner trim. */
function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2.6, radius * 0.095);

  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius);
    ctx.stroke();

    // Two chevron branches along each arm
    for (const frac of [0.46, 0.74]) {
      const y = -radius * frac;
      const bLen = radius * (frac < 0.6 ? 0.28 : 0.21);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(-bLen * 0.75, y - bLen * 0.65);
      ctx.moveTo(0, y);
      ctx.lineTo(bLen * 0.75, y - bLen * 0.65);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws the bold cartoon Lofi the Yeti head emblem on the left side of the banner. */
function drawLofiHeadEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const outline = '#12213A';

  // 1. Spiky fluffy white Yeti mane silhouette
  ctx.beginPath();
  const tuftAngles = 24;
  for (let i = 0; i <= tuftAngles; i++) {
    const t = (i / tuftAngles) * Math.PI * 2;
    const isOuter = i % 2 === 0;
    const rx = (isOuter ? 1.04 : 0.87) * 92;
    const ry = (isOuter ? 1.05 : 0.88) * 86;
    // Slightly wider lower beard tufts
    const beardBoost = Math.sin(t) > 0.25 ? 1.08 : 1.0;
    const px = Math.cos(t) * rx * beardBoost;
    const py = Math.sin(t) * ry * beardBoost + 4;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#F2F6FB';
  ctx.fill();
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = outline;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Subtle cool underside shading on white beard
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(170, 194, 224, 0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 56, 86, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Two curved blue Yeti horns poking through top fur
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(32, -62);
    ctx.quadraticCurveTo(52, -92, 64, -84);
    ctx.quadraticCurveTo(60, -56, 44, -46);
    ctx.closePath();
    ctx.fillStyle = '#4E9AE6';
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Left & right rounded blue Yeti ears
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.ellipse(-74, -4, 20, 26, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#5BA8EE';
    ctx.fill();
    ctx.lineWidth = 4.8;
    ctx.strokeStyle = outline;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(-74, -2, 9, 13, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#2F6FB3';
    ctx.fill();
    ctx.restore();
  }

  // 4. Inner icy-blue face plate
  ctx.beginPath();
  ctx.moveTo(-48, -32);
  ctx.quadraticCurveTo(0, -54, 48, -32);
  ctx.quadraticCurveTo(58, 12, 46, 36);
  ctx.quadraticCurveTo(0, 54, -46, 36);
  ctx.quadraticCurveTo(-58, 12, -48, -32);
  ctx.closePath();
  ctx.fillStyle = '#73B9F4';
  ctx.fill();
  ctx.lineWidth = 4.6;
  ctx.strokeStyle = outline;
  ctx.stroke();

  // 5. Lower pale snow-grey muzzle chin area
  ctx.beginPath();
  ctx.ellipse(0, 24, 42, 23, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#DCE8F5';
  ctx.fill();

  // 6. Confident cartoon eyes with heavy upper lids (classic Lofi expression)
  for (const side of [-1, 1]) {
    const ex = side * 20;
    const ey = -12;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 16, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = outline;
    ctx.stroke();

    // Pupil
    ctx.beginPath();
    ctx.ellipse(ex + side * 1.5, ey + 1.5, 6.8, 7.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0D1524';
    ctx.fill();

    // Eye highlight glint
    ctx.beginPath();
    ctx.arc(ex - 2.5, ey - 1.5, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Heavy relaxed upper eyelid
    ctx.beginPath();
    ctx.arc(ex, ey - 2, 16.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fillStyle = '#5CA8EC';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = outline;
    ctx.stroke();
  }

  // 7. Wide Yeti nostrils
  ctx.beginPath();
  ctx.ellipse(0, 8, 16, 8.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5CA6EA';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = outline;
  ctx.stroke();

  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.ellipse(-6, 8, 3.2, 2.2, 0.2, 0, Math.PI * 2);
  ctx.ellipse(6, 8, 3.2, 2.2, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // 8. Signature wide Yeti blue lips / chill grin
  ctx.beginPath();
  ctx.moveTo(-36, 26);
  ctx.quadraticCurveTo(0, 17, 36, 26);
  ctx.quadraticCurveTo(40, 35, 28, 38);
  ctx.quadraticCurveTo(0, 42, -28, 38);
  ctx.quadraticCurveTo(-40, 35, -36, 26);
  ctx.closePath();
  ctx.fillStyle = '#5EA9ED';
  ctx.fill();
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = outline;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-30, 30);
  ctx.quadraticCurveTo(0, 34, 30, 30);
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = outline;
  ctx.stroke();

  ctx.restore();
}

/** Draws the crisp Sui water-drop swirl emblem on the right side of the banner. */
function drawSuiWaterDropEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Outer white teardrop backing
  ctx.beginPath();
  ctx.moveTo(0, -96);
  ctx.bezierCurveTo(38, -44, 72, -4, 72, 34);
  ctx.bezierCurveTo(72, 74, 40, 98, 0, 98);
  ctx.bezierCurveTo(-40, 98, -72, 74, -72, 34);
  ctx.bezierCurveTo(-72, -4, -38, -44, 0, -96);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Inner vibrant cyan water-drop body
  ctx.beginPath();
  ctx.moveTo(0, -78);
  ctx.bezierCurveTo(30, -34, 58, 0, 58, 33);
  ctx.bezierCurveTo(58, 64, 32, 84, 0, 84);
  ctx.bezierCurveTo(-32, 84, -58, 64, -58, 33);
  ctx.bezierCurveTo(-58, 0, -30, -34, 0, -78);
  ctx.closePath();
  const dropGrad = ctx.createLinearGradient(0, -78, 0, 84);
  dropGrad.addColorStop(0, '#38D4FF');
  dropGrad.addColorStop(0.55, '#19B5EC');
  dropGrad.addColorStop(1, '#0F9CD8');
  ctx.fillStyle = dropGrad;
  ctx.fill();

  // Signature white wave swirl cutout inside the water-drop
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-42, 18);
  ctx.bezierCurveTo(-20, -14, 24, -10, 34, 20);
  ctx.bezierCurveTo(42, 46, 18, 66, -6, 62);
  ctx.bezierCurveTo(-26, 58, -32, 36, -16, 24);
  ctx.bezierCurveTo(-4, 15, 12, 22, 10, 34);
  ctx.stroke();

  ctx.restore();
}

/** Generates the 2560x400 (6.4:1) sRGB winter-sport fabric texture matching the 3D cloth aspect ratio 1:1. */
function createBannerFabricTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 2560;
  const h = 400;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // 1. Deep winter-sport navy fabric base with subtle vertical lighting gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#102447');
    bgGrad.addColorStop(0.5, '#173460');
    bgGrad.addColorStop(1, '#0D1E3B');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle soft vertical cloth-drape shading bands & fine woven canvas texture
    for (let i = 0; i < 16; i++) {
      const fx = (i / 15) * w;
      const bandGrad = ctx.createLinearGradient(fx - 80, 0, fx + 80, 0);
      bandGrad.addColorStop(0, 'rgba(255,255,255,0)');
      bandGrad.addColorStop(
        0.5,
        i % 2 === 0 ? 'rgba(255,255,255,0.032)' : 'rgba(4,10,24,0.068)',
      );
      bandGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bandGrad;
      ctx.fillRect(fx - 80, 0, 160, h);
    }

    // Subtle horizontal cloth weave lines
    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    for (let y = 0; y < h; y += 5) {
      ctx.fillRect(0, y, w, 1);
    }

    // 3. Vibrant winter-sport orange trim border (top, bottom, left, right)
    const borderH = 32;
    const borderW = 34;
    const orangeGrad = ctx.createLinearGradient(0, 0, 0, h);
    orangeGrad.addColorStop(0, '#F58529');
    orangeGrad.addColorStop(0.5, '#E9721B');
    orangeGrad.addColorStop(1, '#DA6213');
    ctx.fillStyle = orangeGrad;
    ctx.fillRect(0, 0, w, borderH);
    ctx.fillRect(0, h - borderH, w, borderH);
    ctx.fillRect(0, 0, borderW, h);
    ctx.fillRect(w - borderW, 0, borderW, h);

    // Crisp inner trim stitch accent line
    ctx.strokeStyle = 'rgba(255, 224, 185, 0.44)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(
      borderW + 3,
      borderH + 3,
      w - (borderW + 3) * 2,
      h - (borderH + 3) * 2,
    );

    // 4. White snowflake silhouettes along top & bottom orange borders (matching reference)
    const flakeXs = [84, 682, 1280, 1878, w - 84];
    for (let i = 0; i < flakeXs.length; i++) {
      const isCorner = i === 0 || i === flakeXs.length - 1;
      const r = isCorner ? 42 : 36;
      drawSnowflake(ctx, flakeXs[i], isCorner ? 46 : 26, r);
      drawSnowflake(ctx, flakeXs[i], isCorner ? h - 46 : h - 26, r);
    }

    // 5. Left Logo: Lofi the Yeti head emblem (1:1 aspect ratio, zero distortion)
    drawLofiHeadEmblem(ctx, 376, h * 0.51, 1.38);

    // 6. Center Headline: Bold italic "LOFI THE YETI" with navy outline & warm orange drop shadow
    ctx.save();
    ctx.translate(w * 0.506, h * 0.53);
    ctx.transform(1, 0, -0.14, 1, 0, 0); // Athletic winter-sport slant
    ctx.font = '900 166px "Fredoka", "Arial Black", "Impact", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = 'LOFI THE YETI';

    // Warm orange shadow offset
    ctx.fillStyle = '#E8741E';
    ctx.fillText(title, 9, 10);

    // Thick dark navy outline for crisp outdoor sunlight contrast
    ctx.lineWidth = 17;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0B1A34';
    ctx.strokeText(title, 0, 0);

    // Clean creamy-white face fill
    const textGrad = ctx.createLinearGradient(0, -76, 0, 76);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(0.75, '#F2F7FF');
    textGrad.addColorStop(1, '#DCE8F9');
    ctx.fillStyle = textGrad;
    ctx.fillText(title, 0, 0);
    ctx.restore();

    // 7. Right Logo: Crisp Sui water-drop swirl emblem (1:1 aspect ratio)
    drawSuiWaterDropEmblem(ctx, w - 344, h * 0.5, 1.24);

    // 8. Corner brass grommet rings for realistic rope tie-offs
    const grommets: ReadonlyArray<[number, number]> = [
      [30, 30],
      [30, h - 30],
      [w - 30, 30],
      [w - 30, h - 30],
    ];
    for (const [gx, gy] of grommets) {
      ctx.beginPath();
      ctx.arc(gx, gy, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#536278';
      ctx.fill();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#C9D5E4';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(gx, gy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0D1729';
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Generates a warm carved-wood grain texture for the upper ski-race banner poles. */
function createWoodPoleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#9D5D2F';
    ctx.fillRect(0, 0, w, h);

    // Vertical wood grain streaks
    for (let x = 0; x < w; x += 4) {
      const shade = Math.sin(x * 0.28) * 14 + Math.cos(x * 0.71) * 8;
      const r = Math.min(255, Math.max(0, Math.round(156 + shade)));
      const g = Math.min(255, Math.max(0, Math.round(92 + shade * 0.62)));
      const b = Math.min(255, Math.max(0, Math.round(46 + shade * 0.35)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 4, h);
    }
    ctx.fillStyle = 'rgba(54, 28, 12, 0.22)';
    for (let x = 6; x < w; x += 17) {
      ctx.fillRect(x, 0, 2, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

interface BuiltBannerGate {
  root: THREE.Group;
  leftPole: THREE.Group;
  rightPole: THREE.Group;
  clothMesh: THREE.Mesh;
  clothGeo: THREE.PlaneGeometry;
  ropes: THREE.Mesh[];
  bannerSpan: number;
  phaseOffset: number;
}

/**
 * Builds one composite wooden + galvanized-steel side pole matching the reference:
 * steel base post, warm timber upper shaft, 2 steel clamp collars with eyelets,
 * and a soft sculpted snow cap perched on top.
 */
function createBannerSidePole(
  side: -1 | 1,
  shared: {
    steelBaseGeo: THREE.CylinderGeometry;
    woodUpperGeo: THREE.CylinderGeometry;
    clampBandGeo: THREE.CylinderGeometry;
    clampFlangeGeo: THREE.CylinderGeometry;
    snowCapDomeGeo: THREE.SphereGeometry;
    snowCapRimGeo: THREE.TorusGeometry;
    snowPatchGeo: THREE.SphereGeometry;
    matSteel: THREE.MeshStandardMaterial;
    matClamp: THREE.MeshStandardMaterial;
    matWood: THREE.MeshStandardMaterial;
    matSnow: THREE.MeshStandardMaterial;
  },
): THREE.Group {
  const pole = new THREE.Group();

  const bottomY = ARENA_BANNER_CONFIG.bottomClearance;
  const topY = bottomY + ARENA_BANNER_CONFIG.bannerHeight;
  const anchorDepth = ARENA_BANNER_CONFIG.poleAnchorDepth;
  const steelHeight = bottomY + anchorDepth - 0.15;

  // 1. Galvanized steel lower base post (extends underground into snowbank)
  const steelBase = new THREE.Mesh(shared.steelBaseGeo, shared.matSteel);
  steelBase.scale.set(1, steelHeight, 1);
  steelBase.position.y = -anchorDepth + steelHeight * 0.5;
  steelBase.castShadow = true;
  steelBase.receiveShadow = true;
  pole.add(steelBase);

  // 2. Warm wooden timber upper pole spanning the banner height + top overhang
  const woodHeight = ARENA_BANNER_CONFIG.bannerHeight + ARENA_BANNER_CONFIG.poleTopOverhang + 0.35;
  const woodUpper = new THREE.Mesh(shared.woodUpperGeo, shared.matWood);
  woodUpper.scale.set(1, woodHeight, 1);
  woodUpper.position.y = bottomY - 0.22 + woodHeight * 0.5;
  woodUpper.castShadow = true;
  woodUpper.receiveShadow = true;
  pole.add(woodUpper);

  // 3. Top & bottom heavy-duty steel clamp collars
  for (const clampY of [bottomY + 0.04, topY - 0.04]) {
    const band = new THREE.Mesh(shared.clampBandGeo, shared.matClamp);
    band.position.y = clampY;
    pole.add(band);

    for (const ringDy of [-0.15, 0.15]) {
      const flange = new THREE.Mesh(shared.clampFlangeGeo, shared.matSteel);
      flange.position.y = clampY + ringDy;
      pole.add(flange);
    }
  }

  // 4. Small clinging snow accent on the outer timber face & lower clamp ledge
  const sideSnowPatch = new THREE.Mesh(shared.snowPatchGeo, shared.matSnow);
  sideSnowPatch.position.set(side * 0.21, bottomY + ARENA_BANNER_CONFIG.bannerHeight * 0.45, 0.08);
  sideSnowPatch.scale.set(0.42, 1.35, 0.6);
  pole.add(sideSnowPatch);

  // 5. Sculpted fluffy snow cap resting on top of the timber post
  const poleTopY = topY + ARENA_BANNER_CONFIG.poleTopOverhang + 0.06;
  const snowDome = new THREE.Mesh(shared.snowCapDomeGeo, shared.matSnow);
  snowDome.position.y = poleTopY;
  snowDome.scale.set(1.16, 0.72, 1.14);
  pole.add(snowDome);

  const snowRim = new THREE.Mesh(shared.snowCapRimGeo, shared.matSnow);
  snowRim.rotation.x = Math.PI * 0.5;
  snowRim.position.y = poleTopY - 0.09;
  snowRim.scale.set(1.06, 1.06, 0.82);
  pole.add(snowRim);

  return pole;
}

/**
 * Creates the pooled overhead "LOFI THE YETI" ski-race fabric banner system
 * (Start Gate + Mid-Track Gate) with gentle lightweight wind-flutter animation.
 */
export function createArenaBannerSystem(
  scene: THREE.Scene,
  maxAnisotropy: number,
): ArenaBannerSystem {
  const disposables: Array<{ dispose: () => void }> = [];

  const bannerTex = createBannerFabricTexture(maxAnisotropy);
  const woodTex = createWoodPoleTexture(maxAnisotropy);
  disposables.push(bannerTex, woodTex);

  const matCloth = new THREE.MeshStandardMaterial({
    map: bannerTex,
    roughness: 0.84,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const matSteel = new THREE.MeshStandardMaterial({
    color: 0x9aa8ba,
    roughness: 0.34,
    metalness: 0.64,
  });
  const matClamp = new THREE.MeshStandardMaterial({
    color: 0x5c6f86,
    roughness: 0.28,
    metalness: 0.72,
  });
  const matWood = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.78,
    metalness: 0.04,
  });
  const matRope = new THREE.MeshStandardMaterial({
    color: 0x4b4642,
    roughness: 0.92,
    metalness: 0.04,
  });
  const matSnow = new THREE.MeshStandardMaterial({
    color: 0xf4f9ff,
    roughness: 0.88,
    metalness: 0.0,
  });
  disposables.push(matCloth, matSteel, matClamp, matWood, matRope, matSnow);

  // Shared unit-height/reusable pole & rope geometries
  const steelBaseGeo = new THREE.CylinderGeometry(0.28, 0.31, 1, 10);
  const woodUpperGeo = new THREE.CylinderGeometry(0.27, 0.28, 1, 10);
  const clampBandGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.38, 12);
  const clampFlangeGeo = new THREE.CylinderGeometry(0.40, 0.40, 0.09, 12);
  const snowCapDomeGeo = new THREE.SphereGeometry(0.37, 12, 8);
  const snowCapRimGeo = new THREE.TorusGeometry(0.29, 0.13, 8, 14);
  const snowPatchGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const ropeGeo = new THREE.CylinderGeometry(0.055, 0.055, 1, 6);
  ropeGeo.rotateZ(Math.PI * 0.5);
  disposables.push(
    steelBaseGeo,
    woodUpperGeo,
    clampBandGeo,
    clampFlangeGeo,
    snowCapDomeGeo,
    snowCapRimGeo,
    snowPatchGeo,
    ropeGeo,
  );

  const sharedParts = {
    steelBaseGeo,
    woodUpperGeo,
    clampBandGeo,
    clampFlangeGeo,
    snowCapDomeGeo,
    snowCapRimGeo,
    snowPatchGeo,
    matSteel,
    matClamp,
    matWood,
    matSnow,
  };

  const gatesGroup = new THREE.Group();
  gatesGroup.name = 'arena-lofi-banners';
  scene.add(gatesGroup);

  const gates: BuiltBannerGate[] = [];
  const tempVertex: ClothVertexOffsetOut = { x: 0, y: 0, z: 0 };

  const createGate = (phaseOffset: number): BuiltBannerGate => {
    const root = new THREE.Group();
    const leftPole = createBannerSidePole(-1, sharedParts);
    const rightPole = createBannerSidePole(1, sharedParts);
    root.add(leftPole, rightPole);

    const clothGeo = new THREE.PlaneGeometry(
      1,
      ARENA_BANNER_CONFIG.bannerHeight,
      CLOTH_SEGMENTS_X,
      CLOTH_SEGMENTS_Y,
    );
    disposables.push(clothGeo);

    const clothMesh = new THREE.Mesh(clothGeo, matCloth);
    clothMesh.position.y =
      ARENA_BANNER_CONFIG.bottomClearance + ARENA_BANNER_CONFIG.bannerHeight * 0.5;
    clothMesh.castShadow = false;
    clothMesh.receiveShadow = true;
    root.add(clothMesh);

    // 4 short tension ropes connecting each pole clamp collar to the banner corner grommets
    const ropes: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const rope = new THREE.Mesh(ropeGeo, matRope);
      root.add(rope);
      ropes.push(rope);
    }

    gatesGroup.add(root);
    return {
      root,
      leftPole,
      rightPole,
      clothMesh,
      clothGeo,
      ropes,
      bannerSpan: 24,
      phaseOffset,
    };
  };

  // Pre-allocate 2 pooled gates (Start Gate + Mid-Track Gate) for zero GC across level switches
  gates.push(createGate(0), createGate(2.1));

  const updateGateCloth = (gate: BuiltBannerGate, time: number, windForce: number) => {
    const posAttr = gate.clothGeo.attributes.position as THREE.BufferAttribute;
    const cols = CLOTH_SEGMENTS_X + 1;
    const rows = CLOTH_SEGMENTS_Y + 1;
    const t = time + gate.phaseOffset;

    for (let r = 0; r < rows; r++) {
      // PlaneGeometry rows go top (v=1) to bottom (v=0)
      const v = 1 - r / CLOTH_SEGMENTS_Y;
      for (let c = 0; c < cols; c++) {
        const u = c / CLOTH_SEGMENTS_X;
        const idx = r * cols + c;
        evaluateBannerClothVertex(
          u,
          v,
          gate.bannerSpan,
          ARENA_BANNER_CONFIG.bannerHeight,
          t,
          windForce,
          tempVertex,
        );
        posAttr.setXYZ(idx, tempVertex.x, tempVertex.y, tempVertex.z);
      }
    }
    posAttr.needsUpdate = true;
  };

  const applyPlacementToGate = (
    gate: BuiltBannerGate,
    placement: ArenaBannerPlacement,
  ) => {
    gate.root.visible = true;
    gate.root.position.set(placement.centerX, placement.groundY, -placement.z);
    gate.root.rotation.set(0, placement.yaw, 0);

    // Ground each pole snugly on its local snowbank height while keeping banner level overhead
    const cosY = Math.cos(placement.yaw);
    const sinY = Math.sin(placement.yaw);
    const leftWorldX = placement.centerX - placement.poleHalfSpan * cosY;
    const leftWorldZ = placement.z - placement.poleHalfSpan * sinY;
    const rightWorldX = placement.centerX + placement.poleHalfSpan * cosY;
    const rightWorldZ = placement.z + placement.poleHalfSpan * sinY;

    const leftBankDeltaY = Math.min(
      0,
      getGroundHeightAt(leftWorldX, leftWorldZ) - placement.groundY,
    );
    const rightBankDeltaY = Math.min(
      0,
      getGroundHeightAt(rightWorldX, rightWorldZ) - placement.groundY,
    );

    gate.leftPole.position.set(-placement.poleHalfSpan, leftBankDeltaY * 0.35, 0);
    gate.rightPole.position.set(placement.poleHalfSpan, rightBankDeltaY * 0.35, 0);

    gate.bannerSpan = placement.bannerSpan;
    const halfBanner = placement.bannerSpan * 0.5;
    const ropeLen = Math.max(0.25, placement.poleHalfSpan - halfBanner + 0.08);
    const ropeMidX = halfBanner + (placement.poleHalfSpan - halfBanner) * 0.5;
    const topClampY = ARENA_BANNER_CONFIG.bottomClearance + ARENA_BANNER_CONFIG.bannerHeight - 0.06;
    const botClampY = ARENA_BANNER_CONFIG.bottomClearance + 0.06;

    // Top-left, bottom-left, top-right, bottom-right tension ropes
    const ropeSpecs: ReadonlyArray<[number, number, number]> = [
      [-ropeMidX, topClampY, 0.14],
      [-ropeMidX, botClampY, -0.14],
      [ropeMidX, topClampY, -0.14],
      [ropeMidX, botClampY, 0.14],
    ];
    for (let i = 0; i < 4; i++) {
      const [rx, ry, tiltZ] = ropeSpecs[i];
      gate.ropes[i].position.set(rx, ry, 0);
      gate.ropes[i].scale.set(ropeLen, 1, 1);
      gate.ropes[i].rotation.set(0, 0, tiltZ);
    }

    updateGateCloth(gate, 0, 0);
    gate.clothGeo.computeBoundingSphere();
  };

  let activeGateCount = 0;
  let lastWindUpdateTime = -1;

  const syncForLevel = (
    levelNumber: number,
    levelLength: number,
    ramps: readonly TrackRamp[],
  ) => {
    const placements = computeArenaBannerPlacements(levelNumber, levelLength, ramps);
    activeGateCount = Math.min(gates.length, placements.length);
    for (let i = 0; i < gates.length; i++) {
      if (i < placements.length) {
        applyPlacementToGate(gates[i], placements[i]);
      } else {
        gates[i].root.visible = false;
      }
    }
    lastWindUpdateTime = -1;
  };

  const update = (time: number, windForce = 0) => {
    // Lightweight ~30Hz throttle for subtle cloth wave motion (imperceptible difference, halves CPU work on mobile)
    if (lastWindUpdateTime >= 0 && Math.abs(time - lastWindUpdateTime) < 0.032) {
      return;
    }
    lastWindUpdateTime = time;

    for (let i = 0; i < activeGateCount; i++) {
      updateGateCloth(gates[i], time, windForce);
    }
  };

  const dispose = () => {
    scene.remove(gatesGroup);
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    syncForLevel,
    update,
    getGateCount: () => activeGateCount,
    dispose,
  };
}
