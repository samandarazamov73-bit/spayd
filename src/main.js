import { Game } from './Game.js';

/**
 * main.js — точка входа.
 *  - создаёт Game, ждёт клика «ВОЙТИ» (user gesture для AudioContext + PointerLock)
 *  - предзагружает голоса SpeechSynthesis (Chrome требует событие voiceschanged)
 *  - выводит отладочный HUD (можно скрыть клавишей `)
 *  - ловит ошибки инициализации и показывает их пользователю
 */
const $ = (s) => document.querySelector(s);
const loading     = $('#loading');
const startScreen = $('#start-screen');
const startBtn    = $('#start-button');
const app         = $('#app');
const crosshair   = $('#crosshair');
const debugEl     = $('#debug');

let game = null;

function preloadVoices() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) { resolve(); return; }
    window.speechSynthesis.onvoiceschanged = () => resolve();
    setTimeout(resolve, 1500);
  });
}

function showError(msg) {
  loading.classList.remove('gone');
  loading.style.color = '#ff5555';
  loading.style.whiteSpace = 'pre-wrap';
  loading.style.padding = '20px';
  loading.style.fontSize = '12px';
  loading.style.textAlign = 'left';
  loading.style.lineHeight = '1.6';
  loading.textContent = 'ОШИБКА:\n\n' + msg;
}

window.addEventListener('error', (e) => {
  console.error(e);
  showError(e.message + '\n\n' + (e.error?.stack || ''));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e);
  showError('Promise: ' + (e.reason?.message || e.reason));
});

async function bootstrap() {
  await preloadVoices();
  try {
    game = new Game(app, crosshair);
  } catch (e) {
    showError(e.message + '\n\n' + e.stack);
    return;
  }
  loading.classList.add('gone');
  startScreen.classList.remove('gone');
}

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  setTimeout(() => startScreen.classList.add('gone'), 1500);

  game.input.requestLock();
  game.audio.resume();
  game.start();

  // Отладочный HUD каждые 200мс
  const keyEls = {
    KeyW: document.getElementById('keys-w'),
    KeyA: document.getElementById('keys-a'),
    KeyS: document.getElementById('keys-s'),
    KeyD: document.getElementById('keys-d')
  };
  const moveStatus = document.getElementById('move-status');

  setInterval(() => {
    if (!debugEl || !game) return;
    const p = game.player.body.position;
    const v = game.player.body.velocity;
    const keys = [...game.input.keys].join(' ');
    debugEl.textContent =
      `pos  ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}\n` +
      `vel  ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}\n` +
      `yaw  ${(game.player.yaw * 180 / Math.PI).toFixed(0)}°\n` +
      `keys ${keys || '(none)'}\n` +
      `lock ${game.input.locked ? 'YES' : 'no'}\n` +
      `act  ${game.acts.phase}`;

    // Подсветка клавиш
    for (const code in keyEls) {
      if (game.input.keys.has(code)) keyEls[code].classList.add('active');
      else keyEls[code].classList.remove('active');
    }

    // Статус движения
    const horizSpeed = Math.hypot(v.x, v.z);
    if (horizSpeed > 0.15) {
      moveStatus.textContent = 'ИДЁТ →';
      moveStatus.classList.add('walking');
    } else {
      moveStatus.textContent = 'СТОИТ';
      moveStatus.classList.remove('walking');
    }
  }, 100);

  // Скрыть/показать debug по клавише `
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote' && debugEl) {
      debugEl.style.display = (debugEl.style.display === 'none') ? '' : 'none';
    }
  });

  // Гарантировать фокус на window — иногда Mac Safari/Chrome теряет его
  window.focus();
  document.body.focus();
});

bootstrap().catch((e) => {
  showError(e.message + '\n\n' + e.stack);
});
