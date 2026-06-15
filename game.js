// ============================================================
//  THE AMAZING SPIDER-MAN 2D  —  game.js
//  Full engine: physics, player, enemies, web, story, levels
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ---------- resize ----------
function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================================
//  CONSTANTS
// ============================================================
const GRAVITY    = 0.55;
const FRICTION   = 0.82;
const JUMP_FORCE = -14;
const MOVE_SPEED = 5;
const WEB_REGEN  = 0.3;

// ============================================================
//  INPUT
// ============================================================
const keys = {};
const justPressed = {};
window.addEventListener('keydown', e => {
    if (!keys[e.code]) justPressed[e.code] = true;
    keys[e.code] = true;
});
window.addEventListener('keyup',  e => { keys[e.code] = false; });

function consumeKey(code) {
    if (justPressed[code]) { justPressed[code] = false; return true; }
    return false;
}

// ============================================================
//  GAME STATE
// ============================================================
let gameState   = 'intro';   // intro | dialogue | playing | gameover | win
let score       = 0;
let currentLevel = 0;
let frameCount  = 0;
let animId      = null;
let bossBarEl   = null;

// ============================================================
//  STORY / DIALOGUE DATA
// ============================================================
const STORY = [
    // --- Chapter 0 intro ---
    [
        { avatar:'🕷️', name:'Spider-Man', text:'Нью-Йорк… мой город. Я защищаю его каждую ночь.' },
        { avatar:'📻', name:'Радио',      text:'ВНИМАНИЕ! Зелёный Гоблин напал на Таймс-Сквер!' },
        { avatar:'🕷️', name:'Spider-Man', text:'Он не уйдёт далеко. Паутина — не подведи!' },
    ],
    // --- Chapter 1 intro ---
    [
        { avatar:'😈', name:'Зелёный Гоблин', text:'Ха-ха-ха! Паук, ты опоздал! MJ в моих руках!' },
        { avatar:'🕷️', name:'Spider-Man',     text:'Отпусти её, Осборн! Это между нами!' },
        { avatar:'😈', name:'Зелёный Гоблин', text:'Сначала разберись с моими игрушками! АТАКА!' },
    ],
    // --- Chapter 2 intro ---
    [
        { avatar:'🕷️', name:'Spider-Man', text:'Его логово — на крыше Oscorp. Туда мне и надо.' },
        { avatar:'👧', name:'MJ',          text:'(по рации) Питер… осторожно. Их там много…' },
        { avatar:'🕷️', name:'Spider-Man', text:'Держись, MJ. Я иду.' },
    ],
    // --- Final boss intro ---
    [
        { avatar:'😈', name:'Зелёный Гоблин', text:'ПАУК! Ты добрался сюда?! Тогда — умри!' },
        { avatar:'🕷️', name:'Spider-Man',     text:'Всё заканчивается сегодня, Гоблин.' },
        { avatar:'😈', name:'Зелёный Гоблин', text:'Посмотрим, чья паутина крепче! РАААА!!!' },
    ],
];

let dialogueQueue = [];
let dialogueIdx   = 0;
let pendingAfterDialogue = null;

function showDialogue(lines, afterFn) {
    dialogueQueue     = lines;
    dialogueIdx       = 0;
    pendingAfterDialogue = afterFn;
    gameState = 'dialogue';
    applyDialogueLine();
    document.getElementById('dialogueBox').classList.remove('hidden');
}

function applyDialogueLine() {
    const line = dialogueQueue[dialogueIdx];
    document.getElementById('dialogueAvatar').textContent = line.avatar;
    document.getElementById('dialogueName').textContent   = line.name;
    document.getElementById('dialogueText').textContent   = line.text;
}

function nextDialogue() {
    dialogueIdx++;
    if (dialogueIdx >= dialogueQueue.length) {
        document.getElementById('dialogueBox').classList.add('hidden');
        gameState = 'playing';
        if (pendingAfterDialogue) { pendingAfterDialogue(); pendingAfterDialogue = null; }
    } else {
        applyDialogueLine();
    }
}

// ============================================================
//  CAMERA
// ============================================================
const cam = { x: 0, y: 0 };
function updateCamera(player, levelW, levelH) {
    const tw = canvas.width, th = canvas.height;
    cam.x = player.x - tw / 2;
    cam.y = player.y - th / 2;
    cam.x = Math.max(0, Math.min(cam.x, levelW - tw));
    cam.y = Math.max(0, Math.min(cam.y, levelH - th));
}

// ============================================================
//  LEVEL DEFINITIONS
// ============================================================
function makePlatforms(sets) { return sets; }

