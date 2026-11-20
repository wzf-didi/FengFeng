'use strict';

/* ============================================================
 * 1. 可调参数 —— 想改手感直接在这里填
 * ============================================================ */
const CFG = {
  moveSpeed: 250,   // 左右移动速度（像素/秒）
  jumpPower: 680,   // 起跳速度（像素/秒，越大跳得越高）
  gravity: 1750,    // 重力加速度（像素/秒²）
  groundY: 432,     // 地面高度：角色脚底所在的 y
  heroHeight: 158,  // 角色显示高度（各状态统一到这个高度）
  walkFps: 10,      // 行走动画播放帧率
  jumpFps: 6,       // 跳跃动画播放帧率
  birdGap: [4, 9],  // 飞鸟出现间隔（秒）
  deadZone: 2 / 3,  // 屏幕中间这块宽度内人物移动时背景不动
  worldScreens: 3,  // 地图总宽度 = 屏幕宽度的几倍
  weaponFps: 3,      // 武器待机动画帧率
  weaponFloat: 7,    // 武器上下浮动幅度（像素）
  weaponHeight: 110, // 武器显示高度
  weaponBack: 0.9,   // 背后水平距离 = 人物半宽 × 此系数
  weaponRise: 0.58,  // 竖直位置 = 人物脚底往上 人物高度 × 此系数
  weaponBias: 1,    // 水平微调（正值往朝向方向偏）
};

/* ============================================================
 * 2. 画框配置 —— 每帧在精灵图里的像素范围 { x, y, w, h }
 *    播放时只切换画框：取 frames[帧号]，把这个矩形画出来。
 * ============================================================ */

// 行走图 9 个画框
const WALK_BOXES = [
  { x: 10,  y: 87, w: 56, h: 138 },  // 第 1 帧
  { x: 67,  y: 87, w: 57, h: 138 },  // 第 2 帧
  { x: 127, y: 87, w: 52, h: 138 },  // 第 3 帧
  { x: 180, y: 87, w: 56, h: 138 },  // 第 4 帧
  { x: 232, y: 87, w: 56, h: 138 },  // 第 5 帧
  { x: 288, y: 87, w: 52, h: 138 },  // 第 6 帧
  { x: 342, y: 87, w: 52, h: 138 },  // 第 7 帧
  { x: 395, y: 87, w: 56, h: 138 },  // 第 8 帧
  { x: 450, y: 87, w: 64, h: 138 },  // 第 9 帧
];

const SPR = {
  idle: {
    file: 'image/stop.png', flip: false,
    frames: [ { x: 197, y: 9, w: 135, h: 273 } ],
  },
  walkR: {
    file: 'image/men3.png', flip: false,
    frames: WALK_BOXES,
  },
  walkL: {
    file: 'image/men3-1.png', flip: true,   // 左行走：图片水平翻转
    frames: WALK_BOXES,
  },
  jump: {
    file: 'image/drop.png', flip: false,
    frames: [
      { x: 6,   y: 90, w: 140, h: 211 },  // 第 1 帧
      { x: 173, y: 33, w: 140, h: 213 },  // 第 2 帧
      { x: 347, y: 17, w: 140, h: 225 },  // 第 3 帧
    ],
  },
  weapon: {
    file: 'image/knife.png', flip: false,
    // 竖排三帧待机图，实测包围盒
    frames: [
      { x: 102, y: 9,   w: 50, h: 152 },  // 第 1 帧
      { x: 116, y: 181, w: 54, h: 157 },  // 第 2 帧
      { x: 143, y: 354, w: 50, h: 153 },  // 第 3 帧
    ],
  },
};

