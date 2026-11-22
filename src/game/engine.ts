import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeArenaDifficultyProfile } from './arenaDifficulty';
import { createGameAudio } from './audio';
import { createCameraRig } from './cameraRig';
import { spawnLevelCollectibles } from './collectibleLogic';
import {
  clearHeldActionKeyTracker,
  clearKeyboardSteerTracker,
  computeDragRangePixels,
  createHeldActionKeyTracker,
  createKeyboardSteerTracker,
  pressActionKey,
  pressSteerKey,
  releaseActionKey,
  releaseSteerKey,
  stepDragSteer,
} from './controlLogic';
import {
  createDynamicFogState,
  getBlizzardZonesForLevel,
  stepDynamicFogState,
} from './dynamicFogLogic';
import { getLevelConfig } from './levels';
import { createLofiCharacter } from './lofiCharacter';
import { buildMiniMapLayout, buildMiniMapSnapshot } from './miniMapLogic';
import { buildLevelObstacles } from './obstacleSpawner';
import {
  computeArrivalCoastMeters,
  createShelterArrivalState,
  resetShelterArrival,
  stepGameOverSequence,
  stepShelterArrival,
  triggerGameOverSequenceOnce,
  triggerShelterCelebrationOnce,
} from './shelterArrival';
import {
  SIM_CONFIG,
  advanceToNextLevel,
  buildHudSnapshot,
  createInitialInput,
  createInitialSimulationState,
  retryCurrentLevel,
  startNewGame,
  stepSimulation,
} from './simulation';
import { DAYLIGHT_RIG, FOG_CONFIG, SKY_PALETTE } from './skyDome';
import { createSmallYetiPool } from './smallYetiCharacter';
import {
  getGroundHeightAt,
  getTrackCenterX,
  getTrackHalfWidth,
  getTrackPitchAt,
  getTrackSlopeTangentX,
  setActiveTrackProfile,
} from './trackData';
import type { FollowerYeti, GamePhase, HudSnapshot, MiniMapLayout } from './types';
import {
  computeWindGustParticlePush,
  resetWindGustState,
  type WindGustParticlePushOut,
} from './windGustLogic';
import { buildAlpineWorld } from './worldBuilder';

export interface GameEngineController {
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  retryLevel: () => void;
  nextLevel: () => void;
  newGame: () => void;
  restartGame: () => void;
  returnToTitle: () => void;
  triggerJump: () => void;
  setGrabHeld: (held: boolean) => void;
  setTrickHeld: (held: boolean) => void;
  setBrakeHeld: (held: boolean) => void;
  toggleMute: () => boolean;
  getPhase: () => GamePhase;
  dispose: () => void;
}

export interface GameEngineOptions {
  container: HTMLElement;
  autostart?: boolean;
  initialLevel?: number;
  nearFinish?: boolean;
  nearRamp?: boolean;
  nearLog?: boolean;
  nearGameOver?: boolean;
  nearDescent?: boolean;
  forceWindGust?: boolean;
  inBlizzard?: boolean;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onMuteChange: (muted: boolean) => void;
}

const BEST_TIME_STORAGE_KEY = 'lofi_ice_escape_best_time_s';

