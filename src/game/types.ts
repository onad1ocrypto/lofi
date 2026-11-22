import type { WindGustState } from './windGustLogic';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';

export type ObstacleKind = 'rock' | 'pine' | 'fallen_log';

export type JumpState = 'GROUNDED' | 'AIRBORNE' | 'LANDING';

export type RampKind = 'small' | 'medium' | 'bonus';

export type GrabTrickStyle = 'INDY' | 'TAIL' | 'METHOD' | 'NOSE';

export type SteepCameraPhase = 'NORMAL' | 'APPROACH' | 'DESCENT' | 'RECOVERY';

export interface SteepDescentZone {
  id: string;
  /** Start of the steep downhill slope (meters). */
  zStart: number;
  /** End of the steep downhill slope / bottom landing entry (meters). */
  zEnd: number;
  /** Distance ahead of zStart where warning & APPROACH camera engage (meters). */
  approachDistance: number;
  /** Distance past zEnd for wide landing & RECOVERY camera return to NORMAL (meters). */
  recoveryDistance: number;
  /** Extra slope gradient added smoothly on top of base SLOPE_GRADIENT. */
  extraGradient: number;
  /** Extra trail half-width added smoothly across the steep slope & landing bowl (meters). */
  extraHalfWidth: number;
  /** Camera behavior mode ('steep' for Lv3, 'carving' for Lv4, 'dropJump' for Lv5, 'slalom' for Lv6, 'alley' for Lv7, 'rockGarden' for Lv8). Defaults to 'steep'. */
  cameraMode?: 'steep' | 'carving' | 'dropJump' | 'slalom' | 'alley' | 'rockGarden';
  /** When true, active carving on snow smoothly helps bleed excess downhill speed (Level 4 Carving Pass). */
  enableCarvingSpeedControl?: boolean;
}

export interface FlatMomentumZone {
  id: string;
  /** Start of the flat snow section (meters). */
  zStart: number;
  /** End of the flat snow section (meters). */
  zEnd: number;
  /** Fraction of base SLOPE_GRADIENT flattened out smoothly across the plateau (0..0.85). */
  flattenFraction: number;
  /** Extra trail half-width added smoothly across the flat corridor (meters). */
  extraHalfWidth: number;
  /** Natural flat-snow cruise speed drop below level baseSpeed so momentum matters (m/s). */
  cruiseSpeedDrop: number;
  /** Gentle coasting deceleration rate while gliding above flat cruise speed (1/s). */
  naturalCoastDecayRate: number;
}

export interface CarvingPassConfig {
  /** Start of the S-shaped carving downhill (meters). */
  zStart: number;
  /** End of the S-shaped carving downhill (meters). */
  zEnd: number;
  /** Start of smooth transition into the straight approach (meters). */
  blendStart: number;
  /** End of smooth transition exiting the flat recovery area (meters). */
  blendEnd: number;
  /** Peak sinusoidal S-curve displacement amplitude (meters). */
  sAmplitude: number;
  /** Direction of the first sweeping bend (+1 = right then left, -1 = left then right). */
  firstBendSign: 1 | -1;
  /** Longitudinal spacing between snow mounds along the outside of each curve (meters). */
  moundSpacing: number;
}

export interface TrackRamp {
  id: number;
  /** Downhill distance where the ramp entry starts (meters). */
  zStart: number;
  /** Length of the inclined snow ramp deck along the slope (meters). */
  length: number;
  /** Peak vertical lip height above the snow surface (meters). */
  height: number;
  /** Playable width of the ramp deck (meters). */
  width: number;
  /** Lateral offset from the track centerline (meters). */
  offsetX: number;
  /** Upward launch velocity applied at takeoff (m/s). */
  launchVy: number;
  /** Minimum obstacle-free landing runway past the lip (meters). */
  landingClearMeters: number;
  /** Visual & difficulty tier. */
  kind: RampKind;
}

export interface TrackRestZone {
  zStart: number;
  zEnd: number;
}

