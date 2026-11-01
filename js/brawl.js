'use strict';
/* =========================================================================
   brawl —— 校门口的斗殴：打同学 → 志愿者二人组 → 门卫老赵
   ---------------------------------------------------------------------
   这是"打保安"之外的另一条暴力路线，但它发生在**进考场之前**：
     · 在校园里对准路过的同学按左键，一拳把他放倒；
     · 志愿者小林、阿舟和门卫老赵不会报警，他们会亲自动手；
     · 第一阶段：志愿者二人组（共享一条 boss 血条）；
     · 第二阶段：老赵把搪瓷杯放在台阶上，自己上。
   打赢之后可以去考试（赛场时钟在这场架里暂停，不占入场时限），
   也可以留下来面对后果（「校门口的传说」结局）；打输则被抬进医务室。

   为什么要单独一个文件：
     campus.js 已经够长，而这一套有完整的 AI / 血条 / 阶段 / 结局，
     和"教室里的保安队"也不是同一套东西（那套是守卫房间，这套守校门）。
     两边共用的只有出拳手感（punchReach / inAttackArc / hitStop / kickView）。
   ========================================================================= */

const BRAWL_PHASE1_HP = 50;
/* 老赵：不是"多打几拳"的木桩。血厚、贴得紧、抬手短，
   半血以下还会进入"认真"状态（移速/攻速都上一个台阶）。 */
const BRAWL_PHASE2_HP = 200;
const BRAWL_HURT_COOLDOWN = 0.9;       /* 玩家受击后的无敌时间（世界秒） */
const BRAWL_ATTACK_WINDUP = 0.38;      /* 普通攻击抬手 */
const BRAWL_SWEEP_WINDUP = 3.0;       /* 老赵扫堂腿：提前 3 秒画圈 */
const BRAWL_SWEEP_RADIUS = 3.6;
const BRAWL_SWEEP_DMG = 3;
const BRAWL_SWEEP_KNOCK = 6.0;
const BRAWL_BOSS_SEP = 0.95;           /* 两个 boss 的最小间距 */

/* ---- 战斗间台词 ----
   一句一句地说，同一个 key 有冷却；不叠屏、不刷屏。
   玩家能感知到的"boss 活着"，一半来自这些句子。 */
const BROLL_LINE_AT = {};
function brawlLine(key, line, gap){
  if (!line) return;
  const now = state.worldTime;
  const g = gap === undefined ? 3.4 : gap;
  if (BROLL_LINE_AT[key] !== undefined && now - BROLL_LINE_AT[key] < g) return;
  BROLL_LINE_AT[key] = now;
  toast(line, 2300);
}

const VOLLY_HIT = [
  '小林：「打他！别让他喘！」',
  '阿舟：「同学，你冷静一点行不行。」',
  '小林：「我志愿是来帮忙的，不是来挨打的！」'
];
const VOLLY_LOW = [
  '阿舟：「小林撑不住了！」',
  '小林：「没事……我还能站。」'
];
const VOLLY_STINK = [
  '小林：「什么味儿……呕 ——」',
  '阿舟：「你他妈从哪儿掏出来的！」'
];
const ZHAO_START = [
  '老赵把搪瓷杯往台阶上一放：「行，我活动活动。」'
];
const ZHAO_HIT = [
  '老赵：「小子，拳头不错。就是太急。」',
  '老赵：「这一下，跟谁学的？」',
  '老赵：「我在这门口站了三十年，这种人见多了。」'
];
const ZHAO_SWEEP = [
  '老赵：「蹲下！」',
  '老赵：「还有这一下。」'
];
const ZHAO_BACKSTAB = [
  '老赵：「背后有人。」',
  '老赵：「说过你太急了。」'
];
const ZHAO_LOW = [
  '老赵：「行啊……我认真了。」'
];
const ZHAO_LOSE = [
  '老赵：「坐着……坐下说。」'
];


/* boss 血条 DOM */
const brawlBarEl = $('bossBar');
const brawlBarName = $('bbName');
const brawlBarSub = $('bbSub');
const brawlBarFill = $('bbFill');

const brawlState = {
  phase: 0,                    /* 0 未开始 / 1 志愿者 / 2 老赵 / 3 已打赢 */
  hp: 0, max: 0,
  bosses: [],                  /* { name, p, group, ring, phase, active, ... } */
  lastHurtAt: -999,
  victoryPending: false,
  barDirty: false,
  barHitT: null
};

/* ---------------------------- 数值与手感 ---------------------------- */
function brawlDamage(){
  const id = heldWeaponId();
  if (!id) return 9;
  if (id === 'broom') return 14;
  if (id === 'mop') return 16;
  if (id === 'stool') return 19;
  return 11;
}

function brawlBossDisplay(){
  if (brawlState.phase === 1) return { name: '志愿者二人组', sub: '小林 · 阿舟' };
  if (brawlState.phase === 2) return { name: '门卫 · 老赵', sub: '校门口的最终防线' };
  return { name: '校门口的斗殴', sub: '' };
}

