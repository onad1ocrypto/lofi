import type { LevelConfig } from './types';

/**
 * 10-level progressive campaign for LOFI ICE ESCAPE:
 * Active Lil Yetis during a level strictly follow: followers = levelNumber - 1
 * (Level 1 = 0 solo, Level 2 = 1 Lil Yeti, ..., Level 10 = 9 Lil Yetis).
 * Difficulty escalates smoothly from Level 1 through Level 10 so Level 3 feels
 * welcoming & rhythmic rather than an abrupt wall.
 */
export const LEVEL_CONFIGS: readonly LevelConfig[] = [
  {
    levelNumber: 1,
    name: 'Snowy Foothills',
    arenaStyle: 'Wide trail, gentle sweeping turns, 1 intro ramp',
    length: 780,
    spawnSeed: 20261121,
    baseSpeed: 25.4,
    avalancheCruiseSpeed: 23.6,
    avalancheStartDistance: 28.0,
    densityScale: 0.65,
    ramps: [
      {
        id: 101,
        zStart: 330,
        length: 12.5,
        height: 1.85,
        width: 5.8,
        offsetX: 2.2,
        launchVy: 9.4,
        landingClearMeters: 48,
        kind: 'small',
      },
    ],
    restZones: [
      { zStart: 255, zEnd: 330 },
      { zStart: 330, zEnd: 405 },
      { zStart: 540, zEnd: 585 },
    ],
    manualObstacles: [
      { z: 132, offsetX: -5.8, kind: 'rock', scale: 1.0 },
      { z: 186, offsetX: 5.8, kind: 'pine', scale: 1.04 },
      { z: 236, offsetX: -4.6, kind: 'pine', scale: 1.06 },
      { z: 436, offsetX: -5.4, kind: 'rock', scale: 1.0 },
      { z: 492, offsetX: 5.6, kind: 'pine', scale: 1.06 },
      { z: 612, offsetX: 4.8, kind: 'pine', scale: 1.1 },
      { z: 662, offsetX: -5.2, kind: 'rock', scale: 1.02 },
    ],
  },
  {
    levelNumber: 2,
    name: 'Frosty Ridge',
    arenaStyle: 'Smooth sweeping S-bends, relaxed slalom gates, 2 ramps',
    length: 860,
    spawnSeed: 20261199,
    baseSpeed: 25.8,
    avalancheCruiseSpeed: 24.0,
    avalancheStartDistance: 28.0,
    densityScale: 0.78,
    ramps: [
      {
        id: 201,
        zStart: 290,
        length: 13.0,
        height: 2.1,
        width: 5.8,
        offsetX: -2.0,
        launchVy: 10.6,
        landingClearMeters: 50,
        kind: 'small',
      },
      {
        id: 202,
        zStart: 560,
        length: 13.5,
        height: 2.35,
        width: 5.8,
        offsetX: 2.4,
        launchVy: 11.4,
        landingClearMeters: 52,
        kind: 'medium',
      },
    ],
    restZones: [
      { zStart: 250, zEnd: 365 },
      { zStart: 520, zEnd: 640 },
    ],
    manualObstacles: [
      { z: 128, offsetX: 5.0, kind: 'pine', scale: 1.04 },
      { z: 174, offsetX: -4.8, kind: 'rock', scale: 1.02 },
      { z: 222, offsetX: 4.4, kind: 'rock', scale: 0.98 },
      { z: 398, offsetX: 4.6, kind: 'pine', scale: 1.08 },
      { z: 448, offsetX: -4.2, kind: 'rock', scale: 1.04 },
      { z: 492, offsetX: 5.2, kind: 'pine', scale: 1.06 },
      { z: 676, offsetX: -4.6, kind: 'pine', scale: 1.08 },
      { z: 724, offsetX: 4.8, kind: 'rock', scale: 1.04 },
    ],
  },
  {
    levelNumber: 3,
    name: 'Pine Valley',
    arenaStyle: 'Gentle valley curves, 1 fallen log intro, wide Safe vs. Bonus split',
    length: 940,
    spawnSeed: 20261277,
    baseSpeed: 26.2,
    avalancheCruiseSpeed: 24.4,
    avalancheStartDistance: 28.0,
    densityScale: 0.92,
    splitZone: {
      zStart: 420,
      zEnd: 590,
      extraHalfWidth: 6.2,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
    steepDescents: [
      {
        id: 'lv3-steep-drop',
        zStart: 598,
        zEnd: 676,
        approachDistance: 46,
        recoveryDistance: 64,
        extraGradient: 0.36,
        extraHalfWidth: 4.0,
      },
    ],
    ramps: [
      {
        id: 301,
        zStart: 468,
        length: 14.0,
        height: 2.5,
        width: 6.2,
        offsetX: 7.4,
        launchVy: 12.0,
        landingClearMeters: 54,
        kind: 'bonus',
      },
      {
        id: 302,
        zStart: 752,
        length: 13.5,
        height: 2.35,
        width: 6.0,
        offsetX: -2.0,
        launchVy: 11.4,
        landingClearMeters: 52,
        kind: 'medium',
      },
    ],
    restZones: [
      { zStart: 270, zEnd: 332 }, // Clear sightline & landing for single approachable Fallen Log
      { zStart: 390, zEnd: 588 }, // Managed cleanly by wide Safe vs. Bonus split bowl
      { zStart: 588, zEnd: 742 }, // Steep descent (sparse manual obstacles only) + wide landing & recovery area
      { zStart: 742, zEnd: 828 }, // Clear approach & landing for Ramp 2
    ],
    manualObstacles: [
      { z: 130, offsetX: -4.8, kind: 'rock', scale: 1.02 },
      { z: 178, offsetX: 4.8, kind: 'pine', scale: 1.06 },
      { z: 228, offsetX: -4.2, kind: 'pine', scale: 1.05 },
      // Single approachable fallen pine log intro on Level 3
      { z: 300, offsetX: 0, kind: 'fallen_log', scale: 0.96 },
      // Clean wide split divider (z = 445..555)
      { z: 445, offsetX: -0.5, kind: 'rock', scale: 1.16 },
      { z: 468, offsetX: -0.6, kind: 'pine', scale: 1.2 },
      { z: 492, offsetX: -0.4, kind: 'pine', scale: 1.18 },
      { z: 518, offsetX: -0.6, kind: 'rock', scale: 1.18 },
      { z: 534, offsetX: -0.5, kind: 'pine', scale: 1.14 },
      // Sparse flanking obstacles inside the wide steep descent (wide open center carving line)
      { z: 628, offsetX: -6.2, kind: 'rock', scale: 1.02 },
      { z: 658, offsetX: 6.4, kind: 'pine', scale: 1.06 },
      { z: 838, offsetX: -4.4, kind: 'pine', scale: 1.08 },
    ],
  },
  {
    levelNumber: 4,
    name: 'Carving Pass',
    arenaStyle: 'Wide S-curve carving downhill with outside snow mounds & speed-check braking',
    length: 1020,
    spawnSeed: 20261341,
    baseSpeed: 26.6,
    avalancheCruiseSpeed: 24.8,
    avalancheStartDistance: 28.0,
    densityScale: 1.04,
    steepDescents: [
      {
        id: 'lv4-carving-pass',
        zStart: 490,
        zEnd: 710,
        approachDistance: 54,
        recoveryDistance: 92,
        extraGradient: 0.27,
        extraHalfWidth: 4.8,
        cameraMode: 'carving',
        enableCarvingSpeedControl: true,
      },
    ],
    ramps: [
      {
        id: 401,
        zStart: 270,
        length: 13.5,
        height: 2.35,
        width: 5.8,
        offsetX: 2.2,
        launchVy: 11.4,
        landingClearMeters: 52,
        kind: 'medium',
      },
      {
        id: 402,
        zStart: 832,
        length: 14.0,
        height: 2.5,
        width: 5.8,
        offsetX: -2.2,
        launchVy: 11.8,
        landingClearMeters: 54,
        kind: 'medium',
      },
    ],
    restZones: [
      { zStart: 236, zEnd: 344 }, // Clear approach & landing for Ramp 1
      { zStart: 374, zEnd: 434 }, // Clear sightline around single Fallen Log before Carving Pass
      { zStart: 434, zEnd: 814 }, // Carving Pass approach + 220m S-shaped downhill (sparse manual obstacles only) + flat recovery area
      { zStart: 814, zEnd: 904 }, // Clear approach & landing for Ramp 2 after flat recovery
    ],
    manualObstacles: [
      { z: 128, offsetX: 4.8, kind: 'pine', scale: 1.06 },
      { z: 170, offsetX: -4.6, kind: 'rock', scale: 1.04 },
      { z: 214, offsetX: 4.4, kind: 'pine', scale: 1.08 },
      { z: 364, offsetX: -4.4, kind: 'rock', scale: 1.06 },
      { z: 402, offsetX: 0, kind: 'fallen_log', scale: 0.98 },
      // Sparse flanking obstacles inside the wide 220m Carving Pass (wide visible safe route before every curve)
      { z: 548, offsetX: -7.8, kind: 'pine', scale: 1.04 },
      { z: 604, offsetX: 8.2, kind: 'rock', scale: 1.02 },
      { z: 658, offsetX: 7.8, kind: 'pine', scale: 1.06 },
      { z: 912, offsetX: 4.6, kind: 'rock', scale: 1.04 },
    ],
  },
  {
    levelNumber: 5,
    name: 'Drop & Jump',
    arenaStyle: 'Short downhill into clear split: safe snow route or optional speed ramp & wide landing',
    length: 1100,
    spawnSeed: 20261423,
    baseSpeed: 27.0,
    avalancheCruiseSpeed: 25.2,
    avalancheStartDistance: 28.0,
    densityScale: 1.16,
    steepDescents: [
      {
        id: 'lv5-drop-jump',
        zStart: 485,
        zEnd: 570,
        approachDistance: 48,
        recoveryDistance: 132,
        extraGradient: 0.22,
        extraHalfWidth: 4.6,
        cameraMode: 'dropJump',
      },
    ],
    splitZone: {
      zStart: 520,
      zEnd: 696,
      extraHalfWidth: 6.4,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
    ramps: [
      {
        id: 501,
        zStart: 572,
        length: 14.5,
        height: 2.65,
        width: 6.8,
        offsetX: 7.4,
        launchVy: 12.2,
        landingClearMeters: 92,
        kind: 'bonus',
      },
      {
        id: 502,
        zStart: 800,
        length: 14.0,
        height: 2.5,
        width: 6.0,
        offsetX: -2.2,
        launchVy: 11.8,
        landingClearMeters: 54,
        kind: 'medium',
      },
    ],
    restZones: [
      { zStart: 275, zEnd: 335 },
      { zStart: 446, zEnd: 712 },
      { zStart: 760, zEnd: 882 },
      { zStart: 912, zEnd: 968 },
    ],
    manualObstacles: [
      { z: 128, offsetX: -4.4, kind: 'rock', scale: 1.06 },
      { z: 170, offsetX: 4.4, kind: 'pine', scale: 1.08 },
      { z: 214, offsetX: -3.8, kind: 'pine', scale: 1.06 },
      { z: 305, offsetX: 0, kind: 'fallen_log', scale: 1.0 },
      // Clear visual route split divider visible from the short downhill, ending before touchdown for a wide landing bowl
      { z: 552, offsetX: -0.5, kind: 'rock', scale: 1.18 },
      { z: 570, offsetX: -0.6, kind: 'pine', scale: 1.2 },
      { z: 588, offsetX: -0.4, kind: 'pine', scale: 1.18 },
      { z: 606, offsetX: -0.6, kind: 'rock', scale: 1.16 },
      { z: 736, offsetX: 4.0, kind: 'rock', scale: 1.08 },
      { z: 940, offsetX: 0, kind: 'fallen_log', scale: 1.0 },
    ],
  },
  {
    levelNumber: 6,
    name: 'Pine Slalom',
    arenaStyle: 'Readable zig-zag pine tree slalom with wide visible safe routes & smooth recovery',
    length: 1180,
    spawnSeed: 20261517,
    baseSpeed: 27.4,
    avalancheCruiseSpeed: 25.6,
    avalancheStartDistance: 28.0,
    densityScale: 1.28,
    steepDescents: [
      {
        id: 'lv6-pine-slalom',
        zStart: 420,
        zEnd: 660,
        approachDistance: 48,
        recoveryDistance: 96,
        extraGradient: 0.02,
        extraHalfWidth: 4.2,
        cameraMode: 'slalom',
      },
    ],
    ramps: [
      {
        id: 601,
        zStart: 318,
        length: 14.0,
        height: 2.5,
        width: 5.8,
        offsetX: -2.0,
        launchVy: 11.8,
        landingClearMeters: 54,
        kind: 'medium',
      },
      {
        id: 602,
        zStart: 805,
        length: 14.0,
        height: 2.55,
        width: 5.8,
        offsetX: 2.2,
        launchVy: 12.0,
        landingClearMeters: 54,
        kind: 'medium',
      },
    ],
    restZones: [
      // Zero random obstacles through Ramp 601 approach, entire Pine Slalom (z=420..660), and wide recovery area (z=660..760)
      { zStart: 288, zEnd: 760 },
      { zStart: 762, zEnd: 885 },
      { zStart: 960, zEnd: 1018 },
    ],
    manualObstacles: [
      { z: 126, offsetX: 4.2, kind: 'pine', scale: 1.08 },
      { z: 164, offsetX: -4.2, kind: 'rock', scale: 1.06 },
      { z: 204, offsetX: 4.0, kind: 'rock', scale: 1.04 },
      { z: 246, offsetX: -4.8, kind: 'pine', scale: 1.1 },
      // --- PINE SLALOM: 6 deterministic alternating zig-zag pine gates (40m rhythm, wide visible safe route each turn) ---
      // Gate 1 (z=448): Pines on LEFT -> wide safe lane RIGHT
      { z: 448, offsetX: -1.8, kind: 'pine', scale: 1.12 },
      { z: 451, offsetX: -6.4, kind: 'pine', scale: 1.16 },
      { z: 454, offsetX: -10.4, kind: 'pine', scale: 1.08 },
      // Gate 2 (z=488): Pines on RIGHT -> wide safe lane LEFT
      { z: 488, offsetX: 1.8, kind: 'pine', scale: 1.12 },
      { z: 491, offsetX: 6.4, kind: 'pine', scale: 1.16 },
      { z: 494, offsetX: 10.4, kind: 'pine', scale: 1.08 },
      // Gate 3 (z=528): Pines on LEFT -> wide safe lane RIGHT
      { z: 528, offsetX: -1.8, kind: 'pine', scale: 1.14 },
      { z: 531, offsetX: -6.4, kind: 'pine', scale: 1.16 },
      { z: 534, offsetX: -10.4, kind: 'pine', scale: 1.08 },
      // Gate 4 (z=568): Pines on RIGHT -> wide safe lane LEFT
      { z: 568, offsetX: 1.8, kind: 'pine', scale: 1.14 },
      { z: 571, offsetX: 6.4, kind: 'pine', scale: 1.16 },
      { z: 574, offsetX: 10.4, kind: 'pine', scale: 1.08 },
      // Gate 5 (z=608): Pines on LEFT -> wide safe lane RIGHT
      { z: 608, offsetX: -1.8, kind: 'pine', scale: 1.12 },
      { z: 611, offsetX: -6.4, kind: 'pine', scale: 1.16 },
      { z: 614, offsetX: -10.4, kind: 'pine', scale: 1.08 },
      // Gate 6 (z=648): Pines on RIGHT -> wide safe lane LEFT into open recovery area (z=660..760)
      { z: 648, offsetX: 1.8, kind: 'pine', scale: 1.12 },
      { z: 651, offsetX: 6.4, kind: 'pine', scale: 1.16 },
      { z: 654, offsetX: 10.4, kind: 'pine', scale: 1.08 },
      // Late-level features well after the slalom recovery & Ramp 602
      { z: 912, offsetX: -3.8, kind: 'pine', scale: 1.12 },
      { z: 988, offsetX: 0, kind: 'fallen_log', scale: 1.02 },
      { z: 1048, offsetX: 4.4, kind: 'rock', scale: 1.06 },
    ],
  },
  {
    levelNumber: 7,
    name: 'Avalanche Alley',
    arenaStyle: 'Rhythmic double downhill with momentum flat section & wide shelter recovery',
    length: 1260,
    spawnSeed: 20261609,
    baseSpeed: 27.8,
    avalancheCruiseSpeed: 26.0,
    avalancheStartDistance: 28.0,
    densityScale: 1.38,
    steepDescents: [
      {
        id: 'lv7-alley-drop-1',
        zStart: 320,
        zEnd: 460,
        approachDistance: 46,
        recoveryDistance: 56,
        extraGradient: 0.24,
        extraHalfWidth: 4.2,
        cameraMode: 'alley',
      },
      {
        id: 'lv7-alley-drop-2',
        zStart: 716,
        zEnd: 916,
        approachDistance: 48,
        recoveryDistance: 114,
        extraGradient: 0.27,
        extraHalfWidth: 4.8,
        cameraMode: 'alley',
      },
    ],
    flatZones: [
      {
        id: 'lv7-alley-flat',
        zStart: 468,
        zEnd: 706,
        flattenFraction: 0.78,
        extraHalfWidth: 3.4,
        cruiseSpeedDrop: 4.0,
        naturalCoastDecayRate: 0.55,
      },
    ],
    ramps: [],
    restZones: [
      // Zero random obstacle clusters across Downhill 1 crest approach, Downhill 1, Flat momentum section, Downhill 2, and wide recovery before shelter
      { zStart: 256, zEnd: 1145 },
    ],
    manualObstacles: [
      // Opening approach (sparse, wide readable sightlines)
      { z: 132, offsetX: -4.8, kind: 'rock', scale: 1.04 },
      { z: 182, offsetX: 4.8, kind: 'pine', scale: 1.08 },
      { z: 232, offsetX: -5.4, kind: 'pine', scale: 1.06 },
      // Wide outer framing markers before Downhill 1 crest (leaves a huge >14m unobstructed center sightline)
      { z: 286, offsetX: -8.2, kind: 'pine', scale: 1.06 },
      { z: 298, offsetX: 8.2, kind: 'pine', scale: 1.06 },
      // Sparse wide-offset landmarks along Downhill 1 (wide open safe center/opposite lane)
      { z: 344, offsetX: 7.4, kind: 'pine', scale: 1.08 },
      { z: 386, offsetX: -7.2, kind: 'rock', scale: 1.06 },
      { z: 430, offsetX: 7.4, kind: 'pine', scale: 1.06 },
      // Sparse wide-offset landmarks on the flat momentum section (never blocking the center sightline)
      { z: 516, offsetX: 7.6, kind: 'rock', scale: 1.04 },
      { z: 572, offsetX: -7.6, kind: 'pine', scale: 1.08 },
      { z: 628, offsetX: 7.6, kind: 'pine', scale: 1.06 },
      { z: 680, offsetX: -7.8, kind: 'rock', scale: 1.04 },
      // Sparse wide-offset markers on Downhill 2 (rewarding controlled speed through the gentle curve)
      { z: 748, offsetX: -7.4, kind: 'pine', scale: 1.1 },
      { z: 794, offsetX: 7.4, kind: 'rock', scale: 1.08 },
      { z: 840, offsetX: -7.2, kind: 'pine', scale: 1.08 },
      { z: 882, offsetX: 7.4, kind: 'rock', scale: 1.04 },
      { z: 908, offsetX: -7.8, kind: 'pine', scale: 1.04 },
      // Wide recovery area (z=916..1145) stays completely open before the shelter approach!
    ],
  },
  {
    levelNumber: 8,
    name: 'Rock Garden',
    arenaStyle: 'Gentle wide rock garden with structured boulder groups & dual route choices',
    length: 1340,
    spawnSeed: 20261713,
    baseSpeed: 28.2,
    avalancheCruiseSpeed: 26.4,
    avalancheStartDistance: 28.0,
    densityScale: 1.48,
    steepDescents: [
      {
        id: 'lv8-rock-garden',
        zStart: 440,
        zEnd: 760,
        approachDistance: 52,
        recoveryDistance: 120,
        extraGradient: 0.01,
        extraHalfWidth: 5.6,
        cameraMode: 'rockGarden',
      },
    ],
    flatZones: [
      {
        id: 'lv8-rock-garden-gentle',
        zStart: 432,
        zEnd: 768,
        flattenFraction: 0.45,
        extraHalfWidth: 0,
        cruiseSpeedDrop: 0,
        naturalCoastDecayRate: 1.85,
      },
    ],
    ramps: [
      {
        id: 801,
        zStart: 270,
        length: 13.8,
        height: 2.45,
        width: 5.8,
        offsetX: 2.0,
        launchVy: 11.8,
        landingClearMeters: 52,
        kind: 'medium',
      },
      {
        id: 802,
        zStart: 970,
        length: 14.2,
        height: 2.6,
        width: 5.8,
        offsetX: 2.0,
        launchVy: 12.2,
        landingClearMeters: 54,
        kind: 'medium',
      },
    ],
    restZones: [
      { zStart: 236, zEnd: 350 },
      // Zero random rocks/trees across approach, entire Rock Garden (440..760), and wide recovery area (760..885)
      { zStart: 388, zEnd: 890 },
      { zStart: 936, zEnd: 1054 },
      { zStart: 1138, zEnd: 1192 },
    ],
    manualObstacles: [
      // Opening stretch
      { z: 126, offsetX: 4.0, kind: 'pine', scale: 1.1 },
      { z: 164, offsetX: -4.0, kind: 'rock', scale: 1.08 },
      { z: 208, offsetX: 3.6, kind: 'pine', scale: 1.1 },

      // --- ROCK GARDEN: 4 structured boulder-group route choices (z = 440..760) ---
      // 32m open transition aprons between each boulder group keep both routes readable & forgiving!
      // Shorter direct center route threads staggered rock clusters (23m Z-spacing); wider outer lane is slightly longer with far fewer rocks!

      // Sector 1 (z=454..502): Direct center rockier route vs wide visible RIGHT safer route
      { z: 454, offsetX: -10.6, kind: 'rock', scale: 1.14 },
      { z: 474, offsetX: -7.2, kind: 'rock', scale: 1.08 },
      { z: 498, offsetX: -10.8, kind: 'rock', scale: 1.12 },
      { z: 456, offsetX: -2.2, kind: 'rock', scale: 1.04 },
      { z: 479, offsetX: 2.6, kind: 'rock', scale: 1.04 },
      { z: 502, offsetX: -2.0, kind: 'rock', scale: 1.02 },
      { z: 484, offsetX: 13.8, kind: 'rock', scale: 1.06 },

      // Sector 2 (z=534..582): Direct center rockier route vs wide visible LEFT safer route
      { z: 534, offsetX: 10.6, kind: 'rock', scale: 1.14 },
      { z: 554, offsetX: 7.2, kind: 'rock', scale: 1.08 },
      { z: 578, offsetX: 10.8, kind: 'rock', scale: 1.12 },
      { z: 536, offsetX: 2.2, kind: 'rock', scale: 1.04 },
      { z: 559, offsetX: -2.6, kind: 'rock', scale: 1.04 },
      { z: 582, offsetX: 2.0, kind: 'rock', scale: 1.02 },
      { z: 564, offsetX: -13.8, kind: 'rock', scale: 1.06 },

      // Sector 3 (z=614..662): Direct center rockier route vs wide visible RIGHT safer route
      { z: 614, offsetX: -10.6, kind: 'rock', scale: 1.14 },
      { z: 634, offsetX: -7.2, kind: 'rock', scale: 1.08 },
      { z: 658, offsetX: -10.8, kind: 'rock', scale: 1.12 },
      { z: 616, offsetX: -2.2, kind: 'rock', scale: 1.04 },
      { z: 639, offsetX: 2.6, kind: 'rock', scale: 1.04 },
      { z: 662, offsetX: -2.0, kind: 'rock', scale: 1.02 },
      { z: 644, offsetX: 13.8, kind: 'rock', scale: 1.06 },

      // Sector 4 (z=694..742): Direct center rockier route vs wide visible LEFT safer route -> Open recovery (760..885)
      { z: 694, offsetX: 10.6, kind: 'rock', scale: 1.14 },
      { z: 714, offsetX: 7.2, kind: 'rock', scale: 1.08 },
      { z: 738, offsetX: 10.8, kind: 'rock', scale: 1.12 },
      { z: 696, offsetX: 2.2, kind: 'rock', scale: 1.04 },
      { z: 719, offsetX: -2.6, kind: 'rock', scale: 1.04 },
      { z: 742, offsetX: 2.0, kind: 'rock', scale: 1.02 },
      { z: 724, offsetX: -13.8, kind: 'rock', scale: 1.06 },

      // Late stretch well after the recovery area & Ramp 802
      { z: 1165, offsetX: 0, kind: 'fallen_log', scale: 1.02 },
      { z: 1222, offsetX: -4.2, kind: 'pine', scale: 1.1 },
    ],
  },
  {
    levelNumber: 9,
    name: 'Double Drop',
    arenaStyle: 'Two downhill drops separated by a flat recovery area and wide shelter run-out',
    length: 1420,
    spawnSeed: 20261829,
    baseSpeed: 28.6,
    avalancheCruiseSpeed: 26.8,
    avalancheStartDistance: 28.0,
    densityScale: 1.56,
    steepDescents: [
      {
        id: 'lv9-double-drop-1',
        zStart: 350,
        zEnd: 505,
        approachDistance: 48,
        recoveryDistance: 58,
        extraGradient: 0.25,
        extraHalfWidth: 4.4,
        cameraMode: 'alley',
      },
      {
        id: 'lv9-double-drop-2',
        zStart: 785,
        zEnd: 1005,
        approachDistance: 48,
        recoveryDistance: 120,
        extraGradient: 0.29,
        extraHalfWidth: 5.0,
        cameraMode: 'alley',
      },
    ],
    flatZones: [
      {
        id: 'lv9-double-drop-recovery',
        zStart: 516,
        zEnd: 746,
        flattenFraction: 0.76,
        extraHalfWidth: 3.6,
        cruiseSpeedDrop: 0,
        naturalCoastDecayRate: 2.2,
      },
    ],
    ramps: [],
    restZones: [
      // Eliminate random obstacle clutter across Approach 1, Drop 1, Flat Recovery, Approach 2, Drop 2, and Final Shelter Recovery
      { zStart: 278, zEnd: 1350 },
    ],
    manualObstacles: [
      // Gentle opening stretch well ahead of Drop 1 approach (z = 118..248)
      { z: 126, offsetX: -4.4, kind: 'pine', scale: 1.08 },
      { z: 172, offsetX: 4.6, kind: 'rock', scale: 1.06 },
      { z: 222, offsetX: -4.2, kind: 'pine', scale: 1.08 },
      // Approach 1 (z = 278..350) stays completely clear for clean sightline over Drop 1

      // First downhill (z = 350..505): sparse outer-edge obstacles, wide visible center safe route
      { z: 398, offsetX: -6.8, kind: 'rock', scale: 1.06 },
      { z: 446, offsetX: 6.8, kind: 'pine', scale: 1.08 },
      { z: 486, offsetX: -7.2, kind: 'rock', scale: 1.04 },

      // Flat recovery area (z = 516..746): wide open lane to regain control, reset speed & direction
      { z: 602, offsetX: 7.8, kind: 'pine', scale: 1.06 },
      { z: 674, offsetX: -7.8, kind: 'rock', scale: 1.04 },
      // Approach 2 (z = 700..785) stays completely clear for clean sightline over Drop 2

      // Second downhill (z = 785..1005): longer with one gentle curve, sparse edge obstacles, wide safe route
      { z: 838, offsetX: 7.4, kind: 'rock', scale: 1.08 },
      { z: 892, offsetX: -7.4, kind: 'pine', scale: 1.08 },
      { z: 946, offsetX: 7.6, kind: 'rock', scale: 1.06 },
      { z: 986, offsetX: -7.8, kind: 'pine', scale: 1.04 },
      // Wide recovery area before the shelter (z = 1005..1265) stays completely open!
    ],
  },
  {
    levelNumber: 10,
    name: 'Storm Peak Summit',
    arenaStyle: 'Ultimate summit switchbacks, 3 kickers, 3 fallen logs & full 9-Lil-Yeti crew',
    length: 1500,
    spawnSeed: 20261997,
    baseSpeed: 29.0,
    avalancheCruiseSpeed: 27.2,
    avalancheStartDistance: 28.0,
    densityScale: 1.66,
    splitZone: {
      zStart: 475,
      zEnd: 665,
      extraHalfWidth: 5.9,
      dividerOffsetX: 0,
      safeSide: -1,
      bonusSide: 1,
    },
    ramps: [
      {
        id: 1001,
        zStart: 525,
        length: 14.5,
        height: 2.7,
        width: 6.2,
        offsetX: 7.8,
        launchVy: 12.6,
        landingClearMeters: 58,
        kind: 'bonus',
      },
      {
        id: 1002,
        zStart: 910,
        length: 14.2,
        height: 2.6,
        width: 5.8,
        offsetX: -2.2,
        launchVy: 12.2,
        landingClearMeters: 54,
        kind: 'medium',
      },
      {
        id: 1003,
        zStart: 1200,
        length: 14.2,
        height: 2.6,
        width: 5.8,
        offsetX: 2.2,
        launchVy: 12.2,
        landingClearMeters: 54,
        kind: 'medium',
      },
    ],
    restZones: [
      { zStart: 300, zEnd: 355 },
      { zStart: 445, zEnd: 675 },
      { zStart: 760, zEnd: 815 },
      { zStart: 874, zEnd: 992 },
      { zStart: 1055, zEnd: 1110 },
      { zStart: 1164, zEnd: 1282 },
    ],
    manualObstacles: [
      { z: 126, offsetX: -4.0, kind: 'rock', scale: 1.08 },
      { z: 162, offsetX: 3.8, kind: 'pine', scale: 1.12 },
      { z: 202, offsetX: -3.2, kind: 'pine', scale: 1.1 },
      { z: 244, offsetX: 4.4, kind: 'rock', scale: 1.08 },
      { z: 326, offsetX: 0, kind: 'fallen_log', scale: 1.04 },
      { z: 498, offsetX: -0.6, kind: 'rock', scale: 1.24 },
      { z: 518, offsetX: -0.8, kind: 'pine', scale: 1.28 },
      { z: 540, offsetX: -0.4, kind: 'pine', scale: 1.22 },
      { z: 562, offsetX: -0.7, kind: 'rock', scale: 1.26 },
      { z: 586, offsetX: -0.5, kind: 'pine', scale: 1.25 },
      { z: 612, offsetX: -0.6, kind: 'rock', scale: 1.18 },
      { z: 568, offsetX: -11.8, kind: 'pine', scale: 1.1 },
      { z: 718, offsetX: 4.0, kind: 'rock', scale: 1.1 },
      { z: 786, offsetX: 0, kind: 'fallen_log', scale: 1.04 },
      { z: 1082, offsetX: 0, kind: 'fallen_log', scale: 1.04 },
      { z: 1326, offsetX: -4.2, kind: 'pine', scale: 1.12 },
      { z: 1368, offsetX: 4.0, kind: 'rock', scale: 1.08 },
    ],
  },
] as const;

export function getLevelConfig(levelNumber: number): LevelConfig {
  const clamped = Math.max(1, Math.min(LEVEL_CONFIGS.length, Math.floor(levelNumber)));
  return LEVEL_CONFIGS[clamped - 1];
}

/** Exact follower count rule: active followers during a level = levelNumber - 1. */
export function getFollowersForLevel(levelNumber: number): number {
  return Math.max(0, Math.floor(levelNumber) - 1);
}
