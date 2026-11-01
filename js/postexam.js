'use strict';
/* =========================================================================
   postexam —— 考后流程：网吧 dino → 学校场景 → 结算 / 派出所
   ---------------------------------------------------------------------
   考试时间到（或提前交卷）之后，不直接弹结算页：
     ① 先给一个"考完了"的菜单，可以去网吧打一局 dino.exe；
     ② dino 打完，再按**本次考试得分**进入学校场景：
          360+ 表彰大会 / 300-359 光荣榜 / 200-299 班主任办公室 /
          1-199 补考报名 / 0 零分传奇；五次走动被取消成绩另有教务处场景；
     ③ 只要涉嫌殴打他人（打监考、击倒保安、校门口斗殴后继续考试），
        学校场景会换成派出所询问室；
     ④ 每个场景有一个小任务（选一句话/签个字），任务结果写进最终结算。

   为什么单独一个文件：
     它是纯 DOM 的叙事层，不碰 3D；和 ending.js 的"最终结算页"分工清楚：
       postexam.js  考试结束后的中间流程（菜单 / 网吧 / 学校 / 派出所）
       ending.js    最终的那一页：分数、榜、成就、再来一场
   ========================================================================= */

const postExamEl = $('postExam');
const peKicker = $('peKicker');
const peIcon = $('peIcon');
const peTitle = $('peTitle');
const peSub = $('peSub');
const peBody = $('peBody');
const peStats = $('peStats');
const peActions = $('peActions');

/* ---------------------------- 小工具 ---------------------------- */
function postExamAssault(){
  return !!(state.teacherDown || (state.guardKills | 0) > 0 || state.brawlDone);
}

function postExamTier(){
  if (state.postExamReason === 'canceled') return 'canceled';
  const s = state.totalScore | 0;
  if (s >= 360) return 'honor';
  if (s >= 300) return 'good';
  if (s >= 200) return 'office';
  return 'coach';
}

function postExamScore(){
  let total = 0;
  for (const p of state.problems) total += state.score[p.id] || 0;
  state.totalScore = total;
  return total;
}

function postExamRank(){
  const all = rivalCount();
  const rank = playerRank(state.elapsed);
  return { rank: rank, all: all };
}

function postExamDinoLine(){
  if (!state.postDinoPlayed) return '';
  return '\n\n—— 网吧插曲 ——\n你在极速网咖又打了一局 dino.exe：' +
         state.postDinoScore + ' 分（历史最高 ' + state.dinoHigh + ' 分）。';
}

function postExamStats(){
  const r = postExamRank();
  return [
    { label: '得分', value: state.totalScore + ' / 400' },
    { label: '名次', value: '第 ' + r.rank + ' / ' + r.all },
    { label: '警告', value: state.warnCount + ' 次' },
    { label: 'dino', value: state.postDinoPlayed ? state.postDinoScore + ' 分' : '未打' }
  ];
}

/* ---------------------------- 通用渲染 ---------------------------- */
function peRender(opts){
  postExamEl.className = 'screen ' + (opts.cls || '');
  postExamEl.classList.remove('hidden');
  if (peKicker) peKicker.textContent = opts.kicker || '';
  if (peIcon) peIcon.textContent = opts.icon || '🎒';
  if (peTitle) peTitle.textContent = opts.title || '';
  if (peSub) peSub.textContent = opts.sub || '';
  if (peBody) peBody.textContent = opts.body || '';

  if (peStats){
    peStats.innerHTML = '';
    const stats = opts.stats || postExamStats();
    for (const s of stats){
      const d = document.createElement('div');
      d.className = 'pe-stat';
      d.textContent = s.label;
      const b = document.createElement('b');
      b.textContent = s.value;
      d.appendChild(b);
      peStats.appendChild(d);
    }
  }

  if (peActions){
    peActions.innerHTML = '';
    (opts.actions || []).forEach((a, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn' + (i === 0 ? ' primary' : '');
      btn.textContent = a.label;
      btn.onclick = () => { try { a.fn(); } catch(e){} };
      peActions.appendChild(btn);
    });
  }

  state.view = 'postexam';
  releaseLock();
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
}

/* 最终结算：把场景结果、成绩、榜、dino 一起交给 ending.js */
function postExamFinal(opts){
  postExamEl.classList.add('hidden');
  state.postExam = false;
  state.postExamWorld = false;
  state.postExamStage = '';
  state.view = 'ending';
  if (postSchoolBuilt){
    for (const k in postSchoolGroups) postSchoolGroups[k].visible = false;
  }
  if (hallGroup) hallGroup.visible = false;
  if (policeGroup) policeGroup.visible = false;
  if (coachGroup) coachGroup.visible = false;

  const total = state.totalScore | 0;
  const score = (opts.score === undefined) ? total : opts.score;
  const r = postExamRank();
  const lines = [];
  if (opts.outcome) lines.push(opts.outcome);
  lines.push('');
  lines.push('—— 成 绩 ——');
  for (const p of state.problems){
    lines.push(p.id + ' ' + p.name + '：' + (state.score[p.id] || 0) + ' / ' + p.max);
  }
  lines.push('');
  lines.push('用时 ' + fmtTime(state.elapsed) + ' · 被警告 ' + state.warnCount + ' 次' +
             (state.guardKills > 0 ? ' · 击倒保安 ' + state.guardKills + ' 名' : ''));
  if (r.all > 1){
    lines.push('名次：第 ' + r.rank + ' / ' + r.all + ' 名');
    lines.push('');
    lines.push('—— 榜 单 ——');
    lines.push(rivalBoardText(state.elapsed));
  }
  lines.push(postExamDinoLine());
  if (state.postExamManual) lines.push('\n（提前交卷）');

  $('endTitle').textContent = opts.title || '比 赛 结 束';
  $('endSub').textContent = (opts.sub || '评测机已停止运行。') +
    (r.all > 1 ? '　·　全场第 ' + r.rank + ' / ' + r.all + ' 名' : '');
  showEnding(score, lines.join('\n'));
  clearSave();
}

/* ---------------------------- ① 考后菜单 ---------------------------- */
function startPostExam(reason){
  state.ended = true;
  state.postExam = true;
  state.postExamReason = reason || 'normal';
  state.postDinoScore = 0;
  state.postDinoPlayed = false;
  postExamScore();
  hideAllPanels();
  postExamMenu();
}

