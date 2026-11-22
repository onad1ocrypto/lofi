import {
  computeArenaDifficultyProfile,
  type ArenaDifficultyProfile,
} from './arenaDifficulty';
import {
  TRACK_LENGTH,
  getGroundHeightAt,
  getTrackCenterX,
  getTrackHalfWidth,
} from './trackData';
import type {
  LevelConfig,
  ManualObstacleSpec,
  ObstacleKind,
  TrackObstacle,
  TrackRamp,
  TrackRestZone,
} from './types';

export const DEFAULT_SPAWN_SEED = 20261121;
export const MAX_SPAWNED_ROCKS = 80;
export const MAX_SPAWNED_PINES = 80;

const SAFE_OPENING_Z = 114;
const SAFE_FINISH_BUFFER = 96;
const EDGE_MARGIN = 1.55;
const PLAYER_RADIUS_EST = 0.72;

/** Fast deterministic seeded PRNG (Mulberry32). */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Generate a fresh non-repeating seed for each new run. */
let seedCounter = 1;
export function createRandomSpawnSeed(): number {
  seedCounter += 1;
  const timeBits = typeof Date !== 'undefined' ? Date.now() & 0xfffffff : 0;
  return ((timeBits ^ Math.imul(seedCounter, 2654435761)) >>> 0) || DEFAULT_SPAWN_SEED;
}

/** Vertical clearance height (m) needed to jump cleanly over an obstacle. */
export function computeObstacleClearanceHeight(
  kind: ObstacleKind,
  scale: number,
  scaleY: number,
): number {
  // Fallen logs (~1.05m) and low alpine boulders (~1.32m) can be cleared cleanly on jumps; tall pines (~5.1m+) block air paths
  if (kind === 'fallen_log') {
    return 1.05 * scale;
  }
  const baseHeight = kind === 'rock' ? 1.32 : 5.1;
  return baseHeight * scale * scaleY;
}

/** Check whether a candidate (z, offsetX, radius) encroaches on any ramp entry, deck, or landing runway. */
export function isInsideRampSafetyZone(
  ramps: readonly TrackRamp[],
  z: number,
  offsetX: number,
  radius: number,
): boolean {
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    const zMin = r.zStart - 18;
    const zMax = r.zStart + r.length + r.landingClearMeters;
    if (z < zMin || z > zMax) continue;

    // For bonus split-lane ramps, protect the bonus lane & landing corridor cleanly without erasing the central split divider;
    // for single-trail ramps, protect the full trail width across the takeoff & landing zone
    const lateralGuard = r.kind === 'bonus' ? r.width * 0.5 + 1.85 + radius : 16.0;
    if (Math.abs(offsetX - r.offsetX) <= lateralGuard) {
      return true;
    }
  }
  return false;
}

function isInsideRestZone(restZones: readonly TrackRestZone[], z: number): boolean {
  for (let i = 0; i < restZones.length; i++) {
    if (z >= restZones[i].zStart && z <= restZones[i].zEnd) {
      return true;
    }
  }
  return false;
}

export interface SpawnOptions {
  levelNumber?: number;
  levelLength?: number;
  densityScale?: number;
  difficulty?: ArenaDifficultyProfile;
  ramps?: readonly TrackRamp[];
  restZones?: readonly TrackRestZone[];
  manualObstacles?: readonly ManualObstacleSpec[];
}

/**
 * Build a TrackObstacle with natural organic variations from either a manual blueprint or procedural roll.
 */
