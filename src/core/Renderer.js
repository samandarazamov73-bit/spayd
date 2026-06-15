import * as THREE from 'three';

/**
 * WebGL-рендерер с PBR-настройками для реалистичной картинки:
 * - PCFSoftShadowMap + большие тени-карты
 * - ACESFilmic tone mapping (кинематографичная кривая)
 * - sRGB output, физически-корректный свет
 * - Pixel ratio capped (на 4К не выгрызает GPU)
 */
export function createRenderer(canvasParent) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // PBR-конвейер
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  // Тени
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  // Физически-корректное освещение
  renderer.useLegacyLights = false;

  canvasParent.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return renderer;
}