/* ============================================================
 * 3. 画布、世界坐标与摄像机
 * ============================================================ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;
const rnd = (a, b) => a + Math.random() * (b - a);

const BASE_H = 540;
let scaleX = 1;
const scaleY = 1;              // 纵向不缩放，保持不变

let WORLD_W = 0;               // 地图总宽度
let camX = 0;                  // 摄像机左边缘对应的世界 x

// 把世界坐标换算成屏幕坐标；parallax 为视差系数（远近层滚动速度不同）
const toScreenX = (worldX, parallax = 1) => worldX - camX * parallax;

function clampCam() {
  camX = Math.max(0, Math.min(camX, WORLD_W - W));
}

// 死区摄像机：人物在屏幕中间 deadZone 宽度内背景不动，越界后地图延展
function updateCamera() {
  const margin = (1 - CFG.deadZone) / 2;   // 左右各留出的边缘比例
  const left = W * margin;
  const right = W * (1 - margin);
  const sx = toScreenX(player.x);
  if (sx < left) {
    camX = player.x - left;
  } else if (sx > right) {
    camX = player.x - right;
  }
  clampCam();
}

function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const oldWorld = WORLD_W;
  W = window.innerWidth;
  H = BASE_H;                 // 上下不动
  scaleX = W / 960;

  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(BASE_H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = BASE_H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  CFG.groundY = 432;
  CFG.heroHeight = 158;

  WORLD_W = W * CFG.worldScreens;
  if (!oldWorld) {
    player.x = WORLD_W / 2;              // 初始站在地图中央
  } else {
    player.x = player.x / oldWorld * WORLD_W;  // 缩放时保持相对位置
  }
  camX = player.x - W / 2;
  clampCam();
  player.y = player.onGround ? CFG.groundY : player.y;

  buildScenery();
}

/* ============================================================
 * 4. 场景布景（坐标存世界 x，绘制时按视差滚动）
 * ============================================================ */
function makeCanopy(seed) {
  const blobs = [];
  let s = seed;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 14; i++) {
    blobs.push({
      dx: (r() - 0.5) * 190,
      dy: (r() - 0.5) * 70,
      rx: 34 + r() * 44,
      ry: 26 + r() * 30,
    });
  }
  return blobs;
}

let farTrees = [];
let midTrees = [];
let ferns = [];
let motes = [];
let rocks = [];
let roots = [];

function buildScenery() {
  // 远景树线：铺满整张地图
  const farCount = Math.ceil(WORLD_W / 34) + 2;
  farTrees = Array.from({ length: farCount }, (_, i) => ({
    x: i * 34 + rnd(-10, 10),
    top: rnd(150, 250) * scaleY,
    w: rnd(16, 34),
    phase: rnd(0, 6.28),
  }));

  // 中景大树：沿地图等距铺开
  const midCount = Math.max(4, Math.ceil(WORLD_W / 300));
  midTrees = Array.from({ length: midCount }, (_, i) => ({
    x: (i + 0.5) * (WORLD_W / midCount) + rnd(-30, 30),
    s: [1.05, 0.82, 1.15, 0.92][i % 4],
    phase: rnd(0, 6.28),
    seed: 11 + i * 16,
    canopy: makeCanopy(11 + i * 16),
  }));

  // 前景蕨类
  const fernCount = Math.ceil(WORLD_W / 56) + 1;
  ferns = Array.from({ length: fernCount }, (_, i) => ({
    x: i * 56 + rnd(-18, 18),
    s: rnd(0.6, 1.3) * scaleY,
    phase: rnd(0, 6.28),
  }));

  // 浮尘：固定层，只覆盖屏幕
  const moteCount = Math.round(42 * scaleX);
  motes = Array.from({ length: moteCount }, () => ({
    x: rnd(W * 0.45, W), y: rnd(40, H - 40),
    s: rnd(0.8, 2.2), sp: rnd(4, 14) * scaleY, phase: rnd(0, 6.28),
  }));

  // 石块
  const rockCount = Math.round(14 * WORLD_W / 960);
  rocks = Array.from({ length: rockCount }, () => ({
    x: rnd(20, WORLD_W - 20), y: rnd(CFG.groundY + 18, CFG.groundY + 62),
    rx: rnd(10, 30), ry: rnd(5, 12),
  }));

  // 树根：位置在布局时固定，避免每帧随机导致颤动
  const rootCount = Math.max(4, Math.ceil(WORLD_W / 240));
  roots = Array.from({ length: rootCount }, (_, i) => ({
    x: (i + 0.5) * (WORLD_W / rootCount) + rnd(-20, 20),
    y: CFG.groundY + rnd(28, 55),
    len: rnd(120, 190) * scaleX,
  }));
}

