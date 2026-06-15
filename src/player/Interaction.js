import * as THREE from 'three';

/**
 * Interaction
 * -----------
 * Raycaster от центра камеры. Каждый кадр проверяет первые 2 м перед игроком.
 * Если объект помечен userData.interactable = true — UI-крестик становится
 * кружком (через DOM-флаг). При клике вызывается userData.onInteract(player).
 *
 * Чтобы пометить объект интерактивным:
 *   mesh.userData.interactable = true;
 *   mesh.userData.onInteract = (player) => { ... };
 *
 * Для родительского узла, у которого интерактивны дети (например, кнопки лифта),
 * можно искать по traversal вверх.
 */
export class Interaction {
  constructor({ camera, scene, crosshairEl, maxDistance = 2.4 }) {
    this.camera = camera;
    this.scene = scene;
    this.crosshair = crosshairEl;
    this.maxDistance = maxDistance;

    this.ray = new THREE.Raycaster();
    this.ray.near = 0.05;
    this.ray.far = this.maxDistance;

    this.candidates = [];   // массив объектов, которые могут быть интерактивны
  }

  register(object3D) {
    this.candidates.push(object3D);
  }

  unregister(object3D) {
    const i = this.candidates.indexOf(object3D);
    if (i >= 0) this.candidates.splice(i, 1);
  }

  _findInteractable(hit) {
    let o = hit.object;
    while (o) {
      if (o.userData && o.userData.interactable) return o;
      o = o.parent;
    }
    return null;
  }

  update(player, click) {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);

    this.ray.set(origin, dir);
    const hits = this.ray.intersectObjects(this.candidates, true);

    let hovered = null;
    if (hits.length > 0 && hits[0].distance <= this.maxDistance) {
      hovered = this._findInteractable(hits[0]);
    }

    if (hovered) this.crosshair.classList.add('hover');
    else this.crosshair.classList.remove('hover');

    // Подсветка экранной кнопки взаимодействия
    const btn = document.getElementById('interact-btn');
    if (btn) {
      if (hovered) btn.classList.add('hover');
      else btn.classList.remove('hover');
    }

    if (click && hovered && typeof hovered.userData.onInteract === 'function') {
      hovered.userData.onInteract(player);
    }

    return hovered;
  }
}