function postExamMenu(){
  const assault = postExamAssault();
  const r = postExamRank();
  const body =
    '你走出 404。走廊里有人在讨论最后一题，声音越来越远。\n' +
    '校门口的风比四小时前凉。\n\n' +
    '【极速网咖】还开着。老板在门口抽烟，机位 3 空着。' +
    (assault ? '\n\n不过，校门口的监控刚才好像闪了一下 —— 教务处的人正在找你。' : '') +
    '\n\n' +
    '（本场得分会决定你回学校之后走进哪一间屋子；网吧的 dino.exe 也会记进结算。）';

  peRender({
    cls: assault ? 'pe-police' : 'pe-netbar',
    icon: assault ? '🚨' : '🎒',
    kicker: 'CSP-S 2026 · ' + (state.postExamManual ? '提前交卷' : '考试结束'),
    title: '考 试 结 束',
    sub: '全场第 ' + r.rank + ' / ' + r.all + ' 名　·　' +
         (state.postExamReason === 'canceled' ? '成绩已取消' : state.totalScore + ' / 400 分'),
    body: body,
    stats: postExamStats(),
    actions: [
      { label: '去网吧打一局 dino.exe（打完再回学校）', fn: postExamOpenDino },
      { label: assault ? '直接去派出所' : '直接回学校', fn: postExamAfterDino },
      { label: '原地站一会儿', fn: () => peRender({
          cls: assault ? 'pe-police' : 'pe-netbar',
          icon: '🌇',
          kicker: '校门口',
          title: '风 停 了',
          sub: '你站了一会儿。',
          body: '校门口的花坛边还留着不知谁丢的草稿纸。\n' +
                '你忽然想起来，四小时前你也是从这条街走进去的。\n\n' +
                '（去网吧，或者回学校。）',
          stats: postExamStats(),
          actions: [
            { label: '去网吧打 dino.exe', fn: postExamOpenDino },
            { label: assault ? '去派出所' : '回学校', fn: postExamAfterDino }
          ]
        }) }
    ]
  });
}

/* ---------------------------- ② 网吧 dino ---------------------------- */
function postExamOpenDino(){
  /* 已经在网吧里（比如打完一局选择“再打一局”）就直接重开；
     否则从考后菜单进入网吧的 3D 内部。 */
  if (state.postExamWorld && state.area === 'netbar'){
    dinoPostOpen();
    return;
  }
  enterNetbarPost();
}

/* launcher.js 的关闭按钮 / Esc / "打完回学校" 都会走到这里 */
function postDinoFinish(){
  if (!state.postDinoActive && state.view !== 'launcher') return;
  const score = dinoCurrentScore();
  const played = dinoDidPlay ? dinoDidPlay() : score > 0;
  state.postDinoScore = Math.max(0, score | 0);
  state.postDinoHigh = state.dinoHigh || 0;
  state.postDinoPlayed = !!played;
  dinoPostCloseUI();
  if (state.postDinoScore >= 1000) unlockAch('post_dino');
  postExamDinoResult();
}

function postExamDinoResult(){
  const assault = postExamAssault();
  const score = state.postDinoScore;
  const high = state.dinoHigh || 0;
  let flavor;
  if (score >= 1000) flavor = '网管把脑袋探过来看了一眼：「这成绩，留下来当网管吧。」';
  else if (score >= 300) flavor = '网管点了点头：「还行，比你的 T1 强。」';
  else if (score > 0) flavor = '你撞在第三根仙人掌上。网管说：「再来一局？」';
  else flavor = '你按了空格，然后撞在第一根仙人掌上。\n网管说：「……要不还是回去考试吧。」';

  peRender({
    cls: 'pe-netbar',
    icon: '🕹️',
    kicker: '极速网咖 · 机位 3',
    title: 'dino.exe',
    sub: '这一局 ' + score + ' 分　·　历史最高 ' + high + ' 分',
    body: flavor + '\n\n' + '网吧的钟已经指向考试结束之后。\n' +
          '你把耳机摘下来，听见外面有人在喊收卷。',
    stats: postExamStats(),
    actions: [
      { label: assault ? '去派出所' : '回学校', fn: postExamAfterDino },
      { label: '再打一局', fn: postExamOpenDino }
    ]
  });
}

/* 从网吧出来：派出所 / 学校场景（3D） */
function postExamAfterDino(){
  postExamEl.classList.add('hidden');
  if (postExamAssault()){
    state.postExamWorld = false;
    postExamPolice3D();
    return;
  }
  const tier = postExamTier();
  postExamSchool3D(tier === 'canceled' ? 'canceled' : tier);
}

