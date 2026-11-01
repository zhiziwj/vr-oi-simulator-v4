'use strict';
/* =========================================================================
   ending —— 结算与结局分支
   ---------------------------------------------------------------------
   结局分支全在这里：
     · 正常交卷 / 时间到     → endContest()
     · 五次走动被取消成绩    → endContest() 里的 wanderPenalty 分支
     · 打老师被保安抓走      → guards.js 的 endByGuards()
     · 代码里写屏蔽词        → npc.js 的 endByBannedWord()
     · 打满 200 名保安走白光 → guards.js 的 endByTotalVictory()
     · 坐公交回家            → endByGoingHome()（校门外公交站，street.js 调用）
     · 在通报里放下拳头      → endBySurrender()（guards.js 调用）
     · 校门口打架打赢/打输   → endByBrawlLegend / endByBrawlLost（brawl.js 调用）
     · 脱校服进网吧打游戏    → endByNetbar()（street.js 调用）
   ========================================================================= */

function showEnding(score, detailHtml){
  state.ended = true;
  state.view = 'ending';
  state.frozen = false;
  state.postExam = false;
  state.postExamWorld = false;
  actionE = null; actionF = null; actionSpace = null;

  releaseLock();
  hideAllPanels();
  if (typeof dinoStop === 'function') dinoStop();
  if (typeof brawlHideBar === 'function') brawlHideBar();
  if (typeof gpHideBar === 'function') gpHideBar();
  ['postExam', 'luoguUI', 'desktopUI', 'phoneUI', 'npcComputerUI',
   'paperUI', 'bagUI', 'pauseMenu', 'codeUI', 'ending'].forEach(id => {
     const e = $(id);
     if (e && id !== 'ending') e.classList.add('hidden');
   });
  endingUI.classList.remove('hidden');

  /* 实际用时 = 虚拟用时 / 时间流速（作弊的流速不算在"你花了多久"里） */
  const elapsedSec = state.elapsed / Math.max(1, timeScale);
  $('endStats').innerHTML =
    '<div class="stat"><div class="sv">' + fmtTime(elapsedSec) + '</div><div class="sl">实际用时</div></div>' +
    '<div class="stat"><div class="sv">' + state.warnCount + '</div><div class="sl">警告次数</div></div>' +
    '<div class="stat"><div class="sv">' + state.guardKills + '</div><div class="sl">击倒保安</div></div>';

  const achList = $('endAch');
  if (state.achievements.size){
    achList.innerHTML = Array.from(state.achievements)
      .map(id => ACHIEVEMENTS[id] ? '<span class="ach-chip">' + ACHIEVEMENTS[id].name + '</span>' : '')
      .join('');
  } else {
    achList.innerHTML = '';
  }

  $('endScore').textContent = score;
  $('endDetail').innerHTML = (detailHtml || '').replace(/\n/g, '<br>');
  endingUI.classList.remove('hidden');
}

function endContest(manual){
  if (state.ended) return;

  /* ---- 分支零：没在封场前入场 → 缺考 ----
     必须排在"正常交卷"前面：否则一个 30 分钟的迟到者会既拿 0 分、
     又白捡「神速交卷」（elapsed/ timeScale 只有 120 秒）。 */
  if (state.missedEntry){
    state.ended = true;
    state.view = 'world';
    hideAllPanels();
    clearGuards();
    unlockAch('late');

    $('endTitle').textContent = '缺 考';
    $('endSub').textContent = '考场已封闭，本场没有你的成绩。';
    showEnding(0,
      '你在楼外耗掉了开考后的前 ' + Math.round(state.elapsed / 60) + ' 分钟。\n' +
      '警戒线拉上的时候，里面已经在发卷了。\n\n' +
      '下一场记得早点到 —— 校门开着不代表考场一直开着。');
    clearSave();
    return;
  }

  /* ---- 分支一：本场曾离开座位 5 次 → 取消成绩 ----
     不直接结算：先走考后流程（网吧 / 教务处场景），最后再落到结算页。 */
  if (state.wanderPenaltyApplied){
    state.ended = true;
    state.view = 'world';
    hideAllPanels();
    clearGuards();
    unlockAch('wanderer');
    const total0 = state.problems.reduce((s, p) => s + (state.score[p.id] || 0), 0);
    state.totalScore = total0;
    clearSave();
    startPostExam('canceled');
    return;
  }

  /* ---- 分支二：正常交卷 ---- */
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();

  let total = 0;
  state.problems.forEach(p => { total += state.score[p.id] || 0; });
  state.totalScore = total;

  if (total === 0) unlockAch('zero_king');
  if (state.warnCount === 0) unlockAch('clean_run');
  if (state.elapsed / Math.max(1, timeScale) <= 3600) unlockAch('speedrun');

  /* 名次：交完卷之后唯一还能让人在意一秒的数字。
     对手的分是他们按时交出来的，不是随机数 —— 见 rivals.js。 */
  const myRank = playerRank(state.elapsed);
  const all = rivalCount();
  if (all > 1){
    if (myRank === 1) unlockAch('champion');
    else if (myRank === all) unlockAch('last_place');
  }

  state.postExamManual = !!manual;
  clearSave();
  startPostExam(manual ? 'manual' : 'normal');
}

