import * as THREE from 'three';

/**
 * ActManager
 * ----------
 * Машина состояний сюжета на 4 акта.
 *
 * Принимает ссылки на все игровые системы и каждый кадр получает
 * позицию игрока. Использует комбинацию позиционных триггеров и
 * таймеров для перехода между фазами.
 *
 * Все «UI-сообщения» — только диегетические: звонки, голоса, звуки,
 * освещение, движение лифта. Никаких 2D-текстов на экране.
 */
export class ActManager {
  constructor({
    scene, audio, post, hotel, elevator,
    roomDoor, bathroomDoor, tv, phone, player
  }) {
    this.scene    = scene;
    this.audio    = audio;
    this.post     = post;
    this.hotel    = hotel;
    this.elevator = elevator;
    this.roomDoor = roomDoor;
    this.bathroomDoor = bathroomDoor;
    this.tv       = tv;
    this.phone    = phone;
    this.player   = player;

    this.act = 1;
    this.phase = 'A1_INTRO';
    this.timer = 0;
    this._phaseStartTime = 0;

    this._horrorTarget = 0.0;       // куда мы хотим вытянуть пост-обработку
    this._horrorCurrent = 0.0;

    // Глобальный «room tone» — фоновый гул вентиляции (очень тихий)
    this.roomTone = this.audio.attach('roomTone', this.player.root, {
      loop: true, volume: 0.05, refDistance: 1, rolloff: 0.0, maxDistance: 50
    });
    try { this.roomTone.play(); } catch(_) {}

    // Сердцебиение и дрон — НЕ играют автоматически. Стартуют только в актах 3-4.
    this.heartbeat = this.audio.attach('heartbeat', this.player.root, {
      loop: true, volume: 0, refDistance: 1, rolloff: 0.0, maxDistance: 5
    });
    this.finalDrone = this.audio.attach('deepDrone', this.player.root, {
      loop: true, volume: 0, refDistance: 1, rolloff: 0.0, maxDistance: 50
    });

    // Состояние, которое запоминаем
    this.flags = {
      orderPlaced: false,
      foodPicked: false,
      tvWatched: false,
      phoneAct3Picked: false,
      backToLobby: false
    };

    // Подключим колбэки для интеракций телефона и ТВ
    this._wirePhone();
    this._wireFoodBag();
    this._wireTV();

    // Стартовый ambient — мягкое лёгкое затемнение
    this.post.setHorrorLevel(0.0);

    // Запустим первую фазу
    this._enterPhase('A1_INTRO');
  }

  // =====================================================
  // Внешний tick
  // =====================================================
  update(dt) {
    this.timer += dt;

    // Сглаженный horror level
    this._horrorCurrent = THREE.MathUtils.damp(this._horrorCurrent, this._horrorTarget, 1.6, dt);
    this.post.setHorrorLevel(this._horrorCurrent);

    const p = this.player.getWorldPosition(new THREE.Vector3());

    switch (this.phase) {
      case 'A1_INTRO':           this._tickA1Intro(dt, p); break;
      case 'A1_WAIT_LEAVE':      this._tickA1WaitLeave(dt, p); break;
      case 'A1_GO_DOWN':         this._tickA1GoDown(dt, p); break;
      case 'A1_LOBBY':           this._tickA1Lobby(dt, p); break;
      case 'A1_RETURN':          this._tickA1Return(dt, p); break;

      case 'A2_SETTLED':         this._tickA2Settled(dt, p); break;
      case 'A2_WATCHING':        this._tickA2Watching(dt, p); break;

      case 'A3_RING':            this._tickA3Ring(dt, p); break;
      case 'A3_LEAVING':         this._tickA3Leaving(dt, p); break;
      case 'A3_LOBBY_EMPTY':     this._tickA3LobbyEmpty(dt, p); break;

      case 'A4_ELEVATOR':        this._tickA4Elevator(dt, p); break;
      case 'A4_DISTORTED':       this._tickA4Distorted(dt, p); break;
      case 'A4_ROOM':            this._tickA4Room(dt, p); break;
      case 'A4_FINAL':           this._tickA4Final(dt, p); break;
      case 'END':                this._tickEnd(dt, p); break;
    }
  }

  _enterPhase(name) {
    this.phase = name;
    this.timer = 0;
    this._phaseStartTime = performance.now();
    if (this[`_enter_${name}`]) this[`_enter_${name}`]();
  }


