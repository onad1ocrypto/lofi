import * as THREE from 'three';
import { evaluateRampDeckHeight } from './simulation';
import { getGroundHeightAt, getTrackCenterX } from './trackData';
import type { TrackRamp } from './types';

export interface RampSystem {
  syncRamps: (ramps: readonly TrackRamp[]) => void;
  dispose: () => void;
}

/**
 * Procedural top-deck texture for alpine snow ramps:
 * Crisp packed white snow with subtle longitudinal ski-park corduroy tracks,
 * a high-contrast warm orange & navy takeoff lip warning stripe so players spot jumps early,
 * and subtle chevron guides pointing cleanly over the lip.
 */
function createRampDeckTexture(
  kind: TrackRamp['kind'],
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Clean bright snow deck
  ctx.fillStyle = '#f2f7ff';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle side framing borders so the ramp edges read distinctly against the track snow
  ctx.fillStyle = '#cadbf5';
  ctx.fillRect(0, 0, 14, 256);
  ctx.fillRect(242, 0, 14, 256);

  // Subtle groomed corduroy streaks
  ctx.fillStyle = 'rgba(176, 198, 232, 0.28)';
  for (let x = 24; x < 232; x += 16) {
    ctx.fillRect(x, 0, 4, 256);
  }

  // Upward-pointing ski-park chevrons (v=0 is entry bottom, v=1 is takeoff lip top)
  const chevronColor = kind === 'bonus' ? '#f59e0b' : '#df722d';
  const drawChevron = (yCenter: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = chevronColor;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(64, yCenter + 22);
    ctx.lineTo(128, yCenter - 16);
    ctx.lineTo(192, yCenter + 22);
    ctx.stroke();
    ctx.restore();
  };

  drawChevron(168, 0.38);
  drawChevron(108, 0.62);
  if (kind === 'bonus') {
    drawChevron(62, 0.85);
  }

  // Bold snow-park takeoff lip bar near y = 0..28 (canvas top corresponds to UV v = 1 -> ramp lip!)
  ctx.fillStyle = '#1e2849';
  ctx.fillRect(0, 0, 256, 28);

  // High-contrast orange/gold safety stripes along the lip
  ctx.fillStyle = kind === 'bonus' ? '#ffb732' : '#ef792f';
  for (let sx = -24; sx < 280; sx += 36) {
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx + 18, 0);
    ctx.lineTo(sx + 4, 28);
    ctx.lineTo(sx - 14, 28);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/**
 * Build a solid terrain-conforming 3D snow ramp geometry whose top deck height
 * matches `evaluateRampDeckHeight(ramp, t)` identically and whose skirt anchors
 * deeply below the snow surface so zero floating gaps appear on curves or slopes.
 */
function buildRampMeshGeometry(ramp: TrackRamp): {
  topGeo: THREE.BufferGeometry;
  sideGeo: THREE.BufferGeometry;
} {
  const segsZ = 14;
  const segsX = 6;
  const halfW = ramp.width * 0.5;
  const skirtHalfW = halfW + 0.85; // Soft sloped snow cheeks flanking the ramp
  const embedDepth = 0.9;

  // 1. Top playable deck mesh (width = ramp.width, follows track curve & elevation)
  const topPositions: number[] = [];
  const topUvs: number[] = [];
  const topIndices: number[] = [];

  for (let iz = 0; iz <= segsZ; iz++) {
    const tz = iz / segsZ;
    const distZ = ramp.zStart + tz * ramp.length;
    const centerX = getTrackCenterX(distZ) + ramp.offsetX;
    const deckLift = evaluateRampDeckHeight(ramp, tz);

    for (let ix = 0; ix <= segsX; ix++) {
      const tx = ix / segsX;
      const localX = (tx - 0.5) * ramp.width;
      const worldX = centerX + localX;
      const groundY = getGroundHeightAt(worldX, distZ);
      // Slight subtle crown across deck for rounded toy-like alpine look
      const edgeT = Math.abs(tx - 0.5) * 2;
      const crown = (1 - edgeT * edgeT) * 0.04;

      topPositions.push(worldX, groundY + deckLift + crown + 0.03, -distZ);
      // UV v=0 at entry (tz=0) -> v=1 at takeoff lip (tz=1)
      topUvs.push(tx, tz);
    }
  }

  const stride = segsX + 1;
  for (let iz = 0; iz < segsZ; iz++) {
    for (let ix = 0; ix < segsX; ix++) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = (iz + 1) * stride + ix;
      const d = c + 1;
      // Top face pointing +Y (since worldZ decreases as iz increases)
      topIndices.push(a, b, c);
      topIndices.push(b, d, c);
    }
  }

  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPositions, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUvs, 2));
  topGeo.setIndex(topIndices);
  topGeo.computeVertexNormals();

  // 2. Solid packed-snow sides (left cheek, right cheek, and vertical back face under the lip)
  const sidePositions: number[] = [];
  const sideIndices: number[] = [];

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
  ) => {
    const base = sidePositions.length / 3;
    sidePositions.push(...p0, ...p1, ...p2, ...p3);
    sideIndices.push(base, base + 1, base + 2);
    sideIndices.push(base + 1, base + 3, base + 2);
  };

  for (let iz = 0; iz < segsZ; iz++) {
    const t0 = iz / segsZ;
    const t1 = (iz + 1) / segsZ;
    const z0 = ramp.zStart + t0 * ramp.length;
    const z1 = ramp.zStart + t1 * ramp.length;
    const cx0 = getTrackCenterX(z0) + ramp.offsetX;
    const cx1 = getTrackCenterX(z1) + ramp.offsetX;
    const h0 = evaluateRampDeckHeight(ramp, t0) + 0.03;
    const h1 = evaluateRampDeckHeight(ramp, t1) + 0.03;

    // Left snow bank cheek (outward normal pointing -X/+Y)
    const lxTop0 = cx0 - halfW;
    const lxTop1 = cx1 - halfW;
    const lxBot0 = cx0 - skirtHalfW;
    const lxBot1 = cx1 - skirtHalfW;
    pushQuad(
      [lxBot0, getGroundHeightAt(lxBot0, z0) - embedDepth, -z0],
      [lxTop0, getGroundHeightAt(lxTop0, z0) + h0, -z0],
      [lxBot1, getGroundHeightAt(lxBot1, z1) - embedDepth, -z1],
      [lxTop1, getGroundHeightAt(lxTop1, z1) + h1, -z1],
    );

    // Right snow bank cheek (outward normal pointing +X/+Y)
    const rxTop0 = cx0 + halfW;
    const rxTop1 = cx1 + halfW;
    const rxBot0 = cx0 + skirtHalfW;
    const rxBot1 = cx1 + skirtHalfW;
    pushQuad(
      [rxTop0, getGroundHeightAt(rxTop0, z0) + h0, -z0],
      [rxBot0, getGroundHeightAt(rxBot0, z0) - embedDepth, -z0],
      [rxTop1, getGroundHeightAt(rxTop1, z1) + h1, -z1],
      [rxBot1, getGroundHeightAt(rxBot1, z1) - embedDepth, -z1],
    );
  }

  // Vertical back drop-wall beneath the takeoff lip (so ramp looks solid from behind/landing view)
  const lipZ = ramp.zStart + ramp.length;
  const lipCx = getTrackCenterX(lipZ) + ramp.offsetX;
  const lipH = ramp.height + 0.03;
  for (let ix = 0; ix < segsX; ix++) {
    const tx0 = ix / segsX;
    const tx1 = (ix + 1) / segsX;
    const x0 = lipCx + (tx0 - 0.5) * ramp.width;
    const x1 = lipCx + (tx1 - 0.5) * ramp.width;
    const g0 = getGroundHeightAt(x0, lipZ);
    const g1 = getGroundHeightAt(x1, lipZ);
    pushQuad(
      [x0, g0 + lipH, -lipZ],
      [x1, g1 + lipH, -lipZ],
      [x0, g0 - embedDepth, -lipZ],
      [x1, g1 - embedDepth, -lipZ],
    );
  }

  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePositions, 3));
  sideGeo.setIndex(sideIndices);
  sideGeo.computeVertexNormals();

  return { topGeo, sideGeo };
}

