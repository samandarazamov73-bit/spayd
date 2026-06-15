import * as THREE from 'three';

/**
 * PostProcessing (lite-версия)
 * ----------------------------
 * Чтобы не убивать слабые GPU и сохранить совместимость с Safari/Mac,
 * пост-обработка отключена. Класс предоставляет тот же интерфейс, но
 * рендерит сцену напрямую через renderer.render().
 *
 * setHorrorLevel и setExposure работают через изменение
 * toneMappingExposure (для эффекта «нагнетания»).
 */
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this._horror = 0;
    this._baseExposure = renderer.toneMappingExposure;
  }

  setHorrorLevel(t) {
    this._horror = Math.max(0, Math.min(1, t));
    // Чем выше уровень, тем темнее общая экспозиция
    this.renderer.toneMappingExposure = this._baseExposure * (1.0 - this._horror * 0.35);
  }

  setExposure(value) {
    this._baseExposure = value;
    this.renderer.toneMappingExposure = value;
  }

  onResize() { /* nothing */ }

  render(dt) {
    this.renderer.render(this.scene, this.camera);
  }
}
