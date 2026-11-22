import * as THREE from 'three';
import { computeCarveDustProfile } from './simulation';
import {
  PARTICLE_KIND,
  computeInstancedSnowScale,
  sampleAlpineWind,
  stepSnowParticlePhysics,
  type ParticleKindCode,
  type ParticleKinematics,
  type ParticleStepResult,
  type Vec3Mutable,
} from './snowParticlePhysics';
import type { JumpState, TrackRamp } from './types';

export interface SnowSprayStats {
  activeCount: number;
  capacity: number;
  drawCount: number;
  totalCollisions: number;
  windX: number;
  windZ: number;
  renderMode: 'instanced';
}

export interface SnowSpraySystem {
  setLevelContext: (levelNumber: number, ramps: readonly TrackRamp[]) => void;
  setWindGust: (gustPushX: number, gustPushZ: number) => void;
  spawnCarveSpray: (
    x: number,
    y: number,
    z: number,
    lean: number,
    forwardSpeed: number,
    boardYaw: number,
    jumpState?: JumpState,
    time?: number,
    brakeAmount?: number,
  ) => void;
  spawnLandingBurst: (
    x: number,
    y: number,
    z: number,
    withGrab?: boolean,
    impactSpeed?: number,
    time?: number,
  ) => void;
  spawnHitBurst: (x: number, y: number, z: number, time?: number) => void;
  spawnRescueSparkle: (x: number, y: number, z: number, time?: number) => void;
  update: (dt: number, time?: number) => void;
  getStats: () => SnowSprayStats;
  reset: () => void;
  dispose: () => void;
}

/**
 * Build a lightweight, organically sculpted 3D snow-clump/puff BufferGeometry (36 triangles)
 * with top-to-bottom snow shading so instanced snow puffs catch scene lighting naturally
 * and blend seamlessly with Lofi Ice Escape's stylized 3D aesthetic.
 */
function createSnowPuffGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.18, 6, 4);
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  const shadowCol = new THREE.Color(0xc5daf6);
  const brightCol = new THREE.Color(0xffffff);
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);

    // Subtle organic puff irregularity so tumbling 3D snow clumps feel hand-sculpted
    const lump =
      1 +
      0.11 * Math.sin(vx * 18 + vy * 12) +
      0.08 * Math.cos(vz * 16 - vy * 14);
    pos.setXYZ(i, vx * lump, vy * lump * 0.94, vz * lump);
  }

  geo.computeVertexNormals();
  const norm = geo.attributes.normal;
  for (let i = 0; i < count; i++) {
    const ny = norm.getY(i);
    const t = THREE.MathUtils.clamp((ny + 0.55) / 1.4, 0, 1);
    c.copy(shadowCol).lerp(brightCol, Math.pow(t, 0.72));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * High-performance Three.js Instanced Rendering (`THREE.InstancedMesh`) snow spray particle system:
 * - Single `THREE.InstancedMesh` draw call with O(1) swap-and-pop active slot compaction
 *   (`instancedMesh.count = activeCount`), so 0 active particles = 0 vertices processed on GPU.
 * - Preallocated typed arrays & reusable math scratch objects (zero per-frame heap allocations).
 * - Multi-class snow particles (heavier ballistic tumbling snow clumps, crisp carving spray,
 *   airy downwind-drifting powder mist, and golden Grab-trick accent puffs).
 * - Realistic 9.81 m/s^2 gravity, dynamic alpine crosswind with gust waves & boundary-layer shear,
 *   and true 3D sloped terrain & snow-ramp collision resolution with secondary splash puffs.
 */
export function createSnowPointsSystem(scene: THREE.Scene): SnowSpraySystem {
  const MAX_PARTICLES = 320;

  // Compact active-list Structure-of-Arrays (live particles always occupy [0 .. activeCount - 1])
  const posX = new Float32Array(MAX_PARTICLES);
  const posY = new Float32Array(MAX_PARTICLES);
  const posZ = new Float32Array(MAX_PARTICLES);
  const velX = new Float32Array(MAX_PARTICLES);
  const velY = new Float32Array(MAX_PARTICLES);
  const velZ = new Float32Array(MAX_PARTICLES);
  const rotX = new Float32Array(MAX_PARTICLES);
  const rotY = new Float32Array(MAX_PARTICLES);
  const rotZ = new Float32Array(MAX_PARTICLES);
  const spinX = new Float32Array(MAX_PARTICLES);
  const spinY = new Float32Array(MAX_PARTICLES);
  const spinZ = new Float32Array(MAX_PARTICLES);
  const colR = new Float32Array(MAX_PARTICLES);
  const colG = new Float32Array(MAX_PARTICLES);
  const colB = new Float32Array(MAX_PARTICLES);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const baseScale = new Float32Array(MAX_PARTICLES);
  const gravityScale = new Float32Array(MAX_PARTICLES);
  const dragCoeff = new Float32Array(MAX_PARTICLES);
  const windFactor = new Float32Array(MAX_PARTICLES);
  const restitution = new Float32Array(MAX_PARTICLES);
  const friction = new Float32Array(MAX_PARTICLES);
  const radius = new Float32Array(MAX_PARTICLES);
  const kindArr = new Uint8Array(MAX_PARTICLES);
  const bounceCount = new Uint8Array(MAX_PARTICLES);
  const settledArr = new Uint8Array(MAX_PARTICLES);

  const geometry = createSnowPuffGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.02,
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.frustumCulled = false;
  instancedMesh.castShadow = false;
  instancedMesh.receiveShadow = false;
  instancedMesh.count = 0;

  // Initialize instanceColor buffer upfront with DynamicDrawUsage so setColorAt never reallocates mid-run
  const initialColor = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    instancedMesh.setColorAt(i, initialColor);
  }
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    instancedMesh.instanceColor.needsUpdate = true;
  }

  scene.add(instancedMesh);

  let activeCount = 0;
  let totalCollisions = 0;
  let sprayCooldown = 0;
  let noiseSeed = 1337;
  let currentLevelNumber = 1;
  let currentRamps: readonly TrackRamp[] = [];
  let internalClock = 0;
  let currentGustWindX = 0;
  let currentGustWindZ = 0;

  // Reusable scratch objects (strictly zero GC in render/update loops)
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _euler = new THREE.Euler();
  const _scale = new THREE.Vector3();
  const _mat4 = new THREE.Matrix4();
  const _color = new THREE.Color();
  const _scaleOut: Vec3Mutable = { x: 1, y: 1, z: 1 };
  const _emitWind: Vec3Mutable = { x: 0, y: 0, z: 0 };
  const _statsWind: Vec3Mutable = { x: 0, y: 0, z: 0 };

  const _kin: ParticleKinematics = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    gravityScale: 1,
    drag: 2,
    windFactor: 0.7,
    restitution: 0.28,
    friction: 0.55,
    radius: 0.07,
    kind: PARTICLE_KIND.SPRAY,
    bounceCount: 0,
    settled: false,
  };

  const _stepRes: ParticleStepResult = {
    collided: false,
    impactSpeed: 0,
    shouldEmitSplash: false,
    groundY: 0,
    nx: 0,
    ny: 1,
    nz: 0,
  };

  // Fixed scratch ring for deferred secondary impact splashes during update()
  const MAX_SPLASHES_PER_FRAME = 10;
  const splashX = new Float32Array(MAX_SPLASHES_PER_FRAME);
  const splashY = new Float32Array(MAX_SPLASHES_PER_FRAME);
  const splashZ = new Float32Array(MAX_SPLASHES_PER_FRAME);
  const splashNx = new Float32Array(MAX_SPLASHES_PER_FRAME);
  const splashNy = new Float32Array(MAX_SPLASHES_PER_FRAME);
  const splashNz = new Float32Array(MAX_SPLASHES_PER_FRAME);
  const splashSpd = new Float32Array(MAX_SPLASHES_PER_FRAME);

  const nextRand = (): number => {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
    return noiseSeed / 4294967296;
  };

  /** Copy slot `src` into slot `dst` during O(1) swap-and-pop compaction. */
  const copySlot = (dst: number, src: number) => {
    posX[dst] = posX[src];
    posY[dst] = posY[src];
    posZ[dst] = posZ[src];
    velX[dst] = velX[src];
    velY[dst] = velY[src];
    velZ[dst] = velZ[src];
    rotX[dst] = rotX[src];
    rotY[dst] = rotY[src];
    rotZ[dst] = rotZ[src];
    spinX[dst] = spinX[src];
    spinY[dst] = spinY[src];
    spinZ[dst] = spinZ[src];
    colR[dst] = colR[src];
    colG[dst] = colG[src];
    colB[dst] = colB[src];
    life[dst] = life[src];
    maxLife[dst] = maxLife[src];
    baseScale[dst] = baseScale[src];
    gravityScale[dst] = gravityScale[src];
    dragCoeff[dst] = dragCoeff[src];
    windFactor[dst] = windFactor[src];
    restitution[dst] = restitution[src];
    friction[dst] = friction[src];
    radius[dst] = radius[src];
    kindArr[dst] = kindArr[src];
    bounceCount[dst] = bounceCount[src];
    settledArr[dst] = settledArr[src];
  };

  /** Compose and upload a single active particle's transform + color into InstancedMesh. */
  const writeInstance = (i: number) => {
    const ageFrac = maxLife[i] > 0 ? 1 - life[i] / maxLife[i] : 1;
    const speedSq = velX[i] * velX[i] + velY[i] * velY[i] + velZ[i] * velZ[i];
    computeInstancedSnowScale(
      ageFrac,
      baseScale[i],
      kindArr[i] as ParticleKindCode,
      bounceCount[i],
      settledArr[i] === 1,
      speedSq,
      _scaleOut,
    );

    _pos.set(posX[i], posY[i], posZ[i]);
    _euler.set(rotX[i], rotY[i], rotZ[i]);
    _quat.setFromEuler(_euler);
    _scale.set(_scaleOut.x, _scaleOut.y, _scaleOut.z);
    _mat4.compose(_pos, _quat, _scale);
    instancedMesh.setMatrixAt(i, _mat4);

    _color.setRGB(colR[i], colG[i], colB[i]);
    instancedMesh.setColorAt(i, _color);
  };

  const commitInstanceBuffers = () => {
    instancedMesh.count = activeCount;
    if (activeCount > 0) {
      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  };

  /** Find the oldest active particle slot when the pool is at capacity so fresh sprays never stall. */
  const findSlotToAllocate = (): number => {
    if (activeCount < MAX_PARTICLES) {
      return activeCount++;
    }
    let oldestIdx = 0;
    let lowestRem = life[0];
    for (let i = 1; i < MAX_PARTICLES; i++) {
      if (life[i] < lowestRem) {
        lowestRem = life[i];
        oldestIdx = i;
      }
    }
    return oldestIdx;
  };

  const emitParticle = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    ttl: number,
    scale: number,
    r: number,
    g: number,
    b: number,
    kind: ParticleKindCode,
    gravMult: number,
    drag: number,
    wFactor: number,
    rest: number,
    fric: number,
    rad: number,
    spinRate: number,
  ) => {
    const i = findSlotToAllocate();

    posX[i] = x;
    posY[i] = y;
    posZ[i] = z;

    velX[i] = vx;
    velY[i] = vy;
    velZ[i] = vz;

    rotX[i] = nextRand() * Math.PI * 2;
    rotY[i] = nextRand() * Math.PI * 2;
    rotZ[i] = nextRand() * Math.PI * 2;
    spinX[i] = (nextRand() - 0.5) * 2 * spinRate;
    spinY[i] = (nextRand() - 0.5) * 2 * spinRate;
    spinZ[i] = (nextRand() - 0.5) * 2 * spinRate;

    colR[i] = r;
    colG[i] = g;
    colB[i] = b;

    life[i] = ttl;
    maxLife[i] = ttl;
    baseScale[i] = scale;
    gravityScale[i] = gravMult;
    dragCoeff[i] = drag;
    windFactor[i] = wFactor;
    restitution[i] = rest;
    friction[i] = fric;
    radius[i] = rad;
    kindArr[i] = kind;
    bounceCount[i] = 0;
    settledArr[i] = 0;

    writeInstance(i);
  };

  const emitSecondaryGroundSplash = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    impactSpeed: number,
    time: number,
  ) => {
    sampleAlpineWind(
      time,
      x,
      z,
      0.15,
      currentLevelNumber,
      _emitWind,
      currentGustWindX,
      currentGustWindZ,
    );
    const burstCount = impactSpeed > 3.6 ? 2 : 1;
    const energy = Math.min(1.6, impactSpeed * 0.28);

    for (let k = 0; k < burstCount; k++) {
      const ang = nextRand() * Math.PI * 2;
      const spread = (0.75 + nextRand() * 1.15) * energy;
      const vx = Math.cos(ang) * spread + nx * energy * 0.8 + _emitWind.x * 0.4;
      const vy = Math.max(0.55, ny * (0.9 + nextRand() * 0.9) * energy);
      const vz = Math.sin(ang) * spread + nz * energy * 0.8 + _emitWind.z * 0.4;
      emitParticle(
        x,
        y + 0.04,
        z,
        vx,
        vy,
        vz,
        0.24 + nextRand() * 0.18,
        0.48 + nextRand() * 0.28,
        0.92,
        0.96,
        1.0,
        PARTICLE_KIND.MIST,
        0.48,
        3.6,
        1.35,
        0.08,
        0.72,
        0.05,
        3.2,
      );
    }
  };

  const hideAll = () => {
    activeCount = 0;
    totalCollisions = 0;
    instancedMesh.count = 0;
  };

  return {
    setLevelContext(levelNumber, ramps) {
      currentLevelNumber = Math.max(1, Math.floor(levelNumber));
      currentRamps = ramps;
    },

    setWindGust(gustPushX, gustPushZ) {
      currentGustWindX = gustPushX;
      currentGustWindZ = gustPushZ;
    },

    spawnCarveSpray(
      x,
      y,
      z,
      lean,
      forwardSpeed,
      boardYaw,
      jumpState = 'GROUNDED',
      time = internalClock,
      brakeAmount = 0,
    ) {
      if (sprayCooldown > 0) return;

      // Emits when turning OR braking on snow (straight gliding & airborne return active: false)
      const profile = computeCarveDustProfile(lean, forwardSpeed, jumpState, brakeAmount);
      if (!profile.active || profile.burstCount <= 0) return;

      const clampedBrake = Math.max(0, Math.min(1, brakeAmount));
      const cosY = Math.cos(boardYaw);
      const sinY = Math.sin(boardYaw);
      sampleAlpineWind(
        time,
        x,
        z,
        0.35,
        currentLevelNumber,
        _emitWind,
        currentGustWindX,
        currentGustWindZ,
      );

      // Multi-class carving/braking spray: dense tumbling snow clumps, crisp spray grains, & airy wind-drifted mist
      const count = profile.burstCount + 3 + (clampedBrake > 0.15 ? 2 : 0);
      for (let k = 0; k < count; k++) {
        // When braking, fan snow particles noticeably wider across the sideways board edge
        const brakeFanSign =
          clampedBrake > 0.15
            ? k % 3 === 0
              ? -profile.sprayDir
              : profile.sprayDir
            : profile.sprayDir;
        const localZ = -0.45 - clampedBrake * 0.25 + nextRand() * (1.48 + clampedBrake * 0.55);
        const localX =
          brakeFanSign * (0.24 + clampedBrake * 0.18 + nextRand() * (0.32 + clampedBrake * 0.42));

        const offX = localX * cosY + localZ * sinY;
        const offZ = -localX * sinY + localZ * cosY;

        const roll = nextRand();
        const isClump = roll < 0.34;
        const isMist = roll > 0.74;

        const brakeWidthBoost = 1 + clampedBrake * 0.52;
        const outwardSpeed =
          brakeFanSign *
          ((isClump ? 2.6 : 3.2) +
            profile.carveStrength * (isMist ? 4.5 : 5.5) +
            nextRand() * 1.9) *
          brakeWidthBoost;
        // Natural kick-up arc under gravity (~0.28–0.52s airtime before bouncing on the snow slope)
        const liftSpeed =
          (isClump ? 1.45 : isMist ? 1.35 : 1.65) +
          profile.carveStrength * (isClump ? 1.75 : 1.65) +
          clampedBrake * 0.45 +
          nextRand() * 0.88;
        const trailSpeed = 2.0 + nextRand() * 2.1 + profile.carveStrength * 1.4 + clampedBrake * 0.9;

        // Initial emission velocity responds immediately to the local alpine wind direction
        const windInit = isMist ? 0.75 : isClump ? 0.25 : 0.46;
        const vx = outwardSpeed + _emitWind.x * windInit;
        const vy = liftSpeed + _emitWind.y * windInit;
        const vz = trailSpeed + _emitWind.z * windInit;

        const ttl = isClump
          ? 0.90 + nextRand() * 0.36
          : isMist
            ? 0.74 + nextRand() * 0.34
            : 0.74 + nextRand() * 0.30;
        const puffScale = isClump
          ? 0.62 + profile.carveStrength * 0.42 + nextRand() * 0.26
          : isMist
            ? 1.02 + profile.carveStrength * 0.62 + nextRand() * 0.38
            : 0.76 + profile.carveStrength * 0.50 + nextRand() * 0.30;

        const iceMix = nextRand() * 0.26;
        emitParticle(
          x + offX,
          y + 0.14 + nextRand() * 0.14,
          z + offZ,
          vx,
          vy,
          vz,
          ttl,
          puffScale,
          isMist ? 0.90 : 1.0 - iceMix * 0.16,
          isMist ? 0.95 : 1.0 - iceMix * 0.05,
          1.0,
          isClump ? PARTICLE_KIND.CLUMP : isMist ? PARTICLE_KIND.MIST : PARTICLE_KIND.SPRAY,
          isClump ? 1.38 + nextRand() * 0.24 : isMist ? 0.50 + nextRand() * 0.14 : 1.05 + nextRand() * 0.20,
          isClump ? 1.12 : isMist ? 3.2 : 1.95,
          isClump ? 0.42 : isMist ? 1.45 : 0.88,
          isClump ? 0.34 + nextRand() * 0.08 : isMist ? 0.08 : 0.26 + nextRand() * 0.08,
          isClump ? 0.48 : isMist ? 0.70 : 0.58,
          isClump ? 0.095 : 0.068,
          isClump ? 8.5 : isMist ? 2.4 : 5.5,
        );
      }

      commitInstanceBuffers();
      sprayCooldown = profile.cooldown;
    },

    spawnLandingBurst(x, y, z, withGrab = false, impactSpeed = 9.0, time = internalClock) {
      const energy = Math.max(0.8, Math.min(1.65, impactSpeed / 9.0));
      const count = withGrab ? 44 : 34;
      sampleAlpineWind(
        time,
        x,
        z,
        0.3,
        currentLevelNumber,
        _emitWind,
        currentGustWindX,
        currentGustWindZ,
      );

      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + nextRand() * 0.26;
        const isGoldAccent = withGrab && k % 5 === 0;
        const isClump = !isGoldAccent && k % 3 === 0;
        const isMist = !isGoldAccent && !isClump && k % 2 === 0;

        const radialSpd = (3.3 + nextRand() * 4.2) * energy * (isClump ? 0.96 : 1.08);
        const lift = (isClump ? 1.35 : 1.15) * energy + nextRand() * (1.95 * energy);
        const windInit = isMist ? 0.72 : isClump ? 0.24 : 0.44;

        emitParticle(
          x + Math.cos(angle) * 0.42,
          y + 0.15 + nextRand() * 0.18,
          z + Math.sin(angle) * 0.46,
          Math.cos(angle) * radialSpd + _emitWind.x * windInit,
          lift + _emitWind.y * windInit,
          Math.sin(angle) * radialSpd + 0.85 + _emitWind.z * windInit,
          isClump ? 0.94 + nextRand() * 0.34 : 0.76 + nextRand() * 0.32,
          isGoldAccent
            ? 0.95
            : isClump
              ? 0.74 + nextRand() * 0.32
              : 0.98 + nextRand() * 0.46,
          isGoldAccent ? 1.0 : isMist ? 0.90 : 0.96,
          isGoldAccent ? 0.86 : isMist ? 0.95 : 0.99,
          isGoldAccent ? 0.44 : 1.0,
          isGoldAccent
            ? PARTICLE_KIND.SPARKLE
            : isClump
              ? PARTICLE_KIND.CLUMP
              : isMist
                ? PARTICLE_KIND.MIST
                : PARTICLE_KIND.SPRAY,
          isGoldAccent ? 0.76 : isClump ? 1.42 : isMist ? 0.50 : 1.10,
          isClump ? 1.15 : isMist ? 3.2 : 1.95,
          isClump ? 0.42 : isMist ? 1.42 : 0.88,
          isClump ? 0.36 : isMist ? 0.08 : 0.26,
          isClump ? 0.48 : 0.62,
          isClump ? 0.095 : 0.068,
          isClump ? 9.2 : isMist ? 2.6 : 6.0,
        );
      }
      commitInstanceBuffers();
    },

    spawnHitBurst(x, y, z, time = internalClock) {
      const count = 32;
      sampleAlpineWind(time, x, z, 0.4, currentLevelNumber, _emitWind);
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + nextRand() * 0.25;
        const isClump = k % 3 === 0;
        const spd = 3.0 + nextRand() * 3.8;
        emitParticle(
          x + Math.cos(angle) * 0.3,
          y + 0.34 + nextRand() * 0.32,
          z + Math.sin(angle) * 0.3,
          Math.cos(angle) * spd + _emitWind.x * (isClump ? 0.22 : 0.48),
          2.5 + nextRand() * 3.1,
          Math.sin(angle) * spd + 1.4 + _emitWind.z * (isClump ? 0.22 : 0.48),
          isClump ? 0.72 + nextRand() * 0.30 : 0.48 + nextRand() * 0.26,
          isClump ? 0.68 + nextRand() * 0.30 : 0.84 + nextRand() * 0.42,
          0.95,
          0.98,
          1.0,
          isClump ? PARTICLE_KIND.CLUMP : PARTICLE_KIND.SPRAY,
          isClump ? 1.38 : 1.05,
          isClump ? 1.15 : 2.2,
          isClump ? 0.38 : 0.88,
          isClump ? 0.34 : 0.24,
          isClump ? 0.50 : 0.62,
          isClump ? 0.095 : 0.068,
          isClump ? 9.5 : 5.8,
        );
      }
      commitInstanceBuffers();
    },

    spawnRescueSparkle(x, y, z, time = internalClock) {
      const count = 18;
      sampleAlpineWind(time, x, z, 0.7, currentLevelNumber, _emitWind);
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + nextRand() * 0.2;
        const spd = 2.2 + nextRand() * 2.6;
        const isGold = k % 2 === 0;
        emitParticle(
          x + Math.cos(angle) * 0.35,
          y + 0.55 + nextRand() * 0.4,
          z + Math.sin(angle) * 0.35,
          Math.cos(angle) * spd + _emitWind.x * 0.32,
          2.6 + nextRand() * 2.4,
          Math.sin(angle) * spd + _emitWind.z * 0.32,
          0.52 + nextRand() * 0.25,
          0.80 + nextRand() * 0.32,
          isGold ? 1.0 : 0.98,
          isGold ? 0.86 : 0.99,
          isGold ? 0.46 : 1.0,
          PARTICLE_KIND.SPARKLE,
          0.72,
          2.2,
          0.65,
          0.20,
          0.60,
          0.06,
          6.5,
        );
      }
      commitInstanceBuffers();
    },

    update(dt, time) {
      const safeDt = Math.min(Math.max(dt, 0), 0.05);
      internalClock = time !== undefined ? time : internalClock + safeDt;

      if (sprayCooldown > 0) {
        sprayCooldown = Math.max(0, sprayCooldown - safeDt);
      }
      if (activeCount <= 0) {
        if (instancedMesh.count !== 0) instancedMesh.count = 0;
        return;
      }

      let queuedSplashes = 0;
      let i = 0;

      // Compact in-place loop strictly over live particles [0 .. activeCount - 1]
      while (i < activeCount) {
        life[i] -= safeDt;
        if (life[i] <= 0) {
          // O(1) swap-and-pop: move last live particle into this slot and decrement activeCount
          const last = activeCount - 1;
          if (i !== last) {
            copySlot(i, last);
          }
          activeCount = last;
          continue;
        }

        _kin.x = posX[i];
        _kin.y = posY[i];
        _kin.z = posZ[i];
        _kin.vx = velX[i];
        _kin.vy = velY[i];
        _kin.vz = velZ[i];
        _kin.gravityScale = gravityScale[i];
        _kin.drag = dragCoeff[i];
        _kin.windFactor = windFactor[i];
        _kin.restitution = restitution[i];
        _kin.friction = friction[i];
        _kin.radius = radius[i];
        _kin.kind = kindArr[i] as ParticleKindCode;
        _kin.bounceCount = bounceCount[i];
        _kin.settled = settledArr[i] === 1;

        stepSnowParticlePhysics(
          _kin,
          safeDt,
          internalClock,
          currentLevelNumber,
          currentRamps,
          _stepRes,
          currentGustWindX,
          currentGustWindZ,
        );

        posX[i] = _kin.x;
        posY[i] = _kin.y;
        posZ[i] = _kin.z;
        velX[i] = _kin.vx;
        velY[i] = _kin.vy;
        velZ[i] = _kin.vz;
        bounceCount[i] = _kin.bounceCount;
        settledArr[i] = _kin.settled ? 1 : 0;

        // Tumble airborne clumps naturally; damp spin smoothly once settled on snow
        const spinDamp = _kin.settled ? 0.15 : 1.0;
        rotX[i] += spinX[i] * spinDamp * safeDt;
        rotY[i] += spinY[i] * spinDamp * safeDt;
        rotZ[i] += spinZ[i] * spinDamp * safeDt;

        if (_stepRes.collided) {
          totalCollisions++;
          if (_stepRes.shouldEmitSplash && queuedSplashes < MAX_SPLASHES_PER_FRAME) {
            splashX[queuedSplashes] = _kin.x;
            splashY[queuedSplashes] = _stepRes.groundY + 0.05;
            splashZ[queuedSplashes] = _kin.z;
            splashNx[queuedSplashes] = _stepRes.nx;
            splashNy[queuedSplashes] = _stepRes.ny;
            splashNz[queuedSplashes] = _stepRes.nz;
            splashSpd[queuedSplashes] = _stepRes.impactSpeed;
            queuedSplashes++;
          }
        }

        writeInstance(i);
        i++;
      }

      // Emit secondary impact splash puffs after compaction loop finishes
      if (queuedSplashes > 0) {
        for (let s = 0; s < queuedSplashes; s++) {
          emitSecondaryGroundSplash(
            splashX[s],
            splashY[s],
            splashZ[s],
            splashNx[s],
            splashNy[s],
            splashNz[s],
            splashSpd[s],
            internalClock,
          );
        }
      }

      commitInstanceBuffers();
    },

    getStats() {
      sampleAlpineWind(
        internalClock,
        0,
        0,
        1.5,
        currentLevelNumber,
        _statsWind,
        currentGustWindX,
        currentGustWindZ,
      );
      return {
        activeCount,
        capacity: MAX_PARTICLES,
        drawCount: instancedMesh.count,
        totalCollisions,
        windX: _statsWind.x,
        windZ: _statsWind.z,
        renderMode: 'instanced',
      };
    },

    reset() {
      sprayCooldown = 0;
      currentGustWindX = 0;
      currentGustWindZ = 0;
      hideAll();
    },

    dispose() {
      scene.remove(instancedMesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