/* ---------------------------- 回家（弃考） ----------------------------
   校门外公交站那条支线的出口。它不是"失败"——是玩家主动选的另一条路，
   所以标题不写"缺考"（那是迟到），写"回家"。 */
function endByGoingHome(extra){
  if (state.ended && !state.postExam) return;
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();
  unlockAch('giveup');

  const leftMin = Math.max(0, Math.round((CONTEST_LEN - state.elapsed) / 60));
  audio.beep(220, 0.25, 0.05, 'sine');
  setTimeout(() => audio.beep(180, 0.4, 0.04, 'sine'), 180);

  $('endTitle').textContent = '回 家';
  $('endSub').textContent = 'K114 路来了。你上了车，没有回头。';
  showEnding(0,
    (extra ? extra + '\n\n' : '') +
    '你上了 K114 路。车开动的时候，第 114 中学的校门从车窗里退了过去。\n\n' +
    '报名费退不了，但今天的太阳很好。\n' +
    '班主任下周会在群里点名，你会说是肚子疼。\n\n' +
    '—— 离比赛结束还有 ' + leftMin + ' 分钟。\n' +
    '—— 明年再来。');
  clearSave();
}

/* ---------------------------- 配合（投降） ----------------------------
   和"被保安抓走"不同：这一次是你自己放下拳头的。
   结局一样是成绩作废，但至少不是被两百个人按在地上。 */
function endBySurrender(){
  if (state.ended) return;
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();
  unlockAch('surrender');

  audio.beep(320, 0.18, 0.05, 'triangle');
  setTimeout(() => audio.beep(240, 0.30, 0.04, 'triangle'), 160);

  $('endTitle').textContent = '配 合';
  $('endSub').textContent = '你放下了拳头。保安把对讲机别回腰上。';
  showEnding(0,
    '你把拳头放下，后退半步。\n' +
    '保安愣了一下，随后把对讲机别回腰上，冲同事摆了摆手。\n\n' +
    '「早这样不就好了。」\n\n' +
    '监考老师被扶去了医务室，考场的门在你身后关上。\n' +
    '成绩作废，记一次警告 —— 但没有第二百个人冲进来。\n\n' +
    '有些架，打赢了也是输。');
  clearSave();
}

/* ---------------------------- 校门口的传说（打赢后留下来） ----------------------------
   打赢老赵之后选"送他去医务室"——你没有去考试，而是留在原地等该来的人来。
   这不是失败，是另一条路：你赢了这场架，但输了这场考试。 */
function endByBrawlLegend(){
  if (state.ended) return;
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();
  unlockAch('brawl_legend');

  audio.beep(220, 0.30, 0.05, 'sine');
  setTimeout(() => audio.beep(160, 0.60, 0.05, 'sine'), 220);

  $('endTitle').textContent = '校 门 口 的 传 说';
  $('endSub').textContent = '你没有走进考场。你留在原地，等该来的人来。';
  showEnding(0,
    '老赵被你搀到门卫室的椅子上，摆摆手说不用去医院。\n' +
    '志愿者两个人还躺在校门口的花坛边。\n\n' +
    '后来来了一辆车，下来几个穿制服的人。\n' +
    '他们问是谁先动的手。\n' +
    '你说：「我。」\n\n' +
    '你没有考成 CSP-S 2026。\n' +
    '但第 114 中学门口那条街，从此多了一个传说：\n' +
    '有个考生，开考前把校门口的志愿者和门卫全放倒了。\n\n' +
    '—— 传说不需要分数。');
  clearSave();
}