export interface TrackSplitZone {
  zStart: number;
  zEnd: number;
  /** Extra half-width smoothly added to create a wide local dual-route bowl (meters). */
  extraHalfWidth: number;
  /** Center divider offset (meters from track centerline). */
  dividerOffsetX: number;
  /** Safe side lane (-1 = left, +1 = right). */
  safeSide: -1 | 1;
  /** Bonus ramp side lane (-1 = left, +1 = right). */
  bonusSide: -1 | 1;
}

export interface ManualObstacleSpec {
  z: number;
  offsetX: number;
  kind: ObstacleKind;
  scale?: number;
}

export interface TrackObstacle {
  id: number;
  kind: ObstacleKind;
  /** Distance along the downhill track in meters (0 = start, levelLength = shelter). */
  z: number;
  /** Offset from the track centerline in meters (negative = left, positive = right). */
  offsetX: number;
  /** World X coordinate computed from track centerline + offsetX. */
  worldX: number;
  /** World Y coordinate at the base of the obstacle. */
  worldY: number;
  /** Collision radius in meters (for circular rocks & pines). */
  radius: number;
  /** Optional half-width along X for wide obstacles stretching across the trail (e.g. fallen_log). */
  barHalfWidth?: number;
  /** Optional half-depth along downhill Z for wide horizontal obstacles (e.g. fallen_log). */
  halfDepthZ?: number;
  /** Vertical clearance height in meters; airborne riders strictly above this height sail over cleanly. */
  clearanceHeight: number;
  /** Uniform base scale multiplier. */
  scale: number;
  /** Organic per-axis scale multipliers for natural silhouette variation. */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** Full Y-axis rotation in radians [0, 2π). */
  rotationY: number;
  /** Subtle organic X/Z tilt in radians for natural mountain grounding. */
  tiltX: number;
  tiltZ: number;
  /** Subtle per-instance color tint multiplier. */
  tint: number;
  /** Whether the player already collided with this obstacle in the current run. */
  hit: boolean;
}

export interface LilYetiCollectible {
  id: number;
  /** Downhill distance along the track in meters. */
  z: number;
  /** Lateral offset from track centerline in meters. */
  offsetX: number;
  /** World X coordinate computed from track centerline + offsetX. */
  worldX: number;
  /** World ground Y coordinate directly below the collectible. */
  worldY: number;
  /** Floating height above local snow surface in meters. */
  hoverHeight: number;
  /** Score value awarded on pickup. */
  points: number;
  /** Whether Lofi has collected this Lil Yeti in the current run. */
  collected: boolean;
  /** 0..1 pickup pop-out animation progress after collection. */
  collectAnimProgress: number;
}

export interface InputState {
  /** Continuous steering intent in [-1, 1], where -1 is left and +1 is right. */
  steerAxis: number;
  /** Keyboard left held. */
  left: boolean;
  /** Keyboard right held. */
  right: boolean;
  /** Pointer/touch horizontal drag steering value in [-1, 1]. */
  dragSteer: number;
  /** Whether pointer drag is currently active. */
  dragging: boolean;
  /** Edge-triggered jump press (W / ArrowUp / mobile LOMPAT button) consumed by simulation. */
  jumpQueued: boolean;
  /** Hold Space (desktop) or TRIK button (mobile) while airborne to perform a Grab trick. */
  grab: boolean;
  /** Hold S / ArrowDown (desktop) or BRAKE button (mobile) to speed-check smoothly on snow. */
  brake: boolean;
}

