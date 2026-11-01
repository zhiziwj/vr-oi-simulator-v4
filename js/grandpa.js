'use strict';
/* =========================================================================
   grandpa —— 草稿纸底下的神秘矩阵 · 老赵的爷爷
   ---------------------------------------------------------------------
   在草稿纸下半部分画出一个"矩阵"（至少两条横线 + 两条竖线，且都落在纸的
   下半部分），会把老赵的爷爷从纸底下召出来。

   这是一场真正的 boss 战：
     赢 → 四道题全部自动 AC（400 分），然后进入考后流程（表彰大会）。
     输 → 考场被爷爷拆了；老赵冲进来救场，但本场所有人的成绩作废。

   演出全是 3D 的：矩阵圆环、爷爷的模型（白胡子/长袍/法杖）、
   被掀飞的桌椅碎块、冲进来的老赵、镜头抖动和红光。
   ========================================================================= */

const GRANDPA_HP = 240;
const GRANDPA_HURT_COOLDOWN = 0.95;
const GRANDPA_RANGE = 14;
const GRANDPA_LIFESTEAL = 12;          /* 每打掉玩家 1 格血，爷爷回 12 点 */

const grandpaState = {
  active: false,
  hp: GRANDPA_HP, max: GRANDPA_HP,
  phase: 1,
  group: null,
  staff: null,
  ring: null,
  matrix: null,
  matrixRings: [],
  oldZhao: null,
  cine: '',                 /* summon | fight | win | lose */
  cineT: 0,
  windUntil: 0,
  nextAt: 0,
  lastHurtAt: -999,
  loseDebris: false,
  zhaoSpawned: false,
  projectiles: [],
  novas: [],
  lastStinkLineAt: -999
};

/* ---------------------------- 建模 ---------------------------- */
function gpBuildBoss(x, z, faceYaw){
  const p = buildPerson(x, z, 0x4a3a2a, faceYaw, 'stand');
  p.group.scale.set(1.22, 1.28, 1.22);

  /* 白头发：盖住原来的黑发 */
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12),
    mat(0xf2f0e8, { roughness: 0.9 }));
  hair.position.set(0, 1.56, 0.02);
  p.group.add(hair);
  /* 白胡子 */
  const beard = box(0.26, 0.38, 0.12, 0xf2f0e8, 0, 1.30, 0.135, p.group,
                    { roughness: 0.95 });
  beard.rotation.x = 0.12;
  /* 深色长袍 */
  box(0.60, 0.95, 0.36, 0x3a2a4a, 0, 0.82, 0.01, p.group, { roughness: 0.95 });
  box(0.52, 0.34, 0.30, 0x2a1d38, 0, 0.42, 0.01, p.group, { roughness: 0.95 });
  /* 法杖：右手，顶端一颗紫水晶 */
  const staff = box(0.055, 2.0, 0.055, 0x5a3a1a, 0.40, 1.0, 0.16, p.group,
                    { roughness: 0.8 });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xb48cff }));
  orb.position.set(0.40, 2.02, 0.16);
  p.group.add(orb);
  /* 眼睛：两颗紫光 */
  for (const ex of [-0.055, 0.055]){
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xd6b8ff }));
    eye.position.set(ex, 1.54, 0.135);
    p.group.add(eye);
  }
  /* 脚下法阵 */
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0x9c6bff, transparent: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.04, z);
  scene.add(ring);

  const light = new THREE.PointLight(0xb48cff, 1.4, 9, 2);
  light.position.set(x, 2.2, z);
  scene.add(light);

  return { body: p, group: p.group, staff: staff, ring: ring, light: light };
}

function gpBuildMatrix(x, z){
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  const rings = [];
  for (let i = 0; i < 3; i++){
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.5 - i * 0.34, 0.025, 6, 48),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0xff6bd6 : 0x9c6bff,
        transparent: true, opacity: 0.65 }));
    r.rotation.x = Math.PI / 2;
    r.position.set(0, 0.05 + i * 0.005, 0);
    g.add(r);
    rings.push(r);
  }
  /* 放射状刻线（局部坐标；整个 group 会跟着爷爷移动） */
  for (let i = 0; i < 8; i++){
    const a = i / 8 * TAU;
    const beam = box(0.025, 0.012, 1.15, 0xb48cff,
      Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62, g);
    beam.rotation.y = -a;
  }
  /* 中心的眼睛（草稿纸底下的东西正看着你） */
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20),
    new THREE.MeshBasicMaterial({ color: 0xff6bd6, transparent: true, opacity: 0.9 }));
  pupil.rotation.x = -Math.PI / 2;
  pupil.position.set(0, 0.07, 0);
  g.add(pupil);
  return { group: g, rings: rings, pupil: pupil };
}

