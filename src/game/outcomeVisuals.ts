import * as THREE from 'three';

/**
 * Lightweight 3D visual accents for Victory Celebration & Game Over outcomes:
 * 1. Victory Confetti: 44 pooled tiny golden/amber/ice-white InstancedMesh confetti chips
 *    fluttering gently above the shelter plaza without obstructing characters or UI buttons.
 * 2. Game Over Cartoon Snow Mounds: rounded multi-lobe snow drifts that gently rise around
 *    Lofi's lower body (and any existing level followers nearby) when caught by the avalanche.
 * Zero per-frame heap allocations; cleanly hidden on reset and fully disposed on teardown.
 */

export interface OutcomeVisuals {
  updateVictoryConfetti: (params: {
    active: boolean;
    dt: number;
    time: number;
    centerX: number;
    centerY: number;
    centerZ: number;
  }) => void;
  updateGameOverMounds: (params: {
    active: boolean;
    burialProgress: number;
    heroX: number;
    heroY: number;
    heroZ: number;
    followerPositions: ReadonlyArray<{ x: number; y: number; z: number }>;
  }) => void;
  reset: () => void;
  dispose: () => void;
}

interface ConfettiChip {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  fallSpeed: number;
  swayAmp: number;
  swayFreq: number;
  spinX: number;
  spinY: number;
  phase: number;
  scaleX: number;
  scaleY: number;
}

const CONFETTI_COUNT = 44;
const MAX_FOLLOWER_MOUNDS = 12;

const _dummy = new THREE.Object3D();

