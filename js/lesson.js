'use strict';
/* =========================================================================
   lesson —— 网吧里那个连第一题都没 AC 的人
   ---------------------------------------------------------------------
   考后走进网吧，最里面那排机位旁边站着一个人：显示器亮着，题目停在
   第一道题的评测记录上，一片红。他不是 BOSS，只是恰好和你一样在考试。

   设计要点：
     · 只在**考后**出现（考前网吧是"脱校服包夜"那条线，人设冲突）；
     · 两个选项：嘲讽 → 开打；离开 → 什么都不发生（连成就都没有）；
     · 战力：血量 120（低于老赵 200，远高于志愿者 50），
       但不会瞬移、不会扫堂腿 —— 他没有招，他只是不肯倒；
     · 半血停手 2 秒低头，你能打，他再抬头；
     · 臭水有效但只停 1.2 秒（不给"控一片"的解法，也不给免疫）；
     · 输了被推出网吧，不结束本场，成就「被 0 分打倒」。
   ========================================================================= */

const LESSON_HP = 120;
const LESSON_HURT_COOLDOWN = 0.9;
const LESSON_STINK_STUN = 1.2;
const LESSON_SILENT_TIME = 2.0;      /* 半血沉默多久 */
const LESSON_SWING_RANGE = 1.8;

let lessonBuilt = false, lessonPerson = null, lessonHit = null, lessonGroup = null;
let lessonScr = null, lessonCan = null, lessonKey = null;

const lessonState = {
  hp: 0, max: LESSON_HP,
  lastHurtAt: -999,
  swingCount: 0,
  silentUntil: 0,
  silentShown: false,
  windUntil: 0,
  cd: 0,
  ring: null,
  armWind: 0,
  over: false
};

/* ---------------------------- 建模 ----------------------------
   站位：**左墙与机位之间的过道**（bx-8.2, bz+2.4），19×15 的新网吧里
   这一整条路都没有碰撞。历史上两次踩坑记在这里：
     ① 最里排机位旁（bx-5.25, bz-2.35）紧挨 1 号机的桌椅碰撞盒，AI 卡死；
     ② 门口正对出口那一小块，虽然空，但玩家一进门就和他贴脸。 */
function lessonBuild(){
  if (lessonBuilt) return;
  lessonBuilt = true;
  const bx = NETBAR.x, bz = NETBAR.z;

  if (!netbarBuilt) buildNetbarInterior();

  const G = new THREE.Group();
  G.position.set(0, 0, 0);
  G.visible = false;                 /* 只考后才出现；见 lessonVisible / lessonShow */
  scene.add(G);
  lessonGroup = G;

  const px = bx - 8.2, pz = bz + 2.4;
  const p = buildPerson(px, pz, 0x30384a, Math.PI / 2, 'stand');
  /* 眼镜和立起来的衣领：让它看起来像个熬夜的人，不是一个杂兵 */
  box(0.20, 0.05, 0.02, 0x101318, 0.0, 1.42, 0.15, p.group);
  box(0.24, 0.04, 0.16, 0x4a5570, 0.0, 1.16, 0.03, p.group);
  p.group.rotation.y = Math.PI / 2;
  G.add(p.group);
  lessonPerson = p;

  /* 他脚边那罐没开的可乐（空的，一直没开） */
  box(0.09, 0.16, 0.09, 0xc0392b, px + 0.45, 0.08, pz + 0.2, G);

  /* 3 号的那块屏：远处那台机子亮着红，评测记录停在第一题 */
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36),
    new THREE.MeshBasicMaterial({ color: 0x3a0d10 }));
  scr.position.set(bx - 7.0, 1.28, bz - 5.35);
  G.add(scr);
  lessonScr = scr;

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 1.0),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(px, 0.95, pz);
  hit.userData.lessonHit = true;
  scene.add(hit);
  lessonHit = hit;
  /* 交互盒不进 netbarTargets 的常驻列表：它跟 lessonGroup 一起开/关，
     否则考前的网吧里会有一个"看不见但点得到"的人。 */
  netbarTargets.push({ obj: hit, kind: 'lesson', label: '小明' });

  /* 脚下的圈：进战斗才出现 */
  lessonState.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff5f6d, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false
    }));
  lessonState.ring.rotation.x = -Math.PI / 2;
  lessonState.ring.position.set(px, 0.03, pz);
  lessonState.ring.visible = false;
  scene.add(lessonState.ring);
}

