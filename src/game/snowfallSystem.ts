import * as THREE from 'three';
import {
  SNOWFALL_CONFIG,
  computeSnowfallTargets,
  stepSnowflakePosition,
  type SnowflakePosOut,
  type SnowflakeStepInput,
} from './snowfallLogic';
import type { GamePhase } from './types';

export interface SnowfallUpdateParams {
  dt: number;
  time: number;
  phase: GamePhase;
  levelNumber: number;
  progress: number;
  avalancheDanger: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  windGustForce?: number;
  blizzardIntensity?: number;
}

export interface SnowfallStats {
  activeCount: number;
  capacity: number;
  intensity: number;
  opacity: number;
}

export interface SnowfallSystem {
  update: (params: SnowfallUpdateParams) => void;
  recenter: (playerX: number, playerY: number, playerZ: number) => void;
  getStats: () => SnowfallStats;
  dispose: () => void;
}

/**
 * Procedural soft winter snowflake sprite texture (64x64 radial glow + crisp crystalline core).
 * Zero external image dependencies.
 */
function createSnowflakeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size * 0.5;
  const cy = size * 0.5;
  const grad = ctx.createRadialGradient(cx, cy, 1.5, cx, cy, size * 0.46);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.32, 'rgba(248, 252, 255, 0.92)');
  grad.addColorStop(0.68, 'rgba(222, 238, 255, 0.36)');
  grad.addColorStop(1.0, 'rgba(205, 228, 255, 0.0)');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * High-performance single-draw-call Three.js ambient snowfall particle system (`THREE.Points`):
 * - Preallocated fixed pool of `SNOWFALL_CONFIG.maxFlakes` flakes with `geometry.setDrawRange`.
 * - Zero per-frame heap allocations (reusable step scratch objects & typed arrays).
 * - Smoothly ramps active flake density, drift velocity, and opacity as Lofi nears the shelter
 *   and surges when the avalanche closes in, while staying camera-safe and obstacle-readable.
 */