/* ---------------------------- ③ 学校场景 ---------------------------- */
const POST_EXAM_SCENES = {
  honor: {
    cls: 'pe-honor', icon: '🏆', ach: 'post_honor',
    kicker: '第三教学楼 · 报告厅',
    title: '表 彰 大 会',
    sub: '校长在台上念到你的名字。',
    body: '台下坐着一整排人。你的名字和「CSP-S 2026」一起被投在幕布上。\n\n' +
          '「请这位同学说两句。」\n你手里的话筒比鼠标重多了。',
    finalTitle: '光 荣 榜',
    finalSub: '第三教学楼 · 报告厅',
    tasks: [
      { label: '「感谢我的键盘。」', outcome: '台下笑了。校长也笑了，把奖状递到你手里。' },
      { label: '「感谢那瓶没喝完的矿泉水。」', outcome: '班主任在台下扶额。你说完自己也想笑。' },
      { label: '「下次还来。」', outcome: '校长愣了半秒，然后鼓掌。只有你知道这不是客套。' }
    ]
  },
  good: {
    cls: 'pe-school', icon: '📋', ach: 'post_good',
    kicker: '第 114 中学 · 校门口',
    title: '光 荣 榜',
    sub: '红榜上，你的名字在第三行。',
    body: '校门口的红榜前围着几个人。\n' +
          '你看见自己的名字排在第三行，后面跟着一个不算难看的分数。\n' +
          '有人举着手机在拍照，你假装路过。',
    finalTitle: '榜 上 有 名',
    finalSub: '第 114 中学 · 校门口',
    tasks: [
      { label: '站到自己的名字旁边拍一张', outcome: '照片里你笑得很僵，但名字是真的。' },
      { label: '把名字描粗一点', outcome: '被教导主任从二楼看见了。他喊了你一声。' },
      { label: '假装没看见，走回教室', outcome: '你在拐角回头看了两次。' }
    ]
  },
  office: {
    cls: 'pe-office', icon: '📄', ach: 'post_office',
    kicker: '第 114 中学 · 班主任办公室',
    title: '办 公 室',
    sub: '这个分不低。',
    body: '班主任把成绩单推过来，先笑了一下：\n' +
          '「200 多，不低。」\n' +
          '「你差的不是脑子，是把会做的题做稳。」\n\n' +
          '窗外有人在打篮球。你原本准备好挨训，结果他给你倒了杯水。',
    finalTitle: '办 公 室',
    finalSub: '第 114 中学 · 班主任办公室',
    tasks: [
      { label: '「下次冲三百。」', outcome: '班主任把笔帽扣上：「这话我爱听。」' },
      { label: '「最后一题我再想想。」', outcome: '他点点头：「想明白比做出来重要。」' },
      { label: '「谢谢老师。」', outcome: '他摆摆手：「去吃饭吧，别饿着。」' }
    ]
  },
  coach: {
    cls: 'pe-office', icon: '📚', ach: 'post_coach',
    kicker: '第 114 中学 · 信息教练办公室',
    title: '信 息 教 练 办 公 室',
    sub: '你考了 200 分以下。',
    body: '信息教练把键盘往桌上一推：\n' +
          '「200 分以下，礼堂在楼上，你暂时上不去。」\n' +
          '「先在我这儿把话说明白：你是不会，还是不想？」\n\n' +
          '白板上还留着他去年写的「NOI 2026 冲省一」。',
    finalTitle: '办 公 室',
    finalSub: '第 114 中学 · 信息教练办公室',
    tasks: [
      { label: '「下次一定。」', outcome: '教练把保温杯放下：「这句话我今年听了 47 遍。」' },
      { label: '「题太难了。」', outcome: '他把去年的题单翻出来：第一题还是 A+B。' },
      { label: '沉默', outcome: '他叹了口气，把键盘推回你面前：「去把 A+B 再写一遍。」' }
    ]
  },
  makeup: {
    cls: 'pe-office', icon: '📝', ach: 'post_makeup',
    kicker: '第 114 中学 · 教务处',
    title: '补 考 报 名 处',
    sub: '白板上写着暑假补课安排。',
    body: '教务处门口排着队。你手里是一张补考报名表。\n\n' +
          '值班老师抬头：「签字。」\n' +
          '笔尖在纸上停了一下。',
    finalTitle: '补 考 通 知',
    finalSub: '第 114 中学 · 教务处',
    tasks: [
      { label: '签字', outcome: '你还是写了。字有点歪，但能认出来。' },
      { label: '装肚子疼', outcome: '老师看了你一眼：「上次你也是这么说的。」' },
      { label: '问能不能退报名费', outcome: '后面排队的人笑出了声。' }
    ]
  },
  zero: {
    cls: 'pe-zero', icon: '0️⃣', ach: 'post_zero',
    kicker: '第 114 中学 · 教研室',
    title: '零 分 传 奇',
    sub: '答题卡上只有一个名字。',
    body: '教研室的老师围在电脑前看你的提交记录。\n\n' +
          '「零分。」\n' +
          '「四个小时，一个字符都没提交。」\n\n' +
          '你站在门口，忽然觉得这个数字很圆。',
    finalTitle: '零 分 传 奇',
    finalSub: '第 114 中学 · 教研室',
    tasks: [
      { label: '要求查分', outcome: '老师把评测记录调出来，又看了一遍。还是零分。' },
      { label: '和班主任对视', outcome: '他先移开了视线。' },
      { label: '转身去网吧', outcome: '这个选项在你心里已经点过了。' }
    ]
  }
};

/* ---------------------------- ③ 学校场景（3D） ----------------------------
   回学校不是一张弹窗：校园还是那片校园，只是道具换了。
   表彰台 / 红榜 / 班主任办公室 / 补考报名桌 都是 primitive 现搭的；
   玩家被放到对应的位置，走到跟前按 E 才开始"任务"。
   ------------------------------------------------------------------------- */
let postSchoolBuilt = false;
const postSchoolGroups = {};
const postExamTaskTargets = [];
let postExamActiveTarget = null;
let postExamMarker = null;

function psBoard(text, w, h, x, y, z, size, color, bg, border){
  const c = cpTextBoard(512, 192, [
    { text: text, size: size || 52, color: color || '#fff4d0' }
  ], bg || '#241a10', border || '#c9a24a');
  return cpBoard(c, w, h, x, y, z, 0);
}