/* 他只在考后出现；考前网吧不该有这个人 */
function lessonVisible(){
  return state.netbarMode === 'post' && !state.lessonDone;
}

function lessonShow(on){
  if (!lessonGroup) return;
  lessonGroup.visible = !!on;
  if (lessonHit) lessonHit.visible = !!on;
  if (lessonState.ring) lessonState.ring.visible = !!on && state.lessonActive;
}

/* ---------------------------- 对话 ---------------------------- */
function lessonTalk(){
  if (state.lessonDone){
    openDialog({
      title: '小 明',
      text: '门口只剩下那罐没开的可乐，还在他刚才站的地方。\n远处 3 号的屏幕亮着，评测记录停在第一题。',
      options: [{ label: '……', cb: d => closeDialog(d) }]
    });
    return;
  }
  if (state.lessonActive) return;
  openDialog({
    title: '小 明',
    text: '他转过头，愣了一下才认出你。\n' +
          '「……你考完了？」\n' +
          '「我 AC 了零道。第一题。第一题啊。」\n' +
          '「我练了两年。」',
    options: [
      { label: '「两年练出个 0 分？」', cb: d => {
          closeDialog(d);
          lessonStart();
        } },
      { label: '什么也不说，转身走开', cb: d => {
          closeDialog(d);
          state.lessonDone = true;
          lessonShow(false);
          toast('他在你身后站着，没有再说话。', 2600);
          setTimeout(() => {
            if (state.area === 'netbar' && !state.ended) {
              toast('网管叹了口气：「他坐了一晚上，我都没好意思赶。」', 3400);
            }
          }, 2800);
        } }
    ]
  });
}

/* ---------------------------- 开战 ---------------------------- */
function lessonStart(){
  if (state.lessonActive || state.lessonDone || !lessonBuilt) return;
  lessonBuild();
  if (!lessonVisible()) return;

  state.lessonActive = true;
  state.lessonHearts = (state.hp <= 0);
  lessonState.hp = LESSON_HP;
  lessonState.max = LESSON_HP;
  lessonState.lastHurtAt = -999;
  lessonState.swingCount = 0;
  lessonState.silentUntil = 0;
  lessonState.silentShown = false;
  lessonState.stunnedUntil = 0;
  lessonState.windUntil = 0;
  lessonState.cd = state.worldTime + 0.8;
  lessonState.over = false;
  /* 站位复位：上一场可能已经把他挪到过道中间 */
  if (lessonPerson && lessonPerson.group){
    const gp = lessonPerson.group;
    gp.position.x = NETBAR.x - 8.2;
    gp.position.z = NETBAR.z + 2.4;
    gp.rotation.y = Math.PI / 2;
    lessonPerson.head.rotation.x = 0;
    lessonPerson.armL.rotation.x = -0.25;
    lessonPerson.armR.rotation.x = -0.25;
  }

  revealHp();
  if (state.hp <= 0) state.hp = state.hpMax || HP_MAX;
  renderHp();

  if (lessonState.ring) lessonState.ring.visible = true;
  showLessonBar();
  lessonFillBar();

  audio.beep(180, 0.35, 0.06, 'sawtooth');
  lessonSay('lesson_start', '他把键盘往桌上一砸 ——「我练了两年！！」');
}

/* 血条只有 brawl.js 有；lesson.js 在它之前加载，
   所以这里必须**在调用时**读 DOM，而不是在加载期抓常量。 */
function showLessonBar(){
  const el = $('bossBar');
  const nm = $('bbName');
  const sb = $('bbSub');
  if (nm) nm.textContent = '小 明';
  if (sb) sb.textContent = '连第一题都没 AC 的人';
  if (el) el.classList.remove('hidden');
}

function hideLessonBar(){
  const el = $('bossBar');
  if (el) el.classList.add('hidden');
}

