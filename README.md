# ROOM 1107

Браузерная 3D хоррор-игра от первого лица. Slow-burn психологический хоррор в духе P.T. / Visage.

## Стек

- **Three.js** (PBR, тени PCFSoft, EffectComposer)
- **cannon-es** — физика игрока (капсула + гравитация + коллизии)
- **WebAudio** — процедурная пространственная генерация звука (THREE.PositionalAudio)
- **VideoTexture** — диегетический ТВ
- ES-modules + import map, без сборщика

## Запуск

```bash
node server.js
# открой http://localhost:8080
```

Нужны только Node.js (любой LTS) и интернет (CDN для three / cannon-es). Никаких npm install.

## Управление

| Клавиша | Действие |
|---|---|
| **WASD** | Движение |
| **Мышь** | Обзор (Pointer Lock) |
| **ЛКМ** | Взаимодействие |
| **Shift** | Ускоренный шаг |
| **ESC** | Освободить курсор |

## Структура

```
src/
  main.js                  Точка входа
  Game.js                  Главный оркестратор сцены и циклов
  core/
    Renderer.js            WebGLRenderer + PCFSoftShadow + ACES tonemapping
    PostProcessing.js      EffectComposer: Bloom + FilmGrain + CA + Vignette
    AudioManager.js        Procedural WebAudio + PositionalAudio + occlusion
    InputManager.js        Клавиатура / PointerLock / mouse
    AssetLoader.js         Управление загрузкой ресурсов
  shaders/
    FilmGrainShader.js     Шум плёнки
    VignetteShader.js      Виньетка с настраиваемой интенсивностью
    ChromaticAberrationShader.js  Хром. аберрация
  player/
    Player.js              cannon-es капсула, ходьба, инерция, прыжок-нет
    HeadBob.js             Покачивание камеры синхронно с шагами
    Interaction.js         Raycaster + наведение + клик
  world/
    Materials.js           Библиотека PBR-материалов (procedural)
    Hotel.js               Сборка геометрии: номер, коридор, лобби
    Door.js                Двери на петлях со скрипом
    Elevator.js            State Machine лифта (плавный старт/тормоз, табло, кнопки)
    TV.js                  ТВ с VideoTexture + динамическим освещением
    Phone.js               Телефон со звуком и speech-callback
  story/
    ActManager.js          State Machine сюжета на 4 акта
```

## Сюжет

1. **Акт 1.** Иллюзия безопасности. Звонок по телефону → лифт вниз → еда → лифт обратно.
2. **Акт 2.** Зона комфорта. ТВ со светом, отбрасывающим тени.
3. **Акт 3.** Сбой системы. Курьер просит спуститься. Лобби пустое, дверь заперта, гул фона исчез.
4. **Акт 4.** Кульминация. Лифт на 11. Искажение коридора. Шаги из ванной.

## Замечания

- Видео для ТВ — публичный CORS-friendly mp4 (Mozilla MDN samples). Если хочешь подменить — `src/world/TV.js`.
- Все звуки сгенерированы процедурно (Web Audio API): гул, дроны, биение сердца, ринг телефона, скрипы, звон лифта. Никаких внешних аудио-файлов.
- Голос телефона — `SpeechSynthesis` API.
