import * as THREE from 'three';

/**
 * TV (lite)
 * ---------
 * Лёгкий ТВ с процедурной анимацией на canvas (никаких видеофайлов,
 * никаких CORS-проблем). Свет от экрана модулируется средней яркостью
 * текущего кадра.
 *
 * setGlitch(true) — финальный режим: картинка «зависает» на текущем
 * кадре, цвет уходит в красный, звук подменяется на низкий гул.
 */
export class TV {
  constructor({ scene, audio, materials, position, facing = 'east',
                width = 1.0, height = 0.58, interaction }) {
    this.scene = scene;
    this.audio = audio;
    this.M = materials;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    if (facing === 'west')  this.group.rotation.y =  Math.PI/2;
    if (facing === 'east')  this.group.rotation.y = -Math.PI/2;
    if (facing === 'north') this.group.rotation.y =  Math.PI;
    this.scene.add(this.group);

    // Корпус
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.06),
      this.M.blackPlastic
    );
    this.group.add(bezel);

    // Canvas для процедурной анимации
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 144;
    this.ctx = this.canvas.getContext('2d');
    this.canvasTex = new THREE.CanvasTexture(this.canvas);
    this.canvasTex.colorSpace = THREE.SRGBColorSpace;

    this.screenMatOff = new THREE.MeshBasicMaterial({ color: 0x080808 });
    this.screenMatOn  = new THREE.MeshBasicMaterial({
      map: this.canvasTex, toneMapped: false
    });

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      this.screenMatOff
    );
    screen.position.z = 0.031;
    screen.userData.interactable = true;
    screen.userData.tag = 'tv';
    screen.userData.onInteract = () => this.toggle();
    this.group.add(screen);
    this.screen = screen;
    if (interaction) interaction.register(screen);

    // Подставка
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.06, 0.10),
      this.M.blackPlastic
    );
    stand.position.set(0, -height/2 - 0.03, 0);
    this.group.add(stand);

    // Свет от экрана
    this.light = new THREE.PointLight(0x88a0ff, 0.0, 8, 2.0);
    this.light.position.set(0, 0, 0.5);
    this.group.add(this.light);

    // Состояние
    this.on = false;
    this.glitched = false;
    this.frameTime = 0;
    this._avgColor = new THREE.Color(0xffffff);

    // Звук ТВ
    this.tvHum = this.audio.attach('tvHum', this.group, {
      loop: true, volume: 0, refDistance: 0.6, rolloff: 1.8, maxDistance: 6, occludable: true
    });
    try { this.tvHum.play(); } catch(_) {}

    // Сразу нарисуем «выключенный» экран
    this._drawOff();
  }

  toggle() { if (this.on) this.off(); else this.turnOn(); }

  turnOn() {
    if (this.on) return;
    this.on = true;
    this.screen.material = this.screenMatOn;
    try { this.tvHum.setVolume(0.10); } catch(_) {}
  }

  off() {
    if (!this.on) return;
    this.on = false;
    this.screen.material = this.screenMatOff;
    this.light.intensity = 0;
    try { this.tvHum.setVolume(0); } catch(_) {}
  }

  setGlitch(on) {
    this.glitched = on;
    if (on) {
      try { this.tvHum.stop(); } catch(_) {}
      this.deepDrone = this.audio.attach('deepDrone', this.group, {
        loop: true, volume: 0.6, refDistance: 1.5, rolloff: 1.2, maxDistance: 30
      });
      try { this.deepDrone.play(); } catch(_) {}
    }
  }

  _drawOff() {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = '#080808';
    c.fillRect(0, 0, w, h);
    this.canvasTex.needsUpdate = true;
  }

  _drawFrame(dt) {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    this.frameTime += dt;
    const t = this.frameTime;

    // «Старая плёнка»: горизонтальные движущиеся полосы + случайный шум +
    // мерцающий свет/тень. Имитация старого кино.
    const r = 60 + Math.sin(t * 0.7) * 30 + Math.cos(t * 1.3) * 20;
    const g = 50 + Math.sin(t * 0.9 + 1) * 25;
    const b = 40 + Math.cos(t * 0.5 + 2) * 35;

    // Базовый градиент
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0,   `rgb(${r|0},${g|0},${b|0})`);
    grd.addColorStop(0.5, `rgb(${(r*1.4)|0},${(g*1.4)|0},${(b*1.4)|0})`);
    grd.addColorStop(1,   `rgb(${(r*0.6)|0},${(g*0.6)|0},${(b*0.6)|0})`);
    c.fillStyle = grd;
    c.fillRect(0, 0, w, h);

    // «Силуэт»: пара тёмных движущихся форм
    const x1 = w/2 + Math.sin(t * 0.3) * 40;
    const y1 = h/2 + Math.cos(t * 0.2) * 20;
    c.fillStyle = `rgba(0,0,0,0.4)`;
    c.beginPath();
    c.ellipse(x1, y1, 25, 35, 0, 0, Math.PI*2);
    c.fill();
    c.beginPath();
    c.ellipse(x1 + 60, y1 + 10, 20, 30, 0, 0, Math.PI*2);
    c.fill();

    // Сканлайны
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);

    // Шум
    const img = c.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 28;
      img.data[i]   += n;
      img.data[i+1] += n;
      img.data[i+2] += n;
    }
    c.putImageData(img, 0, 0);

    this.canvasTex.needsUpdate = true;

    // Средний цвет — приближённо
    this._avgColor.setRGB((r*1.0)/255, (g*1.0)/255, (b*1.0)/255);
  }

  update(dt) {
    if (!this.on) return;

    if (this.glitched) {
      // зависшая картинка с мерцанием — НЕ перерисовываем canvas
      const flicker = (Math.sin(performance.now() * 0.041) * 0.5 + 0.5);
      const dropout = (Math.random() < 0.04) ? 0.1 : 1.0;
      this.light.color.setHex(0xff3030);
      this.light.intensity = THREE.MathUtils.damp(
        this.light.intensity, 6 * flicker * dropout, 8, dt
      );
    } else {
      this._drawFrame(dt);
      const lum = 0.299 * this._avgColor.r + 0.587 * this._avgColor.g + 0.114 * this._avgColor.b;
      const target = (0.5 + lum * 2.0) * 18;
      this.light.color.copy(this._avgColor);
      this.light.intensity = THREE.MathUtils.damp(this.light.intensity, target, 6, dt);
    }
  }
}
