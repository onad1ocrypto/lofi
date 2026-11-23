import * as THREE from 'three';

/**
 * Calibrated winter snow track surface palette inspired by sculpted sunlit alpine snow:
 * - Creamy-white sunlit crests (never clipped overexposed #ffffff flat white)
 * - Cool pale-blue shadows tucked inside carved grooves & snowbank leeward troughs
 * - Smooth stylized 3D snow response with subtle directional micro-sparkle glints
 */
export const SNOW_SURFACE_PALETTE = {
  /** Warm creamy-white lit snow on sunlit track crests (#f8f1e4). */
  creamyLitHex: 0xf8f1e4,
  /** Soft cool-neutral packed-snow midtone along the groomed center (#dde7f6). */
  packedMidHex: 0xdde7f6,
  /** Cool pale-blue shadow tone inside carve grooves and ripple troughs (#9db8e2). */
  grooveShadowHex: 0x9db8e2,
  /** Deeper cool alpine blue shadow along snowbank inner walls (#8aa8da). */
  bankShadowHex: 0x8aa8da,
  /** Sunlit outer alpine snow ridge tint (#e8e7e4). */
  outerRidgeHex: 0xe8e7e4,
  /** Subtle glazed cool-blue tint on steep descent zones (#b4d0f4). */
  steepIceHex: 0xb4d0f4,
} as const;

export const SNOW_SURFACE_CONFIG = {
  textureSize: 256,
  repeatX: 7,
  repeatY: 120,
  normalScaleX: 1.05,
  normalScaleY: 1.05,
  roughnessMin: 0.42,
  roughnessMax: 0.88,
  metalness: 0.01,
  envMapIntensity: 0.44,
  /** Tuned micro-sparkle specular intensity under directional winter sunlight. */
  sparkleIntensity: 0.82,
} as const;

const TAU = Math.PI * 2;

