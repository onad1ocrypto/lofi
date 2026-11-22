import * as THREE from 'three';
import {
  generateCarvingPassSnowMounds,
  type CarvingSnowMoundSpec,
} from './carvingPassLogic';
import {
  getGroundHeightAt,
  getLevelTrackProfile,
  getTrackCenterXForLevel,
  getTrackHalfWidthForLevel,
} from './trackData';

const MAX_CARVING_MOUNDS = 96;

export interface CarvingMoundSystem {
  syncForLevel: (levelNumber: number) => number;
  getActiveCount: () => number;
  dispose: () => void;
}

/**
 * Sculpted organic alpine snowdrift mound geometry (deformed dome with flat snow-seated base
 * and cool-to-bright sunlit vertical snow shading) matching the world's existing snow aesthetic.
 */
function createSculptedSnowMoundGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 18, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const shadowSnow = new THREE.Color(0xb8cee9);
  const midSnow = new THREE.Color(0xe1edfc);
  const crestSnow = new THREE.Color(0xf8fbff);
  const temp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Flatten underside so mound anchors cleanly into sloped snow without floating edges
    if (y < 0) {
      y *= 0.24;
    } else {
      // Subtle sculpted wind-blown snow ridge along the mound crest
      const ridge = Math.sin(z * 2.1 + x * 1.4) * 0.085;
      const shoulder = Math.cos(x * 1.8) * 0.06;
      y = Math.pow(y, 0.86) * (1 + ridge + shoulder);
      x *= 1 + (1 - y) * 0.14;
      z *= 1 + (1 - y) * 0.10;
    }

    pos.setXYZ(i, x, y, z);

    // Soft vertical snow lighting gradient: cool alpine blue shadow at base -> bright sunlit crest
    const h = Math.max(0, Math.min(1, (y + 0.22) / 1.28));
    if (h < 0.45) {
      temp.copy(shadowSnow).lerp(midSnow, h / 0.45);
    } else {
      temp.copy(midSnow).lerp(crestSnow, (h - 0.45) / 0.55);
    }
    colors[i * 3] = temp.r;
    colors[i * 3 + 1] = temp.g;
    colors[i * 3 + 2] = temp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Reusable single-draw-call InstancedMesh system for outside-curve boundary snow mounds.
 * Rebuilt cleanly in-place per level (count=0 on Levels 1-3 & 5-10) so Retry & Next Level
 * never duplicate meshes or leak GPU buffers.
 */
export function createCarvingMoundSystem(
  scene: THREE.Scene,
  snowMap: THREE.CanvasTexture,
  snowBump: THREE.CanvasTexture,
): CarvingMoundSystem {
  const geo = createSculptedSnowMoundGeometry();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: snowMap,
    bumpMap: snowBump,
    bumpScale: 0.035,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.02,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, MAX_CARVING_MOUNDS);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let activeCount = 0;

  const syncForLevel = (levelNumber: number): number => {
    const profile = getLevelTrackProfile(levelNumber);
    const specs: CarvingSnowMoundSpec[] = generateCarvingPassSnowMounds(
      profile.carvingPass,
      (z) => getTrackHalfWidthForLevel(levelNumber, z),
    );

    const count = Math.min(MAX_CARVING_MOUNDS, specs.length);
    activeCount = count;

    if (count === 0) {
      mesh.count = 0;
      mesh.visible = false;
      return 0;
    }

    for (let i = 0; i < count; i++) {
      const m = specs[i];
      const worldX = getTrackCenterXForLevel(levelNumber, m.z) + m.offsetX;
      const worldY = getGroundHeightAt(worldX, m.z) - 0.28;
      const worldZ = -m.z;

      dummy.position.set(worldX, worldY, worldZ);
      // Orient elongated snowdrift smoothly tangent to the curve edge & tilted slightly into the slope
      dummy.rotation.set(0.18, -Math.atan(m.tangentX), -m.side * 0.14);
      dummy.scale.set(m.radiusX, m.radiusY, m.radiusZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.setRGB(m.tint, m.tint, Math.min(1.03, m.tint * 1.02));
      mesh.setColorAt(i, color);
    }

    mesh.count = count;
    mesh.visible = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    return count;
  };

  const dispose = () => {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  };

  return {
    syncForLevel,
    getActiveCount: () => activeCount,
    dispose,
  };
}
