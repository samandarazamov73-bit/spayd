import * as THREE from 'three';

/**
 * Менеджер ввода: клавиатура + Pointer Lock + drag-fallback.
 *
 * Если PointerLock не работает (Safari, sandboxed iframe, отказ браузера),
 * автоматически включается режим «зажми ЛКМ и двигай мышь» для поворота
 * камеры. WASD-движение работает в любом случае.
 *
 * Также блокируется браузерное поведение по умолчанию для WASD/стрелок,
 * чтобы Cmd+A или Tab не выбивали фокус.
 */
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set();

    this.locked = false;
    this.dragging = false;        // активный fallback-drag режим
    this.mouse = { dx: 0, dy: 0 };
    this.click = false;
    this._lastMouse = { x: 0, y: 0 };

    this.sensitivity = 0.0028;

    const GAME_KEYS = new Set([
      'KeyW','KeyA','KeyS','KeyD',
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
      'Space','ShiftLeft','ShiftRight'
    ]);

    document.addEventListener('keydown', (e) => {
      // Игнорируем Cmd/Ctrl-сочетания (Cmd+A, Cmd+R и т.п. не должны двигать игрока)
      if (e.metaKey || e.ctrlKey) return;
      this.keys.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    }, { passive: false });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.domElement;
    });

    // === Pointer Lock путь ===
    this.domElement.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      } else if (this.dragging) {
        // fallback: считаем дельту от прошлой позиции
        this.mouse.dx += (e.clientX - this._lastMouse.x);
        this.mouse.dy += (e.clientY - this._lastMouse.y);
        this._lastMouse.x = e.clientX;
        this._lastMouse.y = e.clientY;
      }
    });

    // === Click — двойная роль ===
    // 1) Если PointerLock активен → это «взаимодействие»
    // 2) Если нет → попытаться захватить курсор; если не получилось — игра
    //    переходит в drag-режим (поворот мыши при зажатой ЛКМ)
    this.domElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.locked) {
        this.click = true;
      } else {
        // запомним позицию для drag-режима
        this._lastMouse.x = e.clientX;
        this._lastMouse.y = e.clientY;
        this.dragging = true;
        this.domElement.style.cursor = 'none';
        // одновременно пробуем повторно захватить курсор
        this.requestLock();
      }
    });

    this.domElement.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (this.dragging) {
        this.dragging = false;
        this.domElement.style.cursor = 'default';
        // короткий клик без движения = взаимодействие
        if (Math.abs(this.mouse.dx) < 4 && Math.abs(this.mouse.dy) < 4) {
          this.click = true;
        }
      }
    });

    this.domElement.addEventListener('mouseleave', () => {
      this.dragging = false;
      this.domElement.style.cursor = 'default';
    });

    // Контекстное меню — отключаем, чтобы ПКМ не мешала
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // === Кнопки на экране (для тех, кому неудобно WASD) ===
    // Удерживаемая кнопка эмулирует нажатие соответствующего кода.
    const wirePadButton = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      const press   = (e) => { e.preventDefault(); this.keys.add(code); el.classList.add('active'); };
      const release = (e) => { e.preventDefault(); this.keys.delete(code); el.classList.remove('active'); };
      el.addEventListener('mousedown',   press);
      el.addEventListener('mouseup',     release);
      el.addEventListener('mouseleave',  release);
      el.addEventListener('touchstart',  press,   { passive: false });
      el.addEventListener('touchend',    release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
    };
    wirePadButton('pad-up',    'KeyW');
    wirePadButton('pad-down',  'KeyS');
    wirePadButton('pad-left',  'KeyA');
    wirePadButton('pad-right', 'KeyD');

    // Кнопка взаимодействия
    const interactBtn = document.getElementById('interact-btn');
    if (interactBtn) {
      const fire = (e) => { e.preventDefault(); this.click = true; };
      interactBtn.addEventListener('mousedown',  fire);
      interactBtn.addEventListener('touchstart', fire, { passive: false });
    }
    this._interactBtnEl = interactBtn;
  }

  requestLock() {
    try {
      this.domElement.requestPointerLock?.();
    } catch (_) { /* ignore */ }
  }

  consume() {
    const dx = this.mouse.dx, dy = this.mouse.dy;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    const click = this.click;
    this.click = false;
    return { dx, dy, click };
  }

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