export function createSnowfallSystem(scene: THREE.Scene): SnowfallSystem {
  const MAX_FLAKES = SNOWFALL_CONFIG.maxFlakes;

  const positions = new Float32Array(MAX_FLAKES * 3);
  const colors = new Float32Array(MAX_FLAKES * 3);
  const speedScales = new Float32Array(MAX_FLAKES);
  const phases = new Float32Array(MAX_FLAKES);

  // Deterministic LCG PRNG for smooth, repeatable alpine snowfall distribution
  let seed = 7919;
  const nextRand = (): number => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const initFlakeSlot = (i: number, centerX: number, centerY: number, centerZ: number) => {
    positions[i * 3] = centerX + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfWidth;
    positions[i * 3 + 1] = centerY + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfHeight;
    positions[i * 3 + 2] = centerZ + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfDepth;

    // Subtle cool-white to ice-blue tint per flake so flakes read crisply against both blue sky & white snow
    const tintRoll = nextRand();
    if (tintRoll < 0.65) {
      colors[i * 3] = 0.98;
      colors[i * 3 + 1] = 0.99;
      colors[i * 3 + 2] = 1.0;
    } else {
      colors[i * 3] = 0.86;
      colors[i * 3 + 1] = 0.93;
      colors[i * 3 + 2] = 1.0;
    }

    speedScales[i] = 0.68 + nextRand() * 0.68;
    phases[i] = nextRand() * Math.PI * 2;
  };

  for (let i = 0; i < MAX_FLAKES; i++) {
    initFlakeSlot(i, 0, 5, SNOWFALL_CONFIG.forwardBiasZ);
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, SNOWFALL_CONFIG.minFlakes);

  const flakeTexture = createSnowflakeTexture();
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    map: flakeTexture,
    vertexColors: true,
    size: 0.25,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    fog: true,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'AmbientAlpineSnowfall';
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);

  let smoothedActiveCount: number = SNOWFALL_CONFIG.minFlakes;
  let lastDrawCount: number = SNOWFALL_CONFIG.minFlakes;
  let lastIntensity = 0.12;

  // Reusable scratch structs (zero GC in animation loop)
  const _stepOut: SnowflakePosOut = { x: 0, y: 0, z: 0 };
  const _stepIn: SnowflakeStepInput = {
    x: 0,
    y: 0,
    z: 0,
    speedScale: 1,
    phase: 0,
    dt: 0,
    time: 0,
    targets: computeSnowfallTargets({
      progress: 0,
      avalancheDanger: 0,
      phase: 'title',
      levelNumber: 1,
    }),
    centerX: 0,
    centerY: 5,
    centerZ: SNOWFALL_CONFIG.forwardBiasZ,
    cameraX: 0,
    cameraY: 5,
    cameraZ: 10,
  };

  const recenter = (playerX: number, playerY: number, playerZ: number) => {
    const cx = playerX;
    const cy = playerY + 5.5;
    const cz = playerZ + SNOWFALL_CONFIG.forwardBiasZ;
    for (let i = 0; i < MAX_FLAKES; i++) {
      positions[i * 3] = cx + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfWidth;
      positions[i * 3 + 1] = cy + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfHeight;
      positions[i * 3 + 2] = cz + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfDepth;
    }
    smoothedActiveCount = SNOWFALL_CONFIG.minFlakes;
    lastDrawCount = SNOWFALL_CONFIG.minFlakes;
    geometry.setDrawRange(0, lastDrawCount);
    posAttr.needsUpdate = true;
  };

  return {
    recenter,

    update(params) {
      const safeDt = params.phase === 'paused' ? 0 : Math.min(Math.max(params.dt, 0), 0.05);

      const targets = computeSnowfallTargets({
        progress: params.progress,
        avalancheDanger: params.avalancheDanger,
        phase: params.phase,
        levelNumber: params.levelNumber,
        windGustForce: params.windGustForce,
        blizzardIntensity: params.blizzardIntensity,
      });

      // Smoothly ease active flake count so density climbs organically without abrupt bursts
      const blend = safeDt > 0 ? 1 - Math.exp(-3.5 * safeDt) : 0;
      smoothedActiveCount += (targets.activeCount - smoothedActiveCount) * blend;
      const drawCount = Math.max(
        SNOWFALL_CONFIG.minFlakes,
        Math.min(MAX_FLAKES, Math.round(smoothedActiveCount)),
      );

      const centerX = params.playerX;
      const centerY = params.playerY + 5.5;
      const centerZ = params.playerZ + SNOWFALL_CONFIG.forwardBiasZ;

      // Newly woken flakes enter gracefully near the upper canopy of the snowfall volume
      if (drawCount > lastDrawCount) {
        for (let i = lastDrawCount; i < drawCount; i++) {
          positions[i * 3] = centerX + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfWidth;
          positions[i * 3 + 1] =
            centerY + SNOWFALL_CONFIG.boxHalfHeight * (0.35 + nextRand() * 0.65);
          positions[i * 3 + 2] = centerZ + (nextRand() * 2 - 1) * SNOWFALL_CONFIG.boxHalfDepth;
        }
      }

      lastDrawCount = drawCount;
      lastIntensity = targets.intensity;

      material.opacity += (targets.opacity - material.opacity) * (safeDt > 0 ? Math.min(1, safeDt * 4.5) : 0);
      material.size += (targets.flakeSize - material.size) * (safeDt > 0 ? Math.min(1, safeDt * 4.5) : 0);
      geometry.setDrawRange(0, drawCount);

      if (safeDt <= 0) return;

      _stepIn.dt = safeDt;
      _stepIn.time = params.time;
      _stepIn.targets = targets;
      _stepIn.centerX = centerX;
      _stepIn.centerY = centerY;
      _stepIn.centerZ = centerZ;
      _stepIn.cameraX = params.cameraX;
      _stepIn.cameraY = params.cameraY;
      _stepIn.cameraZ = params.cameraZ;

      for (let i = 0; i < drawCount; i++) {
        const i3 = i * 3;
        _stepIn.x = positions[i3];
        _stepIn.y = positions[i3 + 1];
        _stepIn.z = positions[i3 + 2];
        _stepIn.speedScale = speedScales[i];
        _stepIn.phase = phases[i];

        stepSnowflakePosition(_stepIn, _stepOut);

        positions[i3] = _stepOut.x;
        positions[i3 + 1] = _stepOut.y;
        positions[i3 + 2] = _stepOut.z;
      }

      posAttr.needsUpdate = true;
    },

    getStats() {
      return {
        activeCount: lastDrawCount,
        capacity: MAX_FLAKES,
        intensity: lastIntensity,
        opacity: material.opacity,
      };
    },

    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      flakeTexture.dispose();
    },
  };
}
