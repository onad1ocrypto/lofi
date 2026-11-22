/**
 * Pure, deterministic procedural sculpting & slope-aware rock/snow coloring logic
 * for LOFI ICE ESCAPE's distant alpine background mountains.
 *
 * Designed strictly from the approved mountain silhouette reference:
 * - Asymmetrical multi-ridge alpine massifs (dominant off-center summit + distinct
 *   stepped shoulder peaks separated by visible saddles + lower foothill buttresses,
 *   never plain symmetrical triangles/cones).
 * - Sculpted snow-filled central couloir/gully & terraced snow ledges sweeping between
 *   steep rocky buttress ribs.
 * - Slope-aware stylized rock planes vs bright winter snow slopes calibrated for the
 *   game's daylight lighting and horizon fog so rock faces & snowfields separate crisply.
 *
 * Zero DOM or Three.js dependencies so every silhouette, asymmetry, grounding, and
 * slope-coloring invariant can be verified directly via node:test.
 */

import { TRACK_LENGTH } from './trackData';

export interface MountainLobeSpec {
  /** Normalized X center in [-0.85, 0.85] */
  x: number;
  /** Normalized Z center in [-0.85, 0.85] (+Z faces camera) */
  z: number;
  /** Peak elevation contribution in [0, 1] */
  height: number;
  /** Base horizontal spread along local X */
  radiusX: number;
  /** Base horizontal spread along local Z */
  radiusZ: number;
  /** Ridge orientation angle in radians */
  angle: number;
  /** Sharpness exponent (lower = steeper cliff shoulders & fuller ridges) */
  sharpness: number;
  /** Elliptical ridge elongation along its primary spine */
  ridgeStretch: number;
}

export interface MountainGullySpec {
  /** Start point near upper flank (normalized) */
  startX: number;
  startZ: number;
  /** Exit point near lower basin (normalized) */
  endX: number;
  endZ: number;
  /** Half-width of the snow couloir chute */
  width: number;
  /** Carve depth subtracted from underlying massif */
  depth: number;
}

export interface MountainArchetype {
  readonly id: number;
  readonly name: string;
  readonly lobes: readonly MountainLobeSpec[];
  readonly gullies: readonly MountainGullySpec[];
  readonly seed: number;
  readonly ribFreq: number;
  readonly ribStrength: number;
}

export interface MountainHeightSample {
  /** Normalized height in [0, 1], strictly 0 along outer skirt. */
  height: number;
  /** Snow-catching couloir/gully depth factor in [0, 1]. */
  gullyDepth: number;
  /** Rock rib/arête prominence in [-1, 1] (+ = exposed rock ridge crest). */
  ridgeFactor: number;
  /** Terraced ledge shelf cue in [0, 1] (catches thin snow bands along slopes). */
  ledgeFactor: number;
}

export interface MountainSurfaceColorInput {
  heightNorm: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  gullyDepth: number;
  ridgeFactor: number;
  ledgeFactor?: number;
  variantTint?: number;
}

export interface MountainSurfaceColor {
  r: number;
  g: number;
  b: number;
  /** Classified snow coverage mask in [0, 1] (0 = exposed rock plane, 1 = snow slope). */
  snowMask: number;
}

export interface BackgroundMountainInstanceSpec {
  readonly archetypeId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly height: number;
  readonly rotationY: number;
  readonly tint: number;
}

/**
 * Three distinct asymmetrical alpine massif archetypes sculpted directly from the
 * stepped multi-ridge shoulder & central snowy gully silhouette reference.
 */
