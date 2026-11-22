import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PERIMETER_PINE_VARIANT_COUNT,
  ROCK_VARIANT_COUNT,
  type PineVariantId,
  type RockVariantId,
} from './alpinePropsLogic';

export interface AlpineRockTransform {
  variant: RockVariantId;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  tiltX: number;
  tiltZ: number;
  tint: number;
}

export interface AlpinePineTransform {
  variant: PineVariantId;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotY: number;
  tiltX: number;
  tiltZ: number;
  tint: number;
}

export interface AlpinePropsSystem {
  setPerimeterProps: (
    rocks: readonly AlpineRockTransform[],
    pines: readonly AlpinePineTransform[],
  ) => void;
  setTrackProps: (
    rocks: readonly AlpineRockTransform[],
    pines: readonly AlpinePineTransform[],
  ) => void;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// 1. Procedural Bark & Faceted Granite Canvas Textures (Zero External Assets)
// ---------------------------------------------------------------------------

function createBarkTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 128;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  ctx.fillStyle = '#5e3b27';
  ctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Vertical conifer bark furrows & warm-brown ridges
  for (let i = 0; i < 42; i++) {
    const x = (i * 19 + ((i * 7) % 11)) % size;
    const w = 2 + (i % 4);
    const dark = i % 2 === 0;
    ctx.fillStyle = dark ? 'rgba(42, 24, 15, 0.45)' : 'rgba(132, 89, 58, 0.34)';
    ctx.fillRect(x, 0, w, size);
    bctx.fillStyle = dark ? '#585858' : '#a8a8a8';
    bctx.fillRect(x, 0, w, size);
  }
  for (let i = 0; i < 60; i++) {
    const x = (i * 37) % size;
    const y = (i * 23) % size;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(34, 19, 12, 0.35)' : 'rgba(118, 82, 52, 0.25)';
    ctx.fillRect(x, y, 4 + (i % 5), 10 + (i % 14));
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 3);
  map.anisotropy = Math.min(4, maxAnisotropy);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 3);

  return { map, bumpMap };
}

function createGraniteTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 128;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  ctx.fillStyle = '#d4dce6';
  ctx.fillRect(0, 0, size, size);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Subtle alpine granite mineral grain & fine fracture lines
  for (let i = 0; i < 360; i++) {
    const x = (i * 53) % size;
    const y = (i * 97) % size;
    const r = 1 + (i % 3);
    const light = i % 3 === 0;
    ctx.fillStyle = light ? 'rgba(246, 250, 255, 0.26)' : 'rgba(92, 106, 128, 0.22)';
    ctx.fillRect(x, y, r, r);
    bctx.fillStyle = light ? '#9a9a9a' : '#686868';
    bctx.fillRect(x, y, r, r);
  }
  ctx.strokeStyle = 'rgba(66, 78, 98, 0.28)';
  ctx.lineWidth = 1.2;
  bctx.strokeStyle = '#4e4e4e';
  bctx.lineWidth = 1.4;
  for (let i = 0; i < 10; i++) {
    const sx = (i * 31) % size;
    const sy = (i * 47) % size;
    const dx = 18 + (i % 4) * 9;
    const dy = 12 + ((i * 7) % 16);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx, sy + dy);
    ctx.stroke();
    bctx.beginPath();
    bctx.moveTo(sx, sy);
    bctx.lineTo(sx + dx, sy + dy);
    bctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.anisotropy = Math.min(4, maxAnisotropy);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);

  return { map, bumpMap };
}

// ---------------------------------------------------------------------------
// 2. Geometry Preparation & Sculpting Helpers
// ---------------------------------------------------------------------------

/** Normalize any BufferGeometry to non-indexed with guaranteed position, normal, uv, and color attributes. */
function normalizePartGeometry(
  raw: THREE.BufferGeometry,
  colorFn: (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    out: THREE.Color,
  ) => void,
  flatNormals = false,
): THREE.BufferGeometry {
  const geo = raw.index ? raw.toNonIndexed() : raw.clone();
  if (raw !== geo) raw.dispose();

  if (flatNormals || !geo.attributes.normal) {
    geo.computeVertexNormals();
  }

  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const count = pos.count;

  if (!geo.attributes.uv) {
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = pos.getX(i) * 0.5 + 0.5;
      uvs[i * 2 + 1] = pos.getY(i) * 0.5 + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }

  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    colorFn(
      pos.getX(i),
      pos.getY(i),
      pos.getZ(i),
      norm.getX(i),
      norm.getY(i),
      norm.getZ(i),
      c,
    );
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Keep only the standard 4 attributes so mergeGeometries never mismatches
  for (const attrName of Object.keys(geo.attributes)) {
    if (
      attrName !== 'position' &&
      attrName !== 'normal' &&
      attrName !== 'uv' &&
      attrName !== 'color'
    ) {
      geo.deleteAttribute(attrName);
    }
  }
  return geo;
}

function mergeNormalizedParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
  }
  if (!merged) {
    throw new Error('Failed to merge procedural alpine prop geometry parts.');
  }
  merged.computeBoundingSphere();
  return merged;
}

/** Build a tapered organic curved wooden trunk or branch limb along a CatmullRomCurve3. */
function buildTaperedCurvedTube(
  points: THREE.Vector3[],
  radiusBottom: number,
  radiusTop: number,
  tubularSegments: number,
  radialSegments: number,
  rootFlare = 0,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const rings = tubularSegments + 1;
  const cols = radialSegments + 1;

  const positions = new Float32Array(rings * cols * 3);
  const uvs = new Float32Array(rings * cols * 2);
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, pt);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    // Smooth taper + organic root flare near t = 0
    const flare = rootFlare > 0 ? rootFlare * Math.pow(Math.max(0, 1 - t * 3.2), 2.1) : 0;
    const baseR = THREE.MathUtils.lerp(radiusBottom, radiusTop, Math.pow(t, 0.85)) + flare;

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const theta = u * Math.PI * 2;
      const rootFlute =
        rootFlare > 0 && t < 0.35
          ? 1 + 0.16 * (1 - t / 0.35) * Math.cos(theta * 3 + 0.4)
          : 1;
      const r = baseR * rootFlute;

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      v.set(
        pt.x + r * (cosT * N.x + sinT * B.x),
        pt.y + r * (cosT * N.y + sinT * B.y),
        pt.z + r * (cosT * N.z + sinT * B.z),
      );

      const idx = i * cols + j;
      positions[idx * 3] = v.x;
      positions[idx * 3 + 1] = v.y;
      positions[idx * 3 + 2] = v.z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = t * 2.5;
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = (i + 1) * cols + (j + 1);
      const d = i * cols + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Paint rich evergreen foliage shading: darker shaded undersides, deeper spruce core, brighter sunlit outer tips. */
