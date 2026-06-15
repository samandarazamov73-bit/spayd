import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Elevator
 * --------
 * Полноценный State Machine лифта с физикой, звуком, табло и кнопками.
 *
 * Состояния:
 *   IDLE / DOORS_OPENING / DOORS_OPEN / DOORS_CLOSING /
 *   MOVING / ARRIVED / FROZEN
 *
 * Физика: kinematic CANNON-тела для пола кабины, потолка, 3-х стен,
 *         двух дверей кабины, и двух дверей шахты на каждом из этажей.
 *
 * Игрок внутри: Player.setStandingOn(cabinFloor) даёт синхронное
 * перемещение с кабиной плюс kinematic-стены не дают выйти.
 */
export class Elevator {
  constructor({ scene, world, audio, assets, hotel, interaction, materials }) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.assets = assets;
    this.hotel = hotel;
    this.interaction = interaction;
    this.M = materials;

    // === Геометрические параметры (берём из Hotel) ===
    this.SHAFT_FRONT_Z = hotel.SHAFT_FRONT_Z;          // 7
    this.SHAFT_BACK_Z  = hotel.SHAFT_BACK_Z;           // 9.4
    this.SHAFT_HALF_X  = hotel.SHAFT_HALF_X;           // 1.2
    this.OPENING_HALF_X = hotel.OPENING_HALF_X;        // 0.85
    this.DOOR_HEIGHT   = hotel.DOOR_HEIGHT;            // 2.05
    this.CABIN_DEPTH   = (this.SHAFT_BACK_Z - this.SHAFT_FRONT_Z) - 0.1; // ~2.3
    this.CABIN_WIDTH   = this.SHAFT_HALF_X * 2 - 0.1;  // ~2.3
    this.CABIN_HEIGHT  = 2.4;
    this.CABIN_FRONT_Z = this.SHAFT_FRONT_Z + 0.05;    // лицо кабины (двери)
    this.CABIN_CENTER_Z = this.CABIN_FRONT_Z + this.CABIN_DEPTH / 2;
    this.FLOOR_11_Y = hotel.FLOOR_11_Y;                // 30

    // Возможные «остановки»
    this.floorY = { 1: 0, 11: this.FLOOR_11_Y };

    // === State ===
    this.state = 'IDLE';
    this.currentFloor = 11;            // стартуем на 11
    this.targetFloor  = 11;
    this.cabinY = this.FLOOR_11_Y;
    this.startY = this.FLOOR_11_Y;
    this.endY   = this.FLOOR_11_Y;
    this.moveT  = 0;
    this.moveDuration = 8.0;           // долго — для эффекта саспенса

    this.doorOpen = 0;                 // 0..1
    this.doorOpenTarget = 0;
    this.doorOpenSpeed = 0.6;          // 1/секунд
    this.openHoldTime = 0;
    this.OPEN_HOLD = 4.5;              // сколько держим открытыми (с)

    // Эффекты искажения (для акта 4)
    this.glitchMode = false;
    this.glitchTimer = 0;

    // === Сборка кабины ===
    this.cabin = new THREE.Group();
    this.cabin.name = 'ElevatorCabin';
    this.cabin.userData.isMovingPlatform = true;
    this.scene.add(this.cabin);

    this._buildCabin();
    this._buildFloorDoors(1);
    this._buildFloorDoors(11);
    this._buildButtons();

    // === Звуки ===
    this.motorSound = this.audio.attach('elevatorMotor', this.cabin, {
      loop: true, volume: 0, refDistance: 1.2, rolloff: 1.5, maxDistance: 30, occludable: true
    });
    this.cableSound = this.audio.attach('cableTension', this.cabin, {
      loop: true, volume: 0, refDistance: 2, rolloff: 1.6, maxDistance: 25, occludable: true
    });