/* ---------------------------- 开局 ---------------------------- */
function grandpaStart(){
  if (state.ended || state.grandpaActive || state.grandpaWon ||
      state.grandpaDestroyed) return false;
  if (state.area !== 'room' || !state.started) return false;
  if (state.teacherDown || securityGuards.length > 0) return false;

  if (state.view === 'paper') closePaper();
  state.view = 'world';
  state.frozen = true;
  state.grandpaActive = true;
  state.grandpaWon = false;
  state.grandpaDestroyed = false;
  state.hp = state.hpMax || HP_MAX;
  renderHp();
  revealHp();
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');

  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const mx = state.pos.x + fx * 1.8, mz = state.pos.z + fz * 1.8;
  const bx = state.pos.x + fx * 3.3, bz = state.pos.z + fz * 3.3;

  grandpaState.active = true;
  grandpaState.hp = GRANDPA_HP;
  grandpaState.max = GRANDPA_HP;
  grandpaState.phase = 1;
  grandpaState.cine = 'summon';
  grandpaState.cineT = 0;
  grandpaState.nextAt = state.worldTime + 1.8;
  grandpaState.teleportAt = state.worldTime + 5.5;
  grandpaState.windUntil = 0;
  grandpaState.windKind = 'normal';
  grandpaState.windRange = 3.0;
  grandpaState.windDmg = 1;
  grandpaState.swingCount = 0;
  grandpaState.lastHurtAt = -999;
  grandpaState.zhaoSpawned = false;
  grandpaState.loseDebris = false;
  clearGrandpaProjectiles();
  clearGrandpaNovas();
  /* 监考老师看到爷爷，直接吓跑（不参与 boss 战，也不挡路） */
  let teacherFled = false;
  if (teacher){
    teacher.userData.leaving = true;
    try { scene.remove(teacher.group); } catch(e){}
    teacher = null;
    teacherFled = true;
  }
  grandpaState.teacherFled = teacherFled;

  grandpaState.matrix = gpBuildMatrix(mx, mz);
  const face = Math.atan2(state.pos.x - bx, state.pos.z - bz);
  const boss = gpBuildBoss(bx, bz, face);
  grandpaState.group = boss.group;
  grandpaState.body = boss.body;
  grandpaState.staff = boss.staff;
  grandpaState.ring = boss.ring;
  grandpaState.light = boss.light;
  boss.group.scale.set(0.05, 0.05, 0.05);

  if (brawlBarEl){
    brawlBarEl.classList.add('hidden');
    brawlBarEl.classList.remove('hit');
  }
  audio.beep(120, 0.4, 0.08, 'sawtooth');
  setTimeout(() => audio.beep(90, 0.6, 0.07, 'sawtooth'), 220);
  toast('草稿纸底下传来一阵纸张撕裂的声音……', 3200);
  if (teacherFled) toast('监考老师看见爷爷，转身就跑出了教室。', 3000);
  kickView(0.16, 0.04);
  return true;
}

/* ---------------------------- boss 条 ---------------------------- */
function gpShowBar(){
  if (!brawlBarEl) return;
  brawlBarEl.classList.remove('hidden');
  if (brawlBarName) brawlBarName.textContent = '老赵的爷爷';
  if (brawlBarSub) brawlBarSub.textContent = '从草稿纸底下爬出来的';
  gpFillBar();
}

function gpFillBar(){
  if (!brawlBarFill) return;
  const pct = Math.max(0, Math.min(100, grandpaState.hp / grandpaState.max * 100));
  brawlBarFill.style.width = pct.toFixed(1) + '%';
}

function gpHideBar(){
  if (brawlBarEl) brawlBarEl.classList.add('hidden');
}

