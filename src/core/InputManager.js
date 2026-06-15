import * as THREE from 'three';

/**
 * Менеджер ввода: клавиатура + Pointer Lock.
 * Поворот камеры реализован вручную через yaw/pitch + инерцию,
 * чтобы получить «весомое» ощущение головы.
 */
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set();

    this.locked = false;
    this.mouse = { dx: 0, dy: 0 };
    this.click = false;

    this.sensitivity = 0.0022;

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
    });

    this.domElement.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });

    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.click = true;
    });
  }

  requestLock() {
    if (this.domElement.requestPointerLock) {
      this.domElement.requestPointerLock();
    }
  }

  /** В конце кадра: вернуть и обнулить дельту мыши и флаг клика. */
  consume() {
    const dx = this.mouse.dx, dy = this.mouse.dy;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    const click = this.click;
    this.click = false;
    return { dx, dy, click };
  }

  /** WASD как Vector3 в плоскости (x,z) — относительно камеры. */
  getMoveVector() {
    const v = new THREE.Vector3(0, 0, 0);
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    v.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  v.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  v.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v.x += 1;
    if (v.lengthSq() > 0) v.normalize();
    return v;
  }

  isShift() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
}