export const BACKGROUND_MOUNTAIN_ARCHETYPES: readonly MountainArchetype[] = [
  {
    id: 0,
    name: 'grand-couloir-massif',
    seed: 1.37,
    ribFreq: 13.0,
    ribStrength: 0.068,
    lobes: [
      // Craggy dominant summit slightly right of center
      { x: 0.04, z: -0.06, height: 1.0, radiusX: 0.44, radiusZ: 0.44, angle: 0.18, sharpness: 1.08, ridgeStretch: 1.18 },
      // Prominent stepped left shoulder cliff (~72% height, separated by clear saddle)
      { x: -0.46, z: 0.04, height: 0.72, radiusX: 0.34, radiusZ: 0.32, angle: -0.35, sharpness: 0.88, ridgeStretch: 1.24 },
      // Broad stepped mid-right rocky bastion (~66% height)
      { x: 0.48, z: 0.02, height: 0.66, radiusX: 0.36, radiusZ: 0.34, angle: 0.42, sharpness: 0.9, ridgeStretch: 1.28 },
      // Lower far-left foothill crag (~44% height)
      { x: -0.74, z: 0.2, height: 0.44, radiusX: 0.24, radiusZ: 0.25, angle: -0.25, sharpness: 0.86, ridgeStretch: 1.15 },
      // Lower front-right foreground buttress framing the snow chute exit (~40% height)
      { x: 0.18, z: 0.48, height: 0.4, radiusX: 0.3, radiusZ: 0.26, angle: 0.2, sharpness: 0.92, ridgeStretch: 1.22 },
      // Lower far-right terraced spur (~42% height)
      { x: 0.73, z: 0.22, height: 0.42, radiusX: 0.25, radiusZ: 0.24, angle: 0.55, sharpness: 0.88, ridgeStretch: 1.18 },
      // Rear volume ridge for solid 3D silhouette from oblique views
      { x: -0.16, z: -0.46, height: 0.58, radiusX: 0.42, radiusZ: 0.34, angle: -0.2, sharpness: 1.0, ridgeStretch: 1.25 },
    ],
    gullies: [
      // Iconic bright central snow chute sweeping down from beneath the summit
      { startX: -0.02, startZ: 0.02, endX: 0.02, endZ: 0.78, width: 0.16, depth: 0.26 },
      // Left saddle snow ramp separating mid-left bastion from lower-left crag
      { startX: -0.44, startZ: 0.14, endX: -0.62, endZ: 0.66, width: 0.13, depth: 0.16 },
    ],
  },
  {
    id: 1,
    name: 'stepped-ridge-spire',
    seed: 4.19,
    ribFreq: 12.0,
    ribStrength: 0.065,
    lobes: [
      // Main peak shifted left-of-center
      { x: -0.12, z: -0.05, height: 1.0, radiusX: 0.43, radiusZ: 0.44, angle: -0.24, sharpness: 1.06, ridgeStretch: 1.2 },
      // High stepped right horn buttress (~76% height with clear alpine col/saddle)
      { x: 0.38, z: 0.0, height: 0.76, radiusX: 0.33, radiusZ: 0.32, angle: 0.36, sharpness: 0.86, ridgeStretch: 1.26 },
      // Mid-left steep rocky shoulder (~60% height)
      { x: -0.54, z: 0.1, height: 0.6, radiusX: 0.32, radiusZ: 0.31, angle: -0.48, sharpness: 0.88, ridgeStretch: 1.24 },
      // Lower front-left snow-cradled bastion (~41% height)
      { x: -0.22, z: 0.46, height: 0.41, radiusX: 0.31, radiusZ: 0.26, angle: -0.15, sharpness: 0.92, ridgeStretch: 1.2 },
      // Far-right descending crag (~46% height)
      { x: 0.72, z: 0.18, height: 0.46, radiusX: 0.26, radiusZ: 0.25, angle: 0.48, sharpness: 0.86, ridgeStretch: 1.2 },
      // Rear massif flank
      { x: 0.18, z: -0.45, height: 0.56, radiusX: 0.4, radiusZ: 0.34, angle: 0.25, sharpness: 1.0, ridgeStretch: 1.25 },
    ],
    gullies: [
      // Diagonal snow couloir cutting cleanly between main summit and right horn
      { startX: 0.06, startZ: 0.02, endX: 0.22, endZ: 0.76, width: 0.16, depth: 0.25 },
      // Secondary snow chute along left flank
      { startX: -0.34, startZ: 0.12, endX: -0.48, endZ: 0.68, width: 0.13, depth: 0.16 },
    ],
  },
  {
    id: 2,
    name: 'twin-buttress-ridge',
    seed: 7.83,
    ribFreq: 14.0,
    ribStrength: 0.07,
    lobes: [
      // High right-of-center summit massif
      { x: 0.14, z: -0.06, height: 1.0, radiusX: 0.44, radiusZ: 0.43, angle: 0.26, sharpness: 1.06, ridgeStretch: 1.2 },
      // Bold high-left twin shoulder ridge (~80% height with deep central saddle)
      { x: -0.36, z: 0.02, height: 0.8, radiusX: 0.34, radiusZ: 0.33, angle: -0.32, sharpness: 0.86, ridgeStretch: 1.26 },
      // Far-left low rocky spur (~42% height)
      { x: -0.73, z: 0.18, height: 0.42, radiusX: 0.25, radiusZ: 0.24, angle: -0.5, sharpness: 0.88, ridgeStretch: 1.18 },
      // Mid-right steep rocky shoulder (~60% height)
      { x: 0.56, z: 0.1, height: 0.6, radiusX: 0.32, radiusZ: 0.3, angle: 0.52, sharpness: 0.88, ridgeStretch: 1.24 },
      // Front-right lower rocky buttress (~40% height)
      { x: 0.3, z: 0.48, height: 0.4, radiusX: 0.29, radiusZ: 0.26, angle: 0.22, sharpness: 0.92, ridgeStretch: 1.2 },
      // Rear massif spine
      { x: -0.08, z: -0.46, height: 0.58, radiusX: 0.44, radiusZ: 0.34, angle: 0.08, sharpness: 1.0, ridgeStretch: 1.26 },
    ],
    gullies: [
      // Sweeping snow bowl cascading down between the twin ridges
      { startX: -0.08, startZ: 0.0, endX: -0.04, endZ: 0.78, width: 0.17, depth: 0.27 },
      // Right-flank snow ramp
      { startX: 0.34, startZ: 0.12, endX: 0.48, endZ: 0.66, width: 0.13, depth: 0.15 },
    ],
  },
] as const;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Distance from point (px, pz) to finite segment (ax, az) -> (bx, bz), plus along-segment progress t in [0, 1]. */
function pointToSegmentDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { dist: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - ax, pz - az), t: 0 };
  }
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / lenSq);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { dist: Math.hypot(px - cx, pz - cz), t };
}

