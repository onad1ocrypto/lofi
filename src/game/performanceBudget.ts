export interface DevicePerformanceInput {
  isSoftwareGl: boolean;
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  hasCoarsePointer: boolean;
  maxTouchPoints: number;
}

export interface DevicePerformanceBudget {
  /** True on phones/tablets with coarse touch pointers and compact viewports. */
  isMobileTier: boolean;
  /** Capped WebGL backing pixel ratio to keep mobile GPU fill-rate smooth and crisp. */
  pixelRatio: number;
  /** Directional shadow map resolution (512 on mobile tier, 1024 on desktop). */
  shadowMapSize: number;
  /** Upper anisotropy cap for procedural PBR textures. */
  maxAnisotropyCap: number;
}

export const PERFORMANCE_BUDGET_CONFIG = {
  desktopMaxPixelRatio: 2.0,
  mobileMaxPixelRatio: 1.35,
  mobileShortSideThresholdPx: 860,
  desktopShadowMapSize: 1024,
  mobileShadowMapSize: 512,
  desktopAnisotropyCap: 8,
  mobileAnisotropyCap: 4,
} as const;

/**
 * Computes conservative, crisp WebGL rendering budgets per device tier without
 * altering gameplay physics, track geometry, lighting rig, or visual identity.
 */
export function computeDevicePerformanceBudget(
  input: DevicePerformanceInput,
): DevicePerformanceBudget {
  const safeDpr =
    Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0
      ? input.devicePixelRatio
      : 1;
  const shortSide = Math.min(
    Math.max(1, input.viewportWidth),
    Math.max(1, input.viewportHeight),
  );

  const isMobileTier =
    !input.isSoftwareGl &&
    (input.hasCoarsePointer ||
      (input.maxTouchPoints > 0 &&
        shortSide <= PERFORMANCE_BUDGET_CONFIG.mobileShortSideThresholdPx));

  if (input.isSoftwareGl) {
    return {
      isMobileTier: false,
      pixelRatio: 1,
      shadowMapSize: PERFORMANCE_BUDGET_CONFIG.mobileShadowMapSize,
      maxAnisotropyCap: 2,
    };
  }

  if (isMobileTier) {
    return {
      isMobileTier: true,
      pixelRatio: Math.min(safeDpr, PERFORMANCE_BUDGET_CONFIG.mobileMaxPixelRatio),
      shadowMapSize: PERFORMANCE_BUDGET_CONFIG.mobileShadowMapSize,
      maxAnisotropyCap: PERFORMANCE_BUDGET_CONFIG.mobileAnisotropyCap,
    };
  }

  return {
    isMobileTier: false,
    pixelRatio: Math.min(safeDpr, PERFORMANCE_BUDGET_CONFIG.desktopMaxPixelRatio),
    shadowMapSize: PERFORMANCE_BUDGET_CONFIG.desktopShadowMapSize,
    maxAnisotropyCap: PERFORMANCE_BUDGET_CONFIG.desktopAnisotropyCap,
  };
}

/**
 * On the full-screen opaque Title screen, the opening video covers 100% of the
 * WebGL canvas. Pausing continuous 3D renders after painting 1 warm-up frame
 * frees CPU/GPU so the opening video and UI load and animate instantaneously.
 */
export function shouldRenderContinuous3D(phase: string): boolean {
  return phase !== 'title';
}