const FOLIAGE_DARK = new THREE.Color(0x163128);
const FOLIAGE_MID = new THREE.Color(0x244c39);
const FOLIAGE_TIP = new THREE.Color(0x3e6a45);

function shadeFoliageVertex(
  x: number,
  y: number,
  z: number,
  _nx: number,
  ny: number,
  _nz: number,
  out: THREE.Color,
): void {
  const upFactor = THREE.MathUtils.clamp(ny * 0.55 + 0.48, 0, 1);
  const radial = Math.min(1, Math.hypot(x, z) / 1.75);
  const heightHint = THREE.MathUtils.clamp(y / 5.5, 0, 1);
  if (upFactor < 0.48) {
    out.copy(FOLIAGE_DARK).lerp(FOLIAGE_MID, upFactor / 0.48);
  } else {
    const tipBlend = THREE.MathUtils.clamp((upFactor - 0.48) / 0.52 * 0.60 + radial * 0.24 + heightHint * 0.14, 0, 1);
    out.copy(FOLIAGE_MID).lerp(FOLIAGE_TIP, tipBlend);
  }
}

/** Paint bright crisp snow tops with cool glacier-blue shadow undersides so thick snow pads read in 3D without heavy shadows. */
const SNOW_SHADOW = new THREE.Color(0xc4d8f2);
const SNOW_BRIGHT = new THREE.Color(0xf7fbff);

function shadeSnowVertex(
  _x: number,
  _y: number,
  _z: number,
  _nx: number,
  ny: number,
  _nz: number,
  out: THREE.Color,
): void {
  const t = THREE.MathUtils.clamp((ny + 0.50) / 1.32, 0, 1);
  out.copy(SNOW_SHADOW).lerp(SNOW_BRIGHT, Math.pow(t, 0.72));
}

const BARK_SHADOW = new THREE.Color(0x907a6a);
const BARK_LIT = new THREE.Color(0xe6d5ca);

function shadeBarkVertex(
  _x: number,
  y: number,
  _z: number,
  _nx: number,
  ny: number,
  _nz: number,
  out: THREE.Color,
): void {
  const baseAO = THREE.MathUtils.clamp(y / 1.4, 0, 1);
  const t = THREE.MathUtils.clamp(0.35 + baseAO * 0.42 + Math.max(0, ny) * 0.23, 0, 1);
  out.copy(BARK_SHADOW).lerp(BARK_LIT, t);
}

/** Sculpt a deep-skirted organic snow mound anchoring tree trunks and boulders seamlessly into sloped snowbanks. */
function buildBaseSnowMound(
  rx: number,
  ry: number,
  rz: number,
  seed: number,
): THREE.BufferGeometry {
  const raw = new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.68);
  const pos = raw.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const ang = Math.atan2(vz, vx);
    const skirt =
      1 +
      0.16 * Math.sin(ang * 2 + seed) +
      0.10 * Math.cos(ang * 3 - seed * 1.4);
    // Extend lower skirt well below y=0 so sloped snowbanks never reveal a floating underside
    const yShaped =
      vy >= 0.08
        ? Math.pow(vy, 0.92) * ry
        : -0.62 + (vy + 0.55) * 0.65;
    pos.setXYZ(
      i,
      vx * rx * skirt,
      yShaped,
      vz * rz * skirt,
    );
  }
  raw.computeVertexNormals();
  return normalizePartGeometry(raw, shadeSnowVertex, false);
}

/**
 * Add one organic tufted pine bough + matched thick pillowy snow pad resting on its upper surface.
 * Uses sculpted lobed tufts (not raw cones) so each branch reads as lush evergreen needles weighed down by snow.
 */
interface BoughSpec {
  originX: number;
  originY: number;
  originZ: number;
  angle: number;
  length: number;
  width: number;
  thickness: number;
  droop: number;
  snowThickness: number;
  snowCoverage: number;
  seed: number;
  addWoodStub?: boolean;
}

