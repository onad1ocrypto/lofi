import * as THREE from 'three';
import { SHELTER_LAYOUT, computeGreeterHopY } from './shelterArrival';
import {
  SLOPE_GRADIENT,
  getGroundHeightAt,
  getTrackCenterX,
  getTrackSlopeTangentX,
} from './trackData';
import type { FollowerYeti } from './types';

export interface SmallYetiVisibilityCounts {
  visibleFollowers: number;
  visibleGreeters: number;
  visibleRecruit: number;
}

export interface SmallYetiPool {
  /**
   * Sync active follower Yetis riding behind Lofi (strictly levelNumber - 1),
   * the separate +1 shelter recruit Yeti (Victory only, after arrival completes),
   * and the separate welcoming NPCs stationed at the shelter cabin (hidden on Game Over).
   */
  sync: (params: {
    followers: readonly FollowerYeti[];
    shelterLevelLength: number;
    time: number;
    speedRatio: number;
    celebrating: boolean;
    celebrationTime: number;
    victoryPoseProgress?: number;
    recruitJoinProgress?: number;
    gameoverBurialProgress?: number;
    isGameOver?: boolean;
  }) => SmallYetiVisibilityCounts;
  dispose: () => void;
}

interface SmallYetiInstance {
  root: THREE.Group;
  shadow: THREE.Mesh;
  boardMesh: THREE.Mesh;
  boardAssembly: THREE.Group;
  riderPivot: THREE.Group;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
}

/**
 * Procedural mini-snowboard deck texture matching lofi-small-yeti.png:
 * Deep plum-purple board with two crisp diagonal golden-yellow stripes.
 */
function createMiniBoardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#532864';
  ctx.fillRect(0, 0, 128, 256);

  ctx.strokeStyle = '#6c387f';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 250);

  // Two signature diagonal yellow stripes near the upper nose
  ctx.fillStyle = '#f2b430';
  const drawStripe = (y: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 24);
    ctx.lineTo(128, y + 24 + h);
    ctx.lineTo(0, y + h);
    ctx.closePath();
    ctx.fill();
  };
  drawStripe(38, 16);
  drawStripe(64, 12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Soft radial contact shadow under each Small Yeti mini-snowboard. */
function createSmallShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(30, 44, 78, 0.52)');
  grad.addColorStop(0.55, 'rgba(36, 52, 92, 0.22)');
  grad.addColorStop(1, 'rgba(36, 52, 92, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Isolated procedural Small Yeti character pool matching lofi-small-yeti.png:
 * - Compact ~0.74x scale sidekick silhouette with white shaggy fur, blue face/ears/short horns & deadpan lips.
 * - Purple puffer vest (#6E2C6B), yellow puffer sleeves & scarf (#F2B430), navy mittens & cargo snow pants,
 *   yellow snowboard boots with navy soles/straps, purple-framed forehead goggles.
 * - Rides ONE purple mini-snowboard with two diagonal yellow stripes & dual transverse bindings.
 * - All geometries and materials are shared across the pool for fast zero-GC rendering.
 */
export function createSmallYetiPool(
  scene: THREE.Scene,
  maxAnisotropy = 4,
  poolCapacity = 16,
): SmallYetiPool {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const boardTex = createMiniBoardTexture(maxAnisotropy);
  const shadowTex = createSmallShadowTexture();
  disposables.push(boardTex, shadowTex);

  // --- Shared PBR Material Palette (calibrated from lofi-small-yeti.png) ---
  const matWhiteFur = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf4f7fc, roughness: 0.88, metalness: 0.0 }),
  );
  const matBlueSkin = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x559de2, roughness: 0.62, metalness: 0.02 }),
  );
  const matBlueHorn = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x67b8f0, roughness: 0.38, metalness: 0.06 }),
  );
  const matPurpleVest = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x722e6f, roughness: 0.56, metalness: 0.04 }),
  );
  const matYellowSleeve = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf0b12e, roughness: 0.54, metalness: 0.04 }),
  );
  const matNavy = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e2849, roughness: 0.66, metalness: 0.06 }),
  );
  const matGogglePurple = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7b3378, roughness: 0.42, metalness: 0.08 }),
  );
  const matGoggleLens = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x223054, roughness: 0.16, metalness: 0.32 }),
  );
  const matBoardDeck = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: boardTex,
      roughness: 0.3,
      metalness: 0.12,
    }),
  );
  const matPaleFace = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd9e3f0, roughness: 0.72, metalness: 0.0 }),
  );
  const matFaceCrease = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1a3052, roughness: 0.45, metalness: 0.02 }),
  );
  const matEyeWhite = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.35, metalness: 0.0 }),
  );
  const matEyePupil = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x151b2c, roughness: 0.2, metalness: 0.1 }),
  );
  const matShadow = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.58,
    }),
  );

  // --- Shared Lightweight Geometries (reused by every Small Yeti in the pool) ---
  const shadowGeo = trackGeo(new THREE.CircleGeometry(0.95, 16));

  // Single rounded mini-snowboard geometry
  const bw = 0.27;
  const bl = 0.88;
  const br = 0.23;
  const boardShape = new THREE.Shape();
  boardShape.moveTo(-bw + br, -bl);
  boardShape.lineTo(bw - br, -bl);
  boardShape.quadraticCurveTo(bw, -bl, bw, -bl + br);
  boardShape.quadraticCurveTo(bw * 0.88, 0, bw, bl - br);
  boardShape.quadraticCurveTo(bw, bl, bw - br, bl);
  boardShape.lineTo(-bw + br, bl);
  boardShape.quadraticCurveTo(-bw, bl, -bw, bl - br);
  boardShape.quadraticCurveTo(-bw * 0.88, 0, -bw, -bl + br);
  boardShape.quadraticCurveTo(-bw, -bl, -bw + br, -bl);

  const boardGeo = trackGeo(
    new THREE.ExtrudeGeometry(boardShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 10,
    }),
  );
  boardGeo.rotateX(Math.PI / 2);
  const bPos = boardGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const pz = bPos.getZ(i);
    const absZ = Math.abs(pz);
    if (absZ > 0.52) {
      const t = (absZ - 0.52) / 0.36;
      bPos.setY(i, bPos.getY(i) + t * t * 0.11);
    }
  }
  boardGeo.computeVertexNormals();
  const uvArr = boardGeo.attributes.uv;
  for (let i = 0; i < bPos.count; i++) {
    uvArr.setXY(i, (bPos.getX(i) + bw) / (bw * 2), (bPos.getZ(i) + bl) / (bl * 2));
  }
  uvArr.needsUpdate = true;

  const bindingPlateGeo = trackGeo(new THREE.CylinderGeometry(0.125, 0.135, 0.032, 10));
  const bootUpperGeo = trackGeo(new THREE.CapsuleGeometry(0.1, 0.14, 6, 10));
  const bootAnkleGeo = trackGeo(new THREE.CylinderGeometry(0.095, 0.11, 0.2, 10));
  const strapGeo = trackGeo(new THREE.TorusGeometry(0.105, 0.02, 6, 12, Math.PI));

  const legGeo = trackGeo(new THREE.CapsuleGeometry(0.115, 0.22, 6, 10));
  const pelvisGeo = trackGeo(new THREE.SphereGeometry(0.28, 12, 10));
  const vestBaffleGeo = trackGeo(new THREE.SphereGeometry(0.38, 14, 12));
  const zipperGeo = trackGeo(new THREE.CapsuleGeometry(0.018, 0.42, 4, 6));
  const scarfGeo = trackGeo(new THREE.TorusGeometry(0.26, 0.08, 8, 18));

  const sleeveGeo = trackGeo(new THREE.SphereGeometry(0.13, 10, 8));
  const cuffGeo = trackGeo(new THREE.TorusGeometry(0.095, 0.03, 6, 12));
  const mittenGeo = trackGeo(new THREE.SphereGeometry(0.105, 10, 8));

  const headGeo = trackGeo(new THREE.SphereGeometry(0.34, 16, 12));
  const tuftGeo = trackGeo(new THREE.ConeGeometry(0.11, 0.23, 8));
  const earGeo = trackGeo(new THREE.SphereGeometry(0.1, 10, 8));
  const hornGeo = trackGeo(new THREE.ConeGeometry(0.048, 0.18, 8));
  const faceMaskGeo = trackGeo(new THREE.SphereGeometry(0.225, 12, 10));
  const eyeMaskBandGeo = trackGeo(new THREE.CapsuleGeometry(0.082, 0.175, 6, 10));
  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.06, 10, 8));
  const pupilGeo = trackGeo(new THREE.SphereGeometry(0.031, 8, 6));
  const lidGeo = trackGeo(new THREE.SphereGeometry(0.066, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.54));
  const lidRimGeo = trackGeo(new THREE.CapsuleGeometry(0.008, 0.088, 4, 6));
  const snoutGeo = trackGeo(new THREE.SphereGeometry(0.048, 8, 6));
  const nostrilGeo = trackGeo(new THREE.SphereGeometry(0.013, 6, 6));
  const lipGeo = trackGeo(new THREE.CapsuleGeometry(0.025, 0.145, 4, 8));
  const mouthSeamGeo = trackGeo(new THREE.CapsuleGeometry(0.007, 0.155, 4, 6));
  const goggleStrapGeo = trackGeo(new THREE.TorusGeometry(0.33, 0.034, 8, 20));
  const goggleFrameGeo = trackGeo(new THREE.CapsuleGeometry(0.085, 0.18, 6, 10));
  const goggleLensGeo = trackGeo(new THREE.CapsuleGeometry(0.065, 0.15, 6, 10));

  const buildSmallYetiInstance = (): SmallYetiInstance => {
    const root = new THREE.Group();
    root.visible = false;

    const scaleGroup = new THREE.Group();
    scaleGroup.scale.setScalar(0.76);
    root.add(scaleGroup);

    const shadow = new THREE.Mesh(shadowGeo, matShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.84, 1.35, 1);
    shadow.position.set(0, 0.025, 0.04);
    scaleGroup.add(shadow);

    const boardAssembly = new THREE.Group();
    scaleGroup.add(boardAssembly);

    // 1. Single Purple Mini-Snowboard with Yellow Diagonal Stripes
    const board = new THREE.Mesh(boardGeo, matBoardDeck);
    board.position.y = 0.065;
    board.castShadow = true;
    boardAssembly.add(board);

    // 2. Dual Transverse Bindings & Yellow Boots with Navy Straps
    [
      { z: -0.28, yaw: -Math.PI / 2 + 0.2 },
      { z: 0.28, yaw: -Math.PI / 2 - 0.14 },
    ].forEach((bp) => {
      const foot = new THREE.Group();
      foot.position.set(0, 0.08, bp.z);
      foot.rotation.y = -bp.yaw;
      boardAssembly.add(foot);

      const plate = new THREE.Mesh(bindingPlateGeo, matNavy);
      plate.position.y = 0.015;
      foot.add(plate);

      const sole = new THREE.Mesh(bootUpperGeo, matNavy);
      sole.rotation.x = Math.PI / 2;
      sole.scale.set(1.05, 1.05, 0.5);
      sole.position.set(0, 0.055, 0.03);
      foot.add(sole);

      const upper = new THREE.Mesh(bootUpperGeo, matYellowSleeve);
      upper.rotation.x = Math.PI / 2;
      upper.scale.set(0.98, 0.98, 0.78);
      upper.position.set(0, 0.115, 0.04);
      upper.castShadow = true;
      foot.add(upper);

      const ankle = new THREE.Mesh(bootAnkleGeo, matYellowSleeve);
      ankle.position.set(0, 0.2, -0.02);
      foot.add(ankle);

      const strap = new THREE.Mesh(strapGeo, matNavy);
      strap.position.set(0, 0.12, 0.09);
      strap.rotation.x = 0.2;
      foot.add(strap);

      const yellowTrim = new THREE.Mesh(strapGeo, matYellowSleeve);
      yellowTrim.position.set(0, 0.19, 0.02);
      yellowTrim.scale.setScalar(1.06);
      yellowTrim.rotation.x = -0.3;
      foot.add(yellowTrim);
    });

    // 3. Rider Body Hierarchy
    const riderPivot = new THREE.Group();
    riderPivot.position.set(0, 0.3, 0);
    boardAssembly.add(riderPivot);

    // Slightly bent navy snowboard pants legs
    const frontLeg = new THREE.Mesh(legGeo, matNavy);
    frontLeg.position.set(0.04, 0.18, -0.25);
    frontLeg.rotation.z = -0.14;
    frontLeg.rotation.x = 0.12;
    riderPivot.add(frontLeg);

    const backLeg = new THREE.Mesh(legGeo, matNavy);
    backLeg.position.set(0.04, 0.18, 0.25);
    backLeg.rotation.z = -0.14;
    backLeg.rotation.x = -0.12;
    riderPivot.add(backLeg);

    const pelvis = new THREE.Mesh(pelvisGeo, matNavy);
    pelvis.scale.set(0.95, 0.75, 1.15);
    pelvis.position.set(0, 0.34, 0);
    riderPivot.add(pelvis);

    // Torso (Purple Puffer Vest + Yellow Scarf + Yellow Puffer Sleeves)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.38, 0);
    torsoGroup.rotation.y = 1.92;
    riderPivot.add(torsoGroup);

    [
      { y: 0.14, sx: 1.08, sy: 0.42, sz: 0.9 },
      { y: 0.3, sx: 1.12, sy: 0.44, sz: 0.94 },
      { y: 0.45, sx: 1.04, sy: 0.4, sz: 0.88 },
    ].forEach((b) => {
      const baffle = new THREE.Mesh(vestBaffleGeo, matPurpleVest);
      baffle.position.y = b.y;
      baffle.scale.set(b.sx, b.sy, b.sz);
      baffle.castShadow = true;
      torsoGroup.add(baffle);
    });

    const zipper = new THREE.Mesh(zipperGeo, matNavy);
    zipper.position.set(0, 0.3, 0.32);
    torsoGroup.add(zipper);

    // Chunky yellow knit scarf around neck
    const scarf = new THREE.Mesh(scarfGeo, matYellowSleeve);
    scarf.rotation.x = Math.PI / 2;
    scarf.scale.set(1.06, 0.96, 1);
    scarf.position.y = 0.59;
    scarf.castShadow = true;
    torsoGroup.add(scarf);

    // Yellow Puffer Arms + Navy Mittens
    const buildArm = (side: -1 | 1) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.38, 0.46, 0.02);

      const s1 = new THREE.Mesh(sleeveGeo, matYellowSleeve);
      s1.position.set(side * 0.06, -0.04, 0);
      s1.castShadow = true;
      arm.add(s1);

      const s2 = new THREE.Mesh(sleeveGeo, matYellowSleeve);
      s2.scale.setScalar(0.92);
      s2.position.set(side * 0.16, -0.15, 0.03);
      arm.add(s2);

      const cuff = new THREE.Mesh(cuffGeo, matNavy);
      cuff.position.set(side * 0.24, -0.24, 0.05);
      cuff.rotation.y = Math.PI / 2;
      cuff.rotation.x = side * 0.65;
      arm.add(cuff);

      const mitten = new THREE.Mesh(mittenGeo, matNavy);
      mitten.scale.set(0.95, 1.15, 0.82);
      mitten.position.set(side * 0.3, -0.31, 0.07);
      arm.add(mitten);

      return arm;
    };

    const leftArm = buildArm(-1);
    leftArm.rotation.z = -0.34;
    torsoGroup.add(leftArm);

    const rightArm = buildArm(1);
    rightArm.rotation.z = 0.34;
    torsoGroup.add(rightArm);

    // 4. Head (Shaggy white fur, blue deadpan face, short blue horns, purple forehead goggles)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.65, 0.02);
    headGroup.rotation.y = 1.18;
    torsoGroup.add(headGroup);

    const cranium = new THREE.Mesh(headGeo, matWhiteFur);
    cranium.scale.set(1.04, 1.04, 0.98);
    cranium.position.y = 0.21;
    cranium.castShadow = true;
    headGroup.add(cranium);

    // Key shaggy white fur tufts around mane & crown (keeps triangle count compact)
    const tufts: Array<[number, number, number, number, number, number]> = [
      [0, 0.04, -0.3, -2.5, 0, 0],
      [-0.2, 0.05, -0.24, -2.4, 0.55, 0.25],
      [0.2, 0.05, -0.24, -2.4, -0.55, -0.25],
      [-0.3, 0.12, -0.08, -2.2, 1.2, 0.35],
      [0.3, 0.12, -0.08, -2.2, -1.2, -0.35],
      [0, 0.54, -0.02, -0.2, 0, 0.08],
      [-0.14, 0.5, -0.04, -0.35, 0.2, 0.35],
      [0.14, 0.5, -0.04, -0.35, -0.2, -0.35],
      [0, 0.02, 0.25, 2.5, 0, 0],
    ];
    tufts.forEach(([x, y, z, rx, ry, rz]) => {
      const t = new THREE.Mesh(tuftGeo, matWhiteFur);
      t.position.set(x, y, z);
      t.rotation.set(rx, ry, rz);
      headGroup.add(t);
    });

    // Blue Yeti Ears & Two Short Curved Horns
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(earGeo, matBlueSkin);
      ear.scale.set(0.65, 1.12, 0.8);
      ear.position.set(side * 0.34, 0.24, -0.01);
      ear.rotation.z = side * -0.18;
      headGroup.add(ear);

      const horn = new THREE.Mesh(hornGeo, matBlueHorn);
      horn.position.set(side * 0.19, 0.54, 0.01);
      horn.rotation.z = side * -0.28;
      headGroup.add(horn);
    });

    // Pale ice-grey muzzle/cheek base + sky-blue eye-mask + half-lidded eyes + nostrils + thick blue deadpan lips
    const face = new THREE.Mesh(faceMaskGeo, matPaleFace);
    face.scale.set(0.98, 0.92, 0.56);
    face.position.set(0, 0.215, 0.238);
    headGroup.add(face);

    const eyeBand = new THREE.Mesh(eyeMaskBandGeo, matBlueSkin);
    eyeBand.rotation.z = Math.PI / 2;
    eyeBand.scale.set(1.04, 0.92, 0.54);
    eyeBand.position.set(0, 0.275, 0.308);
    headGroup.add(eyeBand);

    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(eyeGeo, matEyeWhite);
      eye.scale.set(1.04, 0.96, 0.62);
      eye.position.set(side * 0.084, 0.272, 0.338);
      headGroup.add(eye);

      const pupil = new THREE.Mesh(pupilGeo, matEyePupil);
      pupil.position.set(side * 0.084, 0.268, 0.372);
      headGroup.add(pupil);

      const lid = new THREE.Mesh(lidGeo, matBlueSkin);
      lid.scale.set(1.1, 0.88, 0.78);
      lid.position.set(side * 0.084, 0.286, 0.342);
      lid.rotation.x = 0.24;
      headGroup.add(lid);

      const lidRim = new THREE.Mesh(lidRimGeo, matFaceCrease);
      lidRim.rotation.z = Math.PI / 2;
      lidRim.position.set(side * 0.084, 0.292, 0.375);
      headGroup.add(lidRim);
    });

    const snout = new THREE.Mesh(snoutGeo, matBlueSkin);
    snout.scale.set(1.2, 0.72, 0.76);
    snout.position.set(0, 0.212, 0.354);
    headGroup.add(snout);

    [-1, 1].forEach((side) => {
      const nostril = new THREE.Mesh(nostrilGeo, matFaceCrease);
      nostril.position.set(side * 0.023, 0.208, 0.386);
      headGroup.add(nostril);
    });

    const lips = new THREE.Mesh(lipGeo, matBlueSkin);
    lips.rotation.z = Math.PI / 2;
    lips.position.set(0, 0.142, 0.356);
    headGroup.add(lips);

    const mouthSeam = new THREE.Mesh(mouthSeamGeo, matFaceCrease);
    mouthSeam.rotation.z = Math.PI / 2;
    mouthSeam.position.set(0, 0.141, 0.38);
    headGroup.add(mouthSeam);

    // Purple-framed forehead goggles above face
    const goggleGroup = new THREE.Group();
    goggleGroup.position.set(0, 0.38, 0.01);
    goggleGroup.rotation.x = -0.35;
    headGroup.add(goggleGroup);

    const strap = new THREE.Mesh(goggleStrapGeo, matNavy);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(1.02, 1.0, 1.12);
    goggleGroup.add(strap);

    const bezel = new THREE.Mesh(goggleFrameGeo, matGogglePurple);
    bezel.rotation.z = Math.PI / 2;
    bezel.scale.set(1.0, 1.0, 0.72);
    bezel.position.set(0, 0.03, 0.3);
    goggleGroup.add(bezel);

    const lens = new THREE.Mesh(goggleLensGeo, matGoggleLens);
    lens.rotation.z = Math.PI / 2;
    lens.scale.set(1.0, 1.0, 0.55);
    lens.position.set(0, 0.03, 0.335);
    goggleGroup.add(lens);

    scene.add(root);
    return {
      root,
      shadow,
      boardMesh: board,
      boardAssembly,
      riderPivot,
      torsoGroup,
      headGroup,
      leftArm,
      rightArm,
    };
  };

  // Dedicated follower pool (strictly used for level followers riding behind Lofi)
  const followerPool: SmallYetiInstance[] = [];
  for (let i = 0; i < poolCapacity; i++) {
    followerPool.push(buildSmallYetiInstance());
  }

  // Separate welcoming NPCs stationed exclusively at the sides of the shelter area
  // (never mid-track, never pickup targets, never counted in sim.followers)
  const shelterGreeters: SmallYetiInstance[] = SHELTER_LAYOUT.greeterSlots.map(() =>
    buildSmallYetiInstance(),
  );

  // Separate +1 New Recruit Yeti that steps forward out of the shelter ONLY during Victory
  // (strictly distinct from active level followers AND from the 3 welcoming shelter NPCs!)
  const newRecruitYeti = buildSmallYetiInstance();

  const slopePitch = -Math.atan(SLOPE_GRADIENT);

  const sync: SmallYetiPool['sync'] = ({
    followers,
    shelterLevelLength,
    time,
    speedRatio,
    celebrating,
    celebrationTime,
    victoryPoseProgress = 0,
    recruitJoinProgress = 0,
    gameoverBurialProgress = 0,
    isGameOver = false,
  }) => {
    const vicEase =
      victoryPoseProgress > 0
        ? victoryPoseProgress * victoryPoseProgress * (3 - 2 * victoryPoseProgress)
        : 0;
    const buriedEase =
      gameoverBurialProgress > 0 ? 1 - Math.pow(1 - gameoverBurialProgress, 3) : 0;

    // 1. ROLE A — Active follower Yetis riding mini-snowboards behind Lofi (strictly levelNumber - 1)
    const activeCount = Math.min(followers.length, followerPool.length);
    for (let i = 0; i < activeCount; i++) {
      const f = followers[i];
      const inst = followerPool[i];
      inst.root.visible = true;
      inst.boardMesh.visible = true;

      if (buriedEase > 0.001) {
        // Comic cartoon snow-mound Game Over pose for existing level followers ONLY (exact gameplay model, zero extra Yetis!)
        const sideSign = i % 2 === 0 ? -1 : 1;
        inst.root.position.set(f.worldX, f.worldY, -f.distance);
        inst.root.rotation.set(0, f.yaw, 0, 'YXZ');

        inst.shadow.scale.set(0.45, 0.65, 1);
        inst.boardAssembly.position.y = 0;
        inst.boardAssembly.rotation.set(0, 0, 0, 'YXZ');

        // Mini-snowboard planted tilted in snow right beside follower
        inst.boardMesh.position.set(sideSign * 0.84 * buriedEase, 0.065 + 0.78 * buriedEase, 0.02);
        inst.boardMesh.rotation.set((Math.PI / 2 - 0.15) * buriedEase, 0, -sideSign * 0.26 * buriedEase);

        const sigh = Math.sin(time * 2.2 + f.id * 1.4) * 0.015;
        inst.riderPivot.position.y = 0.3 - 0.18 * buriedEase + sigh;
        inst.riderPivot.scale.set(1, 1, 1);

        inst.torsoGroup.rotation.y = 1.92 * (1 - buriedEase);
        inst.torsoGroup.rotation.z = Math.sin(time * 1.6 + f.id) * 0.03 * buriedEase;
        inst.torsoGroup.rotation.x = 0.06 * buriedEase;
        inst.headGroup.rotation.y = 1.18 * (1 - buriedEase) + sideSign * -0.14 * buriedEase;
        inst.headGroup.rotation.z = Math.sin(time * 1.8 + f.id) * 0.04 * buriedEase;

        inst.leftArm.rotation.z = -0.28;
        inst.leftArm.rotation.x = 0.14;
        inst.rightArm.rotation.z = 0.28;
        inst.rightArm.rotation.x = 0.14;
        continue;
      }

      if (celebrating && vicEase > 0.001) {
        // Arrived followers celebrate cleanly on Lofi's left flank facing the camera
        const hopY = computeGreeterHopY(true, celebrationTime, f.id * 1.15) * 0.85 * vicEase;
        const wave = Math.sin(celebrationTime * 8.8 + f.id * 1.3);

        inst.root.position.set(f.worldX, f.worldY, -f.distance);
        inst.root.rotation.set(0, f.yaw, 0, 'YXZ');

        const shadowShrink = 1 - Math.min(0.26, hopY * 0.55);
        inst.shadow.position.set(0, 0.025, 0.04);
        inst.shadow.scale.set(0.84 * shadowShrink, 1.35 * shadowShrink, 1);

        inst.boardMesh.position.set(0, 0.065, 0);
        inst.boardMesh.rotation.set(0, 0, 0);

        inst.boardAssembly.position.y = hopY / 0.76;
        inst.boardAssembly.rotation.set(0, 0, wave * 0.06 * vicEase, 'YXZ');
        inst.riderPivot.position.y = 0.3;
        inst.riderPivot.scale.set(1, 1, 1);

        inst.torsoGroup.rotation.y = 1.92 * (1 - vicEase);
        inst.torsoGroup.rotation.z = wave * 0.1 * vicEase;
        inst.torsoGroup.rotation.x = 0;
        inst.headGroup.rotation.y = 1.18 * (1 - vicEase);
        inst.headGroup.rotation.z = -wave * 0.08 * vicEase;

        inst.leftArm.rotation.z = -0.34 * (1 - vicEase) + (-1.9 + wave * 0.36) * vicEase;
        inst.leftArm.rotation.x = 0;
        inst.rightArm.rotation.z = 0.34 * (1 - vicEase) + (1.9 - wave * 0.36) * vicEase;
        inst.rightArm.rotation.x = 0;
        continue;
      }

      // Standard gameplay snowboarding pose
      inst.boardMesh.position.set(0, 0.065, 0);
      inst.boardMesh.rotation.set(0, 0, 0);

      const h = Math.max(0, f.heightAboveGround);
      const isAirborne = f.jumpState === 'AIRBORNE';
      const grab = Math.max(0, Math.min(1, f.grabAmount));
      const fBrake = isAirborne ? 0 : Math.max(0, Math.min(1, f.brakeAmount ?? 0));
      const fPitch = Number.isFinite(f.slopePitch) ? f.slopePitch : slopePitch;
      const landSquash =
        f.jumpState === 'LANDING' ? Math.sin(Math.min(1, f.landingProgress) * Math.PI) : 0;

      inst.root.position.set(f.worldX, f.worldY, -f.distance);
      inst.root.rotation.set(fPitch, f.yaw, 0, 'YXZ');

      const shadowScale = 1 / (1 + h * 0.22);
      inst.shadow.position.set(0, 0.025, 0.04);
      inst.shadow.scale.set(0.84 * shadowScale, 1.35 * shadowScale, 1);

      const phase = f.id * 1.3;
      const bob = isAirborne
        ? 0
        : Math.sin(time * (7.2 + speedRatio * 3.8) + phase) * 0.026 * (0.4 + speedRatio * 0.6);
      const lean = f.lean;
      const brakeDir = lean > 0.18 ? -1 : 1;

      inst.boardAssembly.position.y = (h + grab * 0.11) / 0.76;
      inst.boardAssembly.rotation.set(
        f.rampPitch + grab * 0.13,
        -lean * 0.28 + grab * 0.12 + fBrake * 0.42 * brakeDir,
        -lean * 0.24 + grab * 0.24 - fBrake * 0.12 * brakeDir,
        'YXZ',
      );
      inst.riderPivot.position.y =
        0.3 -
        (isAirborne ? 0.03 : Math.abs(lean) * 0.045) -
        fBrake * 0.09 -
        grab * 0.12 -
        landSquash * 0.11 +
        bob;
      const sqY = 1 - landSquash * 0.09;
      const sqXZ = 1 + landSquash * 0.045;
      inst.riderPivot.scale.set(sqXZ, sqY, sqXZ);

      inst.torsoGroup.rotation.y = 1.92;
      inst.torsoGroup.rotation.z = -lean * 0.15 + grab * 0.15 - fBrake * 0.06 * brakeDir;
      inst.torsoGroup.rotation.x = 0.04 + grab * 0.42 + landSquash * 0.2 + fBrake * 0.14;
      inst.headGroup.rotation.y = 1.18 - lean * 0.12 - grab * 0.1 - fBrake * 0.18 * brakeDir;
      inst.headGroup.rotation.z = lean * 0.07 - grab * 0.08;

      const baseL = -0.34 - lean * 0.26 - fBrake * 0.14 + Math.sin(time * 2.6 + phase) * 0.05;
      const baseR = 0.34 - lean * 0.22 + fBrake * 0.14 - Math.sin(time * 2.6 + phase) * 0.05;
      inst.leftArm.rotation.z = baseL * (1 - grab) + (-1.02) * grab - landSquash * 0.15;
      inst.leftArm.rotation.x = grab * -0.15 + fBrake * 0.06;
      inst.rightArm.rotation.z = baseR * (1 - grab) + (-0.48) * grab + landSquash * 0.15;
      inst.rightArm.rotation.x = grab * 0.88 + fBrake * 0.06;
    }

    // Hide remaining unused follower pool slots cleanly
    for (let i = activeCount; i < followerPool.length; i++) {
      followerPool[i].root.visible = false;
    }

    // 2. ROLE C — Single +1 New Recruit Yeti emerging from the shelter doorway ONLY on Victory AFTER arrival finishes
    let visibleRecruit = 0;
    if (!isGameOver && celebrating && recruitJoinProgress > 0.01) {
      const rt = Math.max(0, Math.min(1, recruitJoinProgress));
      const eased = 1 - Math.pow(1 - rt, 3);
      // Distinct introduction position on the mid-right (clearly separated from Hero & left-flank followers AND from cabin greeters!)
      const startZ = shelterLevelLength + 16.0;
      const endZ = shelterLevelLength + 6.9;
      const currZ = startZ + (endZ - startZ) * eased;
      const currX = getTrackCenterX(currZ) + 0.15 + 2.9 * eased;
      const currY = getGroundHeightAt(currX, currZ);
      const trackYaw = -Math.atan(getTrackSlopeTangentX(currZ));

      const stepHop =
        rt < 1
          ? Math.abs(Math.sin(rt * Math.PI * 3.0)) * 0.34
          : computeGreeterHopY(true, celebrationTime, 0.7) * 0.65;
      const wave = Math.sin(celebrationTime * 9.0 + 0.8);

      newRecruitYeti.root.visible = true;
      newRecruitYeti.boardMesh.visible = true;
      visibleRecruit = 1;
      newRecruitYeti.root.position.set(currX, currY, -currZ);
      newRecruitYeti.root.rotation.set(0, trackYaw - 0.22, 0, 'YXZ');

      newRecruitYeti.boardMesh.position.set(0, 0.065, 0);
      newRecruitYeti.boardMesh.rotation.set(0, 0, 0);
      newRecruitYeti.boardAssembly.position.y = stepHop / 0.76;
      newRecruitYeti.boardAssembly.rotation.set(0, 0, wave * 0.05, 'YXZ');
      newRecruitYeti.shadow.position.set(0, 0.025, 0.04);
      newRecruitYeti.shadow.scale.set(0.82, 1.3, 1);

      newRecruitYeti.riderPivot.position.y = 0.3;
      newRecruitYeti.riderPivot.scale.set(1, 1, 1);
      newRecruitYeti.torsoGroup.rotation.y = 0;
      newRecruitYeti.torsoGroup.rotation.z = wave * 0.08;
      newRecruitYeti.torsoGroup.rotation.x = 0;
      newRecruitYeti.headGroup.rotation.y = -0.1;
      newRecruitYeti.headGroup.rotation.z = -wave * 0.06;
      newRecruitYeti.leftArm.rotation.z = -1.9 + wave * 0.36;
      newRecruitYeti.leftArm.rotation.x = 0;
      newRecruitYeti.rightArm.rotation.z = 1.9 - wave * 0.36;
      newRecruitYeti.rightArm.rotation.x = 0;
    } else {
      newRecruitYeti.root.visible = false;
    }

    // 3. ROLE B — Welcoming shelter NPCs stationed strictly back at the cabin porch flanks (standing on foot, NEVER shown on Game Over!)
    let visibleGreeters = 0;
    for (let i = 0; i < SHELTER_LAYOUT.greeterSlots.length; i++) {
      const slot = SHELTER_LAYOUT.greeterSlots[i];
      const npc = shelterGreeters[i];

      if (isGameOver) {
        npc.root.visible = false;
        continue;
      }

      const greeterZ = shelterLevelLength + slot.offsetFromFinishZ;
      const greeterX = getTrackCenterX(greeterZ) + slot.offsetX;
      const greeterY = getGroundHeightAt(greeterX, greeterZ);
      const trackYaw = -Math.atan(getTrackSlopeTangentX(greeterZ));

      const hopY = computeGreeterHopY(celebrating, celebrationTime, slot.phaseOffset) * 0.75;

      npc.root.visible = true;
      visibleGreeters += 1;
      // Shelter NPCs stand on foot at the cabin porch (no mini-snowboard) so they are unmistakably distinct from track riders
      npc.boardMesh.visible = false;
      npc.root.position.set(greeterX, greeterY, -greeterZ);
      // Facing uphill (+Z) toward incoming Lofi & the camera!
      npc.root.rotation.set(0, trackYaw + slot.facingBias, 0, 'YXZ');

      npc.boardAssembly.position.y = (hopY - 0.05) / 0.76;
      const shadowShrink = 1 - Math.min(0.24, hopY * 0.5);
      npc.shadow.position.set(0, 0.025, 0.04);
      npc.shadow.scale.set(0.68 * shadowShrink, 0.68 * shadowShrink, 1);

      if (celebrating) {
        const wave = Math.sin(celebrationTime * 8.6 + slot.phaseOffset);
        npc.boardAssembly.rotation.set(0, 0, wave * 0.05);
        npc.riderPivot.position.y = 0.3;
        npc.riderPivot.scale.set(1, 1, 1);
        npc.torsoGroup.rotation.y = 0;
        npc.torsoGroup.rotation.z = wave * 0.08;
        npc.torsoGroup.rotation.x = 0;
        npc.headGroup.rotation.y = 0;
        npc.headGroup.rotation.z = -wave * 0.06;
        npc.leftArm.rotation.z = -1.85 + wave * 0.38;
        npc.leftArm.rotation.x = 0;
        npc.rightArm.rotation.z = 1.85 - wave * 0.38;
        npc.rightArm.rotation.x = 0;
      } else {
        const idle = Math.sin(time * 2.2 + slot.phaseOffset);
        npc.boardAssembly.rotation.set(0, 0, 0);
        npc.riderPivot.position.y = 0.3 + Math.max(0, idle) * 0.02;
        npc.torsoGroup.rotation.y = 0;
        npc.torsoGroup.rotation.z = idle * 0.025;
        npc.torsoGroup.rotation.x = 0;
        npc.headGroup.rotation.y = 0;
        npc.headGroup.rotation.z = -idle * 0.02;
        npc.leftArm.rotation.z = -0.42 + idle * 0.06;
        npc.leftArm.rotation.x = 0;
        npc.rightArm.rotation.z = 0.42 - idle * 0.06;
        npc.rightArm.rotation.x = 0;
      }
    }

    return {
      visibleFollowers: activeCount,
      visibleGreeters,
      visibleRecruit,
    };
  };

  const dispose = () => {
    for (let i = 0; i < followerPool.length; i++) {
      scene.remove(followerPool[i].root);
    }
    for (let i = 0; i < shelterGreeters.length; i++) {
      scene.remove(shelterGreeters[i].root);
    }
    scene.remove(newRecruitYeti.root);
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return { sync, dispose };
}
