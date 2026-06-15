import { Game } from './Game.js';

/**
 * main.js — точка входа.
 *  - создаёт Game, ждёт клика «ВОЙТИ» (user gesture для AudioContext + PointerLock)
 *  - предзагружает голоса SpeechSynthesis (Chrome требует событие voiceschanged)
 */
const $ = (s) => document.querySelector(s);
const loading = $('#loading');
const startScreen = $('#start-screen');
const startBtn    = $('#start-button');
const app         = $('#app');
const crosshair   = $('#crosshair');

let game = null;

function preloadVoices() {
  // Дёргаем getVoices, чтобы Chrome их инициализировал заранее
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) { resolve(); return; }
    window.speechSynthesis.onvoiceschanged = () => resolve();
    setTimeout(resolve, 1500); // safety timeout
  });
}

async function bootstrap() {
  await preloadVoices();
  game = new Game(app, crosshair);
  loading.classList.add('gone');
  startScreen.classList.remove('gone');
}

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  setTimeout(() => startScreen.classList.add('gone'), 1500);

  // Pointer Lock + аудио — должны быть инициированы пользовательским жестом
  game.input.requestLock();
  game.audio.resume();
  game.start();
});

bootstrap().catch((e) => {
  console.error(e);
  loading.textContent = 'ОШИБКА ЗАГРУЗКИ';
});