/* ---------------------------- 玩家挨打 / 出拳 ---------------------------- */
function grandpaHurt(dmg){
  if (!grandpaState.active || state.ended) return;
  if (state.worldTime - grandpaState.lastHurtAt < GRANDPA_HURT_COOLDOWN) return;
  grandpaState.lastHurtAt = state.worldTime;

  if ((state.eggShield | 0) > 0){
    state.eggShield--;
    toast('茶叶蛋替你挡了一下 —— 爷爷的法杖偏了。', 2200);
    audio.beep(520, 0.1, 0.05, 'triangle');
    return;
  }

  state.hp -= dmg;
  if (state.hp < 0) state.hp = 0;
  renderHp();

  /* 吸血：爷爷从你掉的每一格血里回 12 点，最多回满 */
  const heal = Math.min(grandpaState.max - grandpaState.hp,
                        dmg * GRANDPA_LIFESTEAL);
  if (heal > 0){
    grandpaState.hp += heal;
    gpFillBar();
    if (grandpaState.group){
      gpImpactSpark(grandpaState.group.position.x, 1.35,
                    grandpaState.group.position.z, 0x7dff9a);
    }
  }
  if (redFlash){
    redFlash.style.opacity = '0.5';
    setTimeout(() => { redFlash.style.opacity = '0'; }, 200);
  }
  audio.beep(140, 0.25, 0.07, 'sawtooth');
  kickView(0.09, (Math.random() - 0.5) * 0.08);
  toast(heal > 0
    ? ('爷爷吸走你 ' + dmg + ' 格血，回复了 ' + heal + ' 点。')
    : '爷爷的法杖敲在地上，整间教室都在抖。', 1800);

  /* 被打退 */
  if (grandpaState.group){
    const dx = state.pos.x - grandpaState.group.position.x;
    const dz = state.pos.z - grandpaState.group.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = state.pos.x + (dx / d) * 0.75;
    const nz = state.pos.z + (dz / d) * 0.75;
    const b = state.bounds;
    if (!collides(nx, state.pos.z, 0.28)) state.pos.x = clamp(nx, -b.x, b.x);
    if (!collides(state.pos.x, nz, 0.28)) state.pos.z = clamp(nz, b.zMin, b.zMax);
  }

  if (state.hp <= 0) grandpaLose();
}

function grandpaPunch(){
  if (!grandpaState.active || grandpaState.cine !== 'fight' ||
      state.frozen || state.ended) return;
  const g = grandpaState.group;
  if (!g) return;
  const d = Math.hypot(state.pos.x - g.position.x, state.pos.z - g.position.z);
  if (d > punchReach() + 0.5 ||
      !inAttackArc(g.position.x, g.position.z, punchArc())){
    toast('你挥空了。爷爷离你还有 ' + d.toFixed(1) + ' 米。', 1200);
    return;
  }

  const dmg = brawlDamage();
  if (state.rpCharm){
    grandpaState.hp = 0;
    gpFillBar();
    unlockAch('rp_oneshot');
    audio.beep(980, 0.18, 0.06, 'sine');
    toast('rp++ 钥匙扣嗡了一声 —— 爷爷被一拳打成了纸片。', 3200);
    grandpaWin();
    return;
  }
  grandpaState.hp -= dmg;
  wearWeapon();
  gpFillBar();
  audio.beep(180, 0.08, 0.05, 'square');
  kickView(0.05, 0.02);
  toast('你打中了他。' + (grandpaState.hp > 0
    ? '爷爷的白胡子抖了抖。'
    : '爷爷的法杖脱手了。'), 1500);
  if (grandpaState.hp > 0){
    grandpaState.hitCount = (grandpaState.hitCount | 0) + 1;
    grandpaLine('gp_hit', GRANDPA_HIT_LINES[(grandpaState.hitCount | 0) % GRANDPA_HIT_LINES.length]);
  }
  if (grandpaState.hp <= 0) grandpaWin();
}

/* ---- 战斗间台词 ----
   一句一句地说；同一个 key 有冷却。爷爷说话的地方不多，所以每一句都要
   像"他不屑于跟你解释"，而不是"怪物在喊台词"。 */
const GP_LINE_AT = {};
function grandpaLine(key, line, gap){
  if (!line) return;
  const now = state.worldTime;
  const g = gap === undefined ? 3.2 : gap;
  if (GP_LINE_AT[key] !== undefined && now - GP_LINE_AT[key] < g) return;
  GP_LINE_AT[key] = now;
  toast(line, 2400);
}

const GRANDPA_HIT_LINES = [
  '爷爷：「有点意思。」',
  '爷爷：「这一拳，比你老师强。」',
  '爷爷：「几十年了，头一个敢还手的。」'
];
const GRANDPA_NOVA_LINES = [
  '爷爷：「离我远点。」',
  '爷爷：「这一步，你踩进来做什么。」'
];
const GRANDPA_HEAVY_LINES = [
  '爷爷：「矩阵不收人，只收分。」',
  '爷爷：「你的答案呢？」'
];
const GRANDPA_TELE_LINES = [
  '爷爷：「你站的地方，我年轻时候站过。」',
  '爷爷：「这屋子还是老样子。」'
];


/* ---------------------------- 输赢 ---------------------------- */
function grandpaWin(){
  if (!grandpaState.active || grandpaState.cine === 'win') return;
  grandpaState.hp = 0;
  gpFillBar();
  gpHideBar();
  grandpaState.cine = 'win';
  grandpaState.cineT = 0;
  state.frozen = true;
  state.grandpaWon = true;
  crosshair.classList.add('hidden');
  clearGrandpaProjectiles();
  clearGrandpaNovas();

  /* 所有题目自动 AC —— 不是把玩家传送到结算，而是真的把四道题写成满分 */
  for (const p of state.problems){
    state.score[p.id] = p.max;
    state.submitCount[p.id] = Math.max(1, state.submitCount[p.id] || 1);
  }
  state.totalScore = state.problems.reduce((s, p) => s + p.max, 0);
  unlockAch('grandpa_win');
  toast('评测机：P' + state.problems.map(p => p.id).join(' / P') + ' —— 全部 AC。', 4200);
  audio.beep(880, 0.2, 0.05, 'sine');
  setTimeout(() => audio.beep(1180, 0.3, 0.05, 'sine'), 220);
}

