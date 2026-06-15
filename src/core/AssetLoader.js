import * as THREE from 'three';

/**
 * AssetLoader
 * -----------
 * Здесь почти все материалы — процедурные (CanvasTexture), поэтому
 * настоящих долгих загрузок нет. Утилита даёт единые методы:
 *   - createNoiseTexture(opts)
 *   - createCheckerTexture(opts)
 *   - createTextTexture(text, opts) — для табло этажей лифта
 *   - createCarpetTexture()         — мелкий ворсистый узор
 *   - createWallpaperTexture()      — обои с лёгким паттерном
 *
 * Все возвращаемые THREE.Texture настроены: SRGB, repeat, anisotropy.
 */
export class AssetLoader {
  constructor(renderer) {
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.cache = {};
  }

  _finish(canvas, opts = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    tex.anisotropy = this.maxAniso;
    if (opts.colorSpace !== false) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  createNoiseTexture({ size = 512, base = '#3a3a3a', amount = 12, monochrome = true } = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() * 2 - 1) * amount;
      img.data[i]   += monochrome ? n : (Math.random()*2-1)*amount;
      img.data[i+1] += monochrome ? n : (Math.random()*2-1)*amount;
      img.data[i+2] += monochrome ? n : (Math.random()*2-1)*amount;
    }
    g.putImageData(img, 0, 0);
    return this._finish(c);
  }

  /** Карта нормалей (плоский шумовой бамп) — для лёгкого микрорельефа. */
  createBumpNormal({ size = 512, strength = 0.6 } = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() * 2 - 1) * strength;
      img.data[i]   = 128 + n * 30;
      img.data[i+1] = 128 + n * 30;
      img.data[i+2] = 255;
      img.data[i+3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = this._finish(c);
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
  }

  createCheckerTexture({ size = 256, a = '#202020', b = '#121212', cells = 8 } = {}) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const cell = size / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect(x*cell, y*cell, cell, cell);
      }
    }
    return this._finish(c);
  }

  createCarpetTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#3a1f1a'; g.fillRect(0, 0, size, size);
    // ворсинки
    for (let i = 0; i < 12000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = 0.3 + Math.random() * 0.6;
      g.fillStyle = `rgba(${Math.floor(70*v)},${Math.floor(35*v)},${Math.floor(28*v)},0.9)`;
      g.fillRect(x, y, 1, 2);
    }
    // редкие узоры
    g.strokeStyle = 'rgba(120,60,40,0.15)';
    g.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(size/2, size/2, 30 + i*30, 0, Math.PI*2);
      g.stroke();
    }
    return this._finish(c, { repeat: [4, 4] });
  }

  createWallpaperTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    // тёплый бежевый
    const grd = g.createLinearGradient(0, 0, 0, size);
    grd.addColorStop(0, '#5a4a3a');
    grd.addColorStop(1, '#4a3a2c');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    // вертикальные тонкие полоски
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    g.lineWidth = 1;
    for (let x = 0; x < size; x += 24) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke();
    }
    // микрошум
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random()*2-1) * 8;
      img.data[i]   += n;
      img.data[i+1] += n;
      img.data[i+2] += n;
    }
    g.putImageData(img, 0, 0);
    return this._finish(c, { repeat: [2, 2] });
  }

  createMarbleTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#dad4c8'; g.fillRect(0, 0, size, size);
    // вены
    g.strokeStyle = 'rgba(60,55,50,0.35)';
    for (let i = 0; i < 20; i++) {
      g.lineWidth = 0.5 + Math.random() * 1.5;
      g.beginPath();
      let x = Math.random() * size, y = Math.random() * size;
      g.moveTo(x, y);
      for (let j = 0; j < 30; j++) {
        x += (Math.random() - 0.5) * 60;
        y += (Math.random() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // микрошум
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random()*2-1) * 6;
      img.data[i]   += n;
      img.data[i+1] += n;
      img.data[i+2] += n;
    }
    g.putImageData(img, 0, 0);
    return this._finish(c, { repeat: [3, 3] });
  }

  /** Текстовая текстура (например, число для табло этажа). */
  createTextTexture(text, { width = 256, height = 256, color = '#ff5520', bg = '#0a0a0a', font = 'bold 180px monospace' } = {}) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, width, height);
    g.fillStyle = color;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Лёгкое свечение — двойная отрисовка с blur
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillText(text, width/2, height/2);
    return this._finish(c);
  }
}