function brawlSetBar(dirty){
  if (!brawlBarEl) return;
  const d = brawlBossDisplay();
  if (brawlBarName) brawlBarName.textContent = d.name;
  if (brawlBarSub) brawlBarSub.textContent = d.sub;
  brawlState.barDirty = true;
  if (dirty){
    brawlBarEl.classList.add('hit');
    clearTimeout(brawlState.barHitT);
    brawlState.barHitT = setTimeout(() => brawlBarEl.classList.remove('hit'), 130);
  }
}

function brawlShowBar(){
  if (!brawlBarEl) return;
  brawlBarEl.classList.remove('hidden');
  brawlSetBar(false);
}

function brawlHideBar(){
  if (!brawlBarEl) return;
  brawlBarEl.classList.add('hidden');
  brawlBarEl.classList.remove('hit');
}

function brawlRefreshFill(){
  if (!brawlState.barDirty || !brawlBarFill) return;
  brawlState.barDirty = false;
  const pct = brawlState.max > 0
    ? Math.max(0, Math.min(100, (brawlState.hp / brawlState.max) * 100))
    : 0;
  brawlBarFill.style.width = pct.toFixed(1) + '%';
}

/* ---------------------------- 开局前的准备 ----------------------------
   校门口墙角那把扫把：给玩家一个"抄家伙"的机会。
   不强制拿 —— 空手也能打，只是慢。 */
function brawlBuildProps(){
  const x = CP.x - 5.0, z = CP.z + 9.3;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.z = 0.26;
  scene.add(g);
  box(0.05, 1.50, 0.05, 0x8a6a3a, 0, 0.80, 0, g, { roughness: 0.95 });
  box(0.30, 0.42, 0.16, 0xc8a165, 0, 0.20, 0.01, g, { roughness: 1 });
  for (let i = 0; i < 3; i++) box(0.03, 0.24, 0.03, 0xd8c8a0, -0.09 + i * 0.09, 0.04, 0.01, g);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.0),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 0.9, z);
  scene.add(hit);
  campusSpotTargets.push({
    obj: hit, label: '扫把', prompt: '[ E ] 抄起墙角的扫把', fn: brawlTakeBroom, __prop: g
  });
}

function brawlTakeBroom(){
  const idx = campusSpotTargets.findIndex(s => s.fn === brawlTakeBroom);
  if (idx < 0) return;
  const rec = campusSpotTargets[idx];
  campusSpotTargets.splice(idx, 1);
  scene.remove(rec.obj);
  if (rec.__prop) scene.remove(rec.__prop);
  const got = bagAdd('broom', 1);
  unlockAch('brawl_armed');
  audio.beep(680, 0.08, 0.05, 'triangle');
  toast(got ? '你抄起墙角那把扫把 —— 比拳头靠谱。' : '你手里已经有一把扫把了。', 2400);
}

/* ---------------------------- 准星：该不该出拳 ----------------------------
   打同学必须"准星真的指着他"：每个路过的考生都有一个不可见拾取盒，
   这里用射线判。只算距离 + 扇形的话，安检门前有人路过就会把 E 抢走。 */
function brawlClassmateInRange(){
  if (!campusStudentTargets.length) return null;
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = punchReach() + 0.3;
  const hits = raycaster.intersectObjects(campusStudentTargets.map(t => t.obj), false);
  if (!hits.length) return null;
  const rec = campusStudentTargets.find(t => t.obj === hits[0].object);
  if (!rec || !rec.student) return null;
  const s = rec.student;
  if (!s.group || !s.group.parent) return null;
  return s;
}

function brawlActiveBosses(){
  return brawlState.bosses.filter(b => b.active && b.group && b.group.parent);
}

/* campusInteract 最前面调它：只有"已经打起来了"才在这里拦截。
   打同学那条在 campusInteract 的后半段（brawlStudentInteract），
   安检 / 店铺 / 志愿者 / 传送圈都比它优先。 */
function brawlInteract(){
  if (state.ended) return false;

  /* 已经打赢、结局对话框还没弹出来（或被 Esc 关掉）的那一段：
     没有对话框就再弹一次，别让玩家卡在"时钟暂停 + 没有出路"里。 */
  if (brawlState.victoryPending){
    if (!hasDialog()) brawlVictoryDialog();
    setPrompt('校门口安静了下来……');
    promptEl.classList.remove('hidden');
    return true;
  }

  /* 打起来了：左键永远是出拳，店铺 / 安检 / 传送圈全部让位 */
  if (state.brawlActive){
    actionSpace = { fn: brawlPunch };
    const d = brawlBossDisplay();
    setPrompt('[ 左键 ] 出拳　·　' + d.name + ' ' + brawlState.hp + ' / ' + brawlState.max);
    promptEl.classList.remove('hidden');
    return true;
  }
  return false;
}