function addSculptedPineBough(
  trunkParts: THREE.BufferGeometry[],
  foliageParts: THREE.BufferGeometry[],
  snowParts: THREE.BufferGeometry[],
  spec: BoughSpec,
): void {
  const dirX = Math.cos(spec.angle);
  const dirZ = Math.sin(spec.angle);
  const perpX = -dirZ;
  const perpZ = dirX;

  // Optional visible dark-wood branch limb peeking beneath wider lower boughs
  if (spec.addWoodStub && spec.length > 0.72) {
    const limb = buildTaperedCurvedTube(
      [
        new THREE.Vector3(spec.originX, spec.originY - 0.04, spec.originZ),
        new THREE.Vector3(
          spec.originX + dirX * spec.length * 0.42,
          spec.originY - spec.droop * 0.35 - 0.08,
          spec.originZ + dirZ * spec.length * 0.42,
        ),
        new THREE.Vector3(
          spec.originX + dirX * spec.length * 0.72,
          spec.originY - spec.droop * 0.68 - 0.06,
          spec.originZ + dirZ * spec.length * 0.72,
        ),
      ],
      0.11,
      0.045,
      3,
      5,
    );
    trunkParts.push(normalizePartGeometry(limb, shadeBarkVertex, false));
  }

  // Primary elongated organic needle pad + flanking needle tuft cluster for rich silhouette
  const padGeo = new THREE.SphereGeometry(1, 6, 4);
  const pPos = padGeo.attributes.position;
  for (let i = 0; i < pPos.count; i++) {
    const lx = pPos.getX(i); // along branch (-1..1)
    const ly = pPos.getY(i);
    const lz = pPos.getZ(i); // across branch (-1..1)
    const alongT = (lx + 1) * 0.5; // 0 at trunk -> 1 at outer tip
    // Taper gently toward outer tip with slight scalloped needle tuft bumps
    const tipWidth = THREE.MathUtils.lerp(0.86, 0.62, alongT * alongT);
    const tuftBump = 1 + 0.14 * Math.sin(alongT * 7.5 + lz * 3.2 + spec.seed);
    const bx = alongT * spec.length;
    const bz = lz * spec.width * tipWidth * tuftBump;
    // Graceful downward arc under snow weight + subtle upturned needle tip curl
    const archY =
      -Math.pow(alongT, 1.35) * spec.droop +
      Math.max(0, alongT - 0.72) * 0.14;
    const by = archY + (ly > 0 ? ly * spec.thickness * 0.82 : ly * spec.thickness * 1.15);

    pPos.setXYZ(
      i,
      spec.originX + dirX * bx + perpX * bz,
      spec.originY + by,
      spec.originZ + dirZ * bx + perpZ * bz,
    );
  }
  padGeo.computeVertexNormals();
  foliageParts.push(normalizePartGeometry(padGeo, shadeFoliageVertex, false));

  // Secondary flanking needle-tuft fan near the outer 65% of broader boughs
  if (spec.length > 0.78) {
    for (const side of [-1, 1]) {
      const tuftGeo = new THREE.SphereGeometry(1, 5, 3);
      const tPos = tuftGeo.attributes.position;
      const tuftDist = spec.length * 0.62;
      const tuftSide = side * spec.width * 0.56;
      const tuftBaseY = spec.originY - spec.droop * 0.54 - 0.04;
      const tLen = spec.length * 0.34;
      const tWid = spec.width * 0.44;
      const tH = spec.thickness * 0.78;
      const sAngle = spec.angle + side * 0.46;
      const sdx = Math.cos(sAngle);
      const sdz = Math.sin(sAngle);
      const spx = -sdz;
      const spz = sdx;

      for (let i = 0; i < tPos.count; i++) {
        const lx = tPos.getX(i);
        const ly = tPos.getY(i);
        const lz = tPos.getZ(i);
        const cx = spec.originX + dirX * tuftDist + perpX * tuftSide;
        const cz = spec.originZ + dirZ * tuftDist + perpZ * tuftSide;
        tPos.setXYZ(
          i,
          cx + sdx * (lx * tLen) + spx * (lz * tWid),
          tuftBaseY + ly * tH - Math.max(0, lx) * 0.06,
          cz + sdz * (lx * tLen) + spz * (lz * tWid),
        );
      }
      tuftGeo.computeVertexNormals();
      foliageParts.push(normalizePartGeometry(tuftGeo, shadeFoliageVertex, false));
    }
  }

  // Thick pillowy snow blanket draped along the UPPER surface of this bough
  if (spec.snowCoverage > 0.15) {
    const snowGeo = new THREE.SphereGeometry(1, 6, 4);
    const sPos = snowGeo.attributes.position;
    const snowLen = spec.length * spec.snowCoverage;
    const startFrac = 0.04;

    for (let i = 0; i < sPos.count; i++) {
      const lx = sPos.getX(i);
      const ly = sPos.getY(i);
      const lz = sPos.getZ(i);
      const alongT = (lx + 1) * 0.5; // 0..1 along snow pillow
      const branchT = startFrac + alongT * spec.snowCoverage;
      const pillowSwell =
        1 +
        0.16 * Math.sin(alongT * Math.PI * 2 + spec.seed * 1.7) +
        0.10 * Math.cos(lz * 2.6 + spec.seed);
      const tipNarrow = THREE.MathUtils.lerp(0.92, 0.64, alongT * alongT);
      const bx = startFrac * spec.length + alongT * snowLen;
      const bz = lz * spec.width * 0.94 * tipNarrow * pillowSwell;

      const branchArchY = -Math.pow(branchT, 1.35) * spec.droop;
      // Plump rounded snow pillow sitting high on top, overhanging gently on sides
      const snowLift = spec.thickness * 0.44;
      const edgeDrape = (1 - Math.abs(ly)) * 0.08 * Math.abs(lz);
      const by =
        branchArchY +
        snowLift +
        (ly >= 0 ? Math.pow(ly, 0.78) * spec.snowThickness * pillowSwell : ly * spec.snowThickness * 0.34) -
        edgeDrape;

      sPos.setXYZ(
        i,
        spec.originX + dirX * bx + perpX * bz,
        spec.originY + by,
        spec.originZ + dirZ * bx + perpZ * bz,
      );
    }
    snowGeo.computeVertexNormals();
    snowParts.push(normalizePartGeometry(snowGeo, shadeSnowVertex, false));
  }
}

/** Add a sculpted rounded snow hood crowning the top spire of a pine tree. */
function addCrownSnowCap(
  foliageParts: THREE.BufferGeometry[],
  snowParts: THREE.BufferGeometry[],
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  height: number,
  leanX = 0,
  leanZ = 0,
): void {
  // Small evergreen tip core under the crown snow
  const tipRaw = new THREE.ConeGeometry(radius * 1.05, height * 0.95, 6);
  tipRaw.translate(cx + leanX * 0.2, cy + height * 0.36, cz + leanZ * 0.2);
  foliageParts.push(normalizePartGeometry(tipRaw, shadeFoliageVertex, false));

  // Pillowy sculpted snow crown hood curving smoothly to a soft tip (ref: lofi-snow-pine-reference)
  const capRaw = new THREE.SphereGeometry(1, 7, 5);
  const pos = capRaw.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const tUp = (vy + 1) * 0.5; // 0 bottom .. 1 tip
    const taper = THREE.MathUtils.lerp(1.06, 0.22, Math.pow(tUp, 0.85));
    const scallop = 1 + 0.14 * Math.sin(Math.atan2(vz, vx) * 3 + 0.5) * (1 - tUp);
    pos.setXYZ(
      i,
      cx + vx * radius * taper * scallop + leanX * tUp,
      cy + tUp * height * 1.12 + 0.08,
      cz + vz * radius * taper * scallop + leanZ * tUp,
    );
  }
  capRaw.computeVertexNormals();
  snowParts.push(normalizePartGeometry(capRaw, shadeSnowVertex, false));
}

// ---------------------------------------------------------------------------
// 3. Five Distinct Stylized Alpine Pine Tree Variants
// ---------------------------------------------------------------------------

interface PineVariantGeometries {
  trunk: THREE.BufferGeometry;
  foliage: THREE.BufferGeometry;
  snow: THREE.BufferGeometry;
}