const LEVELS = [
    // ---- LEVEL 0: Times Square ----
    {
        name:    'Глава 1: Таймс-Сквер',
        width:   3200,
        height:  900,
        bgColor: ['#0d0020','#1a0035'],
        groundY: 820,
        platforms: makePlatforms([
            {x:0,    y:820, w:3200, h:80,  color:'#2a2a3a'},   // ground
            {x:200,  y:680, w:180,  h:20,  color:'#3a3a5a'},
            {x:500,  y:600, w:200,  h:20,  color:'#3a3a5a'},
            {x:800,  y:520, w:160,  h:20,  color:'#3a3a5a'},
            {x:1050, y:600, w:200,  h:20,  color:'#3a3a5a'},
            {x:1300, y:680, w:180,  h:20,  color:'#3a3a5a'},
            {x:1550, y:540, w:220,  h:20,  color:'#3a3a5a'},
            {x:1850, y:640, w:160,  h:20,  color:'#3a3a5a'},
            {x:2100, y:560, w:200,  h:20,  color:'#3a3a5a'},
            {x:2400, y:620, w:180,  h:20,  color:'#3a3a5a'},
            {x:2700, y:500, w:220,  h:20,  color:'#3a3a5a'},
            {x:3000, y:640, w:160,  h:20,  color:'#3a3a5a'},
        ]),
        enemies: [
            {x:600,  type:'thug'},
            {x:900,  type:'thug'},
            {x:1200, type:'thug'},
            {x:1600, type:'thug'},
            {x:1900, type:'thug'},
            {x:2200, type:'thug'},
            {x:2500, type:'thug'},
            {x:2800, type:'thug'},
        ],
        playerStart: {x:100, y:740},
        nextTriggerX: 3100,
    },
    // ---- LEVEL 1: Warehouse ----
    {
        name:    'Глава 2: Склад Гоблина',
        width:   3600,
        height:  900,
        bgColor: ['#0a0a00','#1a1000'],
        groundY: 820,
        platforms: makePlatforms([
            {x:0,    y:820, w:3600, h:80,  color:'#1e1e10'},
            {x:150,  y:680, w:200,  h:20,  color:'#2e2e18'},
            {x:450,  y:580, w:180,  h:20,  color:'#2e2e18'},
            {x:700,  y:500, w:200,  h:20,  color:'#2e2e18'},
            {x:980,  y:590, w:160,  h:20,  color:'#2e2e18'},
            {x:1200, y:480, w:220,  h:20,  color:'#2e2e18'},
            {x:1500, y:560, w:180,  h:20,  color:'#2e2e18'},
            {x:1750, y:440, w:200,  h:20,  color:'#2e2e18'},
            {x:2050, y:540, w:160,  h:20,  color:'#2e2e18'},
            {x:2300, y:460, w:220,  h:20,  color:'#2e2e18'},
            {x:2600, y:540, w:180,  h:20,  color:'#2e2e18'},
            {x:2850, y:440, w:200,  h:20,  color:'#2e2e18'},
            {x:3100, y:560, w:160,  h:20,  color:'#2e2e18'},
            {x:3350, y:680, w:180,  h:20,  color:'#2e2e18'},
        ]),
        enemies: [
            {x:500,  type:'thug'},
            {x:750,  type:'thug'},
            {x:1050, type:'shooter'},
            {x:1300, type:'thug'},
            {x:1600, type:'shooter'},
            {x:1900, type:'thug'},
            {x:2200, type:'shooter'},
            {x:2500, type:'thug'},
            {x:2800, type:'shooter'},
            {x:3100, type:'thug'},
        ],
        playerStart: {x:100, y:740},
        nextTriggerX: 3450,
    },
    // ---- LEVEL 2: Oscorp Rooftop ----
    {
        name:    'Глава 3: Крыша Оскорп',
        width:   4000,
        height:  900,
        bgColor: ['#000510','#001030'],
        groundY: 820,
        platforms: makePlatforms([
            {x:0,    y:820, w:4000, h:80,  color:'#0a1020'},
            {x:100,  y:700, w:180,  h:20,  color:'#1a2040'},
            {x:350,  y:620, w:200,  h:20,  color:'#1a2040'},
            {x:620,  y:530, w:180,  h:20,  color:'#1a2040'},
            {x:870,  y:620, w:160,  h:20,  color:'#1a2040'},
            {x:1100, y:500, w:220,  h:20,  color:'#1a2040'},
            {x:1400, y:580, w:180,  h:20,  color:'#1a2040'},
            {x:1680, y:460, w:200,  h:20,  color:'#1a2040'},
            {x:1960, y:560, w:160,  h:20,  color:'#1a2040'},
            {x:2200, y:440, w:220,  h:20,  color:'#1a2040'},
            {x:2500, y:540, w:180,  h:20,  color:'#1a2040'},
            {x:2760, y:420, w:200,  h:20,  color:'#1a2040'},
            {x:3060, y:540, w:160,  h:20,  color:'#1a2040'},
            {x:3300, y:660, w:180,  h:20,  color:'#1a2040'},
        ]),
        enemies: [
            {x:400,  type:'thug'},
            {x:680,  type:'shooter'},
            {x:950,  type:'thug'},
            {x:1200, type:'shooter'},
            {x:1500, type:'thug'},
            {x:1800, type:'shooter'},
            {x:2100, type:'thug'},
            {x:2400, type:'shooter'},
            {x:2700, type:'thug'},
            {x:3000, type:'shooter'},
            {x:3200, type:'thug'},
            {x:3500, type:'shooter'},
        ],
        playerStart: {x:100, y:740},
        nextTriggerX: 3750,
        isBossLevel: true,
    },
];

