import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { FilmGrainShader } from '../shaders/FilmGrainShader.js';
import { VignetteShader } from '../shaders/VignetteShader.js';
import { ChromaticAberrationShader } from '../shaders/ChromaticAberrationShader.js';

/**
 * EffectComposer:
 *  RenderPass -> Bloom (HDR-сияние ламп/ТВ) -> CA -> Vignette -> Grain -> Output
 */
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Лёгкий bloom — только HDR-яркие источники (ТВ, лампы)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.45,   // strength
      0.7,    // radius
      0.85    // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Хроматическая аберрация
    this.caPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.caPass);

    // Виньетка
    this.vignettePass = new ShaderPass(VignetteShader);
    this.composer.addPass(this.vignettePass);

    // Шум плёнки — последним (поверх всего, кроме output)
    this.grainPass = new ShaderPass(FilmGrainShader);
    this.composer.addPass(this.grainPass);

    // Output (правильный sRGB / tonemap)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
  }

  /**
   * Установить «уровень ужаса» 0..1 — глобальная регулировка эффектов.
   * 0 = спокойный реализм, 1 = кульминация (виньетка/CA на максимум).
   */
  setHorrorLevel(t) {
    t = Math.max(0, Math.min(1, t));
    this.vignettePass.uniforms.uIntensity.value   = 0.45 + t * 0.95;     // 0.45 -> 1.40
    this.vignettePass.uniforms.uSmoothness.value  = 0.55 - t * 0.30;     // плотнее к краю
    this.caPass.uniforms.uAmount.value            = 0.0010 + t * 0.0080; // 0.001 -> 0.009
    this.grainPass.uniforms.uAmount.value         = 0.05  + t * 0.10;
    this.bloomPass.strength                       = 0.45  + t * 0.50;
  }

  setExposure(value) {
    this.renderer.toneMappingExposure = value;
  }

  render(dt) {
    this.grainPass.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