/* 没开打时，准星指着路过的同学才给"殴打同学" */
function brawlStudentInteract(){
  if (state.ended || state.brawlActive || state.brawlDone) return false;
  if (!pointerLocked) return false;       /* 未锁定时点击先申请锁定 */
  if (brawlClassmateInRange()){
    actionSpace = { fn: brawlPunch };
    setPrompt('[ 左键 ] 殴打同学（后果自负）');
    promptEl.classList.remove('hidden');
    return true;
  }
  return false;
}

/* ---------------------------- 出拳 ---------------------------- */
function brawlPunch(){
  if (state.view !== 'world' || state.ended || state.frozen) return;
  if (brawlState.victoryPending) return;

  if (!state.brawlActive){
    const s = brawlClassmateInRange();
    if (!s){ toast('你一拳抡空了。', 1000); return; }
    brawlFirstPunch(s);
    return;
  }

  const reach = punchReach(), arc = punchArc();
  const targets = [];
  for (const b of brawlActiveBosses()){
    const d = Math.hypot(state.pos.x - b.group.position.x, state.pos.z - b.group.position.z);
    if (d <= reach + 0.35 && inAttackArc(b.group.position.x, b.group.position.z, arc)) targets.push(b);
  }

  const wId = heldWeaponId();
  if (!targets.length){
    toast(wId ? '一' + ITEMS[wId].name + '抡了个空。' : '你一拳抡了个空。', 1000);
    return;
  }

  const dmg = brawlDamage();
  brawlState.hp = Math.max(0, brawlState.hp - dmg);
  brawlSetBar(true);
  audio.punch();

  /* 战斗间台词：谁挨了打谁说话 */
  const firstTarget = targets[0];
  if (firstTarget && firstTarget.name === '门卫 · 老赵'){
    brawlLine('zhao_hit', ZHAO_HIT[(firstTarget.swingCount | 0) % ZHAO_HIT.length]);
  } else if (firstTarget){
    brawlLine('volly_hit', VOLLY_HIT[(firstTarget.swingCount | 0) % VOLLY_HIT.length]);
  }
  kickView(0.06, (Math.random() - 0.5) * 0.06);
  hitStop = 0.09;
  const now = state.worldTime;
  for (const b of targets){
    b.hitFlash = 0.16;
    brawlShove(b, 0.42);
    /* 老赵的"认真"技能：短时间内吃三拳，突然绕到背后给你一肘 */
    if (b.name === '门卫 · 老赵'){
      b.playerHits = (b.playerHits || []).filter(t => now - t < 3.5);
      b.playerHits.push(now);
      if (b.playerHits.length >= 3 && now >= (b.nextTeleportAt || 0) &&
          !b.teleportPendingAt){
        b.teleportPendingAt = now + 0.22;
        b.nextTeleportAt = now + 6.0;
        b.playerHits = [];
        brawlSetBar(true);
        toast('老赵把搪瓷杯往台阶上一放 —— 他盯上你了。', 2200);
        audio.beep(120, 0.20, 0.06, 'sawtooth');
      }
    }
  }
  if (wId) wearWeapon(wId);

  if (brawlState.hp <= 0) brawlPhaseCleared();
}

function brawlFirstPunch(s){
  audio.punch();
  kickView(0.05, (Math.random() - 0.5) * 0.05);
  hitStop = 0.08;

  /* 先把拾取盒摘掉，再让身体散架 */
  if (s.userData && s.userData.hit){
    scene.remove(s.userData.hit);
    const hi = campusStudentTargets.findIndex(t => t.student === s);
    if (hi >= 0) campusStudentTargets.splice(hi, 1);
    s.userData.hit = null;
  }

  /* 同学只有一个下场：散架。用房间那套爆散，但 debris.js 已经按区域
     换成校园的边界平面，不会把碎块弹回教室。 */
  spawnBodyDebris(s.group, { speed: 3.4 });
  scene.remove(s.group);
  const i = campusStudents.indexOf(s);
  if (i >= 0) campusStudents.splice(i, 1);

  unlockAch('brawl_first');
  toast('你一拳把同学打倒在地。周围安静了一秒 —— 其他同学一哄而散。', 3000);
  brawlStart();
}

function brawlShove(b, dist){
  if (!b || !b.group) return;
  const p = b.group.position;
  const dx = p.x - state.pos.x, dz = p.z - state.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = p.x + (dx / d) * dist, nz = p.z + (dz / d) * dist;
  if (!collides(nx, p.z, 0.32)) p.x = nx;
  if (!collides(p.x, nz, 0.32)) p.z = nz;
}

/* ---------------------------- 开打 ---------------------------- */
function brawlOpenSpot(cx, cz, radius, angle){
  const b = AREA_BOUNDS.campus;
  for (const r of [radius, radius + 2, radius + 4]){
    for (let k = 0; k < 18; k++){
      const a = angle + (k / 18) * TAU;
      const x = clamp(cx + Math.cos(a) * r, -b.x + 0.7, b.x - 0.7);
      const z = clamp(cz + Math.sin(a) * r, b.zMin + 0.7, b.zMax - 0.7);
      if (!collides(x, z, 0.42)) return { x: x, z: z };
    }
  }
  return { x: clamp(cx, -b.x + 0.7, b.x - 0.7), z: clamp(cz, b.zMin + 0.7, b.zMax - 0.7) };
}