export interface LevelConfig {
  /** 1-based level index (1, 2, 3, ...). */
  levelNumber: number;
  /** Short Indonesian level name shown in HUD/modals. */
  name: string;
  /** Short Indonesian arena summary for clarity. */
  arenaStyle: string;
  /** Downhill distance in meters from start to the level's shelter. */
  length: number;
  /** Deterministic default seed for organic obstacle placement. */
  spawnSeed: number;
  /** Base downhill cruise speed in m/s. */
  baseSpeed: number;
  /** Avalanche base pursuit speed in m/s. */
  avalancheCruiseSpeed: number;
  /** Starting avalanche margin behind Lofi in meters. */
  avalancheStartDistance: number;
  /** Multiplier for obstacle cluster rhythm (<1 lighter, >1 denser). */
  densityScale: number;
  /** Hand-placed ramps for this level. */
  ramps: readonly TrackRamp[];
  /** Hand-authored breather/rest stretches with zero obstacles. */
  restZones: readonly TrackRestZone[];
  /** Optional local dual-route split section (Safe lane vs Bonus ramp lane). */
  splitZone?: TrackSplitZone;
  /** Optional reusable steep-descent challenge zones. */
  steepDescents?: readonly SteepDescentZone[];
  /** Optional flat snow momentum sections between downhills (Level 7 Avalanche Alley). */
  flatZones?: readonly FlatMomentumZone[];
  /** Hand-authored signature obstacle formations for this level. */
  manualObstacles: readonly ManualObstacleSpec[];
}

export interface PathSample {
  /** Cumulative 2D arc-length distance Lofi has traveled along the trail (meters). */
  travelDistance: number;
  /** Forward downhill distance coordinate (worldZ = -distance). */
  distance: number;
  /** World X position of Lofi at this path point. */
  worldX: number;
  /** Ground elevation Y at this path point (excluding jump height). */
  worldY: number;
  /** Height above local snow ground (meters, >0 on ramps and during jumps). */
  heightAboveGround: number;
  /** Jump state at this point along Lofi's trail. */
  jumpState: JumpState;
  /** Landing knee-bend progress in [0, 1] (0 = neutral, >0 = bending knees). */
  landingProgress: number;
  /** Ramp/airborne pitch angle in radians. */
  rampPitch: number;
  /** Grab animation blend in [0, 1]. */
  grabAmount: number;
  /** Downhill track/travel yaw in radians. */
  yaw: number;
  /** Carving lean value in [-1, 1] at this path point. */
  lean: number;
  /** Smooth braking amount in [0, 1] recorded at this trail point. */
  brakeAmount: number;
  /** Local downhill terrain pitch angle in radians at this trail point. */
  slopePitch: number;
}

export interface FollowerYeti {
  /** Unique stable ID for this follower in the convoy (1-based). */
  id: number;
  /** 0-based order behind Lofi (0 = closest behind Lofi, 1 = second, etc.). */
  slotIndex: number;
  /** Current world X coordinate. */
  worldX: number;
  /** Current local snow ground elevation Y coordinate. */
  worldY: number;
  /** Current vertical height above local snow ground (meters, for sequential ramp & jump arcs). */
  heightAboveGround: number;
  /** Current jump state sampled sequentially from Lofi's distance-indexed path. */
  jumpState: JumpState;
  /** Landing knee-bend progress in [0, 1]. */
  landingProgress: number;
  /** Ramp/airborne pitch in radians. */
  rampPitch: number;
  /** Grab pose blend in [0, 1]. */
  grabAmount: number;
  /** Current downhill distance coordinate (worldZ = -distance). */
  distance: number;
  /** Current yaw orientation in radians. */
  yaw: number;
  /** Current carving lean in [-1, 1]. */
  lean: number;
  /** Smooth braking pose blend in [0, 1] mimicking Lofi & steep descent speed-checking. */
  brakeAmount: number;
  /** Local downhill terrain pitch in radians at follower's current z. */
  slopePitch: number;
}

export interface OutcomeSnapshot {
  kind: 'victory' | 'gameover';
  /** Exact level number that was being played when the outcome triggered. */
  levelNumber: number;
  levelName: string;
  /** Exact active followers during that level attempt (strictly levelNumber - 1). */
  activeFollowers: number;
  /** Newly recruited Yetis from this outcome (strictly 1 on victory, 0 on gameover). */
  recruitedFollowers: number;
  /** Progress percentage captured at the instant of finish or defeat. */
  progressPct: number;
  /** Frozen run score captured at outcome. */
  score: number;
  /** Frozen landed grab tricks count captured at outcome. */
  grabCount: number;
  /** Highest score multiplier reached during this level attempt (1..5). */
  peakMultiplier: number;
}