function lessonFillBar(){
  const fill = $('bbFill');
  if (!fill) return;
  const pct = Math.max(0, Math.min(100, lessonState.hp / lessonState.max * 100));
  fill.style.width = pct.toFixed(1) + '%';
}

/* ---------------------------- 战场语音 ----------------------------
   一句一句地说，不叠屏。同一个 key 有冷却，避免连打时刷屏。 */
const LESSON_SAY_AT = {};
function lessonSay(key, line){
  if (!line) return;
  const now = state.worldTime;
  if (LESSON_SAY_AT[key] !== undefined && now - LESSON_SAY_AT[key] < 1.6) return;
  LESSON_SAY_AT[key] = now;
  toast(line, 2200);
}

const LESSON_HIT_LINES = [
  '「就差一个分号……就差一个分号！！」',
  '「我改了三个小时，它告诉我 WA。」',
  '「为什么你行？」',
  '「编译器都在看我笑话。」'
];
const LESSON_WHIFF_LINES = [
  '他一拳砸在机箱上，风扇响了一声。',
  '「……你别躲啊。」'
];
const LESSON_LOW_LINES = [
  '「我昨天还做了三十道题。」',
  '「我妈问我考得怎么样。」',
  '「我就想 AC 一道。」'
];

/* ---------------------------- 挨打 ---------------------------- */
function lessonHurtPlayer(dmg){
  if (state.ended && !state.postExamWorld) return;
  const now = state.worldTime;
  if (now - lessonState.lastHurtAt < LESSON_HURT_COOLDOWN) return;
  lessonState.lastHurtAt = now;

  if ((state.eggShield | 0) > 0){
    state.eggShield--;
    toast('茶叶蛋替你挡了一下 —— 他的手滑了。', 2200);
    audio.beep(520, 0.10, 0.05, 'triangle');
    return;
  }

  state.hp -= dmg;
  if (state.hp < 0) state.hp = 0;
  renderHp();
  if (redFlash){
    redFlash.style.opacity = '0.5';
    setTimeout(() => { redFlash.style.opacity = '0'; }, 180);
  }
  audio.beep(150, 0.2, 0.06, 'sawtooth');
  kickView(0.07, (Math.random() - 0.5) * 0.06);
  lessonSay('lesson_hurt', dmg >= 2
    ? '他把整块键盘抡了过来 ——「我连键盘都不要了！」'
    : '「你连过题的手都比我快。」');

  /* 被打退一小步 */
  if (lessonPerson && lessonPerson.group){
    const dx = state.pos.x - lessonPerson.group.position.x;
    const dz = state.pos.z - lessonPerson.group.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = state.pos.x + (dx / d) * 0.6;
    const nz = state.pos.z + (dz / d) * 0.6;
    const b = state.bounds;
    if (!collides(nx, state.pos.z, 0.28)) state.pos.x = clamp(nx, -b.x, b.x);
    if (!collides(state.pos.x, nz, 0.28)) state.pos.z = clamp(nz, b.zMin, b.zMax);
  }

  if (state.hp <= 0) lessonLose();
}