function brawlRemoveObstacle(ob){
  if (!ob) return;
  let i = campusColliders.indexOf(ob);
  if (i >= 0) campusColliders.splice(i, 1);
  i = obstacles.indexOf(ob);
  if (i >= 0) obstacles.splice(i, 1);
}

function brawlMakeRing(){
  const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.74, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff3b30, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false
    }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  scene.add(m);
  return m;
}

function brawlDressZhao(boss){
  /* 老赵的搪瓷杯：平时拿在手里，打起来就是钝器；倒下也会一起飞出去 */
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8),
    mat(0xd8d0b8, { metalness: 0.25, roughness: 0.55 }));
  cup.position.set(0, -0.29, 0.05);
  cup.rotation.x = 0.2;
  boss.p.armR.add(cup);
}

function brawlStart(){
  if (state.ended || state.brawlActive || state.brawlDone) return;

  state.brawlActive = true;
  brawlState.phase = 1;
  brawlState.hp = BRAWL_PHASE1_HP;
  brawlState.max = BRAWL_PHASE1_HP;
  brawlState.bosses = [];
  brawlState.lastHurtAt = -999;
  brawlState.victoryPending = false;

  revealHp();

  /* 围观的同学一哄而散：接下来的场面不适合未成年人 */
  for (const s of campusStudents){
    if (s.userData && s.userData.hit) scene.remove(s.userData.hit);
    scene.remove(s.group);
  }
  campusStudents.length = 0;
  campusStudentTargets.length = 0;

  const specs = [
    { name: '志愿者 · 小林', phase: 1, angle: 0.5, radius: 4.5, speed: 2.10, dmg: 1, range: 1.65, cd: 1.50 },
    { name: '志愿者 · 阿舟', phase: 1, angle: 2.7, radius: 4.5, speed: 1.95, dmg: 1, range: 1.65, cd: 1.65 },
    { name: '门卫 · 老赵', phase: 2, angle: 4.4, radius: 6.2, speed: 3.15, dmg: 1, range: 2.15, cd: 0.85 }
  ];

  for (const spec of specs){
    const idx = campusTalkTargets.findIndex(a => a.data && a.data.name === spec.name);
    if (idx < 0) continue;
    const rec = campusTalkTargets[idx];
    campusTalkTargets.splice(idx, 1);
    scene.remove(rec.obj);
    brawlRemoveObstacle(rec.obstacle);

    const p = rec.npc;
    const group = p.group;
    const spot = brawlOpenSpot(state.pos.x, state.pos.z, spec.radius, spec.angle);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = Math.atan2(state.pos.x - spot.x, state.pos.z - spot.z);

    const ring = brawlMakeRing();
    const boss = {
      name: spec.name, p: p, group: group, ring: ring, phase: spec.phase,
      active: spec.phase === 1,
      speed: spec.speed, dmg: spec.dmg, range: spec.range,
      cooldown: spec.cd, cd: state.worldTime + 0.9,
      windUntil: 0, windKind: 'normal', windRange: 0, windDmg: 0,
      hitFlash: 0, stunnedUntil: 0, swingCount: 0, rageAnnounced: false,
      playerHits: [], nextTeleportAt: 0, teleportPendingAt: 0,
      sweepRing: null, sweepDisk: null
    };
    if (spec.name === '门卫 · 老赵') brawlDressZhao(boss);
    brawlState.bosses.push(boss);
  }

  if (!brawlState.bosses.length){
    state.brawlActive = false;
    toast('……没有人过来。', 2000);
    return;
  }

  brawlShowBar();
  brawlRefreshFill();
  audio.beep(180, 0.40, 0.07, 'sawtooth');
  setTimeout(() => audio.beep(140, 0.50, 0.06, 'sawtooth'), 180);
  toast('志愿者小林、阿舟和门卫老赵围了上来。（这场架不计入入场时限）', 3600);
  setTimeout(() => toast('左键出拳 · 别让他们近身；臭水也能熏到他们。', 3200), 900);
}

/* ---------------------------- 每帧 AI ---------------------------- */
function updateBrawl(worldDt, t){
  if (!state.brawlActive || state.ended || state.frozen) return;
  const now = state.worldTime;

  for (const b of brawlState.bosses){
    if (b.ring){
      b.ring.position.set(b.group.position.x, 0.03, b.group.position.z);
      b.ring.rotation.z += worldDt * 1.6;
      b.ring.material.opacity = (b.active ? 0.45 : 0.20) + 0.14 * Math.sin(t * 4 + b.phase);
    }
    if (!b.active){
      brawlIdlePose(b);
      continue;
    }
    brawlUpdateBoss(b, worldDt, now, t);
    if (state.ended) return;
  }

  brawlSeparate();
  brawlRefreshFill();
}