export interface SimulationState {
  phase: GamePhase;
  /** Current 1-based level number. Active followers strictly equal (levelNumber - 1). */
  levelNumber: number;
  /** Total playable levels in this build. */
  totalLevels: number;
  /** Current level display name. */
  levelName: string;
  /** Current level shelter distance in meters. */
  levelLength: number;
  /** Base forward cruise speed for current level (m/s). */
  levelBaseSpeed: number;
  /** Avalanche base pursuit speed for current level (m/s). */
  levelAvalancheCruiseSpeed: number;
  /** Seed currently used by this level's layout. */
  spawnSeed: number;
  /** Progress distance down the slope in meters (0..levelLength). */
  distance: number;
  /** Cumulative planar arc-length distance traveled by Lofi (for stable follower spacing). */
  travelDistance: number;
  /** Lateral offset from track centerline in meters. */
  lateralOffset: number;
  /** Current lateral velocity in m/s. */
  lateralVelocity: number;
  /** Current forward speed in m/s. */
  forwardSpeed: number;
  /** Elapsed active gameplay time in seconds. */
  elapsedTime: number;
  /** Distance of the avalanche behind the player in meters (0 = caught). */
  avalancheDistance: number;
  /** Remaining invulnerability timer after hitting an obstacle (seconds). */
  invulnTimer: number;
  /** Remaining visual hit-flash timer (seconds). */
  hitFlashTimer: number;
  /** Remaining slowdown recovery timer after a hit (seconds). */
  slowdownTimer: number;
  /** Number of obstacle collisions in this level attempt. */
  hitCount: number;
  /** Smoothed lean angle for character & board visuals (-1..1). */
  visualLean: number;
  /** Explicit vertical jump state machine. */
  jumpState: JumpState;
  /** Current vertical height above local ground surface in meters (>= 0). */
  heightAboveGround: number;
  /** Current vertical velocity in m/s (used during AIRBORNE arc). */
  verticalVelocity: number;
  /** Smooth board pitch angle on ramps and during jumps (radians). */
  rampPitch: number;
  /** Remaining landing knee-bend recovery timer (seconds). */
  landingTimer: number;
  /** Short pre-touchdown jump buffer timer so pressing W/ArrowUp slightly early still pops cleanly on landing. */
  jumpBufferTimer: number;
  /** Smoothed Grab pose blend in [0, 1]. */
  grabAmount: number;
  /** Whether player held Grab cleanly while airborne during the current jump. */
  grabHeldInAir: boolean;
  /** Accumulated clean Grab hold duration in the current jump (seconds). */
  grabAirHoldTime: number;
  /** ID of the ramp currently being ridden up (null when not on a ramp deck). */
  activeRampId: number | null;
  /** Total Grab tricks successfully landed in this run. */
  grabCount: number;
  /** Active grab style for the current airborne maneuver (INDY / TAIL / METHOD / NOSE). */
  activeGrabStyle: GrabTrickStyle;
  /** Highest altitude above ground reached during the current jump arc (meters). */
  airPeakHeight: number;
  /** True when the current jump launched off a ramp lip. */
  launchedFromRamp: boolean;
  /** Active score multiplier earned from stylish descent tricks (1..5). */
  scoreMultiplier: number;
  /** Highest score multiplier reached during this run (1..5). */
  peakMultiplier: number;
  /** Remaining combo decay timer before scoreMultiplier resets to 1x (seconds). */
  multiplierTimer: number;
  /** Display label of the most recently landed trick (e.g. "INDY GRAB", "CLEAN JUMP"). */
  lastTrickLabel: string | null;
  /** Points earned by the most recently landed trick (after multiplier). */
  lastTrickPoints: number;
  /** Remaining HUD feedback badge timer after landing a trick (seconds). */
  trickFeedbackTimer: number;
  /** Remaining subtle speed flow boost after a clean ramp/grab landing (seconds). */
  landingBoostTimer: number;
  /**
   * Guard flag ensuring the +1 shelter Yeti join reward is granted at most once
   * per completed level, even if transition handlers are triggered repeatedly.
   */
  levelRewardGranted: boolean;
  /** Total Yeti followers unlocked for the NEXT level (starts at levelNumber - 1, becomes levelNumber on clear). */
  unlockedFollowers: number;
  /** Frozen state snapshot captured at the exact moment Victory or Game Over triggers (null during active play). */
  outcomeSnapshot: OutcomeSnapshot | null;
  /** Hand-placed ramps for the active level. */
  ramps: TrackRamp[];
  /** Track obstacles with mutable hit state. */
  obstacles: TrackObstacle[];
  /** Glowing Lil Yeti collectibles spawned along the snow path for this run. */
  collectibles: LilYetiCollectible[];
  /** Live score earned from Lil Yeti collectibles & stylish tricks during this run. */
  score: number;
  /** Count of Lil Yeti collectibles picked up during this run. */
  collectedCollectiblesCount: number;
  /** Most recent score delta (+100, +150, +300, etc.) for HUD score pulse display. */
  lastScoreDelta: number;
  /** Remaining HUD score highlight pulse timer after earning points (seconds). */
  scoreFeedbackTimer: number;
  /** Active follower Yetis riding mini-snowboards behind Lofi (length strictly equals levelNumber - 1). */
  followers: FollowerYeti[];
  /** Distance-indexed trail history of Lofi's path for curved convoy following & sequential jumps. */
  pathHistory: PathSample[];
  /** Randomized alpine wind gust state driving subtle crosswind steering push, shake, and particle drift. */
  windGust: WindGustState;
  /** Smooth braking amount in [0, 1] when holding S / ArrowDown / BRAKE on snow. */
  brakeAmount: number;
  /** Active steep-descent camera/zone phase (NORMAL / APPROACH / DESCENT / RECOVERY). */
  steepPhase: SteepCameraPhase;
  /** Smooth 0..1 steepness factor at Lofi's current position. */
  steepSlopeFactor: number;
  /** True when the steep-drop warning banner should be shown ahead of the slope. */
  steepWarningActive: boolean;
}

