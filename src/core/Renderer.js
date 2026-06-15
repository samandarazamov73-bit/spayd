import * as THREE from 'three';

/**
 * Лёгкий WebGL-рендерер: PBR + ACES, БЕЗ теней (тени полностью отключены
 * для производительности). На MacBook без дискретной видеокарты это даёт
 * рост FPS в 3-5 раз без потери самой картинки.
 */
export function createRenderer(canvasParent) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  // Тени отключены полностью — это была главная статья расхода GPU
  renderer.shadowMap.enabled = false;

  renderer.useLegacyLights = false;

  canvasParent.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return renderer;
}