export function createOutcomeVisuals(scene: THREE.Scene): OutcomeVisuals {
  const disposables: Array<{ dispose: () => void }> = [];

  // --- 1. Lightweight Celebratory Golden Confetti (Single InstancedMesh Draw Call) ---
  const chipGeo = new THREE.PlaneGeometry(0.24, 0.14);
  disposables.push(chipGeo);

  const chipMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0.35,
    side: THREE.DoubleSide,
  });
  disposables.push(chipMat);

  const confettiMesh = new THREE.InstancedMesh(chipGeo, chipMat, CONFETTI_COUNT);
  confettiMesh.frustumCulled = false;
  confettiMesh.visible = false;
  scene.add(confettiMesh);

  const palette = [
    new THREE.Color(0xffca4b), // Warm shelter gold
    new THREE.Color(0xf79835), // Lofi jacket orange-gold
    new THREE.Color(0xfff1b8), // Soft champagne sparkle
    new THREE.Color(0x8fd1ff), // Alpine ice-blue accent
  ];

  const chips: ConfettiChip[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const h1 = Math.sin(i * 12.9898 + 1.23) * 43758.5453;
    const r1 = h1 - Math.floor(h1);
    const h2 = Math.sin(i * 78.233 + 4.56) * 43758.5453;
    const r2 = h2 - Math.floor(h2);
    const h3 = Math.sin(i * 39.425 + 7.89) * 43758.5453;
    const r3 = h3 - Math.floor(h3);

    // Arrange confetti in a wide airy arc around the plaza flanks & upper space
    // so it frames the celebration cleanly without cluttering faces
    const spreadX = (r1 * 2 - 1) * 7.8;
    const spreadZ = (r2 * 2 - 1) * 5.2;
    chips.push({
      offsetX: spreadX,
      offsetY: 1.6 + r3 * 6.5,
      offsetZ: spreadZ,
      fallSpeed: 1.15 + r2 * 1.1,
      swayAmp: 0.35 + r1 * 0.45,
      swayFreq: 1.6 + r3 * 1.8,
      spinX: 2.2 + r1 * 3.5,
      spinY: 2.5 + r2 * 3.2,
      phase: r3 * Math.PI * 2,
      scaleX: 0.8 + r1 * 0.55,
      scaleY: 0.8 + r2 * 0.5,
    });
    confettiMesh.setColorAt(i, palette[i % palette.length]);
  }
  if (confettiMesh.instanceColor) {
    confettiMesh.instanceColor.needsUpdate = true;
  }

  // --- 2. Cartoon Game Over Snow Mounds (Rounded multi-lobe snow drifts matching game style) ---
  const matSnowMound = new THREE.MeshStandardMaterial({
    color: 0xeef5ff,
    roughness: 0.88,
    metalness: 0.0,
  });
  const matSnowShadow = new THREE.MeshStandardMaterial({
    color: 0xc9dbf5,
    roughness: 0.92,
    metalness: 0.0,
  });
  disposables.push(matSnowMound, matSnowShadow);

  const sphereGeo = new THREE.SphereGeometry(1, 18, 12);
  disposables.push(sphereGeo);

  const buildSnowMoundGroup = (scale: number): THREE.Group => {
    const group = new THREE.Group();
    group.visible = false;

    // Central fluffy pillowy drift wrapping cleanly around knees & waist
    const main = new THREE.Mesh(sphereGeo, matSnowMound);
    main.scale.set(1.52 * scale, 0.62 * scale, 1.38 * scale);
    main.position.set(0, 0.24 * scale, 0.08 * scale);
    main.receiveShadow = true;
    group.add(main);

    // Flanking softer snow drift lobes for an authentic sculpted snow pile silhouette
    const leftLobe = new THREE.Mesh(sphereGeo, matSnowMound);
    leftLobe.scale.set(1.14 * scale, 0.48 * scale, 1.04 * scale);
    leftLobe.position.set(-1.02 * scale, 0.16 * scale, 0.18 * scale);
    leftLobe.receiveShadow = true;
    group.add(leftLobe);

    const rightLobe = new THREE.Mesh(sphereGeo, matSnowMound);
    rightLobe.scale.set(1.16 * scale, 0.48 * scale, 1.06 * scale);
    rightLobe.position.set(1.0 * scale, 0.17 * scale, 0.14 * scale);
    rightLobe.receiveShadow = true;
    group.add(rightLobe);

    const frontLip = new THREE.Mesh(sphereGeo, matSnowShadow);
    frontLip.scale.set(1.22 * scale, 0.44 * scale, 0.92 * scale);
    frontLip.position.set(0, 0.16 * scale, 0.68 * scale);
    frontLip.receiveShadow = true;
    group.add(frontLip);

    const backBank = new THREE.Mesh(sphereGeo, matSnowMound);
    backBank.scale.set(1.66 * scale, 0.66 * scale, 1.18 * scale);
    backBank.position.set(0, 0.25 * scale, -0.74 * scale);
    backBank.receiveShadow = true;
    group.add(backBank);

    scene.add(group);
    return group;
  };

  const heroMound = buildSnowMoundGroup(1.08);
  const followerMounds: THREE.Group[] = [];
  for (let i = 0; i < MAX_FOLLOWER_MOUNDS; i++) {
    followerMounds.push(buildSnowMoundGroup(0.72));
  }

  const updateVictoryConfetti: OutcomeVisuals['updateVictoryConfetti'] = ({
    active,
    dt,
    time,
    centerX,
    centerY,
    centerZ,
  }) => {
    confettiMesh.visible = active;
    if (!active) return;

    const maxH = 8.2;
    const minH = 0.6;
    const span = maxH - minH;

    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const c = chips[i];
      c.offsetY -= c.fallSpeed * dt;
      if (c.offsetY < minH) {
        c.offsetY += span;
      }

      const swayX = Math.sin(time * c.swayFreq + c.phase) * c.swayAmp;
      const swayZ = Math.cos(time * (c.swayFreq * 0.85) + c.phase) * (c.swayAmp * 0.6);

      _dummy.position.set(
        centerX + c.offsetX + swayX,
        centerY + c.offsetY,
        centerZ + c.offsetZ + swayZ,
      );
      _dummy.rotation.set(
        time * c.spinX + c.phase,
        time * c.spinY + c.phase * 0.7,
        Math.sin(time * 2.4 + c.phase) * 0.8,
      );
      _dummy.scale.set(c.scaleX, c.scaleY, 1);
      _dummy.updateMatrix();
      confettiMesh.setMatrixAt(i, _dummy.matrix);
    }
    confettiMesh.instanceMatrix.needsUpdate = true;
  };

  const updateGameOverMounds: OutcomeVisuals['updateGameOverMounds'] = ({
    active,
    burialProgress,
    heroX,
    heroY,
    heroZ,
    followerPositions,
  }) => {
    if (!active) {
      heroMound.visible = false;
      for (let i = 0; i < followerMounds.length; i++) {
        followerMounds[i].visible = false;
      }
      return;
    }

    const t = Math.max(0, Math.min(1, burialProgress));
    // Soft cartoon pop-up curve for the snow drift settling around Lofi
    const eased = 1 - Math.pow(1 - t, 3);
    const scaleY = 0.08 + eased * 0.92;
    const scaleXZ = 0.65 + eased * 0.35;

    heroMound.visible = true;
    heroMound.position.set(heroX, heroY - 0.08, heroZ);
    heroMound.scale.set(scaleXZ, scaleY, scaleXZ);

    const count = Math.min(followerPositions.length, followerMounds.length);
    for (let i = 0; i < followerMounds.length; i++) {
      const m = followerMounds[i];
      if (i < count) {
        const fp = followerPositions[i];
        m.visible = true;
        m.position.set(fp.x, fp.y - 0.05, fp.z);
        m.scale.set(scaleXZ, scaleY, scaleXZ);
      } else {
        m.visible = false;
      }
    }
  };

  const reset = () => {
    confettiMesh.visible = false;
    heroMound.visible = false;
    for (let i = 0; i < followerMounds.length; i++) {
      followerMounds[i].visible = false;
    }
  };

  const dispose = () => {
    scene.remove(confettiMesh);
    scene.remove(heroMound);
    for (let i = 0; i < followerMounds.length; i++) {
      scene.remove(followerMounds[i]);
    }
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    updateVictoryConfetti,
    updateGameOverMounds,
    reset,
    dispose,
  };
}