// ============================================================
//  PLAYER
// ============================================================
let player = {};
function initPlayer(startX, startY) {
    player = {
        x: startX, y: startY,
        vx: 0, vy: 0,
        w: 32, h: 44,
        onGround: false,
        onWall: false,
        wallDir: 0,
        hp: 100, maxHp: 100,
        web: 100, maxWeb: 100,
        webLine: null,        // {x,y} anchor point
        webSwinging: false,
        webLen: 0,
        webAngle: 0,
        webAngVel: 0,
        facing: 1,            // 1=right, -1=left
        attackTimer: 0,
        attackCooldown: 18,
        hitTimer: 0,
        dead: false,
        frame: 0,
        frameTimer: 0,
        state: 'idle',        // idle|run|jump|swing|attack|wall
        invincible: 0,
        combo: 0,
        comboTimer: 0,
    };
}

// ============================================================
//  ENEMIES
// ============================================================
let enemies  = [];
let bullets  = [];
let particles= [];
let webLines = [];

function spawnEnemies(defs, groundY) {
    enemies = defs.map((d, i) => ({
        id: i,
        x: d.x, y: groundY - 44,
        vx: 0, vy: 0,
        w: 30, h: 44,
        hp: d.type === 'shooter' ? 60 : 80,
        maxHp: d.type === 'shooter' ? 60 : 80,
        type: d.type,
        facing: -1,
        state: 'patrol',   // patrol|alert|attack|hurt|dead
        patrolDir: -1,
        patrolTimer: 0,
        attackTimer: 0,
        alertTimer: 0,
        dead: false,
        hitTimer: 0,
        frame: 0,
        frameTimer: 0,
        onGround: true,
    }));
}

// ============================================================
//  BOSS
// ============================================================
let boss = null;
function spawnBoss(lv) {
    boss = {
        x: lv.width - 400, y: lv.groundY - 80,
        vx: -2, vy: 0,
        w: 50, h: 70,
        hp: 300, maxHp: 300,
        phase: 1,
        attackTimer: 0,
        bombTimer: 60,
        dashTimer: 0,
        state: 'fly',
        facing: -1,
        dead: false,
        hitTimer: 0,
        onGround: false,
        glide: 0,
        swoopTarget: null,
    };
    // Create boss bar DOM element
    if (!bossBarEl) {
        bossBarEl = document.createElement('div');
        bossBarEl.className = 'boss-bar-wrap';
        bossBarEl.innerHTML = `
            <div class="boss-name-label">🎃 ЗЕЛЁНЫЙ ГОБЛИН</div>
            <div class="boss-bar-outer">
                <div class="boss-bar-inner" id="bossBarInner"></div>
            </div>`;
        document.body.appendChild(bossBarEl);
    }
    bossBarEl.style.display = 'block';
}

function updateBossBar() {
    if (!boss || !bossBarEl) return;
    const pct = Math.max(0, boss.hp / boss.maxHp * 100);
    document.getElementById('bossBarInner').style.width = pct + '%';
}

// ============================================================
//  PARTICLES
// ============================================================
function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color,
            r: 2 + Math.random() * 4,
        });
    }
}

function spawnWebParticle(x, y) {
    particles.push({
        x, y,
        vx: (Math.random()-0.5)*3,
        vy: -3 + Math.random()*2,
        life: 20,
        maxLife: 20,
        color: '#aaddff',
        r: 2,
    });
}

// ============================================================
//  COLLISION HELPERS
// ============================================================
function rectOverlap(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x &&
           a.y < b.y+b.h && a.y+a.h > b.y;
}

function platformCollide(entity, platforms) {
    entity.onGround = false;
    for (const p of platforms) {
        if (entity.x + entity.w > p.x && entity.x < p.x + p.w) {
            // Landing on top
            if (entity.vy >= 0 &&
                entity.y + entity.h > p.y &&
                entity.y + entity.h < p.y + p.h + entity.vy + 4) {
                entity.y = p.y - entity.h;
                entity.vy = 0;
                entity.onGround = true;
            }
        }
        // Head bump
        if (entity.vy < 0 &&
            entity.x + entity.w > p.x && entity.x < p.x + p.w &&
            entity.y < p.y + p.h && entity.y > p.y) {
            entity.y = p.y + p.h;
            entity.vy = 0;
        }
    }
}

// ============================================================
//  LEVEL STATE
// ============================================================
let level = null;

function loadLevel(idx) {
    currentLevel = idx;
    level = LEVELS[idx];

    initPlayer(level.playerStart.x, level.playerStart.y);
    spawnEnemies(level.enemies, level.groundY);
    bullets   = [];
    particles = [];
    webLines  = [];
    boss      = null;

    if (bossBarEl) bossBarEl.style.display = 'none';

    document.getElementById('levelName').textContent = level.name;
    updateHUD();
}

// ============================================================
//  HUD
// ============================================================
function updateHUD() {
    document.getElementById('hpBar').style.width  = (player.hp/player.maxHp*100)+'%';
    document.getElementById('webBar').style.width = (player.web/player.maxWeb*100)+'%';
    document.getElementById('hpText').textContent  = Math.ceil(player.hp);
    document.getElementById('webText').textContent = Math.ceil(player.web);
    document.getElementById('scoreText').textContent = score;
    const alive = enemies.filter(e=>!e.dead).length + (boss&&!boss.dead?1:0);
    document.getElementById('enemiesText').textContent = alive;
}

