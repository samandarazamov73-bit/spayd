import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Materials } from './Materials.js';

/**
 * Hotel
 * -----
 * Полная статическая геометрия отеля: лобби (1 этаж), шахта лифта,
 * коридор 11 этажа, номер 1107.
 *
 * Координатная сетка:
 *   y = 0   — пол лобби
 *   y = FLOOR_11_Y — пол 11 этажа (визуально «10 этажей вверх»)
 *
 *   Коридор 11 идёт вдоль оси Z: z ∈ [-7, +7], x ∈ [-1.2, +1.2]
 *   Шахта лифта: z ∈ [+7, +9.4], x ∈ [-1.2, +1.2] (общая для обоих этажей)
 *   Номер 1107: x ∈ [-7.2, -1.2], z ∈ [-6, 0], дверь в восточной стене (x=-1.2) при z=-3
 *   Лобби (1 этаж): x ∈ [-5, 5], z ∈ [-3, +7]
 *   Выход из лобби: южная стена z=-3 (двери на улицу — заперты в акте 3)
 *
 * Возвращает:
 *  - this.group           - корневая Object3D
 *  - this.roomGroup       - содержимое номера (для динамики)
 *  - this.corridorGroup   - коридор 11
 *  - this.lobbyGroup      - лобби
 *  - this.shaftGroup      - шахта (общая)
 *  - this.lights          - все источники света (для Act-managed dimming/flicker)
 *  - this.windowMesh      - окно номера (визуал ночи + дождя)
 *  - this.foodBag         - пакет с едой в лобби
 *  - this.staticBodies    - массив cannon тел (для возможного отключения)
 *  - this.interactables   - массив интерактивных объектов
 */
export class Hotel {
  constructor({ scene, world, assets, audio, interaction }) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.audio = audio;
    this.interaction = interaction;

    this.M = new Materials(assets);

    this.group = new THREE.Group();
    this.group.name = 'Hotel';
    this.scene.add(this.group);

    this.lights = [];
    this.staticBodies = [];
    this.interactables = [];
    this.solidsForOcclusion = []; // для Raycast occlusion-теста (стены/двери)

    this.FLOOR_11_Y = 30;
    this.CORRIDOR_HALF_X = 1.2;
    this.CORRIDOR_HALF_Z = 7;
    this.CEIL_11 = 2.6;
    this.CEIL_1  = 3.2;
    this.SHAFT_DEPTH = 2.4;          // Z-глубина шахты от стены коридора
    this.SHAFT_FRONT_Z = this.CORRIDOR_HALF_Z;  // 7
    this.SHAFT_BACK_Z  = this.CORRIDOR_HALF_Z + this.SHAFT_DEPTH; // 9.4
    this.SHAFT_HALF_X  = this.CORRIDOR_HALF_X;
    this.OPENING_HALF_X = 0.85;      // полуширина проёма лифта (1.7м)
    this.DOOR_HEIGHT = 2.05;
    this.ROOM_DOOR_Z = -3.0;
    this.ROOM_DOOR_HALF_W = 0.45;

