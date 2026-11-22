import * as THREE from 'three';
import {
  createAlpinePropsSystem,
  type AlpinePineTransform,
  type AlpineRockTransform,
} from './alpinePropsBuilder';
import {
  pickPerimeterPineVariant,
  pickRockVariant,
  pickTrackPineVariant,
} from './alpinePropsLogic';
import {
  computeAvalanchePuffTransform,
  computeAvalancheVisualPose,
  createAvalanchePuffLayouts,
  type AvalanchePuffLayout,
} from './avalancheVisualLogic';
import { createCarvingMoundSystem } from './carvingMoundBuilder';
import { createLilYetiCollectibleSystem } from './collectibleBuilder';
import { createFallenLogSystem } from './fallenLogBuilder';
import {
  MAX_SPAWNED_PINES,
  MAX_SPAWNED_ROCKS,
} from './obstacleSpawner';
import {
  createOutcomeVisuals,
  type OutcomeVisuals,
} from './outcomeVisuals';
import { createRampSystem } from './rampBuilder';
import { createBackgroundMountains } from './backgroundMountainBuilder';
import { createMountainShelter } from './shelterBuilder';
import { createWinterSkyDome } from './skyDome';
import {
  createSnowPointsSystem,
  type SnowSpraySystem,
} from './snowPointsSystem';
import {
  createSnowfallSystem,
  type SnowfallSystem,
} from './snowfallSystem';
import {
  createSnowTrailSystem,
  type SnowTrailSystem,
} from './snowTrailSystem';
import {
  TRACK_END_PADDING,
  TRACK_LENGTH,
  TRACK_START_PADDING,
  getActiveTrackLevelNumber,
  getGroundHeightAt,
  getTrackCenterX,
  getTrackElevation,
  getTrackExtraGradientForLevel,
  getTrackHalfWidth,
  setActiveTrackProfile,
} from './trackData';
import type { LilYetiCollectible, TrackObstacle, TrackRamp } from './types';

export type { OutcomeVisuals, SnowSpraySystem, SnowTrailSystem };

export interface WorldHandles {
  syncTrackForLevel: (
    levelNumber: number,
    levelLength: number,
    ramps: readonly TrackRamp[],
    obstacles: TrackObstacle[],
    collectibles: readonly LilYetiCollectible[],
  ) => void;
  syncObstacles: (obstacles: TrackObstacle[]) => void;
  updateCollectibles: (collectibles: readonly LilYetiCollectible[], time: number) => void;
  setLevelLength: (levelLength: number) => void;
  updateSky: (cameraPosition: THREE.Vector3) => void;
  setSkyAtmosphericHaze: (r: number, g: number, b: number, hazeAmount: number) => void;
  updateShelter: (time: number) => void;
  updateAvalanche: (
    playerDistance: number,
    avalancheDistance: number,
    time: number,
    visible?: boolean,
    cameraPosition?: THREE.Vector3,
  ) => void;
  snowSpray: SnowSpraySystem;
  snowfall: SnowfallSystem;
  snowTrail: SnowTrailSystem;
  outcomeVisuals: OutcomeVisuals;
  getCarvingMoundCount: () => number;
  dispose: () => void;
}

/** Procedural tileable snow color + subtle carving track texture. */
function createSnowTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cctx = colorCanvas.getContext('2d')!;

  cctx.fillStyle = '#eef4fc';
  cctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 8) {
    cctx.fillStyle = x % 16 === 0 ? 'rgba(182, 200, 228, 0.22)' : 'rgba(255, 255, 255, 0.25)';
    cctx.fillRect(x, 0, 3, size);
  }

  for (let i = 0; i < 650; i++) {
    const sx = (i * 73) % size;
    const sy = (i * 137) % size;
    const r = 1 + (i % 3);
    cctx.fillStyle = i % 2 === 0 ? 'rgba(164, 184, 218, 0.16)' : 'rgba(255, 255, 255, 0.45)';
    cctx.beginPath();
    cctx.arc(sx, sy, r, 0, Math.PI * 2);
    cctx.fill();
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 8) {
    bctx.fillStyle = x % 16 === 0 ? '#747474' : '#8d8d8d';
    bctx.fillRect(x, 0, 4, size);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(9, 130);
  map.anisotropy = Math.min(8, maxAnisotropy);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(9, 130);

  return { map, bumpMap };
}