// ============================================================
//  PLAYER UPDATE
// ============================================================
function updatePlayer() {
    if (player.dead) return;

    // --- Timers ---
    if (player.attackTimer  > 0) player.attackTimer--;
    if (player.hitTimer     > 0) player.hitTimer--;
    if (player.invincible   > 0) player.invincible--;
    if (player.comboTimer   > 0) { player.comboTimer--; if (!player.comboTimer) player.combo = 0; }

    // --- Web regen ---
    if (!player.webSwinging && player.web < player.maxWeb)
        player.web = Math.min(player.maxWeb, player.web + WEB_REGEN);

    // --- Web swing ---
    if (player.webSwinging && player.webLine) {
        const ax = player.webLine.x, ay = player.webLine.y;
        const dx = player.x + player.w/2 - ax;
        const dy = player.y + player.h/2 - ay;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Angular physics
        const g = GRAVITY;
        const sin_a = dx / dist;
        player.webAngVel += -g / player.webLen * sin_a;
        player.webAngVel *= 0.98;
        player.webAngle  += player.webAngVel;

        // Move from angle
        player.x = ax + Math.sin(player.webAngle) * player.webLen - player.w/2;
        player.y = ay + Math.cos(player.webAngle) * player.webLen - player.h/2;

        // Apply horizontal input while swinging
        if (keys['ArrowLeft']  || keys['KeyA']) { player.webAngVel -= 0.018; player.facing = -1; }
        if (keys['ArrowRight'] || keys['KeyD']) { player.webAngVel += 0.018; player.facing =  1; }

        // Release web
        if (consumeKey('KeyZ') || consumeKey('Space')) {
            player.vx = player.webAngVel * player.webLen * 0.18;
            player.vy = -Math.abs(player.webAngVel) * player.webLen * 0.12 - 4;
            releaseWeb();
        }

        player.state = 'swing';
        player.web   = Math.max(0, player.web - 0.4);
        if (player.web <= 0) releaseWeb();
        return;
    }

    // --- Horizontal move ---
    let moving = false;
    if (keys['ArrowLeft']  || keys['KeyA']) {
        player.vx  = -MOVE_SPEED;
        player.facing = -1;
        moving = true;
    } else if (keys['ArrowRight'] || keys['KeyD']) {
        player.vx = MOVE_SPEED;
        player.facing = 1;
        moving = true;
    } else {
        player.vx *= FRICTION;
    }

    // --- Jump ---
    if ((consumeKey('ArrowUp') || consumeKey('KeyW') || consumeKey('Space')) && (player.onGround || player.onWall)) {
        player.vy = JUMP_FORCE;
        if (player.onWall) player.vx = player.wallDir * 7;
        player.onGround = false;
        player.onWall   = false;
        spawnParticles(player.x + player.w/2, player.y + player.h, '#aaaaff', 5);
    }

    // --- Throw web (Z) ---
    if (consumeKey('KeyZ') && player.web > 20) {
        throwWeb();
    }

    // --- Attack (X) ---
    if ((consumeKey('KeyX') || consumeKey('ShiftLeft')) && player.attackTimer === 0) {
        player.attackTimer = player.attackCooldown;
        player.combo++;
        player.comboTimer = 40;
        doAttack();
    }

    // --- Gravity ---
    player.vy += GRAVITY;

    // --- Wall slide ---
    player.onWall = false;
    const wallLeft  = level.platforms.find(p =>
        player.x <= p.x + p.w && player.x + 4 >= p.x + p.w &&
        player.y + player.h > p.y + 5 && player.y < p.y + p.h - 5);
    const wallRight = level.platforms.find(p =>
        player.x + player.w >= p.x && player.x + player.w - 4 <= p.x &&
        player.y + player.h > p.y + 5 && player.y < p.y + p.h - 5);

    if (!player.onGround) {
        if (wallLeft && (keys['ArrowLeft']||keys['KeyA'])) {
            player.vy = Math.min(player.vy, 1.5);
            player.onWall  = true;
            player.wallDir =  1;
        } else if (wallRight && (keys['ArrowRight']||keys['KeyD'])) {
            player.vy = Math.min(player.vy, 1.5);
            player.onWall  = true;
            player.wallDir = -1;
        }
    }

    // --- Apply velocity ---
    player.x += player.vx;
    player.y += player.vy;

    // --- Boundary ---
    player.x = Math.max(0, Math.min(player.x, level.width - player.w));

    // --- Platform collision ---
    platformCollide(player, level.platforms);

    // --- Fall out ---
    if (player.y > level.height + 100) {
        damagePlayer(30);
        player.y  = level.playerStart.y;
        player.x  = level.playerStart.x;
        player.vy = 0;
    }

    // --- State ---
    if      (player.onWall)         player.state = 'wall';
    else if (!player.onGround)      player.state = 'jump';
    else if (moving)                player.state = 'run';
    else                            player.state = 'idle';
    if (player.attackTimer > player.attackCooldown - 6) player.state = 'attack';

    // --- Frame animation ---
    player.frameTimer++;
    if (player.frameTimer >= 8) { player.frame = (player.frame+1)%4; player.frameTimer=0; }
}

// ============================================================
//  WEB MECHANICS
// ============================================================
function throwWeb() {
    // Find nearest ceiling/wall point above player
    const anchorX = player.x + player.w/2 + player.facing * 80;
    const anchorY = player.y - 160;

    player.webLine    = { x: anchorX, y: anchorY };
    player.webSwinging = true;
    const dx = player.x + player.w/2 - anchorX;
    const dy = player.y + player.h/2 - anchorY;
    player.webLen   = Math.sqrt(dx*dx + dy*dy);
    player.webAngle = Math.atan2(dx, dy);
    player.webAngVel = player.vx * 0.04;

    player.web -= 15;
    spawnParticles(anchorX, anchorY, '#44aaff', 4);
}

