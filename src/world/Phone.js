import * as THREE from 'three';

/**
 * Phone
 * -----
 * Гостиничный телефон на тумбочке.
 *  - Можно «снять трубку» (клик): останавливается звонок, играется dial tone
 *    или речевой сигнал (SpeechSynthesis API).
 *  - В акте 1 игрок звонит сам (заказ ужина) — клик по уложенной трубке.
 *  - В акте 3 звонок инициируется снаружи (ringing): на трубке мерцает индикатор,
 *    включается phoneRing loop.
 *
 * Состояния:
 *   IDLE — лежит на базе, тихо
 *   RINGING — звонит входящий
 *   IN_CALL — игрок поднял трубку
 *
 * События:
 *   onPickup(callback) — снаружи реагирует ActManager.
 *   onPlaceCall(callback) — игрок инициирует исходящий.
 */
export class Phone {
  constructor({ scene, audio, materials, position, interaction, assets }) {
    this.scene = scene;
    this.audio = audio;
    this.M = materials;
    this.assets = assets;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.scene.add(this.group);

    // База телефона
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.05, 0.16),
      this.M.blackPlastic
    );
    base.position.y = 0.025;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    // Кнопочное поле
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(0.10, 0.13),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.2 })
    );
    pad.rotation.x = -Math.PI/2;
    pad.position.set(0.04, 0.051, 0);
    this.group.add(pad);
    // Мини «индикатор линии» — будет мерцать когда звонит
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0x300000, emissive: 0xff2020, emissiveIntensity: 0.0, roughness: 0.4
      })
    );
    led.position.set(-0.085, 0.052, -0.06);
    this.group.add(led);
    this.led = led;

    // Трубка
    const handsetGeo = new THREE.BoxGeometry(0.18, 0.04, 0.05);
    const handset = new THREE.Mesh(handsetGeo, this.M.blackPlastic);
    handset.position.set(-0.02, 0.075, 0);
    handset.castShadow = true;
    this.group.add(handset);
    this.handset = handset;
    this._handsetBaseY = handset.position.y;

    // Интерактивность
    base.userData.interactable = true;
    base.userData.tag = 'phone';
    base.userData.onInteract = () => this._onClick();
    handset.userData.interactable = true;
    handset.userData.tag = 'phone';
    handset.userData.onInteract = () => this._onClick();
    if (interaction) {
      interaction.register(base);
      interaction.register(handset);
    }

    // Состояние и звуки
    this.state = 'IDLE';
    this.ringSound = this.audio.attach('phoneRing', this.group, {
      loop: true, volume: 0.0, refDistance: 0.6, rolloff: 1.6, maxDistance: 14, occludable: true
    });
    try { this.ringSound.play(); } catch(_) {}

    this._pickupCb = null;
    this._placeCallCb = null;
  }

  onPickup(cb) { this._pickupCb = cb; }
  onPlaceCall(cb) { this._placeCallCb = cb; }

  _onClick() {
    if (this.state === 'RINGING') {
      this.pickup();
      if (this._pickupCb) this._pickupCb();
    } else if (this.state === 'IDLE') {
      // Игрок инициирует исходящий звонок (только если разрешено сценарием)
      if (this._placeCallCb) {
        this.audio.playOnce('dialTone', this.group, { volume: 0.5, refDistance: 0.4, maxDistance: 4 });
        this._placeCallCb();
      }
    } else if (this.state === 'IN_CALL') {
      this.hangup();
    }
  }

  ring() {
    if (this.state === 'RINGING') return;
    this.state = 'RINGING';
    try { this.ringSound.setVolume(0.55); } catch(_) {}
    this._ringStarted = performance.now();
  }

  pickup() {
    if (this.state !== 'RINGING') return;
    this.state = 'IN_CALL';
    try { this.ringSound.setVolume(0); } catch(_) {}
    // Поднять трубку визуально
    this.handset.position.y = this._handsetBaseY + 0.04;
  }

  hangup() {
    this.state = 'IDLE';
    try { this.ringSound.setVolume(0); } catch(_) {}
    this.handset.position.y = this._handsetBaseY;
    if (this._speech) {
      window.speechSynthesis.cancel();
      this._speech = null;
    }
  }

  /**
   * Голос «оператора»: использует SpeechSynthesis API.
   * Возвращает Promise, разрешающийся когда речь закончится.
   */
  speak(text, { rate = 0.95, pitch = 0.85, voice = null } = {}) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.pitch = pitch;
      u.volume = 1.0;
      // Попытка выбрать русский голос, иначе любой
      const voices = window.speechSynthesis.getVoices();
      const ru = voices.find(v => /ru/i.test(v.lang));
      if (ru) u.voice = ru;
      else if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this._speech = u;
      window.speechSynthesis.speak(u);
    });
  }

  update(dt) {
    if (this.state === 'RINGING') {
      // Мерцание LED
      const t = (performance.now() - this._ringStarted) * 0.001;
      const k = (Math.sin(t * 8) > 0) ? 1.5 : 0.0;
      this.led.material.emissiveIntensity = k;
    } else {
      this.led.material.emissiveIntensity = THREE.MathUtils.damp(
        this.led.material.emissiveIntensity, 0, 6, dt
      );
    }
  }
}