/* ============================================================
 * 5. 飞鸟：天空固定层，偶尔成群掠过
 * ============================================================ */
let birds = [];
let birdTimer = rnd(...CFG.birdGap);

function spawnBirds() {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const count = Math.random() < 0.6 ? 1 : Math.floor(rnd(2, 4));
  const baseY = rnd(70, 210);
  for (let i = 0; i < count; i++) {
    birds.push({
      x: dir > 0 ? -30 - i * 26 : W + 30 + i * 26,
      y: baseY + i * rnd(-14, 14),
      vx: dir * rnd(95, 160),
      size: rnd(7, 12),
      phase: rnd(0, 6.28),
    });
  }
}

/* ============================================================
 * 6. 图片加载
 * ============================================================ */
const images = {};
Object.keys(SPR).forEach(key => {
  const img = new Image();
  img.src = SPR[key].file;
  images[key] = img;
});

/* ============================================================
 * 7. 角色状态与按键
 * ============================================================ */
const player = {
  x: 0, y: CFG.groundY,
  vy: 0, onGround: true, facing: 1,
  state: 'idle', frame: 0, anim: 0,
};

const keys = {};
let wPressed = false;

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 'd'].includes(k)) e.preventDefault();
  keys[k] = true;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => Object.keys(keys).forEach(k => { keys[k] = false; }));

function spriteKey() {
  if (player.state === 'idle') return 'idle';
  if (player.state === 'walk') return player.facing > 0 ? 'walkR' : 'walkL';
  return 'jump';
}

/* ============================================================
 * 8. 每帧更新
 * ============================================================ */
function update(dt) {
  const dir = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  if (dir !== 0) {
    player.x += dir * CFG.moveSpeed * dt;   // player.x 是世界坐标
    player.facing = dir;
  }
  player.x = Math.max(40, Math.min(WORLD_W - 40, player.x));
  updateCamera();

  if (keys['w'] && !wPressed && player.onGround) {
    player.vy = -CFG.jumpPower;
    player.onGround = false;
  }
  wPressed = !!keys['w'];

  player.vy += CFG.gravity * dt;
  player.y += player.vy * dt;
  if (player.y >= CFG.groundY) {
    player.y = CFG.groundY;
    player.vy = 0;
    player.onGround = true;
  }

  const next = !player.onGround ? 'jump' : (dir !== 0 ? 'walk' : 'idle');
  if (next !== player.state) {
    player.state = next;
    player.anim = 0;
    player.frame = 0;
  }
  player.anim += dt;
  const fps = player.state === 'walk' ? CFG.walkFps : CFG.jumpFps;
  player.frame = Math.floor(player.anim * fps) % SPR[spriteKey()].frames.length;

  birdTimer -= dt;
  if (birdTimer <= 0) {
    spawnBirds();
    birdTimer = rnd(...CFG.birdGap);
  }
  birds = birds.filter(b => {
    b.x += b.vx * dt;
    return b.x > -60 && b.x < W + 60;
  });
}

/* ============================================================
 * 9. 绘制：丛林背景（天空层固定，中远景按视差滚动）
 * ============================================================ */
