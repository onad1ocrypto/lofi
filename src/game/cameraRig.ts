import * as THREE from 'three';
import {
  createCameraSwayState,
  stepCameraSway,
  type CameraSwayState,
} from './cameraSwayLogic';
import {
  TRACK_LENGTH,
  getActiveTrackLevelNumber,
  getGroundHeightAt,
  getLevelTrackProfile,
  getTrackCenterX,
  getTrackElevation,
} from './trackData';
import type { GamePhase, SteepCameraPhase } from './types';
import {
  createSteepCameraRigState,
  resetSteepCameraRigState,
  stepSteepCameraRigState,
  type SteepCameraRigState,
} from './steepDescentLogic';
import type { WindGustCameraShakeOut } from './windGustLogic';

export interface CameraRig {
  update: (params: {
    dt: number;
    time: number;
    phase: GamePhase;
    playerX: number;
    playerY: number;
    playerJumpHeight?: number;
    playerLean?: number;
    speedRatio?: number;
    playerDistance: number;
    levelNumber?: number;
    levelLength?: number;
    aspect: number;
    immediate?: boolean;
    windGustIntensity?: number;
    windGustDirection?: number;
    steepPhase?: SteepCameraPhase;
    steepSlopeFactor?: number;
  }) => void;
  getSwayState: () => Readonly<CameraSwayState>;
  getWindShakeState: () => Readonly<WindGustCameraShakeOut>;
  getSteepCameraState: () => Readonly<SteepCameraRigState>;
  resetSteepCamera: () => void;
}

/**
 * Third-person alpine chase camera rig:
 * - Slightly elevated behind Lofi so oncoming obstacles, ramps & trailing followers read early
 * - Smoothly exponentially damped follow with subtle horizontal carving sway and ZERO camera roll/tilt
 * - Guarantees ground clearance and adapts framing smoothly between landscape and portrait viewports
 */