/**
 * Evaluate the stylized multi-ridge alpine massif heightfield at normalized coordinates
 * (nx, nz) in [-1, 1] x [-1, 1], where +nz faces the viewer camera.
 */
export function sampleMountainHeight(
  nx: number,
  nz: number,
  archetypeIndex: number,
): MountainHeightSample {
  const arch =
    BACKGROUND_MOUNTAIN_ARCHETYPES[
      ((archetypeIndex % BACKGROUND_MOUNTAIN_ARCHETYPES.length) +
        BACKGROUND_MOUNTAIN_ARCHETYPES.length) %
        BACKGROUND_MOUNTAIN_ARCHETYPES.length
    ];

  const radialDist = Math.hypot(nx, nz);
  // Strict outer skirt grounding so the mountain footprint meets the valley floor at y = 0
  if (radialDist >= 0.98) {
    return { height: 0, gullyDepth: 0, ridgeFactor: 0, ledgeFactor: 0 };
  }

  // Smooth radial footprint envelope (keeps outer base grounded cleanly)
  const skirtMask = 1 - smoothstep(0.79, 0.965, radialDist);

  // Use crisp ridge max blending (mostly hard max with slight saddle fillet) so distinct
  // stepped sub-peaks and dramatic cols remain clearly visible in the skyline silhouette!
  let maxRidge = 0;
  let softSum = 0;
  const k = 15.0;
  for (let i = 0; i < arch.lobes.length; i++) {
    const lobe = arch.lobes[i];
    const lx = nx - lobe.x;
    const lz = nz - lobe.z;
    const ca = Math.cos(lobe.angle);
    const sa = Math.sin(lobe.angle);
    const rx = (lx * ca - lz * sa) / (lobe.radiusX * lobe.ridgeStretch);
    const rz = (lx * sa + lz * ca) / lobe.radiusZ;

    // Faceted diamond-ridge metric gives crisp alpine arêtes & steeper cliff sides
    const euclid = Math.hypot(rx, rz);
    const diamond = (Math.abs(rx) + Math.abs(rz)) * 0.72;
    const d = euclid * 0.7 + diamond * 0.3;
    const falloff = Math.max(0, 1 - d);
    const h = lobe.height * Math.pow(falloff, lobe.sharpness);
    if (h > maxRidge) maxRidge = h;
    softSum += Math.exp(h * k);
  }
  const smoothMax = Math.log(Math.max(1e-6, softSum)) / k;
  const baseHeight = maxRidge * 0.74 + Math.max(0, smoothMax) * 0.26;

  // Multi-scale vertical rocky buttress ribs radiating down the cliff walls
  const angle = Math.atan2(nz, nx);
  const ribWave =
    Math.sin(angle * arch.ribFreq + arch.seed + radialDist * 3.4) * 0.6 +
    Math.sin(angle * (arch.ribFreq * 0.5 + 3.0) - arch.seed * 1.4 + nx * 2.8) * 0.4;
  // Sharpened ridged noise (1 - |sin|) gives crisp rocky buttress ribs like the reference
  const flutedRib = (1 - Math.abs(ribWave)) * 2 - 1;
  const cragWave =
    Math.sin(nx * 10.2 + nz * 6.4 + arch.seed) * 0.5 +
    Math.cos(nx * 6.8 - nz * 11.0 + arch.seed * 2.1) * 0.5;

  const slopeMask = smoothstep(0.06, 0.25, baseHeight) * (1 - smoothstep(0.88, 0.99, baseHeight));
  const ribDisplacement = (flutedRib * 0.72 + cragWave * 0.28) * arch.ribStrength * slopeMask;

  // Carve sculpted snow-catching couloir gullies sweeping down between rocky buttresses
  let gullyDepth = 0;
  let gullyCarve = 0;
  for (let i = 0; i < arch.gullies.length; i++) {
    const g = arch.gullies[i];
    const { dist, t } = pointToSegmentDist(nx, nz, g.startX, g.startZ, g.endX, g.endZ);
    const localW = g.width * (0.72 + t * 0.58);
    if (dist < localW * 1.45) {
      const profile = 1 - smoothstep(0, localW * 1.35, dist);
      const endFade = smoothstep(0.0, 0.14, t) * (1 - smoothstep(0.82, 1.0, t));
      const strength = profile * endFade;
      gullyDepth = Math.max(gullyDepth, strength);
      gullyCarve += strength * g.depth * (0.38 + baseHeight * 0.62);
    }
  }

  // Smooth the rocky ribs inside snow gullies so snow flows cleanly down the chute
  const effectiveRib = ribDisplacement * (1 - gullyDepth * 0.88);
  const rawHeight = Math.max(0, (baseHeight + effectiveRib - gullyCarve) * skirtMask);

  // Stylized snow-catching terraced rock shelves wrapping diagonally across mid-flanks
  const shelfPhase = rawHeight * Math.PI * 7.2 + nx * 1.65 - nz * 0.9;
  const shelfWave = Math.sin(shelfPhase);
  const terrace = shelfWave * 0.018 * slopeMask * (1 - gullyDepth * 0.55);
  const ledgeFactor = clamp01((Math.cos(shelfPhase) + 0.15) * 0.7) * slopeMask;

  const finalHeight = clamp01(rawHeight + terrace);
  const ridgeFactor = clamp01((flutedRib + 1) * 0.5) * 2 - 1;

  return {
    height: finalHeight,
    gullyDepth: clamp01(gullyDepth),
    ridgeFactor,
    ledgeFactor,
  };
}

