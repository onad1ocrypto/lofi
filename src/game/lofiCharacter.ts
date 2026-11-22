import * as THREE from 'three';
import { STEEP_DESCENT_CONFIG } from './steepDescentLogic';
import type { GrabTrickStyle, JumpState } from './types';

export interface LofiCharacterRig {
  /** Root group positioned at the contact point of the snowboard on the snow surface. */
  root: THREE.Group;
  /** Update procedural carving pose, jump height, landing knee flex, Grab trick pose, braking crouch, and hit visual feedback. */
  update: (params: {
    dt: number;
    time: number;
    lean: number;
    speedRatio: number;
    hitFlashTimer: number;
    invulnTimer: number;
    isTitleIdle: boolean;
    heightAboveGround?: number;
    jumpState?: JumpState;
    landingProgress?: number;
    rampPitch?: number;
    grabAmount?: number;
    grabStyle?: GrabTrickStyle;
    /** Smooth 0..1 braking blend for subtle sideways board speed-check and crouch. */
    brakeAmount?: number;
    /** 0..1 blend into front-facing deadpan one-arm triumph pose beside upright snowboard at shelter. */
    victoryPoseAmount?: number;
    /** 0..1 blend into front-facing resigned cartoon snow-burial pose on Game Over. */
    gameoverBurialAmount?: number;
    /** Dev-only static neutral stance facing +Z for model inspection (never used in gameplay). */
    neutralInspect?: boolean;
  }) => void;
  /** Dispose all owned geometries, materials, and textures. */
  dispose: () => void;
}

/**
 * Procedural snowboard top texture: deep navy deck with warm orange diagonal stripes
 * matching Lofi's approved side & arena references.
 */
function createSnowboardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Deep navy base
  ctx.fillStyle = '#232c4b';
  ctx.fillRect(0, 0, 256, 512);

  // Subtle metallic bevel highlight along board edges
  ctx.strokeStyle = '#333f68';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 502);

  // Twin orange diagonal stripes near nose and tail (matching reference board)
  ctx.fillStyle = '#e06f29';
  const drawStripe = (y: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 36);
    ctx.lineTo(256, y + 36 + h);
    ctx.lineTo(0, y + h);
    ctx.closePath();
    ctx.fill();
  };
  drawStripe(78, 22);
  drawStripe(112, 16);
  drawStripe(378, 22);
  drawStripe(412, 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/** Soft radial contact shadow disc so Lofi always reads firmly grounded on the snow. */
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(30, 46, 82, 0.55)');
  grad.addColorStop(0.55, 'rgba(38, 56, 98, 0.25)');
  grad.addColorStop(1, 'rgba(38, 56, 98, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Isolated procedural Lofi character builder.
 * Structured as a standalone module with clean rig interface so a final GLB/GLTF
 * model can replace this procedural placeholder without touching gameplay code.
 */
export function createLofiCharacter(maxAnisotropy = 4): LofiCharacterRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // --- Shared PBR Material Palette (calibrated from Lofi reference sheets) ---
  const boardTex = createSnowboardTexture(maxAnisotropy);
  disposables.push(boardTex);

  const shadowTex = createContactShadowTexture();
  disposables.push(shadowTex);

  const matWhiteFur = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf3f6fc,
      roughness: 0.88,
      metalness: 0.0,
    }),
  );
  const matBlueSkin = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b87c9,
      roughness: 0.5,
      metalness: 0.03,
    }),
  );
  const matFaceBlueLight = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x76a2d1,
      roughness: 0.56,
      metalness: 0.02,
    }),
  );
  const matEarInner = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x264672,
      roughness: 0.68,
      metalness: 0.02,
    }),
  );
  const matBlueHorn = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5caae6,
      roughness: 0.36,
      metalness: 0.06,
    }),
  );
  const matOrangeJacket = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd65d1c,
      roughness: 0.56,
      metalness: 0.04,
    }),
  );
  const matNavyTrim = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d2746,
      roughness: 0.66,
      metalness: 0.06,
    }),
  );
  const matBootOrange = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd96120,
      roughness: 0.5,
      metalness: 0.05,
    }),
  );
  const matBoardDeck = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: boardTex,
      roughness: 0.28,
      metalness: 0.14,
    }),
  );
  const matGoggleFrame = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe3732c,
      roughness: 0.42,
      metalness: 0.08,
    }),
  );
  const matGoggleLens = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b2747,
      roughness: 0.14,
      metalness: 0.32,
    }),
  );
  const matFaceCrease = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161f33,
      roughness: 0.42,
      metalness: 0.04,
    }),
  );
  const matEyeWhite = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfafdff,
      roughness: 0.28,
      metalness: 0.0,
    }),
  );
  const matEyePupil = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111726,
      roughness: 0.14,
      metalness: 0.08,
    }),
  );
  const matEyeHighlight = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.1,
      metalness: 0.0,
    }),
  );
  const matShadow = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.62,
    }),
  );

  const flashMaterials = [matOrangeJacket, matWhiteFur, matBlueSkin, matFaceBlueLight, matNavyTrim];

  // --- Root & Hierarchy ---
  // Local convention: -Z is downhill travel direction (board nose).
  const root = new THREE.Group();
  root.name = 'LofiRoot';

  // Soft radial contact shadow flush just above snow
  const contactShadow = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(1.18, 24)),
    matShadow,
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(0.82, 1.38, 1);
  contactShadow.position.set(0, 0.025, 0.05);
  root.add(contactShadow);

  // Snowboard + rider pivot (handles board yaw & edge carving roll cleanly as one hierarchy)
  const boardAssembly = new THREE.Group();
  boardAssembly.name = 'BoardAssembly';
  root.add(boardAssembly);

  // --- 1. SINGLE SNOWBOARD (Rounded twin-tip with nose & tail rocker) ---
  const boardShape = new THREE.Shape();
  const bw = 0.31;
  const bl = 1.08;
  const r = 0.27;
  boardShape.moveTo(-bw + r, -bl);
  boardShape.lineTo(bw - r, -bl);
  boardShape.quadraticCurveTo(bw, -bl, bw, -bl + r);
  // Slight waist taper like a real snowboard
  boardShape.quadraticCurveTo(bw * 0.86, 0, bw, bl - r);
  boardShape.quadraticCurveTo(bw, bl, bw - r, bl);
  boardShape.lineTo(-bw + r, bl);
  boardShape.quadraticCurveTo(-bw, bl, -bw, bl - r);
  boardShape.quadraticCurveTo(-bw * 0.86, 0, -bw, -bl + r);
  boardShape.quadraticCurveTo(-bw, -bl, -bw + r, -bl);

  const boardGeo = trackGeo(
    new THREE.ExtrudeGeometry(boardShape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 3,
      curveSegments: 16,
    }),
  );
  boardGeo.rotateX(Math.PI / 2);
  // Subtle nose & tail rocker curve upward along Z
  const bPos = boardGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const pz = bPos.getZ(i);
    const absZ = Math.abs(pz);
    if (absZ > 0.62) {
      const t = (absZ - 0.62) / 0.38;
      bPos.setY(i, bPos.getY(i) + t * t * 0.13);
    }
  }
  boardGeo.computeVertexNormals();

  // Recompute clean planar UVs across X/Z so stripes map squarely onto the top deck
  const uvArr = boardGeo.attributes.uv;
  for (let i = 0; i < bPos.count; i++) {
    const u = (bPos.getX(i) + bw) / (bw * 2);
    const v = (bPos.getZ(i) + bl) / (bl * 2);
    uvArr.setXY(i, u, v);
  }
  uvArr.needsUpdate = true;

  const boardMesh = new THREE.Mesh(boardGeo, matBoardDeck);
  boardMesh.position.y = 0.07;
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  boardAssembly.add(boardMesh);

  // --- 2. TWO SEPARATE BINDINGS & TRANSVERSE BOOTS (Regular stance: left foot forward, toes toward +X) ---
  const bindingPositions = [
    { z: -0.35, yaw: -Math.PI / 2 + 0.22 }, // Front (left) foot slightly angled forward
    { z: 0.35, yaw: -Math.PI / 2 - 0.14 },  // Back (right) foot slight duck angle
  ];

  const bootBaseGeo = trackGeo(new THREE.CapsuleGeometry(0.115, 0.18, 8, 14));
  const bootAnkleGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.125, 0.23, 14));
  const soleGeo = trackGeo(new THREE.CapsuleGeometry(0.12, 0.19, 6, 12));
  const bindingPlateGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.15, 0.035, 14));
  const strapGeo = trackGeo(new THREE.TorusGeometry(0.115, 0.024, 8, 16, Math.PI));
  const highbackGeo = trackGeo(new THREE.CapsuleGeometry(0.085, 0.16, 6, 10));

  bindingPositions.forEach((bp) => {
    const footGroup = new THREE.Group();
    footGroup.position.set(0, 0.085, bp.z);
    // Transverse orientation: local +Z points along toes (+X world side of board)
    footGroup.rotation.y = -bp.yaw;
    boardAssembly.add(footGroup);

    // Binding baseplate
    const plate = new THREE.Mesh(bindingPlateGeo, matNavyTrim);
    plate.position.y = 0.015;
    footGroup.add(plate);

    // Binding highback behind heel
    const highback = new THREE.Mesh(highbackGeo, matNavyTrim);
    highback.position.set(0, 0.17, -0.14);
    highback.rotation.x = -0.22;
    highback.scale.set(1.15, 1.0, 0.45);
    footGroup.add(highback);

    // Navy boot sole
    const sole = new THREE.Mesh(soleGeo, matNavyTrim);
    sole.rotation.x = Math.PI / 2;
    sole.scale.set(1.0, 1.0, 0.48);
    sole.position.set(0, 0.06, 0.04);
    sole.castShadow = true;
    footGroup.add(sole);

    // Orange rounded boot upper
    const upper = new THREE.Mesh(bootBaseGeo, matBootOrange);
    upper.rotation.x = Math.PI / 2;
    upper.scale.set(0.98, 0.98, 0.78);
    upper.position.set(0, 0.125, 0.045);
    upper.castShadow = true;
    footGroup.add(upper);

    // Orange boot cuff / ankle
    const ankle = new THREE.Mesh(bootAnkleGeo, matBootOrange);
    ankle.position.set(0, 0.23, -0.02);
    ankle.castShadow = true;
    footGroup.add(ankle);

    // Navy instep strap & binding orange-edged strap
    const toeStrap = new THREE.Mesh(strapGeo, matNavyTrim);
    toeStrap.position.set(0, 0.11, 0.11);
    toeStrap.rotation.x = 0.25;
    footGroup.add(toeStrap);

    const ankleStrap = new THREE.Mesh(strapGeo, matNavyTrim);
    ankleStrap.position.set(0, 0.21, 0.01);
    ankleStrap.rotation.x = -0.35;
    footGroup.add(ankleStrap);
  });

  // --- 3. RIDER BODY HIERARCHY (Sideways stance, bent knees, head facing downhill -Z) ---
  const riderPivot = new THREE.Group();
  riderPivot.name = 'RiderPivot';
  riderPivot.position.set(0, 0.34, 0);
  boardAssembly.add(riderPivot);

  // Legs connecting boots to hips with natural slight snowboarder knee bend
  const thighGeo = trackGeo(new THREE.CapsuleGeometry(0.135, 0.22, 8, 14));
  const shinGeo = trackGeo(new THREE.CapsuleGeometry(0.118, 0.2, 8, 14));

  // Front (left) leg at z = -0.34, bent slightly forward-outward (+X)
  const frontShin = new THREE.Mesh(shinGeo, matNavyTrim);
  frontShin.position.set(0.05, 0.13, -0.32);
  frontShin.rotation.z = -0.22;
  frontShin.rotation.x = 0.12;
  frontShin.castShadow = true;
  riderPivot.add(frontShin);

  const frontThigh = new THREE.Mesh(thighGeo, matNavyTrim);
  frontThigh.position.set(0.04, 0.34, -0.22);
  frontThigh.rotation.z = 0.18;
  frontThigh.rotation.x = -0.26;
  frontThigh.castShadow = true;
  riderPivot.add(frontThigh);

  // Back (right) leg at z = +0.34
  const backShin = new THREE.Mesh(shinGeo, matNavyTrim);
  backShin.position.set(0.05, 0.13, 0.32);
  backShin.rotation.z = -0.22;
  backShin.rotation.x = -0.12;
  backShin.castShadow = true;
  riderPivot.add(backShin);

  const backThigh = new THREE.Mesh(thighGeo, matNavyTrim);
  backThigh.position.set(0.04, 0.34, 0.22);
  backThigh.rotation.z = 0.18;
  backThigh.rotation.x = 0.26;
  backThigh.castShadow = true;
  riderPivot.add(backThigh);

  // Rounded pelvis / seat
  const pelvis = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.32, 18, 14)),
    matNavyTrim,
  );
  pelvis.scale.set(0.92, 0.72, 1.15);
  pelvis.position.set(-0.02, 0.44, 0);
  pelvis.castShadow = true;
  riderPivot.add(pelvis);

  // Upper Torso Group: oriented mostly sideways (facing +X with gentle 28° turn toward downhill -Z)
  // so Lofi's back/side silhouette matches lofi-arena-reference cleanly!
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'TorsoGroup';
  torsoGroup.position.set(0, 0.48, 0);
  // Local +Z of torso faces chest forward; rotating Y = +1.08 rad points chest ~62° right-downhill
  // Wait: in Three.js, rotating Y by +90° (+PI/2) maps local +Z to +X.
  // Rotating Y by +1.95 rad (~112°) points chest slightly downhill toward (+X, -Z)!
  torsoGroup.rotation.y = 1.92;
  riderPivot.add(torsoGroup);

  // Navy jacket bottom hem ring
  const hemRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.36, 0.055, 10, 22)),
    matNavyTrim,
  );
  hemRing.rotation.x = Math.PI / 2;
  hemRing.scale.set(1.08, 0.88, 1);
  hemRing.position.y = 0.05;
  torsoGroup.add(hemRing);

  // Puffer jacket horizontal segmented baffles (3 stacked plump rounded tiers — zero sharp boxes!)
  const baffleGeo = trackGeo(new THREE.SphereGeometry(0.43, 22, 16));
  const baffleSpecs = [
    { y: 0.16, sx: 1.12, sy: 0.43, sz: 0.92 },
    { y: 0.34, sx: 1.16, sy: 0.45, sz: 0.96 },
    { y: 0.51, sx: 1.08, sy: 0.42, sz: 0.9 },
  ];
  baffleSpecs.forEach((b) => {
    const tier = new THREE.Mesh(baffleGeo, matOrangeJacket);
    tier.position.y = b.y;
    tier.scale.set(b.sx, b.sy, b.sz);
    tier.castShadow = true;
    tier.receiveShadow = true;
    torsoGroup.add(tier);
  });

  // Front navy zipper line & subtle navy pocket slashes
  const zipper = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.018, 0.5, 6, 8)),
    matNavyTrim,
  );
  zipper.position.set(0, 0.34, 0.355);
  torsoGroup.add(zipper);

  const pocketGeo = trackGeo(new THREE.CapsuleGeometry(0.018, 0.13, 6, 8));
  [-1, 1].forEach((side) => {
    const pocket = new THREE.Mesh(pocketGeo, matNavyTrim);
    pocket.position.set(side * 0.24, 0.21, 0.29);
    pocket.rotation.z = side * 0.32;
    torsoGroup.add(pocket);
  });

  // Chunky navy puffer collar
  const collar = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.28, 0.085, 12, 22)),
    matNavyTrim,
  );
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1.06, 0.95, 1);
  collar.position.y = 0.66;
  collar.castShadow = true;
  torsoGroup.add(collar);

  // --- Puffer Arms (Left = leading downhill arm, Right = trailing balance arm) ---
  const armPuffGeo = trackGeo(new THREE.SphereGeometry(0.145, 16, 12));
  const cuffGeo = trackGeo(new THREE.TorusGeometry(0.105, 0.032, 8, 16));
  const pawGeo = trackGeo(new THREE.SphereGeometry(0.098, 14, 12));
  const thumbGeo = trackGeo(new THREE.CapsuleGeometry(0.032, 0.055, 6, 8));

  const buildArm = (side: -1 | 1) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.42, 0.52, 0.02);

    // 3 segmented orange puffer sleeve lobes
    const upperSleeve = new THREE.Mesh(armPuffGeo, matOrangeJacket);
    upperSleeve.scale.set(1.0, 0.95, 0.95);
    upperSleeve.position.set(side * 0.06, -0.04, 0);
    upperSleeve.castShadow = true;
    armPivot.add(upperSleeve);

    const midSleeve = new THREE.Mesh(armPuffGeo, matOrangeJacket);
    midSleeve.scale.set(0.92, 0.9, 0.9);
    midSleeve.position.set(side * 0.17, -0.15, 0.03);
    midSleeve.castShadow = true;
    armPivot.add(midSleeve);

    const foreSleeve = new THREE.Mesh(armPuffGeo, matOrangeJacket);
    foreSleeve.scale.set(0.84, 0.84, 0.84);
    foreSleeve.position.set(side * 0.26, -0.25, 0.06);
    foreSleeve.castShadow = true;
    armPivot.add(foreSleeve);

    // Navy sleeve cuff
    const cuff = new THREE.Mesh(cuffGeo, matNavyTrim);
    cuff.position.set(side * 0.32, -0.31, 0.08);
    cuff.rotation.y = Math.PI / 2;
    cuff.rotation.x = side * 0.72;
    armPivot.add(cuff);

    // White wrist fur tuft + sky-blue hand paw
    const wristFur = new THREE.Mesh(pawGeo, matWhiteFur);
    wristFur.scale.set(0.92, 0.85, 0.92);
    wristFur.position.set(side * 0.35, -0.34, 0.09);
    armPivot.add(wristFur);

    const hand = new THREE.Mesh(pawGeo, matBlueSkin);
    hand.scale.set(0.95, 1.1, 0.78);
    hand.position.set(side * 0.4, -0.4, 0.11);
    hand.castShadow = true;
    armPivot.add(hand);

    const thumb = new THREE.Mesh(thumbGeo, matBlueSkin);
    thumb.position.set(side * 0.37, -0.38, 0.17);
    thumb.rotation.x = 0.6;
    armPivot.add(thumb);

    return armPivot;
  };

  const leftArm = buildArm(-1); // Leading arm toward nose
  leftArm.rotation.z = -0.34;
  leftArm.rotation.x = -0.14;
  torsoGroup.add(leftArm);

  const rightArm = buildArm(1); // Trailing balance arm
  rightArm.rotation.z = 0.36;
  rightArm.rotation.x = 0.12;
  torsoGroup.add(rightArm);

  // --- 4. HEAD GROUP (Naturally turned to look downhill along -Z!) ---
  // Torso Y is +1.92 rad; turning head local Y by +1.18 rad gives world Y = 3.10 rad (~PI),
  // which points local +Z face straight downhill (-Z world) with a totally natural 67° head turn!
  const headGroup = new THREE.Group();
  headGroup.name = 'HeadGroup';
  headGroup.position.set(0, 0.72, 0.02);
  headGroup.rotation.y = 1.18;
  torsoGroup.add(headGroup);

  // Helper: build a plump, softly curved sculpted clay fur lock via LatheGeometry (soft rounded tip, zero sharp spikes!)
  const createCurvedFurLockGeo = (
    radius: number,
    length: number,
    bendX = 0.022,
    bendZ = 0.028,
  ) => {
    const profile: THREE.Vector2[] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = (t - 0.5) * length;
      // Plush teardrop silhouette: full rounded base, widest around t=0.28, softly rounded blunt tip
      const r =
        t === 0 || t === 1
          ? 0.001
          : radius * Math.pow(Math.sin(t * Math.PI), 0.68) * (1.12 - t * 0.42);
      profile.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    const geo = new THREE.LatheGeometry(profile, 12);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const t = Math.max(0, Math.min(1, (vy + length * 0.5) / length));
      const curveSq = t * t;
      pos.setXYZ(i, vx + bendX * curveSq, vy, vz + bendZ * curveSq);
    }
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  // Helper: build a smooth tapered 3D clay tube along a CatmullRomCurve3 (for wavy lips, brow arches, horns)
  const createTaperedTubeGeo = (
    points: THREE.Vector3[],
    radius: number,
    tubularSegments: number,
    radialSegments: number,
    taperAtEnds: number,
    scaleZ = 1.0,
    scaleY = 1.0,
  ) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    const pos = geo.attributes.position;
    const ringStride = radialSegments + 1;
    const center = new THREE.Vector3();
    for (let s = 0; s <= tubularSegments; s++) {
      const u = s / tubularSegments;
      curve.getPointAt(u, center);
      // Smooth sine arch keeps center plump and tapers smoothly toward both endpoints
      const endWeight = Math.sin(u * Math.PI);
      const rScale = 1 - taperAtEnds * (1 - Math.pow(endWeight, 0.55));
      for (let rIdx = 0; rIdx < ringStride; rIdx++) {
        const idx = s * ringStride + rIdx;
        const dx = pos.getX(idx) - center.x;
        const dy = pos.getY(idx) - center.y;
        const dz = pos.getZ(idx) - center.z;
        pos.setXYZ(
          idx,
          center.x + dx * rScale,
          center.y + dy * rScale * scaleY,
          center.z + dz * rScale * scaleZ,
        );
      }
    }
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  // Main fluffy white head cranium (wide & plush to frame the broad blue face)
  const headBase = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.355, 24, 18)),
    matWhiteFur,
  );
  headBase.scale.set(1.06, 1.02, 0.96);
  headBase.position.set(0, 0.235, -0.025);
  headBase.castShadow = true;
  headGroup.add(headBase);

  // Soft white lower-jaw/cheek fur cushion bridging face to beard ruff cleanly above the navy collar
  const jawRuffBase = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.315, 20, 14)),
    matWhiteFur,
  );
  jawRuffBase.scale.set(1.2, 0.56, 0.88);
  jawRuffBase.position.set(0, 0.088, 0.068);
  jawRuffBase.castShadow = true;
  headGroup.add(jawRuffBase);

  // Sculpted shaggy white mane, wide flaring cheek tufts, lush beard ruff, & crown hair
  const cheekTuftGeo = createCurvedFurLockGeo(0.115, 0.25, 0.018, 0.025);
  const chinTuftGeo = createCurvedFurLockGeo(0.095, 0.2, 0.0, 0.024);
  const crownTuftGeo = createCurvedFurLockGeo(0.085, 0.22, 0.012, 0.018);
  const backTuftGeo = createCurvedFurLockGeo(0.125, 0.25, 0.0, 0.025);

  // Wide flaring white cheek & sideburn tufts (4 layered soft clay locks per side framing the wide blue muzzle)
  ([-1, 1] as const).forEach((side) => {
    const cheekSpecs: Array<[number, number, number, number, number, number, number]> = [
      // Upper cheek lock below ear
      [side * 0.335, 0.2, 0.115, 0.28, side * 0.2, side * -1.46, 0.96],
      // Mid-cheek wide flaring lock
      [side * 0.36, 0.125, 0.142, 0.38, side * 0.14, side * -1.84, 1.05],
      // Lower cheek sweeping lock resting cleanly above collar
      [side * 0.3, 0.055, 0.185, 0.52, side * 0.18, side * -2.24, 1.02],
      // Outer jawline lock filling 3/4 silhouette
      [side * 0.34, 0.1, 0.02, 0.18, side * -0.22, side * -1.98, 1.0],
    ];
    cheekSpecs.forEach(([x, y, z, rx, ry, rz, s]) => {
      const tuft = new THREE.Mesh(cheekTuftGeo, matWhiteFur);
      tuft.position.set(x, y, z);
      tuft.rotation.set(rx, ry, rz);
      tuft.scale.setScalar(s);
      tuft.castShadow = true;
      headGroup.add(tuft);
    });
  });

  // Full plush white yeti chin / beard ruff draping cleanly OVER the front of the collar (zero piercing!)
  const chinSpecs: Array<[number, number, number, number, number, number, number]> = [
    [-0.22, 0.026, 0.228, 2.52, -0.32, 0.44, 1.0],
    [-0.14, 0.008, 0.262, 2.58, -0.18, 0.22, 1.04],
    [-0.06, -0.004, 0.282, 2.64, -0.06, 0.08, 1.02],
    [0.0, -0.008, 0.288, 2.66, 0.0, 0.0, 1.08],
    [0.06, -0.004, 0.282, 2.64, 0.06, -0.08, 1.02],
    [0.14, 0.008, 0.262, 2.58, 0.18, -0.22, 1.04],
    [0.22, 0.026, 0.228, 2.52, 0.32, -0.44, 1.0],
  ];
  chinSpecs.forEach(([x, y, z, rx, ry, rz, s]) => {
    const tuft = new THREE.Mesh(chinTuftGeo, matWhiteFur);
    tuft.position.set(x, y, z);
    tuft.rotation.set(rx, ry, rz);
    tuft.scale.setScalar(s);
    tuft.castShadow = true;
    headGroup.add(tuft);
  });

  // Playful white crown hair tufts rising visibly above goggles between the two curved blue horns
  const crownSpecs: Array<[number, number, number, number, number, number, number]> = [
    [-0.135, 0.545, 0.055, 0.14, -0.12, 0.48, 0.96],
    [-0.06, 0.578, 0.068, 0.18, -0.06, 0.2, 1.04],
    [0.012, 0.592, 0.056, 0.12, 0.0, -0.08, 1.08],
    [0.088, 0.572, 0.066, 0.16, 0.08, -0.32, 1.0],
    [0.142, 0.538, 0.042, 0.1, 0.14, -0.52, 0.92],
    [0.0, 0.568, -0.065, -0.22, 0.0, 0.08, 1.02],
  ];
  crownSpecs.forEach(([x, y, z, rx, ry, rz, s]) => {
    const tuft = new THREE.Mesh(crownTuftGeo, matWhiteFur);
    tuft.position.set(x, y, z);
    tuft.rotation.set(rx, ry, rz);
    tuft.scale.setScalar(s);
    headGroup.add(tuft);
  });

  // Rear mane tufts (preserves rich yeti fur silhouette for the rear gameplay chase camera!)
  const backManeSpecs: Array<[number, number, number, number, number, number]> = [
    [0, 0.055, -0.315, -2.55, 0, 0],
    [-0.18, 0.065, -0.275, -2.5, 0.45, 0.22],
    [0.18, 0.065, -0.275, -2.5, -0.45, -0.22],
    [-0.3, 0.075, -0.145, -2.4, 1.05, 0.3],
    [0.3, 0.075, -0.145, -2.4, -1.05, -0.3],
    [-0.12, 0.21, -0.345, -2.25, 0.3, 0.12],
    [0.12, 0.21, -0.345, -2.25, -0.3, -0.12],
    [0, 0.34, -0.325, -2.05, 0, 0],
  ];
  backManeSpecs.forEach(([x, y, z, rx, ry, rz]) => {
    const tuft = new THREE.Mesh(backTuftGeo, matWhiteFur);
    tuft.position.set(x, y, z);
    tuft.rotation.set(rx, ry, rz);
    headGroup.add(tuft);
  });

  // Rounded cupped sky-blue Yeti ears with distinct darker recessed inner ear hollows
  const earOuterGeo = trackGeo(new THREE.SphereGeometry(0.112, 16, 14));
  const earInnerGeo = trackGeo(new THREE.SphereGeometry(0.068, 14, 10));
  ([-1, 1] as const).forEach((side) => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.372, 0.26, 0.028);
    earGroup.rotation.set(0.04, side * -0.16, side * -0.2);

    const earOuter = new THREE.Mesh(earOuterGeo, matBlueSkin);
    earOuter.scale.set(0.66, 1.08, 0.72);
    earOuter.castShadow = true;
    earGroup.add(earOuter);

    const earInner = new THREE.Mesh(earInnerGeo, matEarInner);
    earInner.scale.set(0.56, 0.94, 0.42);
    earInner.position.set(side * 0.008, -0.004, 0.056);
    earGroup.add(earInner);

    headGroup.add(earGroup);
  });

  // Two short, smooth curved light-blue horns clearly visible flanking the goggles in Front & 3/4 views
  const hornTipGeo = trackGeo(new THREE.SphereGeometry(0.02, 10, 8));
  ([-1, 1] as const).forEach((side) => {
    const hornPts = [
      new THREE.Vector3(side * 0.205, 0.445, 0.045),
      new THREE.Vector3(side * 0.268, 0.565, 0.03),
      new THREE.Vector3(side * 0.228, 0.688, 0.0),
    ];
    const hornCurve = new THREE.CatmullRomCurve3(hornPts);
    const hornGeo = trackGeo(new THREE.TubeGeometry(hornCurve, 14, 0.05, 12, false));
    const hPos = hornGeo.attributes.position;
    const ringStride = 13;
    const hCenter = new THREE.Vector3();
    for (let s = 0; s <= 14; s++) {
      const t = s / 14;
      hornCurve.getPointAt(t, hCenter);
      const shrink = 1 - t * 0.6;
      for (let rIdx = 0; rIdx < ringStride; rIdx++) {
        const idx = s * ringStride + rIdx;
        hPos.setXYZ(
          idx,
          hCenter.x + (hPos.getX(idx) - hCenter.x) * shrink,
          hCenter.y + (hPos.getY(idx) - hCenter.y) * shrink,
          hCenter.z + (hPos.getZ(idx) - hCenter.z) * shrink,
        );
      }
    }
    hornGeo.computeVertexNormals();
    const horn = new THREE.Mesh(hornGeo, matBlueHorn);
    horn.castShadow = true;
    headGroup.add(horn);

    // Smooth rounded horn tip cap
    const tipCap = new THREE.Mesh(hornTipGeo, matBlueHorn);
    tipCap.position.copy(hornPts[2]);
    headGroup.add(tipCap);
  });

  // --- WIDE SCULPTED BLUE FACE & ICONIC ABSURD LOFI EXPRESSION (facing local +Z) ---
  // 1. Wide sculpted blue upper face plate framing the eyes
  const faceUpperPlate = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.245, 24, 18)),
    matFaceBlueLight,
  );
  faceUpperPlate.scale.set(1.16, 0.72, 0.58);
  faceUpperPlate.position.set(0, 0.275, 0.208);
  headGroup.add(faceUpperPlate);

  // 2. Broad, plush protruding blue muzzle & cheeks (wider than upper brow, iconic Yeti silhouette!)
  const muzzleBase = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.255, 24, 18)),
    matFaceBlueLight,
  );
  muzzleBase.scale.set(1.22, 0.62, 0.68);
  muzzleBase.position.set(0, 0.145, 0.222);
  headGroup.add(muzzleBase);

  // Subtle sculpted blue cheek pads filling out the wide horizontal jaw in 3/4 view
  const cheekPadGeo = trackGeo(new THREE.SphereGeometry(0.115, 16, 12));
  ([-1, 1] as const).forEach((side) => {
    const cheekPad = new THREE.Mesh(cheekPadGeo, matFaceBlueLight);
    cheekPad.scale.set(1.16, 0.82, 0.78);
    cheekPad.position.set(side * 0.198, 0.155, 0.255);
    headGroup.add(cheekPad);
  });

  // 3. Large Half-Sleepy Deadpan Eyes + Double-Arched Blue Brow Hoods
  const scleraGeo = trackGeo(new THREE.SphereGeometry(0.088, 22, 16));
  const pupilGeo = trackGeo(new THREE.SphereGeometry(0.044, 16, 12));
  const catchlightGeo = trackGeo(new THREE.SphereGeometry(0.0085, 10, 8));
  const upperLidDomeGeo = trackGeo(
    new THREE.SphereGeometry(0.095, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
  );

  ([-1, 1] as const).forEach((side) => {
    const eyeCenterX = side * 0.098;
    const eyeCenterY = 0.278;
    const eyeCenterZ = 0.312;

    // Puffy arched blue brow hood sitting snugly right beneath the goggles
    const browArcGeo = createTaperedTubeGeo(
      [
        new THREE.Vector3(side * 0.008, 0.324, 0.354),
        new THREE.Vector3(side * 0.056, 0.354, 0.352),
        new THREE.Vector3(side * 0.125, 0.352, 0.336),
        new THREE.Vector3(side * 0.192, 0.324, 0.298),
      ],
      0.032,
      14,
      10,
      0.42,
      0.78,
      0.92,
    );
    const browArc = new THREE.Mesh(browArcGeo, matBlueSkin);
    headGroup.add(browArc);

    // Subtle dark crease separating arched brow from heavy upper lid
    const browFoldGeo = createTaperedTubeGeo(
      [
        new THREE.Vector3(side * 0.012, 0.31, 0.366),
        new THREE.Vector3(side * 0.075, 0.332, 0.364),
        new THREE.Vector3(side * 0.152, 0.324, 0.344),
        new THREE.Vector3(side * 0.195, 0.304, 0.312),
      ],
      0.0055,
      12,
      8,
      0.45,
    );
    headGroup.add(new THREE.Mesh(browFoldGeo, matFaceCrease));

    // Wide horizontal almond-oval white sclera
    const sclera = new THREE.Mesh(scleraGeo, matEyeWhite);
    sclera.scale.set(1.18, 0.8, 0.44);
    sclera.position.set(eyeCenterX, eyeCenterY, eyeCenterZ);
    sclera.rotation.y = side * 0.18;
    headGroup.add(sclera);

    // Glossy dark pupil tucked high right up under the heavy half-closed eyelid
    const pupil = new THREE.Mesh(pupilGeo, matEyePupil);
    pupil.scale.set(1.05, 0.96, 0.42);
    pupil.position.set(side * 0.094, 0.281, 0.346);
    pupil.rotation.y = side * 0.16;
    headGroup.add(pupil);

    // Tiny subtle specular catchlight (stays deadpan, never cutesy)
    const glint = new THREE.Mesh(catchlightGeo, matEyeHighlight);
    glint.scale.set(1.0, 0.85, 0.5);
    glint.position.set(side * 0.094 - 0.016, 0.279, 0.365);
    headGroup.add(glint);

    // Heavy blue sculpted half-closed upper eyelid slicing cleanly across the top ~44% of eye & pupil
    const lid = new THREE.Mesh(upperLidDomeGeo, matBlueSkin);
    lid.scale.set(1.22, 0.82, 0.54);
    lid.position.set(eyeCenterX, eyeCenterY + 0.012, eyeCenterZ + 0.006);
    lid.rotation.set(0.2, side * 0.18, side * -0.05);
    headGroup.add(lid);

    // Crisp dark horizontal-curved heavy upper eyelid rim (defines the unmistakable sleepy deadpan stare!)
    const upperLidRimGeo = createTaperedTubeGeo(
      [
        new THREE.Vector3(side * 0.01, 0.298, 0.364),
        new THREE.Vector3(side * 0.074, 0.301, 0.368),
        new THREE.Vector3(side * 0.142, 0.295, 0.354),
        new THREE.Vector3(side * 0.194, 0.282, 0.318),
      ],
      0.0085,
      14,
      8,
      0.32,
    );
    headGroup.add(new THREE.Mesh(upperLidRimGeo, matFaceCrease));

    // Crisp thinner dark lower eye outline + soft blue lower lid cushion
    const lowerLidRimGeo = createTaperedTubeGeo(
      [
        new THREE.Vector3(side * 0.015, 0.252, 0.36),
        new THREE.Vector3(side * 0.086, 0.234, 0.364),
        new THREE.Vector3(side * 0.155, 0.242, 0.348),
        new THREE.Vector3(side * 0.192, 0.267, 0.318),
      ],
      0.0052,
      12,
      8,
      0.35,
    );
    headGroup.add(new THREE.Mesh(lowerLidRimGeo, matFaceCrease));

    const lowerLidBagGeo = createTaperedTubeGeo(
      [
        new THREE.Vector3(side * 0.02, 0.242, 0.354),
        new THREE.Vector3(side * 0.092, 0.225, 0.356),
        new THREE.Vector3(side * 0.162, 0.234, 0.338),
      ],
      0.014,
      10,
      8,
      0.55,
      0.75,
    );
    headGroup.add(new THREE.Mesh(lowerLidBagGeo, matBlueSkin));
  });

  // 4. Broad Flat Blue Nose Mound + Twin Crisp Dark Oval Nostrils
  const noseMound = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.068, 16, 12)),
    matBlueSkin,
  );
  noseMound.scale.set(1.38, 0.58, 0.72);
  noseMound.position.set(0, 0.206, 0.355);
  headGroup.add(noseMound);

  const nostrilGeo = trackGeo(new THREE.SphereGeometry(0.017, 10, 8));
  ([-1, 1] as const).forEach((side) => {
    const nostril = new THREE.Mesh(nostrilGeo, matFaceCrease);
    nostril.scale.set(1.22, 0.72, 0.55);
    nostril.position.set(side * 0.032, 0.2, 0.398);
    nostril.rotation.set(0.1, side * 0.18, side * -0.24);
    headGroup.add(nostril);
  });

  // 5. Iconic Wide, Wavy, Pouty Sky-Blue Lips with Crisp Dark Horizontal-Wavy Mouth Seam
  // Wide sculpted clay squiggle-pout curving naturally around the protruding blue muzzle
  const upperLipGeo = createTaperedTubeGeo(
    [
      new THREE.Vector3(-0.188, 0.128, 0.326),
      new THREE.Vector3(-0.132, 0.144, 0.364),
      new THREE.Vector3(-0.064, 0.157, 0.388),
      new THREE.Vector3(0.0, 0.146, 0.396),
      new THREE.Vector3(0.064, 0.157, 0.388),
      new THREE.Vector3(0.132, 0.144, 0.364),
      new THREE.Vector3(0.188, 0.128, 0.326),
    ],
    0.026,
    24,
    10,
    0.34,
    0.84,
    0.94,
  );
  headGroup.add(new THREE.Mesh(upperLipGeo, matBlueSkin));

  const mouthSeamGeo = createTaperedTubeGeo(
    [
      new THREE.Vector3(-0.19, 0.122, 0.338),
      new THREE.Vector3(-0.132, 0.127, 0.378),
      new THREE.Vector3(-0.062, 0.138, 0.402),
      new THREE.Vector3(0.0, 0.132, 0.412),
      new THREE.Vector3(0.062, 0.138, 0.402),
      new THREE.Vector3(0.132, 0.127, 0.378),
      new THREE.Vector3(0.19, 0.122, 0.338),
    ],
    0.007,
    24,
    8,
    0.34,
  );
  headGroup.add(new THREE.Mesh(mouthSeamGeo, matFaceCrease));

  const lowerLipGeo = createTaperedTubeGeo(
    [
      new THREE.Vector3(-0.178, 0.118, 0.326),
      new THREE.Vector3(-0.118, 0.112, 0.364),
      new THREE.Vector3(-0.054, 0.11, 0.386),
      new THREE.Vector3(0.0, 0.108, 0.394),
      new THREE.Vector3(0.054, 0.11, 0.386),
      new THREE.Vector3(0.118, 0.112, 0.364),
      new THREE.Vector3(0.178, 0.118, 0.326),
    ],
    0.025,
    24,
    10,
    0.4,
    0.86,
    0.96,
  );
  headGroup.add(new THREE.Mesh(lowerLipGeo, matBlueSkin));

  // Subtle under-lip shadow crease separating lower pout from blue chin
  const chinCreaseGeo = createTaperedTubeGeo(
    [
      new THREE.Vector3(-0.12, 0.092, 0.364),
      new THREE.Vector3(0.0, 0.085, 0.395),
      new THREE.Vector3(0.12, 0.092, 0.364),
    ],
    0.0052,
    14,
    8,
    0.55,
  );
  headGroup.add(new THREE.Mesh(chinCreaseGeo, matEarInner));

  // --- Forehead Goggles (same orange-frame & dark-navy lens style, softly curved & cleanly layered) ---
  const goggleGroup = new THREE.Group();
  goggleGroup.position.set(0, 0.402, 0.015);
  goggleGroup.rotation.x = -0.34;
  headGroup.add(goggleGroup);

  // Navy & orange-trimmed goggle strap hugging the head snugly (signature rear silhouette, zero side gap!)
  const strapBand = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.346, 0.036, 10, 28)),
    matNavyTrim,
  );
  strapBand.rotation.x = Math.PI / 2;
  strapBand.scale.set(0.97, 1.0, 1.05);
  goggleGroup.add(strapBand);

  const strapTrimTop = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.351, 0.012, 8, 28)),
    matGoggleFrame,
  );
  strapTrimTop.rotation.x = Math.PI / 2;
  strapTrimTop.scale.set(0.97, 1.0, 1.05);
  strapTrimTop.position.y = 0.03;
  goggleGroup.add(strapTrimTop);

  const strapTrimBot = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.351, 0.012, 8, 28)),
    matGoggleFrame,
  );
  strapTrimBot.rotation.x = Math.PI / 2;
  strapTrimBot.scale.set(0.97, 1.0, 1.05);
  strapTrimBot.position.y = -0.03;
  goggleGroup.add(strapTrimBot);

  // Helper to build a softly curved forehead-hugging snowboard goggle silhouette with center nose-bridge notch
  const createCurvedGoggleGeo = (
    halfW: number,
    halfH: number,
    notchH: number,
    depth: number,
    bevel: number,
    wrapRadius: number,
  ) => {
    const s = new THREE.Shape();
    s.moveTo(-halfW + 0.072, halfH);
    s.quadraticCurveTo(0, halfH + 0.018, halfW - 0.072, halfH);
    s.quadraticCurveTo(halfW, halfH, halfW, 0);
    s.quadraticCurveTo(halfW, -halfH, halfW - 0.072, -halfH);
    s.lineTo(0.056, -halfH);
    s.quadraticCurveTo(0, -halfH + notchH, -0.056, -halfH);
    s.lineTo(-halfW + 0.072, -halfH);
    s.quadraticCurveTo(-halfW, -halfH, -halfW, 0);
    s.quadraticCurveTo(-halfW, halfH, -halfW + 0.072, halfH);

    const geo = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 14,
    });
    geo.translate(0, 0, -depth * 0.5);

    // Bend smoothly around forehead curvature along X -> Z
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const dropZ = (vx * vx) / (2 * wrapRadius);
      pos.setZ(i, vz - dropZ);
    }
    geo.computeVertexNormals();
    return trackGeo(geo);
  };

  // Frame front face sits at z = 0.334 + 0.026 + 0.016 = 0.376
  const goggleFrame = new THREE.Mesh(
    createCurvedGoggleGeo(0.205, 0.074, 0.044, 0.052, 0.016, 0.42),
    matGoggleFrame,
  );
  goggleFrame.position.set(0, 0.018, 0.334);
  goggleFrame.castShadow = true;
  goggleGroup.add(goggleFrame);

  // Glossy navy lens front face sits clearly proud at z = 0.372 + 0.018 + 0.008 = 0.398 (zero Z-fighting!)
  const goggleLens = new THREE.Mesh(
    createCurvedGoggleGeo(0.172, 0.052, 0.036, 0.036, 0.008, 0.42),
    matGoggleLens,
  );
  goggleLens.position.set(0, 0.018, 0.372);
  goggleGroup.add(goggleLens);

  // --- Animation & Feedback State ---
  const _flashColor = new THREE.Color(0xff9b54);
  const _blackColor = new THREE.Color(0x000000);
  let smoothBrakeYawDir = 1;

  const update: LofiCharacterRig['update'] = ({
    dt,
    time,
    lean,
    speedRatio,
    hitFlashTimer,
    invulnTimer,
    isTitleIdle,
    heightAboveGround = 0,
    jumpState = 'GROUNDED',
    landingProgress = 0,
    rampPitch = 0,
    grabAmount = 0,
    grabStyle = 'INDY',
    brakeAmount = 0,
    victoryPoseAmount = 0,
    gameoverBurialAmount = 0,
    neutralInspect = false,
  }) => {
    // --- DEV-ONLY STATIC NEUTRAL POSE (strictly for model inspection; zero animation) ---
    if (neutralInspect) {
      contactShadow.position.set(0, 0.025, 0);
      contactShadow.scale.set(1.05, 0.85, 1);
      matShadow.opacity = 0.45;

      // Face squarely toward +Z with boots symmetrically side-by-side and board flat underneath
      boardAssembly.position.set(0, 0, 0);
      boardAssembly.rotation.set(0, -Math.PI / 2, 0, 'YXZ');
      boardMesh.position.set(0, 0.07, 0);
      boardMesh.rotation.set(0, 0, 0);

      riderPivot.position.set(0, 0.34, 0);
      riderPivot.scale.set(1, 1, 1);
      frontShin.rotation.z = 0;
      backShin.rotation.z = 0;
      frontThigh.rotation.z = 0;
      backThigh.rotation.z = 0;

      // Cancel boardAssembly -PI/2 so torso & head point strictly straight toward +Z
      torsoGroup.rotation.set(0, Math.PI / 2, 0);
      leftArm.rotation.set(0, 0, -0.26);
      rightArm.rotation.set(0, 0, 0.26);
      headGroup.rotation.set(0, 0, 0);

      for (let i = 0; i < flashMaterials.length; i++) {
        flashMaterials[i].emissive.copy(_blackColor);
      }
      boardAssembly.visible = true;
      return;
    }

    const isAirborne = jumpState === 'AIRBORNE';
    const grab = Math.max(0, Math.min(1, grabAmount));
    const vic = Math.max(0, Math.min(1, victoryPoseAmount));
    const vicEase = vic * vic * (3 - 2 * vic);
    const buried = Math.max(0, Math.min(1, gameoverBurialAmount));
    const buriedEase = 1 - Math.pow(1 - buried, 3);
    const landingSquash =
      jumpState === 'LANDING' ? Math.sin(Math.min(1, landingProgress) * Math.PI) : 0;

    // 1. Contact shadow stays planted on the snow surface, softening subtly as Lofi rises into the air
    const shadowScale = 1 / (1 + heightAboveGround * 0.2);
    contactShadow.position.set(0, 0.025, 0.05);
    contactShadow.scale.set(0.82 * shadowScale, 1.38 * shadowScale, 1);
    matShadow.opacity =
      buriedEase > 0.1
        ? 0.22 * (1 - buriedEase * 0.65)
        : Math.max(0.18, 0.62 / (1 + heightAboveGround * 0.28));

    // --- SPECIAL OUTCOME POSES (keeps exact same approved Lofi model, clothing & deadpan face!) ---
    if (vicEase > 0.001) {
      // Rotate boardAssembly by -90° so boots stand cleanly side-by-side facing camera (+Z)
      boardAssembly.position.y = 0;
      boardAssembly.rotation.set(0, -(Math.PI / 2) * vicEase, 0, 'YXZ');

      // Plant snowboard upright beside Lofi's hand (local -Z maps to world +X under -PI/2 Y-rot)
      boardMesh.position.set(
        vicEase * 0.14,
        0.07 + vicEase * 0.96,
        vicEase * -0.84,
      );
      boardMesh.rotation.set(
        vicEase * (Math.PI / 2),
        vicEase * (Math.PI / 2),
        vicEase * -0.07,
      );

      // Smoothly turn torso & head to face camera (+Z) with classic deadpan chill expression
      const breathe = Math.sin(time * 2.6) * 0.018;
      riderPivot.position.y = 0.34 + breathe;
      riderPivot.scale.set(1, 1, 1);

      frontShin.rotation.z = -0.22 * (1 - vicEase);
      backShin.rotation.z = -0.22 * (1 - vicEase);
      frontThigh.rotation.z = 0.18 * (1 - vicEase);
      backThigh.rotation.z = 0.18 * (1 - vicEase);

      // Compensate boardAssembly's -PI/2 so torsoGroup +Z points straight toward camera (+Z)
      torsoGroup.rotation.y = 1.92 * (1 - vicEase) + (Math.PI / 2) * vicEase;
      torsoGroup.rotation.z = Math.sin(time * 2.2) * 0.03 * vicEase;
      torsoGroup.rotation.x = 0.04 * (1 - vicEase);

      // Raise one arm (screen-left) calmly in triumph while right hand steadies the upright snowboard
      const gentlePump = Math.sin(time * 3.8) * 0.11 * vicEase;
      leftArm.rotation.z = -0.34 * (1 - vicEase) + (-2.08 + gentlePump) * vicEase;
      leftArm.rotation.x = -0.14 * (1 - vicEase) + 0.12 * vicEase;
      rightArm.rotation.z = 0.36 * (1 - vicEase) + 0.24 * vicEase;
      rightArm.rotation.x = 0.12 * (1 - vicEase) + 0.22 * vicEase;

      // Keep deadpan face calmly facing camera with slight satisfied nod
      headGroup.rotation.y = 1.18 * (1 - vicEase);
      headGroup.rotation.z = Math.sin(time * 2.0) * 0.035 * vicEase;
      headGroup.rotation.x = -0.04 * vicEase;

      for (let i = 0; i < flashMaterials.length; i++) {
        flashMaterials[i].emissive.copy(_blackColor);
      }
      boardAssembly.visible = true;
      return;
    }

    if (buriedEase > 0.001) {
      boardAssembly.position.y = 0;
      boardAssembly.rotation.set(0, 0, 0, 'YXZ');

      // Snowboard sticks playfully tilted out of the snow drift right beside Lofi
      boardMesh.position.set(
        -1.02 * buriedEase,
        0.07 + 0.94 * buriedEase,
        0.04 * buriedEase,
      );
      boardMesh.rotation.set(
        (Math.PI / 2 - 0.14) * buriedEase,
        0.16 * buriedEase,
        0.26 * buriedEase,
      );

      // Waist-deep cartoon snow mound: lower legs/boots tuck cleanly inside the snow drift while full puffer jacket & deadpan face stay 100% clear
      const sigh = Math.sin(time * 2.0) * 0.014;
      riderPivot.position.y = 0.34 - 0.13 * buriedEase + sigh;
      riderPivot.scale.set(1, 1, 1);

      frontShin.rotation.z = -0.08;
      backShin.rotation.z = -0.08;
      frontThigh.rotation.z = 0.06;
      backThigh.rotation.z = 0.06;

      // Turn squarely to face camera (+Z) with resigned, absurd deadpan posture
      torsoGroup.rotation.y = 1.92 * (1 - buriedEase);
      torsoGroup.rotation.z = Math.sin(time * 1.4) * 0.025 * buriedEase;
      torsoGroup.rotation.x = 0.06 * buriedEase;

      // Resigned comic "welp" arms slumped slightly outward over the snow mound
      leftArm.rotation.z = -0.34 * (1 - buriedEase) + -0.3 * buriedEase;
      leftArm.rotation.x = 0.14 * buriedEase;
      rightArm.rotation.z = 0.36 * (1 - buriedEase) + 0.3 * buriedEase;
      rightArm.rotation.x = 0.14 * buriedEase;

      headGroup.rotation.y = 1.18 * (1 - buriedEase);
      headGroup.rotation.z = (0.055 + Math.sin(time * 1.5) * 0.035) * buriedEase;
      headGroup.rotation.x = 0.05 * buriedEase;

      for (let i = 0; i < flashMaterials.length; i++) {
        flashMaterials[i].emissive.copy(_blackColor);
      }
      boardAssembly.visible = true;
      return;
    }

    // --- STANDARD GAMEPLAY SNOWBOARDING POSE (+ subtle speed-check braking crouch) ---
    boardMesh.position.set(0, 0.07, 0);
    boardMesh.rotation.set(0, 0, 0);

    const brake = isAirborne ? 0 : Math.max(0, Math.min(1, brakeAmount));

    // 2. Vertical lift of snowboard + rider above snow (real vertical jump, plus subtle tuck during Grab)
    boardAssembly.position.y = heightAboveGround + grab * 0.14;

    // Board carving yaw, smooth sideways speed-check while braking (~25 deg), edge roll, & pitch (+ subtle grab style tweak)
    const grabStyleYaw =
      grabStyle === 'METHOD' ? 0.24 : grabStyle === 'TAIL' ? -0.18 : grabStyle === 'NOSE' ? 0.12 : 0.14;
    const grabStyleRoll =
      grabStyle === 'METHOD' ? 0.34 : grabStyle === 'TAIL' ? 0.2 : grabStyle === 'NOSE' ? -0.2 : 0.26;
    const grabStylePitch =
      grabStyle === 'TAIL' ? 0.24 : grabStyle === 'NOSE' ? -0.16 : grabStyle === 'METHOD' ? 0.18 : 0.14;
    const targetBrakeYawDir = lean > 0.18 ? -1 : 1;
    const brakeDirAlpha = dt > 0 ? 1 - Math.exp(-8.5 * dt) : 1;
    smoothBrakeYawDir += (targetBrakeYawDir - smoothBrakeYawDir) * brakeDirAlpha;
    const brakeYawDir = smoothBrakeYawDir;
    const targetBoardYaw =
      -lean * 0.28 +
      grab * grabStyleYaw +
      brake * STEEP_DESCENT_CONFIG.maxBrakeBoardYawRad * brakeYawDir;
    const targetBoardRoll = -lean * 0.24 + grab * grabStyleRoll - brake * 0.14 * brakeYawDir;
    const targetBoardPitch = rampPitch + grab * grabStylePitch;
    boardAssembly.rotation.set(targetBoardPitch, targetBoardYaw, targetBoardRoll, 'YXZ');

    // 3. Natural knee flex: snow absorption bob on ground, clean tuck during Grab, knee bend on Landing & Braking crouch
    const rideBob = isTitleIdle
      ? Math.sin(time * 2.1) * 0.022
      : isAirborne
        ? 0
        : Math.sin(time * (7.5 + speedRatio * 4.0)) * 0.028 * (0.4 + speedRatio * 0.6);
    const carveCrouch = isAirborne ? 0.04 : Math.abs(lean) * 0.055;
    const brakeCrouch = brake * 0.11;
    const grabTuck = grab * 0.16;
    const landCrouch = landingSquash * 0.15;
    riderPivot.position.y =
      0.34 - carveCrouch - brakeCrouch - grabTuck - landCrouch + rideBob;

    // Subtle knee bend response on shins/thighs during Grab tuck, Landing compression, & Braking crouch
    const kneeFlex = grab * 0.38 + landingSquash * 0.32 + brake * 0.28;
    frontShin.rotation.z = -0.22 - kneeFlex * 0.45;
    backShin.rotation.z = -0.22 - kneeFlex * 0.45;
    frontThigh.rotation.z = 0.18 + kneeFlex * 0.4;
    backThigh.rotation.z = 0.18 + kneeFlex * 0.4;

    // Torso & arms: distinct expressive snowboard grab choreography for INDY / METHOD / TAIL / NOSE
    const torsoTwistDelta =
      grabStyle === 'METHOD' ? 0.38 : grabStyle === 'TAIL' ? -0.24 : grabStyle === 'NOSE' ? 0.26 : 0.08;
    const torsoLeanZ =
      grabStyle === 'METHOD' ? 0.28 : grabStyle === 'TAIL' ? -0.18 : grabStyle === 'NOSE' ? 0.22 : 0.16;
    const torsoBendX =
      grabStyle === 'METHOD' ? 0.52 : grabStyle === 'NOSE' ? 0.56 : grabStyle === 'TAIL' ? 0.36 : 0.46;

    torsoGroup.rotation.y = 1.92 + grab * torsoTwistDelta;
    torsoGroup.rotation.z = -lean * 0.16 + grab * torsoLeanZ - brake * 0.08 * brakeYawDir;
    torsoGroup.rotation.x =
      0.06 + Math.abs(lean) * 0.08 + grab * torsoBendX + landingSquash * 0.22 + brake * 0.16;

    // Style-specific arm reach (one hand grabs rail/tail/nose, opposite arm throws out for stylish balance)
    const grabLeftArmZ =
      grabStyle === 'METHOD' ? 0.48 : grabStyle === 'NOSE' ? 0.54 : grabStyle === 'TAIL' ? -1.32 : -1.12;
    const grabLeftArmX =
      grabStyle === 'METHOD' ? 0.88 : grabStyle === 'NOSE' ? 1.04 : grabStyle === 'TAIL' ? -0.28 : -0.2;
    const grabRightArmZ =
      grabStyle === 'METHOD' ? 1.48 : grabStyle === 'NOSE' ? 1.24 : grabStyle === 'TAIL' ? -0.68 : -0.52;
    const grabRightArmX =
      grabStyle === 'METHOD' ? -0.34 : grabStyle === 'NOSE' ? -0.26 : grabStyle === 'TAIL' ? 1.05 : 0.94;

    const baseLeftZ = -0.34 - lean * 0.28 - brake * 0.16 + Math.sin(time * 2.4) * 0.04;
    const baseRightZ = 0.36 - lean * 0.24 + brake * 0.16 - Math.sin(time * 2.4) * 0.04;
    leftArm.rotation.z = baseLeftZ * (1 - grab) + grabLeftArmZ * grab - landingSquash * 0.18;
    leftArm.rotation.x = grab * grabLeftArmX + brake * 0.08;
    rightArm.rotation.z = baseRightZ * (1 - grab) + grabRightArmZ * grab + landingSquash * 0.18;
    rightArm.rotation.x = grab * grabRightArmX + brake * 0.08;

    // Head stays calmly looking downhill while counter-stabilizing slightly
    headGroup.rotation.y = 1.18 - lean * 0.15 - grab * (0.12 + torsoTwistDelta * 0.4) - brake * 0.22 * brakeYawDir;
    headGroup.rotation.z = lean * 0.08 - grab * 0.1;
    headGroup.rotation.x = -grab * 0.24 - brake * 0.06;

    // 4. Visual hit flash, landing squash, & subtle invulnerability blink
    if (hitFlashTimer > 0) {
      const pulse = Math.min(1, hitFlashTimer / 0.22);
      for (let i = 0; i < flashMaterials.length; i++) {
        flashMaterials[i].emissive.copy(_flashColor).multiplyScalar(pulse * 0.65);
      }
      riderPivot.scale.set(1 + pulse * 0.06, 1 - pulse * 0.08, 1 + pulse * 0.06);
    } else {
      for (let i = 0; i < flashMaterials.length; i++) {
        flashMaterials[i].emissive.copy(_blackColor);
      }
      const sqY = 1 - landingSquash * 0.1;
      const sqXZ = 1 + landingSquash * 0.05;
      riderPivot.scale.set(sqXZ, sqY, sqXZ);
    }

    // Subtle visibility blink during recovery invulnerability so player clearly reads brief grace period
    if (invulnTimer > 0 && hitFlashTimer <= 0) {
      const blinkOn = Math.floor(invulnTimer * 14) % 2 === 0;
      boardAssembly.visible = blinkOn;
    } else {
      boardAssembly.visible = true;
    }
  };

  const dispose = () => {
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return { root, update, dispose };
}