/**
 * Reusable 3D Alpine Snow Ramp builder & sync manager.
 * Conforms every ramp cleanly to the active level's terrain curve & slope.
 */
export function createRampSystem(
  scene: THREE.Scene,
  maxAnisotropy = 4,
): RampSystem {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'AlpineRampsGroup';
  scene.add(rootGroup);

  const sharedDisposables: Array<{ dispose: () => void }> = [];
  let dynamicGeos: THREE.BufferGeometry[] = [];

  const texSmall = createRampDeckTexture('small', maxAnisotropy);
  const texBonus = createRampDeckTexture('bonus', maxAnisotropy);
  sharedDisposables.push(texSmall, texBonus);

  const matDeckStandard = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texSmall,
    roughness: 0.72,
    metalness: 0.02,
  });
  const matDeckBonus = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texBonus,
    roughness: 0.68,
    metalness: 0.04,
  });
  const matSnowSide = new THREE.MeshStandardMaterial({
    color: 0xd4e4fa,
    roughness: 0.85,
    metalness: 0.02,
  });
  const matPostNavy = new THREE.MeshStandardMaterial({
    color: 0x1e2849,
    roughness: 0.65,
    metalness: 0.06,
  });
  const matFlagOrange = new THREE.MeshStandardMaterial({
    color: 0xef782e,
    roughness: 0.5,
    metalness: 0.04,
  });
  const matFlagGold = new THREE.MeshStandardMaterial({
    color: 0xf7b933,
    roughness: 0.44,
    metalness: 0.08,
  });

  const postGeo = new THREE.CylinderGeometry(0.085, 0.105, 1.55, 8);
  const capGeo = new THREE.SphereGeometry(0.145, 10, 8);
  const flagGeo = new THREE.BoxGeometry(0.68, 0.34, 0.05);
  const landingStakeGeo = new THREE.CylinderGeometry(0.065, 0.08, 1.05, 8);

  sharedDisposables.push(
    matDeckStandard,
    matDeckBonus,
    matSnowSide,
    matPostNavy,
    matFlagOrange,
    matFlagGold,
    postGeo,
    capGeo,
    flagGeo,
    landingStakeGeo,
  );

  const clearDynamicRamps = () => {
    while (rootGroup.children.length > 0) {
      rootGroup.remove(rootGroup.children[0]);
    }
    for (let i = 0; i < dynamicGeos.length; i++) {
      dynamicGeos[i].dispose();
    }
    dynamicGeos = [];
  };

  const syncRamps = (ramps: readonly TrackRamp[]) => {
    clearDynamicRamps();

    for (let i = 0; i < ramps.length; i++) {
      const ramp = ramps[i];
      const rampGroup = new THREE.Group();
      const { topGeo, sideGeo } = buildRampMeshGeometry(ramp);
      dynamicGeos.push(topGeo, sideGeo);

      const isBonus = ramp.kind === 'bonus';
      const topMesh = new THREE.Mesh(topGeo, isBonus ? matDeckBonus : matDeckStandard);
      topMesh.receiveShadow = true;
      topMesh.castShadow = true;
      rampGroup.add(topMesh);

      const sideMesh = new THREE.Mesh(sideGeo, matSnowSide);
      sideMesh.receiveShadow = true;
      sideMesh.castShadow = true;
      rampGroup.add(sideMesh);

      // Pair of crisp snow-park takeoff marker posts flanking the lip so player reads the jump early
      const lipZ = ramp.zStart + ramp.length;
      const lipCenterX = getTrackCenterX(lipZ) + ramp.offsetX;
      const markerMat = isBonus ? matFlagGold : matFlagOrange;

      for (const side of [-1, 1] as const) {
        const px = lipCenterX + side * (ramp.width * 0.5 + 0.55);
        const py = getGroundHeightAt(px, lipZ) + ramp.height * 0.58;

        const post = new THREE.Mesh(postGeo, matPostNavy);
        post.position.set(px, py + 0.65, -lipZ);
        post.castShadow = true;
        rampGroup.add(post);

        const cap = new THREE.Mesh(capGeo, markerMat);
        cap.position.set(px, py + 1.48, -lipZ);
        rampGroup.add(cap);

        const banner = new THREE.Mesh(flagGeo, markerMat);
        banner.position.set(px + side * 0.36, py + 1.18, -lipZ);
        banner.castShadow = true;
        rampGroup.add(banner);
      }

      // Pair of subtle entry guide stakes at the ramp base for clear line-up
      const entryCenterX = getTrackCenterX(ramp.zStart) + ramp.offsetX;
      for (const side of [-1, 1] as const) {
        const ex = entryCenterX + side * (ramp.width * 0.5 + 0.5);
        const ey = getGroundHeightAt(ex, ramp.zStart);
        const stake = new THREE.Mesh(landingStakeGeo, matPostNavy);
        stake.position.set(ex, ey + 0.45, -ramp.zStart);
        rampGroup.add(stake);

        const tip = new THREE.Mesh(capGeo, markerMat);
        tip.scale.setScalar(0.8);
        tip.position.set(ex, ey + 1.0, -ramp.zStart);
        rampGroup.add(tip);
      }

      // Subtle landing zone side markers ~24m past the lip so player visually sees the clean touchdown zone
      const landZ = lipZ + Math.min(26, ramp.landingClearMeters * 0.52);
      const landCenterX = getTrackCenterX(landZ) + ramp.offsetX;
      for (const side of [-1, 1] as const) {
        const lx = landCenterX + side * (ramp.width * 0.5 + 1.8);
        const ly = getGroundHeightAt(lx, landZ);
        const stake = new THREE.Mesh(landingStakeGeo, matPostNavy);
        stake.scale.setScalar(0.82);
        stake.position.set(lx, ly + 0.36, -landZ);
        rampGroup.add(stake);

        const tip = new THREE.Mesh(capGeo, matFlagOrange);
        tip.scale.setScalar(0.68);
        tip.position.set(lx, ly + 0.82, -landZ);
        rampGroup.add(tip);
      }

      rootGroup.add(rampGroup);
    }
  };

  const dispose = () => {
    clearDynamicRamps();
    scene.remove(rootGroup);
    for (let i = 0; i < sharedDisposables.length; i++) {
      sharedDisposables[i].dispose();
    }
  };

  return { syncRamps, dispose };
}