function releaseWeb() {
    player.webSwinging = false;
    player.webLine     = null;
}

// ============================================================
//  COMBAT
// ============================================================
function doAttack() {
    const reach = 70;
    const cx    = player.x + player.w/2 + player.facing * reach/2;
    const cy    = player.y + player.h/2;
    const dmg   = player.combo >= 3 ? 30 : 20;

    // Hit enemies
    enemies.forEach(e => {
        if (e.dead) return;
        const ex = e.x + e.w/2, ey = e.y + e.h/2;
        if (Math.abs(ex - cx) < 55 && Math.abs(ey - cy) < 40) {
            damageEnemy(e, dmg);
            e.vx = player.facing * 5;
            e.vy = -4;
        }
    });

    // Hit boss
    if (boss && !boss.dead) {
        const bx = boss.x + boss.w/2, by = boss.y + boss.h/2;
        if (Math.abs(bx - cx) < 60 && Math.abs(by - cy) < 50) {
            boss.hp -= dmg;
            boss.hitTimer = 12;
            spawnParticles(bx, by, '#ff8800', 10);
            score += 15;
            if (boss.hp <= 0) killBoss();
        }
    }

    spawnParticles(cx, cy, '#ffaa00', 6);
}

function damagePlayer(amount) {
    if (player.invincible > 0 || player.dead) return;
    player.hp -= amount;
    player.invincible = 50;
    player.hitTimer   = 15;
    spawnParticles(player.x+player.w/2, player.y+player.h/2, '#ff0000', 8);
    if (player.hp <= 0) {
        player.hp   = 0;
        player.dead = true;
        setTimeout(showGameOver, 1200);
    }
}

function damageEnemy(e, amount) {
    e.hp -= amount;
    e.hitTimer = 12;
    score += 10;
    spawnParticles(e.x+e.w/2, e.y+e.h/2, '#ffaa00', 6);
    if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
    e.dead = true;
    score += 50;
    spawnParticles(e.x+e.w/2, e.y+e.h/2, '#ff4400', 12);
    checkLevelClear();
}

function killBoss() {
    boss.dead = true;
    score += 500;
    if (bossBarEl) bossBarEl.style.display = 'none';
    spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, '#ff8800', 30);
    setTimeout(() => showWin(), 2000);
}

function checkLevelClear() {
    if (!enemies.every(e=>e.dead)) return;
    if (level.isBossLevel && boss && !boss.dead) return;
    // Advance level after delay
    const nextIdx = currentLevel + 1;
    if (nextIdx < LEVELS.length || level.isBossLevel) {
        // Handled by trigger or boss death
    }
}

// ============================================================
//  ENEMY AI
// ============================================================
function updateEnemy(e) {
    if (e.dead) return;
    if (e.hitTimer > 0) e.hitTimer--;
    if (e.attackTimer > 0) e.attackTimer--;
    e.frameTimer++;
    if (e.frameTimer >= 10) { e.frame=(e.frame+1)%4; e.frameTimer=0; }

    const px = player.x + player.w/2;
    const py = player.y + player.h/2;
    const ex = e.x + e.w/2;
    const ey = e.y + e.h/2;
    const dist = Math.sqrt((px-ex)**2 + (py-ey)**2);

    // Detect player
    if (dist < 400) { e.state = 'alert'; e.facing = px > ex ? 1 : -1; }
    else            { e.state = 'patrol'; }

    if (e.state === 'alert') {
        // Chase
        const spd = e.type === 'shooter' ? 1.5 : 2.2;
        if (dist > 80) {
            e.vx = e.facing * spd;
        } else {
            e.vx *= 0.8;
        }

        // Attack
        if (e.attackTimer === 0) {
            if (e.type === 'thug' && dist < 65) {
                if (player.invincible === 0) {
                    damagePlayer(12);
                    e.attackTimer = 60;
                }
            } else if (e.type === 'shooter' && dist < 350 && dist > 100) {
                shootBullet(e);
                e.attackTimer = 90;
            }
        }
    } else {
        // Patrol
        e.patrolTimer++;
        if (e.patrolTimer > 80) { e.patrolDir *= -1; e.patrolTimer = 0; }
        e.vx = e.patrolDir * 1;
        e.facing = e.patrolDir;
    }

    // Gravity
    e.vy += GRAVITY;
    e.x  += e.vx;
    e.y  += e.vy;

    // Boundary
    e.x = Math.max(0, Math.min(e.x, level.width - e.w));

    // Platform collide
    platformCollide(e, level.platforms);
}

function shootBullet(e) {
    const angle = Math.atan2(
        player.y + player.h/2 - (e.y + e.h/2),
        player.x + player.w/2 - (e.x + e.w/2)
    );
    bullets.push({
        x: e.x + e.w/2, y: e.y + e.h/2,
        vx: Math.cos(angle)*7, vy: Math.sin(angle)*7,
        life: 90, owner: 'enemy',
        w: 10, h: 10,
    });
}