export interface MiniMapPoint {
  x: number;
  y: number;
}

export interface MiniMapRampMarker {
  x: number;
  y: number;
  kind: RampKind;
}

export interface MiniMapObstacleMarker {
  x: number;
  y: number;
  z: number;
  kind: ObstacleKind;
}

export interface MiniMapLayout {
  levelNumber: number;
  levelLength: number;
  /** SVG closed polygon path for the groomed snow track ribbon. */
  ribbonPath: string;
  /** SVG open polyline path for the track centerline. */
  centerlinePath: string;
  /** Shelter finish icon coordinates in SVG viewBox space. */
  shelterX: number;
  shelterY: number;
  /** World-to-SVG projection parameters for O(1) live updates. */
  centerWorldX: number;
  scaleX: number;
  /** Ramps projected onto the mini map. */
  ramps: readonly MiniMapRampMarker[];
  /** Obstacles projected onto the mini map (fallen logs + rocks/pines). */
  obstacles: readonly MiniMapObstacleMarker[];
  /** Difficulty tier label (Landai / Menantang / Ekstrem). */
  difficultyLabel: string;
}

export interface MiniMapSnapshot {
  layout: MiniMapLayout;
  playerX: number;
  playerY: number;
  /** Visual heading yaw angle in degrees for the player marker arrow. */
  playerHeadingDeg: number;
  /** Avalanche leading edge X/Y in SVG viewBox space. */
  avalancheX: number;
  avalancheY: number;
  /** Active follower Yetis projected onto the mini map. */
  followers: readonly MiniMapPoint[];
}