    this._buildLobby();
    this._buildShaft();
    this._buildCorridor11();
    this._buildRoom();
    this._buildOutsideWindow();
  }

  // =====================================================
  // helpers
  // =====================================================

  _addStaticBox(mesh) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);

    const shape = new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2));
    const body = new CANNON.Body({ mass: 0, shape });
    body.position.set(center.x, center.y, center.z);
    this.world.addBody(body);
    this.staticBodies.push(body);
    this.solidsForOcclusion.push(mesh);
    return body;
  }

  _box(sx, sy, sz, mat, { castShadow = true, receiveShadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    return m;
  }

  _addBox(parent, x, y, z, sx, sy, sz, mat, opts = {}) {
    const m = this._box(sx, sy, sz, mat, opts);
    m.position.set(x, y, z);
    parent.add(m);
    if (opts.collide !== false) this._addStaticBox(m);
    return m;
  }

  // =====================================================
  // ЛОББИ (1 этаж, y=0)
  // =====================================================
  _buildLobby() {
    const g = new THREE.Group();
    g.name = 'Lobby';
    this.group.add(g);
    this.lobbyGroup = g;

    const M = this.M;
    const x0 = -5, x1 = 5;
    const z0 = -3, z1 = 7;
    const W = x1 - x0;        // 10
    const D = z1 - z0;        // 10
    const H = this.CEIL_1;

    // Пол (мрамор)
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.1, D),
      M.marble
    );
    floor.position.set((x0+x1)/2, -0.05, (z0+z1)/2);
    floor.receiveShadow = true;
    g.add(floor);
    this._addStaticBox(floor);

    // Потолок
    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(W, 0.1, D),
      M.ceiling
    );
    ceil.position.set((x0+x1)/2, H + 0.05, (z0+z1)/2);
    ceil.receiveShadow = true;
    g.add(ceil);

    // Стены
    // South (z=z0) — выход на улицу с двумя стеклянными дверями (видимо)
    // Сделаем с проёмом по центру
    const exitW = 2.4;
    const exitHalf = exitW / 2;
    // левая часть южной стены
    this._addBox(g, x0 + (-exitHalf - x0)/2 + (x0 - exitHalf)/2, H/2, z0, ((-exitHalf) - x0), H, 0.1, M.wall);
    // ^ упрощённо ниже:
    g.children.pop(); // удалить, посчитаю заново
    this.staticBodies.pop();
    this.solidsForOcclusion.pop();
    // Левая часть
    {
      const len = (-exitHalf) - x0;
      const cx = x0 + len/2;
      this._addBox(g, cx, H/2, z0 - 0.05, len, H, 0.1, M.wall);
    }
    // Правая часть
    {
      const len = x1 - exitHalf;
      const cx = exitHalf + len/2;
      this._addBox(g, cx, H/2, z0 - 0.05, len, H, 0.1, M.wall);
    }
    // Верхняя перемычка над выходом
    {
      const overH = H - this.DOOR_HEIGHT;
      this._addBox(g, 0, this.DOOR_HEIGHT + overH/2, z0 - 0.05, exitW, overH, 0.1, M.wall);
    }
    // Стеклянные двери (декор + коллизия) — заперты в акте 3 всегда
    const lobbyExitGlassL = new THREE.Mesh(
      new THREE.BoxGeometry(exitW/2 - 0.02, this.DOOR_HEIGHT, 0.04),
      M.glass
    );
    lobbyExitGlassL.position.set(-exitW/4 - 0.005, this.DOOR_HEIGHT/2, z0);
    lobbyExitGlassL.castShadow = true;
    lobbyExitGlassL.receiveShadow = true;
    g.add(lobbyExitGlassL);
    this._addStaticBox(lobbyExitGlassL);
    const lobbyExitGlassR = lobbyExitGlassL.clone();
    lobbyExitGlassR.position.x = exitW/4 + 0.005;
    g.add(lobbyExitGlassR);
    this._addStaticBox(lobbyExitGlassR);

    // North (z=z1) — стена с проходом к шахте лифта (z=7..9.4 — это шахта)
    // Проём шире самих дверей лифта
    const elevOpening = this.OPENING_HALF_X;
    {
      const len = (-elevOpening) - x0;
      const cx = x0 + len/2;
      this._addBox(g, cx, H/2, z1, len, H, 0.1, M.wall);
    }
    {
      const len = x1 - elevOpening;
      const cx = elevOpening + len/2;
      this._addBox(g, cx, H/2, z1, len, H, 0.1, M.wall);
    }
    // Перемычка над дверьми лифта
    {
      const overH = H - this.DOOR_HEIGHT;
      this._addBox(g, 0, this.DOOR_HEIGHT + overH/2, z1, elevOpening*2, overH, 0.1, M.wall);
    }

    // East / West стены лобби (сплошные)
    this._addBox(g, x0 - 0.05, H/2, (z0+z1)/2, 0.1, H, D, M.wall);
    this._addBox(g, x1 + 0.05, H/2, (z0+z1)/2, 0.1, H, D, M.wall);

    // Стойка ресепшн
    const desk = this._box(3, 1.05, 0.7, M.darkWood);
    desk.position.set(-3, 0.525, 5.6);
    g.add(desk);
    this._addStaticBox(desk);
    // верх стойки
    const deskTop = this._box(3.1, 0.04, 0.8, M.lightWood);
    deskTop.position.set(-3, 1.07, 5.6);
    g.add(deskTop);

    // Стол выдачи / тумба возле лифта — здесь будет пакет с едой
    const pickupTable = this._box(0.9, 0.85, 0.5, M.darkWood);
    pickupTable.position.set(2.5, 0.425, 6.4);
    g.add(pickupTable);
    this._addStaticBox(pickupTable);
    this.pickupTablePos = new THREE.Vector3(2.5, 0.85, 6.4);

    // Бумажный пакет с едой (создаём, но скрываем сначала)
    const bag = this._box(0.25, 0.32, 0.22, M.paperBag, { collide: false });
    bag.position.set(2.5, 0.85 + 0.16, 6.4);
    bag.userData.interactable = true;
    bag.userData.tag = 'foodBag';
    bag.visible = false;
    g.add(bag);
    this.foodBag = bag;
    this.interaction.register(bag);

    // Кресло в лобби (декор)
    const sofa = this._box(1.6, 0.5, 0.7, M.fabric);
    sofa.position.set(3.5, 0.25, 1);
    g.add(sofa);
    this._addStaticBox(sofa);
    const sofaBack = this._box(1.6, 0.6, 0.15, M.fabric);
    sofaBack.position.set(3.5, 0.75, 0.7);
    g.add(sofaBack);

    // === Освещение лобби ===
    // 4 точечных источника под потолком
    const lobbyLightPositions = [
      [-2, H - 0.15, 1],
      [ 2, H - 0.15, 1],
      [-2, H - 0.15, 5],
      [ 2, H - 0.15, 5]
    ];
    this.lobbyLights = [];
    for (const [lx, ly, lz] of lobbyLightPositions) {
      const lamp = new THREE.PointLight(0xffe0b0, 1.6, 8, 2.0);
      lamp.position.set(lx, ly, lz);
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(512, 512);
      lamp.shadow.bias = -0.0008;
      lamp.shadow.normalBias = 0.02;
      lamp.shadow.radius = 4;
      g.add(lamp);

      // плафон
      const shade = this._box(0.45, 0.05, 0.45, this.M.lampShade, { collide: false });
      shade.position.copy(lamp.position);
      shade.position.y -= 0.02;
      g.add(shade);

      this.lobbyLights.push(lamp);
      this.lights.push(lamp);
    }

    // Лёгкий ambient в лобби (заполняющий)
    const amb = new THREE.AmbientLight(0x202428, 0.20);
    g.add(amb);
    this.lobbyAmbient = amb;
  }

  // =====================================================
  // ШАХТА ЛИФТА (общая для обоих этажей)
  // =====================================================
  _buildShaft() {
    const g = new THREE.Group();
    g.name = 'Shaft';
    this.group.add(g);
    this.shaftGroup = g;

    const M = this.M;
    const x0 = -this.SHAFT_HALF_X;
    const x1 =  this.SHAFT_HALF_X;
    const z0 = this.SHAFT_FRONT_Z;
    const z1 = this.SHAFT_BACK_Z;

    // Высота шахты — от пола лобби до потолка 11 этажа
    const shaftBottom = -0.5;                                  // запас под кабиной
    const shaftTop = this.FLOOR_11_Y + this.CEIL_11 + 0.5;
    const shaftH = shaftTop - shaftBottom;
    const cy = (shaftTop + shaftBottom) / 2;

    // Задняя стена шахты
    this._addBox(g, 0, cy, z1 + 0.05, (x1 - x0), shaftH, 0.1, M.steel);
    // Боковые стены шахты
    this._addBox(g, x0 - 0.05, cy, (z0 + z1)/2, 0.1, shaftH, (z1 - z0), M.steel);
    this._addBox(g, x1 + 0.05, cy, (z0 + z1)/2, 0.1, shaftH, (z1 - z0), M.steel);

    // Дно шахты (для уверенности)
    this._addBox(g, 0, shaftBottom + 0.05, (z0+z1)/2, (x1 - x0), 0.1, (z1 - z0), M.blackPlastic);

    // Между этажами — перекрытия с проёмом для шахты НЕ нужны: шахта — единый канал.
    // Но мы хотим, чтобы игрок «не падал» когда не в кабине. Дверь шахты на каждом этаже
    // (внешние двери лифта — частично деко, частично коллизия) обеспечит безопасность.
    // Двери лифта создаст Elevator.js.

    // Также — 11 этажа полу-пол перед лифтом (уже сделан коридором).
    // Полу-пол лобби перед лифтом — уже сделан лобби.
  }

  // =====================================================
  // КОРИДОР 11 этажа
  // =====================================================
  _buildCorridor11() {
    const g = new THREE.Group();
    g.name = 'Corridor11';
    g.position.y = this.FLOOR_11_Y;
    this.group.add(g);
    this.corridorGroup = g;

    const M = this.M;
    const halfX = this.CORRIDOR_HALF_X;
    const halfZ = this.CORRIDOR_HALF_Z;
    const W = halfX * 2, D = halfZ * 2;
    const H = this.CEIL_11;

    // Пол (ковёр)
    const floor = this._box(W, 0.1, D, M.carpet);
    floor.position.set(0, -0.05, 0);
    g.add(floor);
    this._addStaticBox(floor);

    // Потолок
    const ceil = this._box(W, 0.1, D, M.ceiling, { castShadow: false });
    ceil.position.set(0, H + 0.05, 0);
    g.add(ceil);

    // East стена (x=+halfX) — сплошная, с декоративными «дверями других номеров»
    this._addBox(g, halfX + 0.05, H/2, 0, 0.1, H, D, M.wall);
    // декоративные двери на east стене
    for (const dz of [-4.5, 0.5, 5.0]) {
      const fakeDoor = this._box(0.04, this.DOOR_HEIGHT, 0.9, M.darkWood, { collide: false });
      fakeDoor.position.set(halfX - 0.02, this.DOOR_HEIGHT/2, dz);
      g.add(fakeDoor);
      // ручка
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 12, 8),
        M.brushedMetal
      );
      knob.position.set(halfX - 0.05, 1.05, dz + 0.35);
      g.add(knob);
      // номерок
      const numTex = this.assets.createTextTexture(
        ['1108','1110','1112'][[-4.5,0.5,5.0].indexOf(dz)],
        { width: 128, height: 64, color: '#9a8a70', bg: '#2a1810', font: 'bold 36px monospace' }
      );
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.09),
        new THREE.MeshBasicMaterial({ map: numTex })
      );
      plate.position.set(halfX - 0.025, 1.85, dz);
      plate.rotation.y = -Math.PI/2;
      g.add(plate);
    }

    // West стена (x=-halfX) — с проёмом для двери номера 1107 при z=ROOM_DOOR_Z
    const dz = this.ROOM_DOOR_Z;
    const dHW = this.ROOM_DOOR_HALF_W;
    {
      // часть стены до двери (z от -halfZ до dz - dHW)
      const len = (dz - dHW) - (-halfZ);
      const cz = -halfZ + len/2;
      this._addBox(g, -halfX - 0.05, H/2, cz, 0.1, H, len, M.wall);
    }
    {
      // часть стены после двери
      const len = halfZ - (dz + dHW);
      const cz = (dz + dHW) + len/2;
      this._addBox(g, -halfX - 0.05, H/2, cz, 0.1, H, len, M.wall);
    }
    // Перемычка над дверью номера
    {
      const overH = H - this.DOOR_HEIGHT;
      this._addBox(g, -halfX - 0.05, this.DOOR_HEIGHT + overH/2, dz, 0.1, overH, dHW*2, M.wall);
    }

    // Табличка «1107» рядом с дверью
    {
      const numTex = this.assets.createTextTexture('1107', {
        width: 128, height: 64, color: '#c8a070', bg: '#1a0e08', font: 'bold 38px monospace'
      });
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.11),
        new THREE.MeshBasicMaterial({ map: numTex })
      );
      plate.position.set(-halfX + 0.03, 1.85, dz + dHW + 0.25);
      plate.rotation.y = Math.PI/2;
      g.add(plate);
    }

    // South стена (z=-halfZ) — глухая
    this._addBox(g, 0, H/2, -halfZ - 0.05, W, H, 0.1, M.wall);

    // North стена (z=+halfZ) — с проёмом для лифта
    const eo = this.OPENING_HALF_X;
    {
      const len = (-eo) - (-halfX);
      const cx = -halfX + len/2;
      this._addBox(g, cx, H/2, halfZ + 0.05, len, H, 0.1, M.wall);
    }
    {
      const len = halfX - eo;
      const cx = eo + len/2;
      this._addBox(g, cx, H/2, halfZ + 0.05, len, H, 0.1, M.wall);
    }
    // Перемычка над дверьми лифта
    {
      const overH = H - this.DOOR_HEIGHT;
      this._addBox(g, 0, this.DOOR_HEIGHT + overH/2, halfZ + 0.05, eo*2, overH, 0.1, M.wall);
    }

    // === Освещение коридора: 3 люминесцентные лампы потолочные ===
    this.corridorLights = [];
    this.corridorTubes = [];
    for (const lz of [-4.5, 0, 4.5]) {
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.6),
        M.fluorescentTube
      );
      tube.position.set(0, H - 0.06, lz);
      g.add(tube);
      this.corridorTubes.push(tube);

      const light = new THREE.PointLight(0xfff2d8, 1.4, 6, 2.0);
      light.position.set(0, H - 0.12, lz);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.02;
      light.shadow.radius = 3;
      g.add(light);
      this.corridorLights.push(light);
      this.lights.push(light);

      // Гул лампы — пространственный
      const hum = this.audio.attach('lampHum', tube, {
        loop: true, volume: 0.10, refDistance: 0.6, rolloff: 2.5, maxDistance: 6, occludable: true
      });
      tube.userData.hum = hum;
    }

    // === Кадка / декор ===
    const planter = this._box(0.4, 0.5, 0.4, M.darkWood);
    planter.position.set(halfX - 0.25, 0.25, -halfZ + 0.3);
    g.add(planter);

    // Лёгкий ambient
    const amb = new THREE.AmbientLight(0x1a1812, 0.12);
    g.add(amb);
    this.corridorAmbient = amb;
  }

  // =====================================================
  // НОМЕР 1107
  // =====================================================
  _buildRoom() {
    const g = new THREE.Group();
    g.name = 'Room1107';
    g.position.y = this.FLOOR_11_Y;
    this.group.add(g);
    this.roomGroup = g;

    const M = this.M;
    // Внутренние границы: x ∈ [-7.2, -1.2], z ∈ [-6, 0]
    const x0 = -7.2, x1 = -1.2;
    const z0 = -6,   z1 =  0;
    const W = x1 - x0;        // 6
    const D = z1 - z0;        // 6
    const H = this.CEIL_11;

    // Пол
    const floor = this._box(W, 0.1, D, M.carpet);
    floor.position.set((x0+x1)/2, -0.05, (z0+z1)/2);
    g.add(floor);
    this._addStaticBox(floor);

    // Потолок
    const ceil = this._box(W, 0.1, D, M.ceiling, { castShadow: false });
    ceil.position.set((x0+x1)/2, H + 0.05, (z0+z1)/2);
    g.add(ceil);

    // South стена (z=z0)
    this._addBox(g, (x0+x1)/2, H/2, z0 - 0.05, W, H, 0.1, M.wall);
    // North стена (z=z1) — общая с коридором НИЖЕ; это уже west стена коридора. Не дублировать,
    // но дверь номера (мостик) добавит Door.js. Здесь только финиш.
    // Для номера эта стена нужна с обратной стороны. Сделаем её отдельно тонкой:
    {
      const dz = this.ROOM_DOOR_Z;
      const dHW = this.ROOM_DOOR_HALF_W;
      // часть стены до двери
      const lenA = (dz - dHW) - z0;
      const cZa = z0 + lenA/2;
      this._addBox(g, x1 + 0.05, H/2, cZa, 0.1, H, lenA, M.wall);
      // часть стены после двери
      const lenB = z1 - (dz + dHW);
      const cZb = (dz + dHW) + lenB/2;
      this._addBox(g, x1 + 0.05, H/2, cZb, 0.1, H, lenB, M.wall);
      // перемычка
      const overH = H - this.DOOR_HEIGHT;
      this._addBox(g, x1 + 0.05, this.DOOR_HEIGHT + overH/2, dz, 0.1, overH, dHW*2, M.wall);
    }

    // West стена (z=z1, x=x1) — wait. Already done.
    // Now: West (x=x0) — это окно/наружная стена
    // Сделаем стену с большим окном
    {
      const winHalfH = 0.7;
      const winCenterY = 1.4;
      const winHalfZ = 1.0;
      const winCenterZ = -3;
      // 4 куска стены вокруг окна: верх / низ / лево / право
      // верх
      const upH = H - (winCenterY + winHalfH);
      this._addBox(g, x0 - 0.05, (winCenterY + winHalfH) + upH/2, (z0+z1)/2, 0.1, upH, D, M.wall);
      // низ
      const dnH = winCenterY - winHalfH;
      this._addBox(g, x0 - 0.05, dnH/2, (z0+z1)/2, 0.1, dnH, D, M.wall);
      // лево
      const leftLen = (winCenterZ - winHalfZ) - z0;
      this._addBox(g, x0 - 0.05, winCenterY, z0 + leftLen/2, 0.1, winHalfH*2, leftLen, M.wall);
      // право
      const rightLen = z1 - (winCenterZ + winHalfZ);
      this._addBox(g, x0 - 0.05, winCenterY, (winCenterZ + winHalfZ) + rightLen/2, 0.1, winHalfH*2, rightLen, M.wall);
      // стекло
      const glass = this._box(0.04, winHalfH*2 - 0.04, winHalfZ*2 - 0.04, M.glass, { collide: false });
      glass.position.set(x0 - 0.05, winCenterY, winCenterZ);
      g.add(glass);
      this.windowGlass = glass;
      this.windowParams = { x: x0 - 0.05, y: winCenterY, z: winCenterZ };
    }
    // East стена с дверью УЖЕ построена выше (раздел "North стена... wait") — да, секция с x1.
    // Конечно, направление: North=z1 — здесь её нет (z1=0 — это куда выходит дверь в коридор? Нет!).
    // На самом деле x1=-1.2 — east стена номера, общая с west стеной коридора. Уже сделана.

    // North стена номера (z=z1=0) и South — South сделана. North — глухая.
    this._addBox(g, (x0+x1)/2, H/2, z1 + 0.05, W, H, 0.1, M.wall);

    // === Мебель ===
    // Кровать
    const bedFrame = this._box(2.0, 0.35, 1.4, M.darkWood);
    bedFrame.position.set(x0 + 1.5, 0.175, z0 + 0.9);
    g.add(bedFrame);
    this._addStaticBox(bedFrame);
    const mattress = this._box(1.92, 0.20, 1.32, M.linen, { collide: false });
    mattress.position.set(x0 + 1.5, 0.45, z0 + 0.9);
    g.add(mattress);
    const pillow = this._box(0.6, 0.10, 0.40, M.linen, { collide: false });
    pillow.position.set(x0 + 0.85, 0.60, z0 + 0.9);
    g.add(pillow);
    // изголовье
    const headboard = this._box(0.06, 1.0, 1.4, M.darkWood);
    headboard.position.set(x0 + 0.45, 0.5, z0 + 0.9);
    g.add(headboard);
    this._addStaticBox(headboard);

    // Тумбочка
    const nightstand = this._box(0.45, 0.55, 0.4, M.lightWood);
    nightstand.position.set(x0 + 0.6, 0.275, z0 + 1.85);
    g.add(nightstand);
    this._addStaticBox(nightstand);
    this.phonePos = new THREE.Vector3(x0 + 0.6, 0.55, z0 + 1.85);

    // Настольная лампа (на тумбочке)
    {
      const base = this._box(0.12, 0.05, 0.12, M.brushedMetal, { collide: false });
      base.position.set(this.phonePos.x + 0.15, 0.58, this.phonePos.z);
      g.add(base);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.30, 8), M.brushedMetal);
      stand.position.set(this.phonePos.x + 0.15, 0.75, this.phonePos.z);
      g.add(stand);
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.13, 0.18, 16, 1, true),
        M.lampShade
      );
      shade.position.set(this.phonePos.x + 0.15, 0.99, this.phonePos.z);
      g.add(shade);

      const bedLight = new THREE.PointLight(0xffc080, 1.4, 4, 2.0);
      bedLight.position.set(this.phonePos.x + 0.15, 0.95, this.phonePos.z);
      bedLight.castShadow = true;
      bedLight.shadow.mapSize.set(512, 512);
      bedLight.shadow.bias = -0.0008;
      bedLight.shadow.radius = 4;
      g.add(bedLight);
      this.bedLight = bedLight;
      this.lights.push(bedLight);
    }

    // Стол с ТВ (напротив кровати, у east стены)
    const desk = this._box(1.4, 0.45, 0.5, M.lightWood);
    desk.position.set(x1 - 0.35, 0.225, z0 + 1.5);
    g.add(desk);
    this._addStaticBox(desk);
    this.tvPos = new THREE.Vector3(x1 - 0.35, 0.95, z0 + 1.5);

    // Зеркало над столом — простой эмиссивный квад с лёгкой текстурой шумов
    const mirror = this._box(0.7, 0.9, 0.02, new THREE.MeshStandardMaterial({
      color: 0x1a1c20, roughness: 0.05, metalness: 1.0
    }), { collide: false });
    mirror.position.set(x1 - 0.07, 1.5, z0 + 3.5);
    mirror.rotation.y = -Math.PI/2;
    g.add(mirror);

    // Стул у стола (декор)
    const chair = this._box(0.45, 0.5, 0.45, M.darkWood);
    chair.position.set(x1 - 0.6, 0.25, z0 + 2.4);
    g.add(chair);
    this._addStaticBox(chair);

    // === Дверь в ванную (на south wall номера, юго-западный угол) ===
    // Бокс-стена ванной отсекает угол 1.5x1.5
    const bathX0 = x0;
    const bathX1 = x0 + 1.5;
    const bathZ0 = z0;
    const bathZ1 = z0 + 1.5;
    // внутренняя стена ванной (вдоль X на z=bathZ1 с проёмом для двери)
    const bathDoorCenterX = bathX1 - 0.6;
    const bathDoorHalfW = 0.4;
    {
      const lenA = (bathDoorCenterX - bathDoorHalfW) - bathX0;
      this._addBox(g, bathX0 + lenA/2, H/2, bathZ1 + 0.025, lenA, H, 0.05, M.wall);
      const lenB = bathX1 - (bathDoorCenterX + bathDoorHalfW);
      this._addBox(g, (bathDoorCenterX + bathDoorHalfW) + lenB/2, H/2, bathZ1 + 0.025, lenB, H, 0.05, M.wall);
      // перемычка
      const overH = H - this.DOOR_HEIGHT;
      this._addBox(g, bathDoorCenterX, this.DOOR_HEIGHT + overH/2, bathZ1 + 0.025, bathDoorHalfW*2, overH, 0.05, M.wall);
    }
    // вертикальная стена ванной (вдоль Z на x=bathX1) — глухая
    this._addBox(g, bathX1 + 0.025, H/2, (bathZ0+bathZ1)/2, 0.05, H, (bathZ1-bathZ0), M.wall);

    // Дверь в ванную создаст Game.js (Door instance, открывается в сторону комнаты).
    // Координаты сохраняем в МИРОВОЙ системе. Петля в восточном торце проёма
    // (чтобы при открытии 90° дверь смотрела в +Z, т.е. распахивалась в комнату).
    this.bathroomDoorHinge = new THREE.Vector3(
      bathDoorCenterX + bathDoorHalfW,
      this.FLOOR_11_Y,
      bathZ1 + 0.025
    );
    this.bathroomDoorWidth = bathDoorHalfW * 2 - 0.02;
    this.bathroomDoorPos = new THREE.Vector3(bathDoorCenterX, this.FLOOR_11_Y + this.DOOR_HEIGHT/2, bathZ1 + 0.02);

    // Ambient номера (очень слабый — комната освещена лампой и ТВ)
    const amb = new THREE.AmbientLight(0x1a1614, 0.10);
    g.add(amb);
    this.roomAmbient = amb;

    // Сохраним позицию двери номера (для Door.js) — мировые координаты.
    // Петля — в северном торце проёма (так дверь открывается ВНУТРЬ комнаты, на запад).
    this.roomDoorHinge = new THREE.Vector3(x1, this.FLOOR_11_Y, this.ROOM_DOOR_Z + this.ROOM_DOOR_HALF_W);
    this.roomDoorWidth = this.ROOM_DOOR_HALF_W * 2 - 0.02;
    this.roomDoorWorldPos = new THREE.Vector3(x1, this.FLOOR_11_Y + this.DOOR_HEIGHT/2, this.ROOM_DOOR_Z);
    this.roomBounds = new THREE.Box3(
      new THREE.Vector3(x0, this.FLOOR_11_Y, z0),
      new THREE.Vector3(x1, this.FLOOR_11_Y + H, z1)
    );
  }

  // =====================================================
  // ОКНО / ВНЕШНИЙ МИР (ночь, дождь)
  // =====================================================
  _buildOutsideWindow() {
    if (!this.windowParams) return;
    // За окном — простой тёмный «short box» с небольшим slope-эффектом дождя
    // (текстура с движущимися полосами создаётся в Game.js — здесь подложка-небо)
    const wp = this.windowParams;
    const sky = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 5, 5),
      this.M.nightSky
    );
    sky.position.set(wp.x - 0.4, this.FLOOR_11_Y + 1.4, wp.z);
    this.group.add(sky);

    // Несколько далёких «огоньков» города (точечные свечения)
    for (let i = 0; i < 30; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 6, 4),
        new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xfff0a0 : 0xffaa66 })
      );
      const dy = (Math.random() - 0.5) * 3;
      const dz = (Math.random() - 0.5) * 3;
      dot.position.set(wp.x - 0.5, this.FLOOR_11_Y + 1.4 + dy, wp.z + dz);
      this.group.add(dot);
    }
  }

  // =====================================================
  // Public helpers
  // =====================================================

  /**
   * Проверить — между двумя точками в пространстве находится ли стена/дверь.
   * Используется AudioManager для occlusion.
   */
  isOccluded(srcPos, listenerPos) {
    const dir = new THREE.Vector3().subVectors(listenerPos, srcPos);
    const dist = dir.length();
    if (dist < 0.01) return false;
    dir.normalize();
    const ray = new THREE.Raycaster(srcPos.clone(), dir, 0.05, dist - 0.05);
    const hits = ray.intersectObjects(this.solidsForOcclusion, false);
    return hits.length > 0;
  }

  /** Положение, где ставится игрок при старте (внутри номера 1107). */
  getPlayerStart() {
    return new THREE.Vector3(-4.5, this.FLOOR_11_Y + 1.0, -1.5);
  }

  /** Точка перед лифтом на 11 этаже (для камеры). */
  getElevator11Pos() {
    return new THREE.Vector3(0, this.FLOOR_11_Y, this.SHAFT_FRONT_Z - 1.0);
  }

  /** Точка перед лифтом в лобби. */
  getElevator1Pos() {
    return new THREE.Vector3(0, 0, this.SHAFT_FRONT_Z - 1.0);
  }
}