function createOrganicObstacle(
  id: number,
  kind: ObstacleKind,
  z: number,
  offsetX: number,
  rng: () => number,
  fixedScale?: number,
): TrackObstacle {
  const worldX = getTrackCenterX(z) + offsetX;
  const worldY = getGroundHeightAt(worldX, z);

  if (kind === 'fallen_log') {
    const scale = fixedScale ?? randRange(rng, 0.96, 1.06);
    const halfW = getTrackHalfWidth(z);
    // Span cleanly across the entire groomed snow road so players jump over with W / ArrowUp
    const barHalfWidth = Math.max(8.5, halfW - 0.15);
    const halfDepthZ = 0.72 * scale;
    const clearanceHeight = computeObstacleClearanceHeight('fallen_log', scale, 1);

    return {
      id,
      kind: 'fallen_log',
      z,
      offsetX,
      worldX,
      worldY,
      radius: halfDepthZ,
      barHalfWidth,
      halfDepthZ,
      clearanceHeight,
      scale,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rotationY: rng() < 0.5 ? 0 : Math.PI, // Flip root-end left or right organically
      tiltX: 0,
      tiltZ: 0,
      tint: randRange(rng, 0.92, 1.08),
      hit: false,
    };
  }

  const scale =
    fixedScale ??
    (kind === 'pine' ? randRange(rng, 0.84, 1.34) : randRange(rng, 0.82, 1.32));
  const scaleX =
    kind === 'pine' ? randRange(rng, 0.92, 1.1) : randRange(rng, 0.86, 1.2);
  const scaleY =
    kind === 'pine' ? randRange(rng, 0.9, 1.2) : randRange(rng, 0.82, 1.16);
  const scaleZ =
    kind === 'pine' ? randRange(rng, 0.92, 1.1) : randRange(rng, 0.86, 1.2);
  const rotationY = rng() * Math.PI * 2;
  const tiltX =
    kind === 'pine' ? randRange(rng, -0.06, 0.06) : randRange(rng, -0.16, 0.16);
  const tiltZ =
    kind === 'pine' ? randRange(rng, -0.06, 0.06) : randRange(rng, -0.16, 0.16);
  const tint =
    kind === 'pine' ? randRange(rng, 0.86, 1.14) : randRange(rng, 0.88, 1.12);

  const baseRadius = kind === 'rock' ? 1.2 : 1.0;
  const footprintFactor = Math.max(scaleX, scaleZ);
  const radius = baseRadius * scale * Math.min(1.16, footprintFactor);
  const clearanceHeight = computeObstacleClearanceHeight(kind, scale, scaleY);

  return {
    id,
    kind,
    z,
    offsetX,
    worldX,
    worldY,
    radius,
    clearanceHeight,
    scale,
    scaleX,
    scaleY,
    scaleZ,
    rotationY,
    tiltX,
    tiltZ,
    tint,
    hit: false,
  };
}

/**
 * Hybrid hand-designed + organic obstacle spawner for LOFI ICE ESCAPE:
 * - Places each level's curated manual formations (slalom gates, Level 3+ fallen logs, split divider, etc.) first.
 * - Fills non-rest stretches with organic varied pine & rock clusters while guaranteeing:
 *   1. Unobstructed opening runway (~4.4s) & clear shelter finish approach (>= 96m).
 *   2. Zero obstacles inside ramp entries, decks, and full landing zones.
 *   3. Clean approach & landing runway around every fallen log hurdle.
 *   4. Continuously passable safe carving corridor (>= 4.8m wide).
 *   5. Accurate vertical `clearanceHeight` per obstacle for height-aware jump collision.
 */