function loadBestTime(): number | null {
  try {
    const raw = window.localStorage.getItem(BEST_TIME_STORAGE_KEY);
    if (!raw) return null;
    const val = Number.parseFloat(raw);
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

function saveBestTime(seconds: number): void {
  try {
    window.localStorage.setItem(BEST_TIME_STORAGE_KEY, seconds.toFixed(2));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function syncBodyState(
  phase: GamePhase,
  levelNumber: number,
  followersCount: number,
  celebrating: boolean,
  jumpState: string,
  grabCount: number,
  spatialAudioReady: boolean,
): void {
  document.body.dataset.state = phase === 'victory' ? 'gameover' : phase;
  document.body.dataset.phase = phase;
  document.body.dataset.level = String(levelNumber);
  document.body.dataset.followers = String(followersCount);
  document.body.dataset.celebrating = celebrating ? '1' : '0';
  document.body.dataset.jumpState = jumpState;
  document.body.dataset.grabs = String(grabCount);
  document.body.dataset.audioSpatial = spatialAudioReady ? '1' : '0';
}

export function createGameEngine(
  options: GameEngineOptions,
): GameEngineController {
  const {
    container,
    autostart = false,
    initialLevel = 1,
    nearFinish = false,
    nearRamp = false,
    nearLog = false,
    nearGameOver = false,
    nearDescent = false,
    forceWindGust = false,
    inBlizzard = false,
    onHudUpdate,
    onMuteChange,
  } = options;

  const isSoftwareGl = detectSoftwareWebGL();
  const initialPhase: GamePhase = autostart ? 'playing' : 'title';
  const sim = createInitialSimulationState(initialPhase, undefined, initialLevel);
  if (autostart) {
    resetWindGustState(sim.windGust, (Math.random() * 0xffffffff) >>> 0);
    if (forceWindGust) {
      sim.windGust.cooldown = 0.05;
    }
  }
  const arrivalState = createShelterArrivalState();
  const firstFallenLog = sim.obstacles.find((o) => o.kind === 'fallen_log');
  const firstSteepDescent = getLevelConfig(sim.levelNumber).steepDescents?.[0];
  if (nearGameOver) {
    sim.distance = 86;
    sim.travelDistance = 86;
    sim.lateralOffset = 0;
    sim.forwardSpeed = SIM_CONFIG.hitSlowSpeed;
    sim.slowdownTimer = 1.5;
    sim.avalancheDistance = 1.2;
    sim.pathHistory = [];
    for (let d = 60; d <= 86; d += 0.4) {
      const wx = getTrackCenterX(d);
      sim.pathHistory.push({
        travelDistance: d,
        distance: d,
        worldX: wx,
        worldY: getGroundHeightAt(wx, d),
        heightAboveGround: 0,
        jumpState: 'GROUNDED',
        landingProgress: 0,
        rampPitch: 0,
        grabAmount: 0,
        yaw: -Math.atan(getTrackSlopeTangentX(d)),
        lean: 0,
        brakeAmount: 0,
        slopePitch: getTrackPitchAt(sim.levelNumber, d),
      });
    }
    for (let i = 0; i < sim.followers.length; i++) {
      const fd = 86 - (i + 1) * SIM_CONFIG.followerSpacing;
      const fx = getTrackCenterX(fd);
      sim.followers[i].distance = fd;
      sim.followers[i].worldX = fx;
      sim.followers[i].worldY = getGroundHeightAt(fx, fd);
      sim.followers[i].yaw = -Math.atan(getTrackSlopeTangentX(fd));
      sim.followers[i].brakeAmount = 0;
      sim.followers[i].slopePitch = getTrackPitchAt(sim.levelNumber, fd);
    }
  } else if (
    nearFinish ||
    inBlizzard ||
    (nearDescent && firstSteepDescent) ||
    (nearRamp && sim.ramps.length > 0) ||
    (nearLog && firstFallenLog)
  ) {
    // Verification-only staging: place Lofi & any level followers cleanly in clear approach
    const firstRamp = sim.ramps[0];
    const firstBlizzard = getBlizzardZonesForLevel(sim.levelNumber, sim.levelLength)[0];
    const startZ = nearFinish
      ? Math.max(0, sim.levelLength - 22)
      : nearDescent && firstSteepDescent
        ? Math.max(0, firstSteepDescent.zStart - firstSteepDescent.approachDistance + 4)
        : inBlizzard && firstBlizzard
          ? Math.round((firstBlizzard.zStart + firstBlizzard.zEnd) * 0.5)
          : nearLog && firstFallenLog
            ? Math.max(0, firstFallenLog.z - 26)
            : Math.max(0, firstRamp.zStart - 16);
    const startLat = nearFinish || nearLog || inBlizzard || nearDescent ? 0 : firstRamp.offsetX;
    sim.distance = startZ;
    sim.travelDistance = startZ;
    sim.lateralOffset = startLat;
    sim.pathHistory = [];
    for (let d = startZ - 26; d <= startZ; d += 0.4) {
      const wx = getTrackCenterX(d) + startLat;
      sim.pathHistory.push({
        travelDistance: d,
        distance: d,
        worldX: wx,
        worldY: getGroundHeightAt(wx, d),
        heightAboveGround: 0,
        jumpState: 'GROUNDED',
        landingProgress: 0,
        rampPitch: 0,
        grabAmount: 0,
        yaw: -Math.atan(getTrackSlopeTangentX(d)),
        lean: 0,
        brakeAmount: 0,
        slopePitch: getTrackPitchAt(sim.levelNumber, d),
      });
    }
    for (let i = 0; i < sim.followers.length; i++) {
      const fd = startZ - (i + 1) * SIM_CONFIG.followerSpacing;
      const fx = getTrackCenterX(fd) + startLat;
      sim.followers[i].distance = fd;
      sim.followers[i].worldX = fx;
      sim.followers[i].worldY = getGroundHeightAt(fx, fd);
      sim.followers[i].heightAboveGround = 0;
      sim.followers[i].jumpState = 'GROUNDED';
      sim.followers[i].landingProgress = 0;
      sim.followers[i].rampPitch = 0;
      sim.followers[i].grabAmount = 0;
      sim.followers[i].yaw = -Math.atan(getTrackSlopeTangentX(fd));
      sim.followers[i].lean = 0;
      sim.followers[i].brakeAmount = 0;
      sim.followers[i].slopePitch = getTrackPitchAt(sim.levelNumber, fd);
    }
  }
  const input = createInitialInput();
  let bestTime = loadBestTime();

  // --- 1. Three.js Renderer, Scene & Lighting Rig ---
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAYLIGHT_RIG.toneMappingExposure;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const initialWidth = Math.max(1, container.clientWidth || window.innerWidth);
  const initialHeight = Math.max(1, container.clientHeight || window.innerHeight);
  renderer.setSize(initialWidth, initialHeight);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.setAttribute('data-testid', 'game-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sceneBgColor = new THREE.Color(SKY_PALETTE.horizonHex);
  const sceneFog = new THREE.FogExp2(FOG_CONFIG.colorHex, FOG_CONFIG.density);
  const dynamicFog = createDynamicFogState();
  scene.background = sceneBgColor;
  scene.fog = sceneFog;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const hemiLight = new THREE.HemisphereLight(
    DAYLIGHT_RIG.hemiSkyHex,
    DAYLIGHT_RIG.hemiGroundHex,
    DAYLIGHT_RIG.hemiIntensity,
  );
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(
    DAYLIGHT_RIG.keyColorHex,
    DAYLIGHT_RIG.keyIntensity,
  );
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 95;
  const shadowExtent = 26;
  keyLight.shadow.camera.left = -shadowExtent;
  keyLight.shadow.camera.right = shadowExtent;
  keyLight.shadow.camera.top = shadowExtent;
  keyLight.shadow.camera.bottom = -shadowExtent;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.025;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const rimLight = new THREE.DirectionalLight(
    DAYLIGHT_RIG.rimColorHex,
    DAYLIGHT_RIG.rimIntensity,
  );
  rimLight.position.set(-18, 22, 16);
  scene.add(rimLight);

  const camera = new THREE.PerspectiveCamera(
    56,
    initialWidth / initialHeight,
    0.2,
    680,
  );
  const cameraRig = createCameraRig(camera);

  // --- 2. Build Characters & Real-Time 3D Alpine World ---
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const lofi = createLofiCharacter(maxAniso);
  scene.add(lofi.root);

  const audio = createGameAudio({
    camera,
    scene,
    lofiRoot: lofi.root,
  });

  const smallYetiPool = createSmallYetiPool(scene, maxAniso, 16);

  const world = buildAlpineWorld(
    scene,
    sim.obstacles,
    sim.ramps,
    sim.collectibles,
    maxAniso,
    sim.levelNumber,
    sim.levelLength,
  );

  // Progressive arena generator & cached Mini Map layout (rebuilt cleanly on every level transition / retry)
  let activeArenaDifficulty = computeArenaDifficultyProfile(sim.levelNumber);
  let activeMiniMapLayout: MiniMapLayout = buildMiniMapLayout(
    sim.levelNumber,
    sim.levelLength,
    sim.ramps,
    sim.obstacles,
  );

  const syncArenaForCurrentLevel = (rebuildObstacles = false) => {
    activeArenaDifficulty = computeArenaDifficultyProfile(sim.levelNumber);
    setActiveTrackProfile(sim.levelNumber);
    if (rebuildObstacles) {
      const levelCfg = getLevelConfig(sim.levelNumber);
      sim.obstacles = buildLevelObstacles(
        levelCfg,
        sim.spawnSeed,
        activeArenaDifficulty,
      );
      sim.collectibles = spawnLevelCollectibles(
        levelCfg,
        sim.obstacles,
        sim.spawnSeed,
      );
    }
    world.syncTrackForLevel(
      sim.levelNumber,
      sim.levelLength,
      sim.ramps,
      sim.obstacles,
      sim.collectibles,
    );
    activeMiniMapLayout = buildMiniMapLayout(
      sim.levelNumber,
      sim.levelLength,
      sim.ramps,
      sim.obstacles,
    );
  };

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // --- 3. Helper: Sync Characters, Small Yetis, Key Light & Camera ---
  const visualFollowersBuf: FollowerYeti[] = [];
  const followerMoundPosBuf: Array<{ x: number; y: number; z: number }> = [];
  const gustParticlePush: WindGustParticlePushOut = {
    snowfallPushX: 0,
    snowfallPushZ: 0,
    sprayPushX: 0,
    sprayPushZ: 0,
    flutterBoost: 0,
  };
  let lastYetiVisibility = { visibleFollowers: 0, visibleGreeters: 0, visibleRecruit: 0 };

  const syncVisualTransforms = (
    dt: number,
    animTime: number,
    immediateCamera = false,
  ) => {
    const isVictory = sim.phase === 'victory';
    const isGameOver = sim.phase === 'gameover';
    const coastMeters = isVictory
      ? computeArrivalCoastMeters(arrivalState.arrivalGlideProgress)
      : 0;
    const glideT = isVictory ? arrivalState.arrivalGlideProgress : 0;
    const victoryPoseT = isVictory ? arrivalState.victoryPoseProgress : 0;
    const buriedT = isGameOver ? arrivalState.gameoverBurialProgress : 0;

    const visualDistance = sim.distance + coastMeters;
    const visualLateral = isVictory
      ? sim.lateralOffset * (1 - glideT * 0.84)
      : sim.lateralOffset;

    const centerX = getTrackCenterX(visualDistance);
    const playerX = centerX + visualLateral;
    const playerY = getGroundHeightAt(playerX, visualDistance);
    const playerWorldZ = -visualDistance;

    const tangentX = getTrackSlopeTangentX(visualDistance);
    const trackYaw = -Math.atan(tangentX);
    // During active gameplay, orient Lofi strictly by manual steering velocity (never auto-rotate along track curves!)
    const playerHeadingYaw =
      sim.phase === 'playing' || sim.phase === 'paused'
        ? -Math.atan2(sim.lateralVelocity, Math.max(8, sim.forwardSpeed))
        : trackYaw;

    lofi.root.position.set(playerX, playerY, playerWorldZ);
    // Match Lofi's downhill pitch seamlessly to local terrain slope (including steep-descent drops!)
    const localSlopePitch = getTrackPitchAt(sim.levelNumber, visualDistance);
    const activeSlopePitch =
      isVictory || isGameOver
        ? localSlopePitch * (1 - Math.max(victoryPoseT, buriedT))
        : localSlopePitch;
    lofi.root.rotation.set(activeSlopePitch, playerHeadingYaw, 0, 'YXZ');

    const speedRatio = isVictory
      ? Math.max(0.05, (1 - glideT) * 0.65)
      : isGameOver
        ? 0
        : Math.min(1.35, sim.forwardSpeed / sim.levelBaseSpeed);
    const landingProgress =
      sim.jumpState === 'LANDING'
        ? Math.max(0, Math.min(1, 1 - sim.landingTimer / SIM_CONFIG.landingDuration))
        : 0;
    lofi.update({
      dt,
      time: animTime,
      lean: isVictory || isGameOver ? sim.visualLean * (1 - Math.max(glideT, buriedT)) : sim.visualLean,
      speedRatio,
      hitFlashTimer: sim.hitFlashTimer,
      invulnTimer: sim.invulnTimer,
      isTitleIdle: sim.phase === 'title',
      heightAboveGround: isVictory || isGameOver ? 0 : sim.heightAboveGround,
      jumpState: isVictory || isGameOver ? 'GROUNDED' : sim.jumpState,
      landingProgress: isVictory || isGameOver ? 0 : landingProgress,
      rampPitch: isVictory || isGameOver ? 0 : sim.rampPitch,
      grabAmount: isVictory || isGameOver ? 0 : sim.grabAmount,
      grabStyle: sim.activeGrabStyle,
      brakeAmount: isVictory || isGameOver ? 0 : sim.brakeAmount,
      victoryPoseAmount: victoryPoseT,
      gameoverBurialAmount: buriedT,
    });

    // Build visual follower transforms (keeps sim.followers pure while spacing convoy cleanly on arrival plaza or comic snow mounds)
    let followersForRender: readonly FollowerYeti[] = sim.followers;
    followerMoundPosBuf.length = 0;

    if ((isVictory || isGameOver) && sim.followers.length > 0) {
      visualFollowersBuf.length = sim.followers.length;
      for (let i = 0; i < sim.followers.length; i++) {
        const f = sim.followers[i];
        let easedDist: number;
        let fx: number;

        if (isVictory) {
          // ROLE A — Existing followers glide smoothly into a tidy arc on the left flank beside Lofi
          // (leaving the mid-right open for ROLE C: the +1 new recruit Yeti emerging from the shelter!)
          const targetDist = visualDistance + 0.35 + i * 0.48;
          easedDist = f.distance + (targetDist - f.distance) * glideT;
          const baseX = getTrackCenterX(easedDist);
          const startRelX = f.worldX - getTrackCenterX(f.distance);
          const targetRelX = -2.25 - i * 1.45;
          fx = baseX + startRelX * (1 - glideT) + targetRelX * glideT;
        } else {
          // Game Over: existing followers (strictly levelNumber - 1) settle safely in snow mounds flanking Lofi
          const sideSign = i % 2 === 0 ? -1 : 1;
          const rank = Math.floor(i / 2);
          const targetDist = sim.distance + 0.45 + rank * 1.25;
          easedDist = f.distance + (targetDist - f.distance) * buriedT;
          const targetX = playerX + sideSign * (2.55 + rank * 1.45);
          fx = f.worldX + (targetX - f.worldX) * buriedT;
        }

        const fy = getGroundHeightAt(fx, easedDist);
        const fYaw = -Math.atan(getTrackSlopeTangentX(easedDist));

        if (isGameOver) {
          followerMoundPosBuf.push({ x: fx, y: fy, z: -easedDist });
        }

        const slot = visualFollowersBuf[i];
        if (slot) {
          slot.id = f.id;
          slot.slotIndex = f.slotIndex;
          slot.worldX = fx;
          slot.worldY = fy;
          slot.heightAboveGround = 0;
          slot.jumpState = 'GROUNDED';
          slot.landingProgress = 0;
          slot.rampPitch = 0;
          slot.grabAmount = 0;
          slot.distance = easedDist;
          slot.yaw = fYaw;
          slot.lean = f.lean * (1 - Math.max(glideT, buriedT));
          slot.brakeAmount = 0;
          slot.slopePitch = getTrackPitchAt(sim.levelNumber, easedDist);
        } else {
          visualFollowersBuf[i] = {
            id: f.id,
            slotIndex: f.slotIndex,
            worldX: fx,
            worldY: fy,
            heightAboveGround: 0,
            jumpState: 'GROUNDED',
            landingProgress: 0,
            rampPitch: 0,
            grabAmount: 0,
            distance: easedDist,
            yaw: fYaw,
            lean: f.lean * (1 - Math.max(glideT, buriedT)),
            brakeAmount: 0,
            slopePitch: getTrackPitchAt(sim.levelNumber, easedDist),
          };
        }
      }
      followersForRender = visualFollowersBuf;
    }

    // Sync active follower Yetis (levelNumber - 1), the separate +1 shelter recruit Yeti (Victory only), and cabin greeters (hidden on Game Over)
    lastYetiVisibility = smallYetiPool.sync({
      followers: followersForRender,
      shelterLevelLength: sim.levelLength,
      time: animTime,
      speedRatio,
      celebrating: arrivalState.celebrating,
      celebrationTime: arrivalState.celebrationTime,
      victoryPoseProgress: victoryPoseT,
      recruitJoinProgress: arrivalState.recruitJoinProgress,
      gameoverBurialProgress: buriedT,
      isGameOver,
    });

    // Update Victory lightweight 3D confetti & Game Over cartoon snow mounds
    world.outcomeVisuals.updateVictoryConfetti({
      active: isVictory && arrivalState.celebrationTime >= 0.45,
      dt,
      time: animTime,
      centerX: getTrackCenterX(sim.levelLength + 7.5),
      centerY: getGroundHeightAt(getTrackCenterX(sim.levelLength + 7.5), sim.levelLength + 7.5),
      centerZ: -(sim.levelLength + 7.5),
    });

    world.outcomeVisuals.updateGameOverMounds({
      active: isGameOver,
      burialProgress: buriedT,
      heroX: playerX,
      heroY: playerY,
      heroZ: playerWorldZ,
      followerPositions: followerMoundPosBuf,
    });

    world.updateShelter(animTime);
    world.updateCollectibles(sim.collectibles, animTime);

    keyLight.position.set(playerX + 18, playerY + 32, playerWorldZ + 14);
    keyLight.target.position.set(playerX, playerY, playerWorldZ - 8);
    keyLight.target.updateMatrixWorld();

    const activeWindGustIntensity = sim.phase === 'playing' ? sim.windGust.intensity : 0;
    const activeWindGustForce = sim.phase === 'playing' ? sim.windGust.signedForce : 0;
    computeWindGustParticlePush(activeWindGustForce, gustParticlePush);

    cameraRig.update({
      dt,
      time: animTime,
      phase: sim.phase,
      playerX,
      playerY,
      playerJumpHeight: isVictory || isGameOver ? 0 : sim.heightAboveGround,
      playerLean: isVictory || isGameOver ? 0 : sim.visualLean,
      speedRatio,
      playerDistance: visualDistance,
      levelNumber: sim.levelNumber,
      levelLength: sim.levelLength,
      aspect: camera.aspect,
      immediate: immediateCamera,
      windGustIntensity: activeWindGustIntensity,
      windGustDirection: sim.windGust.direction,
      steepPhase: isVictory || isGameOver ? 'NORMAL' : sim.steepPhase,
      steepSlopeFactor: isVictory || isGameOver ? 0 : sim.steepSlopeFactor,
    });

    // Update trailing avalanche wave AFTER cameraRig so camera-clearance checks use exact live lens position.
    // Hide on title, shelter victory, and game-over snow-mound phases.
    world.updateAvalanche(
      sim.distance,
      sim.avalancheDistance,
      animTime,
      sim.phase === 'playing' || sim.phase === 'paused',
      camera.position,
    );

    world.updateSky(camera.position);

    // Update dynamic altitude- & blizzard-driven depth fog, synchronized sky horizon mist, and overcast lighting
    const shelterProgress =
      sim.levelLength > 0 ? Math.max(0, Math.min(1, visualDistance / sim.levelLength)) : 0;
    const snowfallAvalancheDanger = Math.max(
      0,
      Math.min(1, 1 - sim.avalancheDistance / SIM_CONFIG.avalancheStartDistance),
    );
    stepDynamicFogState(
      dynamicFog,
      {
        phase: sim.phase,
        levelNumber: sim.levelNumber,
        distance: visualDistance,
        levelLength: sim.levelLength,
        windGustIntensity: activeWindGustIntensity,
        avalancheDanger: snowfallAvalancheDanger,
        time: animTime,
      },
      dt,
      immediateCamera,
    );
    sceneFog.density = dynamicFog.density;
    sceneFog.color.setRGB(
      dynamicFog.colorR,
      dynamicFog.colorG,
      dynamicFog.colorB,
      THREE.SRGBColorSpace,
    );
    sceneBgColor.copy(sceneFog.color);
    world.setSkyAtmosphericHaze(
      dynamicFog.colorR,
      dynamicFog.colorG,
      dynamicFog.colorB,
      dynamicFog.skyHazeAmount,
    );
    keyLight.intensity = DAYLIGHT_RIG.keyIntensity * dynamicFog.keyLightScale;
    hemiLight.intensity =
      DAYLIGHT_RIG.hemiIntensity * (1 + (1 - dynamicFog.keyLightScale) * 0.45);

    // Update ambient alpine snowfall (scales density toward shelter, surges with avalanche, blizzard sections & wind gusts)
    if (immediateCamera) {
      world.snowfall.recenter(playerX, playerY, playerWorldZ);
    }
    world.snowfall.update({
      dt,
      time: animTime,
      phase: sim.phase,
      levelNumber: sim.levelNumber,
      progress: shelterProgress,
      avalancheDanger: snowfallAvalancheDanger,
      windGustForce: activeWindGustForce,
      blizzardIntensity: dynamicFog.blizzardIntensity,
      playerX,
      playerY,
      playerZ: playerWorldZ,
      cameraX: camera.position.x,
      cameraY: camera.position.y,
      cameraZ: camera.position.z,
    });
  };

  // --- 4. Input Management (Desktop A/D + Arrows SOCD + W/Up Jump + S/Down Brake + Space Grab, Mobile Drag + JUMP/TRICK/BRAKE) ---
  const keySteer = createKeyboardSteerTracker();
  const keyGrabTracker = createHeldActionKeyTracker();
  const keyBrakeTracker = createHeldActionKeyTracker();
  let keyGrabHeld = false;
  let touchGrabHeld = false;
  const syncGrabInput = () => {
    input.grab = keyGrabHeld || touchGrabHeld;
  };
  let keyBrakeHeld = false;
  let touchBrakeHeld = false;
  const syncBrakeInput = () => {
    input.brake = keyBrakeHeld || touchBrakeHeld;
  };

  const clearInputs = () => {
    clearKeyboardSteerTracker(keySteer);
    clearHeldActionKeyTracker(keyGrabTracker);
    clearHeldActionKeyTracker(keyBrakeTracker);
    input.left = false;
    input.right = false;
    input.dragging = false;
    input.dragSteer = 0;
    input.steerAxis = 0;
    input.jumpQueued = false;
    keyGrabHeld = false;
    touchGrabHeld = false;
    input.grab = false;
    keyBrakeHeld = false;
    touchBrakeHeld = false;
    input.brake = false;
    activePointerId = null;
  };

  let activePointerId: number | null = null;
  let pointerStartX = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (sim.phase !== 'playing') return;
    // Ignore non-primary mouse buttons (e.g. right-click) so they never latch drag steering
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    pointerStartX = e.clientX;
    input.dragging = true;
    input.dragSteer = 0;
    audio.unlock();
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable in synthetic events
    }
  };

  const releaseDragPointer = () => {
    activePointerId = null;
    input.dragging = false;
    input.dragSteer = 0;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    if (sim.phase !== 'playing') {
      clearInputs();
      return;
    }
    // Recover immediately if mouse button was released outside window/iframe without delivering pointerup
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      releaseDragPointer();
      return;
    }
    const dragRange = computeDragRangePixels(window.innerWidth);
    const { steer: normalized, nextAnchorX } = stepDragSteer(
      e.clientX,
      pointerStartX,
      dragRange,
      6,
    );
    pointerStartX = nextAnchorX;
    input.dragSteer = normalized;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    try {
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore in synthetic pointer environments
    }
    releaseDragPointer();
  };

  const onLostPointerCapture = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId === activePointerId) {
      releaseDragPointer();
    }
  };

  const onContextMenu = () => {
    if (activePointerId !== null || input.dragging) {
      releaseDragPointer();
    }
  };

  const onAnyGestureUnlock = () => {
    if (sim.phase === 'playing') {
      audio.unlock();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Ignore browser/OS modifier shortcuts (Ctrl+A, Cmd+R, Alt+Left, etc.) so keys never latch stuck steering
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const isSteerCode =
      e.code === 'ArrowLeft' ||
      e.code === 'KeyA' ||
      e.code === 'ArrowRight' ||
      e.code === 'KeyD';
    if (isSteerCode) {
      if (sim.phase === 'playing') {
        if (!e.repeat) {
          const steerPress = pressSteerKey(keySteer, e.code);
          if (steerPress.handled) {
            input.left = steerPress.left;
            input.right = steerPress.right;
          }
          audio.unlock();
        }
        e.preventDefault();
      }
    } else if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      if (sim.phase === 'playing') {
        if (!e.repeat) {
          audio.unlock();
          input.jumpQueued = true;
        }
        e.preventDefault();
      }
    } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
      if (sim.phase === 'playing') {
        audio.unlock();
        keyBrakeHeld = pressActionKey(keyBrakeTracker, e.code);
        syncBrakeInput();
        e.preventDefault();
      }
    } else if ((e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyT') && sim.phase === 'playing') {
      audio.unlock();
      if (!e.repeat && sim.jumpState !== 'AIRBORNE') {
        input.jumpQueued = true;
      }
      keyGrabHeld = pressActionKey(keyGrabTracker, e.code);
      syncGrabInput();
      e.preventDefault();
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
      if (sim.phase === 'playing') {
        e.preventDefault();
        pauseGame();
      } else if (sim.phase === 'paused') {
        e.preventDefault();
        resumeGame();
      }
    } else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
      // Allow native activation when the player has explicitly tabbed focus onto a modal button
      if (e.target instanceof HTMLButtonElement) {
        return;
      }
      if (sim.phase === 'title') {
        e.preventDefault();
        startGame();
      } else if (sim.phase === 'victory') {
        // Never allow skipping Victory before the arrival & recruit sequence finishes!
        if (!arrivalState.victoryUiReady) return;
        e.preventDefault();
        if (sim.levelNumber < sim.totalLevels) {
          nextLevel();
        } else {
          newGame();
        }
      } else if (sim.phase === 'gameover') {
        if (!arrivalState.gameoverUiReady) return;
        e.preventDefault();
        retryLevel();
      }
    } else if (e.code === 'KeyM' && !e.repeat) {
      toggleMute();
    } else if (e.code === 'KeyR' && !e.repeat) {
      if (sim.phase === 'playing' || sim.phase === 'paused' || sim.phase === 'gameover') {
        e.preventDefault();
        retryLevel();
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const steerRelease = releaseSteerKey(keySteer, e.code);
    if (steerRelease.handled) {
      input.left = steerRelease.left;
      input.right = steerRelease.right;
    } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
      keyBrakeHeld = releaseActionKey(keyBrakeTracker, e.code);
      syncBrakeInput();
    } else if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'KeyT') {
      keyGrabHeld = releaseActionKey(keyGrabTracker, e.code);
      syncGrabInput();
    }
  };

  const onWindowBlur = () => {
    clearInputs();
    audio.silenceLoops();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      clearInputs();
      audio.silenceLoops();
    }
  };

  const onResize = () => {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('lostpointercapture', onLostPointerCapture);
  window.addEventListener('pointerdown', onAnyGestureUnlock, { passive: true });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', onResize);

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => onResize())
      : null;
  resizeObserver?.observe(container);

  // --- 5. State & Level Transition Handlers ---
  let lastHudEmitTime = 0;

  const emitHudNow = () => {
    const hudSnap = buildHudSnapshot(sim, bestTime, {
      victoryUiReady: arrivalState.victoryUiReady,
      recruitJoinProgress: arrivalState.recruitJoinProgress,
      gameoverUiReady: arrivalState.gameoverUiReady,
    });
    const currentPlayerWorldX = getTrackCenterX(sim.distance) + sim.lateralOffset;
    hudSnap.miniMap = buildMiniMapSnapshot(activeMiniMapLayout, {
      playerWorldX: currentPlayerWorldX,
      playerDistance: sim.distance,
      lateralVelocity: sim.lateralVelocity,
      forwardSpeed: sim.forwardSpeed,
      avalancheDistance: sim.avalancheDistance,
      followers: sim.followers,
    });
    syncBodyState(
      hudSnap.phase,
      hudSnap.levelNumber,
      hudSnap.followerCount,
      arrivalState.celebrating,
      sim.jumpState,
      sim.grabCount,
      audio.isSpatialReady(),
    );
    const particleStats = world.snowSpray.getStats();
    document.body.dataset.victoryReady = arrivalState.victoryUiReady ? '1' : '0';
    document.body.dataset.gameoverReady = arrivalState.gameoverUiReady ? '1' : '0';
    document.body.dataset.outcomeRecruit = String(hudSnap.recruitedFollowers);
    document.body.dataset.visibleFollowers = String(lastYetiVisibility.visibleFollowers);
    document.body.dataset.visibleGreeters = String(lastYetiVisibility.visibleGreeters);
    document.body.dataset.visibleRecruit = String(lastYetiVisibility.visibleRecruit);
    const sway = cameraRig.getSwayState();
    const windShake = cameraRig.getWindShakeState();
    document.body.dataset.particleCollisions = String(particleStats.totalCollisions);
    document.body.dataset.particleActive = String(particleStats.activeCount);
    document.body.dataset.particleDrawCount = String(particleStats.drawCount);
    document.body.dataset.particleRenderMode = particleStats.renderMode;
    document.body.dataset.cameraSwayX = sway.cameraOffsetX.toFixed(3);
    document.body.dataset.cameraLookLeadX = sway.lookOffsetX.toFixed(3);
    document.body.dataset.windGust = (sim.phase === 'playing' ? sim.windGust.signedForce : 0).toFixed(3);
    document.body.dataset.windShakeX = windShake.offsetX.toFixed(3);
    document.body.dataset.windShakeY = windShake.offsetY.toFixed(3);
    document.body.dataset.windParticlePushX = gustParticlePush.snowfallPushX.toFixed(2);
    document.body.dataset.fogDensity = dynamicFog.density.toFixed(5);
    document.body.dataset.blizzardIntensity = dynamicFog.blizzardIntensity.toFixed(3);
    document.body.dataset.altitudeFactor = dynamicFog.altitudeFactor.toFixed(3);
    document.body.dataset.playerLean = sim.visualLean.toFixed(3);
    document.body.dataset.playerWorldX = currentPlayerWorldX.toFixed(3);
    document.body.dataset.playerLateralVel = sim.lateralVelocity.toFixed(3);
    document.body.dataset.playerLateralOffset = sim.lateralOffset.toFixed(3);
    document.body.dataset.arenaObstacles = String(sim.obstacles.length);
    document.body.dataset.arenaCurveScale = activeArenaDifficulty.curveIntensityScale.toFixed(2);
    document.body.dataset.score = String(sim.score);
    document.body.dataset.scoreMultiplier = String(sim.scoreMultiplier);
    document.body.dataset.peakMultiplier = String(sim.peakMultiplier);
    document.body.dataset.lastTrick = sim.lastTrickLabel ?? '';
    document.body.dataset.grabStyle = sim.activeGrabStyle;
    document.body.dataset.collectedLilYetis = String(sim.collectedCollectiblesCount);
    document.body.dataset.totalCollectibles = String(sim.collectibles.length);
    const steepCam = cameraRig.getSteepCameraState();
    document.body.dataset.steepPhase = sim.steepPhase;
    document.body.dataset.brakeAmount = sim.brakeAmount.toFixed(2);
    document.body.dataset.speedKmh = String(hudSnap.speedKmh);
    document.body.dataset.steepCamBack = steepCam.extraBack.toFixed(2);
    document.body.dataset.steepCamHeight = steepCam.extraHeight.toFixed(2);
    document.body.dataset.cameraCurveShiftX = steepCam.curveOutsideX.toFixed(2);
    document.body.dataset.carvingMounds = String(world.getCarvingMoundCount());
    onHudUpdate(hudSnap);
  };

  const blurActiveElement = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const startGame = () => {
    blurActiveElement();
    audio.unlock();
    clearInputs();
    cameraRig.resetSteepCamera();
    resetShelterArrival(arrivalState);
    startNewGame(sim, 'playing');
    resetWindGustState(sim.windGust, (Math.random() * 0xffffffff) >>> 0);
    syncArenaForCurrentLevel(true);
    world.snowSpray.reset();
    world.snowTrail.reset();
    world.outcomeVisuals.reset();
    lastFrameMs = performance.now();
    syncVisualTransforms(0.016, animClock, true);
    audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
    emitHudNow();
  };

  const pauseGame = () => {
    if (sim.phase !== 'playing') return;
    sim.phase = 'paused';
    clearInputs();
    audio.silenceLoops();
    audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
    emitHudNow();
  };

  const resumeGame = () => {
    if (sim.phase !== 'paused') return;
    blurActiveElement();
    audio.unlock();
    sim.phase = 'playing';
    clearInputs();
    lastFrameMs = performance.now();
    audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
    emitHudNow();
  };

  /** Retry current level: never adds a Yeti; restores followers strictly to (levelNumber - 1) and resets shelter celebration. */
  const retryLevel = () => {
    blurActiveElement();
    audio.unlock();
    clearInputs();
    cameraRig.resetSteepCamera();
    resetShelterArrival(arrivalState);
    retryCurrentLevel(sim, 'playing');
    resetWindGustState(sim.windGust, (Math.random() * 0xffffffff) >>> 0);
    syncArenaForCurrentLevel(true);
    world.snowSpray.reset();
    world.snowTrail.reset();
    world.outcomeVisuals.reset();
    lastFrameMs = performance.now();
    syncVisualTransforms(0.016, animClock, true);
    audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
    emitHudNow();
  };

  /**
   * Advance to the next level strictly after completing the current level at the shelter
   * AND after the arrival celebration finishes. Idempotent against repeated clicks.
   */
  const nextLevel = () => {
    if (sim.phase !== 'victory' || !arrivalState.victoryUiReady) return;
    blurActiveElement();
    audio.unlock();
    clearInputs();
    cameraRig.resetSteepCamera();
    resetShelterArrival(arrivalState);
    const advanced = advanceToNextLevel(sim);
    if (!advanced) {
      return;
    }
    resetWindGustState(sim.windGust, (Math.random() * 0xffffffff) >>> 0);
    syncArenaForCurrentLevel(true);
    world.snowSpray.reset();
    world.snowTrail.reset();
    world.outcomeVisuals.reset();
    lastFrameMs = performance.now();
    syncVisualTransforms(0.016, animClock, true);
    audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
    emitHudNow();
  };

  /** Start a fresh game from Level 1 with Lofi alone (0 followers). */
  const newGame = () => {
    startGame();
  };

  const returnToTitle = () => {
    clearInputs();
    cameraRig.resetSteepCamera();
    audio.silenceLoops();
    resetShelterArrival(arrivalState);
    startNewGame(sim, 'title');
    syncArenaForCurrentLevel(true);
    world.snowSpray.reset();
    world.snowTrail.reset();
    world.outcomeVisuals.reset();
    syncVisualTransforms(0.016, animClock, true);
    audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
    emitHudNow();
  };

  const triggerJump = () => {
    if (sim.phase !== 'playing') return;
    audio.unlock();
    input.jumpQueued = true;
  };

  const setGrabHeld = (held: boolean) => {
    if (held) audio.unlock();
    touchGrabHeld = held && sim.phase === 'playing';
    syncGrabInput();
  };

  /**
   * Dedicated Trick button handler: pressing on snow launches a jump AND arms grab
   * so holding the Trick button seamlessly flows into a mid-air Grab trick;
   * pressing/holding while already airborne immediately performs a Grab trick.
   */
  const setTrickHeld = (held: boolean) => {
    if (held && sim.phase === 'playing') {
      audio.unlock();
      if (sim.jumpState !== 'AIRBORNE') {
        input.jumpQueued = true;
      }
      touchGrabHeld = true;
      syncGrabInput();
      return;
    }
    touchGrabHeld = false;
    syncGrabInput();
  };

  const setBrakeHeld = (held: boolean) => {
    if (held) audio.unlock();
    touchBrakeHeld = held && sim.phase === 'playing';
    syncBrakeInput();
  };

  const toggleMute = () => {
    blurActiveElement();
    const next = !audio.isMuted();
    audio.setMuted(next);
    onMuteChange(next);
    return next;
  };

  // Initial sync & paint
  syncVisualTransforms(0.016, 0, true);
  emitHudNow();

  // --- 6. Frame Loop (with Software-WebGL afterDraw Pacing) ---
  let disposed = false;
  let rafId = 0;
  let timerId = 0;
  let lastFrameMs = performance.now();
  let animClock = 0;
  let prevCarveIntensity = 0;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    } else {
      timerId = window.setTimeout(cb, 80);
    }
  }

  function tick() {
    if (disposed) return;

    const nowMs = performance.now();
    const rawDt = Math.max(0, (nowMs - lastFrameMs) / 1000);
    lastFrameMs = nowMs;
    const clampedDt = Math.min(rawDt, SIM_CONFIG.maxDt);

    if (sim.phase === 'playing') {
      animClock += clampedDt;
      const preStepVy = sim.verticalVelocity;
      const events = stepSimulation(sim, input, clampedDt);

      const playerX = getTrackCenterX(sim.distance) + sim.lateralOffset;
      const playerY = getGroundHeightAt(playerX, sim.distance);
      const playerWorldZ = -sim.distance;

      // Dynamic snow spray (with alpine wind gusts & 3D ground/ramp collisions) & persistent carved trail
      computeWindGustParticlePush(sim.windGust.signedForce, gustParticlePush);
      world.snowSpray.setWindGust(
        gustParticlePush.sprayPushX,
        gustParticlePush.sprayPushZ,
      );
      const playerHeadingYaw = -Math.atan2(
        sim.lateralVelocity,
        Math.max(8, sim.forwardSpeed),
      );
      const boardYaw = playerHeadingYaw - sim.visualLean * 0.24;
      if (sim.forwardSpeed > 5 && sim.jumpState !== 'AIRBORNE') {
        world.snowSpray.spawnCarveSpray(
          playerX,
          playerY + sim.heightAboveGround,
          playerWorldZ,
          sim.visualLean,
          sim.forwardSpeed,
          boardYaw,
          sim.jumpState,
          animClock,
          sim.brakeAmount,
        );
      }
      world.snowTrail.recordPoint(
        playerX,
        playerY + sim.heightAboveGround,
        playerWorldZ,
        sim.visualLean,
        sim.forwardSpeed,
        boardYaw,
        sim.jumpState,
      );

      // Crisp one-shot snow edge crunch when carving sharply on snow
      if (
        sim.jumpState !== 'AIRBORNE' &&
        events.carveIntensity >= 0.56 &&
        prevCarveIntensity < 0.56
      ) {
        audio.playCarveCrunch(events.carveIntensity);
      }
      prevCarveIntensity = sim.jumpState === 'AIRBORNE' ? 0 : events.carveIntensity;

      // Ramp takeoff, mid-air grab lock, & touchdown snow burst + SFX feedback
      if (events.tookOff) {
        audio.playTakeoff();
        emitHudNow();
        lastHudEmitTime = nowMs;
      }
      if (events.startedGrab) {
        audio.playGrab();
        emitHudNow();
        lastHudEmitTime = nowMs;
      }
      if (events.landed) {
        const landingImpactSpeed = Math.max(7.5, Math.abs(preStepVy));
        world.snowSpray.spawnLandingBurst(
          playerX,
          playerY + sim.heightAboveGround,
          playerWorldZ,
          events.landedGrabTrick,
          landingImpactSpeed,
          animClock,
        );
        audio.playLanding(events.landedGrabTrick, sim.scoreMultiplier);
        emitHudNow();
        lastHudEmitTime = nowMs;
      }

      // Lil Yeti collectible pickup audio, snow-sparkle burst, & immediate HUD score update
      if (events.collectedCount > 0) {
        const burstPos = events.lastCollectedPos ?? {
          x: playerX,
          y: playerY + sim.heightAboveGround + 0.9,
          z: playerWorldZ,
        };
        world.snowSpray.spawnLandingBurst(
          burstPos.x,
          burstPos.y,
          burstPos.z,
          true,
          9.5,
          animClock,
        );
        audio.playRescue();
        emitHudNow();
        lastHudEmitTime = nowMs;
      }

      // Collision audio & snowburst feedback (Lofi only)
      if (events.collidedObstacle) {
        world.snowSpray.spawnHitBurst(playerX, playerY, playerWorldZ, animClock);
        audio.playHit(events.collidedObstacle.kind);
        emitHudNow();
        lastHudEmitTime = nowMs;
      }

      world.snowSpray.update(clampedDt, animClock);
      world.snowTrail.update(clampedDt);
      syncVisualTransforms(clampedDt, animClock, false);

      const avalancheDanger = Math.max(
        0,
        Math.min(1, 1 - sim.avalancheDistance / SIM_CONFIG.avalancheStartDistance),
      );
      const avalancheDist = sim.distance - sim.avalancheDistance;
      const avalancheX = getTrackCenterX(avalancheDist);
      const avalancheY = getGroundHeightAt(avalancheX, avalancheDist) + 1.8;
      const avalancheZ = -avalancheDist;
      const maxOffset = Math.max(
        2.0,
        getTrackHalfWidth(sim.distance) - SIM_CONFIG.edgePadding,
      );
      const bankProximity = Math.max(
        0,
        1 - Math.max(0, maxOffset - Math.abs(sim.lateralOffset)) / 0.45,
      );
      const edgeScrape = sim.jumpState === 'AIRBORNE' ? 0 : bankProximity;
      audio.updateContinuous({
        active: sim.phase === 'playing',
        speedRatio: sim.forwardSpeed / sim.levelBaseSpeed,
        forwardSpeed: sim.forwardSpeed,
        carveIntensity: Math.max(events.carveIntensity, sim.brakeAmount * 0.85),
        edgeScrape,
        avalancheDanger,
        airborne: sim.jumpState === 'AIRBORNE',
        lean: sim.visualLean,
        heightAboveGround: sim.heightAboveGround,
        playerX,
        playerY,
        playerZ: playerWorldZ,
        avalancheX,
        avalancheY,
        avalancheZ,
        windGustIntensity: sim.windGust.intensity,
        windGustDirection: sim.windGust.direction,
      });
      audio.syncBackgroundMusic(sim.phase, sim.levelNumber, avalancheDanger);

      if (events.becameVictory) {
        triggerShelterCelebrationOnce(arrivalState);
        if (bestTime === null || sim.elapsedTime < bestTime) {
          bestTime = sim.elapsedTime;
          saveBestTime(bestTime);
        }
        audio.playVictory();
        audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
        clearInputs();
        emitHudNow();
      } else if (events.becameGameOver) {
        triggerGameOverSequenceOnce(arrivalState);
        world.snowSpray.spawnHitBurst(playerX, playerY + 0.4, playerWorldZ, animClock);
        audio.playGameOver();
        audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
        clearInputs();
        syncVisualTransforms(0, animClock, false);
        emitHudNow();
      } else if (nowMs - lastHudEmitTime >= 85) {
        emitHudNow();
        lastHudEmitTime = nowMs;
      }
    } else if (sim.phase === 'title' || sim.phase === 'victory' || sim.phase === 'gameover') {
      animClock += clampedDt;
      let shouldEmitOutcomeHud = false;
      if (sim.phase === 'victory') {
        const wasReady = arrivalState.victoryUiReady;
        stepShelterArrival(arrivalState, clampedDt);
        audio.syncBackgroundMusic(sim.phase, sim.levelNumber, 0);
        if (!wasReady && arrivalState.victoryUiReady) {
          shouldEmitOutcomeHud = true;
        } else if (!arrivalState.victoryUiReady && nowMs - lastHudEmitTime >= 110) {
          shouldEmitOutcomeHud = true;
        }
      } else if (sim.phase === 'gameover') {
        const wasReady = arrivalState.gameoverUiReady;
        stepGameOverSequence(arrivalState, clampedDt);
        if (!wasReady && arrivalState.gameoverUiReady) {
          shouldEmitOutcomeHud = true;
        }
      }
      world.snowSpray.setWindGust(0, 0);
      world.snowSpray.update(clampedDt, animClock);
      world.snowTrail.update(clampedDt);
      syncVisualTransforms(clampedDt, animClock, false);
      if (shouldEmitOutcomeHud) {
        emitHudNow();
        lastHudEmitTime = nowMs;
      }
    }

    renderer.render(scene, camera);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  }

  if (isSoftwareGl) {
    renderer.render(scene, camera);
    afterDraw(tick);
  } else {
    rafId = requestAnimationFrame(tick);
  }

  return {
    startGame,
    pauseGame,
    resumeGame,
    retryLevel,
    nextLevel,
    newGame,
    restartGame: retryLevel,
    returnToTitle,
    triggerJump,
    setGrabHeld,
    setTrickHeld,
    setBrakeHeld,
    toggleMute,
    getPhase: () => sim.phase,
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('lostpointercapture', onLostPointerCapture);
      window.removeEventListener('pointerdown', onAnyGestureUnlock);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      audio.dispose();
      lofi.dispose();
      smallYetiPool.dispose();
      world.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