  // =====================================================
  // Подключение колбэков
  // =====================================================
  _wirePhone() {
    this.phone.onPlaceCall(async () => {
      // Доступно только в A1_INTRO
      if (this.phase !== 'A1_INTRO') return;
      this.flags.orderPlaced = true;
      // Симулируем гудок и короткий «диалог»
      await new Promise(r => setTimeout(r, 800));
      await this.phone.speak('Регистратура. Добрый вечер.', { rate: 0.95, pitch: 0.85 });
      await new Promise(r => setTimeout(r, 400));
      await this.phone.speak('Один сэндвич клаб и вода. В номер одиннадцать ноль семь.', { rate: 0.92, pitch: 1.0 });
      await new Promise(r => setTimeout(r, 600));
      await this.phone.speak('Спасибо. Доставка к стойке регистрации, пятнадцать минут.', { rate: 0.95, pitch: 0.85 });
      this._enterPhase('A1_WAIT_LEAVE');
    });

    this.phone.onPickup(async () => {
      // Это входящий звонок — Акт 3
      if (this.phase !== 'A3_RING') return;
      this.flags.phoneAct3Picked = true;
      await new Promise(r => setTimeout(r, 700));
      await this.phone.speak('Извините за беспокойство.', { rate: 0.85, pitch: 0.7 });
      await new Promise(r => setTimeout(r, 600));
      await this.phone.speak('Курьер забыл отдать вам напиток. Спуститесь в лобби, пожалуйста.', { rate: 0.85, pitch: 0.7 });
      await new Promise(r => setTimeout(r, 1200));
      await this.phone.speak('Пожалуйста.', { rate: 0.7, pitch: 0.55 });
      this.phone.hangup();
      this._enterPhase('A3_LEAVING');
    });
  }

  _wireFoodBag() {
    this.hotel.foodBag.userData.onInteract = () => {
      if (this.phase !== 'A1_LOBBY') return;
      this.audio.playOnce('relayClick', this.hotel.foodBag, { volume: 0.4, refDistance: 0.5, maxDistance: 4 });
      this.hotel.foodBag.visible = false;
      this.flags.foodPicked = true;
      this._enterPhase('A1_RETURN');
    };
  }

  _wireTV() {
    // TV.userData.onInteract уже стоит; нам важно знать «когда впервые включили»
    const origScreenOnInteract = this.tv.screen.userData.onInteract;
    this.tv.screen.userData.onInteract = () => {
      origScreenOnInteract && origScreenOnInteract();
      if (this.tv.on && !this.flags.tvWatched && this.phase === 'A2_SETTLED') {
        this.flags.tvWatched = true;
        this._enterPhase('A2_WATCHING');
      }
    };
  }

  // =====================================================
  // Утилиты — позиционные триггеры
  // =====================================================
  _isInRoom(p) {
    return this.hotel.roomBounds.containsPoint(p);
  }
  _isInCorridor11(p) {
    return p.y > this.hotel.FLOOR_11_Y - 0.5 &&
           p.y < this.hotel.FLOOR_11_Y + 2.6 &&
           Math.abs(p.x) < this.hotel.CORRIDOR_HALF_X + 0.2 &&
           Math.abs(p.z) < this.hotel.CORRIDOR_HALF_Z + 0.2;
  }
  _isInLobby(p) {
    return p.y < 1.5 &&
           p.x > -5.2 && p.x < 5.2 &&
           p.z > -3.2 && p.z < 7.2;
  }
  _isInElevator(p) {
    return this.elevator.isPlayerInside(p);
  }
  _distanceTo(p, target) {
    return p.distanceTo(target);
  }


  // =====================================================
  // ACT 1
  // =====================================================
  _enter_A1_INTRO() {
    this.act = 1;
    this._horrorTarget = 0.0;
    // дверь номера закрыта, не заперта; ванна закрыта
    this.roomDoor.close();
    this.bathroomDoor.close();
    // лифт стоит на 11 — двери закрыты
    // фон уверенно тёплый
  }

  _tickA1Intro(dt, p) {
    // Ждём пока игрок не позвонит. Ничего не дёргаем.
  }

  _enter_A1_WAIT_LEAVE() {
    // Игрок «заказал». Через ~5 сек включим небольшой намёк — лифт ждёт.
    // Но без UI-подсказок — просто разрешаем выходить.
  }