function brawlIdlePose(b){
  if (!b.p) return;
  /* 老赵在第一阶段抱臂看戏 */
  b.p.armL.rotation.x = -1.10;
  b.p.armR.rotation.x = -1.10;
  b.p.head.rotation.y = Math.sin(performance.now() * 0.001) * 0.12;
  b.group.rotation.z = 0;
}

/* 老赵认真之后：短时间吃三拳 → 瞬移到背后 → 一肘 2 点伤害。
   定位时先试背后，再试左右，最后退回正面；保证不会瞬进墙里。 */
function brawlTeleportBackstab(b){
  if (!b.group || !b.group.parent) return;
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const tries = [
    [state.pos.x - fx * 1.25, state.pos.z - fz * 1.25],   /* 背后 */
    [state.pos.x + fx * 1.25, state.pos.z + fz * 1.25],   /* 正面（兜底） */
    [state.pos.x - fz * 1.25, state.pos.z + fx * 1.25],   /* 左 */
    [state.pos.x + fz * 1.25, state.pos.z - fx * 1.25]    /* 右 */
  ];
  let put = null;
  for (const p of tries){
    if (!collides(p[0], p[1], 0.32)){ put = p; break; }
  }
  if (!put) put = [state.pos.x, state.pos.z];
  b.group.position.x = put[0];
  b.group.position.z = put[1];
  b.group.position.y = 0;
  b.group.rotation.y = Math.atan2(state.pos.x - b.group.position.x,
                                  state.pos.z - b.group.position.z);
  b.p.armR.rotation.x = -1.55;
  b.p.armL.rotation.x = -0.9;
  if (b.ring) b.ring.material.opacity = 0.95;
  audio.beep(90, 0.22, 0.07, 'sawtooth');
  kickView(0.16, 0.08);
  if (redFlash){
    redFlash.style.opacity = '0.45';
    setTimeout(() => { redFlash.style.opacity = '0'; }, 180);
  }
  toast('老赵突然出现在你背后 —— 一肘砸下来！', 2400);
  brawlLine('zhao_backstab', ZHAO_BACKSTAB[Math.random() < 0.5 ? 0 : 1]);
  brawlHurtPlayer(2, b, 'backstab');
}

/* 扫堂腿的 3 秒预警：身体周围一圈红色圆弧 + 淡红地面。
   玩家有 3 秒离开半径 3.6m；时间到还在圈里 → 3 格血 + 击飞。 */
function brawlBeginSweep(b){
  brawlClearSweepFx(b);
  if (!b || !b.group) return;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(BRAWL_SWEEP_RADIUS, 0.09, 8, 64, Math.PI * 1.7),
    new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.9,
                                  depthWrite: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(b.group.position.x, 0.08, b.group.position.z);
  scene.add(ring);
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(BRAWL_SWEEP_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.10,
                                  side: THREE.DoubleSide, depthWrite: false }));
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(b.group.position.x, 0.045, b.group.position.z);
  scene.add(disk);
  b.sweepRing = ring;
  b.sweepDisk = disk;
}

function brawlClearSweepFx(b){
  if (!b) return;
  if (b.sweepRing){
    scene.remove(b.sweepRing);
    if (b.sweepRing.material) b.sweepRing.material.dispose();
    b.sweepRing = null;
  }
  if (b.sweepDisk){
    scene.remove(b.sweepDisk);
    if (b.sweepDisk.material) b.sweepDisk.material.dispose();
    b.sweepDisk = null;
  }
}

function brawlUpdateSweepFx(b, t, now){
  if (!b.sweepRing || !b.sweepDisk || !b.group) return;
  b.sweepRing.position.set(b.group.position.x, 0.08, b.group.position.z);
  b.sweepDisk.position.set(b.group.position.x, 0.045, b.group.position.z);
  const left = Math.max(0, b.windUntil - now);
  const pulse = 0.55 + 0.35 * Math.sin(t * (left < 1 ? 22 : 9));
  b.sweepRing.rotation.z = t * 0.8;
  b.sweepRing.material.opacity = pulse;
  b.sweepDisk.material.opacity = 0.06 + (1 - Math.min(1, left / BRAWL_SWEEP_WINDUP)) * 0.16;
}

function brawlSweepKnockback(b){
  if (!b || !b.group || state.ended) return;
  const dx = state.pos.x - b.group.position.x;
  const dz = state.pos.z - b.group.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  let px = state.pos.x, pz = state.pos.z;
  for (let i = 0; i < 24; i++){
    const nx = px + ux * (BRAWL_SWEEP_KNOCK / 24);
    const nz = pz + uz * (BRAWL_SWEEP_KNOCK / 24);
    if (collides(nx, nz, 0.28)) break;
    px = nx; pz = nz;
  }
  state.pos.x = px;
  state.pos.z = pz;
  kickView(0.20, (Math.random() - 0.5) * 0.10);
  toast('你被扫堂腿抽飞了出去 —— 直接掉了 3 格血！', 2600);
}

