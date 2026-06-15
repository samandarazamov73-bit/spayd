import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { HeadBob } from './HeadBob.js';

/**
 * Player
 * ------
 * Физика: cannon-es капсула (две сферы + цилиндр).
 * Управление: WASD, инерция, плавное наращивание скорости.
 * Камера: yaw на root, pitch на cameraHolder, поверх — head-bob offset.
 * Поворот мыши: входит как «целевой» yaw/pitch, реальный — догоняет с задержкой
 * (инерция / вес головы).
 *
 * Платформы: если игрок стоит на чём-то с userData.isMovingPlatform = true,
 * к его позиции добавляется velocity платформы (синхронное движение в лифте).
 */
export class Player {
  constructor({ scene, world, camera, audio, input }) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.audio = audio;
    this.input = input;

    this.height = 1.72;
    this.eyeHeight = 1.62;
    this.radius = 0.32;

    this.walkSpeed = 2.4;     // м/с (медленная ходьба, как в P.T.)
    this.runSpeed  = 3.6;
    this.acceleration = 12;

    // === Тело ===
    const mat = new CANNON.Material('player');
    mat.friction = 0.0;

    this.body = new CANNON.Body({
      mass: 80,
      material: mat,
      fixedRotation: true,
      linearDamping: 0.92,
      angularDamping: 1.0
    });
    // капсула = две сферы
    const r = this.radius;
    const half = (this.height - 2*r) * 0.5;
    this.body.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0,  half, 0));
    this.body.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, -half, 0));
    this.body.position.set(0, this.height, 0);
    this.world.addBody(this.body);

    // === Камера-rig ===
    // root (yaw) -> cameraHolder (pitch) -> camera
    this.root = new THREE.Object3D();
    this.cameraHolder = new THREE.Object3D();
    this.root.add(this.cameraHolder);
    this.cameraHolder.add(this.camera);
    this.scene.add(this.root);

    // углы цели (от мыши) и текущие (с инерцией)
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.yaw = 0;
    this.pitch = 0;

    // head-bob
    this.headBob = new HeadBob();
    this.headBob.onStep = () => this._playFootstep();

    // плавающая нога — для разнообразия
    this._stepBuf = 'footstepCarpet';
    this._lastStepTime = 0;

    // moving platform tracking
    this.standingOn = null;
    this._platformLastPos = new THREE.Vector3();
    this._platformDelta = new THREE.Vector3();
  }

  setPosition(x, y, z) {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.root.position.set(x, y, z);
  }

  setYaw(yaw) {
    this.yaw = this.targetYaw = yaw;
  }

  /** Какие шаги играть: 'footstepCarpet' | 'footstepHard' | 'footstepWet'. */
  setFootstepBuffer(name) {
    this._stepBuf = name;
  }

  _playFootstep() {
    // Шаги отключены — пользователю мешали постоянные звуки.
    return;
  }

  /**
   * Вход: dt и rawMouse {dx, dy} (delta в пикселях).
   */
  update(dt, mouse) {
    // === Поворот головы — целевые углы + инерция ===
    this.targetYaw   -= mouse.dx * this.input.sensitivity;
    this.targetPitch -= mouse.dy * this.input.sensitivity;
    const PIT_LIMIT = Math.PI/2 - 0.05;
    this.targetPitch = Math.max(-PIT_LIMIT, Math.min(PIT_LIMIT, this.targetPitch));

    // инерция (мягкое отставание)
    this.yaw   = THREE.MathUtils.damp(this.yaw,   this.targetYaw,   18, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 18, dt);

    // === Movement ===
    const moveVec = this.input.getMoveVector();
    const isRunning = this.input.isShift() && moveVec.lengthSq() > 0;
    const targetSpeed = (isRunning ? this.runSpeed : this.walkSpeed) * moveVec.length();

    // направление в мировых координатах (Three.js Y-rotation matrix)
    const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    const wx =  moveVec.x * cosY + moveVec.z * sinY;
    const wz = -moveVec.x * sinY + moveVec.z * cosY;

    const dir = new THREE.Vector3(wx, 0, wz);
    if (dir.lengthSq() > 0) dir.normalize();

    // целевая скорость
    const desiredVx = dir.x * targetSpeed;
    const desiredVz = dir.z * targetSpeed;

    // плавное приближение
    const v = this.body.velocity;
    v.x += (desiredVx - v.x) * Math.min(1, this.acceleration * dt);
    v.z += (desiredVz - v.z) * Math.min(1, this.acceleration * dt);

    // === Платформа: добавить дельту перемещения платформы ===
    if (this.standingOn && this.standingOn.userData.isMovingPlatform) {
      const platform = this.standingOn;
      const cur = new THREE.Vector3();
      platform.getWorldPosition(cur);
      this._platformDelta.subVectors(cur, this._platformLastPos);
      this.body.position.x += this._platformDelta.x;
      this.body.position.y += this._platformDelta.y;
      this.body.position.z += this._platformDelta.z;
      this._platformLastPos.copy(cur);
    }

    // === Синхронизация Three.js root c физическим телом ===
    this.root.position.set(
      this.body.position.x,
      this.body.position.y + this.eyeHeight - this.height/2,
      this.body.position.z
    );
    this.root.rotation.y = this.yaw;
    this.cameraHolder.rotation.x = this.pitch;

    // === Head-bob ===
    const horizSpeed = Math.hypot(v.x, v.z);
    const speed01 = Math.min(1, horizSpeed / this.walkSpeed);
    const bob = this.headBob.update(dt, speed01, isRunning);
    this.camera.position.set(bob.x, bob.y, 0);
    this.camera.rotation.z = bob.roll;
  }

  /**
   * Поставить игрока «на платформу». Передавать null чтобы снять.
   * Внутреннее состояние нужно для синхронного движения с лифтом.
   */
  setStandingOn(object3D) {
    if (this.standingOn === object3D) return;
    this.standingOn = object3D;
    if (object3D) {
      object3D.getWorldPosition(this._platformLastPos);
    }
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }

  getWorldDirection(target = new THREE.Vector3()) {
    return this.camera.getWorldDirection(target);
  }
}