// ============================================================
//  BOSS AI
// ============================================================
function updateBoss() {
    if (!boss || boss.dead) return;
    if (boss.hitTimer > 0) boss.hitTimer--;

    const px = player.x + player.w/2;
    const py = player.y + player.h/2;

    boss.frameTimer = (boss.frameTimer||0)+1;

    // Phase 2 threshold
    if (boss.hp < boss.maxHp * 0.5 && boss.phase === 1) {
        boss.phase = 2;
        spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, '#ff8800', 20);
    }

    const speed = boss.phase === 2 ? 3.5 : 2.2;

    // Fly toward player (horizontally)
    boss.vx += (px - (boss.x+boss.w/2)) * 0.01;
    boss.vx   = Math.max(-speed, Math.min(speed, boss.vx));
    boss.vx  *= 0.95;

    // Bob up/down
    boss.glide = (boss.glide||0) + 0.04;
    const targetY = py - 80 + Math.sin(boss.glide) * 40;
    boss.vy += (targetY - boss.y) * 0.04;
    boss.vy  *= 0.88;

    boss.x += boss.vx;
    boss.y += boss.vy;

    boss.facing = boss.vx > 0 ? 1 : -1;

    // Clamp to level
    boss.x = Math.max(50, Math.min(boss.x, level.width - boss.w - 50));
    boss.y = Math.max(60, Math.min(boss.y, level.groundY - boss.h - 20));

    // --- Bomb attack ---
    boss.bombTimer--;
    const bombInterval = boss.phase === 2 ? 80 : 130;
    if (boss.bombTimer <= 0) {
        boss.bombTimer = bombInterval;
        shootBossProjectile();
        if (boss.phase === 2) {
            setTimeout(() => { if(boss&&!boss.dead) shootBossProjectile(true); }, 300);
        }
    }

    // --- Contact damage ---
    if (rectOverlap(player, boss) && player.invincible === 0) {
        damagePlayer(15);
    }

    updateBossBar();
}

function shootBossProjectile(spread = false) {
    if (!boss) return;
    const px = player.x + player.w/2;
    const py = player.y + player.h/2;
    const angle = Math.atan2(py-(boss.y+boss.h/2), px-(boss.x+boss.w/2)) + (spread?(Math.random()-0.5)*0.5:0);
    bullets.push({
        x: boss.x+boss.w/2, y: boss.y+boss.h/2,
        vx: Math.cos(angle)*6, vy: Math.sin(angle)*6,
        life: 120, owner: 'boss',
        w: 14, h: 14,
        color: '#ff8800',
    });
}

// ============================================================
//  BULLETS UPDATE
// ============================================================
function updateBullets() {
    for (let i = bullets.length-1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;
        if (b.life <= 0) { bullets.splice(i,1); continue; }

        // Enemy bullet hits player
        if ((b.owner === 'enemy'||b.owner==='boss') && player.invincible===0) {
            if (rectOverlap(player, b)) {
                damagePlayer(b.owner==='boss'?18:10);
                spawnParticles(b.x,b.y,'#ff4400',5);
                bullets.splice(i,1);
                continue;
            }
        }

        // Hit platform
        let hitPlatform = false;
        for (const p of level.platforms) {
            if (rectOverlap(b, p)) { hitPlatform=true; break; }
        }
        if (hitPlatform) { spawnParticles(b.x,b.y,'#888',4); bullets.splice(i,1); continue; }
    }
}

// ============================================================
//  PARTICLES UPDATE
// ============================================================
function updateParticles() {
    for (let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.x   += p.vx;
        p.y   += p.vy;
        p.vy  += 0.15;
        p.life--;
        if (p.life<=0) { particles.splice(i,1); }
    }
}

// ============================================================
//  LEVEL TRIGGER
// ============================================================
function checkLevelTrigger() {
    if (!level.isBossLevel && player.x >= level.nextTriggerX) {
        const next = currentLevel + 1;
        if (next < LEVELS.length) {
            gameState = 'dialogue';
            showDialogue(STORY[next], () => {
                loadLevel(next);
                // Boss spawns only after all normal enemies defeated (handled in checkLevelTrigger)
            });
        }
    }
    // Boss level: after all normal enemies dead, reveal boss
    if (level.isBossLevel && !boss && enemies.every(e=>e.dead)) {
        showDialogue(STORY[3], () => { spawnBoss(level); });
    }
}