function buildPineVariant(variant: PineVariantId): PineVariantGeometries {
  const trunkParts: THREE.BufferGeometry[] = [];
  const foliageParts: THREE.BufferGeometry[] = [];
  const snowParts: THREE.BufferGeometry[] = [];

  if (variant === 0) {
    // VARIANT 0: TALL NARROW ALPINE SPRUCE (ref: far-left tree in lofi-pine-grove-reference)
    const curvePts = [
      new THREE.Vector3(0, -0.56, 0),
      new THREE.Vector3(0.03, 1.35, -0.02),
      new THREE.Vector3(-0.02, 2.95, 0.03),
      new THREE.Vector3(0.02, 4.72, 0),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(curvePts);
    trunkParts.push(
      normalizePartGeometry(
        buildTaperedCurvedTube(curvePts, 0.30, 0.06, 6, 6, 0.16),
        shadeBarkVertex,
      ),
    );
    snowParts.push(buildBaseSnowMound(1.08, 0.30, 1.02, 1.1));

    const tiers = [
      { y: 1.02, count: 5, len: 1.32, wid: 0.50, thk: 0.30, droop: 0.42, snowT: 0.22 },
      { y: 1.62, count: 5, len: 1.20, wid: 0.47, thk: 0.28, droop: 0.38, snowT: 0.21 },
      { y: 2.22, count: 5, len: 1.06, wid: 0.43, thk: 0.26, droop: 0.34, snowT: 0.20 },
      { y: 2.82, count: 4, len: 0.90, wid: 0.40, thk: 0.24, droop: 0.29, snowT: 0.19 },
      { y: 3.40, count: 4, len: 0.74, wid: 0.36, thk: 0.22, droop: 0.23, snowT: 0.18 },
      { y: 3.94, count: 3, len: 0.58, wid: 0.31, thk: 0.19, droop: 0.17, snowT: 0.17 },
      { y: 4.44, count: 3, len: 0.42, wid: 0.25, thk: 0.16, droop: 0.12, snowT: 0.16 },
    ];
    tiers.forEach((tier, tIdx) => {
      const pt = trunkCurve.getPointAt(THREE.MathUtils.clamp((tier.y + 0.56) / 5.28, 0, 1));
      for (let b = 0; b < tier.count; b++) {
        const angle = (b / tier.count) * Math.PI * 2 + tIdx * 0.68;
        const jitter = 0.92 + ((b * 13 + tIdx * 7) % 5) * 0.04;
        addSculptedPineBough(trunkParts, foliageParts, snowParts, {
          originX: pt.x,
          originY: tier.y + (b % 2) * 0.08,
          originZ: pt.z,
          angle,
          length: tier.len * jitter,
          width: tier.wid,
          thickness: tier.thk,
          droop: tier.droop,
          snowThickness: tier.snowT,
          snowCoverage: 0.88,
          seed: tIdx * 3.1 + b * 1.7,
          addWoodStub: tIdx === 0 && b % 2 === 0,
        });
      }
    });
    addCrownSnowCap(foliageParts, snowParts, 0.02, 4.60, 0, 0.34, 0.96, 0.04, 0);
  } else if (variant === 1) {
    // VARIANT 1: BROAD FULL MOUNTAIN PINE (ref: center-left lush wide pine in lofi-pine-grove-reference)
    const curvePts = [
      new THREE.Vector3(0, -0.58, 0),
      new THREE.Vector3(-0.04, 1.2, 0.03),
      new THREE.Vector3(0.03, 2.7, -0.02),
      new THREE.Vector3(0, 4.30, 0),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(curvePts);
    trunkParts.push(
      normalizePartGeometry(
        buildTaperedCurvedTube(curvePts, 0.42, 0.08, 6, 6, 0.24),
        shadeBarkVertex,
      ),
    );
    snowParts.push(buildBaseSnowMound(1.42, 0.34, 1.36, 2.4));

    const tiers = [
      { y: 1.00, count: 5, len: 1.72, wid: 0.68, thk: 0.38, droop: 0.42, snowT: 0.30 },
      { y: 1.72, count: 5, len: 1.54, wid: 0.62, thk: 0.35, droop: 0.38, snowT: 0.28 },
      { y: 2.44, count: 5, len: 1.28, wid: 0.54, thk: 0.31, droop: 0.32, snowT: 0.26 },
      { y: 3.12, count: 4, len: 0.98, wid: 0.46, thk: 0.27, droop: 0.25, snowT: 0.24 },
      { y: 3.72, count: 4, len: 0.68, wid: 0.37, thk: 0.22, droop: 0.18, snowT: 0.21 },
      { y: 4.14, count: 3, len: 0.46, wid: 0.28, thk: 0.18, droop: 0.12, snowT: 0.18 },
    ];
    tiers.forEach((tier, tIdx) => {
      const pt = trunkCurve.getPointAt(THREE.MathUtils.clamp((tier.y + 0.58) / 4.88, 0, 1));
      for (let b = 0; b < tier.count; b++) {
        const angle = (b / tier.count) * Math.PI * 2 + tIdx * 0.62;
        const jitter = 0.90 + ((b * 11 + tIdx * 5) % 5) * 0.05;
        addSculptedPineBough(trunkParts, foliageParts, snowParts, {
          originX: pt.x,
          originY: tier.y + (b % 2) * 0.10,
          originZ: pt.z,
          angle,
          length: tier.len * jitter,
          width: tier.wid,
          thickness: tier.thk,
          droop: tier.droop,
          snowThickness: tier.snowT,
          snowCoverage: 0.92,
          seed: 10 + tIdx * 2.9 + b * 2.1,
          addWoodStub: tIdx <= 1 && b % 2 === 0,
        });
      }
    });
    addCrownSnowCap(foliageParts, snowParts, 0, 4.24, 0, 0.44, 0.88, -0.04, 0.03);
  } else if (variant === 2) {
    // VARIANT 2: GNARLED WIND-BENT PINE (ref: lofi-snow-pine-reference & center-right pine in grove)
    const curvePts = [
      new THREE.Vector3(-0.08, -0.58, 0.04),
      new THREE.Vector3(0.32, 0.92, -0.08),
      new THREE.Vector3(0.16, 2.08, 0.06),
      new THREE.Vector3(-0.18, 3.22, -0.04),
      new THREE.Vector3(0.08, 4.18, 0.04),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(curvePts);
    trunkParts.push(
      normalizePartGeometry(
        buildTaperedCurvedTube(curvePts, 0.36, 0.09, 8, 6, 0.22),
        shadeBarkVertex,
      ),
    );
    snowParts.push(buildBaseSnowMound(1.34, 0.36, 1.26, 3.9));

    // Asymmetric open wind-swept horizontal branch tiers exposing the gnarled curved trunk
    const manualBoughs = [
      // Tier 1 (low dramatic swooping arms)
      { t: 0.36, angle: 0.25, len: 1.60, wid: 0.62, thk: 0.33, droop: 0.30, snowT: 0.29 },
      { t: 0.40, angle: 2.35, len: 1.48, wid: 0.58, thk: 0.32, droop: 0.28, snowT: 0.28 },
      { t: 0.38, angle: 4.55, len: 1.32, wid: 0.54, thk: 0.29, droop: 0.26, snowT: 0.26 },
      // Tier 2 (mid sculpted horizontal pads with visible trunk gaps)
      { t: 0.58, angle: 1.25, len: 1.40, wid: 0.58, thk: 0.30, droop: 0.26, snowT: 0.28 },
      { t: 0.61, angle: 3.45, len: 1.46, wid: 0.58, thk: 0.30, droop: 0.27, snowT: 0.28 },
      { t: 0.63, angle: 5.45, len: 1.18, wid: 0.50, thk: 0.27, droop: 0.24, snowT: 0.25 },
      // Tier 3 (upper wind-swept canopy pads)
      { t: 0.80, angle: 0.45, len: 1.16, wid: 0.50, thk: 0.26, droop: 0.19, snowT: 0.25 },
      { t: 0.82, angle: 2.65, len: 1.08, wid: 0.48, thk: 0.25, droop: 0.18, snowT: 0.24 },
      { t: 0.84, angle: 4.75, len: 0.96, wid: 0.44, thk: 0.24, droop: 0.17, snowT: 0.23 },
      // Tier 4 (top crown pads)
      { t: 0.94, angle: 1.4, len: 0.74, wid: 0.39, thk: 0.21, droop: 0.12, snowT: 0.22 },
      { t: 0.95, angle: 3.9, len: 0.68, wid: 0.37, thk: 0.20, droop: 0.12, snowT: 0.21 },
    ];
    manualBoughs.forEach((b, idx) => {
      const pt = trunkCurve.getPointAt(b.t);
      addSculptedPineBough(trunkParts, foliageParts, snowParts, {
        originX: pt.x,
        originY: pt.y,
        originZ: pt.z,
        angle: b.angle,
        length: b.len,
        width: b.wid,
        thickness: b.thk,
        droop: b.droop,
        snowThickness: b.snowT,
        snowCoverage: 0.90,
        seed: 24 + idx * 1.9,
        addWoodStub: idx < 6,
      });
    });
    const topPt = trunkCurve.getPointAt(1);
    addCrownSnowCap(foliageParts, snowParts, topPt.x, topPt.y - 0.05, topPt.z, 0.42, 0.82, 0.16, -0.04);
  } else if (variant === 3) {
    // VARIANT 3: GRACEFUL STEPPED MOUNTAIN PINE (ref: lofi-snow-pine-reference & far-right grove tree)
    const curvePts = [
      new THREE.Vector3(0.05, -0.58, 0),
      new THREE.Vector3(-0.20, 0.95, 0.06),
      new THREE.Vector3(0.04, 2.30, -0.04),
      new THREE.Vector3(0.14, 3.65, 0.03),
      new THREE.Vector3(0.02, 4.58, 0),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(curvePts);
    trunkParts.push(
      normalizePartGeometry(
        buildTaperedCurvedTube(curvePts, 0.32, 0.065, 7, 6, 0.18),
        shadeBarkVertex,
      ),
    );
    snowParts.push(buildBaseSnowMound(1.22, 0.32, 1.18, 5.2));

    const tiers = [
      { y: 1.14, count: 4, len: 1.50, wid: 0.56, thk: 0.32, droop: 0.38, snowT: 0.27 },
      { y: 1.82, count: 4, len: 1.32, wid: 0.52, thk: 0.29, droop: 0.34, snowT: 0.25 },
      { y: 2.50, count: 4, len: 1.12, wid: 0.47, thk: 0.26, droop: 0.29, snowT: 0.23 },
      { y: 3.16, count: 4, len: 0.90, wid: 0.41, thk: 0.23, droop: 0.23, snowT: 0.21 },
      { y: 3.74, count: 3, len: 0.68, wid: 0.35, thk: 0.20, droop: 0.18, snowT: 0.19 },
      { y: 4.22, count: 3, len: 0.48, wid: 0.28, thk: 0.17, droop: 0.13, snowT: 0.18 },
    ];
    tiers.forEach((tier, tIdx) => {
      const pt = trunkCurve.getPointAt(THREE.MathUtils.clamp((tier.y + 0.58) / 5.16, 0, 1));
      for (let b = 0; b < tier.count; b++) {
        const angle = (b / tier.count) * Math.PI * 2 + tIdx * 0.92 + 0.3;
        const jitter = 0.88 + ((b * 9 + tIdx * 13) % 5) * 0.06;
        addSculptedPineBough(trunkParts, foliageParts, snowParts, {
          originX: pt.x,
          originY: tier.y + ((b % 3) - 1) * 0.09,
          originZ: pt.z,
          angle,
          length: tier.len * jitter,
          width: tier.wid,
          thickness: tier.thk,
          droop: tier.droop,
          snowThickness: tier.snowT,
          snowCoverage: 0.90,
          seed: 42 + tIdx * 3.7 + b * 2.3,
          addWoodStub: tIdx <= 1,
        });
      }
    });
    const topPt = trunkCurve.getPointAt(1);
    addCrownSnowCap(foliageParts, snowParts, topPt.x, topPt.y - 0.08, topPt.z, 0.38, 0.92, 0.12, 0.04);
  } else {
    // VARIANT 4: COMPACT BUSHY SNOW SAPLING (ref: low bushy alpine pines in lofi-pine-grove-reference)
    const curvePts = [
      new THREE.Vector3(0, -0.52, 0),
      new THREE.Vector3(0.05, 0.82, -0.03),
      new THREE.Vector3(-0.02, 1.72, 0.02),
    ];
    const trunkCurve = new THREE.CatmullRomCurve3(curvePts);
    trunkParts.push(
      normalizePartGeometry(
        buildTaperedCurvedTube(curvePts, 0.22, 0.06, 4, 5, 0.12),
        shadeBarkVertex,
      ),
    );
    snowParts.push(buildBaseSnowMound(1.08, 0.28, 1.04, 7.3));

    const tiers = [
      { y: 0.42, count: 5, len: 1.12, wid: 0.50, thk: 0.30, droop: 0.24, snowT: 0.23 },
      { y: 1.00, count: 4, len: 0.86, wid: 0.44, thk: 0.26, droop: 0.19, snowT: 0.21 },
      { y: 1.52, count: 3, len: 0.56, wid: 0.34, thk: 0.21, droop: 0.13, snowT: 0.19 },
    ];
    tiers.forEach((tier, tIdx) => {
      const pt = trunkCurve.getPointAt(THREE.MathUtils.clamp((tier.y + 0.52) / 2.24, 0, 1));
      for (let b = 0; b < tier.count; b++) {
        const angle = (b / tier.count) * Math.PI * 2 + tIdx * 0.78;
        addSculptedPineBough(trunkParts, foliageParts, snowParts, {
          originX: pt.x,
          originY: tier.y + (b % 2) * 0.06,
          originZ: pt.z,
          angle,
          length: tier.len * (0.92 + ((b + tIdx) % 3) * 0.06),
          width: tier.wid,
          thickness: tier.thk,
          droop: tier.droop,
          snowThickness: tier.snowT,
          snowCoverage: 0.86,
          seed: 64 + tIdx * 2.5 + b * 1.4,
        });
      }
    });
    addCrownSnowCap(foliageParts, snowParts, -0.02, 1.66, 0.02, 0.34, 0.68, 0.04, -0.02);
  }

  return {
    trunk: mergeNormalizedParts(trunkParts),
    foliage: mergeNormalizedParts(foliageParts),
    snow: mergeNormalizedParts(snowParts),
  };
}

// ---------------------------------------------------------------------------
// 4. Three Distinct Faceted Alpine Granite Boulder Variants + Draped Snow
// ---------------------------------------------------------------------------

interface RockVariantGeometries {
  rock: THREE.BufferGeometry;
  snow: THREE.BufferGeometry;
}

const GRANITE_CREVICE = new THREE.Color(0x3c475a);
const GRANITE_MID = new THREE.Color(0x748194);
const GRANITE_LIGHT = new THREE.Color(0xa2afc2);
const GRANITE_SNOW_BOUNCE = new THREE.Color(0x6d89b3);

/** Sculpt a chiseled angular granite rock lobe with crisp faceted planes and recessed fracture crevices. */
function buildChiseledGraniteLobe(
  rx: number,
  ry: number,
  rz: number,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  peakSkewX: number,
  peakSkewZ: number,
  creviceAngle: number,
  seed: number,
  detail = 1,
): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  const pos = raw.attributes.position;

  // Define 5 angled planar chisel cuts so the boulder has crisp flat granite faces (ref: lofi-snow-rock-reference)
  const planes = [
    { nx: Math.cos(seed), ny: 0.42, nz: Math.sin(seed), d: 0.80 },
    { nx: Math.cos(seed + 1.9), ny: 0.28, nz: Math.sin(seed + 1.9), d: 0.78 },
    { nx: Math.cos(seed + 3.6), ny: 0.35, nz: Math.sin(seed + 3.6), d: 0.82 },
    { nx: Math.cos(seed + 5.0), ny: -0.15, nz: Math.sin(seed + 5.0), d: 0.84 },
    { nx: peakSkewX * 0.7, ny: 0.92, nz: peakSkewZ * 0.7, d: 0.86 },
  ];
  const creviceNx = Math.cos(creviceAngle);
  const creviceNz = Math.sin(creviceAngle);

  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    // Extend rock base slightly below ground plane so boulders anchor seamlessly into sloped snowbanks
    if (vy < -0.22) {
      vy = -0.22 + (vy + 0.22) * 0.88;
    }

    // Apply soft planar bevels to sculpt realistic faceted granite planes
    for (let p = 0; p < planes.length; p++) {
      const pl = planes[p];
      const invLen = 1 / Math.hypot(pl.nx, pl.ny, pl.nz);
      const pnx = pl.nx * invLen;
      const pny = pl.ny * invLen;
      const pnz = pl.nz * invLen;
      const dot = vx * pnx + vy * pny + vz * pnz;
      if (dot > pl.d) {
        const excess = (dot - pl.d) * 0.75;
        vx -= pnx * excess;
        vy -= pny * excess;
        vz -= pnz * excess;
      }
    }

    // Carve a distinct diagonal geological crack/crevice across the boulder face
    const creviceDist = Math.abs(vx * creviceNx + vz * creviceNz - vy * 0.36);
    if (creviceDist < 0.24 && vy > -0.35) {
      const groove = (1 - creviceDist / 0.24) * 0.16;
      vx *= 1 - groove;
      vy *= 1 - groove * 0.6;
      vz *= 1 - groove;
    }

    // Subtle ridge skew toward peak
    const upT = Math.max(0, (vy + 0.3) / 1.3);
    vx += peakSkewX * upT * 0.24;
    vz += peakSkewZ * upT * 0.24;

    // Slight crisp micro-facet irregularity
    const rockNoise =
      1 +
      0.07 * Math.sin(vx * 4.2 + seed) * Math.cos(vz * 3.8 - seed) +
      0.05 * Math.sin(vy * 5.1 + seed * 1.7);

    pos.setXYZ(
      i,
      offsetX + vx * rx * rockNoise,
      offsetY + (vy + 0.50) * ry * rockNoise,
      offsetZ + vz * rz * rockNoise,
    );
  }

  // Flat-shaded non-indexed granite facets + vertex lighting/AO
  return normalizePartGeometry(
    raw,
    (x, y, z, nx, ny, nz, out) => {
      const up = THREE.MathUtils.clamp((ny + 0.35) / 1.35, 0, 1);
      const creviceCheck = Math.abs((x - offsetX) * creviceNx + (z - offsetZ) * creviceNz - (y - offsetY) * 0.25);
      const inCrevice = creviceCheck < 0.24 ? (1 - creviceCheck / 0.24) * 0.62 : 0;

      if (up < 0.45) {
        out.copy(GRANITE_CREVICE).lerp(GRANITE_MID, up / 0.45);
      } else {
        out.copy(GRANITE_MID).lerp(GRANITE_LIGHT, (up - 0.45) / 0.55);
      }
      if (inCrevice > 0) {
        out.lerp(GRANITE_CREVICE, inCrevice);
      }
      // Subtle icy blue snow bounce light near the rock's base (ref: lofi-snow-rock-reference)
      if (y < 0.36 && ny < 0.18) {
        const bounce = THREE.MathUtils.clamp((0.36 - y) / 0.36, 0, 1) * 0.45;
        out.lerp(GRANITE_SNOW_BOUNCE, bounce);
      }
      // Directional facet contrast
      const facetContrast = 0.93 + 0.09 * (nx * 0.6 - nz * 0.4);
      out.multiplyScalar(facetContrast);
    },
    true,
  );
}

/** Sculpt a thick asymmetrical snow blanket draping tightly over a boulder crest with soft overhanging scalloped tongues. */
function buildDrapedRockSnowCap(
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  slopeX: number,
  slopeZ: number,
  seed: number,
): THREE.BufferGeometry {
  const raw = new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.68);
  const pos = raw.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const ang = Math.atan2(vz, vx);
    const rimT = THREE.MathUtils.clamp(1 - Math.max(0, vy), 0, 1);

    // Scalloped thick snow overhang tongues draping smoothly down the boulder shoulders
    const lobeDrape =
      0.18 * Math.sin(ang * 3 + seed) +
      0.12 * Math.cos(ang * 2 - seed * 1.3);
    const radScale = 1 + lobeDrape * rimT * 0.52;
    const x = vx * rx * radScale;
    const z = vz * rz * radScale;
    const slopeDrop = x * slopeX + z * slopeZ;
    const overhangDrop = rimT * rimT * (0.24 + Math.max(0, lobeDrape) * 0.46);

    pos.setXYZ(
      i,
      cx + x,
      cy + vy * ry + slopeDrop - overhangDrop,
      cz + z,
    );
  }
  raw.computeVertexNormals();
  return normalizePartGeometry(raw, shadeSnowVertex, false);
}