function brawlUpdateBoss(b, dt, now, t){
  if (!b.group || !b.group.parent) return;

  if (b.teleportPendingAt && now >= b.teleportPendingAt){
    b.teleportPendingAt = 0;
    brawlTeleportBackstab(b);
    return;
  }
  if (b.ring){
    b.ring.position.set(b.group.position.x, 0.03, b.group.position.z);
  }

  if (b.hitFlash > 0){
    b.hitFlash -= dt;
    b.group.rotation.z = Math.sin(t * 44) * 0.10;
  } else {
    b.group.rotation.z = 0;
  }

  /* 被臭水熏到：弯着腰干呕，不追不抓 */
  if (b.stunnedUntil > now){
    b.p.head.rotation.x = 0.45 + Math.sin(t * 18 + b.phase) * 0.16;
    b.p.head.rotation.y = 0;
    b.p.armL.rotation.x = -1.15;
    b.p.armR.rotation.x = -1.15;
    return;
  }
  b.p.head.rotation.x = 0;

  const zhao = b.name === '门卫 · 老赵';
  const rage = zhao && brawlState.phase === 2 &&
               brawlState.hp <= brawlState.max * 0.5;
  if (rage && !b.rageAnnounced){
    b.rageAnnounced = true;
    brawlLine('zhao_low', ZHAO_LOW[0], 1);
    toast('老赵把搪瓷杯放在台阶上 —— 他认真了。', 2800);
    audio.beep(160, 0.25, 0.06, 'sawtooth');
  }

  const dx = state.pos.x - b.group.position.x;
  const dz = state.pos.z - b.group.position.z;
  const d = Math.hypot(dx, dz) || 1;
  b.group.rotation.y = Math.atan2(dx, dz);

  /* 已经抬起手：时间到就结算这一下 */
  if (b.windUntil > 0){
    if (b.windKind === 'sweep') brawlUpdateSweepFx(b, t, now);
    if (now >= b.windUntil){
      const d2 = Math.hypot(state.pos.x - b.group.position.x,
                            state.pos.z - b.group.position.z);
      if (b.windKind === 'sweep'){
        brawlClearSweepFx(b);
        if (d2 <= BRAWL_SWEEP_RADIUS){
          const hp0 = state.hp;
          brawlHurtPlayer(BRAWL_SWEEP_DMG, b, 'sweep');
          if (!state.ended && state.hp < hp0) brawlSweepKnockback(b);
        } else {
          toast('老赵的扫堂腿扫了个空 —— 你及时出了圈。', 2200);
          audio.beep(260, 0.18, 0.05, 'triangle');
        }
      } else if (d2 <= b.windRange + 0.25){
        brawlHurtPlayer(b.windDmg, b, b.windKind);
      }
      b.windUntil = 0;
      b.cd = now + b.cooldown * (rage ? 0.68 : 1);
      b.p.armL.rotation.x = -0.3;
      b.p.armR.rotation.x = -0.3;
    } else {
      /* 抬手：一只拳头举起来，脚下红圈变亮，给玩家躲的时间 */
      b.p.armR.rotation.x = b.windKind === 'sweep' ? -0.9 : -1.45;
      b.p.armL.rotation.x = b.windKind === 'sweep' ? -0.9 : -0.55;
      b.p.head.rotation.y = 0;
      if (b.ring) b.ring.material.opacity = 0.75;
    }
    return;
  }

  /* 接近到攻击距离之内再停下来 */
  if (d > b.range * 0.85){
    const sp = b.speed * (rage ? 1.35 : 1) * dt;
    brawlStepBoss(b, dx / d, dz / d, sp);
    const v = Math.sin(t * 6 + b.phase) * 0.35;
    b.p.armL.rotation.x = -0.25 + v;
    b.p.armR.rotation.x = -0.25 - v;
    b.group.position.y = Math.abs(Math.sin(t * 6 + b.phase)) * 0.04;
    return;
  }

  b.group.position.y = 0;
  b.p.armL.rotation.x = -0.25;
  b.p.armR.rotation.x = -0.25;

  if (now >= b.cd){
    b.swingCount++;
    const sweep = (b.name === '门卫 · 老赵' && b.swingCount % 3 === 0);
    b.windKind = sweep ? 'sweep' : 'normal';
    b.windRange = sweep ? BRAWL_SWEEP_RADIUS : b.range + 0.35;
    b.windDmg = sweep ? BRAWL_SWEEP_DMG : b.dmg;
    b.windUntil = now + (sweep ? BRAWL_SWEEP_WINDUP :
                        BRAWL_ATTACK_WINDUP * (rage ? 0.78 : 1));
    audio.beep(sweep ? 220 : 360, sweep ? 0.18 : 0.10, 0.05, 'sawtooth');
    if (sweep){
      brawlBeginSweep(b);
      brawlLine('zhao_sweep', ZHAO_SWEEP[0]);
      toast('老赵沉下肩膀，脚下出现一圈红弧 —— 3 秒后扫堂腿，快出圈！', 3000);
    }
  }
}

