import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { createRenderer }   from './core/Renderer.js';
import { PostProcessing }   from './core/PostProcessing.js';
import { AudioManager }     from './core/AudioManager.js';
import { InputManager }     from './core/InputManager.js';
import { AssetLoader }      from './core/AssetLoader.js';

import { Player }           from './player/Player.js';
import { Interaction }      from './player/Interaction.js';

import { Materials }        from './world/Materials.js';
import { Hotel }            from './world/Hotel.js';
import { Elevator }         from './world/Elevator.js';
import { Door }             from './world/Door.js';
import { TV }               from './world/TV.js';
import { Phone }            from './world/Phone.js';

import { ActManager }       from './story/ActManager.js';

/**
 * Game
 * ----
 * Главный оркестратор. Создаёт сцену, мир физики, рендер,
 * пост-обработку и все игровые объекты. Цикл рендера выполняет:
 *   1) обновление кинематических тел (лифт, двери)
 *   2) шаг физики (cannon-es) с фиксированной частотой
 *   3) обновление визуальных трансформов от тел
 *   4) обновление систем: ТВ, телефон, постобработка
 *   5) обновление Act менеджера (сюжет)
 *   6) рендер
 */
export class Game {
  constructor(canvasParent, crosshairEl) {
    // ===== THREE сцена =====
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.012);

    this.camera = new THREE.PerspectiveCamera(
      72, window.innerWidth / window.innerHeight, 0.05, 80
    );

    this.renderer = createRenderer(canvasParent);

    // ===== Физика =====
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
      allowSleep: true
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 8;
    this.world.defaultContactMaterial.friction = 0.0;
    this.world.defaultContactMaterial.restitution = 0.0;

    // ===== Системы =====
    this.assets = new AssetLoader(this.renderer);
    this.input  = new InputManager(this.renderer.domElement);
    this.audio  = new AudioManager(this.camera);

    // ===== Пост-обработка =====
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);

    // ===== Взаимодействие =====
    this.interaction = new Interaction({
      camera: this.camera, scene: this.scene, crosshairEl, maxDistance: 2.6
    });

    // ===== Игрок =====
    this.player = new Player({
      scene: this.scene, world: this.world,
      camera: this.camera, audio: this.audio, input: this.input
    });

    // ===== Мир =====
    this.hotel = new Hotel({
      scene: this.scene, world: this.world,
      assets: this.assets, audio: this.audio,
      interaction: this.interaction
    });
    this.materials = this.hotel.M;

    // Стартовая позиция игрока — в номере 1107
    const start = this.hotel.getPlayerStart();
    this.player.setPosition(start.x, start.y, start.z);
    this.player.setYaw(-Math.PI/2);  // лицом на восток — к ТВ и двери в коридор

    // ===== Лифт =====
    this.elevator = new Elevator({
      scene: this.scene, world: this.world,
      audio: this.audio, assets: this.assets,
      hotel: this.hotel, interaction: this.interaction,
      materials: this.materials
    });

    // ===== Двери =====
    this.roomDoor = new Door({
      scene: this.scene, world: this.world, audio: this.audio,
      materials: this.materials,
      hingeWorld: this.hotel.roomDoorHinge,
      width: this.hotel.roomDoorWidth,
      height: this.hotel.DOOR_HEIGHT - 0.02,
      swingAxis: +1,
      facing: 'south',                    // pivot.rotation.y = +PI/2
      maxAngle: Math.PI/2 - 0.05,
      interaction: this.interaction,
      label: 'roomDoor'
    });

    this.bathroomDoor = new Door({
      scene: this.scene, world: this.world, audio: this.audio,
      materials: this.materials,
      hingeWorld: this.hotel.bathroomDoorHinge,
      width: this.hotel.bathroomDoorWidth,
      height: this.hotel.DOOR_HEIGHT - 0.02,
      swingAxis: +1,
      facing: 'west',                     // pivot.rotation.y = +PI; открывается в комнату
      maxAngle: Math.PI/2 - 0.05,
      interaction: this.interaction,
      label: 'bathroomDoor'
    });

    // ===== ТВ =====
    this.tv = new TV({
      scene: this.scene, audio: this.audio, materials: this.materials,
      position: this.hotel.tvPos, facing: 'east',
      width: 1.05, height: 0.6,
      interaction: this.interaction
    });

    // ===== Телефон =====
    this.phone = new Phone({
      scene: this.scene, audio: this.audio, materials: this.materials,
      assets: this.assets,
      position: this.hotel.phonePos,
      interaction: this.interaction
    });

    // ===== Окклюзия аудио (учёт стен между источником и слушателем) =====
    this.audio.setOcclusionTester((src, lst) => this.hotel.isOccluded(src, lst));

    // ===== Менеджер актов =====
    this.acts = new ActManager({
      scene: this.scene, audio: this.audio, post: this.post,
      hotel: this.hotel, elevator: this.elevator,
      roomDoor: this.roomDoor, bathroomDoor: this.bathroomDoor,
      tv: this.tv, phone: this.phone, player: this.player
    });

    // ===== Состояние цикла =====
    this._running = false;
    this._lastTime = 0;
    this._fixedDt = 1/60;
    this._accum = 0;

    // ===== Капля света от луны / на всякий случай =====
    const moon = new THREE.DirectionalLight(0x6080a0, 0.0);   // 0 — мы в помещении
    this.scene.add(moon);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now() / 1000;
    this.audio.resume();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  _tick() {
    if (!this._running) return;
    const now = performance.now() / 1000;
    let dt = now - this._lastTime;
    this._lastTime = now;
    if (dt > 0.1) dt = 0.1;

    // === 1. Кинематические тела ===
    this.elevator.update(dt);
    this.roomDoor.update(dt);
    this.bathroomDoor.update(dt);

    // === 2. Игрок: ввод и подготовка ===
    const mouse = this.input.consume();
    this.player.update(dt, mouse);

    // standing-on platform — кабина лифта
    const playerPos = new THREE.Vector3(
      this.player.body.position.x,
      this.player.body.position.y,
      this.player.body.position.z
    );
    if (this.elevator.isPlayerInside(playerPos)) {
      this.player.setStandingOn(this.elevator.cabin);
    } else {
      this.player.setStandingOn(null);
    }

    // === 3. Физика ===
    // Делаем фиксированный шаг 60Гц для стабильности
    this._accum += dt;
    let safety = 5;
    while (this._accum >= this._fixedDt && safety-- > 0) {
      this.world.step(this._fixedDt);
      this._accum -= this._fixedDt;
    }

    // === 4. Звук / интеракция / визуальные системы ===
    const click = mouse.click;
    this.interaction.update(this.player, click);

    this.tv.update(dt);
    this.phone.update(dt);

    // === 5. Сюжет ===
    this.acts.update(dt);

    // === 6. Аудио (occlusion damping) ===
    const lst = new THREE.Vector3();
    this.camera.getWorldPosition(lst);
    this.audio.update(dt, lst);

    // === 7. Рендер ===
    this.post.render(dt);

    requestAnimationFrame(this._tick);
  }
}