function ensurePostSchoolProps(){
  if (postSchoolBuilt) return;
  postSchoolBuilt = true;
  const bx = CP.x, bz = CP.z;

  const mkGroup = () => {
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);
    return g;
  };
  const addMarker = (g, x, y, z) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffdf8a, transparent: true, opacity: 0.8 }));
    m.position.set(x, y, z);
    m.rotation.x = Math.PI / 2;
    g.add(m);
    return m;
  };
  const addTarget = (g, tier, label, x, z, camX, camZ, yaw) => {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 2.0),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, 1.0, z);
    g.add(hit);
    postExamTaskTargets.push({ obj: hit, tier: tier, label: label,
                               camX: camX, camZ: camZ, yaw: yaw || 0, group: g });
  };

  /* ---- 表彰台（360+） ---- */
  {
    const g = mkGroup(); postSchoolGroups.honor = g;
    box(5.6, 0.30, 3.2, 0x5b4428, bx - 7.0, 0.15, bz - 1.0, g, { roughness: 0.8 });
    box(5.6, 0.06, 3.2, 0x8b6a3c, bx - 7.0, 0.33, bz - 1.0, g, { roughness: 0.6 });
    box(5.8, 2.5, 0.18, 0x2a1c12, bx - 7.0, 1.6, bz - 2.65, g, { roughness: 0.9 });
    const banner = psBoard('表 彰 大 会', 4.8, 1.0, bx - 7.0, 2.35, bz - 2.54,
                           52, '#ffe6a8', '#3a1a14', '#e0b25a');
    g.add(banner);
    box(0.9, 1.1, 0.65, 0x3a2a1c, bx - 5.7, 0.85, bz - 0.4, g);
    box(0.22, 0.55, 0.22, 0x6a4a2a, bx - 5.7, 1.55, bz - 0.4, g);
    box(5.6, 0.18, 0.6, 0x6b4a2a, bx - 7.0, 0.10, bz + 0.8, g);
    addTarget(g, 'honor', '走上台，说两句', bx - 7.0, bz - 0.9,
              bx - 7.0, bz + 4.6, 0);
    postSchoolGroups.honor.marker = addMarker(g, bx - 7.0, 2.9, bz - 2.0);
  }

  /* ---- 光荣榜（300–359） ---- */
  {
    const g = mkGroup(); postSchoolGroups.good = g;
    box(0.18, 2.9, 0.18, 0x3a2a1a, bx + 5.6, 1.45, bz - 1.1, g);
    box(0.18, 2.9, 0.18, 0x3a2a1a, bx + 8.4, 1.45, bz - 1.1, g);
    box(3.3, 2.2, 0.12, 0x2a1a16, bx + 7.0, 1.6, bz - 1.05, g);
    const board = psBoard('光 荣 榜', 3.0, 1.9, bx + 7.0, 1.6, bz - 0.98,
                          46, '#ffe8a8', '#3a1212', '#e0b25a');
    g.add(board);
    addTarget(g, 'good', '在红榜上找自己的名字', bx + 7.0, bz - 0.5,
              bx + 7.0, bz + 4.6, 0);
    postSchoolGroups.good.marker = addMarker(g, bx + 7.0, 2.95, bz - 0.9);
  }

  /* ---- 班主任办公室 / 教务处（200–299、0、取消） ---- */
  {
    const g = mkGroup(); postSchoolGroups.office = g;
    const sign = psBoard('班主任办公室', 2.6, 0.62, bx, 2.45, bz - 21.0,
                         30, '#e8eef8', '#141a24', '#3b6df0');
    g.add(sign);
    box(1.8, 0.06, 0.7, 0x6b5137, bx + 2.4, 0.74, bz - 19.4, g);
    box(0.06, 0.74, 0.06, 0x2b303b, bx + 1.7, 0.37, bz - 19.4, g);
    box(0.06, 0.74, 0.06, 0x2b303b, bx + 3.1, 0.37, bz - 19.4, g);
    addTarget(g, 'office', '推门进办公室', bx, bz - 20.2,
              bx, bz - 15.4, 0);
    postSchoolGroups.office.marker = addMarker(g, bx, 2.9, bz - 20.4);
  }

  /* ---- 补考报名桌（1–199） ---- */
  {
    const g = mkGroup(); postSchoolGroups.makeup = g;
    box(2.6, 0.08, 1.0, 0x6b5137, bx - 7.0, 0.78, bz + 0.6, g);
    box(0.08, 0.78, 0.08, 0x2b303b, bx - 8.0, 0.39, bz + 0.6, g);
    box(0.08, 0.78, 0.08, 0x2b303b, bx - 6.0, 0.39, bz + 0.6, g);
    const sign = psBoard('补 考 报 名', 2.2, 0.7, bx - 7.0, 1.7, bz + 0.15,
                         30, '#fff0c0', '#2a1a12', '#c9a24a');
    g.add(sign);
    addTarget(g, 'makeup', '在补考报名表上签字', bx - 7.0, bz + 0.4,
              bx - 7.0, bz + 5.4, 0);
    postSchoolGroups.makeup.marker = addMarker(g, bx - 7.0, 2.0, bz + 0.2);
  }

  /* 所有道具默认隐藏（普通校园里看不到这些考后东西） */
  for (const k in postSchoolGroups) postSchoolGroups[k].visible = false;
}

function postExamSchool3D(tier){
  if (tier === 'honor'){ enterHallHonor(); return; }
  if (tier === 'coach'){ enterCoachOffice(); return; }
  if (hallGroup) hallGroup.visible = false;
  if (policeGroup) policeGroup.visible = false;
  if (coachGroup) coachGroup.visible = false;
  ensurePostSchoolProps();
  const useTier = (tier === 'zero') ? 'office' : tier;
  const key = (tier === 'good') ? 'good'
            : (tier === 'honor') ? 'honor'
            : (tier === 'makeup') ? 'makeup'
            : 'office';

  for (const k in postSchoolGroups){
    postSchoolGroups[k].visible = (k === key);
  }
  const target = postExamTaskTargets.find(t => t.group === postSchoolGroups[key]);
  postExamActiveTarget = target || null;
  postExamMarker = postSchoolGroups[key] ? postSchoolGroups[key].marker : null;

  state.postExamWorld = true;
  state.postExamStage = 'school';
  state.postExamTier = tier;
  state.ended = true;
  state.view = 'world';
  state.frozen = false;
  switchArea('campus');

  if (target){
    state.pos.set(target.camX, PLAYER_EYE, target.camZ);
    state.yaw = target.yaw; yawTarget = target.yaw;
    state.pitch = 0; pitchTarget = 0;
  }
  requestLock();

  const title = (tier === 'canceled') ? '教 务 处'
              : (POST_EXAM_SCENES[tier] ? POST_EXAM_SCENES[tier].title : '学 校');
  toast('你回到学校。' + title + ' —— 走到跟前按 E。', 3000);
}

/* 考后学校场景里的交互：只认当前任务点，别的店铺/安检全关掉 */
function postExamCampusInteract(){
  if (!state.postExamWorld) return false;
  if (state.area !== 'campus' && state.area !== 'hall' &&
      state.area !== 'police' && state.area !== 'coach')
    return false;
  if (!postExamActiveTarget) return false;
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = 6.5;
  const hits = raycaster.intersectObjects([postExamActiveTarget.obj], false);
  if (!hits.length) return false;
  actionE = { fn: postExamTaskStart };
  setPrompt('[ E ] ' + postExamActiveTarget.label);
  promptEl.classList.remove('hidden');
  return true;
}

