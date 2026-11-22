import * as THREE from 'three';

/**
 * Calibrated winter daytime sky palette sampled directly from the approved sky reference:
 * deep alpine azure overhead transitioning smoothly to crisp sky blue and soft periwinkle-blue
 * at the horizon (never washed-out white, never night), so snow and mountain silhouettes separate clearly.
 */
export const SKY_PALETTE = {
  /** Deep crisp winter blue at the upper sky / zenith (#0645c1). */
  zenithHex: 0x0645c1,
  /** Rich alpine daytime mid-upper blue (#1160d9). */
  upperMidHex: 0x1160d9,
  /** Vibrant clear winter mid-sky blue (#2c8ef4). */
  lowerMidHex: 0x2c8ef4,
  /** Soft cool periwinkle-blue right at the horizon (#7c9ce2 — distinctly blue, not white). */
  horizonHex: 0x7c9ce2,
  /** Lower dome fill below horizon matching distant valley haze (#86a2dc). */
  nadirHex: 0x86a2dc,
  /** Delicate pale ice-white tint for sparse high-altitude cirrus wisps. */
  cloudHex: 0xe6f1ff,
} as const;

/**
 * Horizon-matched atmospheric fog configuration:
 * Cool blue-gray alpine haze that blends distant ridges naturally into the blue horizon
 * without bleaching the sky white or obscuring upcoming obstacles.
 */
export const FOG_CONFIG = {
  colorHex: 0x8aa6dc,
  density: 0.00215,
} as const;

/**
 * Balanced winter daylight exposure & light colors that preserve cool-blue snow shadows
 * and bright readable snow texture without overexposing highlights into flat white.
 */
export const DAYLIGHT_RIG = {
  toneMappingExposure: 0.94,
  hemiSkyHex: 0xa6cfff,
  hemiGroundHex: 0x587ab2,
  hemiIntensity: 0.92,
  keyColorHex: 0xfff0dc,
  keyIntensity: 1.32,
  rimColorHex: 0x8bb6ff,
  rimIntensity: 0.44,
  distantMountainHex: 0x5b76a8,
} as const;

export interface WinterSkyDomeHandle {
  mesh: THREE.Mesh;
  /** Keep the sky dome centered on the active camera so it never clips on long downhill slopes. */
  syncToCamera: (cameraPosition: THREE.Vector3) => void;
  /** Blend dynamic depth-fog horizon haze seamlessly into the lower-to-mid alpine sky. */
  setAtmosphericHaze: (r: number, g: number, b: number, hazeAmount: number) => void;
  dispose: () => void;
}

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vLocalDir;

void main() {
  vLocalDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uZenithColor;
uniform vec3 uUpperMidColor;
uniform vec3 uLowerMidColor;
uniform vec3 uHorizonColor;
uniform vec3 uNadirColor;
uniform vec3 uCloudColor;
uniform vec3 uFogHazeColor;
uniform float uFogHazeAmount;

varying vec3 vLocalDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.52;
  mat2 rot = mat2(0.82, -0.57, 0.57, 0.82);
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p = rot * p * 2.06 + vec2(7.3, 11.7);
    amp *= 0.48;
  }
  return sum;
}