const TERRAIN_CROSS_PROFILE = [
  -3.8, -2.5, -1.6, -1.15, -0.95, -0.55, 0, 0.55, 0.95, 1.15, 1.6, 2.5, 3.8,
] as const;

interface SnowTerrainHandle {
  mesh: THREE.Mesh;
  rebuildVertices: () => void;
}

/** Build continuous snow terrain ribbon with in-place vertex updates for distinct per-level arenas. */
function createSnowTerrain(
  snowMap: THREE.CanvasTexture,
  snowBump: THREE.CanvasTexture,
  disposables: Array<{ dispose: () => void }>,
): SnowTerrainHandle {
  const zMin = -TRACK_START_PADDING;
  const zMax = TRACK_LENGTH + TRACK_END_PADDING;
  const zStep = 5;
  const rows = Math.ceil((zMax - zMin) / zStep) + 1;
  const cols = TERRAIN_CROSS_PROFILE.length;

  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const colors = new Float32Array(rows * cols * 3);
  const indices: number[] = [];

  const trackSnow = new THREE.Color(0xeef5ff);
  const trackGroove = new THREE.Color(0xdce8fa);
  const steepIceTint = new THREE.Color(0xc2dcf8);
  const bankShadow = new THREE.Color(0xa6bde2);
  const outerRidge = new THREE.Color(0xcbd9ef);
  const tempColor = new THREE.Color();

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', uvAttr);
  geo.setAttribute('color', colAttr);
  geo.setIndex(indices);

  const rebuildVertices = () => {
    const activeLevel = getActiveTrackLevelNumber();
    for (let r = 0; r < rows; r++) {
      const distZ = zMin + r * zStep;
      const centerX = getTrackCenterX(distZ);
      const halfW = getTrackHalfWidth(distZ);
      const steepGrad = getTrackExtraGradientForLevel(activeLevel, distZ);
      const steepTintMix = steepGrad > 0.02 ? Math.min(0.68, steepGrad * 1.85) : 0;

      for (let c = 0; c < cols; c++) {
        const frac = TERRAIN_CROSS_PROFILE[c];
        const worldX = centerX + frac * halfW;
        const worldY = getGroundHeightAt(worldX, distZ);
        const worldZ = -distZ;

        const idx = r * cols + c;
        positions[idx * 3] = worldX;
        positions[idx * 3 + 1] = worldY;
        positions[idx * 3 + 2] = worldZ;

        uvs[idx * 2] = (frac + 3.8) / 7.6;
        uvs[idx * 2 + 1] = distZ / (zMax - zMin);

        const absFrac = Math.abs(frac);
        if (absFrac <= 0.62) {
          tempColor.copy(trackSnow).lerp(trackGroove, absFrac * 0.45);
          if (steepTintMix > 0) {
            tempColor.lerp(steepIceTint, steepTintMix * 0.65);
          }
        } else if (absFrac <= 1.2) {
          const t = (absFrac - 0.62) / 0.58;
          tempColor.copy(trackGroove).lerp(bankShadow, t);
          if (steepTintMix > 0) {
            tempColor.lerp(steepIceTint, steepTintMix * 0.35);
          }
        } else {
          const t = Math.min(1, (absFrac - 1.2) / 1.4);
          tempColor.copy(bankShadow).lerp(outerRidge, t);
        }

        colors[idx * 3] = tempColor.r;
        colors[idx * 3 + 1] = tempColor.g;
        colors[idx * 3 + 2] = tempColor.b;
      }
    }

    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };

  rebuildVertices();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: snowMap,
    bumpMap: snowBump,
    bumpScale: 0.04,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
  });

  disposables.push(geo, mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return { mesh, rebuildVertices };
}