function grandpaLose(){
  if (!grandpaState.active || grandpaState.cine === 'lose') return;
  grandpaState.cine = 'lose';
  grandpaState.cineT = 0;
  state.frozen = true;
  state.grandpaDestroyed = true;
  state.hp = 0;
  renderHp();
  gpHideBar();
  clearGrandpaProjectiles();
  clearGrandpaNovas();
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');

  gpSpawnDestruction();
  audio.beep(90, 0.6, 0.1, 'sawtooth');
  setTimeout(() => audio.beep(60, 0.9, 0.08, 'sawtooth'), 260);
  toast('爷爷举起法杖 —— 整间教室的桌子都飞了起来。', 4200);
}

/* 命中/瞬移/对拳时的光点：小、亮、短命，不抢镜但能让"打中了"有反馈 */
const gpSparkList = [];
function gpImpactSpark(x, y, z, color){
  for (let i = 0; i < 6; i++){
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.035, 6, 5),
      new THREE.MeshBasicMaterial({ color: color || 0xffd27a, transparent: true, opacity: 1 }));
    m.position.set(x, y, z);
    scene.add(m);
    gpSparkList.push({
      mesh: m, mat: m.material,
      vx: (Math.random() - 0.5) * 3.6,
      vy: 1.2 + Math.random() * 2.4,
      vz: (Math.random() - 0.5) * 3.6,
      life: 0.35 + Math.random() * 0.3
    });
  }
}

function updateGrandpaSparks(dt){
  for (let i = gpSparkList.length - 1; i >= 0; i--){
    const s = gpSparkList[i];
    s.life -= dt;
    if (s.life <= 0){
      scene.remove(s.mesh);
      s.mat.dispose();
      gpSparkList.splice(i, 1);
      continue;
    }
    s.mesh.position.x += s.vx * dt;
    s.vy -= 7.0 * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.mesh.scale.multiplyScalar(Math.max(0.2, 1 - dt * 3.0));
    s.mat.opacity = Math.max(0, s.life * 2.2);
  }
}

/* 掀飞的桌椅 / 墙皮：真正的 3D 碎块，走 debris 的刚体 */
function gpSpawnDestruction(){
  if (grandpaState.loseDebris) return;
  grandpaState.loseDebris = true;
  const g = new THREE.Group();
  scene.add(g);
  for (let i = 0; i < 14; i++){
    const w = 0.35 + Math.random() * 0.8;
    const h = 0.12 + Math.random() * 0.35;
    const d = 0.3 + Math.random() * 0.7;
    box(w, h, d, [0x6b5137, 0x3a4152, 0x2a3140, 0x50596a][i % 4],
        (Math.random() - 0.5) * 11, 0.8 + Math.random() * 2.0,
        (Math.random() - 0.5) * 9, g);
  }
  spawnBodyDebris(g, { speed: 4.6 });
  /* 老赵从门口冲进来 */
  if (!grandpaState.oldZhao){
    const z = buildPerson(-0.9, 5.6, 0x4a5a3a, Math.PI, 'stand');
    z.group.scale.set(1.0, 1.02, 1.0);
    grandpaState.oldZhao = z;
    grandpaState.zhaoSpawned = true;
    grandpaState.duelT = 0;
    grandpaState.duelStep = 0;
    toast('门被撞开了 —— 老赵冲了进来：「爷爷！！」', 3200);
  }
  const red = new THREE.PointLight(0xff3030, 1.8, 16, 2);
  red.position.set(0, 3.0, 2.0);
  scene.add(red);
  grandpaState.redLight = red;
}