/* ---------------------------- 每帧 ---------------------------- */
function updateLesson(worldDt, t){
  /* 考后流程 state.ended 一直是 true，所以只认"世界已彻底结束" */
  if (!state.lessonActive || (state.ended && !state.postExamWorld)) return;
  const now = state.worldTime;
  const p = lessonPerson && lessonPerson.group;
  if (!p) return;

  if (lessonState.ring) lessonState.ring.visible = true;
  if (lessonState.ring){
    lessonState.ring.position.set(p.position.x, 0.03, p.position.z);
    lessonState.ring.material.opacity = 0.35 + 0.2 * Math.sin(t * 5);
  }

  /* 半血：先低头沉默，之后才继续喊 */
  if (!lessonState.silentShown && lessonState.hp <= lessonState.max * 0.5){
    lessonState.silentShown = true;
    lessonState.silentUntil = now + LESSON_SILENT_TIME;
    lessonState.windUntil = 0;
    lessonSay('lesson_silent', '他忽然停住了，低着头，一动不动。');
  }
  if (lessonState.silentUntil > now){
    lessonPerson.head.rotation.x = 0.42;
    lessonPerson.head.rotation.y = 0;
    lessonPerson.armL.rotation.x = -0.12;
    lessonPerson.armR.rotation.x = -0.12;
    return;
  }
  lessonPerson.head.rotation.x = 0;

  /* 被臭水呛到：弯着腰咳，1.2 秒，不追不抓 */
  if ((lessonState.stunnedUntil || 0) > now){
    const jerk = Math.sin(t * 18);
    lessonPerson.head.rotation.x = 0.44 + jerk * 0.14;
    lessonPerson.armL.rotation.x = -1.1;
    lessonPerson.armR.rotation.x = -1.1;
    lessonState.windUntil = 0;
    return;
  }

  const dx = state.pos.x - p.position.x;
  const dz = state.pos.z - p.position.z;
  const d = Math.hypot(dx, dz) || 1;
  p.rotation.y = Math.atan2(dx, dz);

  /* 抬手 */
  if (lessonState.windUntil > 0){
    lessonPerson.armR.rotation.x = -1.5;
    lessonPerson.armL.rotation.x = -0.7;
    if (now >= lessonState.windUntil){
      lessonState.windUntil = 0;
      lessonPerson.armR.rotation.x = -0.3;
      if (d <= LESSON_SWING_RANGE + 0.3){
        lessonHurtPlayer(lessonState.lastDmg || 1);
      } else {
        lessonSay('lesson_whiff', LESSON_WHIFF_LINES[
          (lessonState.swingCount | 0) % LESSON_WHIFF_LINES.length]);
      }
    }
    return;
  }

  /* 贴上来 */
  if (d > 1.5){
    const sp = 2.0 * worldDt;
    const nx = p.position.x + dx / d * sp;
    const nz = p.position.z + dz / d * sp;
    if (!collides(nx, p.position.z, 0.3)) p.position.x = nx;
    if (!collides(p.position.x, nz, 0.3)) p.position.z = nz;
    const v = Math.sin(t * 6) * 0.3;
    lessonPerson.armL.rotation.x = -0.25 + v;
    lessonPerson.armR.rotation.x = -0.25 - v;
    return;
  }

  /* 出手：普通 1 点，每三次有一次"摔键盘"2 点 */
  if (now >= lessonState.cd){
    lessonState.swingCount++;
    const kb = (lessonState.swingCount % 3 === 0);
    lessonState.lastDmg = kb ? 2 : 1;
    lessonState.windUntil = now + (kb ? 0.55 : 0.40);
    lessonState.cd = now + (kb ? 1.5 : 1.0);
    audio.beep(kb ? 200 : 360, kb ? 0.16 : 0.08, 0.05, 'sawtooth');
    if (kb) lessonSay('lesson_kb', '他把键盘举了起来 ——「我连键盘都不要了！」');
  }
}

/* ---------------------------- 玩家出拳 ---------------------------- */
function lessonPunch(){
  /* 考后流程里 state.ended 是 true（只有 postExamWorld 放行移动与交互），
     所以这里不能用 `state.ended` 直接 return —— 那会让拳头静默失效。 */
  if (!state.lessonActive || state.frozen) return;
  if (state.ended && !state.postExamWorld) return;
  const p = lessonPerson && lessonPerson.group;
  if (!p) return;
  const d = Math.hypot(state.pos.x - p.position.x, state.pos.z - p.position.z);
  if (d > punchReach() + 0.4 ||
      !inAttackArc(p.position.x, p.position.z, punchArc())){
    toast('你挥空了。', 900);
    return;
  }

  const dmg = brawlDamage();
  lessonState.hp = Math.max(0, lessonState.hp - dmg);
  lessonFillBar();
  audio.punch();
  kickView(0.05, (Math.random() - 0.5) * 0.05);
  hitStop = 0.09;
  const wId = heldWeaponId();
  if (wId) wearWeapon(wId);

  if (lessonState.hp > 0 && lessonState.hp <= lessonState.max * 0.35){
    lessonSay('lesson_low', LESSON_LOW_LINES[
      (lessonState.swingCount | 0) % LESSON_LOW_LINES.length]);
  } else {
    lessonSay('lesson_hit', LESSON_HIT_LINES[
      (lessonState.swingCount | 0) % LESSON_HIT_LINES.length]);
  }

  if (lessonState.hp <= 0) lessonWin();
}