function postExamTaskStart(){
  if (!state.postExamWorld) return;
  if (state.area === 'police'){ postExamPoliceTaskStart(); return; }
  if (state.area !== 'campus' && state.area !== 'hall' && state.area !== 'coach') return;
  const tier = state.postExamTier;
  let sc;
  if (state.postExamReason === 'bus'){
    sc = BUS_SCENE;
  } else if (tier === 'canceled'){
    sc = {
      cls: 'pe-office', icon: '🚫', title: '成 绩 已 取 消',
      sub: '监考记录本摊在桌上。',
      finalTitle: '成 绩 已 取 消', finalSub: '第 114 中学 · 教务处',
      score: 0,
      tasks: [
        { label: '签字', outcome: '你签了。笔尖把纸划破了一点。' },
        { label: '解释那五次只是去接水', outcome: '老师把饮水机的位置指给你看。它就在你座位后面。' },
        { label: '沉默', outcome: '沉默也是一种回答。老师把笔递给你，又收了回去。' }
      ]
    };
  } else {
    sc = POST_EXAM_SCENES[tier] || POST_EXAM_SCENES.zero;
  }
  openDialog({
    title: sc.title,
    text: sc.body,
    options: sc.tasks.map(t => ({
      label: t.label,
      cb: d => {
        closeDialog(d);
        postExamTaskOutcome(sc, t);
      }
    }))
  });
}

function updatePostExamWorld(t){
  if (postExamMarker){
    const p = 0.7 + 0.3 * Math.sin(t * 3.0);
    postExamMarker.material.opacity = p;
    postExamMarker.rotation.z = t * 0.7;
  }
}

/* ---------------------------- ③a 礼堂（表彰大会专用地图） ---------------------------- */
let hallBuilt = false, hallGroup = null, hallTarget = null, hallMarker = null;
let hallSpotA = null, hallSpotB = null;

function ensureHallBuilt(){
  if (hallBuilt) return;
  hallBuilt = true;
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  hallGroup = g;

  const bx = HALL.x, bz = HALL.z;
  box(21, 0.10, 30, 0x241b14, bx, -0.05, bz, g, { roughness: 0.95 });
  box(21, 0.04, 30, 0x3a2a1e, bx, 0.005, bz, g, { roughness: 0.8 });
  /* 红地毯 + 两侧座椅 */
  box(2.4, 0.02, 26, 0x7a1f28, bx, 0.03, bz + 1, g);
  const wallMat = { roughness: 1 };
  box(0.2, 7, 30, 0x1a1410, bx - 10.5, 3.5, bz, g, wallMat);
  box(0.2, 7, 30, 0x1a1410, bx + 10.5, 3.5, bz, g, wallMat);
  box(21, 7, 0.2, 0x1a1410, bx, 3.5, bz - 15, g, wallMat);
  box(21, 7, 0.2, 0x1a1410, bx, 3.5, bz + 15, g, wallMat);
  box(21, 0.15, 30, 0x120e0a, bx, 7, bz, g, wallMat);

  /* 舞台 */
  box(13, 0.5, 4.6, 0x5b4428, bx, 0.25, bz - 11.8, g, { roughness: 0.8 });
  box(13, 0.06, 4.6, 0x8b6a3c, bx, 0.53, bz - 11.8, g, { roughness: 0.6 });
  box(13, 5.2, 0.25, 0x2a1c12, bx, 2.8, bz - 14.2, g, wallMat);
  const banner = cpTextBoard(1024, 320, [
    { text: '表 彰 大 会', size: 92, color: '#ffe6a8' },
    { text: 'CSP-S 2026 · 第 114 中学', size: 30, color: '#e0b25a' }
  ], '#3a1a14', '#e0b25a');
  const bm = cpBoard(banner, 10.0, 3.0, bx, 4.2, bz - 14.05, 0);
  g.add(bm);
  /* 讲台 */
  box(1.1, 1.1, 0.7, 0x3a2a1c, bx + 2.0, 1.05, bz - 10.9, g);
  box(0.24, 0.55, 0.24, 0x6a4a2a, bx + 2.0, 1.75, bz - 10.9, g);
  /* 台阶 */
  for (let i = 0; i < 3; i++){
    box(5.0, 0.16, 0.45, 0x6b4a2a, bx, 0.08 + i * 0.16, bz - 9.5 + i * 0.4, g);
  }

  /* 观众席：一排排长椅 + 几个同学 */
  for (let r = 0; r < 6; r++){
    const z = bz - 6.5 + r * 2.1;
    for (const side of [-1, 1]){
      box(7.0, 0.10, 0.7, 0x3a2a1e, bx + side * 4.3, 0.45, z, g, { roughness: 0.9 });
      box(7.0, 0.5, 0.12, 0x2a1c12, bx + side * 4.3, 0.22, z + 0.3, g);
    }
  }
  const shirts = [0x4a5a6a, 0x6a4a4a, 0x4a6a4a, 0x5a4a6a, 0x6a5a3a];
  for (let r = 0; r < 5; r++){
    const z = bz - 5.6 + r * 2.1;
    for (const side of [-1, 1]){
      for (let k = 0; k < 3; k++){
        const p = buildPerson(bx + side * (2.2 + k * 1.35), z + (k % 2) * 0.1,
                              shirts[(r + k) % shirts.length], Math.PI, 'stand');
        p.group.scale.set(0.92, 0.94, 0.92);
        p.armL.rotation.x = -0.35;
        p.armR.rotation.x = -0.35;
        g.add(p.group);
      }
    }
  }

  /* 舞台灯 */
  hallSpotA = new THREE.PointLight(0xffd89a, 1.5, 18, 2);
  hallSpotA.position.set(bx - 4, 6, bz - 8); scene.add(hallSpotA);
  hallSpotB = new THREE.PointLight(0xffb36b, 1.2, 16, 2);
  hallSpotB.position.set(bx + 4, 6, bz - 8); scene.add(hallSpotB);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 2.0),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(bx + 2.0, 1.1, bz - 10.7);
  g.add(hit);
  hallTarget = { obj: hit, tier: 'honor', label: '走上台，说两句',
                 camX: bx, camZ: bz - 4.6, yaw: 0, group: g };
  postExamTaskTargets.push(hallTarget);
  hallMarker = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.035, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffdf8a, transparent: true, opacity: 0.85 }));
  hallMarker.position.set(bx + 2.0, 2.6, bz - 10.4);
  hallMarker.rotation.x = Math.PI / 2;
  g.add(hallMarker);

  /* 讲台本体必须有碰撞：以前只有视觉，玩家能直接站进讲台里。
     舞台地面高度由 hallFloorHeight() 处理 —— 能走上去，但走不进讲台。 */
  hallColliders.push({ x: bx + 2.0, z: bz - 10.9, hw: 0.55, hd: 0.35 });
}