    // Поставим кабину на 11 этаж
    this._applyCabinTransform();
  }


  // =====================================================
  // Сборка кабины (мэши + kinematic тела)
  // =====================================================
  _buildCabin() {
    const M = this.M;
    const W = this.CABIN_WIDTH;
    const D = this.CABIN_DEPTH;
    const H = this.CABIN_HEIGHT;

    // Координаты внутри cabin: центр кабины — (0, H/2, CABIN_CENTER_Z) в мире.
    // В локальных координатах — (0, 0, 0). Мы ставим cabin.position = (0, cabinY, 0).
    // Но чтобы кабина по Z была в шахте, центрируем все детали по Z.
    // Используем локальный Z = 0 = центр кабины. Соответствие к миру через cabin.position.z = CABIN_CENTER_Z.
    this.cabin.position.set(0, this.FLOOR_11_Y, this.CABIN_CENTER_Z);

    // Пол (полированная сталь)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.06, D), M.steel);
    floor.position.set(0, 0.03, 0);
    floor.receiveShadow = true;
    this.cabin.add(floor);
    this.cabinFloor = floor;
    this.cabinFloorBody = this._makeKinematic(W, 0.06, D);

    // Потолок
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), M.brushedMetal);
    ceil.position.set(0, H - 0.02, 0);
    this.cabin.add(ceil);
    this.cabinCeilBody = this._makeKinematic(W, 0.04, D);

    // Зеркало на задней стене кабины
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.04), M.steel);
    back.position.set(0, H/2, D/2 - 0.02);
    back.receiveShadow = true;
    this.cabin.add(back);
    this.cabinBackBody = this._makeKinematic(W, H, 0.04);
    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.7, H * 0.65),
      new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.05, metalness: 1.0 })
    );
    mirror.position.set(0, H * 0.55, D/2 - 0.04);
    mirror.rotation.y = Math.PI;
    this.cabin.add(mirror);

    // Левая стена
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.04, H, D), M.steel);
    wallL.position.set(-W/2 + 0.02, H/2, 0);
    wallL.receiveShadow = true;
    this.cabin.add(wallL);
    this.cabinWallLBody = this._makeKinematic(0.04, H, D);

    // Правая стена (тут будет панель кнопок)
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.04, H, D), M.steel);
    wallR.position.set( W/2 - 0.02, H/2, 0);
    wallR.receiveShadow = true;
    this.cabin.add(wallR);
    this.cabinWallRBody = this._makeKinematic(0.04, H, D);


    // === Двери кабины (передняя стена с проёмом 1.7м) ===
    // Стена слева от проёма
    const fLW = (W/2 - this.OPENING_HALF_X);
    const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(fLW, H, 0.05), M.steel);
    wallFrontL.position.set(-W/2 + fLW/2, H/2, -D/2 + 0.025);
    this.cabin.add(wallFrontL);
    this.cabinFrontLBody = this._makeKinematic(fLW, H, 0.05);

    // Стена справа от проёма
    const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(fLW, H, 0.05), M.steel);
    wallFrontR.position.set( W/2 - fLW/2, H/2, -D/2 + 0.025);
    this.cabin.add(wallFrontR);
    this.cabinFrontRBody = this._makeKinematic(fLW, H, 0.05);

    // Перемычка над проёмом дверей
    const overH = H - this.DOOR_HEIGHT;
    const wallFrontTop = new THREE.Mesh(
      new THREE.BoxGeometry(this.OPENING_HALF_X * 2, overH, 0.05),
      M.steel
    );
    wallFrontTop.position.set(0, this.DOOR_HEIGHT + overH/2, -D/2 + 0.025);
    this.cabin.add(wallFrontTop);
    this.cabinFrontTopBody = this._makeKinematic(this.OPENING_HALF_X * 2, overH, 0.05);

    // Створки дверей кабины (двигаются по X)
    const doorMat = M.brushedMetal;
    const doorW = this.OPENING_HALF_X;
    const doorH = this.DOOR_HEIGHT - 0.02;

    this.cabinDoorL = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.05), doorMat);
    this.cabinDoorL.position.set(-doorW/2, doorH/2 + 0.01, -D/2 + 0.025);
    this.cabinDoorL.castShadow = true;
    this.cabin.add(this.cabinDoorL);
    this.cabinDoorLBody = this._makeKinematic(doorW, doorH, 0.05);

    this.cabinDoorR = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.05), doorMat);
    this.cabinDoorR.position.set(doorW/2, doorH/2 + 0.01, -D/2 + 0.025);
    this.cabinDoorR.castShadow = true;
    this.cabin.add(this.cabinDoorR);
    this.cabinDoorRBody = this._makeKinematic(doorW, doorH, 0.05);

    // Свет в кабине
    this.cabinLight = new THREE.PointLight(0xfff0d0, 30, 6, 2.0);
    this.cabinLight.position.set(0, H - 0.15, 0);
    this.cabinLight.castShadow = true;
    this.cabinLight.shadow.mapSize.set(512, 512);
    this.cabinLight.shadow.bias = -0.0008;
    this.cabin.add(this.cabinLight);
    this.cabinLightBaseIntensity = 30;

    // Плафон
    const shade = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.4),
      M.lampShade
    );
    shade.position.set(0, H - 0.06, 0);
    this.cabin.add(shade);
    this.cabinShade = shade;
  }


  /**
   * Создаёт kinematic CANNON-тело и добавляет в мир.
   * Position будет ставиться каждый кадр.
   */
  _makeKinematic(sx, sy, sz) {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2))
    });
    this.world.addBody(body);
    return body;
  }

  // =====================================================
  // Двери шахты (статика на этажах) — kinematic, чтобы могли скользить
  // =====================================================
  _buildFloorDoors(floor) {
    const y = this.floorY[floor];
    const W = this.OPENING_HALF_X;
    const H = this.DOOR_HEIGHT - 0.02;
    const z = this.SHAFT_FRONT_Z + 0.02; // чуть в шахту от проёма
    const M = this.M;

    const left = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), M.brushedMetal);
    left.position.set(-W/2, y + H/2 + 0.01, z);
    left.castShadow = true;
    this.scene.add(left);
    const leftBody = this._makeKinematic(W, H, 0.05);

    const right = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), M.brushedMetal);
    right.position.set(W/2, y + H/2 + 0.01, z);
    right.castShadow = true;
    this.scene.add(right);
    const rightBody = this._makeKinematic(W, H, 0.05);

    if (floor === 1)  { this.f1DoorL = left;  this.f1DoorR = right;  this.f1DoorLBody = leftBody;  this.f1DoorRBody = rightBody;  }
    if (floor === 11) { this.f11DoorL = left; this.f11DoorR = right; this.f11DoorLBody = leftBody; this.f11DoorRBody = rightBody; }

    // Над дверями шахты — табло с цифрой текущего этажа
    const w = 0.5, h = 0.18;
    const displayBg = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5, metalness: 0.7 })
    );
    displayBg.position.set(0, y + this.DOOR_HEIGHT + 0.20, this.SHAFT_FRONT_Z - 0.03);
    this.scene.add(displayBg);

    // Сама цифра — динамически обновляемая текстура
    const tex = this._makeFloorDisplayTexture('11');
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.85, h * 0.85),
      new THREE.MeshBasicMaterial({ map: tex, transparent: false })
    );
    display.position.set(0, y + this.DOOR_HEIGHT + 0.20, this.SHAFT_FRONT_Z - 0.04);
    this.scene.add(display);
    if (floor === 1)  this.f1Display  = display;
    if (floor === 11) this.f11Display = display;

    // Кнопка вызова на этаже (одна, рядом с проёмом)
    this._buildCallButton(floor, y);
  }

  _makeFloorDisplayTexture(text) {
    return this.assets.createTextTexture(text, {
      width: 256, height: 128, color: '#ff6622', bg: '#000000', font: 'bold 100px monospace'
    });
  }


  _buildCallButton(floor, y) {
    const M = this.M;
    // Маленькая металлическая пластина с одной кнопкой
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.16, 0.02),
      M.brushedMetal
    );
    const x = this.OPENING_HALF_X + 0.18;   // справа от проёма
    plate.position.set(x, y + 1.20, this.SHAFT_FRONT_Z - 0.02);
    this.scene.add(plate);

    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.012, 16),
      M.buttonOff
    );
    button.rotation.x = Math.PI/2;
    button.position.set(x, y + 1.22, this.SHAFT_FRONT_Z - 0.04);
    button.userData.interactable = true;
    button.userData.tag = `callButton_${floor}`;
    button.userData.basePos = button.position.clone();
    button.userData.lit = false;
    button.userData.onInteract = () => this._onCallButtonPressed(floor, button);
    this.scene.add(button);
    this.interaction.register(button);

    if (floor === 1)  this.callBtn1  = button;
    if (floor === 11) this.callBtn11 = button;
  }

  _buildButtons() {
    // Кнопочная панель внутри кабины — на правой стене
    const M = this.M;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.6, 0.18),
      M.brushedMetal
    );
    panel.position.set(this.CABIN_WIDTH/2 - 0.04, 1.30, -this.CABIN_DEPTH/2 + 0.45);
    this.cabin.add(panel);

    // Сетка кнопок 11..1 (но активны только 1 и 11)
    this.cabinButtons = {};
    const startY = 1.50;
    const step = 0.045;
    for (let f = 11; f >= 1; f--) {
      const i = 11 - f;
      const row = Math.floor(i / 2);
      const col = i % 2;
      const bx = this.CABIN_WIDTH/2 - 0.07;
      const by = startY - row * step * 1.6;
      const bz = -this.CABIN_DEPTH/2 + 0.45 + (col === 0 ? -0.03 : 0.03);

      const btn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.008, 14),
        M.buttonOff.clone()
      );
      btn.rotation.z = Math.PI/2;
      btn.position.set(bx, by, bz);
      btn.userData.basePos = btn.position.clone();
      btn.userData.lit = false;
      btn.userData.floor = f;

      // Активны 1 и 11
      if (f === 1 || f === 11) {
        btn.userData.interactable = true;
        btn.userData.onInteract = () => this._onCabinButtonPressed(f, btn);
        this.interaction.register(btn);
      }

      this.cabin.add(btn);
      this.cabinButtons[f] = btn;

      // Цифра рядом
      const numTex = this.assets.createTextTexture(String(f), {
        width: 64, height: 64, color: '#aaa', bg: '#000', font: 'bold 36px monospace'
      });
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.025, 0.025),
        new THREE.MeshBasicMaterial({ map: numTex })
      );
      label.position.set(bx - 0.005, by + 0.025, bz);
      label.rotation.y = Math.PI/2;
      this.cabin.add(label);
    }

    // Дисплей этажа внутри кабины (над дверями)
    const innerTex = this._makeFloorDisplayTexture('11');
    const innerDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.18),
      new THREE.MeshBasicMaterial({ map: innerTex })
    );
    innerDisplay.position.set(0, this.DOOR_HEIGHT + 0.10, -this.CABIN_DEPTH/2 + 0.06);
    this.cabin.add(innerDisplay);
    this.innerDisplay = innerDisplay;
  }


  // =====================================================
  // Обновление дисплеев
  // =====================================================
  _updateDisplays(floorText) {
    const newTex = this._makeFloorDisplayTexture(floorText);
    const tryUpdate = (mesh) => {
      if (!mesh) return;
      mesh.material.map?.dispose?.();
      mesh.material.map = newTex;
      mesh.material.needsUpdate = true;
    };
    tryUpdate(this.f1Display);
    tryUpdate(this.f11Display);
    tryUpdate(this.innerDisplay);
  }

  // =====================================================
  // Обработчики кнопок
  // =====================================================
  _pressAnimation(btn) {
    if (!btn) return;
    // вдавливание + возврат
    const base = btn.userData.basePos;
    btn.position.copy(base);
    btn.position.z -= 0.005;
    setTimeout(() => btn.position.copy(base), 120);
  }

  _setButtonLit(btn, lit) {
    if (!btn) return;
    btn.userData.lit = lit;
    btn.material = lit ? this.M.buttonOn.clone() : this.M.buttonOff.clone();
  }

  _onCallButtonPressed(floor, btn) {
    this.audio.playOnce('buttonClick', btn, { volume: 0.6, refDistance: 0.5, maxDistance: 6 });
    this._pressAnimation(btn);
    if (this.state === 'FROZEN') return;
    if (this.callPending) return;

    this._setButtonLit(btn, true);
    this.callPending = floor;
    this.requestFloor(floor);
  }

  _onCabinButtonPressed(floor, btn) {
    this.audio.playOnce('buttonClick', btn, { volume: 0.6, refDistance: 0.5, maxDistance: 4 });
    this._pressAnimation(btn);
    if (this.state === 'FROZEN') return;
    if (this.state !== 'DOORS_OPEN' && this.state !== 'IDLE') return;
    if (floor === this.currentFloor) return;
    this._setButtonLit(btn, true);
    this.requestFloor(floor);
  }

  /**
   * Публичный API: запросить лифт на этаж.
   * Если двери открыты — закрыть; затем поехать; затем открыть на месте.
   */
  requestFloor(floor) {
    if (!(floor in this.floorY)) return;
    this.targetFloor = floor;

    if (this.state === 'IDLE') {
      // двери уже закрыты, едем
      this._beginMoving();
    } else if (this.state === 'DOORS_OPEN') {
      this._setState('DOORS_CLOSING');
      this.doorOpenTarget = 0;
    }
    // Если уже в движении / закрытии — запомним и поедем дальше
  }

  // =====================================================
  // Внутренние состояния
  // =====================================================
  _setState(s) {
    this.state = s;
  }

  _beginMoving() {
    if (this.currentFloor === this.targetFloor) {
      // уже там — просто открыть двери
      this._setState('DOORS_OPENING');
      this.doorOpenTarget = 1;
      return;
    }
    this._setState('MOVING');
    this.startY = this.cabinY;
    this.endY = this.floorY[this.targetFloor];
    this.moveT = 0;
    // длительность: имитируем «10 этажей»
    const distance = Math.abs(this.endY - this.startY);
    this.moveDuration = 6.0 + distance * 0.18;     // ~30м -> ~11.4 секунд
    if (this.glitchMode) this.moveDuration *= 1.6; // в финале — ещё дольше

    // звуки старта
    this.audio.playOnce('relayClick', this.cabin, { volume: 0.7, refDistance: 1, maxDistance: 8 });
    setTimeout(() => {
      try { this.motorSound.play(); } catch(_) {}
      try { this.cableSound.play(); } catch(_) {}
    }, 350);
  }

  _arrive() {
    this.cabinY = this.endY;
    this.currentFloor = this.targetFloor;
    this._setState('ARRIVED');
    this._updateDisplays(String(this.currentFloor));
    try { this.motorSound.stop(); } catch(_) {}
    try { this.cableSound.stop(); } catch(_) {}

    // погасить нажатые кнопки
    if (this.callPending === this.currentFloor) {
      this._setButtonLit(this.callBtn1,  false);
      this._setButtonLit(this.callBtn11, false);
      this.callPending = null;
    }
    for (const f in this.cabinButtons) {
      if (parseInt(f, 10) === this.currentFloor) {
        this._setButtonLit(this.cabinButtons[f], false);
      }
    }

    // ding
    this.audio.playOnce('ding', this.cabin, { volume: 0.7, refDistance: 1.5, maxDistance: 12 });
    setTimeout(() => {
      this._setState('DOORS_OPENING');
      this.doorOpenTarget = 1;
    }, 600);
  }


  // =====================================================
  // Easing
  // =====================================================
  _easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // =====================================================
  // Public: занят ли игрок внутри кабины?
  // =====================================================
  isPlayerInside(playerWorldPos) {
    const localX = playerWorldPos.x - this.cabin.position.x;
    const localY = playerWorldPos.y - this.cabin.position.y;
    const localZ = playerWorldPos.z - this.cabin.position.z;
    return (
      Math.abs(localX) < this.CABIN_WIDTH/2  - 0.05 &&
      Math.abs(localZ) < this.CABIN_DEPTH/2  - 0.05 &&
      localY > -0.5 && localY < this.CABIN_HEIGHT
    );
  }

  /**
   * Перевод кабины в режим «глюк» — для финального акта 4.
   * Замедляет, заставляет свет искриться, удлиняет время.
   */
  setGlitchMode(on) {
    this.glitchMode = on;
    this.glitchTimer = 0;
  }

  /**
   * Принудительно отключить кабину (FROZEN) — например для финала, когда лифт «замирает».
   */
  freeze() {
    this._setState('FROZEN');
    try { this.motorSound.stop(); } catch(_) {}
    try { this.cableSound.stop(); } catch(_) {}
  }

  // =====================================================
  // Применение трансформации к kinematic телам
  // =====================================================
  _applyCabinTransform() {
    const cy = this.cabinY;
    const cz = this.CABIN_CENTER_Z;
    const W = this.CABIN_WIDTH;
    const D = this.CABIN_DEPTH;
    const H = this.CABIN_HEIGHT;

    this.cabin.position.set(0, cy, cz);

    // Тела (центр кабины смещён, мы помещаем тела в мировые координаты)
    this.cabinFloorBody.position.set(0, cy + 0.03, cz);
    this.cabinCeilBody.position.set(0,  cy + H - 0.02, cz);
    this.cabinBackBody.position.set(0,  cy + H/2, cz + D/2 - 0.02);
    this.cabinWallLBody.position.set(-W/2 + 0.02, cy + H/2, cz);
    this.cabinWallRBody.position.set( W/2 - 0.02, cy + H/2, cz);

    // Передняя стена (части слева/справа от проёма + перемычка)
    const fLW = (W/2 - this.OPENING_HALF_X);
    this.cabinFrontLBody.position.set(-W/2 + fLW/2, cy + H/2, cz - D/2 + 0.025);
    this.cabinFrontRBody.position.set( W/2 - fLW/2, cy + H/2, cz - D/2 + 0.025);
    const overH = H - this.DOOR_HEIGHT;
    this.cabinFrontTopBody.position.set(0, cy + this.DOOR_HEIGHT + overH/2, cz - D/2 + 0.025);

    // Двери кабины — позиции зависят от doorOpen
    const openShift = this.doorOpen * this.OPENING_HALF_X * 0.95;
    const doorH = this.DOOR_HEIGHT - 0.02;
    const doorW = this.OPENING_HALF_X;

    // local-space положение двери (mesh внутри cabin — обновляем относительно)
    this.cabinDoorL.position.x = -doorW/2 - openShift;
    this.cabinDoorR.position.x =  doorW/2 + openShift;

    // body — в мировых координатах
    this.cabinDoorLBody.position.set(-doorW/2 - openShift, cy + doorH/2 + 0.01, cz - D/2 + 0.025);
    this.cabinDoorRBody.position.set( doorW/2 + openShift, cy + doorH/2 + 0.01, cz - D/2 + 0.025);
  }

  _applyFloorDoorsTransform() {
    // Двери шахты на текущем этаже двигаются вместе с дверями кабины,
    // когда кабина прибыла на этот этаж и сейчас открывается/закрывается.
    // На остальных этажах — закрыты.

    const openShift = this.doorOpen * this.OPENING_HALF_X * 0.95;
    const doorW = this.OPENING_HALF_X;
    const doorH = this.DOOR_HEIGHT - 0.02;
    const z = this.SHAFT_FRONT_Z + 0.02;

    const setPair = (lMesh, rMesh, lBody, rBody, y, shift) => {
      lMesh.position.x = -doorW/2 - shift;
      rMesh.position.x =  doorW/2 + shift;
      lMesh.position.y = y + doorH/2 + 0.01;
      rMesh.position.y = y + doorH/2 + 0.01;
      lMesh.position.z = z;
      rMesh.position.z = z;
      lBody.position.set(-doorW/2 - shift, y + doorH/2 + 0.01, z);
      rBody.position.set( doorW/2 + shift, y + doorH/2 + 0.01, z);
    };

    // f1
    const isAt1 = this.currentFloor === 1 &&
                  (this.state === 'DOORS_OPENING' || this.state === 'DOORS_OPEN' ||
                   this.state === 'DOORS_CLOSING' || this.state === 'ARRIVED');
    setPair(this.f1DoorL, this.f1DoorR, this.f1DoorLBody, this.f1DoorRBody,
            this.floorY[1], isAt1 ? openShift : 0);

    // f11
    const isAt11 = this.currentFloor === 11 &&
                   (this.state === 'DOORS_OPENING' || this.state === 'DOORS_OPEN' ||
                    this.state === 'DOORS_CLOSING' || this.state === 'ARRIVED');
    setPair(this.f11DoorL, this.f11DoorR, this.f11DoorLBody, this.f11DoorRBody,
            this.floorY[11], isAt11 ? openShift : 0);
  }


  // =====================================================
  // Tick
  // =====================================================
  update(dt) {
    // === State machine ===
    switch (this.state) {
      case 'IDLE':
        // ничего
        break;

      case 'DOORS_OPENING': {
        this.doorOpen = Math.min(1, this.doorOpen + this.doorOpenSpeed * dt);
        if (this.doorOpen >= 1) {
          this.doorOpen = 1;
          this._setState('DOORS_OPEN');
          this.openHoldTime = 0;
        }
        break;
      }

      case 'DOORS_OPEN': {
        this.openHoldTime += dt;
        if (this.openHoldTime >= this.OPEN_HOLD) {
          // никто не делал запрос — закрываем
          if (this.targetFloor === this.currentFloor) {
            this._setState('DOORS_CLOSING');
            this.doorOpenTarget = 0;
          }
        }
        break;
      }

      case 'DOORS_CLOSING': {
        this.doorOpen = Math.max(0, this.doorOpen - this.doorOpenSpeed * dt);
        if (this.doorOpen <= 0) {
          this.doorOpen = 0;
          if (this.targetFloor !== this.currentFloor) {
            this._beginMoving();
          } else {
            this._setState('IDLE');
          }
        }
        break;
      }

      case 'MOVING': {
        this.moveT += dt;
        const t = Math.min(1, this.moveT / this.moveDuration);
        const e = this._easeInOutCubic(t);
        this.cabinY = this.startY + (this.endY - this.startY) * e;

        // громкость мотора и троса — нарастает в середине, спадает к концу
        const speed01 = Math.sin(t * Math.PI);
        try {
          this.motorSound.setVolume(0.35 * speed01);
          this.cableSound.setVolume(0.25 * speed01);
        } catch(_) {}

        // обновим табло — округление до ближайшего «этажа»
        const totalDist = Math.abs(this.endY - this.startY);
        if (totalDist > 0.001) {
          const passed = Math.abs(this.cabinY - this.startY);
          const fr = passed / totalDist;
          const startF = (this.startY > this.endY) ? 11 : 1;
          const endF   = this.targetFloor;
          const cur = Math.round(startF + (endF - startF) * fr);
          this._updateDisplays(String(cur));
        }

        // в режиме глитча — мерцание света и треск
        if (this.glitchMode) {
          this.glitchTimer += dt;
          const flicker = (Math.sin(this.glitchTimer * 23) > 0.85) ? 0.05 : 1.0;
          const dropout = (this.glitchTimer % 4 < 0.15) ? 0 : 1;
          this.cabinLight.intensity = this.cabinLightBaseIntensity * flicker * dropout;
          if (Math.random() < 0.012) {
            this.audio.playOnce('sparkCrackle', this.cabin, {
              volume: 0.7, refDistance: 1.0, maxDistance: 8
            });
          }
        }

        if (t >= 1) {
          this._arrive();
        }
        break;
      }

      case 'ARRIVED':
        // ждём перехода в DOORS_OPENING (через setTimeout в _arrive)
        break;

      case 'FROZEN':
      default:
        break;
    }

    this._applyCabinTransform();
    this._applyFloorDoorsTransform();
  }
}