export interface HudSnapshot {
  phase: GamePhase;
  /** 1-based level number. */
  levelNumber: number;
  /** Total levels available. */
  totalLevels: number;
  /** Current level display name. */
  levelName: string;
  /** True if another level exists after completing the current one. */
  hasNextLevel: boolean;
  /** 0..100 integer progress percentage toward the shelter. */
  progressPct: number;
  /** Remaining distance to the shelter in integer meters. */
  remainingMeters: number;
  /** Current avalanche gap in meters (integer). */
  avalancheMeters: number;
  /** 0..1 danger ratio (0 = safe, 1 = caught). */
  avalancheDanger: number;
  /** Elapsed run time in seconds. */
  elapsedSeconds: number;
  /** Speed in km/h (integer). */
  speedKmh: number;
  /** Total obstacle hits in this level attempt. */
  hitCount: number;
  /** True briefly right after hitting an obstacle. */
  hitFeedback: boolean;
  /** Active jump state (GROUNDED, AIRBORNE, LANDING). */
  jumpState: JumpState;
  /** True while player is actively holding Grab in mid-air. */
  isGrabbing: boolean;
  /** Total Grab tricks cleanly landed in this level attempt. */
  grabCount: number;
  /** True briefly right after landing a Grab trick cleanly. */
  trickFeedbackActive: boolean;
  /** Active followers riding behind Lofi during this level (strictly levelNumber - 1). */
  followerCount: number;
  /** Newly recruited Yetis from the current outcome (1 on Victory, 0 on Game Over/playing). */
  recruitedFollowers: number;
  /** Total followers unlocked after clearing this level at the shelter (followerCount + 1 on victory). */
  unlockedFollowers: number;
  /** True only after Lofi's arrival & recruit sequence completes on Victory (gates Victory buttons). */
  victoryUiReady: boolean;
  /** Smooth 0..1 progress of the +1 recruit Yeti joining at the shelter during Victory. */
  recruitJoinProgress: number;
  /** True only after the short snow-burial transition completes on Game Over (gates Game Over panel). */
  gameoverUiReady: boolean;
  /** Best clear time in seconds, or null if none yet. */
  bestTimeSeconds: number | null;
  /** Live run score from Lil Yeti collectibles & stylish tricks. */
  score: number;
  /** Number of Lil Yeti collectibles collected so far in this run. */
  collectedCollectibles: number;
  /** Total Lil Yeti collectibles spawned along this level's path. */
  totalCollectibles: number;
  /** Active score multiplier earned via stylish tricks (1..5). */
  scoreMultiplier: number;
  /** Highest score multiplier reached during this run (1..5). */
  peakMultiplier: number;
  /** Remaining combo timer ratio in [0, 1] for HUD combo decay bar. */
  multiplierTimerRatio: number;
  /** Display label for the active mid-air grab pose (e.g. "INDY GRAB"). */
  activeGrabLabel: string;
  /** Label of the most recently landed trick for HUD toast display. */
  lastTrickLabel: string | null;
  /** Points earned by the most recently landed trick (after multiplier). */
  lastTrickPoints: number;
  /** Most recent score gain shown in the HUD score pulse badge. */
  lastScoreDelta: number;
  /** True briefly right after earning score for subtle HUD highlight feedback. */
  scoreFeedbackActive: boolean;
  /** True while holding Brake on snow. */
  isBraking: boolean;
  /** Active steep-descent camera phase (NORMAL / APPROACH / DESCENT / RECOVERY). */
  steepPhase: SteepCameraPhase;
  /** True right before and at the crest of a steep descent to display the warning banner. */
  steepWarningActive: boolean;
  /** True if the active level includes a steep-descent section (controls mobile BRAKE prominence). */
  hasSteepDescent: boolean;
  /** Live top-down alpine mini map snapshot for the active level. */
  miniMap?: MiniMapSnapshot;
}

export interface StepEvents {
  collidedObstacle: TrackObstacle | null;
  becameVictory: boolean;
  becameGameOver: boolean;
  carveIntensity: number;
  tookOff: boolean;
  startedGrab: boolean;
  landed: boolean;
  landedGrabTrick: boolean;
  landedTrickPoints: number;
  landedTrickLabel: string | null;
  collectedCount: number;
  collectedPoints: number;
  lastCollectedPos: { x: number; y: number; z: number } | null;
}