  _tickA1WaitLeave(dt, p) {
    // Если игрок открыл дверь номера и пошёл в коридор — переходим
    if (this._isInCorridor11(p)) {
      this._enterPhase('A1_GO_DOWN');
    }
  }

  _enter_A1_GO_DOWN() {
    // ничего особенного: лифт и так доступен
  }

  _tickA1GoDown(dt, p) {
    // Когда игрок физически в кабине и кабина движется к 1
    if (this.elevator.currentFloor === 1 && this.elevator.state === 'DOORS_OPEN') {
      // Показываем пакет с едой
      this.hotel.foodBag.visible = true;
      this._enterPhase('A1_LOBBY');
    }
  }

  _enter_A1_LOBBY() {
    // Сменим звук шагов на твёрдый мрамор
    this.player.setFootstepBuffer('footstepHard');
  }

  _tickA1Lobby(dt, p) {
    // Ждём пика пакета — это произойдёт через onInteract. Смотри _wireFoodBag().
  }

  _enter_A1_RETURN() {
    // Пакет взят — игрок должен вернуться к лифту и подняться на 11.
  }

  _tickA1Return(dt, p) {
    // Когда лифт прибыл на 11 и игрок вышел в коридор
    if (this.elevator.currentFloor === 11 &&
        this.elevator.state === 'DOORS_OPEN' &&
        this._isInCorridor11(p)) {
      // Сменим звук шагов на ковёр
      this.player.setFootstepBuffer('footstepCarpet');
      // Ничего больше не делаем — ждём заход в комнату
    }

    // Когда игрок вошёл в номер 1107
    if (this._isInRoom(p)) {
      this._enterPhase('A2_SETTLED');
    }
  }

  // =====================================================
  // ACT 2
  // =====================================================
  _enter_A2_SETTLED() {
    this.act = 2;
    this._horrorTarget = 0.05;
    // Через 1 секунду — дверь номера автоматически захлопывается за спиной
    setTimeout(() => {
      this.roomDoor.slam();
    }, 900);
  }

  _tickA2Settled(dt, p) {
    // Ждём, пока игрок включит ТВ. Триггер — _wireTV().
    // Если игрок долго стоит, можем подсветить ТВ слабым гулом? Уже есть tvHum.
    // Ничего иначе не делаем.
  }

  _enter_A2_WATCHING() {
    // Лёгкое нагнетание — атмосферный гул сильнее, чуть пост-обработки
    this._horrorTarget = 0.15;
    // Через 22 секунды — звонок на телефон
    this._a2Timeout = setTimeout(() => {
      if (this.phase === 'A2_WATCHING') {
        this.phone.ring();
        this._enterPhase('A3_RING');
      }
    }, 22000);
  }

  _tickA2Watching(dt, p) {
    // Слегка модулировать room tone в зависимости от близости к ТВ
    const tvWorld = new THREE.Vector3();
    this.tv.group.getWorldPosition(tvWorld);
    const d = p.distanceTo(tvWorld);
    if (this.roomTone) {
      try { this.roomTone.setVolume(0.16 + Math.max(0, 1 - d/4) * 0.04); } catch(_) {}
    }
  }


  // =====================================================
  // ACT 3
  // =====================================================
  _enter_A3_RING() {
    this.act = 3;
    this._horrorTarget = 0.30;
    // звонок уже инициирован
  }

  _tickA3Ring(dt, p) {
    // Если игрок не подходит долго — звонок продолжается. Триггер на pickup в _wirePhone.
    // На случай если игрок проигнорирует — после 30с принудительно идём дальше
    if (this.timer > 30 && !this.flags.phoneAct3Picked) {
      this.phone.hangup();
      this._enterPhase('A3_LEAVING');
    }
  }

  _enter_A3_LEAVING() {
    // Дверь номера остаётся приоткрытой — для эффекта «полоска света падает в коридор»
    setTimeout(() => {
      this.roomDoor.open(0.35);
    }, 400);
    // Постепенно гасим room tone — мир «затихает»
    this._fadeRoomToneTarget = 0.08;
    this._horrorTarget = 0.40;
  }