function drawBackdrop(t) {
  // 深林天空（固定层）
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0.00, '#0b211d');
  sky.addColorStop(0.42, '#183a31');
  sky.addColorStop(0.72, '#31523f');
  sky.addColorStop(1.00, '#435c43');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 树冠缝隙透下来的光（固定层）
  const gx = 770 * scaleX;
  const gy = 60 * scaleY;
  const glow = ctx.createRadialGradient(gx, gy, 8, gx, gy, 330 * scaleX);
  glow.addColorStop(0, 'rgba(233,224,166,.30)');
  glow.addColorStop(0.35, 'rgba(190,205,150,.10)');
  glow.addColorStop(1, 'rgba(190,205,150,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 光束（固定层）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  [[690, 74, -0.30], [772, 46, -0.24], [846, 96, -0.36]].forEach(([bx, bw, ang]) => {
    const x = bx * scaleX;
    const w = bw * scaleX;
    const g = ctx.createLinearGradient(x, 0, x + Math.sin(ang) * H, H);
    g.addColorStop(0, 'rgba(240,230,170,.10)');
    g.addColorStop(1, 'rgba(240,230,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w + Math.sin(ang) * H * 1.4, H);
    ctx.lineTo(x + Math.sin(ang) * H * 1.4, H);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();

  // 远山剪影（远景，几乎不动：极小视差）
  const px = 0.12;
  const mx = x => toScreenX(x * scaleX, px);
  const my = y => y * scaleY;
  ctx.fillStyle = '#213c34';
  ctx.beginPath();
  ctx.moveTo(mx(0), my(320));
  ctx.lineTo(mx(120), my(232)); ctx.lineTo(mx(230), my(292)); ctx.lineTo(mx(370), my(206));
  ctx.lineTo(mx(500), my(288)); ctx.lineTo(mx(660), my(220)); ctx.lineTo(mx(800), my(296));
  ctx.lineTo(mx(960), my(236)); ctx.lineTo(mx(960), my(H)); ctx.lineTo(mx(0), my(H));
  ctx.fill();
  ctx.fillStyle = '#1b332c';
  ctx.beginPath();
  ctx.moveTo(mx(0), my(356));
  ctx.lineTo(mx(170), my(282)); ctx.lineTo(mx(330), my(350)); ctx.lineTo(mx(520), my(268));
  ctx.lineTo(mx(710), my(352)); ctx.lineTo(mx(880), my(286)); ctx.lineTo(mx(960), my(330));
  ctx.lineTo(mx(960), my(H)); ctx.lineTo(mx(0), my(H));
  ctx.fill();

  // 远处雾带（固定层）
  const mist = ctx.createLinearGradient(0, my(300), 0, my(420));
  mist.addColorStop(0, 'rgba(150,180,155,0)');
  mist.addColorStop(0.5, 'rgba(150,180,155,.14)');
  mist.addColorStop(1, 'rgba(150,180,155,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, my(300), W, 120 * scaleY);

  // 远处树线：慢速视差滚动
  const farPx = 0.4;
  farTrees.forEach(tr => {
    const sx = toScreenX(tr.x, farPx);
    if (sx < -60 || sx > W + 60) return;
    const sway = Math.sin(t * 0.55 + tr.phase) * 2;
    ctx.fillStyle = '#163029';
    ctx.beginPath();
    ctx.moveTo(sx - tr.w / 2 + sway, my(372));
    ctx.lineTo(sx + sway, tr.top);
    ctx.lineTo(sx + tr.w / 2 + sway, my(372));
    ctx.closePath();
    ctx.fill();
  });
}

function drawMidTrees(t) {
  const px = 0.7;
  midTrees.forEach(tr => {
    const sx = toScreenX(tr.x, px);
    if (sx < -220 || sx > W + 220) return;
    const sway = Math.sin(t * 0.5 + tr.phase) * 0.012;
    const baseY = CFG.groundY + 34 * scaleY;
    const hgt = 268 * tr.s * scaleY;
    const wid = 22 * tr.s * scaleY;
    ctx.save();
    ctx.translate(sx, baseY);
    ctx.rotate(sway);

    const bark = ctx.createLinearGradient(-wid, 0, wid, 0);
    bark.addColorStop(0, '#1a1913');
    bark.addColorStop(0.5, '#33301f');
    bark.addColorStop(1, '#141610');
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(-wid, 0);
    ctx.bezierCurveTo(-wid * 0.8, -hgt * 0.4, -wid * 0.6, -hgt * 0.8, -wid * 0.5, -hgt);
    ctx.lineTo(wid * 0.5, -hgt);
    ctx.bezierCurveTo(wid * 0.6, -hgt * 0.8, wid * 0.8, -hgt * 0.4, wid, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(10,12,8,.45)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const bx = -wid * 0.5 + k * wid * 0.35;
      ctx.beginPath();
      ctx.moveTo(bx, -10);
      ctx.quadraticCurveTo(bx + 8, -hgt * 0.5, bx + 4, -hgt * 0.92);
      ctx.stroke();
    }

    ctx.fillStyle = '#171a12';
    ctx.beginPath();
    ctx.moveTo(-wid, 0); ctx.lineTo(-wid * 2.1, 16); ctx.lineTo(-wid * 0.4, 6);
    ctx.moveTo(wid, 0); ctx.lineTo(wid * 2.0, 18); ctx.lineTo(wid * 0.4, 6);
    ctx.fill();

    tr.canopy.forEach((b, i) => {
      const drift = Math.sin(t * 0.75 + i * 0.7 + tr.phase) * 3;
      ctx.fillStyle = i % 3 === 0 ? '#122a20' : (i % 3 === 1 ? '#1a3527' : '#0f241c');
      ctx.beginPath();
      ctx.ellipse(b.dx + drift, -hgt + b.dy, b.rx * tr.s, b.ry * tr.s, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(40,70,45,.75)';
    ctx.lineWidth = 2.5;
    for (let v = 0; v < 3; v++) {
      const vx = (-40 + v * 40) * tr.s;
      const len = (80 + v * 34) * tr.s;
      ctx.beginPath();
      ctx.moveTo(vx, -hgt + 6);
      ctx.quadraticCurveTo(
        vx + Math.sin(t * 1.1 + v) * 14, -hgt + len * 0.6,
        vx + Math.sin(t * 0.9 + v) * 8, -hgt + len
      );
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawGround() {
  const y = CFG.groundY;
  // 苔藓覆盖的地面（固定底色）
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, '#31492f');
  g.addColorStop(0.18, '#233726');
  g.addColorStop(1, '#171f18');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, H - y);

  ctx.fillStyle = '#466040';
  ctx.fillRect(0, y, W, 3);

  // 草与苔藓纹理：随镜头滚动（1:1）
  const off = ((camX % 9) + 9) % 9;
  ctx.strokeStyle = 'rgba(90,120,70,.35)';
  ctx.lineWidth = 1.5;
  for (let x = -off; x < W; x += 9) {
    const h = 5 + ((x * 13) % 12);
    ctx.beginPath();
    ctx.moveTo(x, y + 3);
    ctx.quadraticCurveTo(x + 3, y - h * 0.4, x + 6, y - h);
    ctx.stroke();
  }

  // 石块
  rocks.forEach(r => {
    const sx = toScreenX(r.x);
    if (sx < -40 || sx > W + 40) return;
    ctx.fillStyle = '#3a3b33';
    ctx.beginPath();
    ctx.ellipse(sx, r.y, r.rx, r.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,130,105,.25)';
    ctx.beginPath();
    ctx.ellipse(sx - r.rx * 0.2, r.y - r.ry * 0.3, r.rx * 0.5, r.ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // 树根（1:1 滚动，坐标固定不颤动）
  ctx.strokeStyle = 'rgba(25,28,18,.8)';
  ctx.lineWidth = 6 * scaleY;
  roots.forEach(r => {
    const sx = toScreenX(r.x);
    if (sx < -220 || sx > W + 40) return;
    ctx.beginPath();
    ctx.moveTo(sx, r.y);
    ctx.quadraticCurveTo(sx + r.len * 0.5, r.y - 14, sx + r.len, r.y + 6);
    ctx.stroke();
  });
}

function drawFerns(t) {
  ferns.forEach(f => {
    const sx = toScreenX(f.x);
    if (sx < -60 || sx > W + 60) return;
    const sway = Math.sin(t * 0.8 + f.phase) * 0.05;
    ctx.save();
    ctx.translate(sx, CFG.groundY + 8);
    ctx.scale(f.s, f.s);
    ctx.rotate(sway);
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1c3828' : '#274633';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(i * 9, -22, i * 20, -34 - Math.abs(i) * 2);
      ctx.quadraticCurveTo(i * 8, -20, 0, 0);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawBirds(t) {
  birds.forEach(b => {
    const flap = Math.sin(t * 8 + b.phase) * 0.85;
    ctx.save();
    ctx.translate(b.x, b.y + Math.sin(t * 1.8 + b.phase) * 4);
    if (b.vx < 0) ctx.scale(-1, 1);
    ctx.strokeStyle = 'rgba(18,28,24,.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-b.size, -b.size * flap);
    ctx.quadraticCurveTo(-b.size * 0.4, b.size * 0.28, 0, 0);
    ctx.quadraticCurveTo(b.size * 0.4, b.size * 0.28, b.size, -b.size * flap);
    ctx.stroke();
    ctx.restore();
  });
}

function drawMotes(t) {
  ctx.fillStyle = 'rgba(230,225,180,.35)';
  motes.forEach(m => {
    m.y -= m.sp * 0.016;
    if (m.y < 20) { m.y = H - 40; m.x = rnd(W * 0.45, W); }
    const x = m.x + Math.sin(t * 0.8 + m.phase) * 10;
    ctx.beginPath();
    ctx.arc(x, m.y, m.s, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ============================================================
 * 10. 绘制：武器（在人物图层之后画，微微上下浮动）
 * ============================================================ */
function drawWeapon(t) {
  const spr = SPR.weapon;
  const img = images.weapon;
  if (!img.complete || !img.naturalWidth) return;

  // 三帧循环待机
  const box = spr.frames[Math.floor(t * CFG.weaponFps) % spr.frames.length];
  const scale = CFG.weaponHeight / box.h;
  const w = box.w * scale;
  const h = CFG.weaponHeight;

  // 以人物当前帧的显示尺寸为基准定位（人物缩放/换状态时武器跟随）
  const pKey = spriteKey();
  const pSpr = SPR[pKey];
  const pBox = pSpr.frames[player.frame % pSpr.frames.length];
  const pScale = CFG.heroHeight / pBox.h;
  const heroW = pBox.w * pScale;   // 人物当前显示宽度
  const heroH = CFG.heroHeight;    // 人物显示高度

  const sx = toScreenX(player.x);
  const floatY = Math.sin(t * 2) * CFG.weaponFloat;   // 微微上下浮动

  // 背后距离按人物半宽算，方向随朝向；再加水平微调
  const backDir = player.facing > 0 ? -1 : 1;
  const back = backDir * (heroW / 2) * CFG.weaponBack + backDir * -CFG.weaponBias;
  const cx = sx + back;
  const cy = player.y - heroH * CFG.weaponRise + floatY;  // 竖直按人物高度定位

  ctx.save();
  ctx.translate(cx, cy);
  ctx.drawImage(img, box.x, box.y, box.w, box.h, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/* ============================================================
 * 11. 绘制：角色（用屏幕坐标）
 * ============================================================ */
function drawPlayer() {
  const sx = toScreenX(player.x);
  const key = spriteKey();
  const spr = SPR[key];
  const img = images[key];

  // 落地阴影
  const air = Math.max(0, CFG.groundY - player.y);
  const k = Math.max(0.4, 1 - air / 240);
  ctx.fillStyle = `rgba(8,14,10,${0.4 * k})`;
  ctx.beginPath();
  ctx.ellipse(sx, CFG.groundY + 5, 30 * k, 8 * k, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!img.complete || !img.naturalWidth) return;

  const box = spr.frames[player.frame % spr.frames.length];
  const scale = CFG.heroHeight / box.h;
  const drawW = box.w * scale;
  const drawH = box.h * scale;
  const flip = spr.flip || (player.facing < 0 && key !== 'walkL' && key !== 'walkR');

  ctx.save();
  ctx.translate(sx, player.y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, box.x, box.y, box.w, box.h, -drawW / 2, -drawH, drawW, drawH);
  ctx.restore();
}

/* ============================================================
 * 12. 渲染一帧
 * ============================================================ */
function render(t) {
  drawBackdrop(t);
  drawBirds(t);
  drawMidTrees(t);
  drawGround();
  drawFerns(t);
  drawWeapon(t);   // 先画武器，再画人物 → 武器在人物后面
  drawPlayer();
  drawMotes(t);

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.86);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.7, 'rgba(5,12,8,.20)');
  vg.addColorStop(1, 'rgba(3,8,6,.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

/* ============================================================
 * 13. 主循环
 * ============================================================ */
layout();
window.addEventListener('resize', layout);

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  render(now / 1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