/* 礼堂舞台的可行走高度：舞台矩形内 +0.56m，其余为 0。
   只改相机高度，不改 state.pos —— 移动/碰撞仍在平面上，简单可靠。 */
function hallFloorHeight(x, z){
  if (Math.abs(x - HALL.x) <= 6.4 && Math.abs(z - (HALL.z - 11.8)) <= 2.2){
    return 0.56;
  }
  return 0;
}

function enterHallHonor(){
  ensureHallBuilt();
  if (postSchoolBuilt){
    for (const k in postSchoolGroups) postSchoolGroups[k].visible = false;
  }
  hallGroup.visible = true;
  if (policeGroup) policeGroup.visible = false;
  if (coachGroup) coachGroup.visible = false;
  postExamActiveTarget = hallTarget;
  postExamMarker = hallMarker;

  state.postExamWorld = true;
  state.postExamStage = 'school';
  state.postExamTier = 'honor';
  state.ended = true;
  state.view = 'world';
  state.frozen = false;
  switchArea('hall');
  state.pos.set(HALL.x + 2.0, PLAYER_EYE, HALL.z - 4.6);
  state.yaw = 0; yawTarget = 0;
  state.pitch = 0; pitchTarget = 0;
  requestLock();
  toast('礼堂里坐满了人。走上台，按 E 说两句。', 3400);
}

function updateHallArea(worldDt, t){
  if (hallSpotA) hallSpotA.intensity = 1.3 + Math.sin(t * 1.7) * 0.2;
  if (hallSpotB) hallSpotB.intensity = 1.1 + Math.sin(t * 1.3 + 1) * 0.18;
  updatePostExamWorld(t);
}

/* ---------------------------- ③b 派出所（专用地图） ---------------------------- */
let policeBuilt = false, policeGroup = null, policeTarget = null, policeMarker = null;
let policeLamp = null;

function ensurePoliceBuilt(){
  if (policeBuilt) return;
  policeBuilt = true;
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  policeGroup = g;

  const bx = POLICE.x, bz = POLICE.z;
  box(16, 0.10, 12, 0x1a2026, bx, -0.05, bz, g, { roughness: 0.95 });
  box(16, 0.04, 12, 0x2a333c, bx, 0.005, bz, g, { roughness: 0.7 });
  const wallMat = { roughness: 1 };
  box(0.2, 4.2, 12, 0x10161c, bx - 8, 2.1, bz, g, wallMat);
  box(0.2, 4.2, 12, 0x10161c, bx + 8, 2.1, bz, g, wallMat);
  box(16, 4.2, 0.2, 0x10161c, bx, 2.1, bz - 6, g, wallMat);
  box(16, 4.2, 0.2, 0x10161c, bx, 2.1, bz + 6, g, wallMat);
  box(16, 0.15, 12, 0x0a0f14, bx, 4.2, bz, g, wallMat);

  /* 询问桌 + 两把椅子 */
  box(3.2, 0.08, 1.2, 0x5a4a3a, bx, 0.76, bz - 1.2, g, { roughness: 0.8 });
  box(0.08, 0.76, 0.08, 0x2b303b, bx - 1.4, 0.38, bz - 1.2, g);
  box(0.08, 0.76, 0.08, 0x2b303b, bx + 1.4, 0.38, bz - 1.2, g);
  box(0.62, 0.10, 0.62, 0x2a303a, bx, 0.48, bz + 0.2, g);
  box(0.08, 0.46, 0.08, 0x151a22, bx, 0.24, bz + 0.2, g);
  /* 桌上的台灯/笔录 */
  box(0.16, 0.42, 0.16, 0x1a2028, bx - 1.0, 1.0, bz - 1.2, g);
  const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 12),
    mat(0xd8d2c0, { roughness: 0.8 }));
  lamp.position.set(bx - 1.0, 1.28, bz - 1.2);
  g.add(lamp);
  box(0.5, 0.015, 0.7, 0xe8e2d0, bx + 0.3, 0.81, bz - 1.2, g);

  /* 民警 */
  const cop = buildPerson(bx, bz - 2.7, 0x2a3a5a, 0, 'stand');
  cop.group.scale.set(1.02, 1.04, 1.02);
  cop.armL.rotation.x = -0.2; cop.armR.rotation.x = -0.2;
  g.add(cop.group);
  /* 单面镜 + 铁栅栏 */
  box(5.0, 2.4, 0.08, 0x1e2a38, bx - 4.2, 2.1, bz - 5.9, g);
  for (let i = 0; i < 7; i++){
    box(0.06, 3.0, 0.06, 0x4a5564, bx + 6.8, 1.5, bz - 4.2 + i * 0.55, g);
  }
  box(2.0, 3.0, 0.1, 0x0b1118, bx + 6.8, 1.5, bz - 2.0, g);
  /* 顶灯 */
  policeLamp = new THREE.PointLight(0xfff0d0, 1.6, 12, 2);
  policeLamp.position.set(bx, 3.6, bz - 1.0); scene.add(policeLamp);
  const blue = new THREE.PointLight(0x4a7aff, 0.8, 12, 2);
  blue.position.set(bx + 6, 3.2, bz + 3); scene.add(blue);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 1.4),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(bx, 1.0, bz - 1.2);
  g.add(hit);
  policeTarget = { obj: hit, tier: 'police', label: '坐下做笔录',
                   camX: bx, camZ: bz + 2.6, yaw: 0, group: g };
  postExamTaskTargets.push(policeTarget);
  policeMarker = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0x9fc6ff, transparent: true, opacity: 0.8 }));
  policeMarker.position.set(bx, 1.65, bz - 1.2);
  policeMarker.rotation.x = Math.PI / 2;
  g.add(policeMarker);
}

function postExamPolice3D(){
  ensurePoliceBuilt();
  if (postSchoolBuilt){
    for (const k in postSchoolGroups) postSchoolGroups[k].visible = false;
  }
  if (hallGroup) hallGroup.visible = false;
  if (coachGroup) coachGroup.visible = false;
  policeGroup.visible = true;
  postExamActiveTarget = policeTarget;
  postExamMarker = policeMarker;

  state.postExamWorld = true;
  state.postExamStage = 'police';
  state.postExamTier = 'police';
  state.ended = true;
  state.view = 'world';
  state.frozen = false;
  switchArea('police');
  state.pos.set(POLICE.x, PLAYER_EYE, POLICE.z + 2.6);
  state.yaw = 0; yawTarget = 0;
  state.pitch = -0.04; pitchTarget = -0.04;
  requestLock();
  unlockAch('post_police');
  toast('派出所询问室。坐下之前，先想清楚怎么说。', 3400);
}