/* 逐轴滑动，撞墙的那个轴不动；两个轴都撞就横着挪半步 */
function brawlStepBoss(b, nx, nz, sp){
  const p = b.group.position;
  let moved = false;
  if (!collides(p.x + nx * sp, p.z, 0.32)){ p.x += nx * sp; moved = true; }
  if (!collides(p.x, p.z + nz * sp, 0.32)){ p.z += nz * sp; moved = true; }
  if (!moved){
    const sx = -nz, sz = nx;
    if (!collides(p.x + sx * sp * 0.8, p.z, 0.32)) p.x += sx * sp * 0.8;
    if (!collides(p.x, p.z + sz * sp * 0.8, 0.32)) p.z += sz * sp * 0.8;
  }
}

function brawlSeparate(){
  const list = brawlActiveBosses();
  for (let i = 0; i < list.length; i++){
    for (let j = i + 1; j < list.length; j++){
      const a = list[i].group.position, b = list[j].group.position;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d <= 0.01 || d >= BRAWL_BOSS_SEP) continue;
      const push = (BRAWL_BOSS_SEP - d) * 0.5;
      const ux = dx / d, uz = dz / d;
      if (!collides(a.x - ux * push, a.z - uz * push, 0.3)){ a.x -= ux * push; a.z -= uz * push; }
      if (!collides(b.x + ux * push, b.z + uz * push, 0.3)){ b.x += ux * push; b.z += uz * push; }
    }
  }
}

/* ---------------------------- 挨打 ---------------------------- */
function brawlHurtPlayer(dmg, boss, kind){
  if (state.ended) return;
  const now = state.worldTime;
  if (now - brawlState.lastHurtAt < BRAWL_HURT_COOLDOWN) return;
  brawlState.lastHurtAt = now;

  /* 茶叶蛋在斗殴里也认：阿姨说顶饿，没说只对保安有效 */
  if ((state.eggShield | 0) > 0){
    state.eggShield--;
    toast('茶叶蛋替你挡了一下 —— ' + (boss ? boss.name : '对面') + '的手滑了。', 2400);
    audio.beep(520, 0.10, 0.05, 'triangle');
    return;
  }

  state.hp -= dmg;
  if (state.hp < 0) state.hp = 0;
  renderHp();
  if (redFlash){
    redFlash.style.opacity = '0.55';
    setTimeout(() => { redFlash.style.opacity = '0'; }, 200);
  }
  audio.beep(150, 0.22, 0.07, 'sawtooth');
  kickView(0.07, (Math.random() - 0.5) * 0.07);

  if (kind === 'sweep'){
    toast('老赵一记扫堂腿 —— 你被踢得后退了两步。', 2000);
    brawlLine('zhao_hurt_sweep', '老赵：「说了让你出圈。」', 2.2);
  } else if (kind === 'backstab'){
    toast('老赵从背后一肘砸在你肩上 —— 掉了 2 格血。', 2200);
    brawlLine('zhao_hurt_back', '老赵：「别老往我背后贴。」', 2.2);
  } else {
    toast((boss ? boss.name : '对面') + '一拳打在你身上。', 1600);
  }

  /* 被打退一小步（不穿墙） */
  if (boss && boss.group){
    const dx = state.pos.x - boss.group.position.x;
    const dz = state.pos.z - boss.group.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = state.pos.x + (dx / d) * 0.7;
    const nz = state.pos.z + (dz / d) * 0.7;
    const b = state.bounds;
    if (!collides(nx, state.pos.z, 0.28)) state.pos.x = clamp(nx, -b.x, b.x);
    if (!collides(state.pos.x, nz, 0.28)) state.pos.z = clamp(nz, b.zMin, b.zMax);
  }

  if (state.hp <= 0) brawlLose();
}

/* ---------------------------- 阶段切换 / 收场 ---------------------------- */
function brawlKillBossVisual(b, speed){
  if (!b) return;
  brawlClearSweepFx(b);
  if (b.ring){ scene.remove(b.ring); b.ring = null; }
  if (b.group && b.group.parent){
    spawnBodyDebris(b.group, { speed: speed || 4.0 });
    scene.remove(b.group);
  }
  b.active = false;
}

