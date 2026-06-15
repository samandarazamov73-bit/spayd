import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Door
 * ----
 * Дверь на петлях с реалистичным открытием/закрытием:
 *  - hingeAxis по Y, дверь вращается на 0..maxAngle
 *  - easing easeInOutQuad для движения
 *  - звук петель при движении (loop, громкость зависит от скорости)
 *  - звук удара при полном захлопывании
 *  - kinematic CANNON-тело синхронно с поворотом
 *
 * События:
 *  - open()       — начать открытие
 *  - close()      — начать закрытие
 *  - slam()       — резко захлопнуть
 *  - lock(true)   — закрыть на замок (кликабельна, но не открывается, играет dud-звук)
 *
 * Конструктор позиционирует дверь по hinge, размерам и направлению.
 */
export class Door {
  constructor({
    scene, world, audio, materials,
    hingeWorld,           // THREE.Vector3 — позиция петли (точка вращения)
    width = 0.9,
    height = 2.0,
    thickness = 0.045,
    swingAxis = 1,        // +1 / -1 — куда открывается (по сторону X)
    initialAngle = 0,
    maxAngle = Math.PI/2 - 0.05,
    facing = 'east',      // 'east','west','north','south' — куда смотрит дверь, влияет на ориентацию пластины
    interaction,
    label = 'door'
  }) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.M = materials;
    this.hingeWorld = hingeWorld.clone();
    this.width = width;
    this.height = height;
    this.thickness = thickness;
    this.swingAxis = swingAxis;
    this.maxAngle = maxAngle;
    this.angle = initialAngle;
    this.targetAngle = initialAngle;
    this.openSpeed = 1.4;     // рад/с
    this.closing = false;
    this.locked = false;
    this.label = label;
    this.facing = facing;

    // Pivot-узел в точке петли. Дверной мэш сдвинут на +width/2 по локальному X.
    this.pivot = new THREE.Object3D();
    this.pivot.position.copy(this.hingeWorld);

    // Поворот pivot для ориентации стены: дверь номера на west-стене коридора (смотрит на восток)
    if (facing === 'east')  this.pivot.rotation.y = 0;
    if (facing === 'west')  this.pivot.rotation.y = Math.PI;
    if (facing === 'north') this.pivot.rotation.y = -Math.PI/2;
    if (facing === 'south') this.pivot.rotation.y =  Math.PI/2;

    this.scene.add(this.pivot);

    // Полотно
    const geo = new THREE.BoxGeometry(width, height, thickness);
    geo.translate(width/2 * swingAxis, 0, 0);  // петля на крае
    const door = new THREE.Mesh(geo, this.M.darkWood);
    door.castShadow = true;
    door.receiveShadow = true;
    door.position.set(0, height/2, 0);
    this.pivot.add(door);
    this.mesh = door;

    // Ручка
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 14, 10),
      this.M.brushedMetal
    );
    knob.position.set(swingAxis * (width - 0.07), 0, thickness/2 + 0.005);
    door.add(knob);

    // Интерактивность — клик по двери открывает/закрывает
    door.userData.interactable = true;
    door.userData.tag = label;
    door.userData.onInteract = () => {
      if (this.locked) {
        this.audio.playOnce('relayClick', this.pivot, { volume: 0.5, refDistance: 0.5, maxDistance: 4 });
        return;
      }
      this.toggle();
    };
    if (interaction) interaction.register(door);

    // Kinematic тело
    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(width/2, height/2, thickness/2))
    });
    this.world.addBody(this.body);

    // Звук петель (loop, громкость = функция скорости)
    this.creakSound = this.audio.attach('hingeCreak', this.pivot, {
      loop: true, volume: 0, refDistance: 1.0, rolloff: 1.6, maxDistance: 8, occludable: true
    });
    try { this.creakSound.play(); } catch(_) {}

    this._updateBody();
  }

  toggle() {
    if (this.locked) return;
    if (this.angle < this.maxAngle * 0.5) this.open(); else this.close();
  }

  open(angle) {
    if (this.locked) return;
    this.targetAngle = (angle != null) ? angle : this.maxAngle;
    this.closing = false;
  }

  close() {
    this.targetAngle = 0;
    this.closing = true;
  }

  /** Резко захлопнуть с громким звуком. */
  slam() {
    this.targetAngle = 0;
    this.closing = true;
    this.openSpeed = 6.0;
    setTimeout(() => { this.openSpeed = 1.4; }, 600);
    this._slamPending = true;
  }

  lock(value = true) {
    this.locked = value;
  }

  _updateBody() {
    // Вычислим мировую позицию центра двери (середина полотна)
    const half = this.width/2 * this.swingAxis;
    const local = new THREE.Vector3(half, this.height/2, 0);
    local.applyEuler(new THREE.Euler(0, this.angle, 0));
    const world = this.pivot.localToWorld(local.clone());

    this.body.position.set(world.x, world.y, world.z);

    // Ориентация: pivot.rotation.y + door angle вокруг Y
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(0, this.pivot.rotation.y + this.angle, 0));
    this.body.quaternion.set(q.x, q.y, q.z, q.w);
  }

  update(dt) {
    const prev = this.angle;
    const diff = this.targetAngle - this.angle;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), this.openSpeed * dt);
    this.angle += step;
    // pivot.rotation.y задано в конструкторе (facing) — не трогаем.
    // Поворот двери — относительно pivot.
    this.mesh.rotation.y = this.angle;
    this._updateBody();

    // Звук петель — пока движется
    const speed = Math.abs(this.angle - prev) / Math.max(dt, 1e-6);
    const vol = Math.min(0.4, speed * 0.6);
    try { this.creakSound.setVolume(vol); } catch(_) {}

    // Захлопывание
    if (this.closing && this.angle <= 0.001) {
      this.angle = 0;
      this.targetAngle = 0;
      this.closing = false;
      if (this._slamPending) {
        this.audio.playOnce('doorSlam', this.pivot, { volume: 0.85, refDistance: 1.2, maxDistance: 14 });
        this._slamPending = false;
      }
    }
  }
}
