/**
 * Pure keyboard & touch steering resolution helpers for LOFI ICE ESCAPE.
 * - Tracks individual left/right key codes so releasing ArrowLeft while still holding KeyA never drops input.
 * - Uses Last-Input-Priority (SOCD) when opposite directions are pressed simultaneously during fast S-carves.
 * - Applies a clean touch/pointer deadzone so holding a thumb steady never drifts unintentionally.
 */

export interface KeyboardSteerTracker {
  leftCodes: Set<string>;
  rightCodes: Set<string>;
  /** Most recently pressed steering direction (-1 left, +1 right, 0 none). */
  lastPressedDir: -1 | 0 | 1;
}

export function createKeyboardSteerTracker(): KeyboardSteerTracker {
  return {
    leftCodes: new Set<string>(),
    rightCodes: new Set<string>(),
    lastPressedDir: 0,
  };
}

export function isLeftKeyCode(code: string): boolean {
  return code === 'ArrowLeft' || code === 'KeyA';
}

export function isRightKeyCode(code: string): boolean {
  return code === 'ArrowRight' || code === 'KeyD';
}

/** Register a keydown and return resolved directional flags using Last-Input-Priority (immune to OS key repeat). */
export function pressSteerKey(
  tracker: KeyboardSteerTracker,
  code: string,
): { left: boolean; right: boolean; handled: boolean } {
  if (isLeftKeyCode(code)) {
    // Only update Last-Input-Priority when this key transitions from up -> down so OS key-repeat
    // on an earlier held key can never steal steering back during an overlapping S-carve.
    if (!tracker.leftCodes.has(code)) {
      tracker.leftCodes.add(code);
      tracker.lastPressedDir = -1;
    }
    return { ...resolveKeyboardSteerFlags(tracker), handled: true };
  }
  if (isRightKeyCode(code)) {
    if (!tracker.rightCodes.has(code)) {
      tracker.rightCodes.add(code);
      tracker.lastPressedDir = 1;
    }
    return { ...resolveKeyboardSteerFlags(tracker), handled: true };
  }
  return { ...resolveKeyboardSteerFlags(tracker), handled: false };
}

/** Register a keyup and return resolved directional flags cleanly falling back to any still-held key. */
export function releaseSteerKey(
  tracker: KeyboardSteerTracker,
  code: string,
): { left: boolean; right: boolean; handled: boolean } {
  let handled = false;
  if (tracker.leftCodes.delete(code)) handled = true;
  if (tracker.rightCodes.delete(code)) handled = true;

  if (tracker.leftCodes.size === 0 && tracker.rightCodes.size === 0) {
    tracker.lastPressedDir = 0;
  } else if (tracker.leftCodes.size > 0 && tracker.rightCodes.size === 0) {
    tracker.lastPressedDir = -1;
  } else if (tracker.rightCodes.size > 0 && tracker.leftCodes.size === 0) {
    tracker.lastPressedDir = 1;
  }

  return { ...resolveKeyboardSteerFlags(tracker), handled };
}

export function resolveKeyboardSteerFlags(
  tracker: KeyboardSteerTracker,
): { left: boolean; right: boolean } {
  const hasLeft = tracker.leftCodes.size > 0;
  const hasRight = tracker.rightCodes.size > 0;
  if (hasLeft && hasRight) {
    // Last-Input-Priority: when transitioning quickly from Left -> Right without lifting Left first,
    // immediately carve in the newly pressed direction instead of stalling at 0!
    return tracker.lastPressedDir < 0
      ? { left: true, right: false }
      : { left: false, right: true };
  }
  return { left: hasLeft, right: hasRight };
}

export function clearKeyboardSteerTracker(tracker: KeyboardSteerTracker): void {
  tracker.leftCodes.clear();
  tracker.rightCodes.clear();
  tracker.lastPressedDir = 0;
}

/**
 * Tracks a group of alias keys for a single holdable action (e.g. KeyS + ArrowDown for Brake,
 * or Space + KeyE + KeyT for Grab/Trick) so releasing one alias never drops the action while
 * another alias is still physically held.
 */
export interface HeldActionKeyTracker {
  heldCodes: Set<string>;
}

export function createHeldActionKeyTracker(): HeldActionKeyTracker {
  return { heldCodes: new Set<string>() };
}

export function pressActionKey(tracker: HeldActionKeyTracker, code: string): boolean {
  tracker.heldCodes.add(code);
  return tracker.heldCodes.size > 0;
}

export function releaseActionKey(tracker: HeldActionKeyTracker, code: string): boolean {
  tracker.heldCodes.delete(code);
  return tracker.heldCodes.size > 0;
}

export function clearHeldActionKeyTracker(tracker: HeldActionKeyTracker): void {
  tracker.heldCodes.clear();
}

/**
 * Compute ergonomic horizontal drag range in pixels across mobile and desktop viewports.
 */
export function computeDragRangePixels(viewportWidth: number): number {
  return Math.max(52, Math.min(92, viewportWidth * 0.14));
}

/**
 * Normalize horizontal pointer/touch drag delta into [-1, 1] with a small center deadzone
 * so resting a thumb on mobile does not cause micro-jitter steering.
 */