/* 臭水：有效，但只停 1.2 秒（不是免疫，也不是控一片） */
function lessonStink(){
  if (!state.lessonActive) return 0;
  const p = lessonPerson && lessonPerson.group;
  if (!p) return 0;
  const d = Math.hypot(p.position.x - state.pos.x, p.position.z - state.pos.z);
  if (d > STINK_RADIUS + 0.6) return 0;
  lessonState.stunnedUntil = state.worldTime + LESSON_STINK_STUN;
  lessonState.windUntil = 0;
  lessonSay('lesson_stink', '他被呛得直咳嗽：「……连这个你都带进来了。」');
  return 1;
}

/* ---------------------------- 胜负 ---------------------------- */
function lessonWin(){
  if (lessonState.over) return;
  lessonState.over = true;
  state.lessonActive = false;
  state.lessonDone = true;
  hideLessonBar();
  if (lessonState.ring) lessonState.ring.visible = false;

  /* 他蹲回门口那罐可乐旁边，屏幕还是红的 */
  if (lessonPerson && lessonPerson.group){
    const p = lessonPerson.group;
    p.position.x = NETBAR.x - 8.2;
    p.position.z = NETBAR.z + 2.4;
    p.rotation.y = Math.PI / 2;
    /* buildPerson 返回 { group, armL, armR, head } —— 部件在**外层**，
       不在 group 上（group 是 THREE.Group，没有 head/armL）。 */
    lessonPerson.head.rotation.x = -0.35;
    lessonPerson.armL.rotation.x = -0.1;
    lessonPerson.armR.rotation.x = -0.1;
  }
  if (lessonScr) lessonScr.material.color.setHex(0x2a0b0d);

  audio.beep(220, 0.4, 0.06, 'sine');
  toast('他背过身，低下头。屏幕还停在第一题。', 3000);
  setTimeout(() => {
    if (state.area === 'netbar' && !(state.ended && !state.postExamWorld)){
      toast('网管：「……我说了不赶人的。」', 3200);
    }
  }, 1600);

  setTimeout(() => {
    if (state.ended && !state.postExamWorld) return;
    openDialog({
      title: '小 明',
      text: '他蹲在门口，肩膀一起一伏。\n' +
            '远处 3 号的评测记录一片红，最上面那行写着「第一题 · 0 分」。\n\n' +
            '他没有再看你。',
      options: [{ label: '……', cb: d => closeDialog(d) }]
    });
  }, 900);
}

function lessonLose(){
  if (lessonState.over) return;
  lessonState.over = true;
  state.lessonActive = false;
  state.lessonDone = true;
  hideLessonBar();
  if (lessonState.ring) lessonState.ring.visible = false;
  unlockAch('lesson_lose');

  /* 被推出网吧：人站到门口，状态不结束 */
  lessonShow(false);
  state.pos.set(NETBAR.x, PLAYER_EYE, NETBAR.z + 4.2);
  state.yaw = Math.PI / 2; yawTarget = Math.PI / 2;
  state.pitch = 0; pitchTarget = 0;
  state.hp = state.hpMax || HP_MAX;
  renderHp();

  audio.beep(160, 0.5, 0.07, 'square');
  toast('你被推出了网吧。门在你身后合上 —— 那罐可乐还留在门口。', 3600);
  setTimeout(() => {
    if (state.ended && !state.postExamWorld) return;
    openDialog({
      title: '网 吧 门 口',
      text: '你站在街上，霓虹灯在头顶响。\n再进门的时候，他已经走了，门口只剩那罐没开的可乐。',
      options: [{ label: '……', cb: d => closeDialog(d) }]
    });
  }, 1200);
}

/* 战斗中被判定打中：挂到更新循环 */
function lessonTouches(point){
  if (!state.lessonActive) return false;
  const p = lessonPerson && lessonPerson.group;
  if (!p) return false;
  return Math.hypot(p.position.x - point.x, p.position.z - point.z) < 1.3;
}
