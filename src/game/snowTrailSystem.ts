import * as THREE from 'three';
import {
  TRAIL_CONFIG,
  computeTrailNodeAlpha,
  createSnowTrailBuffer,
  pushTrailSample,
  resetTrailBuffer,
  stepTrailBuffer,
} from './snowTrailLogic';
import type { JumpState } from './types';

export interface SnowTrailSystem {
  recordPoint: (
    x: number,
    y: number,
    z: number,
    lean: number,
    forwardSpeed: number,
    boardYaw: number,
    jumpState: JumpState,
  ) => void;
  update: (dt: number) => void;
  reset: () => void;
  dispose: () => void;
}

/**
 * Single-draw-call persistent fading snowboard trail rendered flush on the snow terrain:
 * - Uses a preallocated dynamic ribbon `BufferGeometry` (zero per-frame heap allocations).
 * - Custom lightweight alpine snow-groove shader: cool periwinkle carved trough with soft bright
 *   snow-rim shoulders and smooth feathered fading edges that match LOFI ICE ESCAPE's dusk-alpine palette.
 * - Cleanly breaks during jumps (AIRBORNE) via zero-area degenerate triangles so no lines float in mid-air.
 */
export function createSnowTrailSystem(scene: THREE.Scene): SnowTrailSystem {
  const MAX_NODES = TRAIL_CONFIG.maxNodes;
  const MAX_VERTS = MAX_NODES * 2;
  const MAX_INDICES = (MAX_NODES - 1) * 6;

  const buffer = createSnowTrailBuffer(MAX_NODES, TRAIL_CONFIG.minStepMeters);

  const positions = new Float32Array(MAX_VERTS * 3);
  const alphas = new Float32Array(MAX_VERTS);
  const crosses = new Float32Array(MAX_VERTS); // -1 = left edge, +1 = right edge
  const indices = new Uint16Array(MAX_INDICES);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1);
  const crossAttr = new THREE.BufferAttribute(crosses, 1);
  const indexAttr = new THREE.BufferAttribute(indices, 1);

  posAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  crossAttr.setUsage(THREE.DynamicDrawUsage);
  indexAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aAlpha', alphaAttr);
  geometry.setAttribute('aCross', crossAttr);
  geometry.setIndex(indexAttr);
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      // Matches trackGroove & bankShadow alpine palette in worldBuilder.ts
      uGrooveColor: { value: new THREE.Color(0x6d8cc4) },
      uRimColor: { value: new THREE.Color(0xb8cff2) },
    },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aCross;
      varying float vAlpha;
      varying float vCross;

      void main() {
        vAlpha = aAlpha;
        vCross = aCross;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGrooveColor;
      uniform vec3 uRimColor;
      varying float vAlpha;
      varying float vCross;

      void main() {
        if (vAlpha <= 0.008) discard;
        float dist = abs(vCross);
        // Feathered outer edge + subtle dual-edge snowboard rail indentation in center
        float edgeFade = 1.0 - smoothstep(0.62, 1.0, dist);
        float centerTrough = 0.72 + 0.28 * smoothstep(0.0, 0.55, dist);
        float railAccent = smoothstep(0.32, 0.64, dist) * (1.0 - smoothstep(0.68, 0.96, dist));
        vec3 col = mix(uGrooveColor, uRimColor, railAccent * 0.45);
        float finalAlpha = vAlpha * edgeFade * centerTrough * 0.68;
        if (finalAlpha <= 0.008) discard;
        gl_FragColor = vec4(col, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  let dirty = false;

  const rebuildGeometry = () => {
    const nodes = buffer.nodes;
    const count = nodes.length;

    if (count < 2) {
      geometry.setDrawRange(0, 0);
      dirty = false;
      return;
    }

    const SURFACE_LIFT = 0.055;

    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const vLeft = i * 2;
      const vRight = vLeft + 1;

      const offX = n.rightX * n.halfWidth;
      const offZ = n.rightZ * n.halfWidth;
      const y = n.y + SURFACE_LIFT;

      // Softly taper head/tail endpoints of detached jump segments
      const isSegEnd = i === count - 1 || nodes[i + 1].segmentStart;
      const endTaper = n.segmentStart || isSegEnd ? 0.25 : 1.0;
      const alpha = computeTrailNodeAlpha(n) * endTaper;

      const l3 = vLeft * 3;
      positions[l3] = n.x - offX;
      positions[l3 + 1] = y;
      positions[l3 + 2] = n.z - offZ;
      alphas[vLeft] = alpha;
      crosses[vLeft] = -1;

      const r3 = vRight * 3;
      positions[r3] = n.x + offX;
      positions[r3 + 1] = y;
      positions[r3 + 2] = n.z + offZ;
      alphas[vRight] = alpha;
      crosses[vRight] = 1;
    }

    let idxCursor = 0;
    for (let i = 0; i < count - 1; i++) {
      // Skip quad whenever the next node starts a fresh segment (e.g. after jumping!)
      if (nodes[i + 1].segmentStart) continue;

      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;

      indices[idxCursor++] = a;
      indices[idxCursor++] = b;
      indices[idxCursor++] = c;

      indices[idxCursor++] = b;
      indices[idxCursor++] = d;
      indices[idxCursor++] = c;
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    crossAttr.needsUpdate = true;
    indexAttr.needsUpdate = true;
    geometry.setDrawRange(0, idxCursor);
    dirty = false;
  };

  return {
    recordPoint(x, y, z, lean, forwardSpeed, boardYaw, jumpState) {
      const added = pushTrailSample(
        buffer,
        x,
        y,
        z,
        lean,
        forwardSpeed,
        boardYaw,
        jumpState,
      );
      if (added) {
        dirty = true;
      }
    },

    update(dt) {
      if (buffer.nodes.length > 0) {
        stepTrailBuffer(buffer, dt);
        dirty = true;
      }
      if (dirty) {
        rebuildGeometry();
      }
    },

    reset() {
      resetTrailBuffer(buffer);
      geometry.setDrawRange(0, 0);
      dirty = false;
    },

    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
