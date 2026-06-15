import * as THREE from 'three';

/**
 * TV
 * --
 * Телевизор с экраном, который можно «включить» — на экране запускается
 * VideoTexture. Свет от экрана (PointLight) подсвечивает комнату:
 *  - интенсивность модулируется средней яркостью текущего кадра
 *    (один раз в N кадров мы рендерим видео в маленький canvas 32×32
 *     и считаем средний цвет);
 *  - тени от мебели реальные, потому что у света castShadow=true.
 *
 * Состояния:
 *  - off / on / glitched
 *
 * `setGlitch(true)` — финальный режим: видео «зависает» на текущем кадре,
 * звук подменяется на низкий гул, свет начинает мерцать.
 */
export class TV {
  constructor({ scene, audio, materials, position, facing = 'west', width = 1.0, height = 0.58, interaction }) {
    this.scene = scene;
    this.audio = audio;
    this.M = materials;
    this.facing = facing;
    this.width = width;
    this.height = height;

    // Корпус ТВ
    this.group = new THREE.Group();
    this.group.position.copy(position);
    if (facing === 'west')  this.group.rotation.y =  Math.PI/2;
    if (facing === 'east')  this.group.rotation.y = -Math.PI/2;
    if (facing === 'north') this.group.rotation.y =  Math.PI;
    this.scene.add(this.group);

    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.06),
      this.M.blackPlastic
    );
    bezel.castShadow = true;
    bezel.receiveShadow = true;
    this.group.add(bezel);

    // Экран — пока чёрный, материал заменим при включении
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0x080808 });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      this.screenMat
    );
    screen.position.z = 0.031;
    screen.userData.interactable = true;
    screen.userData.tag = 'tv';
    screen.userData.onInteract = () => this.toggle();
    this.group.add(screen);
    this.screen = screen;
    if (interaction) interaction.register(screen);

    // Подставка-стойка ТВ (декор)
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.06, 0.10),
      this.M.blackPlastic
    );
    stand.position.set(0, -height/2 - 0.03, 0);
    this.group.add(stand);

    // PointLight от экрана
    this.light = new THREE.PointLight(0x88a0ff, 0.0, 5.5, 2.0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.0008;
    this.light.position.set(0, 0, 0.5);   // чуть впереди экрана
    this.group.add(this.light);

    // Видео-элемент
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.loop = true;
    this.video.muted = false;
    this.video.playsInline = true;
    // CORS-friendly публичное видео (Mozilla MDN sample)
    this.video.src = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
    this.video.preload = 'auto';
    this.videoTex = null;

    // Маленький канвас для дискретизации яркости кадра
    this._lumCanvas = document.createElement('canvas');
    this._lumCanvas.width = this._lumCanvas.height = 16;
    this._lumCtx = this._lumCanvas.getContext('2d', { willReadFrequently: true });

    // Состояние
    this.on = false;
    this.glitched = false;
    this._lumSampleAccum = 0;
    this._lastAvgColor = new THREE.Color(0xffffff);

    // Звук ТВ — пространственный, hum + видео-аудио (видео не играем через WebAudio,
    // но прибавим короткий tvHum для CRT-присутствия)
    this.tvHum = this.audio.attach('tvHum', this.group, {
      loop: true, volume: 0, refDistance: 0.6, rolloff: 1.8, maxDistance: 8, occludable: true
    });
    try { this.tvHum.play(); } catch(_) {}
  }

  toggle() {
    if (this.on) this.off(); else this.turnOn();
  }

  turnOn() {
    if (this.on) return;
    this.on = true;
    this.video.muted = false;
    this.video.volume = 0.6;
    this.video.play().catch((e) => {
      // некоторые браузеры требуют user gesture — у нас он есть (клик)
      console.warn('[TV] video.play() error', e);
    });

    this.videoTex = new THREE.VideoTexture(this.video);
    this.videoTex.colorSpace = THREE.SRGBColorSpace;
    this.videoTex.minFilter = THREE.LinearFilter;
    this.videoTex.magFilter = THREE.LinearFilter;

    this.screen.material = new THREE.MeshBasicMaterial({
      map: this.videoTex,
      toneMapped: false   // экран эмиссивный
    });

    try { this.tvHum.setVolume(0.20); } catch(_) {}
  }

  off() {
    if (!this.on) return;
    this.on = false;
    this.video.pause();
    this.screen.material = new THREE.MeshBasicMaterial({ color: 0x080808 });
    this.light.intensity = 0;
    try { this.tvHum.setVolume(0); } catch(_) {}
  }

  /** Финальный режим: «зависнуть» и превратить звук в низкий гул. */
  setGlitch(on) {
    this.glitched = on;
    if (on) {
      this.video.pause();
      this.video.muted = true;
      // подменим аудио на deepDrone
      try { this.tvHum.stop(); } catch(_) {}
      this.deepDrone = this.audio.attach('deepDrone', this.group, {
        loop: true, volume: 0.85, refDistance: 1.5, rolloff: 1.2, maxDistance: 30
      });
      try { this.deepDrone.play(); } catch(_) {}
    }
  }

  update(dt) {
    if (!this.on) return;

    // Каждые ~80мс семплируем яркость кадра в 16×16 пикселях
    this._lumSampleAccum += dt;
    if (this._lumSampleAccum > 0.08 && this.video.readyState >= 2) {
      this._lumSampleAccum = 0;
      try {
        this._lumCtx.drawImage(this.video, 0, 0, 16, 16);
        const data = this._lumCtx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0;
        const N = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i+1]; b += data[i+2];
        }
        r /= 255 * N; g /= 255 * N; b /= 255 * N;
        this._lastAvgColor.setRGB(r, g, b);
      } catch (_) { /* CORS sometimes — просто игнор */ }
    }

    // Свет от ТВ
    const lum = 0.299 * this._lastAvgColor.r + 0.587 * this._lastAvgColor.g + 0.114 * this._lastAvgColor.b;
    let intensity = 0.6 + lum * 2.4;
    if (this.glitched) {
      // мерцание + дропы
      const t = performance.now() * 0.001;
      const flicker = (Math.sin(t * 41) * 0.5 + 0.5);
      const dropout = (Math.random() < 0.04) ? 0.1 : 1.0;
      intensity *= 0.4 + flicker * 0.6;
      intensity *= dropout;
      this.light.color.setHex(0xff3030);
    } else {
      this.light.color.copy(this._lastAvgColor);
    }
    this.light.intensity = THREE.MathUtils.damp(this.light.intensity, intensity, 8, dt);
  }
}