/** Fast deterministic integer bit-mix tileable 2D hash with exact integer period (zero tiling seams). */
function periodicHash(ix: number, iy: number, periodX: number, periodY: number, seed: number): number {
  const wx = ((ix % periodX) + periodX) % periodX;
  const wy = ((iy % periodY) + periodY) % periodY;
  let h = (Math.imul(wx, 374761393) + Math.imul(wy, 668265263) + Math.imul((seed * 100) | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function periodicSmoothNoise(
  u: number,
  v: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const a = periodicHash(x0, y0, periodX, periodY, seed);
  const b = periodicHash(x0 + 1, y0, periodX, periodY, seed);
  const c = periodicHash(x0, y0 + 1, periodX, periodY, seed);
  const d = periodicHash(x0 + 1, y0 + 1, periodX, periodY, seed);

  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

export interface SnowSurfaceSample {
  /** Normalized sculpted height in [0..1] combining packed snow, corduroy, carves & wind ripples. */
  height: number;
  /** Groove cavity depth in [0..1] (higher inside carved tracks and ripple troughs). */
  grooveShadow: number;
  /** Sunlit ridge crest boost in [0..1] (higher on wind-swept crests and carve lips). */
  crestHighlight: number;
  /** Surface roughness in [roughnessMin..roughnessMax] (smoother in compressed carve lines). */
  roughness: number;
}

/**
 * Pure, strictly periodic [0..1)×[0..1) procedural snow heightfield & material sampler.
 * Combines:
 * 1. Soft groomed corduroy lines running down the slope
 * 2. Gentle sinuous snowboard carve tracks with raised sunlit lips & cool shadowed troughs
 * 3. Diagonal wind-blown ripples (sastrugi)
 * 4. Fine packed-snow crystalline micro-grain
 */
export function sampleSnowSurfaceField(u: number, v: number): SnowSurfaceSample {
  const uu = ((u % 1) + 1) % 1;
  const vv = ((v % 1) + 1) % 1;

  // 1. Broad soft undulating snowpack pillows (periodic harmonics)
  const pillowA = periodicSmoothNoise(uu, vv, 4, 4, 1.3);
  const pillowB = periodicSmoothNoise(uu, vv, 8, 8, 5.7);
  const broadUndulation = pillowA * 0.62 + pillowB * 0.38;

  // 2. Gentle diagonal wind ripples (sastrugi) — smooth, stylized waves across the snow
  const ripplePhase =
    uu * TAU * 3.0 +
    vv * TAU * 6.0 +
    Math.sin(vv * TAU * 2.0 + uu * TAU) * 1.05 +
    (pillowA - 0.5) * 1.6;
  const windRipple = Math.sin(ripplePhase) * 0.5 + 0.5;
  const windCrest = Math.pow(windRipple, 1.35);

  // 3. Soft groomed corduroy ribs running along the downhill V axis
  const corduroyWave = Math.sin(uu * TAU * 18.0 + Math.sin(vv * TAU * 2.0) * 0.45);
  const corduroy = corduroyWave * 0.5 + 0.5;

  // 4. Sweeping organic snowboard carve grooves (periodic in U and V so tile borders stay seamless)
  const carve1Offset =
    uu + 0.085 * Math.sin(vv * TAU * 1.0 + 0.4) + 0.032 * Math.sin(vv * TAU * 2.0 - 0.8);
  const carve2Offset =
    uu - 0.37 + 0.068 * Math.cos(vv * TAU * 1.0 + 1.9) + 0.025 * Math.sin(vv * TAU * 3.0);
  const distToCarve1 = Math.abs((((carve1Offset % 1) + 1.5) % 1) - 0.5);
  const distToCarve2 = Math.abs((((carve2Offset % 1) + 1.5) % 1) - 0.5);

  // Trough profile (smooth recessed channel) + raised snow lip beside each carve
  const t1 = distToCarve1 / 0.036;
  const l1 = (distToCarve1 - 0.058) / 0.03;
  const t2 = distToCarve2 / 0.028;
  const l2 = (distToCarve2 - 0.046) / 0.025;
  const trough1 = Math.exp(-(t1 * t1));
  const lip1 = Math.exp(-(l1 * l1)) * 0.72;
  const trough2 = Math.exp(-(t2 * t2)) * 0.82;
  const lip2 = Math.exp(-(l2 * l2)) * 0.58;

  const carveTrough = Math.min(1, trough1 + trough2);
  const carveLip = Math.min(1, lip1 + lip2);

  // 5. Fine packed-snow micro-grain (soft crystalline texture, never noisy static)
  const grainMid = periodicSmoothNoise(uu, vv, 24, 24, 13.1);
  const grainFine = periodicSmoothNoise(uu, vv, 48, 48, 29.4);
  const packedGrain = grainMid * 0.58 + grainFine * 0.42;

  // Combine into smooth heightfield in [0..1]
  const rawHeight =
    0.48 +
    (broadUndulation - 0.5) * 0.25 +
    (windRipple - 0.5) * 0.18 +
    (corduroy - 0.5) * 0.095 +
    carveLip * 0.16 -
    carveTrough * 0.28 +
    (packedGrain - 0.5) * 0.085;
  const height = Math.max(0, Math.min(1, rawHeight));

  // Groove shadow concentrates in carved troughs, corduroy valleys, and wind ripple undersides
  const grooveShadow = Math.max(
    0,
    Math.min(
      1,
      carveTrough * 0.74 +
        (1 - windRipple) * 0.24 +
        (1 - corduroy) * 0.16 +
        (1 - broadUndulation) * 0.15,
    ),
  );

  // Warm creamy highlight concentrates on wind crests and raised carve lips
  const crestHighlight = Math.max(
    0,
    Math.min(1, windCrest * 0.48 + carveLip * 0.58 + broadUndulation * 0.22),
  );

  // Compressed carve troughs & packed ridges are slightly smoother (soft winter sheen);
  // powdery pillows stay velvety matte.
  const compressed = Math.min(1, carveTrough * 0.85 + corduroy * 0.28);
  const roughness =
    SNOW_SURFACE_CONFIG.roughnessMax -
    compressed * (SNOW_SURFACE_CONFIG.roughnessMax - SNOW_SURFACE_CONFIG.roughnessMin) -
    (packedGrain - 0.5) * 0.06;

  return {
    height,
    grooveShadow,
    crestHighlight,
    roughness: Math.max(
      SNOW_SURFACE_CONFIG.roughnessMin,
      Math.min(SNOW_SURFACE_CONFIG.roughnessMax, roughness),
    ),
  };
}

/**
 * Pure central-difference normal evaluation for our periodic snow heightfield.
 * Returns a unit tangent-space normal vector (nx, ny, nz).
 */
export function evaluateSnowNormal(
  u: number,
  v: number,
  texelStep = 1 / 512,
  strength = 4.6,
): { nx: number; ny: number; nz: number } {
  const hL = sampleSnowSurfaceField(u - texelStep, v).height;
  const hR = sampleSnowSurfaceField(u + texelStep, v).height;
  const hD = sampleSnowSurfaceField(u, v - texelStep).height;
  const hU = sampleSnowSurfaceField(u, v + texelStep).height;

  const dx = (hL - hR) * strength;
  const dy = (hD - hU) * strength;
  const dz = 1.0;
  const invLen = 1 / Math.hypot(dx, dy, dz);
  return {
    nx: dx * invLen,
    ny: dy * invLen,
    nz: dz * invLen,
  };
}

export interface SnowSurfaceTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Generates a cohesive 512×512 seamless PBR texture set for the sculpted winter snow track:
 * - Albedo map (sRGB): creamy-white sunlit crests + cool pale-blue groove shadows
 * - Normal map (linear): smooth tangent-space relief for wind ripples, corduroy & carves
 * - Roughness map (linear): silky compressed carve sheen vs matte powder
 * - Bump map (linear): soft fallback / shared detail map for boundary carving mounds
 */
export function createSnowSurfaceTextures(maxAnisotropy: number): SnowSurfaceTextureSet {
  const size = SNOW_SURFACE_CONFIG.textureSize;
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;
  const colorImg = colorCtx.createImageData(size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bumpCtx.createImageData(size, size);

  const normalData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const heightGrid = new Float32Array(size * size);

  // Calibrated RGB endpoints (sRGB byte values):
  // Warm creamy lit snow (#f8f0e2) <-> soft packed snow (#e6ebf4) <-> cool pale-blue groove (#9db7e0)
  const litR = 248;
  const litG = 240;
  const litB = 226;

  const midR = 230;
  const midG = 235;
  const midB = 244;

  const shadowR = 157;
  const shadowG = 183;
  const shadowB = 224;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const sample = sampleSnowSurfaceField(u, v);
      const cell = y * size + x;
      heightGrid[cell] = sample.height;

      // Blend smoothly from cool pale-blue groove shadow -> neutral packed snow -> warm creamy crest
      const shadowMix = sample.grooveShadow * 0.68;
      const crestMix = sample.crestHighlight * 0.72;

      let r = midR * (1 - shadowMix) + shadowR * shadowMix;
      let g = midG * (1 - shadowMix) + shadowG * shadowMix;
      let b = midB * (1 - shadowMix) + shadowB * shadowMix;

      r = r * (1 - crestMix) + litR * crestMix;
      g = g * (1 - crestMix) + litG * crestMix;
      b = b * (1 - crestMix) + litB * crestMix;

      const p = cell * 4;
      colorImg.data[p] = Math.max(0, Math.min(255, Math.round(r)));
      colorImg.data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImg.data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImg.data[p + 3] = 255;

      const bumpByte = Math.max(0, Math.min(255, Math.round(sample.height * 255)));
      bumpImg.data[p] = bumpByte;
      bumpImg.data[p + 1] = bumpByte;
      bumpImg.data[p + 2] = bumpByte;
      bumpImg.data[p + 3] = 255;

      const roughByte = Math.max(0, Math.min(255, Math.round(sample.roughness * 255)));
      roughnessData[p] = roughByte;
      roughnessData[p + 1] = roughByte;
      roughnessData[p + 2] = roughByte;
      roughnessData[p + 3] = 255;
    }
  }

  // Build smooth Sobel tangent-space normal map from the exact periodic heightGrid
  const normalStrength = 4.6;
  for (let y = 0; y < size; y++) {
    const yPrev = (y - 1 + size) % size;
    const yNext = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xPrev = (x - 1 + size) % size;
      const xNext = (x + 1) % size;

      const tl = heightGrid[yPrev * size + xPrev];
      const tc = heightGrid[yPrev * size + x];
      const tr = heightGrid[yPrev * size + xNext];
      const ml = heightGrid[y * size + xPrev];
      const mr = heightGrid[y * size + xNext];
      const bl = heightGrid[yNext * size + xPrev];
      const bc = heightGrid[yNext * size + x];
      const br = heightGrid[yNext * size + xNext];

      const dX = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * 0.25 * normalStrength;
      const dY = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * 0.25 * normalStrength;

      const nx = -dX;
      const ny = -dY;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const p = (y * size + x) * 4;
      normalData[p] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalData[p + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalData[p + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      normalData[p + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  const configureWrap = (tex: THREE.Texture) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(SNOW_SURFACE_CONFIG.repeatX, SNOW_SURFACE_CONFIG.repeatY);
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
  };

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  configureWrap(map);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  configureWrap(bumpMap);

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  configureWrap(normalMap);

  const roughnessMap = new THREE.DataTexture(roughnessData, size, size, THREE.RGBAFormat);
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  configureWrap(roughnessMap);

  return { map, normalMap, roughnessMap, bumpMap };
}

/**
 * Builds the upgraded stylized PBR snow track material.
 * Extends MeshStandardMaterial via onBeforeCompile so full Three.js directional sunlight,
 * shadows, vertex bank shading, and horizon fog are preserved while adding:
 * 1. Sculpted macro snowboard carve grooves & groomed corduroy with analytical normal relief
 * 2. Wind-swept diagonal snowbank ripples (sastrugi) with sunlit crests & cool troughs
 * 3. Creamy-white lit snow & cool pale-blue shadowed groove tonal separation
 * 4. Subtle directional winter-sunlight snow-crystal micro-sparkle highlights
 */
export function createSnowTrackMaterial(
  textures: SnowSurfaceTextureSet,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(
      SNOW_SURFACE_CONFIG.normalScaleX,
      SNOW_SURFACE_CONFIG.normalScaleY,
    ),
    roughnessMap: textures.roughnessMap,
    roughness: 1.0,
    metalness: SNOW_SURFACE_CONFIG.metalness,
    envMapIntensity: SNOW_SURFACE_CONFIG.envMapIntensity,
    vertexColors: true,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowSparkleIntensity = {
      value: SNOW_SURFACE_CONFIG.sparkleIntensity,
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSnowWorldPos;
varying vec2 vSnowRawUv;
varying vec3 vSnowWorldNormal;
varying vec3 vSnowViewRight;
varying vec3 vSnowViewDownhill;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSnowRawUv = uv;
vSnowWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSnowWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vSnowViewRight = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
vSnowViewDownhill = normalize((viewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uSnowSparkleIntensity;
varying vec3 vSnowWorldPos;
varying vec2 vSnowRawUv;
varying vec3 vSnowWorldNormal;
varying vec3 vSnowViewRight;
varying vec3 vSnowViewDownhill;

float snowHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 snowHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float snowValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = snowHash21(i);
  float b = snowHash21(i + vec2(1.0, 0.0));
  float c = snowHash21(i + vec2(0.0, 1.0));
  float d = snowHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Single-pass analytical evaluation of sculpted snow relief + exact partial derivatives
// (eliminates 3-tap finite-difference overhead for smooth 60 FPS mobile GPU shading)
void evaluateSnowMacroSurface(
  vec2 rawUv,
  vec3 worldPos,
  out vec3 relief,
  out vec2 gradUZ
) {
  float uNorm = (rawUv.x - 0.5) * 7.6;
  float zDist = -worldPos.z;
  float absU = abs(uNorm);
  float signU = uNorm >= 0.0 ? 1.0 : -1.0;
  float trackMask = 1.0 - smoothstep(0.76, 1.08, absU);
  float bankMask = smoothstep(0.74, 1.24, absU);

  float hC = 0.0;
  float dHdU = 0.0;
  float dHdZ = 0.0;

  // 1. Organic S-curved snowboard carve channels & groomed corduroy inside the main track
  if (trackMask > 0.001) {
    float zA1 = zDist * 0.048 + 0.5;
    float zA2 = zDist * 0.112 - 0.6;
    float sCurveA = 0.34 * sin(zA1) + 0.14 * sin(zA2);
    float dsA_dz = 0.01632 * cos(zA1) + 0.01568 * cos(zA2);

    float zB1 = zDist * 0.039 + 2.1;
    float zB2 = zDist * 0.091 + 1.2;
    float sCurveB = -0.32 * sin(zB1) + 0.12 * cos(zB2);
    float dsB_dz = -0.01248 * cos(zB1) - 0.01092 * sin(zB2);

    float zC1 = zDist * 0.068 + 0.8;
    float zC2 = zDist * 0.145;
    float sCurveC = 0.14 * cos(zC1) - 0.08 * sin(zC2);
    float dsC_dz = -0.00952 * sin(zC1) - 0.0116 * cos(zC2);

    // Channel A: recessed trough + raised snow berms + exact analytical slope
    float dA = uNorm - sCurveA;
    float sgnA = dA >= 0.0 ? 1.0 : -1.0;
    float mA = abs(dA) - 0.115;
    float tA = -0.52 * exp(-(dA * dA) * 177.7778);
    float lA = 0.34 * exp(-(mA * mA) * 236.6864);
    float dRutA_du = (-2.0 * dA * 177.7778) * tA + (-2.0 * mA * 236.6864 * sgnA) * lA;

    // Channel B
    float dB = uNorm - sCurveB;
    float sgnB = dB >= 0.0 ? 1.0 : -1.0;
    float mB = abs(dB) - 0.105;
    float tB = -0.44 * exp(-(dB * dB) * 216.2630);
    float lB = 0.28 * exp(-(mB * mB) * 277.7778);
    float dRutB_du = (-2.0 * dB * 216.2630) * tB + (-2.0 * mB * 277.7778 * sgnB) * lB;

    // Channel C
    float dC = uNorm - sCurveC;
    float sgnC = dC >= 0.0 ? 1.0 : -1.0;
    float mC = abs(dC) - 0.130;
    float tC = -0.32 * exp(-(dC * dC) * 138.4083);
    float lC = 0.20 * exp(-(mC * mC) * 204.0816);
    float dRutC_du = (-2.0 * dC * 138.4083) * tC + (-2.0 * mC * 204.0816 * sgnC) * lC;

    // Groomed corduroy ribs running along the track
    float cordZ = zDist * 0.055;
    float cordPhase = uNorm * 62.0 + sin(cordZ) * 1.8;
    float cordFade = smoothstep(0.18, 0.88, absU);
    float corduroy = sin(cordPhase) * 0.14 * cordFade;
    float dCord_du = cos(cordPhase) * 8.68 * cordFade;
    float dCord_dz = cos(cordPhase) * (0.01386 * cos(cordZ)) * cordFade;

    float finePhase = uNorm * 118.0 + sin(zDist * 0.04) * 1.2;
    float fineCorduroy = sin(finePhase) * 0.07;
    float dFine_du = cos(finePhase) * 8.26;

    hC += (tA + lA + tB + lB + tC + lC + corduroy + fineCorduroy) * trackMask;
    dHdU += (dRutA_du + dRutB_du + dRutC_du + dCord_du + dFine_du) * trackMask;
    dHdZ += (-dRutA_du * dsA_dz - dRutB_du * dsB_dz - dRutC_du * dsC_dz + dCord_dz) * trackMask;
  }

  // 2. Sculpted snowbank shoulder berm right along |uNorm| ~ 1.02
  float bm = absU - 1.02;
  float bankBerm = 0.56 * exp(-(bm * bm) * 20.6612);
  hC += bankBerm;
  dHdU += (-2.0 * bm * 20.6612 * signU) * bankBerm;

  // 3. Diagonal wind-sculpted ripples (sastrugi) on snowbanks & outer alpine slopes
  if (bankMask > 0.001) {
    float driftWarp = snowValueNoise(vec2(worldPos.x * 0.075, zDist * 0.052)) * 3.8;
    float p1 = absU * 11.5 + zDist * 0.28 + driftWarp;
    float p2 = absU * 23.0 - zDist * 0.19 + driftWarp * 1.4;
    float amp = 0.36 * bankMask;
    hC += (sin(p1) + sin(p2) * 0.38) * amp;
    dHdU += (cos(p1) * 11.5 + cos(p2) * 8.74) * amp * signU;
    dHdZ += (cos(p1) * 0.28 - cos(p2) * 0.0722) * amp;
  }

  // 4. Broad organic snowpack patch & gentle packed-snow undulation
  float macroPatch = snowValueNoise(vec2(worldPos.x * 0.032, zDist * 0.026));
  hC += (macroPatch - 0.5) * 0.22;

  gradUZ = vec2(clamp(dHdU * 0.058, -0.42, 0.42), clamp(dHdZ * 0.22, -0.28, 0.28));

  // Groove cavity darkness (cool pale-blue shadows inside carved channels & wind ripple troughs)
  float cavity = smoothstep(0.08, -0.46, hC);
  // Directional leeward slope shadow (west-facing walls away from +X winter sunlight)
  float leeShadow = smoothstep(0.03, 0.32, gradUZ.x);
  float sunSlope = smoothstep(-0.02, -0.28, gradUZ.x);
  float crest = smoothstep(-0.04, 0.48, hC);

  float grooveShadow = clamp(cavity * 0.72 + leeShadow * 0.42 + (1.0 - macroPatch) * 0.14, 0.0, 1.0);
  float crestHighlight = clamp(crest * 0.62 + sunSlope * 0.48 + macroPatch * 0.16, 0.0, 1.0);
  float compressed = clamp(cavity * 0.8 * trackMask + (1.0 - bankMask) * 0.22, 0.0, 1.0);
  relief = vec3(grooveShadow, crestHighlight, compressed);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 snowRelief;
vec2 snowGradUZ;
evaluateSnowMacroSurface(vSnowRawUv, vSnowWorldPos, snowRelief, snowGradUZ);
// Cool pale-blue shadows tucked inside carved tracks & snowbank troughs
vec3 coolGrooveTint = vec3(0.66, 0.78, 0.96);
// Warm creamy-white sunlit snow on raised ridges & wind crests (never clipped flat white)
vec3 warmCreamTint = vec3(1.05, 1.00, 0.91);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * coolGrooveTint, snowRelief.x * 0.68);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * warmCreamTint, snowRelief.y * 0.56);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
// Compressed carve ruts catch crisp winter sheen; wind-blown crests remain velvety matte
roughnessFactor = clamp(roughnessFactor - snowRelief.z * 0.22 + snowRelief.y * 0.05, 0.34, 0.92);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
// Perturb view-space PBR normal with analytical sculpted carve & wind-ripple gradients
float normalDistFade = 1.0 - smoothstep(45.0, 175.0, length(cameraPosition - vSnowWorldPos));
normal = normalize(
  normal -
  vSnowViewRight * (snowGradUZ.x * 1.15 * normalDistFade) -
  vSnowViewDownhill * (snowGradUZ.y * 0.95 * normalDistFade)
);`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  // Directional winter-sunlight snow crystal micro-sparkle (distance-attenuated for zero far shimmer)
  vec3 worldN = normalize(vSnowWorldNormal);
  vec3 viewDirW = normalize(cameraPosition - vSnowWorldPos);
  // Matches engine keyLight directional winter sun offset (+22, +38, +18)
  vec3 sunDirW = normalize(vec3(0.465, 0.804, 0.381));
  vec3 halfVecW = normalize(sunDirW + viewDirW);

  float camDist = length(cameraPosition - vSnowWorldPos);
  float distFade = 1.0 - smoothstep(20.0, 68.0, camDist);
  float sunFacing = smoothstep(0.12, 0.68, dot(worldN, sunDirW));

  // Two-scale world-space micro-crystal grid tuned for clean pinpoint glints at 1x & 2x DPR
  vec3 crystalCellA = floor(vSnowWorldPos * 4.2);
  vec3 crystalCellB = floor(vSnowWorldPos * 8.6 + vec3(11.3, 5.7, 17.9));

  vec3 rndA = snowHash33(crystalCellA);
  vec3 rndB = snowHash33(crystalCellB);

  // Soft diamond pinpoint mask inside each cell so glints look like tiny snow crystals (not squares)
  vec2 cellLocalA = fract(vSnowWorldPos.xz * 4.2) - 0.5;
  vec2 cellLocalB = fract(vSnowWorldPos.xz * 8.6 + vec2(11.3, 17.9)) - 0.5;
  float pinA = smoothstep(0.32, 0.04, length(cellLocalA - (rndA.xy - 0.5) * 0.42));
  float pinB = smoothstep(0.36, 0.05, length(cellLocalB - (rndB.xy - 0.5) * 0.42));

  vec3 facetA = normalize(worldN + (rndA - 0.5) * 0.78);
  vec3 facetB = normalize(worldN + (rndB - 0.5) * 0.88);

  float glintA = pow(max(dot(facetA, halfVecW), 0.0), 18.0) * step(0.84, rndA.z) * pinA;
  float glintB = pow(max(dot(facetB, halfVecW), 0.0), 22.0) * step(0.87, rndB.x) * pinB;

  // Concentrate micro-sparkles naturally on sunlit slopes, bank shoulders & crest edges
  float sparkleMask = 0.55 + snowRelief.y * 0.65;
  float sparkle = (glintA * 0.95 + glintB * 1.15) * distFade * sunFacing * sparkleMask * uSnowSparkleIntensity;
  vec3 sparkleTint = mix(vec3(0.95, 0.98, 1.08), vec3(1.12, 1.06, 0.96), snowRelief.y);
  reflectedLight.directSpecular += sparkleTint * sparkle;

  // Warm creamy directional sunlight tint on crests + cool pale-blue sky bounce in groove shadows
  reflectedLight.directDiffuse *= mix(vec3(0.92, 0.96, 1.04), vec3(1.06, 1.01, 0.93), snowRelief.y);
  float coolFillMask = snowRelief.x * (1.0 - sunFacing * 0.32);
  reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.84, 0.92, 1.08), coolFillMask * 0.72);
}`,
      );
  };

  mat.customProgramCacheKey = () => 'lofi-sculpted-snow-track-v3';
  return mat;
}