/* ---------------------------- 校门口躺平（斗殴打输） ----------------------------
   3 格血打空。志愿者和门卫没有报警，他们把你抬去了医务室。 */
function endByBrawlLost(){
  if (state.ended) return;
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();
  unlockAch('brawl_lost');

  audio.beep(120, 0.45, 0.08, 'sawtooth');
  setTimeout(() => audio.beep(80, 0.70, 0.06, 'sawtooth'), 180);

  $('endTitle').textContent = '被 抬 进 医 务 室';
  $('endSub').textContent = '三个人把你按在校门口的花坛边。';
  showEnding(0,
    '你最后一个看到的东西，是老赵那只搪瓷杯。\n\n' +
    '志愿者两个人一左一右把你架起来，老赵在后面拎着你的准考证。\n' +
    '「小小年纪，下手这么重。」\n\n' +
    '医务室的床很硬，窗外的广播还在报入场倒计时。\n' +
    '你听着听着就睡着了。\n\n' +
    '—— 这场考试，你连考场都没进。');
  clearSave();
}

/* ---------------------------- 老赵的爷爷：考场毁灭 ----------------------------
   草稿纸矩阵召唤失败。爷爷拆了整间教室；老赵冲进来救场，但考试已经没了，
   所有人的成绩一起作废。 */
function endByGrandpaDestruction(){
  if (state.ended) return;
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();
  gpHideBar();
  unlockAch('grandpa_lose');

  audio.beep(90, 0.7, 0.09, 'sawtooth');
  setTimeout(() => audio.beep(60, 1.0, 0.07, 'sawtooth'), 260);

  $('endTitle').textContent = '考 场 毁 灭';
  $('endSub').textContent = '老赵和爷爷过了几招，但这一场考试已经没有了。';
  showEnding(0,
    '老赵的爷爷把法杖往地上一顿。\n' +
    '一整排桌子、显示器、黑板、窗玻璃，全都离开了原来的位置。\n' +
    '你在漫天的草稿纸里看见自己的名字，又看着它被风吹走。\n\n' +
    '老赵从门口冲进来，一拳砸在爷爷的法杖上：\n' +
    '「爷爷！这是考场！不是咱家祖坟！」\n' +
    '爷爷横扫一杖，老赵矮身躲过，欺身又是一拳；\n' +
    '两个人从讲台打到窗边，最后老赵一把抱住他爷爷的腰。\n\n' +
    '爷爷愣了一下，收起法杖，像什么都没发生一样走了。\n' +
    '监考老师从讲台底下爬出来，扶了扶眼镜：\n' +
    '「本场考试——所有人成绩作废。」\n\n' +
    '—— 老赵后来替你垫了补考报名费。');
  clearSave();
}

/* ---------------------------- 网吧包夜（脱校服打游戏） ----------------------------
   校服脱了、网管放你进去了、机也开了。结局不需要再找理由：
   等你从屏幕前抬起头，考试已经过去了。 */
function endByNetbar(mode){
  if (state.ended) return;
  state.ended = true;
  state.view = 'world';
  hideAllPanels();
  clearGuards();
  unlockAch('netbar_end');

  audio.beep(180, 0.30, 0.05, 'sine');
  setTimeout(() => audio.beep(120, 0.60, 0.05, 'sine'), 220);

  $('endTitle').textContent = '包 夜';
  $('endSub').textContent = '校服塞在书包最底下，准考证在裤兜里揉成了一团。';
  showEnding(0,
    (mode === 'allnight'
      ? '你开了台机，戴上耳机，把校服往书包底下一塞。\n'
      : '你说只玩一局。\n一局之后还有一局。\n等你抬头，窗外已经黑了。\n') +
    '\n第 114 中学的 CSP-S 2026 考场上，你的座位一直空着。\n' +
    '广播报入场倒计时的时候，你在打最后一局；\n' +
    '收卷铃响的时候，你在等匹配。\n\n' +
    '后来班主任问你那天去哪了。\n' +
    '你说：「网吧。」\n' +
    '他说：「你倒是诚实。」');
  clearSave();
}