export function spawnTrackObstacles(
  seed: number = DEFAULT_SPAWN_SEED,
  options: SpawnOptions = {},
): TrackObstacle[] {
  const levelNumber = options.levelNumber ?? 1;
  const levelLength = options.levelLength ?? TRACK_LENGTH;
  const difficulty =
    options.difficulty ?? computeArenaDifficultyProfile(levelNumber);
  const ramps = options.ramps ?? [];
  const restZones = options.restZones ?? [];
  const manualObstacles = options.manualObstacles ?? [];
  const hasManual = manualObstacles.length > 0;
  const densityScale =
    options.densityScale ?? (hasManual ? difficulty.densityScale : 1.0);

  const rng = createRng(seed);
  const obstacles: TrackObstacle[] = [];
  const fallenLogZs: number[] = [];

  let id = 0;
  let rockCount = 0;
  let pineCount = 0;

  const maxSpawnZ = Math.max(SAFE_OPENING_Z + 120, levelLength - SAFE_FINISH_BUFFER);

  // 1. Place hand-authored manual formations for the level (strictly respecting ramp safety, Level 3+ fallen log rule & finish buffer)
  for (let i = 0; i < manualObstacles.length; i++) {
    const spec = manualObstacles[i];
    if (spec.kind === 'fallen_log' && levelNumber < 3) continue;
    if (spec.z < SAFE_OPENING_Z || spec.z > maxSpawnZ) continue;
    const obs = createOrganicObstacle(id++, spec.kind, spec.z, spec.offsetX, rng, spec.scale);
    if (isInsideRampSafetyZone(ramps, obs.z, obs.offsetX, obs.radius)) {
      continue;
    }
    obstacles.push(obs);
    if (obs.kind === 'rock') rockCount++;
    else if (obs.kind === 'pine') pineCount++;
    else if (obs.kind === 'fallen_log') fallenLogZs.push(obs.z);
  }

  const isNearFallenLog = (candZ: number): boolean => {
    for (let i = 0; i < fallenLogZs.length; i++) {
      if (Math.abs(candZ - fallenLogZs[i]) < 20) return true;
    }
    return false;
  };

  // 2. Fill remaining stretches organically while honoring rest zones, manual clusters, fallen logs, and ramp buffers
  let z = SAFE_OPENING_Z + (hasManual ? 14 : 0);
  let corridorOffset = randRange(rng, -2.2, 2.2);

  const effectiveCorridorBase = hasManual ? difficulty.corridorHalfWidthBase : 3.2;
  const effectiveMinSpacingZ = hasManual ? difficulty.minObstacleSpacingZ : 13.5;
  const effectiveMinSpacingX = hasManual ? difficulty.minObstacleSpacingX : 4.4;
  const effectiveMaxCluster = hasManual ? difficulty.maxClusterPerRow : 3;

  while (z < maxSpawnZ) {
    const progress = (z - SAFE_OPENING_Z) / (maxSpawnZ - SAFE_OPENING_Z);

    if (isInsideRestZone(restZones, z) || isNearFallenLog(z)) {
      z += hasManual ? Math.max(11, difficulty.minRowStepMeters * 0.65) : 16;
      continue;
    }

    const halfW = getTrackHalfWidth(z);
    const usableHalfW = Math.max(4.5, halfW - EDGE_MARGIN);

    // Guarantee a smooth, navigable carving corridor >= 5.0m wide (plus player clearance)
    const corridorHalfWidth = Math.max(2.5, effectiveCorridorBase - progress * 0.22);
    const maxCorridorCenter = Math.max(1.2, usableHalfW - corridorHalfWidth - 0.6);

    const shiftRange = hasManual
      ? Math.min(6.4, 4.0 + (levelNumber - 1) * 0.26)
      : 4.6;
    const shift = randRange(rng, -shiftRange, shiftRange);
    corridorOffset = Math.max(
      -maxCorridorCenter,
      Math.min(maxCorridorCenter, corridorOffset + shift),
    );

    // Progressive cluster density across 10 levels: gentle solo/pairs in Lv1-3 -> medium clusters Lv4-6 -> dense slaloms Lv7-10
    let targetClusterCount: number;
    if (progress < 0.14) {
      targetClusterCount = levelNumber >= 6 && hasManual && rng() < 0.45 ? 2 : 1;
    } else if (progress < 0.45) {
      targetClusterCount =
        rng() < Math.min(0.92, (hasManual ? 0.48 : 0.68) * densityScale)
          ? Math.min(effectiveMaxCluster, levelNumber >= 7 && hasManual && rng() < 0.42 ? 3 : 2)
          : 1;
    } else if (progress < 0.78) {
      targetClusterCount =
        rng() < Math.min(0.92, (hasManual ? 0.34 : 0.34) * densityScale)
          ? Math.min(effectiveMaxCluster, 3)
          : Math.min(effectiveMaxCluster, 2);
    } else {
      const heavyRoll = rng();
      if (hasManual && levelNumber >= 8 && heavyRoll < 0.42) {
        targetClusterCount = effectiveMaxCluster;
      } else {
        targetClusterCount =
          heavyRoll < Math.min(0.92, (hasManual ? 0.42 : 0.46) * densityScale)
            ? Math.min(effectiveMaxCluster, 3)
            : Math.min(effectiveMaxCluster, 2);
      }
    }

    const pineBias = 0.5 + Math.sin(z * 0.011 + seed * 0.01) * 0.18;
    const placedInRow: Array<{ offsetX: number; radius: number }> = [];

    for (let c = 0; c < targetClusterCount; c++) {
      let kind: ObstacleKind = rng() < pineBias ? 'pine' : 'rock';
      if (kind === 'rock' && rockCount >= MAX_SPAWNED_ROCKS) kind = 'pine';
      if (kind === 'pine' && pineCount >= MAX_SPAWNED_PINES) kind = 'rock';
      if (rockCount >= MAX_SPAWNED_ROCKS && pineCount >= MAX_SPAWNED_PINES) break;

      const zJitter = c === 0 ? 0 : randRange(rng, -2.6, 2.8);
      const obsZ = Math.max(SAFE_OPENING_Z, Math.min(maxSpawnZ, z + zJitter));
      if (isInsideRestZone(restZones, obsZ) || isNearFallenLog(obsZ)) continue;

      const probeObs = createOrganicObstacle(id, kind, obsZ, 0, rng);
      const radius = probeObs.radius;

      let chosenOffset: number | null = null;
      for (let attempt = 0; attempt < 14; attempt++) {
        const candidateX = randRange(
          rng,
          -(usableHalfW - radius * 0.4),
          usableHalfW - radius * 0.4,
        );

        const distToCorridor = Math.abs(candidateX - corridorOffset);
        if (distToCorridor < corridorHalfWidth + radius + PLAYER_RADIUS_EST * 0.5) {
          continue;
        }

        if (isInsideRampSafetyZone(ramps, obsZ, candidateX, radius)) {
          continue;
        }

        // Prevent overlapping same-row siblings or nearby manual formations
        let overlaps = false;
        for (let s = 0; s < placedInRow.length; s++) {
          const sib = placedInRow[s];
          if (Math.abs(candidateX - sib.offsetX) < radius + sib.radius + 1.5) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        for (let m = 0; m < obstacles.length; m++) {
          const existing = obstacles[m];
          if (Math.abs(existing.z - obsZ) < effectiveMinSpacingZ) {
            if (Math.abs(existing.offsetX - candidateX) < radius + existing.radius + effectiveMinSpacingX) {
              overlaps = true;
              break;
            }
          }
        }
        if (overlaps) continue;

        // Guarantee every longitudinal window retains a clean passable carving gap >= 4.75m
        const checkHalfW = Math.max(4.5, getTrackHalfWidth(obsZ) - 1.15);
        const intervals: Array<{ start: number; end: number }> = [
          {
            start: candidateX - radius - PLAYER_RADIUS_EST,
            end: candidateX + radius + PLAYER_RADIUS_EST,
          },
        ];
        for (let m = 0; m < obstacles.length; m++) {
          const ex = obstacles[m];
          if (ex.kind === 'fallen_log') continue;
          if (Math.abs(ex.z - obsZ) <= 8.0) {
            intervals.push({
              start: ex.offsetX - ex.radius - PLAYER_RADIUS_EST,
              end: ex.offsetX + ex.radius + PLAYER_RADIUS_EST,
            });
          }
        }
        intervals.sort((a, b) => a.start - b.start);
        let cursor = -checkHalfW;
        let maxGap = 0;
        for (let k = 0; k < intervals.length; k++) {
          if (intervals[k].start > cursor) {
            maxGap = Math.max(maxGap, intervals[k].start - cursor);
          }
          cursor = Math.max(cursor, intervals[k].end);
        }
        if (checkHalfW > cursor) {
          maxGap = Math.max(maxGap, checkHalfW - cursor);
        }
        if (maxGap < 4.75) continue;

        chosenOffset = candidateX;
        break;
      }

      if (chosenOffset === null) continue;

      const worldX = getTrackCenterX(obsZ) + chosenOffset;
      const worldY = getGroundHeightAt(worldX, obsZ);
      probeObs.id = id++;
      probeObs.offsetX = chosenOffset;
      probeObs.worldX = worldX;
      probeObs.worldY = worldY;

      obstacles.push(probeObs);
      placedInRow.push({ offsetX: chosenOffset, radius });

      if (kind === 'rock') rockCount++;
      else pineCount++;
    }

    const baseStep = hasManual
      ? (difficulty.baseRowStepMeters - progress * 10.5) / Math.max(0.68, densityScale)
      : (36 - progress * 11.0) / Math.max(0.75, densityScale);
    const organicGap = randRange(rng, -2.2, 2.8);
    const minStep = hasManual ? difficulty.minRowStepMeters : 22.5;
    z += Math.max(minStep, baseStep + organicGap);
  }

  obstacles.sort((a, b) => a.z - b.z);
  for (let i = 0; i < obstacles.length; i++) {
    obstacles[i].id = i;
  }

  return obstacles;
}

/** Convenience wrapper that builds the full level obstacle layout using the level's ramps, rest zones, and manual sections. */
export function buildLevelObstacles(
  level: LevelConfig,
  seed: number = level.spawnSeed,
  difficulty: ArenaDifficultyProfile = computeArenaDifficultyProfile(level.levelNumber),
): TrackObstacle[] {
  return spawnTrackObstacles(seed, {
    levelNumber: level.levelNumber,
    levelLength: level.length,
    densityScale: difficulty.densityScale,
    difficulty,
    ramps: level.ramps,
    restZones: level.restZones,
    manualObstacles: level.manualObstacles,
  });
}
