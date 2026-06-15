import * as THREE from 'three';

/**
 * AudioManager
 * ------------
 * Полностью процедурная аудио-система. Не использует внешние файлы.
 *
 * - THREE.AudioListener закрепляется к камере игрока.
 * - Все «3D»-источники — THREE.PositionalAudio с inverse-distance моделью
 *   (затухание по расстоянию, рефракция через rolloffFactor).
 * - Эмулируется приглушение за дверями ("occlusion"): к источнику применяется
 *   динамический BiquadFilter (low-pass), частота среза которого опускается,
 *   когда между игроком и источником есть «стена» (запрос к game.isOccluded).
 *
 * Звуки генерируются через короткие AudioBuffer-ы (шумы, оболочки ADSR,
 * ring-модуляции). Это даёт «настоящие» гул лампы, дроны, звон лифта и т.п.
 */
export class AudioManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;

    this.buffers = {};
    this.allSources = [];       // все созданные PositionalAudio (для occlusion-апдейта)
    this.occluders = null;      // function(worldPos): bool — задаётся снаружи
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;

    this._buildBuffers();
  }

  resume() {
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  // ---------- Генерация буферов ----------

  _noise(seconds, type = 'white') {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      // Voss-McCartney
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < len; i++) {
        const w = Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
        b6 = w*0.115926;
      }
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random()*2-1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  /**
   * Бесшовный лооп: сглаживает первые и последние N сэмплов кросс-фейдом,
   * чтобы на границе луппа не было щелчков. Применяется к буферу in-place.
   */
  _seamlessLoop(buf, fadeMs = 80) {
    const sr = this.ctx.sampleRate;
    const fade = Math.min(Math.floor(sr * fadeMs / 1000), Math.floor(buf.length / 4));
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      const N = d.length;
      // Кросс-фейд: первые fade сэмплов = mix(end, start)
      for (let i = 0; i < fade; i++) {
        const k = i / fade;             // 0..1
        const headSample = d[i];
        const tailSample = d[N - fade + i];
        d[i] = headSample * k + tailSample * (1 - k);
      }
      // И симметрично затухаем хвост в ту же смесь — так стык станет идентичным
      for (let i = 0; i < fade; i++) {
        d[N - fade + i] = d[i];
      }
    }
    return buf;
  }

  _tone(seconds, freqFn, ampFn, harmonics = 1) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = freqFn(t);
      phase += (2 * Math.PI * f) / sr;
      let s = 0;
      for (let h = 1; h <= harmonics; h++) {
        s += Math.sin(phase * h) / h;
      }
      d[i] = s * ampFn(t);
    }
    return buf;
  }

  _buildBuffers() {
    // === Гул вентиляции / room tone (бесконечный лооп) ===
    // Коричневый шум + мягкий бэндпасс — глубокий низ комнаты.
    this.buffers.roomTone = this._seamlessLoop(this._noise(8.0, 'brown'), 200);

    // === Гул люминесцентной лампы (60Hz + гармоники + лёгкое биение) ===
    this.buffers.lampHum = this._seamlessLoop(this._tone(
      4.0,
      () => 60,
      (t) => 0.18 * (1 + 0.05 * Math.sin(2 * Math.PI * 7 * t)),
      4
    ), 100);

    // === ТВ — мягкий статичный гул (без резких 15.7кГц) ===
    this.buffers.tvHum = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 4);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // тёплый низкочастотный гул + лёгкая статика
        const hum = 0.06 * Math.sin(2 * Math.PI * 120 * t);
        const noise = (Math.random() * 2 - 1) * 0.025;
        d[i] = hum + noise;
      }
      return this._seamlessLoop(buf, 150);
    })();

    // === Шаг (по ковру, мягкий) ===
    this.buffers.footstepCarpet = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.20);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 25);
        d[i] = ((Math.random()*2-1) * 0.7 + Math.sin(2*Math.PI*80*t)*0.3) * env;
      }
      return buf;
    })();

    // === Шаг (по плитке/мрамору лобби) ===
    this.buffers.footstepHard = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.25);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 18);
        d[i] = (
          (Math.random()*2-1) * 0.5 +
          Math.sin(2*Math.PI*180*t) * 0.4 +
          Math.sin(2*Math.PI*450*t) * 0.2
        ) * env;
      }
      return buf;
    })();

    // === Тяжёлый влажный шаг (финал) ===
    this.buffers.footstepWet = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.55);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 5);
        const thump = Math.sin(2*Math.PI*45*t) * 0.6;
        const splat = (Math.random()*2-1) * 0.4 * Math.exp(-t * 30);
        d[i] = (thump + splat) * env;
      }
      return buf;
    })();

    // === Звон лифта (ding) ===
    this.buffers.ding = this._tone(
      1.5,
      () => 1760,
      (t) => Math.exp(-t * 3.0) * 0.6
    );

    // === Щелчок реле ===
    this.buffers.relayClick = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.08);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 80);
        d[i] = ((Math.random()*2-1) * 0.8 + Math.sin(2*Math.PI*1200*t)*0.4) * env;
      }
      return buf;
    })();

    // === Щелчок кнопки ===
    this.buffers.buttonClick = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.05);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 90);
        d[i] = (Math.sin(2*Math.PI*2200*t) + (Math.random()*2-1)*0.3) * env * 0.6;
      }
      return buf;
    })();

    // === Гул мотора лифта / трос (низкий дрон) ===
    this.buffers.elevatorMotor = this._seamlessLoop(this._tone(
      4.0,
      () => 55,
      () => 0.35,
      4
    ), 150);

    // === Натяжение троса (металлический скрип) ===
    this.buffers.cableTension = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 1.6);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * t / 1.6) * 0.4;
        const f = 220 + 80 * Math.sin(2*Math.PI*0.5*t);
        d[i] = (Math.sin(2*Math.PI*f*t) + (Math.random()*2-1)*0.15) * env;
      }
      return buf;
    })();

    // === Скрип петель двери ===
    this.buffers.hingeCreak = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 1.2);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = (1 - Math.cos(Math.PI * t / 1.2)) * 0.5;
        const f = 320 + 120 * Math.sin(2*Math.PI*1.7*t);
        d[i] = (Math.sin(2*Math.PI*f*t) * 0.5 + (Math.random()*2-1)*0.1) * env;
      }
      return buf;
    })();

    // === Захлопывание двери ===
    this.buffers.doorSlam = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.6);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 12);
        d[i] = (
          Math.sin(2*Math.PI*60*t) * 0.6 +
          (Math.random()*2-1) * 0.5 * Math.exp(-t * 40)
        ) * env;
      }
      return buf;
    })();

    // === Звонок телефона (классический «бринг-бринг») ===
    this.buffers.phoneRing = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 2.0);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // двойной тон 480+620 Гц с вибрацией ~20Hz, 1.4с звонка + 0.6с тишины
        const ring = (t < 1.4) ? 1 : 0;
        const vib  = 0.5 + 0.5 * Math.sin(2*Math.PI*20*t);
        const tone = (Math.sin(2*Math.PI*480*t) + Math.sin(2*Math.PI*620*t)) * 0.5;
        d[i] = ring * vib * tone * 0.5;
      }
      return buf;
    })();

    // === Тон набора (короткий) ===
    this.buffers.dialTone = this._tone(
      0.6,
      () => 350,
      (t) => (t < 0.5 ? 0.3 : 0.0)
    );

    // === Сердцебиение (для финала) ===
    this.buffers.heartbeat = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 1.0);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const e1 = Math.exp(-((t-0.10)*(t-0.10))*900);
        const e2 = Math.exp(-((t-0.28)*(t-0.28))*900);
        d[i] = (Math.sin(2*Math.PI*55*t) * (e1*1.0 + e2*0.7)) * 0.6;
      }
      return buf;
    })();

    // === Низкочастотный гул-искажение (финальный) ===
    this.buffers.deepDrone = this._seamlessLoop(this._tone(
      6.0,
      () => 32,
      () => 0.45,
      3
    ), 200);

    // === Искрение / треск ламп ===
    this.buffers.sparkCrackle = (() => {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.4);
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // редкие «искры» — пульсы шума
        const click = (Math.random() < 0.02) ? 1 : 0;
        d[i] = click * (Math.random()*2-1) * Math.exp(-t * 4);
      }
      return buf;
    })();
  }

  // ---------- Создание источников ----------

  /**
   * Прикрепляет PositionalAudio к meshu или Object3D.
   * @param {string} bufferName — имя из this.buffers
   * @param {THREE.Object3D} parent — куда привязать
   * @param {object} opts — { loop, volume, refDistance, rolloff, maxDistance, occludable }
   */
  attach(bufferName, parent, opts = {}) {
    const audio = new THREE.PositionalAudio(this.listener);
    const buf = this.buffers[bufferName];
    if (!buf) {
      console.warn('[Audio] missing buffer:', bufferName);
      return audio;
    }
    audio.setBuffer(buf);
    audio.setLoop(opts.loop ?? false);
    audio.setVolume(opts.volume ?? 1.0);

    // Inverse-square distance model (физика звука)
    audio.setDistanceModel('inverse');
    audio.setRefDistance(opts.refDistance ?? 1.0);
    audio.setRolloffFactor(opts.rolloff ?? 2.0);
    audio.setMaxDistance(opts.maxDistance ?? 50);

    // Occlusion-цепочка: источник -> biquad lowpass -> output
    if (opts.occludable) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 22000;
      filter.Q.value = 0.7;
      audio.setFilter(filter);
      audio.userData.occludeFilter = filter;
      audio.userData.occludable = true;
    }

    parent.add(audio);
    this.allSources.push(audio);
    return audio;
  }

  /**
   * Однократно проигрывает несвязанный с миром звук в локации parent.
   */
  playOnce(bufferName, parent, opts = {}) {
    const a = this.attach(bufferName, parent, opts);
    a.play();
    // удалить после окончания
    const dur = (this.buffers[bufferName]?.duration || 1) + 0.2;
    setTimeout(() => {
      try { a.stop(); } catch(_) {}
      parent.remove(a);
      a.disconnect && a.disconnect();
    }, dur * 1000);
    return a;
  }

  /**
   * Регистрирует функцию проверки «загорожен ли источник стенами».
   * isOccluded(sourceWorldPos): boolean
   */
  setOcclusionTester(fn) {
    this.occluders = fn;
  }

  /**
   * Каждый кадр: для всех окклудабельных источников — двигает срез фильтра.
   */
  update(dt, listenerWorldPos) {
    if (!this.occluders) return;
    const tmp = new THREE.Vector3();
    for (let i = this.allSources.length - 1; i >= 0; i--) {
      const obj = this.allSources[i];
      if (!obj.parent) { this.allSources.splice(i, 1); continue; }
      if (!obj.userData.occludeFilter) continue;
      obj.getWorldPosition(tmp);
      const occluded = this.occluders(tmp, listenerWorldPos);
      const target = occluded ? 600 : 22000;
      const f = obj.userData.occludeFilter;
      f.frequency.value = THREE.MathUtils.damp(f.frequency.value, target, 6, dt);
    }
  }
}
