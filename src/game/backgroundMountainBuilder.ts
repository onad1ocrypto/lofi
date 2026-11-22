import * as THREE from 'three';
import {
  BACKGROUND_MOUNTAIN_ARCHETYPES,
  BACKGROUND_MOUNTAIN_SPECS,
  computeMountainSurfaceColor,
  sampleMountainHeight,
} from './backgroundMountainLogic';

export interface BackgroundMountainsHandle {
  group: THREE.Group;
  dispose: () => void;
}

const GRID_SEGMENTS = 52;

/**
 * Build a sculpted, faceted, bottom-pivoted stylized alpine massif BufferGeometry
 * with per-triangle slope-classified rock planes and snow slopes.
 *
 * Normalized dimensions:
 * - X footprint in [-1, 1]
 * - Z footprint in [-1, 1] (+Z faces camera)
 * - Y height in [0, 1] (base strictly grounded at y = 0)
 */
function buildMountainArchetypeGeometry(archetypeIndex: number): THREE.BufferGeometry {
  const segs = GRID_SEGMENTS;
  const stride = segs + 1;

  // Pre-sample grid heights & gully/ridge/ledge metadata once
  const heights = new Float32Array(stride * stride);
  const gullies = new Float32Array(stride * stride);
  const ridges = new Float32Array(stride * stride);
  const ledges = new Float32Array(stride * stride);
  const xs = new Float32Array(stride * stride);
  const zs = new Float32Array(stride * stride);

  for (let rz = 0; rz <= segs; rz++) {
    const nz = (rz / segs) * 2 - 1;
    for (let cx = 0; cx <= segs; cx++) {
      const nx = (cx / segs) * 2 - 1;
      const idx = rz * stride + cx;
      const sample = sampleMountainHeight(nx, nz, archetypeIndex);
      xs[idx] = nx;
      zs[idx] = nz;
      heights[idx] = sample.height;
      gullies[idx] = sample.gullyDepth;
      ridges[idx] = sample.ridgeFactor;
      ledges[idx] = sample.ledgeFactor;
    }
  }

  // Emit non-indexed triangles (skipping completely flat zero-height outer corners)
  // so every facet gets crisp stylized rock-vs-snow vertex color without muddy blur.
  const triPositions: number[] = [];
  const triNormals: number[] = [];
  const triColors: number[] = [];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const srgbColor = new THREE.Color();

  const emitTriangle = (i0: number, i1: number, i2: number) => {
    const h0 = heights[i0];
    const h1 = heights[i1];
    const h2 = heights[i2];
    if (h0 <= 0.0005 && h1 <= 0.0005 && h2 <= 0.0005) return;

    vA.set(xs[i0], h0, zs[i0]);
    vB.set(xs[i1], h1, zs[i1]);
    vC.set(xs[i2], h2, zs[i2]);

    ab.subVectors(vB, vA);
    ac.subVectors(vC, vA);
    faceNormal.crossVectors(ab, ac);
    if (faceNormal.lengthSq() < 1e-10) return;
    faceNormal.normalize();
    if (faceNormal.y < 0) {
      faceNormal.negate();
      const tmp = i1;
      i1 = i2;
      i2 = tmp;
      vB.set(xs[i1], heights[i1], zs[i1]);
      vC.set(xs[i2], heights[i2], zs[i2]);
    }

    const avgH = (h0 + h1 + h2) / 3;
    const avgGully = (gullies[i0] + gullies[i1] + gullies[i2]) / 3;
    const avgRidge = (ridges[i0] + ridges[i1] + ridges[i2]) / 3;
    const avgLedge = (ledges[i0] + ledges[i1] + ledges[i2]) / 3;

    // Emphasize real cliff steepness in slope classification so vertical buttress faces
    // expose rich alpine rock while ridge crests, ledges, and snow gullies hold bright snow.
    const worldNormX = faceNormal.x * 1.28;
    const worldNormY = faceNormal.y * 0.84;
    const worldNormZ = faceNormal.z * 1.28;
    const normLen = Math.hypot(worldNormX, worldNormY, worldNormZ) || 1;

    const c = computeMountainSurfaceColor({
      heightNorm: avgH,
      normalX: worldNormX / normLen,
      normalY: worldNormY / normLen,
      normalZ: worldNormZ / normLen,
      gullyDepth: avgGully,
      ridgeFactor: avgRidge,
      ledgeFactor: avgLedge,
    });

    srgbColor.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);

    const verts = [vA, vB, vC];
    for (let k = 0; k < 3; k++) {
      const v = verts[k];
      triPositions.push(v.x, v.y, v.z);
      triNormals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      triColors.push(srgbColor.r, srgbColor.g, srgbColor.b);
    }
  };

  for (let rz = 0; rz < segs; rz++) {
    for (let cx = 0; cx < segs; cx++) {
      const tl = rz * stride + cx;
      const tr = tl + 1;
      const bl = (rz + 1) * stride + cx;
      const br = bl + 1;

      if ((rz + cx) % 2 === 0) {
        emitTriangle(tl, bl, tr);
        emitTriangle(tr, bl, br);
      } else {
        emitTriangle(tl, bl, br);
        emitTriangle(tl, br, tr);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(triNormals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(triColors, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Create the distant sculpted alpine background mountain range and add it to the scene.
 * Uses 3 shared procedural multi-ridge geometries and matte faceted PBR materials for
 * high visual fidelity and minimal draw-call overhead.
 */
export function createBackgroundMountains(scene: THREE.Scene): BackgroundMountainsHandle {
  const group = new THREE.Group();
  group.name = 'DistantAlpineMountains';

  const geometries = BACKGROUND_MOUNTAIN_ARCHETYPES.map((_, idx) =>
    buildMountainArchetypeGeometry(idx),
  );

  // Matte stylized faceted PBR material receiving scene daylight, cool fill, & horizon fog
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
    flatShading: true,
  });

  const materials: THREE.Material[] = [baseMat];

  BACKGROUND_MOUNTAIN_SPECS.forEach((spec, idx) => {
    const geo = geometries[spec.archetypeId % geometries.length];
    let mat = baseMat;
    if (Math.abs(spec.tint - 1.0) > 0.015) {
      mat = baseMat.clone();
      mat.color.setScalar(spec.tint);
      materials.push(mat);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `BackgroundMountain_${idx}`;
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.scale.set(spec.radiusX, spec.height, spec.radiusZ);
    mesh.rotation.y = spec.rotationY;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  });

  scene.add(group);

  const dispose = () => {
    group.parent?.remove(group);
    for (let i = 0; i < geometries.length; i++) {
      geometries[i].dispose();
    }
    for (let i = 0; i < materials.length; i++) {
      materials[i].dispose();
    }
  };

  return { group, dispose };
}
