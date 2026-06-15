import * as THREE from 'three';

/**
 * Head-bob: синхронное с шагами покачивание камеры.
 * Возвращает локальный offset (x,y,z) и небольшой roll.
 *
 * При каждом «дне» волны (нижняя точка) триггерит footstep callback —
 * это даёт идеальную синхронизацию шагов и звука.
 */
export class HeadBob {
  constructor() {
    this.phase = 0;
    this.amplitude = 0;        // плавно нарастает/спадает с движением
    this.frequency = 8.0;      // Hz при нормальной ходьбе
    this.lastSign = 1;         // знак прошлой y-волны
    this.onStep = null;        // callback при шаге
  }

  update(dt, walkSpeed01, isRunning) {
    // walkSpeed01: 0..1 — нормированная скорость
    const targetAmp = walkSpeed01 * (isRunning ? 1.4 : 1.0);
    this.amplitude = THREE.MathUtils.damp(this.amplitude, targetAmp, 6, dt);

    const f = this.frequency * (isRunning ? 1.35 : 1.0);
    this.phase += dt * f * 2 * Math.PI;

    const y = Math.sin(this.phase) * 0.045 * this.amplitude;
    const x = Math.cos(this.phase * 0.5) * 0.030 * this.amplitude;
    const roll = Math.cos(this.phase * 0.5) * 0.012 * this.amplitude;

    // детект «удара ноги об пол» — переход y из + в - (нижняя точка)
    const sign = Math.sign(Math.cos(this.phase));
    if (sign < 0 && this.lastSign >= 0 && this.amplitude > 0.25) {
      if (this.onStep) this.onStep();
    }
    this.lastSign = sign;

    return { x, y, roll };
  }
}