// ============================================================
//  DRAWING
// ============================================================
// --- Background ---
function drawBackground() {
    const [c1, c2] = level.bgColor;
    const grad = ctx.createLinearGradient(0,0,0,canvas.height);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars / city lights
    ctx.save();
    ctx.translate(-cam.x * 0.2, -cam.y * 0.2);
    for (let i=0; i<80; i++) {
        const sx = ((i*137 + 50) % level.width);
        const sy = ((i*89  + 30) % (level.groundY * 0.7));
        const bright = (Math.sin(frameCount*0.05 + i) * 0.3 + 0.7);
        ctx.fillStyle = `rgba(255,255,200,${bright * 0.7})`;
        ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.restore();

    // City silhouette
    drawCitySilhouette();
}

function drawCitySilhouette() {
    ctx.save();
    ctx.translate(-cam.x * 0.4, -cam.y * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const buildings = [
        {x:0,    w:120, h:320},
        {x:100,  w:80,  h:260},
        {x:250,  w:140, h:380},
        {x:360,  w:90,  h:290},
        {x:500,  w:110, h:420},
        {x:580,  w:70,  h:250},
        {x:700,  w:130, h:360},
        {x:800,  w:100, h:310},
        {x:950,  w:120, h:400},
        {x:1040, w:80,  h:270},
        {x:1180, w:140, h:450},
    ];
    buildings.forEach(b => {
        ctx.fillRect(b.x, level.groundY - b.h, b.w, b.h);
        // Windows
        ctx.fillStyle = 'rgba(255,220,100,0.25)';
        for (let wy=0; wy<b.h; wy+=24) {
            for (let wx=8; wx<b.w-8; wx+=18) {
                if (Math.random() > 0.4)
                    ctx.fillRect(b.x+wx, level.groundY-b.h+wy+4, 8, 12);
            }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
    });
    ctx.restore();
}

// --- Platforms ---
function drawPlatforms() {
    level.platforms.forEach(p => {
        const rx = p.x - cam.x, ry = p.y - cam.y;
        // Surface
        ctx.fillStyle = p.color;
        ctx.fillRect(rx, ry, p.w, p.h);
        // Edge glow
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(rx, ry, p.w, 3);
    });
}

// --- Player ---
function drawPlayer() {
    const x = player.x - cam.x;
    const y = player.y - cam.y;
    const w = player.w, h = player.h;

    // Flash when hurt
    if (player.invincible > 0 && Math.floor(player.invincible/4)%2===0) return;

    ctx.save();
    ctx.translate(x + w/2, y + h/2);
    ctx.scale(player.facing, 1);

    // Draw web line if swinging
    if (player.webSwinging && player.webLine) {
        ctx.save();
        ctx.scale(player.facing, 1); // unscale for world coords
        ctx.restore();
    }

    // Body
    const bodyColor = player.hitTimer > 0 ? '#ff4444' : '#cc0000';
    // Legs
    ctx.fillStyle = '#1a1a6e';
    ctx.fillRect(-w/2, h*0.2, w, h*0.5);

    // Torso
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-w/2, -h/2, w, h*0.7);

    // Spider symbol on chest
    ctx.fillStyle = '#000';
    ctx.font = '18px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🕷', 0, -h*0.05);

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-w*0.2, -h*0.38, 6, 5, -0.3, 0, Math.PI*2);
    ctx.ellipse( w*0.2, -h*0.38, 6, 5,  0.3, 0, Math.PI*2);
    ctx.fill();

    // Running animation
    if (player.state === 'run') {
        const kick = Math.sin(player.frame * Math.PI/2) * 4;
        ctx.fillStyle = '#1a1a6e';
        ctx.fillRect(-w/2 - 3, h*0.25 + kick, w*0.4, h*0.3);
        ctx.fillRect( w*0.1,   h*0.25 - kick, w*0.4, h*0.3);
    }

    // Attack flash
    if (player.attackTimer > player.attackCooldown - 6) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(w/2 + 10, 0, 20, -Math.PI/3, Math.PI/3);
        ctx.stroke();
    }

    ctx.restore();
}

// --- Web Line ---
function drawWebLine() {
    if (!player.webSwinging || !player.webLine) return;
    const sx = player.x + player.w/2 - cam.x;
    const sy = player.y - cam.y;
    const ex = player.webLine.x - cam.x;
    const ey = player.webLine.y - cam.y;

    ctx.save();
    ctx.strokeStyle = '#aaddff';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#44aaff';
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    // Slight curve
    const mx = (sx+ex)/2 - (ey-sy)*0.1;
    const my = (sy+ey)/2 + (ex-sx)*0.1;
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.restore();
}

// --- Enemy ---
function drawEnemy(e) {
    if (e.dead) return;
    const x = e.x - cam.x, y = e.y - cam.y;
    const w = e.w, h = e.h;

    ctx.save();
    ctx.translate(x + w/2, y + h/2);
    ctx.scale(e.facing, 1);

    const color = e.hitTimer > 0 ? '#ffffff' :
                  e.type === 'shooter' ? '#663300' : '#334455';

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(-w/2, -h/2, w, h*0.65);

    // Pants
    ctx.fillStyle = '#222';
    ctx.fillRect(-w/2, h*0.15, w, h*0.35);

    // Head
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -h/2 - 10, 12, 0, Math.PI*2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = e.state==='alert' ? '#ff0000' : '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -h/2-10, 4, 0, Math.PI*2);
    ctx.fill();

    // Shooter has gun
    if (e.type === 'shooter') {
        ctx.fillStyle = '#444';
        ctx.fillRect(w/2 - 4, -6, 16, 6);
    }

    ctx.restore();

    // HP bar
    if (e.hp < e.maxHp) {
        const bw = w;
        const pct = e.hp/e.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y-10, bw, 5);
        ctx.fillStyle = pct>0.5 ? '#44dd44' : pct>0.25 ? '#ffaa00' : '#ff2222';
        ctx.fillRect(x, y-10, bw*pct, 5);
    }
}

