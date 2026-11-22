import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLofiCharacter } from './lofiCharacter';

export interface HeroInspectorController {
  dispose: () => void;
}

export interface HeroInspectorOptions {
  container: HTMLElement;
  /** 'face' focuses closely on head/face; 'full' shows complete neutral body + snowboard. */
  framing?: 'face' | 'full';
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
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

/**
 * Temporary development-only character inspection viewer (?inspectHero=1).
 * Never exposed in player navigation or gameplay flow.
 * Renders the EXACT shared `createLofiCharacter` model in static neutral pose
 * simultaneously from Front (left viewport) and Three-Quarter (right viewport) cameras.
 */
export function createHeroInspector(
  options: HeroInspectorOptions,
): HeroInspectorController {
  const { container, framing = 'face' } = options;
  const isSoftwareGl = detectSoftwareWebGL();

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('data-testid', 'hero-inspector-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc5d2e8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  // Neutral studio lighting matching in-game warm key + cool alpine fill so facial shading reads accurately
  const hemiLight = new THREE.HemisphereLight(0xdce8ff, 0x7690c2, 1.05);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff0dc, 1.35);
  keyLight.position.set(2.8, 4.4, 4.6);
  keyLight.castShadow = !isSoftwareGl;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x9fc2ff, 0.65);
  rimLight.position.set(-3.5, 2.8, -3.2);
  scene.add(rimLight);

  // Subtle snow pedestal so neutral stance sits cleanly grounded
  const pedestalGeo = new THREE.CylinderGeometry(1.55, 1.75, 0.16, 36);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0xeaf2fb,
    roughness: 0.85,
    metalness: 0.0,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.set(0, -0.08, 0);
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  // Mount the EXACT shared hero model factory used in Gameplay, Victory & Game Over
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const lofi = createLofiCharacter(maxAniso);
  scene.add(lofi.root);
  lofi.root.position.set(0, 0, 0);
  lofi.root.rotation.set(0, 0, 0);
  lofi.update({
    dt: 0,
    time: 0,
    lean: 0,
    speedRatio: 0,
    hitFlashTimer: 0,
    invulnTimer: 0,
    isTitleIdle: false,
    neutralInspect: true,
  });

  // Two static cameras viewing the exact same neutral-pose Lofi instance:
  // Left viewport = Front (0° yaw), Right viewport = Three-Quarter (~32° yaw)
  const frontCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  const threeQuarterCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);

  if (framing === 'full') {
    frontCamera.position.set(0, 1.32, 4.45);
    frontCamera.lookAt(0, 1.12, 0);

    threeQuarterCamera.position.set(2.35, 1.42, 3.78);
    threeQuarterCamera.lookAt(0, 1.12, 0);
  } else {
    // Close-up on head, face, ears, horns, goggles & upper jacket collar
    frontCamera.position.set(0, 1.82, 2.02);
    frontCamera.lookAt(0, 1.74, 0.08);

    threeQuarterCamera.position.set(1.08, 1.88, 1.74);
    threeQuarterCamera.lookAt(0, 1.74, 0.06);
  }

  let frameId = 0;
  let disposed = false;

  const renderDualView = () => {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setSize(width, height);

    const halfW = Math.floor(width / 2);
    const rightW = width - halfW;
    const leftAspect = Math.max(0.2, halfW / height);
    const rightAspect = Math.max(0.2, rightW / height);

    frontCamera.aspect = leftAspect;
    frontCamera.updateProjectionMatrix();
    threeQuarterCamera.aspect = rightAspect;
    threeQuarterCamera.updateProjectionMatrix();

    renderer.setScissorTest(true);

    // Left half: Front neutral pose
    renderer.setViewport(0, 0, halfW, height);
    renderer.setScissor(0, 0, halfW, height);
    renderer.render(scene, frontCamera);

    // Right half: 3/4 neutral pose
    renderer.setViewport(halfW, 0, rightW, height);
    renderer.setScissor(halfW, 0, rightW, height);
    renderer.render(scene, threeQuarterCamera);

    renderer.setScissorTest(false);
  };

  const requestRender = () => {
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(renderDualView);
  };

  document.body.dataset.state = 'inspect';
  document.body.dataset.phase = 'inspect';
  document.body.dataset.inspectFraming = framing;

  renderDualView();

  const onResize = () => requestRender();
  window.addEventListener('resize', onResize);
  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  resizeObserver?.observe(container);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
      pedestalGeo.dispose();
      pedestalMat.dispose();
      lofi.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
