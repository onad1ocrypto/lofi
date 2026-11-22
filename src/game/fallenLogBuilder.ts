import * as THREE from 'three';
import { getGroundHeightAt, getTrackSlopeTangentX } from './trackData';
import type { TrackObstacle } from './types';

export interface FallenLogSystem {
  syncFallenLogs: (obstacles: readonly TrackObstacle[]) => void;
  dispose: () => void;
}

const MAX_FALLEN_LOGS = 8;

/**
 * Composite 3D Fallen Pine Log obstacle builder for Level 3+:
 * - Stretches cleanly across the full groomed snow road with zero floating ends.
 * - Multi-part rounded alpine visual language: tapered pine bark trunk, exposed pale cedar wood core,
 *   root flare stubs, thick sculpted snow cap along the top, low broken branch stubs, flanking pine
 *   boughs at the outer banks, and a soft grounded contact shadow so players spot it early & jump cleanly.
 */
export function createFallenLogSystem(scene: THREE.Scene): FallenLogSystem {
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // Shared materials with distinct roughness contrast matching the rounded alpine art direction
  const matBark = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c3a24,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  const matBarkDark = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x472b1a,
      roughness: 0.95,
      metalness: 0.0,
    }),
  );
  const matInnerWood = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdab484,
      roughness: 0.76,
      metalness: 0.0,
    }),
  );
  const matSnowDrift = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f7ff,
      roughness: 0.72,
      metalness: 0.02,
    }),
  );
  const matPineBough = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x26443d,
      roughness: 0.84,
      metalness: 0.02,
    }),
  );
  const matShadow = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x2c3c61,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  // Unit-length horizontal cylinder geometries along X (scaled dynamically to road span)
  const unitTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.58, 1.0, 12));
  unitTrunkGeo.rotateZ(Math.PI * 0.5);

  const unitSnowCapGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 0.96, 10));
  unitSnowCapGeo.rotateZ(Math.PI * 0.5);
  unitSnowCapGeo.scale(1, 0.48, 1.18);

  const unitShadowGeo = trackGeo(new THREE.PlaneGeometry(1.04, 1.8));
  unitShadowGeo.rotateX(-Math.PI * 0.5);

  const woodRingGeo = trackGeo(new THREE.CylinderGeometry(0.48, 0.5, 0.18, 12));
  woodRingGeo.rotateZ(Math.PI * 0.5);

  const barkBandGeo = trackGeo(new THREE.TorusGeometry(0.53, 0.055, 6, 12));
  barkBandGeo.rotateY(Math.PI * 0.5);

  const rootStubGeo = trackGeo(new THREE.ConeGeometry(0.3, 1.45, 7));
  const branchStubGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.16, 1.05, 7));
  const boughConeGeo = trackGeo(new THREE.ConeGeometry(1.35, 2.3, 8));
  const snowMoundGeo = trackGeo(new THREE.SphereGeometry(0.65, 10, 8));

  interface LogSlot {
    root: THREE.Group;
    trunk: THREE.Mesh;
    snowCap: THREE.Mesh;
    shadow: THREE.Mesh;
    stumpCap: THREE.Group;
    tipCluster: THREE.Group;
    midDecor: THREE.Group;
  }

  const pool: LogSlot[] = [];

  for (let i = 0; i < MAX_FALLEN_LOGS; i++) {
    const root = new THREE.Group();
    root.visible = false;

    // 1. Soft snow-grounded contact shadow beneath trunk
    const shadow = new THREE.Mesh(unitShadowGeo, matShadow);
    shadow.position.set(0, 0.03, 0.08);
    root.add(shadow);

    // 2. Primary tapered fallen pine trunk (resting firmly in snow)
    const trunk = new THREE.Mesh(unitTrunkGeo, matBark);
    trunk.position.set(0, 0.48, 0);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    root.add(trunk);

    // 3. Thick rounded snow blanket hugging the top of the fallen log
    const snowCap = new THREE.Mesh(unitSnowCapGeo, matSnowDrift);
    snowCap.position.set(0, 0.9, -0.04);
    snowCap.receiveShadow = true;
    root.add(snowCap);

    // 4. Stump / root-flare endcap (+X side anchored into snowbank)
    const stumpCap = new THREE.Group();
    const cutFace = new THREE.Mesh(woodRingGeo, matInnerWood);
    cutFace.position.set(0, 0.5, 0);
    stumpCap.add(cutFace);

    const root1 = new THREE.Mesh(rootStubGeo, matBarkDark);
    root1.position.set(0.38, 0.36, 0.44);
    root1.rotation.set(0.62, 0.2, -0.78);
    stumpCap.add(root1);

    const root2 = new THREE.Mesh(rootStubGeo, matBarkDark);
    root2.position.set(0.32, 0.34, -0.46);
    root2.rotation.set(-0.64, -0.15, -0.82);
    stumpCap.add(root2);

    const bankSnowR = new THREE.Mesh(snowMoundGeo, matSnowDrift);
    bankSnowR.position.set(0.38, 0.24, 0.1);
    bankSnowR.scale.set(1.55, 0.68, 1.45);
    stumpCap.add(bankSnowR);
    root.add(stumpCap);

    // 5. Fuller fallen pine bough crown (-X side anchored into outer snowbank)
    const tipCluster = new THREE.Group();
    const bough1 = new THREE.Mesh(boughConeGeo, matPineBough);
    bough1.position.set(-0.55, 0.72, 0.16);
    bough1.rotation.set(0.18, 0.1, Math.PI * 0.44);
    bough1.castShadow = true;
    tipCluster.add(bough1);

    const bough2 = new THREE.Mesh(boughConeGeo, matPineBough);
    bough2.position.set(-0.08, 0.78, -0.36);
    bough2.rotation.set(-0.28, -0.2, Math.PI * 0.4);
    bough2.scale.set(0.86, 0.9, 0.86);
    tipCluster.add(bough2);

    const boughSnow = new THREE.Mesh(boughConeGeo, matSnowDrift);
    boughSnow.position.set(-0.52, 0.92, 0.08);
    boughSnow.rotation.set(0.14, 0.08, Math.PI * 0.44);
    boughSnow.scale.set(0.75, 0.65, 0.75);
    tipCluster.add(boughSnow);

    const bankSnowL = new THREE.Mesh(snowMoundGeo, matSnowDrift);
    bankSnowL.position.set(-0.35, 0.26, -0.05);
    bankSnowL.scale.set(1.45, 0.65, 1.45);
    tipCluster.add(bankSnowL);
    root.add(tipCluster);

    // 6. Mid-trunk bark ridge rings & low forward/back broken branch stubs (height <= 0.92m to stay honest with jump clearance!)
    const midDecor = new THREE.Group();
    const ringOffsets = [-5.4, -1.8, 2.2, 5.6];
    for (let r = 0; r < ringOffsets.length; r++) {
      const ring = new THREE.Mesh(barkBandGeo, matBarkDark);
      ring.position.set(ringOffsets[r], 0.46, 0);
      ring.scale.setScalar(0.96 + (r % 2) * 0.08);
      midDecor.add(ring);
    }

    const stubA = new THREE.Mesh(branchStubGeo, matBarkDark);
    stubA.position.set(-3.2, 0.52, 0.48);
    stubA.rotation.set(1.08, 0.25, 0.3);
    midDecor.add(stubA);

    const stubB = new THREE.Mesh(branchStubGeo, matBarkDark);
    stubB.position.set(3.4, 0.5, -0.46);
    stubB.rotation.set(-1.12, -0.2, -0.25);
    midDecor.add(stubB);

    root.add(midDecor);
    scene.add(root);

    pool.push({
      root,
      trunk,
      snowCap,
      shadow,
      stumpCap,
      tipCluster,
      midDecor,
    });
  }

  return {
    syncFallenLogs(obstacles) {
      let slotIdx = 0;

      for (let i = 0; i < obstacles.length && slotIdx < MAX_FALLEN_LOGS; i++) {
        const obs = obstacles[i];
        if (obs.kind !== 'fallen_log') continue;

        const slot = pool[slotIdx++];
        const halfSpan = (obs.barHalfWidth ?? 9.5) + 1.15;
        const fullLength = halfSpan * 2;
        const s = obs.scale;

        // Match local track center ground & gentle lateral tilt
        const trackYaw = -Math.atan(getTrackSlopeTangentX(obs.z));
        const leftY = getGroundHeightAt(obs.worldX - halfSpan * 0.7, obs.z);
        const rightY = getGroundHeightAt(obs.worldX + halfSpan * 0.7, obs.z);
        const crossTilt = Math.atan2(rightY - leftY, halfSpan * 1.4);

        slot.root.position.set(obs.worldX, obs.worldY - 0.06, -obs.z);
        slot.root.rotation.set(0, trackYaw + obs.rotationY, crossTilt, 'YXZ');

        slot.trunk.scale.set(fullLength, s, s);
        slot.snowCap.scale.set(fullLength * 0.96, s, s);
        slot.shadow.scale.set(fullLength, 1, s);

        slot.stumpCap.position.set(halfSpan - 0.12, 0, 0);
        slot.stumpCap.scale.setScalar(s);

        slot.tipCluster.position.set(-(halfSpan - 0.25), 0, 0);
        slot.tipCluster.scale.setScalar(s);

        slot.midDecor.scale.set(1, s, s);
        slot.root.visible = true;
      }

      for (let i = slotIdx; i < MAX_FALLEN_LOGS; i++) {
        pool[i].root.visible = false;
      }
    },

    dispose() {
      for (let i = 0; i < pool.length; i++) {
        scene.remove(pool[i].root);
      }
      for (let i = 0; i < disposables.length; i++) {
        disposables[i].dispose();
      }
    },
  };
}