/* ---------------------------- 每帧 ---------------------------- */
/* 远程攻击：法杖射出的矩阵弹。射程 14m，直线飞行，玩家可以侧移躲开。 */
function grandpaCastProjectile(heavy){
  const g = grandpaState.group;
  if (!g) return;
  const sx = g.position.x, sy = 1.45, sz = g.position.z;
  const tx = state.pos.x, ty = 1.1, tz = state.pos.z;
  const dx = tx - sx, dy = ty - sy, dz = tz - sz;
  const d = Math.hypot(dx, dy, dz) || 1;
  const speed = heavy ? 5.6 : 7.2;
  const radius = heavy ? 0.22 : 0.13;
  const color = heavy ? 0xff5f9d : 0xb48cff;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95 }));
  mesh.position.set(sx, sy, sz);
  scene.add(mesh);
  grandpaState.projectiles.push({
    mesh: mesh, mat: mesh.material,
    vx: dx / d * speed, vy: dy / d * speed, vz: dz / d * speed,
    speed: speed, dmg: heavy ? 2 : 1, heavy: heavy, life: 10.0, homing: true
  });
  gpImpactSpark(sx, sy, sz, color);
  audio.beep(heavy ? 180 : 420, heavy ? 0.18 : 0.10, 0.05, 'triangle');
  if (heavy) toast('爷爷横起法杖 —— 一团大矩阵弹飞了过来！', 1800);
}

function clearGrandpaProjectiles(){
  for (const p of grandpaState.projectiles){
    try { scene.remove(p.mesh); p.mat.dispose(); } catch(e){}
  }
  grandpaState.projectiles.length = 0;
}

/* 近身范围攻击：以爷爷为圆心的矩阵冲击波，直接 2 点伤害 */
function grandpaNovaHit(){
  const g = grandpaState.group;
  if (!g) return;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xff5f9d, transparent: true, opacity: 0.9 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(g.position.x, 0.08, g.position.z);
  ring.scale.set(0.25, 0.25, 0.25);
  scene.add(ring);
  grandpaState.novas.push({ mesh: ring, mat: ring.material, life: 0.7, max: 0.7 });

  const d = Math.hypot(state.pos.x - g.position.x, state.pos.z - g.position.z);
  if (d <= 4.0){
    grandpaHurt(2);
    kickView(0.18, 0.08);
    if (redFlash){
      redFlash.style.opacity = '0.55';
      setTimeout(() => { redFlash.style.opacity = '0'; }, 220);
    }
    toast('爷爷一跺脚 —— 近身矩阵炸开，2 点伤害！', 2200);
    grandpaLine('gp_nova', GRANDPA_NOVA_LINES[(grandpaState.hitCount | 0) % GRANDPA_NOVA_LINES.length], 2.6);
  } else {
    toast('爷爷的矩阵冲击波擦着你炸开。', 1500);
  }
}

function updateGrandpaNovas(dt){
  for (let i = grandpaState.novas.length - 1; i >= 0; i--){
    const n = grandpaState.novas[i];
    n.life -= dt;
    const k = 1 - Math.max(0, n.life) / n.max;
    const s = 0.25 + k * 3.6;
    n.mesh.scale.set(s, s, s);
    n.mat.opacity = Math.max(0, 0.9 - k * 0.9);
    if (n.life <= 0){
      scene.remove(n.mesh); n.mat.dispose();
      grandpaState.novas.splice(i, 1);
    }
  }
}

function clearGrandpaNovas(){
  for (const n of grandpaState.novas){
    try { scene.remove(n.mesh); n.mat.dispose(); } catch(e){}
  }
  grandpaState.novas.length = 0;
}

