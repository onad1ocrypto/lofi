import { computeArenaDifficultyProfile } from './arenaDifficulty';
import {
  getTrackCenterXForLevel,
  getTrackHalfWidthForLevel,
} from './trackData';
import type {
  FollowerYeti,
  MiniMapLayout,
  MiniMapObstacleMarker,
  MiniMapPoint,
  MiniMapRampMarker,
  MiniMapSnapshot,
  TrackObstacle,
  TrackRamp,
} from './types';

export const MINIMAP_VIEWBOX = {
  width: 112,
  height: 224,
  padX: 12,
  padTop: 24,
  padBottom: 16,
  /** Shared minimum world X span (meters) so gentle Lv1 curves look genuinely gentler than Lv3 switchbacks. */
  minWorldSpanX: 88,
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Map a downhill distance z (0 = start bottom, levelLength = shelter top) to SVG Y. */
export function projectMiniMapY(distanceZ: number, levelLength: number): number {
  const progress = clamp(distanceZ / Math.max(1, levelLength), 0, 1);
  const usableH =
    MINIMAP_VIEWBOX.height - MINIMAP_VIEWBOX.padTop - MINIMAP_VIEWBOX.padBottom;
  return round1(MINIMAP_VIEWBOX.height - MINIMAP_VIEWBOX.padBottom - progress * usableH);
}

/** Project any world coordinate (worldX, distanceZ) into SVG viewBox coordinates using a layout's projection. */
export function projectMiniMapPoint(
  layout: Pick<MiniMapLayout, 'levelLength' | 'centerWorldX' | 'scaleX'>,
  worldX: number,
  distanceZ: number,
): MiniMapPoint {
  const halfSvgW = MINIMAP_VIEWBOX.width * 0.5;
  const rawX = halfSvgW + (worldX - layout.centerWorldX) * layout.scaleX;
  return {
    x: round1(clamp(rawX, MINIMAP_VIEWBOX.padX - 4, MINIMAP_VIEWBOX.width - MINIMAP_VIEWBOX.padX + 4)),
    y: projectMiniMapY(distanceZ, layout.levelLength),
  };
}

/**
 * Build the static SVG track geometry & obstacle/ramp markers for a level once upon level load.
 * Pure & deterministic — zero DOM/WebGL dependencies.
 */
export function buildMiniMapLayout(
  levelNumber: number,
  levelLength: number,
  ramps: readonly TrackRamp[],
  obstacles: readonly TrackObstacle[],
): MiniMapLayout {
  const steps = 64;
  let minWorldX = Infinity;
  let maxWorldX = -Infinity;

  const samples: Array<{ z: number; cx: number; hw: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const z = (i / steps) * levelLength;
    const cx = getTrackCenterXForLevel(levelNumber, z);
    const hw = getTrackHalfWidthForLevel(levelNumber, z);
    samples.push({ z, cx, hw });
    if (cx - hw < minWorldX) minWorldX = cx - hw;
    if (cx + hw > maxWorldX) maxWorldX = cx + hw;
  }

  const centerWorldX = (minWorldX + maxWorldX) * 0.5;
  const actualSpanX = Math.max(24, maxWorldX - minWorldX);
  const worldSpanX = Math.max(MINIMAP_VIEWBOX.minWorldSpanX, actualSpanX + 6);
  const usableSvgW = MINIMAP_VIEWBOX.width - MINIMAP_VIEWBOX.padX * 2;
  const scaleX = usableSvgW / worldSpanX;

  const proj = { levelLength, centerWorldX, scaleX };

  // Build closed snow ribbon polygon (left bank bottom->top, right bank top->bottom)
  const leftParts: string[] = [];
  const rightParts: string[] = [];
  const centerParts: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const lp = projectMiniMapPoint(proj, s.cx - s.hw, s.z);
    const rp = projectMiniMapPoint(proj, s.cx + s.hw, s.z);
    const cp = projectMiniMapPoint(proj, s.cx, s.z);
    leftParts.push(`${i === 0 ? 'M' : 'L'}${lp.x} ${lp.y}`);
    centerParts.push(`${i === 0 ? 'M' : 'L'}${cp.x} ${cp.y}`);
    rightParts.push(`L${rp.x} ${rp.y}`);
  }
  rightParts.reverse();

  const ribbonPath = `${leftParts.join(' ')} ${rightParts.join(' ')} Z`;
  const centerlinePath = centerParts.join(' ');

  const shelterCenterX = getTrackCenterXForLevel(levelNumber, levelLength);
  const shelterPt = projectMiniMapPoint(proj, shelterCenterX, levelLength);

  const rampMarkers: MiniMapRampMarker[] = ramps.map((r) => {
    const midZ = r.zStart + r.length * 0.5;
    const worldX = getTrackCenterXForLevel(levelNumber, midZ) + r.offsetX;
    const pt = projectMiniMapPoint(proj, worldX, midZ);
    return { x: pt.x, y: pt.y, kind: r.kind };
  });

  const obstacleMarkers: MiniMapObstacleMarker[] = obstacles.map((obs) => {
    const pt = projectMiniMapPoint(proj, obs.worldX, obs.z);
    return { x: pt.x, y: pt.y, z: obs.z, kind: obs.kind };
  });

  const difficulty = computeArenaDifficultyProfile(levelNumber);

  return {
    levelNumber,
    levelLength,
    ribbonPath,
    centerlinePath,
    shelterX: shelterPt.x,
    shelterY: shelterPt.y,
    centerWorldX,
    scaleX,
    ramps: rampMarkers,
    obstacles: obstacleMarkers,
    difficultyLabel: difficulty.difficultyLabel,
  };
}

/**
 * Project live player, follower Yetis, and trailing avalanche onto the active level's MiniMapLayout.
 */
export function buildMiniMapSnapshot(
  layout: MiniMapLayout,
  live: {
    playerWorldX: number;
    playerDistance: number;
    lateralVelocity: number;
    forwardSpeed: number;
    avalancheDistance: number;
    followers: readonly FollowerYeti[];
  },
): MiniMapSnapshot {
  const playerPt = projectMiniMapPoint(
    layout,
    live.playerWorldX,
    live.playerDistance,
  );
  const headingRad =
    live.lateralVelocity === 0
      ? 0
      : Math.atan2(live.lateralVelocity, Math.max(8, live.forwardSpeed));
  const playerHeadingDeg = round1((headingRad * 180) / Math.PI);

  const avalZ = Math.max(0, live.playerDistance - live.avalancheDistance);
  const avalCenterX = getTrackCenterXForLevel(layout.levelNumber, avalZ);
  const avalPt = projectMiniMapPoint(layout, avalCenterX, avalZ);

  const followers: MiniMapPoint[] = [];
  for (let i = 0; i < live.followers.length; i++) {
    const f = live.followers[i];
    followers.push(projectMiniMapPoint(layout, f.worldX, Math.max(0, f.distance)));
  }

  return {
    layout,
    playerX: playerPt.x,
    playerY: playerPt.y,
    playerHeadingDeg,
    avalancheX: avalPt.x,
    avalancheY: avalPt.y,
    followers,
  };
}