export function createCameraRig(camera: THREE.PerspectiveCamera): CameraRig {
  const currentPos = new THREE.Vector3();
  const currentLook = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const swayState = createCameraSwayState();
  const steepCamState = createSteepCameraRigState();
  const windShakeOut: WindGustCameraShakeOut = {
    offsetX: 0,
    offsetY: 0,
    lookOffsetX: 0,
    lookOffsetY: 0,
  };
  let initialized = false;

  const update: CameraRig['update'] = ({
    dt,
    time,
    phase,
    playerX,
    playerY,
    playerJumpHeight = 0,
    playerLean = 0,
    speedRatio = 1,
    playerDistance,
    levelNumber,
    levelLength = TRACK_LENGTH,
    aspect,
    immediate = false,
    steepPhase = 'NORMAL',
    steepSlopeFactor = 0,
  }) => {
    const isPortrait = aspect < 0.92;
    const desiredFov = isPortrait ? 64 : 56;
    if (Math.abs(camera.fov - desiredFov) > 0.1) {
      camera.fov = desiredFov;
      camera.updateProjectionMatrix();
    }

    stepCameraSway(swayState, {
      dt,
      phase,
      lean: playerLean,
      speedRatio,
      jumpHeight: playerJumpHeight,
      isPortrait,
      immediate: !initialized || immediate,
    });

    const playerWorldZ = -playerDistance;

    if (phase === 'title') {
      const sway = Math.sin(time * 0.55) * 0.45;
      const distBack = isPortrait ? 6.5 : 5.2;
      const heightUp = isPortrait ? 3.2 : 2.55;

      targetPos.set(playerX + 2.35 + sway, playerY + heightUp, playerWorldZ + distBack);
      targetLook.set(
        getTrackCenterX(playerDistance + 18) - 0.6,
        getTrackElevation(playerDistance + 18) + (isPortrait ? 2.6 : 2.35),
        playerWorldZ - 22,
      );
    } else if (phase === 'victory') {
      // Clear 3-zone hero framing:
      // Foreground center: Lofi (+ arrived followers on left, 0 on Level 1)
      // Mid-right: single +1 new recruit emerging from shelter after arrival
      // Background flanks beside cabin: 2 shelter welcoming NPCs standing on foot
      const shelterZ = levelLength + 21.5;
      const shelterX = getTrackCenterX(shelterZ);
      const shelterY = getTrackElevation(shelterZ - 4.3);
      const finishCenterX = getTrackCenterX(levelLength);
      const finishY = getTrackElevation(levelLength);
      const sway = Math.sin(time * 0.65) * 0.22;
      targetPos.set(
        finishCenterX + (isPortrait ? 0.35 : -0.35) + sway,
        finishY + (isPortrait ? 3.85 : 2.85),
        -(levelLength - (isPortrait ? 6.8 : 2.9)),
      );
      targetLook.set(
        shelterX * 0.35 + playerX * 0.65,
        shelterY + (isPortrait ? 2.65 : 2.15),
        -(levelLength + 10.6),
      );
    } else if (phase === 'gameover') {
      // Close, crisp front 3/4 framing of Lofi's exact gameplay model waist-deep in the cartoon snow mound,
      // with tilted snowboard beside him and ONLY active level followers (0 on Lv1, 1 on Lv2, 2 on Lv3).
      const sway = Math.sin(time * 0.55) * 0.18;
      const distFront = isPortrait ? 6.9 : 5.0;
      const heightUp = isPortrait ? 2.65 : 1.95;
      targetPos.set(
        playerX + 0.32 + sway,
        playerY + heightUp,
        playerWorldZ + distFront,
      );
      targetLook.set(
        playerX - 0.08,
        playerY + (isPortrait ? 1.15 : 1.05),
        playerWorldZ - 0.6,
      );
    } else {
      // Playing / Paused: elevated third-person downhill chase, always behind Lofi.
      // Smoothly elevates/pulls back on Level 3 steep drop, or shifts smoothly toward curve outside on Level 4 Carving Pass.
      const resolvedLevel = levelNumber ?? getActiveTrackLevelNumber();
      const levelProfile = getLevelTrackProfile(resolvedLevel);
      const activeCameraMode =
        levelProfile.steepDescents?.[0]?.cameraMode ?? 'steep';

      stepSteepCameraRigState(
        steepCamState,
        steepPhase,
        steepSlopeFactor,
        isPortrait,
        dt,
        !initialized || immediate,
        {
          cameraMode: activeCameraMode,
          carvingPass: levelProfile.carvingPass,
          playerDistance,
        },
      );

      const backDist =
        (isPortrait ? 11.8 : 9.8) +
        Math.min(1.6, playerJumpHeight * 0.35) +
        steepCamState.extraBack;
      const heightUp =
        (isPortrait ? 6.0 : 5.05) +
        playerJumpHeight * 0.38 +
        steepCamState.extraHeight;
      const lookAheadDist = (isPortrait ? 24 : 21.5) + steepCamState.extraLookAhead;

      const trackAheadX = getTrackCenterX(playerDistance + lookAheadDist);
      const trackAheadY = getTrackElevation(playerDistance + lookAheadDist);

      const desiredX =
        playerX * 0.82 +
        getTrackCenterX(playerDistance) * 0.18 +
        swayState.cameraOffsetX +
        steepCamState.curveOutsideX;
      const desiredZ = playerWorldZ + backDist;
      const camDistanceZ = Math.max(-45, playerDistance - backDist);

      const groundUnderCam = getGroundHeightAt(desiredX, camDistanceZ);
      const desiredY = Math.max(playerY + heightUp, groundUnderCam + 2.7);

      targetPos.set(desiredX, desiredY, desiredZ);

      targetLook.set(
        playerX * 0.56 +
          trackAheadX * 0.44 +
          swayState.lookOffsetX +
          steepCamState.curveLookOffsetX,
        trackAheadY +
          (isPortrait ? 1.5 : 1.3) +
          playerJumpHeight * 0.22 +
          steepCamState.lookDownBias,
        playerWorldZ - lookAheadDist,
      );
    }

    if (phase !== 'playing' && phase !== 'paused') {
      resetSteepCameraRigState(steepCamState);
    }

    if (!initialized || immediate) {
      currentPos.copy(targetPos);
      currentLook.copy(targetLook);
      initialized = true;
    } else {
      const posAlpha = 1 - Math.exp(-7.2 * dt);
      const lookAlpha = 1 - Math.exp(-8.5 * dt);
      currentPos.lerp(targetPos, posAlpha);
      currentLook.lerp(targetLook, lookAlpha);
    }

    // Camera vibration / screen-shake is strictly disabled for steady, readable gameplay
    windShakeOut.offsetX = 0;
    windShakeOut.offsetY = 0;
    windShakeOut.lookOffsetX = 0;
    windShakeOut.lookOffsetY = 0;

    camera.position.copy(currentPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(currentLook);
  };

  return {
    update,
    getSwayState: () => swayState,
    getWindShakeState: () => windShakeOut,
    getSteepCameraState: () => steepCamState,
    resetSteepCamera: () => resetSteepCameraRigState(steepCamState),
  };
}