/** Small chunky snow pocket sitting inside a rock ledge or crevice. */
function buildRockLedgeSnowPocket(
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  tiltZ = 0,
): THREE.BufferGeometry {
  const raw = new THREE.SphereGeometry(1, 6, 4);
  raw.scale(rx, ry, rz);
  if (tiltZ !== 0) raw.rotateZ(tiltZ);
  raw.translate(cx, cy, cz);
  return normalizePartGeometry(raw, shadeSnowVertex, false);
}

function buildRockVariant(variant: RockVariantId): RockVariantGeometries {
  const rockParts: THREE.BufferGeometry[] = [];
  const snowParts: THREE.BufferGeometry[] = [];

  if (variant === 0) {
    // ROCK VARIANT 0: PEAKED ALPINE CRAG (directly inspired by lofi-snow-rock-reference)
    rockParts.push(
      buildChiseledGraniteLobe(0.94, 0.86, 0.88, 0.08, -0.06, 0.0, 0.28, -0.10, 0.58, 1.3, 1),
      buildChiseledGraniteLobe(0.68, 0.58, 0.66, -0.44, -0.08, 0.14, -0.18, 0.12, 1.85, 3.1, 1),
    );
    // Thick asymmetrical snow crest draping tightly from the high right peak down the left shoulder
    snowParts.push(
      buildDrapedRockSnowCap(0.14, 0.96, -0.03, 0.72, 0.30, 0.68, 0.26, -0.08, 1.2),
      buildDrapedRockSnowCap(-0.44, 0.60, 0.14, 0.54, 0.20, 0.52, 0.22, 0.06, 3.4),
      buildRockLedgeSnowPocket(0.58, 0.40, 0.42, 0.22, 0.10, 0.18, -0.25),
      buildRockLedgeSnowPocket(0.18, 0.22, 0.68, 0.18, 0.08, 0.14, 0.15),
      buildBaseSnowMound(1.16, 0.19, 1.06, 0.9),
    );
  } else if (variant === 1) {
    // ROCK VARIANT 1: WIDE SPLIT-RIDGE BOULDER (ref: trailside boulders in lofi-environment-natural-reference)
    rockParts.push(
      buildChiseledGraniteLobe(1.04, 0.70, 0.90, -0.12, -0.06, 0.04, -0.12, 0.08, 1.15, 2.7, 1),
      buildChiseledGraniteLobe(0.78, 0.64, 0.76, 0.46, -0.08, -0.10, 0.16, -0.08, 2.25, 4.9, 1),
    );
    snowParts.push(
      buildDrapedRockSnowCap(-0.10, 0.78, 0.05, 0.88, 0.28, 0.78, -0.08, 0.10, 2.6),
      buildDrapedRockSnowCap(0.46, 0.68, -0.08, 0.62, 0.22, 0.58, -0.12, -0.06, 4.1),
      buildRockLedgeSnowPocket(-0.62, 0.30, 0.48, 0.20, 0.09, 0.18, 0.20),
      buildBaseSnowMound(1.30, 0.20, 1.14, 2.8),
    );
  } else {
    // ROCK VARIANT 2: CLUSTERED OUTCROP BOULDER (primary angular rock + nestled flanking stones)
    rockParts.push(
      buildChiseledGraniteLobe(0.86, 0.78, 0.84, 0.0, -0.06, -0.06, 0.10, -0.16, 0.92, 5.4, 1),
      buildChiseledGraniteLobe(0.60, 0.50, 0.58, 0.54, -0.10, 0.28, 0.20, 0.14, 2.60, 7.2, 0),
      buildChiseledGraniteLobe(0.54, 0.44, 0.56, -0.52, -0.10, 0.24, -0.22, 0.10, 0.35, 8.8, 0),
    );
    snowParts.push(
      buildDrapedRockSnowCap(0.02, 0.86, -0.05, 0.74, 0.29, 0.72, 0.10, -0.12, 5.1),
      buildDrapedRockSnowCap(0.52, 0.50, 0.28, 0.44, 0.17, 0.42, -0.14, 0.12, 6.7),
      buildRockLedgeSnowPocket(-0.46, 0.44, 0.24, 0.32, 0.14, 0.28, 0.22),
      buildBaseSnowMound(1.24, 0.20, 1.16, 4.7),
    );
  }

  return {
    rock: mergeNormalizedParts(rockParts),
    snow: mergeNormalizedParts(snowParts),
  };
}