function updatePoliceArea(worldDt, t){
  if (policeLamp) policeLamp.intensity = 1.5 + Math.sin(t * 2.3) * 0.08;
  updatePostExamWorld(t);
}

/* 坐 K114 跑路：不直接结算，先被信息教练叫进办公室训一顿，再回家 */
const BUS_SCENE = {
  cls: 'pe-office', icon: '🚌', ach: 'giveup',
  kicker: '第 114 中学 · 信息教练办公室',
  title: '信 息 教 练 办 公 室',
  sub: '你连考场都没进，就上了 K114。',
  body: '信息教练把一张 K114 车票拍在桌上：\n' +
        '「你去哪儿？」\n' +
        '「报名费我给你垫的，你说不考就不考了？」\n\n' +
        '窗外正好有一辆 K114 开过去。',
  finalTitle: '回 家',
  finalSub: 'K114 路来了。你上了车，没有回头。',
  score: 0,
  tasks: [
    { label: '「我肚子疼。」', outcome: '教练看了你一眼：「你上车的时候可不疼。」' },
    { label: '「明年再来。」', outcome: '他把车票折起来：「这句话我替你记着。」' },
    { label: '沉默', outcome: '沉默。窗外的 K114 开走了，又一辆开过来。' }
  ]
};


let coachBuilt = false, coachGroup = null, coachTarget = null, coachMarker = null;
let coachLamp = null;

function ensureCoachBuilt(){
  if (coachBuilt) return;
  coachBuilt = true;
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  coachGroup = g;

  const bx = COACH.x, bz = COACH.z;
  box(14, 0.10, 12, 0x2a2018, bx, -0.05, bz, g, { roughness: 0.95 });
  box(14, 0.04, 12, 0x3c2c20, bx, 0.005, bz, g, { roughness: 0.8 });
  const wallMat = { roughness: 1 };
  box(0.2, 4.0, 12, 0x1a1410, bx - 7, 2.0, bz, g, wallMat);
  box(0.2, 4.0, 12, 0x1a1410, bx + 7, 2.0, bz, g, wallMat);
  box(14, 4.0, 0.2, 0x1a1410, bx, 2.0, bz - 6, g, wallMat);
  box(14, 4.0, 0.2, 0x1a1410, bx, 2.0, bz + 6, g, wallMat);
  box(14, 0.15, 12, 0x120e0a, bx, 4.0, bz, g, wallMat);

  /* 办公桌 + 教练 */
  box(3.6, 0.08, 1.4, 0x5a4a3a, bx, 0.76, bz - 1.4, g, { roughness: 0.8 });
  box(0.08, 0.76, 0.08, 0x2b303b, bx - 1.6, 0.38, bz - 1.4, g);
  box(0.08, 0.76, 0.08, 0x2b303b, bx + 1.6, 0.38, bz - 1.4, g);
  const coach = buildPerson(bx, bz - 3.0, 0x3a4a6a, 0, 'stand');
  coach.group.scale.set(1.04, 1.04, 1.04);
  coach.armL.rotation.x = -0.45; coach.armR.rotation.x = -0.25;
  g.add(coach.group);
  /* 白板：去年写的冲省一 */
  box(5.0, 2.2, 0.08, 0xe8e4d8, bx - 0.6, 2.2, bz - 5.9, g);
  const wb = cpTextBoard(900, 400, [
    { text: 'NOI 2026 冲省一', size: 54, color: '#2a3a5a' },
    { text: 'A+B 先写对', size: 34, color: '#7a3a3a' },
    { text: '—— 信息教练', size: 24, color: '#555' }
  ], '#f0ece0', '#8a7a5a');
  const wbm = cpBoard(wb, 4.6, 2.0, bx - 0.6, 2.2, bz - 5.84, 0);
  g.add(wbm);
  /* 书架 / 奖杯 */
  box(1.4, 2.6, 0.5, 0x3a2a1e, bx + 5.8, 1.3, bz - 5.6, g);
  box(0.45, 0.55, 0.45, 0xffd166, bx + 5.4, 1.6, bz - 5.3, g);
  /* 灯 */
  coachLamp = new THREE.PointLight(0xffe0b0, 1.4, 12, 2);
  coachLamp.position.set(bx, 3.4, bz - 1.0); scene.add(coachLamp);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 1.2),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(bx, 1.0, bz - 1.4);
  g.add(hit);
  coachTarget = { obj: hit, tier: 'coach', label: '听信息教练训话',
                  camX: bx, camZ: bz + 2.6, yaw: 0, group: g };
  postExamTaskTargets.push(coachTarget);
  coachMarker = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.8 }));
  coachMarker.position.set(bx, 1.7, bz - 1.4);
  coachMarker.rotation.x = Math.PI / 2;
  g.add(coachMarker);
}

function enterCoachOffice(){
  ensureCoachBuilt();
  if (postSchoolBuilt){
    for (const k in postSchoolGroups) postSchoolGroups[k].visible = false;
  }
  if (hallGroup) hallGroup.visible = false;
  if (policeGroup) policeGroup.visible = false;
  coachGroup.visible = true;
  postExamActiveTarget = coachTarget;
  postExamMarker = coachMarker;

  state.postExamWorld = true;
  state.postExamStage = 'school';
  state.postExamTier = 'coach';
  state.ended = true;
  state.view = 'world';
  state.frozen = false;
  switchArea('coach');
  state.pos.set(COACH.x, PLAYER_EYE, COACH.z + 2.6);
  state.yaw = 0; yawTarget = 0;
  state.pitch = 0; pitchTarget = 0;
  requestLock();
  toast('信息教练办公室。白板上还留着「NOI 2026 冲省一」。', 3400);
}

function updateCoachArea(worldDt, t){
  if (coachLamp) coachLamp.intensity = 1.35 + Math.sin(t * 1.9) * 0.08;
  updatePostExamWorld(t);
}