  _tickA3Leaving(dt, p) {
    // Затухание комнатного тона — пока игрок идёт к лифту/спускается
    if (this.roomTone) {
      const cur = this.roomTone.getVolume();
      const target = this._fadeRoomToneTarget ?? 0.08;
      try { this.roomTone.setVolume(THREE.MathUtils.damp(cur, target, 0.6, dt)); } catch(_) {}
    }
    // Когда лифт прибыл в лобби и двери открыты — переходим
    if (this.elevator.currentFloor === 1 && this.elevator.state === 'DOORS_OPEN') {
      this._enterPhase('A3_LOBBY_EMPTY');
    }
  }

  _enter_A3_LOBBY_EMPTY() {
    this._horrorTarget = 0.55;

    // Звук шагов: твёрдый мрамор, но с эхом не делаем — слишком сложно. Просто меняем буфер.
    this.player.setFootstepBuffer('footstepHard');

    // Полная тишина: глушим room tone до нуля и большинство ламп лобби
    try { this.roomTone.setVolume(0); } catch(_) {}

    // Заприть выходные двери
    // (пометим в Game.js: эти меши уже статичны — открыть нельзя в любом случае,
    //  но если бы были интерактивны — здесь lock)

    // Гасим лобби-лампы до 30% и охлаждаем оттенок
    for (const lamp of this.hotel.lobbyLights) {
      lamp.userData._origIntensity = lamp.intensity;
      lamp.intensity *= 0.35;
      lamp.color.setHex(0xc6c8d0);
    }
    this.hotel.lobbyAmbient.intensity = 0.30;

    // Пакет на тумбе исчезает (его уже нет с акта 1)
    if (this.hotel.foodBag) this.hotel.foodBag.visible = false;

    // Включить медленное сердцебиение — еле-еле
    try { if (!this.heartbeat.isPlaying) this.heartbeat.play(); this.heartbeat.setVolume(0.20); } catch(_) {}
  }

  _tickA3LobbyEmpty(dt, p) {
    // Когда игрок снова заходит в кабину и нажмёт «11» — лифт начнёт ехать.
    // Это будет MOVING с targetFloor=11.
    if (this.elevator.state === 'MOVING' &&
        this.elevator.targetFloor === 11 &&
        this._isInElevator(p)) {
      this.elevator.setGlitchMode(true);
      // дополнительно делаем поездку ДОЛГОЙ
      this.elevator.moveDuration = 18.0;
      this._enterPhase('A4_ELEVATOR');
    }
  }

  // =====================================================
  // ACT 4
  // =====================================================
  _enter_A4_ELEVATOR() {
    this.act = 4;
    this._horrorTarget = 0.70;
    try { if (!this.heartbeat.isPlaying) this.heartbeat.play(); this.heartbeat.setVolume(0.45); } catch(_) {}

    // На середине поездки — короткий полный блэкаут света кабины
    setTimeout(() => {
      if (this.phase === 'A4_ELEVATOR' && this.elevator.cabinLight) {
        const orig = this.elevator.cabinLightBaseIntensity;
        this.elevator.cabinLight.intensity = 0;
        this.audio.playOnce('sparkCrackle', this.elevator.cabin, {
          volume: 0.9, refDistance: 0.6, maxDistance: 6
        });
        setTimeout(() => {
          if (this.elevator.cabinLight) this.elevator.cabinLight.intensity = orig;
        }, 1600);
      }
    }, 7000);
  }

  _tickA4Elevator(dt, p) {
    // Когда лифт прибыл на 11 — обстановка резко меняется
    if (this.elevator.currentFloor === 11 &&
        (this.elevator.state === 'DOORS_OPENING' || this.elevator.state === 'DOORS_OPEN')) {
      this._enterPhase('A4_DISTORTED');
    }
  }


  _enter_A4_DISTORTED() {
    this._horrorTarget = 0.85;

    // Подменяем освещение коридора 11 этажа: тускло-красное, мерцающее
    for (const light of this.hotel.corridorLights) {
      light.userData._origColor = light.color.getHex();
      light.userData._origIntensity = light.intensity;
      light.color.setHex(0xff1010);
      light.intensity = 10;
    }
    for (const tube of this.hotel.corridorTubes) {
      tube.material = tube.material.clone();
      tube.material.emissive = new THREE.Color(0xff2020);
      tube.material.emissiveIntensity = 0.6;
      tube.material.color = new THREE.Color(0x441515);
    }
    // Усиливаем коридорный ambient в красноту
    this.hotel.corridorAmbient.color.setHex(0x300808);
    this.hotel.corridorAmbient.intensity = 0.25;

    // Дверь номера сразу распахивается
    setTimeout(() => {
      this.roomDoor.open(Math.PI/2 - 0.05);
    }, 800);

    // Звук тяжёлого низкого дрона нарастает
    try { if (!this.finalDrone.isPlaying) this.finalDrone.play(); this.finalDrone.setVolume(0.45); } catch(_) {}
    try { if (!this.heartbeat.isPlaying) this.heartbeat.play();  this.heartbeat.setVolume(0.55); } catch(_) {}

    // Глюк ТВ заранее
    setTimeout(() => this.tv.setGlitch(true), 1200);
  }