/**
 * Classify a mountain triangle/vertex into stylized alpine granite rock planes vs
 * slope-following winter snow using surface normal slope, elevation, snow gullies,
 * and terraced ledges.
 *
 * Palette is deliberately calibrated for LOFI ICE ESCAPE's daylight exposure &
 * horizon FogExp2(0x9cb9e8, 0.0020) so distant rocky cliffs retain rich cool slate
 * depth while snowfields and gullies stay crisp luminous winter white.
 */
export function computeMountainSurfaceColor(
  input: MountainSurfaceColorInput,
): MountainSurfaceColor {
  const { heightNorm, normalX, normalY, normalZ, gullyDepth, ridgeFactor } = input;
  const ledgeFactor = input.ledgeFactor ?? 0;
  const tint = input.variantTint ?? 1.0;

  // Snow naturally clings to:
  // 1) Gentler upward-facing slopes & shoulder caps (high normalY)
  // 2) Upper summit snowcap & diagonal terraced ledges
  // 3) Sheltered central snow gullies / couloir chutes
  // Steep rocky cliffs & fluted rock buttresses (lower normalY, positive ridgeFactor)
  // stay cleanly exposed as dark alpine slate-granite planes!
  const upSlope = clamp01(normalY);
  const summitCap = smoothstep(0.66, 0.92, heightNorm) * 0.32;
  const gullyBonus = gullyDepth * 0.58;
  const ledgeBonus = ledgeFactor * 0.26 * smoothstep(0.24, 0.68, upSlope);
  const ribRockPenalty = Math.max(0, ridgeFactor) * 0.24 * (1 - gullyDepth * 0.85);

  const snowScore = upSlope + summitCap + gullyBonus + ledgeBonus - ribRockPenalty;
  // Crisp stylized rock-vs-snow split: steep rocky ribs stay slate rock, gentler slopes/ledges/gullies hold bright snow
  const snowMask = smoothstep(0.54, 0.65, snowScore);

  // Directional alpine sun cue (warm key sun from upper-left-front, crisp cool shadow side)
  const sunDot = clamp01(normalX * -0.48 + normalY * 0.68 + normalZ * 0.55);

  // Deep Stylized Alpine Granite Rock palette (compensates for ~25-40% blue horizon fog lift)
  // Deep crevice slate (#233149) -> Mid cliff granite (#3c4e6d) -> Sunlit rocky plane (#627696)
  const rockLightT = clamp01(
    sunDot * 0.82 + heightNorm * 0.1 - Math.max(0, -ridgeFactor) * 0.16,
  );
  const rockR = (0.14 + rockLightT * 0.25) * tint;
  const rockG = (0.195 + rockLightT * 0.275) * tint;
  const rockB = (0.295 + rockLightT * 0.3) * tint;

  // Bright Stylized Alpine Snow palette (crisp sunlit winter snow #ffffff & soft alpine-blue snow shade #cce0fa)
  const snowLightT = clamp01(sunDot * 0.72 + heightNorm * 0.26 - gullyDepth * 0.08);
  const snowR = 0.8 + snowLightT * 0.2;
  const snowG = 0.87 + snowLightT * 0.13;
  const snowB = 0.96 + snowLightT * 0.04;

  const r = clamp01(rockR * (1 - snowMask) + snowR * snowMask);
  const g = clamp01(rockG * (1 - snowMask) + snowG * snowMask);
  const b = clamp01(rockB * (1 - snowMask) + snowB * snowMask);

  return { r, g, b, snowMask };
}