/* 公交站「上车」：先去办公室，再出「回家」结局 */
function beginGoingHome(){
  dismissDialogs();
  state.busExit = true;
  state.ended = true;
  state.view = 'world';
  state.totalScore = 0;
  state.postExam = true;
  state.postExamReason = 'bus';
  hideAllPanels();
  clearGuards();
  enterCoachOffice();
  toast('你刚上车，信息教练的电话就打到了下一站。', 2800);
}

function postExamSchool(tier){
  const sc = POST_EXAM_SCENES[tier] || POST_EXAM_SCENES.zero;
  if (sc.ach) unlockAch(sc.ach);
  peRender({
    cls: sc.cls, icon: sc.icon, kicker: sc.kicker,
    title: sc.title, sub: sc.sub,
    body: sc.body + postExamDinoLine(),
    stats: postExamStats(),
    actions: sc.tasks.map(t => ({
      label: t.label,
      fn: () => postExamTaskOutcome(sc, t)
    }))
  });
}

function postExamTaskOutcome(sc, task){
  if (state.postExamReason === 'bus'){
    postExamEl.classList.add('hidden');
    state.postExamWorld = false;
    if (coachGroup) coachGroup.visible = false;
    endByGoingHome(task.outcome);
    return;
  }
  peRender({
    cls: sc.cls, icon: sc.icon, kicker: sc.kicker,
    title: sc.title, sub: sc.sub,
    body: task.outcome + postExamDinoLine(),
    stats: postExamStats(),
    actions: [{ label: '看结算', fn: () => postExamFinal({
      title: sc.finalTitle, sub: sc.finalSub,
      outcome: task.outcome,
      score: (sc.score === undefined ? state.totalScore : sc.score)
    }) }]
  });
}

/* 五次走动：教务处，成绩取消 */
function postExamCanceled(){
  const sc = {
    cls: 'pe-office', icon: '🚫',
    kicker: '第 114 中学 · 教务处',
    title: '成 绩 已 取 消',
    sub: '监考记录本摊在桌上。',
    body: '五次随意走动，记录得清清楚楚。\n\n' +
          '教务处老师把记录本合上：\n「签个字吧。这场不算了。」\n\n' +
          '窗外有人在笑，也可能只是风吹过走廊。',
    finalTitle: '成 绩 已 取 消',
    finalSub: '第 114 中学 · 教务处',
    tasks: [
      { label: '签字', outcome: '你签了。笔尖把纸划破了一点。' },
      { label: '解释那五次只是去接水', outcome: '老师把饮水机的位置指给你看。它就在你座位后面。' },
      { label: '沉默', outcome: '沉默也是一种回答。老师把笔递给你，又收了回去。' }
    ]
  };
  peRender({
    cls: sc.cls, icon: sc.icon, kicker: sc.kicker, title: sc.title, sub: sc.sub,
    body: sc.body + postExamDinoLine(),
    stats: postExamStats(),
    actions: sc.tasks.map(t => ({
      label: t.label,
      fn: () => postExamFinal({
        title: sc.finalTitle, sub: sc.finalSub,
        outcome: t.outcome, score: 0
      })
    }))
  });
}

/* ---------------------------- ④ 派出所 ---------------------------- */
function postExamPoliceTaskStart(){
  const evidence = [];
  if (state.teacherDown) evidence.push('考场监控：你把监考老师放倒了');
  if (state.guardKills > 0) evidence.push('保安记录：击倒 ' + state.guardKills + ' 名保安');
  if (state.brawlDone) evidence.push('校门口监控：志愿者二人组和门卫老赵');
  if (!evidence.length) evidence.push('匿名举报：校门口有人打架');

  const sc = {
    cls: 'pe-police', icon: '🚓',
    kicker: '第 114 中学 · 辖区派出所',
    title: '询 问 室',
    sub: '涉嫌殴打他人',
    finalTitle: '治 安 处 罚',
    finalSub: '第 114 中学 · 辖区派出所',
    score: 0,
    tasks: [
      { label: '如实交代', outcome: '民警把笔放下：「态度还行。」\n治安拘留 5 天，本场成绩作废。' },
      { label: '拒不承认', outcome: '监控画面放了三遍。\n第三遍的时候，你改口了。' },
      { label: '把责任推给门卫老赵', outcome: '隔壁传来老赵的声音：\n「他先动的手。」\n你沉默了。' }
    ]
  };

  openDialog({
    title: sc.title,
    text: '民警把一叠截图推过来：\n' + evidence.join('\n') +
          '\n\n「说说吧，从哪一拳开始的？」',
    options: sc.tasks.map(t => ({
      label: t.label,
      cb: d => {
        closeDialog(d);
        postExamTaskOutcome(sc, t);
      }
    }))
  });
}

function postExamPolice(){
  unlockAch('post_police');
  const evidence = [];
  if (state.teacherDown) evidence.push('考场监控：你把监考老师放倒了');
  if (state.guardKills > 0) evidence.push('保安记录：击倒 ' + state.guardKills + ' 名保安');
  if (state.brawlDone) evidence.push('校门口监控：志愿者二人组和门卫老赵');
  if (!evidence.length) evidence.push('匿名举报：校门口有人打架');

  const body =
    '派出所询问室。桌上的台灯很亮。\n' +
    '你面前的纸杯里是凉掉的茶。\n\n' +
    '民警把一叠截图推过来：\n' + evidence.join('\n') + '\n\n' +
    '「说说吧，从哪一拳开始的？」';

  const tasks = [
    { label: '如实交代', outcome: '民警把笔放下：「态度还行。」\n治安拘留 5 天，本场成绩作废。' },
    { label: '拒不承认', outcome: '监控画面放了三遍。\n第三遍的时候，你改口了。' },
    { label: '把责任推给门卫老赵', outcome: '隔壁传来老赵的声音：\n「他先动的手。」\n你沉默了。' }
  ];

  peRender({
    cls: 'pe-police', icon: '🚓',
    kicker: '第 114 中学 · 辖区派出所',
    title: '询 问 室',
    sub: '涉嫌殴打他人',
    body: body,
    stats: postExamStats(),
    actions: tasks.map(t => ({
      label: t.label,
      fn: () => postExamTaskOutcome({
        cls: 'pe-police', icon: '🚓',
        kicker: '第 114 中学 · 辖区派出所',
        title: '询 问 室',
        sub: '笔录',
        finalTitle: '治 安 处 罚',
        finalSub: '第 114 中学 · 辖区派出所',
        score: 0
      }, t)
    }))
  });
}