  _tickA4Distorted(dt, p) {
    // Когда игрок входит в комнату — переходим к финалу в комнате
    if (this._isInRoom(p)) {
      this._enterPhase('A4_ROOM');
    }
  }

  _enter_A4_ROOM() {
    this._horrorTarget = 0.95;
    try { if (!this.finalDrone.isPlaying) this.finalDrone.play(); this.finalDrone.setVolume(0.75); } catch(_) {}
    try { if (!this.heartbeat.isPlaying) this.heartbeat.play();  this.heartbeat.setVolume(0.7); } catch(_) {}

    // Гасим лампу у кровати и оставляем только цвет ТВ
    if (this.hotel.bedLight) {
      this.hotel.bedLight.intensity = 1.5;
      this.hotel.bedLight.color.setHex(0x442020);
    }

    // Через 2.5 секунды — ванная резко открывается
    setTimeout(() => {
      this.bathroomDoor.open(Math.PI/2 - 0.05);
      this.audio.playOnce('doorSlam', this.bathroomDoor.pivot, {
        volume: 0.9, refDistance: 1, maxDistance: 12
      });
      this._startWetSteps();
    }, 2500);
  }

  _startWetSteps() {
    // Создаём «преследователя»: невидимый Object3D, движущийся от ванной к игроку.
    // Каждые ~0.7 секунды воспроизводит влажный шаг.
    const stalker = new THREE.Object3D();
    const start = this.hotel.bathroomDoorPos.clone();
    start.y = this.hotel.FLOOR_11_Y + 0.1;
    // Путь начинается у ванной, в локальных координатах номера; добавим world offset
    stalker.position.copy(start);
    this.scene.add(stalker);
    this._stalker = stalker;
    this._stalkerSpeed = 0.55;       // м/с — медленно, тяжело
    this._stalkerStepTimer = 0;
    this._stalkerActive = true;

    this._enterPhase('A4_FINAL');
  }

  _tickA4Room(dt, p) {
    // ничего, ждём _startWetSteps()
  }

  _tickA4Final(dt, p) {
    // Двигаем сталкера к игроку
    if (this._stalker && this._stalkerActive) {
      const target = p.clone();
      target.y = this._stalker.position.y;  // сохраняем уровень пола
      const dir = new THREE.Vector3().subVectors(target, this._stalker.position);
      const dist = dir.length();
      if (dist > 0.2) {
        dir.normalize().multiplyScalar(this._stalkerSpeed * dt);
        this._stalker.position.add(dir);
      }
      // Шаг
      this._stalkerStepTimer += dt;
      if (this._stalkerStepTimer > 0.75) {
        this._stalkerStepTimer = 0;
        this.audio.playOnce('footstepWet', this._stalker, {
          volume: 0.85, refDistance: 1.0, rolloff: 1.6, maxDistance: 18
        });
      }

      // Близкий — финал
      if (dist < 0.6) {
        this._stalkerActive = false;
        this._enterPhase('END');
      }
    }

    // Постепенно горим до 1
    this._horrorTarget = Math.min(1.0, this._horrorTarget + dt * 0.05);
  }

  _enter_END() {
    // Резкий обрыв всего звука и вспышка чёрного
    try { this.finalDrone.setVolume(0); } catch(_) {}
    try { this.heartbeat.setVolume(0); } catch(_) {}
    try { this.roomTone.setVolume(0); } catch(_) {}
    this.tv.off();
    this._horrorTarget = 1.0;

    // Чёрный экран — оверлей DOM
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; background:#000; z-index:99999;
      opacity:0; transition:opacity 1.4s ease;
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });
  }

  _tickEnd(dt, p) {
    // ничего больше
  }
}