function updateGrandpaProjectiles(dt){
  const list = grandpaState.projectiles;
  for (let i = list.length - 1; i >= 0; i--){
    const p = list[i];
    p.life -= dt;
    /* 追踪 10 秒：弹体每帧把速度掰向玩家，跑直线是躲不掉的，得绕柱子/变向 */
    if (p.homing){
      const dx = state.pos.x - p.mesh.position.x;
      const dy = 1.1 - p.mesh.position.y;
      const dz = state.pos.z - p.mesh.position.z;
      const dd = Math.hypot(dx, dy, dz) || 1;
      const wantX = dx / dd * p.speed;
      const wantY = dy / dd * p.speed;
      const wantZ = dz / dd * p.speed;
      const k = Math.min(1, dt * (p.heavy ? 1.7 : 2.3));
      p.vx += (wantX - p.vx) * k;
      p.vy += (wantY - p.vy) * k;
      p.vz += (wantZ - p.vz) * k;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mat.opacity = 0.75 + 0.2 * Math.sin(p.life * 20);
    let gone = p.life <= 0;
    if (!gone && Math.hypot(p.mesh.position.x - state.pos.x,
                            p.mesh.position.z - state.pos.z) < 0.65 &&
        Math.abs(p.mesh.position.y - 1.1) < 1.0){
      grandpaHurt(p.dmg);
      gpImpactSpark(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z,
                    p.heavy ? 0xff5f9d : 0xb48cff);
      gone = true;
    }
    if (!gone && collides(p.mesh.position.x, p.mesh.position.z, 0.08)){
      gpImpactSpark(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0x9c6bff);
      gone = true;
    }
    if (gone){
      scene.remove(p.mesh);
      p.mat.dispose();
      list.splice(i, 1);
    }
  }
}

function updateGrandpa(worldDt, t){
  updateGrandpaSparks(worldDt);
  updateGrandpaProjectiles(worldDt);
  updateGrandpaNovas(worldDt);
  if (!grandpaState.active && !grandpaState.cine) return;
  const g = grandpaState.group;

  if (grandpaState.matrix){
    /* 法阵跟着爷爷走：不是钉在召唤点的地贴 */
    if (g){
      grandpaState.matrix.group.position.x = g.position.x;
      grandpaState.matrix.group.position.z = g.position.z;
    }
    grandpaState.matrix.rings.forEach((r, i) => {
      r.rotation.z = t * (0.6 + i * 0.25) * (i % 2 ? -1 : 1);
      r.material.opacity = 0.4 + 0.3 * Math.sin(t * 2 + i);
    });
    if (grandpaState.matrix.pupil){
      grandpaState.matrix.pupil.material.opacity = 0.55 + 0.4 * Math.sin(t * 3.1);
    }
  }
  if (grandpaState.ring){
    grandpaState.ring.rotation.z = t * 0.8;
  }

  /* 召唤：从 0.05 长到 1.22，矩阵撑开 */
  if (grandpaState.cine === 'summon'){
    grandpaState.cineT += worldDt;
    const k = Math.min(1, grandpaState.cineT / 1.6);
    if (g){
      const s = 0.05 + (1.22 - 0.05) * (k * k);
      g.scale.set(s, 0.05 + (1.28 - 0.05) * (k * k), s);
    }
    if (grandpaState.matrix){
      const ms = 0.4 + k * 0.9;
      grandpaState.matrix.group.scale.set(ms, 1, ms);
    }
    if (grandpaState.cineT >= 1.6){
      grandpaState.cine = 'fight';
      state.frozen = false;
      gpShowBar();
      toast('老赵的爷爷：谁在我孙子的考场里画矩阵？', 3600);
      audio.beep(220, 0.3, 0.06, 'sawtooth');
    }
    return;
  }

  /* 赢：爷爷消散，矩阵收缩，然后自动交卷 */
  if (grandpaState.cine === 'win'){
    grandpaState.cineT += worldDt;
    if (g){
      const k = Math.max(0, 1 - grandpaState.cineT / 1.8);
      g.scale.set(1.22 * k, 1.28 * k, 1.22 * k);
      g.rotation.y += worldDt * 2.0;
    }
    if (grandpaState.matrix){
      grandpaState.matrix.group.scale.multiplyScalar(Math.max(0.9, 1 - worldDt * 0.4));
    }
    if (grandpaState.cineT >= 2.2){
      grandpaState.cine = '';
      grandpaState.active = false;
      state.grandpaActive = false;
      state.frozen = false;
      if (g){ scene.remove(g); }
      if (grandpaState.ring){ scene.remove(grandpaState.ring); grandpaState.ring = null; }
      if (grandpaState.light){ scene.remove(grandpaState.light); grandpaState.light = null; }
      if (grandpaState.matrix){
        scene.remove(grandpaState.matrix.group); grandpaState.matrix = null;
      }
      if (!state.ended) endContest(true);       /* 400 分 → 考后表彰大会 */
    }
    return;
  }

  /* 输：教室被拆 → 老赵冲进来和爷爷打 → 爷爷退场 → 失败结局 */
  if (grandpaState.cine === 'lose'){
    grandpaState.cineT += worldDt;
    const ct = grandpaState.cineT;
    const staff = grandpaState.staff;
    const body = grandpaState.body;
    /* 强制电影机位：从侧面拍老赵和爷爷，玩家不再用原来的视角看天花板 */
    if (g){
      camera.position.set(g.position.x + 2.6, 2.25, g.position.z + 4.8);
      camera.lookAt(g.position.x, 1.15, g.position.z + 0.35);
    }
    if (g){
      g.rotation.y += worldDt * 0.3;
      if (ct > 3.4){
        const k = Math.max(0, 1 - (ct - 3.4) / 0.8);
        g.scale.set(1.22 * k, 1.28 * k, 1.22 * k);
      }
    }

    /* 老赵：从门口冲到爷爷面前（x -0.9, z -1.0） */
    if (grandpaState.oldZhao && g){
      const z = grandpaState.oldZhao;
      const tx = -0.9, tz = -1.0;
      const dx = tx - z.group.position.x, dz = tz - z.group.position.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.18){
        const sp = Math.min(dd, 6.5 * worldDt);
        z.group.position.x += dx / dd * sp;
        z.group.position.z += dz / dd * sp;
      }
      z.group.rotation.y = Math.atan2(g.position.x - z.group.position.x,
                                      g.position.z - z.group.position.z);

      /* 起手 */
      z.armL.rotation.x = -0.25 + Math.sin(t * 10) * 0.35;
      z.armR.rotation.x = -0.25 - Math.sin(t * 10) * 0.35;
      staff.rotation.x = Math.sin(t * 2) * 0.04;

      const sparkAt = () => gpImpactSpark(
        (z.group.position.x + g.position.x) / 2,
        1.25,
        (z.group.position.z + g.position.z) / 2,
        0xffd27a);

      if (grandpaState.duelStep < 1 && ct >= 1.15){
        grandpaState.duelStep = 1;
        z.armR.rotation.x = -1.55;
        body.head.rotation.x = -0.25;
        sparkAt(); kickView(0.10, 0.05);
        audio.beep(240, 0.10, 0.06, 'square');
        toast('老赵一拳砸在法杖上：「爷爷！别拆了！」', 2400);
      } else if (grandpaState.duelStep < 2 && ct >= 1.60){
        grandpaState.duelStep = 2;
        staff.rotation.z = -1.05;
        z.group.position.y = 0.12;                  /* 矮身躲横扫 */
        sparkAt(); kickView(0.12, -0.05);
        audio.beep(180, 0.16, 0.06, 'sawtooth');
        toast('爷爷横扫法杖，老赵矮身躲过。', 2200);
      } else if (grandpaState.duelStep < 3 && ct >= 2.05){
        grandpaState.duelStep = 3;
        z.armL.rotation.x = -1.55;
        staff.rotation.z = 0;
        g.position.x += 0.22;                 /* 爷爷退半步 */
        sparkAt(); kickView(0.10, 0.04);
        audio.beep(260, 0.10, 0.05, 'square');
        toast('老赵欺身又一拳，爷爷退半步。', 2200);
      } else if (grandpaState.duelStep < 4 && ct >= 2.45){
        grandpaState.duelStep = 4;
        z.armL.rotation.x = -1.2;
        z.armR.rotation.x = -1.2;
        staff.rotation.x = -1.2;
        sparkAt(); kickView(0.07, 0.02);
        toast('老赵抓住法杖，两个人较上劲。', 2200);
      } else if (grandpaState.duelStep < 5 && ct >= 2.90){
        grandpaState.duelStep = 5;
        z.armL.rotation.x = -1.35;
        z.armR.rotation.x = -1.35;
        staff.rotation.x = 0;
        staff.rotation.z = 0;
        sparkAt(); audio.beep(340, 0.14, 0.04, 'sine');
        toast('老赵一把抱住爷爷：「够了！这是考场！」', 3000);
      } else if (grandpaState.duelStep < 6 && ct >= 3.40){
        grandpaState.duelStep = 6;
        toast('爷爷的矩阵灭了。', 2000);
      }

      /* 把动作保持住：每帧都会先写一次跑动摆臂，不在这里覆盖回去，
         出拳/躲闪就只剩一帧。 */
      if (grandpaState.duelStep === 1){
        z.armR.rotation.x = -1.55;
      } else if (grandpaState.duelStep === 2){
        z.armL.rotation.x = -1.1;
        z.armR.rotation.x = -0.8;
        z.group.position.y = 0.12;
      } else if (grandpaState.duelStep === 3){
        z.group.position.y = 0;
        z.armL.rotation.x = -1.55;
        z.armR.rotation.x = -0.35;
      } else if (grandpaState.duelStep >= 4){
        z.group.position.y = 0;
        z.armL.rotation.x = -1.25;
        z.armR.rotation.x = -1.25;
      }
      if (body && grandpaState.duelStep >= 5) body.head.rotation.x = 0;
    }

    if (ct > 4.2 && !state.ended){
      grandpaState.active = false;
      grandpaState.cine = '';
      state.grandpaActive = false;
      state.frozen = false;
      endByGrandpaDestruction();
    }
    return;
  }

  /* 战斗 AI */
  if (grandpaState.cine !== 'fight' || !g) return;
  if (state.frozen) return;
  const gs = grandpaState;
  gs.phase = gs.hp <= gs.max * 0.5 ? 2 : 1;

  /* 半血以后：矩阵瞬移。不让你靠"退两步"把爷爷永远放风筝。 */
  if (gs.phase === 2 && state.worldTime >= (gs.teleportAt || 0)){
    gs.teleportAt = state.worldTime + 5.2;
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const tx = state.pos.x + fx * 2.05;
    const tz = state.pos.z + fz * 2.05;
    if (!collides(tx, tz, 0.35)){
      g.position.set(tx, 0, tz);
      gpImpactSpark(tx, 1.15, tz, 0xb48cff);
      audio.beep(520, 0.12, 0.05, 'triangle');
      toast('爷爷脚下的矩阵闪了一下 —— 他到了你面前。', 1800);
      grandpaLine('gp_tele', GRANDPA_TELE_LINES[(gs.teleCount | 0) % GRANDPA_TELE_LINES.length], 4.0);
      gs.teleCount = (gs.teleCount | 0) + 1;
    }
  }

  const px = state.pos.x, pz = state.pos.z;
  const dx = px - g.position.x, dz = pz - g.position.z;
  const d = Math.hypot(dx, dz) || 1;
  g.rotation.y = Math.atan2(dx, dz);

  if (gs.windUntil > 0){
    /* 抬手：法杖举起来；重击时横过来，给玩家一个"这一下不能吃"的信号 */
    gs.staff.rotation.x = gs.windKind === 'heavy'
      ? -1.45 + Math.sin(t * 26) * 0.06
      : -1.1 + Math.sin(t * 22) * 0.05;
    if (state.worldTime >= gs.windUntil){
      gs.windUntil = 0;
      gs.staff.rotation.x = 0;
      if (gs.windKind === 'nova'){
        grandpaNovaHit();
      } else {
        /* 远程追踪弹：射程 14m，弹体会追玩家 10 秒 */
        grandpaCastProjectile(gs.windKind === 'heavy');
      }
      if (gs.windKind === 'heavy') kickView(0.10, 0.04);
    }
    return;
  }

  /* 攻击决策：14m 内都能出手；近身用 2 点范围冲击波，远处用追踪弹 */
  if (state.worldTime >= gs.nextAt && d <= GRANDPA_RANGE){
    gs.swingCount++;
    const close = d < 3.9;
    const heavy = !close && gs.phase === 2 && gs.swingCount % 3 === 0;
    if (close){
      gs.windKind = 'nova';
      gs.windRange = 4.0;
      gs.windDmg = 2;
      gs.windUntil = state.worldTime + 0.62;
      gs.nextAt = state.worldTime + 1.55;
      toast('爷爷一跺脚 —— 近身矩阵要炸开！', 1600);
      audio.beep(110, 0.22, 0.06, 'sawtooth');
    } else {
      gs.windKind = heavy ? 'heavy' : 'normal';
      gs.windRange = GRANDPA_RANGE;
      gs.windDmg = heavy ? 2 : 1;
      gs.windUntil = state.worldTime + (heavy ? 0.70 : 0.52);
      gs.nextAt = state.worldTime + (heavy ? 1.35 : 0.95);
      if (gs.windKind === 'heavy') toast('爷爷横起法杖 —— 追踪矩阵弹！', 1500);
      if (heavy) grandpaLine('gp_heavy', GRANDPA_HEAVY_LINES[(gs.swingCount | 0) % GRANDPA_HEAVY_LINES.length], 3.0);
      audio.beep(heavy ? 120 : 420, heavy ? 0.20 : 0.10, 0.05, 'triangle');
    }
    return;
  }

  if (d > 3.2){
    const sp = (gs.phase === 2 ? 1.95 : 1.35) * worldDt;
    const nx = g.position.x + dx / d * sp;
    const nz = g.position.z + dz / d * sp;
    if (!collides(nx, g.position.z, 0.35)) g.position.x = nx;
    if (!collides(g.position.x, nz, 0.35)) g.position.z = nz;
    g.position.y = Math.sin(t * 5) * 0.01;
  }

  /* 手臂闲时轻微摆动 */
  if (gs.staff.rotation.x === 0){
    gs.staff.rotation.x = Math.sin(t * 2) * 0.04;
  }
  gpFillBar();
}

/* 交互：boss 战期间把普通考场交互全部挡住 */
function grandpaInteract(){
  if (!state.grandpaActive) return false;
  if (grandpaState.cine !== 'fight' || state.frozen || state.ended) return true;
  const g = grandpaState.group;
  if (!g) return true;
  const d = Math.hypot(state.pos.x - g.position.x, state.pos.z - g.position.z);
  if (d <= punchReach() + 0.45 && inAttackArc(g.position.x, g.position.z, punchArc())){
    actionSpace = { fn: grandpaPunch };
    setPrompt('[ 左键 ] 打老赵的爷爷（白胡子 · 法杖 · 看起来不太好惹）');
    promptEl.classList.remove('hidden');
  }
  return true;
}

function grandpaStink(){
  if (!state.grandpaActive || grandpaState.cine !== 'fight') return 0;
  /* 爷爷不吃臭水：法杖一抬，水在半空就蒸发了。只给一句战斗间对话。 */
  if (state.worldTime - (grandpaState.lastStinkLineAt || -999) > 2.6){
    grandpaState.lastStinkLineAt = state.worldTime;
    toast('爷爷：「凡水不近矩阵。」臭水在离他半米的地方蒸发了。', 2600);
  }
  return 0;
}