function brawlPhaseCleared(){
  if (brawlState.phase === 1){
    for (const b of brawlState.bosses){
      if (b.phase === 1 && b.active) brawlKillBossVisual(b, 4.0);
    }
    brawlState.phase = 2;
    brawlState.hp = BRAWL_PHASE2_HP;
    brawlState.max = BRAWL_PHASE2_HP;

    const zhao = brawlState.bosses.find(b => b.phase === 2);
    if (zhao && zhao.group && zhao.group.parent){
      const d = Math.hypot(state.pos.x - zhao.group.position.x,
                           state.pos.z - zhao.group.position.z);
      if (d > 9){
        const spot = brawlOpenSpot(state.pos.x, state.pos.z, 5.5, 3.4);
        zhao.group.position.set(spot.x, 0, spot.z);
      }
      zhao.active = true;
      zhao.cd = state.worldTime + 1.0;
      zhao.windUntil = 0;
    }

    state.hp = Math.min(state.hpMax || HP_MAX, state.hp + 1);
    renderHp();
    brawlShowBar();
    brawlSetBar(true);
    brawlRefreshFill();
    audio.beep(200, 0.30, 0.06, 'sawtooth');
    setTimeout(() => audio.beep(150, 0.40, 0.06, 'sawtooth'), 200);
    toast('志愿者二人组倒了。老赵把搪瓷杯放在台阶上：「行，我活动活动。」', 3800);
    brawlLine('zhao_start', ZHAO_START[0], 1);
    return;
  }

  if (brawlState.phase === 2){
    const zhao = brawlState.bosses.find(b => b.phase === 2);
    brawlKillBossVisual(zhao, 4.6);
    brawlState.phase = 3;
    brawlState.victoryPending = true;
    brawlHideBar();
    unlockAch('brawl');
    audio.beep(880, 0.20, 0.05, 'sine');
    setTimeout(() => audio.beep(1180, 0.26, 0.04, 'sine'), 160);
    toast('老赵倒了。校门口只剩下你和一地狼藉。', 3000);

    setTimeout(() => {
      if (state.ended) return;
      brawlVictoryDialog();
    }, 950);
  }
}

function brawlVictoryDialog(){
  if (!brawlState.victoryPending) return;
  if (hasDialog()) return;                 /* 已经开着别的弹窗，别叠上去 */
  openDialog({
    title: '老 赵 认 输',
    text: '老赵坐在台阶上，从兜里摸出那个搪瓷杯，拧开喝了一口。\n' +
          '「行了……进去吧。\n' +
          '　别跟人说是我放你进的。」\n\n' +
          '他指了指教学楼的方向，没再看你。',
    options: [
      { label: '「行了，我进去考试。」', cb: dlg => {
          closeDialog(dlg);
          brawlFinishContinue();
        } },
      { label: '「叔，您没事吧？」', cb: dlg => {
          setDialogContent(dlg, {
            text: '老赵摆摆手：「死不了。」\n' +
                  '「比你爷爷当年差远了。」\n' +
                  '他笑了一下，又咳了两声。',
            options: [{ label: '去考试', cb: d2 => { closeDialog(d2); brawlFinishContinue(); } }]
          });
        } },
      { label: '「我送您去医务室。」', cb: dlg => {
          closeDialog(dlg);
          brawlFinishEnding();
        } }
    ]
  });
}

function brawlCleanup(){
  for (const b of brawlState.bosses){
    brawlClearSweepFx(b);
    if (b.ring){ scene.remove(b.ring); b.ring = null; }
    if (b.group && b.group.parent) scene.remove(b.group);
  }
  brawlState.bosses = [];
  brawlHideBar();
  state.brawlActive = false;
  /* 别把上一帧的"出拳"动作留给下一帧的点击 */
  actionSpace = null;
  actionE = null;
  actionF = null;
}

function brawlFinishContinue(){
  brawlState.victoryPending = false;
  brawlCleanup();
  state.brawlDone = true;
  state.hp = state.hpMax || HP_MAX;
  renderHp();
  toast('你拍了拍身上的灰，往教学楼走去。', 2800);
}

function brawlFinishEnding(){
  brawlState.victoryPending = false;
  brawlCleanup();
  state.brawlDone = true;
  endByBrawlLegend();
}

function brawlLose(){
  if (state.ended) return;
  brawlCleanup();
  state.brawlDone = true;
  endByBrawlLost();
}

/* ---------------------------- 臭水联动 ----------------------------
   items.js 的 throwStinkWater 会在校园里调它。返回被熏到的人数。 */
function brawlStink(center, r){
  if (!state.brawlActive) return 0;
  let n = 0;
  for (const b of brawlState.bosses){
    if (!b.active || !b.group) continue;
    /* 老赵免疫臭水，但会嘲讽你一句；志愿者二人组照常被熏。
       判定同时看落点和玩家脚下 —— 贴脸时瓶子经常从头上飞过去，
       只认落点会让玩家觉得"志愿者不吃臭水"。 */
    const dDrop = Math.hypot(b.group.position.x - center.x,
                             b.group.position.z - center.z);
    const dSelf = Math.hypot(b.group.position.x - state.pos.x,
                             b.group.position.z - state.pos.z);
    const inRange = Math.min(dDrop, dSelf) <= r + 0.35;
    if (!inRange) continue;
    if (b.name === '门卫 · 老赵'){
      if (state.worldTime - (b.lastStinkLineAt || -999) > 2.6){
        b.lastStinkLineAt = state.worldTime;
        toast('老赵：「这味儿，还不如我值班室那桶拖把水。」', 2400);
      }
      continue;
    }
    if (state.worldTime - (b.lastStinkLineAt || -999) > 2.6){
      b.lastStinkLineAt = state.worldTime;
      brawlLine('volly_stink', VOLLY_STINK[Math.random() < 0.5 ? 0 : 1], 1);
    }
    b.stunnedUntil = state.worldTime + STINK_STUN;
    b.windUntil = 0;                 /* 抬手到一半被熏，这一下就没了 */
    n++;
  }
  return n;
}