export function computeDragSteerNormalized(
  dxPixels: number,
  dragRangePixels: number,
  deadzonePixels = 6,
): number {
  const absDx = Math.abs(dxPixels);
  if (absDx <= deadzonePixels) return 0;
  const effectiveRange = Math.max(12, dragRangePixels - deadzonePixels);
  const mag = Math.min(1, (absDx - deadzonePixels) / effectiveRange);
  return Math.sign(dxPixels) * mag;
}

/**
 * Update the floating drag anchor with zero dead overhang (clamped strictly to dragRangePixels)
 * so reversing drag direction responds immediately without fighting stale anchor lag.
 */
export function stepDragSteer(
  clientX: number,
  anchorX: number,
  dragRangePixels: number,
  deadzonePixels = 6,
): { steer: number; nextAnchorX: number } {
  const dx = clientX - anchorX;
  const steer = computeDragSteerNormalized(dx, dragRangePixels, deadzonePixels);
  let nextAnchorX = anchorX;
  if (Math.abs(dx) > dragRangePixels) {
    nextAnchorX = clientX - Math.sign(dx) * dragRangePixels;
  }
  return { steer, nextAnchorX };
}

export interface LevelSteeringProfile {
  /** Lateral carving acceleration on snow (m/s^2). */
  lateralAccel: number;
  /** Peak lateral carving speed on snow (m/s). */
  maxLateralSpeed: number;
  /** Extra responsiveness multiplier when counter-steering (reversing direction). */
  counterSteerBoost: number;
  /** Active lateral drag while holding steer (lower = sharper sustained carving). */
  activeDrag: number;
  /** Airborne max lateral speed factor (prevents steep high-level bends from out-curving jumps). */
  airborneMaxLateralFactor: number;
}

/**
 * Pure level-scaled steering profile:
 * - Levels 1-5 keep exact baseline carving parameters unchanged.
 * - Levels 6-10 smoothly scale carving acceleration, max lateral speed, and counter-steer bite
 *   to match higher alpine speeds and tighter switchbacks so turning always stays crisp & responsive
 *   (>= 10.5 m/s turning headroom above peak track curve speed across all levels 6-10).
 */
export function computeLevelSteeringProfile(levelNumber: number): LevelSteeringProfile {
  const lv = Math.max(1, Math.min(10, Math.floor(levelNumber)));
  if (lv <= 5) {
    return {
      lateralAccel: 46.0,
      maxLateralSpeed: 18.5,
      counterSteerBoost: 1.45,
      activeDrag: 1.6,
      airborneMaxLateralFactor: 0.68,
    };
  }
  // t in [0, 1] across Levels 6..10 (Lv6 = 0, Lv7 = 0.25, Lv8 = 0.5, Lv9 = 0.75, Lv10 = 1.0)
  const t = (lv - 6) / 4;
  return {
    lateralAccel: 56.0 + t * 22.0, // 56 (Lv6) -> 78 (Lv10) m/s^2
    maxLateralSpeed: 21.5 + t * 6.5, // 21.5 (Lv6) -> 28.0 (Lv10) m/s
    counterSteerBoost: 1.62 + t * 0.24, // 1.62 (Lv6) -> 1.86 (Lv10)
    activeDrag: 1.32 - t * 0.24, // 1.32 (Lv6) -> 1.08 (Lv10)
    airborneMaxLateralFactor: 0.72 + t * 0.08, // 0.72 (Lv6) -> 0.80 (Lv10)
  };
}

/**
 * Prevents the player from feeling glued to the outer snowbank on sharp Level 6-10 bends:
 * - When neutral (steer === 0), does nothing (preserves strict zero-auto-turn physics).
 * - When clamped against a snowbank AND actively steering inward (away from that bank),
 *   matches the bank's curve speed in the steered direction so Lofi peels off the edge immediately.
 */
export function computeEdgeEscapeVelocity(
  lateralVelocity: number,
  steer: number,
  clampedSide: -1 | 0 | 1,
  trackCurveSpeedX: number,
  maxLateralSpeed: number,
): number {
  if (clampedSide === 0) return lateralVelocity;
  // Actively steering inward away from the clamped bank (e.g., clampedSide = -1 left bank, steer > 0 right)
  const steeringInward = clampedSide * steer < -0.05;
  if (!steeringInward) {
    // Still pushing into or gliding along the bank: zero out outward velocity only
    if (clampedSide > 0 && lateralVelocity > 0) return 0;
    if (clampedSide < 0 && lateralVelocity < 0) return 0;
    return lateralVelocity;
  }
  // If track is curving away from the player into this bank (same sign as inward steer),
  // match at least that curve speed immediately so steering peels cleanly off the snowbank.
  const inwardDir = -clampedSide;
  const neededCurveMatch =
    trackCurveSpeedX * inwardDir > 0
      ? Math.min(maxLateralSpeed * 0.92, Math.abs(trackCurveSpeedX)) * inwardDir
      : 0;
  if (inwardDir > 0) {
    return Math.max(lateralVelocity, neededCurveMatch);
  }
  return Math.min(lateralVelocity, neededCurveMatch);
}