// --- Boss ---
function drawBoss() {
    if (!boss || boss.dead) return;
    const x = boss.x - cam.x, y = boss.y - cam.y;
    const w = boss.w, h = boss.h;

    if (boss.hitTimer > 0 && Math.floor(boss.hitTimer/3)%2===0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
    }

    ctx.save();
    ctx.translate(x+w/2, y+h/2);
    ctx.scale(boss.facing, 1);

    // Glider
    ctx.fillStyle = '#aa4400';
    ctx.fillRect(-w/2-20, h*0.2, w+40, 12);

    // Body
    ctx.fillStyle = boss.phase===2 ? '#220000' : '#1a3300';
    ctx.fillRect(-w/2, -h/2, w, h*0.7);

    // Cape
    ctx.fillStyle = '#552200';
    ctx.beginPath();
    ctx.moveTo(-w/2, -h/2);
    ctx.lineTo(-w/2-20, h/2);
    ctx.lineTo( w/2+20, h/2);
    ctx.lineTo( w/2, -h/2);
    ctx.fill();

    // Head / Mask
    ctx.fillStyle = '#2a4a00';
    ctx.beginPath();
    ctx.arc(0, -h/2-12, 18, 0, Math.PI*2);
    ctx.fill();

    // Goblin ears
    ctx.fillStyle = '#2a4a00';
    ctx.beginPath();
    ctx.moveTo(-14, -h/2-22); ctx.lineTo(-22, -h/2-40); ctx.lineTo(-5, -h/2-20); ctx.fill();
    ctx.beginPath();
    ctx.moveTo( 14, -h/2-22); ctx.lineTo( 22, -h/2-40); ctx.lineTo(  5, -h/2-20); ctx.fill();

    // Eyes glow
    const eyeColor = boss.phase===2 ? '#ff2200' : '#ff8800';
    ctx.fillStyle = eyeColor;
    ctx.shadowColor = eyeColor; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(-7, -h/2-10, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 7, -h/2-10, 5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    if (boss.hitTimer > 0) ctx.restore();
}

// --- Bullets ---
function drawBullets() {
    bullets.forEach(b => {
        const x = b.x - cam.x, y = b.y - cam.y;
        ctx.save();
        ctx.fillStyle  = b.color || '#ff4400';
        ctx.shadowColor = b.color || '#ff4400';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, b.w/2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    });
}

// --- Particles ---
function drawParticles() {
    particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    });
}

// --- Next level arrow ---
function drawLevelArrow() {
    if (level.isBossLevel) return;
    const ax = level.nextTriggerX - cam.x;
    const ay = level.groundY - 80 - cam.y;
    const pulse = Math.sin(frameCount*0.1)*6;
    ctx.save();
    ctx.fillStyle = '#ffcc00';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 15;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▶▶', ax, ay + pulse);
    ctx.font = '14px Oswald';
    ctx.fillText('ДАЛЬШЕ', ax, ay + 30 + pulse);
    ctx.restore();
}

// --- Combo text ---
function drawCombo() {
    if (player.combo < 2 || player.comboTimer <= 0) return;
    const alpha = Math.min(1, player.comboTimer / 40);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle  = player.combo >= 3 ? '#ff8800' : '#ffdd00';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.font = `bold ${20+player.combo*4}px Bangers, cursive`;
    ctx.textAlign = 'center';
    ctx.fillText(`COMBO x${player.combo}!`, player.x+player.w/2-cam.x, player.y-cam.y-20);
    ctx.restore();
}

// ============================================================
//  MAIN LOOP
// ============================================================
function gameLoop() {
    frameCount++;
    animId = requestAnimationFrame(gameLoop);

    if (gameState !== 'playing') {
        // Still draw the game behind dialogues
        if (gameState === 'dialogue' && level) {
            renderScene();
        }
        return;
    }

    // --- Update ---
    updatePlayer();
    enemies.forEach(updateEnemy);
    updateBoss();
    updateBullets();
    updateParticles();
    checkLevelTrigger();
    updateCamera(player, level.width, level.height);
    updateHUD();
    clearJustPressed();

    // --- Render ---
    renderScene();
}

function renderScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawPlatforms();
    drawWebLine();
    enemies.forEach(drawEnemy);
    drawBoss();
    drawBullets();
    drawParticles();
    drawPlayer();
    drawLevelArrow();
    drawCombo();
}

function clearJustPressed() {
    for (const k in justPressed) justPressed[k] = false;
}

// ============================================================
//  GAME OVER / WIN
// ============================================================
function showGameOver() {
    gameState = 'gameover';
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('gameOverScreen').classList.add('active');
    document.getElementById('gameUI').classList.add('hidden');
    if (bossBarEl) bossBarEl.style.display = 'none';
}

function showWin() {
    gameState = 'win';
    document.getElementById('winScreen').classList.remove('hidden');
    document.getElementById('winScreen').classList.add('active');
    document.getElementById('gameUI').classList.add('hidden');
    document.getElementById('finalScore').textContent = score;
    if (bossBarEl) bossBarEl.style.display = 'none';
}

// ============================================================
//  PUBLIC API (called from HTML)
// ============================================================
function startGame() {
    document.getElementById('introScreen').classList.remove('active');
    document.getElementById('introScreen').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');

    score = 0;
    loadLevel(0);
    gameState = 'dialogue';

    if (animId) cancelAnimationFrame(animId);
    gameLoop();

    showDialogue(STORY[0], () => { gameState = 'playing'; });
}

function restartGame() {
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('active');
    document.getElementById('winScreen').classList.add('hidden');
    document.getElementById('winScreen').classList.remove('active');
    document.getElementById('gameUI').classList.remove('hidden');

    score = 0;
    loadLevel(0);
    gameState = 'dialogue';
    showDialogue(STORY[0], () => { gameState = 'playing'; });
}