/**
 * Preserved scenic distant mountain placements along the valley flanks & horizon backdrop.
 * Broad multi-ridge proportions (width ~ 1.05..1.18 * height) showcase stepped shoulders
 * and snow chutes clearly above the flanking pine treeline without ever touching the track.
 */
export const BACKGROUND_MOUNTAIN_SPECS: readonly BackgroundMountainInstanceSpec[] = [
  // Near-distant left & right valley guardians (prominent from start line & early descent)
  {
    archetypeId: 0,
    x: -148,
    y: -58,
    z: -272,
    radiusX: 132,
    radiusZ: 106,
    height: 122,
    rotationY: 0.16,
    tint: 1.0,
  },
  {
    archetypeId: 1,
    x: 158,
    y: -66,
    z: -322,
    radiusX: 146,
    radiusZ: 116,
    height: 136,
    rotationY: -0.18,
    tint: 0.98,
  },
  // Mid-track valley flanks
  {
    archetypeId: 2,
    x: -166,
    y: -142,
    z: -640,
    radiusX: 152,
    radiusZ: 120,
    height: 148,
    rotationY: 0.22,
    tint: 0.96,
  },
  {
    archetypeId: 0,
    x: 172,
    y: -162,
    z: -740,
    radiusX: 162,
    radiusZ: 128,
    height: 156,
    rotationY: -0.16,
    tint: 0.97,
  },
  // Deep valley alpine peaks
  {
    archetypeId: 1,
    x: -176,
    y: -242,
    z: -1120,
    radiusX: 162,
    radiusZ: 126,
    height: 160,
    rotationY: 0.14,
    tint: 0.95,
  },
  {
    archetypeId: 2,
    x: 184,
    y: -252,
    z: -1180,
    radiusX: 168,
    radiusZ: 132,
    height: 164,
    rotationY: -0.22,
    tint: 0.96,
  },
  // Grand horizon backdrop massif behind the valley & shelter
  {
    archetypeId: 2,
    x: -182,
    y: -344,
    z: -(TRACK_LENGTH + 185),
    radiusX: 172,
    radiusZ: 136,
    height: 170,
    rotationY: 0.2,
    tint: 0.95,
  },
  {
    archetypeId: 0,
    x: 18,
    y: -346,
    z: -(TRACK_LENGTH + 230),
    radiusX: 215,
    radiusZ: 168,
    height: 214,
    rotationY: -0.06,
    tint: 1.0,
  },
  {
    archetypeId: 1,
    x: 202,
    y: -344,
    z: -(TRACK_LENGTH + 178),
    radiusX: 178,
    radiusZ: 140,
    height: 178,
    rotationY: -0.2,
    tint: 0.96,
  },
] as const;