void main() {
  vec3 dir = normalize(vLocalDir);
  float y = dir.y;

  // Calibrated elevation ramp for the downhill snowboard camera pitch:
  // horizon sits around y = -0.05..+0.02, while the visible upper viewport reaches y ~ +0.34..+0.44.
  vec3 skyCol;
  if (y < -0.04) {
    float t = smoothstep(-0.04, -0.28, y);
    skyCol = mix(uHorizonColor, uNadirColor, t);
  } else if (y < 0.08) {
    float t = smoothstep(-0.04, 0.08, y);
    skyCol = mix(uHorizonColor, uLowerMidColor, t);
  } else if (y < 0.21) {
    float t = smoothstep(0.08, 0.21, y);
    skyCol = mix(uLowerMidColor, uUpperMidColor, t);
  } else {
    float t = smoothstep(0.21, 0.42, y);
    skyCol = mix(uUpperMidColor, uZenithColor, t);
  }

  // Sparse, delicate diagonal high-altitude cirrus wisps (matching reference's clean open blue sky)
  float cloudBand = smoothstep(0.05, 0.14, y) * smoothstep(0.68, 0.24, y);
  if (cloudBand > 0.001) {
    vec2 skyPlane = dir.xz / max(y + 0.20, 0.22);
    // Stretch gently along diagonal wind vectors for natural wispy streaks
    vec2 streakUv = vec2(
      skyPlane.x * 0.78 + skyPlane.y * 0.44,
      -skyPlane.x * 0.26 + skyPlane.y * 1.55
    );
    float warp = fbm(streakUv * 0.85 + vec2(3.1, -1.7));
    float wispRaw = fbm(streakUv * 1.48 + vec2(warp * 0.9, -warp * 0.45) + vec2(0.7, 2.2));
    // Keep clouds sparse and wispy (~14% coverage, framing upper sky cleanly)
    float wisp = smoothstep(0.57, 0.83, wispRaw);
    float fineFeather = smoothstep(0.38, 0.80, fbm(streakUv * 3.1 + vec2(5.2, -3.4)));
    float cloudAlpha = wisp * (0.48 + 0.52 * fineFeather) * cloudBand * 0.52;
    skyCol = mix(skyCol, uCloudColor, clamp(cloudAlpha, 0.0, 0.52));
  }

  // Dynamic altitude & blizzard horizon veil: blends the lower-to-mid sky seamlessly into active scene.fog
  if (uFogHazeAmount > 0.001) {
    float horizonVeil = smoothstep(0.36 + uFogHazeAmount * 0.24, -0.05, y);
    float zenithMist = uFogHazeAmount * 0.34;
    float mistBlend = clamp(max(horizonVeil * uFogHazeAmount * 0.96, zenithMist), 0.0, 0.92);
    skyCol = mix(skyCol, uFogHazeColor, mistBlend);
  }

  gl_FragColor = vec4(skyCol, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Create a camera-following winter sky dome using a dedicated GLSL ShaderMaterial.
 * Skips ACES desaturation while applying sRGB output encoding so the sky preserves
 * the crisp winter blue gradient from deep zenith azure to soft horizon blue.
 */
export function createWinterSkyDome(scene: THREE.Scene): WinterSkyDomeHandle {
  const geo = new THREE.SphereGeometry(560, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenithColor: { value: new THREE.Color(SKY_PALETTE.zenithHex) },
      uUpperMidColor: { value: new THREE.Color(SKY_PALETTE.upperMidHex) },
      uLowerMidColor: { value: new THREE.Color(SKY_PALETTE.lowerMidHex) },
      uHorizonColor: { value: new THREE.Color(SKY_PALETTE.horizonHex) },
      uNadirColor: { value: new THREE.Color(SKY_PALETTE.nadirHex) },
      uCloudColor: { value: new THREE.Color(SKY_PALETTE.cloudHex) },
      uFogHazeColor: { value: new THREE.Color(FOG_CONFIG.colorHex) },
      uFogHazeAmount: { value: 0 },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const syncToCamera = (cameraPosition: THREE.Vector3) => {
    mesh.position.copy(cameraPosition);
  };

  const setAtmosphericHaze = (r: number, g: number, b: number, hazeAmount: number) => {
    (mat.uniforms.uFogHazeColor.value as THREE.Color).setRGB(r, g, b, THREE.SRGBColorSpace);
    mat.uniforms.uFogHazeAmount.value = Math.max(0, Math.min(1, hazeAmount));
  };

  const dispose = () => {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  };

  return { mesh, syncToCamera, setAtmosphericHaze, dispose };
}
