import * as THREE from 'three';
import { COLLECTIBLE_CONFIG } from './collectibleLogic';
import type { LilYetiCollectible } from './types';

export interface LilYetiCollectibleSystem {
  syncCollectibles: (collectibles: readonly LilYetiCollectible[]) => void;
  update: (collectibles: readonly LilYetiCollectible[], time: number) => void;
  dispose: () => void;
}

interface CollectibleSlot {
  root: THREE.Group;
  groundDisc: THREE.Mesh;
  figurinePivot: THREE.Group;
  haloMesh: THREE.Mesh;
}

/** Soft radial golden-ice ground marker disc so collectibles align clearly with snow lanes. */
function createGroundGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 214, 98, 0.68)');
  grad.addColorStop(0.45, 'rgba(138, 206, 255, 0.36)');
  grad.addColorStop(1, 'rgba(138, 206, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Pooled 3D stylized 'Lil Yeti' collectible figurines along the snow path:
 * - Matches the exact palette & charm of Lil Yetis (white fur, sky-blue face/horns,
 *   purple puffer vest & forehead goggles, golden-yellow scarf) inside a gleaming
 *   golden snow-halo ring + soft ground indicator disc for high-speed downhill readability.
 * - Zero per-frame allocations; all geometries and materials are shared across the pool.
 */
export function createLilYetiCollectibleSystem(
  scene: THREE.Scene,
  capacity: number = COLLECTIBLE_CONFIG.maxCollectibles,
): LilYetiCollectibleSystem {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const glowTex = createGroundGlowTexture();
  disposables.push(glowTex);

  // Shared materials matching smallYetiCharacter.ts palette + radiant gold collectible rim
  const matFur = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f8ff,
      emissive: 0x263b5e,
      emissiveIntensity: 0.14,
      roughness: 0.84,
      metalness: 0.02,
    }),
  );
  const matBlueSkin = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5da9ee,
      emissive: 0x163862,
      emissiveIntensity: 0.14,
      roughness: 0.56,
      metalness: 0.04,
    }),
  );
  const matPurpleVest = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x743072,
      emissive: 0x2a0f2e,
      emissiveIntensity: 0.18,
      roughness: 0.52,
      metalness: 0.06,
    }),
  );
  const matGoldScarf = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf5b832,
      emissive: 0x5c3706,
      emissiveIntensity: 0.22,
      roughness: 0.45,
      metalness: 0.08,
    }),
  );
  const matDarkEye = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x161c2e,
      roughness: 0.22,
      metalness: 0.15,
    }),
  );
  const matHalo = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd15c,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.52,
      roughness: 0.28,
      metalness: 0.35,
    }),
  );
  const matGroundDisc = trackMat(
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );

  // Shared lightweight geometries
  const geoGroundDisc = trackGeo(new THREE.PlaneGeometry(2.15, 2.15));
  const geoHalo = trackGeo(new THREE.TorusGeometry(0.76, 0.065, 10, 24));
  const geoTorso = trackGeo(new THREE.SphereGeometry(0.35, 12, 10));
  const geoScarf = trackGeo(new THREE.TorusGeometry(0.27, 0.075, 8, 16));
  const geoHead = trackGeo(new THREE.SphereGeometry(0.32, 14, 12));
  const geoFace = trackGeo(new THREE.SphereGeometry(0.24, 12, 10));
  const geoHorn = trackGeo(new THREE.ConeGeometry(0.065, 0.19, 8));
  const geoEar = trackGeo(new THREE.SphereGeometry(0.08, 8, 8));
  const geoGoggleBand = trackGeo(new THREE.TorusGeometry(0.28, 0.045, 8, 16));
  const geoGoggleLens = trackGeo(new THREE.BoxGeometry(0.34, 0.12, 0.1));
  const geoEye = trackGeo(new THREE.SphereGeometry(0.042, 8, 8));
  const geoArm = trackGeo(new THREE.CapsuleGeometry(0.08, 0.18, 4, 8));

  const container = new THREE.Group();
  container.name = 'lil_yeti_collectibles';
  scene.add(container);

  const slots: CollectibleSlot[] = [];
  for (let i = 0; i < capacity; i++) {
    const root = new THREE.Group();
    root.visible = false;

    const groundDisc = new THREE.Mesh(geoGroundDisc, matGroundDisc);
    groundDisc.rotation.x = -Math.PI * 0.5;
    groundDisc.position.y = 0.05;
    root.add(groundDisc);

    const figurinePivot = new THREE.Group();
    root.add(figurinePivot);

    // Radiant golden ring framing the floating Lil Yeti figurine
    const haloMesh = new THREE.Mesh(geoHalo, matHalo);
    haloMesh.position.y = 0.05;
    figurinePivot.add(haloMesh);

    // Purple puffer vest torso
    const torso = new THREE.Mesh(geoTorso, matPurpleVest);
    torso.scale.set(1.06, 0.98, 0.94);
    torso.position.y = -0.22;
    figurinePivot.add(torso);

    // Golden-yellow scarf around collar
    const scarf = new THREE.Mesh(geoScarf, matGoldScarf);
    scarf.rotation.x = Math.PI * 0.5;
    scarf.position.y = 0.02;
    figurinePivot.add(scarf);

    // Yellow mini arms raised cheerfully
    const leftArm = new THREE.Mesh(geoArm, matGoldScarf);
    leftArm.position.set(-0.37, -0.14, 0.04);
    leftArm.rotation.z = 0.72;
    figurinePivot.add(leftArm);

    const rightArm = new THREE.Mesh(geoArm, matGoldScarf);
    rightArm.position.set(0.37, -0.14, 0.04);
    rightArm.rotation.z = -0.72;
    figurinePivot.add(rightArm);

    // Shaggy white Yeti head
    const head = new THREE.Mesh(geoHead, matFur);
    head.scale.set(1.06, 0.96, 0.98);
    head.position.y = 0.28;
    figurinePivot.add(head);

    // Sky-blue Yeti face oval facing slightly forward
    const face = new THREE.Mesh(geoFace, matBlueSkin);
    face.scale.set(1.0, 0.86, 0.72);
    face.position.set(0, 0.27, 0.16);
    figurinePivot.add(face);

    // Twin sky-blue ears
    const leftEar = new THREE.Mesh(geoEar, matBlueSkin);
    leftEar.position.set(-0.32, 0.28, 0.02);
    figurinePivot.add(leftEar);
    const rightEar = new THREE.Mesh(geoEar, matBlueSkin);
    rightEar.position.set(0.32, 0.28, 0.02);
    figurinePivot.add(rightEar);

    // Twin mini horns atop head
    const leftHorn = new THREE.Mesh(geoHorn, matBlueSkin);
    leftHorn.position.set(-0.18, 0.58, 0.02);
    leftHorn.rotation.z = 0.34;
    figurinePivot.add(leftHorn);
    const rightHorn = new THREE.Mesh(geoHorn, matBlueSkin);
    rightHorn.position.set(0.18, 0.58, 0.02);
    rightHorn.rotation.z = -0.34;
    figurinePivot.add(rightHorn);

    // Signature purple forehead goggles
    const goggleBand = new THREE.Mesh(geoGoggleBand, matPurpleVest);
    goggleBand.rotation.x = Math.PI * 0.5;
    goggleBand.position.set(0, 0.44, 0.02);
    figurinePivot.add(goggleBand);

    const goggleLens = new THREE.Mesh(geoGoggleLens, matDarkEye);
    goggleLens.position.set(0, 0.45, 0.25);
    figurinePivot.add(goggleLens);

    // Crisp glossy eyes
    const leftEye = new THREE.Mesh(geoEye, matDarkEye);
    leftEye.position.set(-0.085, 0.3, 0.32);
    figurinePivot.add(leftEye);
    const rightEye = new THREE.Mesh(geoEye, matDarkEye);
    rightEye.position.set(0.085, 0.3, 0.32);
    figurinePivot.add(rightEye);

    container.add(root);
    slots.push({
      root,
      groundDisc,
      figurinePivot,
      haloMesh,
    });
  }

  let activeCount = 0;

  const syncCollectibles = (collectibles: readonly LilYetiCollectible[]) => {
    activeCount = Math.min(collectibles.length, slots.length);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (i >= activeCount) {
        slot.root.visible = false;
        continue;
      }
      const item = collectibles[i];
      slot.root.position.set(item.worldX, item.worldY, -item.z);
      slot.root.visible = !(item.collected && item.collectAnimProgress >= 1);
      slot.figurinePivot.position.set(0, item.hoverHeight, 0);
      slot.figurinePivot.scale.setScalar(1);
      slot.groundDisc.visible = !item.collected;
    }
  };

  const update = (collectibles: readonly LilYetiCollectible[], time: number) => {
    const count = Math.min(collectibles.length, slots.length);
    for (let i = 0; i < count; i++) {
      const item = collectibles[i];
      const slot = slots[i];

      if (item.collected) {
        const p = item.collectAnimProgress;
        if (p >= 1) {
          slot.root.visible = false;
          continue;
        }
        slot.root.visible = true;
        slot.groundDisc.visible = false;
        // Snappy celebratory pop-up, spin & vanish
        const rise = p * 1.65;
        const scale = p < 0.32 ? 1 + (p / 0.32) * 0.38 : Math.max(0.01, 1.38 * (1 - (p - 0.32) / 0.68));
        slot.figurinePivot.position.y = item.hoverHeight + rise;
        slot.figurinePivot.rotation.y = time * COLLECTIBLE_CONFIG.spinSpeed + i * 0.9 + p * Math.PI * 3.5;
        slot.figurinePivot.scale.setScalar(scale);
        slot.haloMesh.rotation.x = p * Math.PI * 1.2;
        continue;
      }

      slot.root.visible = true;
      slot.groundDisc.visible = true;
      const phase = item.id * 0.85;
      const bob = Math.sin(time * COLLECTIBLE_CONFIG.bobSpeed + phase) * COLLECTIBLE_CONFIG.bobAmplitude;
      slot.figurinePivot.position.y = item.hoverHeight + bob;
      slot.figurinePivot.rotation.y = time * COLLECTIBLE_CONFIG.spinSpeed + phase;
      slot.figurinePivot.scale.setScalar(1);
      slot.haloMesh.rotation.x = Math.sin(time * 2.2 + phase) * 0.24;
      const discPulse = 0.92 + Math.sin(time * 3.4 + phase) * 0.1;
      slot.groundDisc.scale.setScalar(discPulse);
    }

    for (let i = count; i < slots.length; i++) {
      slots[i].root.visible = false;
    }
  };

  const dispose = () => {
    scene.remove(container);
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    syncCollectibles,
    update,
    dispose,
  };
}