/** Build the complete 3D alpine mountain world, instanced scenery, ramps, obstacles, avalanche wall, and snow spray. */
export function buildAlpineWorld(
  scene: THREE.Scene,
  obstacles: TrackObstacle[],
  ramps: readonly TrackRamp[],
  collectibles: readonly LilYetiCollectible[],
  maxAnisotropy: number,
  initialLevelNumber = 1,
  initialLevelLength = 840,
): WorldHandles {
  setActiveTrackProfile(initialLevelNumber);

  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // 1. Camera-Following Winter Sky Dome Shader + Resizable Snow Terrain
  const skyDome = createWinterSkyDome(scene);
  const updateSky = (cameraPosition: THREE.Vector3) => {
    skyDome.syncToCamera(cameraPosition);
  };

  const { map: snowMap, bumpMap: snowBump } = createSnowTextures(maxAnisotropy);
  disposables.push(snowMap, snowBump);

  const terrain = createSnowTerrain(snowMap, snowBump, disposables);
  scene.add(terrain.mesh);

  // 2. Multi-Variant Sculpted Alpine Pines (5 variants) & Chiseled Granite Boulders (3 variants) with Snow Accumulation
  const alpineProps = createAlpinePropsSystem(scene, maxAnisotropy);
  const perimRocksBuf: AlpineRockTransform[] = [];
  const perimPinesBuf: AlpinePineTransform[] = [];
  const trackRocksBuf: AlpineRockTransform[] = [];
  const trackPinesBuf: AlpinePineTransform[] = [];

  /** Rebuild flanking snowbank boulder outcrops & multi-variant pine groves to hug the active level's unique trail shape. */
  const rebuildPerimeterScenery = (levelLength: number) => {
    perimRocksBuf.length = 0;
    perimPinesBuf.length = 0;

    let rIdx = 0;
    for (let distZ = 18; distZ < levelLength + 46 && rIdx < 165; distZ += 22) {
      // Keep the finish plaza & shelter framing clean
      if (distZ >= levelLength - 22 && distZ <= levelLength + 44) continue;
      const centerX = getTrackCenterX(distZ);
      const halfW = getTrackHalfWidth(distZ);
      for (const side of [-1, 1]) {
        if (rIdx >= 165) break;
        const jitter = Math.sin(distZ * 0.13 + side * 2.1);
        if (jitter < -0.32) continue;

        const offset = halfW + 2.65 + (jitter + 0.5) * 2.15;
        const wx = centerX + side * offset;
        const wy = getGroundHeightAt(wx, distZ) - 0.82;
        const scaleAbs = Math.abs(jitter);
        perimRocksBuf.push({
          variant: pickRockVariant(rIdx, distZ, side * offset),
          x: wx,
          y: wy,
          z: -distZ,
          sx: 2.35 + scaleAbs * 1.15,
          sy: 1.95 + scaleAbs * 0.92,
          sz: 2.55 + scaleAbs * 1.22,
          rotY: distZ * 0.37 + side * 1.35,
          tiltX: 0.08,
          tiltZ: -side * 0.18,
          tint: 0.90 + scaleAbs * 0.14,
        });
        rIdx++;

        // Add a nestled companion shoulder boulder on select outcrops for natural trailside granite clusters
        if (jitter > 0.28 && rIdx < 165) {
          const compZ = distZ + 4.2 + scaleAbs * 2.1;
          const compCenterX = getTrackCenterX(compZ);
          const compHalfW = getTrackHalfWidth(compZ);
          const compX = compCenterX + side * (compHalfW + 1.95 + scaleAbs * 1.35);
          const compY = getGroundHeightAt(compX, compZ) - 0.56;
          perimRocksBuf.push({
            variant: pickRockVariant(rIdx + 2, compZ, compX - compCenterX),
            x: compX,
            y: compY,
            z: -compZ,
            sx: 1.45 + scaleAbs * 0.55,
            sy: 1.22 + scaleAbs * 0.45,
            sz: 1.55 + scaleAbs * 0.55,
            rotY: compZ * 0.53 - side * 0.85,
            tiltX: 0.06,
            tiltZ: -side * 0.16,
            tint: 0.88 + scaleAbs * 0.12,
          });
          rIdx++;
        }
      }
    }

    let pIdx = 0;
    for (let distZ = -20; distZ < levelLength + 68 && pIdx < 560; distZ += 12.5) {
      const centerX = getTrackCenterX(distZ);
      const halfW = getTrackHalfWidth(distZ);
      const nearShelter = distZ >= levelLength - 16 && distZ <= levelLength + 48;

      for (const side of [-1, 1]) {
        for (let tier = 0; tier < 2; tier++) {
          if (pIdx >= 560) break;
          const hash = Math.sin(distZ * 0.21 + side * 3.7 + tier * 11.3);
          const variant = pickPerimeterPineVariant(pIdx, distZ, side, tier);

          // Push perimeter pines slightly wider around the shelter plaza so broad branches frame the cabin cleanly
          const minMargin = nearShelter
            ? halfW + 7.4 + tier * 6.4
            : variant === 4
              ? halfW + 3.4 + Math.abs(hash) * 2.6
              : halfW + 4.5 + tier * 7.2 + Math.abs(hash) * 4.4;
          const wx = centerX + side * minMargin;
          const zPlaced = distZ + hash * 4.0;
          const wy = getGroundHeightAt(wx, zPlaced) - 0.34;

          const baseScale =
            variant === 4
              ? 0.95 + Math.abs(hash) * 0.42
              : 1.08 + tier * 0.34 + Math.abs(hash) * 0.38;
          const heightBias = variant === 0 ? 1.07 : variant === 2 ? 0.96 : 1.0;

          perimPinesBuf.push({
            variant,
            x: wx,
            y: wy,
            z: -zPlaced,
            sx: baseScale * (0.94 + Math.abs(Math.sin(distZ * 0.11 + tier)) * 0.14),
            sy: baseScale * heightBias * (0.94 + Math.abs(Math.cos(distZ * 0.17 + side)) * 0.16),
            sz: baseScale * (0.94 + Math.abs(Math.sin(distZ * 0.11 + tier)) * 0.14),
            rotY: hash * Math.PI * 2 + pIdx * 0.47,
            tiltX: hash * 0.038,
            tiltZ: -hash * 0.034,
            tint: 0.87 + Math.abs(hash) * 0.22,
          });
          pIdx++;
        }
      }
    }

    alpineProps.setPerimeterProps(perimRocksBuf, perimPinesBuf);
  };

  // Sync dynamic gameplay rocks & pines from spawner output with zero GPU re-allocation
  // Preserves exact obstacle world coordinates, scale multipliers, and collision hitboxes
  const syncObstacles = (nextObstacles: TrackObstacle[]) => {
    trackRocksBuf.length = 0;
    trackPinesBuf.length = 0;

    for (let i = 0; i < nextObstacles.length; i++) {
      const o = nextObstacles[i];
      if (o.kind === 'rock' && trackRocksBuf.length < MAX_SPAWNED_ROCKS) {
        trackRocksBuf.push({
          variant: pickRockVariant(o.id, o.z, o.offsetX),
          x: o.worldX,
          y: o.worldY,
          z: -o.z,
          sx: 1.32 * o.scale * o.scaleX,
          sy: 1.12 * o.scale * o.scaleY,
          sz: 1.24 * o.scale * o.scaleZ,
          rotY: o.rotationY,
          tiltX: o.tiltX,
          tiltZ: o.tiltZ,
          tint: o.tint,
        });
      } else if (o.kind === 'pine' && trackPinesBuf.length < MAX_SPAWNED_PINES) {
        trackPinesBuf.push({
          variant: pickTrackPineVariant(o.id, o.z, o.offsetX),
          x: o.worldX,
          y: o.worldY,
          z: -o.z,
          sx: 1.06 * o.scale * o.scaleX,
          sy: 1.06 * o.scale * o.scaleY,
          sz: 1.06 * o.scale * o.scaleZ,
          rotY: o.rotationY,
          tiltX: o.tiltX,
          tiltZ: o.tiltZ,
          tint: o.tint,
        });
      }
    }

    alpineProps.setTrackProps(trackRocksBuf, trackPinesBuf);
    fallenLogSystem.syncFallenLogs(nextObstacles);
  };

  // 2b. Fallen Pine Log Obstacles (Level 3+ full-width jumpable hurdles)
  const fallenLogSystem = createFallenLogSystem(scene);

  // 2c. Glowing 3D Lil Yeti Collectibles along the snow path
  const collectibleSystem = createLilYetiCollectibleSystem(scene);

  // 3. Dedicated 3D Snow Ramps System
  const rampSystem = createRampSystem(scene, maxAnisotropy);

  // 4. Distant Sculpted Multi-Ridge Alpine Background Mountains (asymmetrical ridges + slope-following rock & snow)
  const backgroundMountains = createBackgroundMountains(scene);

  // 5. Mountain Rescue Shelter & Flush Checkered Finish Area (approved 3D shelter preserved intact)
  const shelter = createMountainShelter(scene, maxAnisotropy);
  const setLevelLength = (levelLength: number) => {
    shelter.setLevelLength(levelLength);
  };
  const updateShelter = (time: number) => {
    shelter.update(time);
  };

  // 5b. Advanced Pooled Three.js Points Snow Spray (Gravity, Wind, & 3D Ground/Ramp Collisions)
  const snowSpray = createSnowPointsSystem(scene);

  // 5c. Ambient Alpine Snowfall Particle System (escalates approaching shelter & on avalanche danger)
  const snowfall = createSnowfallSystem(scene);

  // 3b. Level 4 Outside-Curve Boundary Snow Mounds (single InstancedMesh, zero duplication on Retry/Next Level)
  const carvingMounds = createCarvingMoundSystem(scene, snowMap, snowBump);

  let currentWorldLevel = -1;
  const syncTrackForLevel = (
    levelNumber: number,
    levelLength: number,
    nextRamps: readonly TrackRamp[],
    nextObstacles: TrackObstacle[],
    nextCollectibles: readonly LilYetiCollectible[],
  ) => {
    setActiveTrackProfile(levelNumber);
    if (currentWorldLevel !== levelNumber) {
      terrain.rebuildVertices();
      rebuildPerimeterScenery(levelLength);
      carvingMounds.syncForLevel(levelNumber);
      currentWorldLevel = levelNumber;
    }
    rampSystem.syncRamps(nextRamps);
    syncObstacles(nextObstacles);
    collectibleSystem.syncCollectibles(nextCollectibles);
    shelter.setLevelLength(levelLength);
    snowSpray.setLevelContext(levelNumber, nextRamps);
  };

  syncTrackForLevel(
    initialLevelNumber,
    initialLevelLength,
    ramps,
    obstacles,
    collectibles,
  );

  // 6. Camera-Safe Visual Avalanche Surge (Low center snow rollers + flanking snow plumes)
  const avalancheGroup = new THREE.Group();
  avalancheGroup.visible = false;
  const matAvalancheCore = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeaf2ff,
      emissive: 0x3b537e,
      emissiveIntensity: 0.14,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9,
    }),
  );
  const matAvalancheMist = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf6faff,
      transparent: true,
      opacity: 0.62,
      roughness: 0.95,
      depthWrite: false,
    }),
  );
  const puffGeo = trackGeo(new THREE.SphereGeometry(1, 14, 10));
  const puffLayouts = createAvalanchePuffLayouts();
  const avalanchePuffs: Array<{
    mesh: THREE.Mesh;
    layout: AvalanchePuffLayout;
  }> = [];

  for (let i = 0; i < puffLayouts.length; i++) {
    const layout = puffLayouts[i];
    const puff = new THREE.Mesh(
      puffGeo,
      layout.isMist ? matAvalancheMist : matAvalancheCore,
    );
    puff.position.set(layout.baseX, layout.baseY, layout.baseZ);
    puff.scale.set(
      layout.baseRadius * 1.18,
      layout.baseRadius * layout.heightSquash,
      layout.baseRadius * 0.96,
    );
    avalancheGroup.add(puff);
    avalanchePuffs.push({ mesh: puff, layout });
  }
  scene.add(avalancheGroup);

  const updateAvalanche = (
    playerDistance: number,
    avalancheDistance: number,
    time: number,
    visible = true,
    cameraPosition?: THREE.Vector3,
  ) => {
    const camX = cameraPosition ? cameraPosition.x : getTrackCenterX(playerDistance);
    const camY = cameraPosition
      ? cameraPosition.y
      : getTrackElevation(playerDistance) + 5.05;
    const camZ = cameraPosition ? cameraPosition.z : -(playerDistance - 9.8);

    const pose = computeAvalancheVisualPose({
      playerDistance,
      avalancheDistance,
      cameraWorldZ: camZ,
      visible,
    });

    if (!pose.shouldRender) {
      avalancheGroup.visible = false;
      return;
    }

    const avalZ = pose.groupTrackDistance;
    const centerX = getTrackCenterX(avalZ);
    const groundY = getTrackElevation(avalZ);
    const groupWorldZ = -avalZ;
    avalancheGroup.position.set(centerX, groundY, groupWorldZ);

    matAvalancheCore.opacity = 0.88 * pose.visibilityScale;
    matAvalancheMist.opacity = 0.58 * pose.visibilityScale;

    let anyVisible = false;
    for (let i = 0; i < avalanchePuffs.length; i++) {
      const { mesh, layout } = avalanchePuffs[i];
      const xf = computeAvalanchePuffTransform({
        puff: layout,
        pose,
        groupWorldX: centerX,
        groupWorldY: groundY,
        groupWorldZ,
        cameraX: camX,
        cameraY: camY,
        cameraZ: camZ,
        time,
      });

      if (xf.cameraClearance <= 0.01) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      anyVisible = true;
      mesh.position.set(xf.localX, xf.localY, xf.localZ);
      mesh.scale.set(xf.scaleX, xf.scaleY, xf.scaleZ);
      // Forward tumbling spin so the snow surge feels like rolling powder rather than static balls
      mesh.rotation.set(-time * 3.8 + layout.phase, layout.phase * 0.4, 0);
    }

    avalancheGroup.visible = anyVisible;
  };


  // 8. Persistent Fading Snowboard Snow Trail Ribbon (Single draw call, breaks cleanly on jumps)
  const snowTrail = createSnowTrailSystem(scene);

  // 9. Outcome Visuals (Victory golden confetti + Game Over cartoon snow mounds)
  const outcomeVisuals = createOutcomeVisuals(scene);

  const dispose = () => {
    skyDome.dispose();
    alpineProps.dispose();
    backgroundMountains.dispose();
    shelter.dispose();
    rampSystem.dispose();
    fallenLogSystem.dispose();
    collectibleSystem.dispose();
    carvingMounds.dispose();
    snowSpray.dispose();
    snowfall.dispose();
    snowTrail.dispose();
    outcomeVisuals.dispose();
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    syncTrackForLevel,
    syncObstacles,
    updateCollectibles: collectibleSystem.update,
    setLevelLength,
    updateSky,
    setSkyAtmosphericHaze: skyDome.setAtmosphericHaze,
    updateShelter,
    updateAvalanche,
    snowSpray,
    snowfall,
    snowTrail,
    outcomeVisuals,
    getCarvingMoundCount: carvingMounds.getActiveCount,
    dispose,
  };
}