// ---------------------------------------------------------------------------
// 5. Unified Multi-Variant InstancedMesh Pool Manager (Zero Per-Frame Alloc)
// ---------------------------------------------------------------------------

interface PineVariantPool {
  trunk: THREE.InstancedMesh;
  foliage: THREE.InstancedMesh;
  snow: THREE.InstancedMesh;
  maxCount: number;
  perimUsed: number;
}

interface RockVariantPool {
  rock: THREE.InstancedMesh;
  snow: THREE.InstancedMesh;
  maxCount: number;
  perimUsed: number;
}

export function createAlpinePropsSystem(
  scene: THREE.Scene,
  maxAnisotropy: number,
): AlpinePropsSystem {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Shared materials (roughness delta >= 0.16–0.20 across snow/foliage/bark/granite)
  const barkTex = createBarkTextures(maxAnisotropy);
  const graniteTex = createGraniteTextures(maxAnisotropy);
  track(barkTex.map);
  track(barkTex.bumpMap);
  track(graniteTex.map);
  track(graniteTex.bumpMap);

  const matBark = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: barkTex.map,
      bumpMap: barkTex.bumpMap,
      bumpScale: 0.035,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.0,
    }),
  );

  const matFoliage = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
    }),
  );

  const matSnowAccum = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.70,
      metalness: 0.02,
    }),
  );

  const matGranite = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: graniteTex.map,
      bumpMap: graniteTex.bumpMap,
      bumpScale: 0.055,
      vertexColors: true,
      flatShading: true,
      roughness: 0.89,
      metalness: 0.04,
    }),
  );

  // Build 5 distinct pine variant pools (each pool holds perimeter + track instances in 3 draw calls)
  const pinePools: PineVariantPool[] = [];
  const pineCapacities = [210, 210, 190, 200, 140]; // Plenty of headroom for up to 580 perimeter + 80 track pines
  for (let v = 0; v < PERIMETER_PINE_VARIANT_COUNT; v++) {
    const geos = buildPineVariant(v as PineVariantId);
    track(geos.trunk);
    track(geos.foliage);
    track(geos.snow);

    const cap = pineCapacities[v];
    const trunk = new THREE.InstancedMesh(geos.trunk, matBark, cap);
    const foliage = new THREE.InstancedMesh(geos.foliage, matFoliage, cap);
    const snow = new THREE.InstancedMesh(geos.snow, matSnowAccum, cap);

    foliage.castShadow = true;
    foliage.receiveShadow = true;
    snow.receiveShadow = true;
    trunk.castShadow = true;

    [trunk, foliage, snow].forEach((inst) => {
      inst.frustumCulled = false;
      inst.count = 0;
      scene.add(inst);
    });

    pinePools.push({ trunk, foliage, snow, maxCount: cap, perimUsed: 0 });
  }

  // Build 3 distinct granite boulder variant pools (2 draw calls per variant)
  const rockPools: RockVariantPool[] = [];
  const rockCapacities = [120, 120, 120];
  for (let v = 0; v < ROCK_VARIANT_COUNT; v++) {
    const geos = buildRockVariant(v as RockVariantId);
    track(geos.rock);
    track(geos.snow);

    const cap = rockCapacities[v];
    const rock = new THREE.InstancedMesh(geos.rock, matGranite, cap);
    const snow = new THREE.InstancedMesh(geos.snow, matSnowAccum, cap);

    rock.castShadow = true;
    rock.receiveShadow = true;
    snow.receiveShadow = true;

    [rock, snow].forEach((inst) => {
      inst.frustumCulled = false;
      inst.count = 0;
      scene.add(inst);
    });

    rockPools.push({ rock, snow, maxCount: cap, perimUsed: 0 });
  }

  // Reusable scratch objects (zero allocations on sync)
  const _dummy = new THREE.Object3D();
  const _color = new THREE.Color();
  const _snowColor = new THREE.Color();

  let cachedTrackRocks: AlpineRockTransform[] = [];
  let cachedTrackPines: AlpinePineTransform[] = [];

  const writeRockToPool = (pool: RockVariantPool, slot: number, rk: AlpineRockTransform) => {
    _dummy.position.set(rk.x, rk.y, rk.z);
    _dummy.rotation.set(rk.tiltX, rk.rotY, rk.tiltZ, 'YXZ');
    _dummy.scale.set(rk.sx, rk.sy, rk.sz);
    _dummy.updateMatrix();

    pool.rock.setMatrixAt(slot, _dummy.matrix);
    pool.snow.setMatrixAt(slot, _dummy.matrix);

    // Subtle cool-to-warm granite value variation per boulder
    const t = rk.tint;
    _color.setRGB(t * 0.98, t, Math.min(1.08, t * 1.03));
    pool.rock.setColorAt(slot, _color);

    const st = 0.96 + (t - 0.88) * 0.22;
    _snowColor.setRGB(st, st, Math.min(1.04, st * 1.02));
    pool.snow.setColorAt(slot, _snowColor);
  };

  const writePineToPool = (pool: PineVariantPool, slot: number, p: AlpinePineTransform) => {
    _dummy.position.set(p.x, p.y, p.z);
    _dummy.rotation.set(p.tiltX, p.rotY, p.tiltZ, 'YXZ');
    _dummy.scale.set(p.sx, p.sy, p.sz);
    _dummy.updateMatrix();

    pool.trunk.setMatrixAt(slot, _dummy.matrix);
    pool.foliage.setMatrixAt(slot, _dummy.matrix);
    pool.snow.setMatrixAt(slot, _dummy.matrix);

    // Natural per-instance foliage & subtle snow tint variety
    const t = p.tint;
    _color.setRGB(t * 0.96, t * 1.03, t * 0.98);
    pool.foliage.setColorAt(slot, _color);

    const bt = 0.92 + (t - 0.86) * 0.45;
    _color.setRGB(bt, bt * 0.98, bt * 0.95);
    pool.trunk.setColorAt(slot, _color);

    const st = 0.97 + (t - 0.86) * 0.16;
    _snowColor.setRGB(st, st, Math.min(1.04, st * 1.01));
    pool.snow.setColorAt(slot, _snowColor);
  };

  const flushTrackProps = () => {
    const rockCursors = rockPools.map((p) => p.perimUsed);
    for (let i = 0; i < cachedTrackRocks.length; i++) {
      const rk = cachedTrackRocks[i];
      const pool = rockPools[rk.variant];
      const slot = rockCursors[rk.variant];
      if (slot < pool.maxCount) {
        writeRockToPool(pool, slot, rk);
        rockCursors[rk.variant] = slot + 1;
      }
    }
    for (let v = 0; v < rockPools.length; v++) {
      const pool = rockPools[v];
      pool.rock.count = rockCursors[v];
      pool.snow.count = rockCursors[v];
      pool.rock.instanceMatrix.needsUpdate = true;
      pool.snow.instanceMatrix.needsUpdate = true;
      if (pool.rock.instanceColor) pool.rock.instanceColor.needsUpdate = true;
      if (pool.snow.instanceColor) pool.snow.instanceColor.needsUpdate = true;
    }

    const pineCursors = pinePools.map((p) => p.perimUsed);
    for (let i = 0; i < cachedTrackPines.length; i++) {
      const p = cachedTrackPines[i];
      const pool = pinePools[p.variant];
      const slot = pineCursors[p.variant];
      if (slot < pool.maxCount) {
        writePineToPool(pool, slot, p);
        pineCursors[p.variant] = slot + 1;
      }
    }
    for (let v = 0; v < pinePools.length; v++) {
      const pool = pinePools[v];
      pool.trunk.count = pineCursors[v];
      pool.foliage.count = pineCursors[v];
      pool.snow.count = pineCursors[v];
      pool.trunk.instanceMatrix.needsUpdate = true;
      pool.foliage.instanceMatrix.needsUpdate = true;
      pool.snow.instanceMatrix.needsUpdate = true;
      if (pool.trunk.instanceColor) pool.trunk.instanceColor.needsUpdate = true;
      if (pool.foliage.instanceColor) pool.foliage.instanceColor.needsUpdate = true;
      if (pool.snow.instanceColor) pool.snow.instanceColor.needsUpdate = true;
    }
  };

  const setPerimeterProps = (
    rocks: readonly AlpineRockTransform[],
    pines: readonly AlpinePineTransform[],
  ) => {
    for (let v = 0; v < rockPools.length; v++) rockPools[v].perimUsed = 0;
    for (let i = 0; i < rocks.length; i++) {
      const rk = rocks[i];
      const pool = rockPools[rk.variant];
      if (pool.perimUsed < pool.maxCount - 30) {
        writeRockToPool(pool, pool.perimUsed++, rk);
      }
    }

    for (let v = 0; v < pinePools.length; v++) pinePools[v].perimUsed = 0;
    for (let i = 0; i < pines.length; i++) {
      const p = pines[i];
      const pool = pinePools[p.variant];
      const trackReserve = p.variant === 4 ? 0 : 30;
      if (pool.perimUsed < pool.maxCount - trackReserve) {
        writePineToPool(pool, pool.perimUsed++, p);
      }
    }

    flushTrackProps();
  };

  const setTrackProps = (
    rocks: readonly AlpineRockTransform[],
    pines: readonly AlpinePineTransform[],
  ) => {
    cachedTrackRocks = rocks.slice();
    cachedTrackPines = pines.slice();
    flushTrackProps();
  };

  const dispose = () => {
    for (let v = 0; v < pinePools.length; v++) {
      scene.remove(pinePools[v].trunk, pinePools[v].foliage, pinePools[v].snow);
    }
    for (let v = 0; v < rockPools.length; v++) {
      scene.remove(rockPools[v].rock, rockPools[v].snow);
    }
    for (let i = 0; i < disposables.length; i++) {
      disposables[i].dispose();
    }
  };

  return {
    setPerimeterProps,
    setTrackProps,
    dispose,
  };
}
