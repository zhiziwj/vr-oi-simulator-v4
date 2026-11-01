'use strict';
/* =========================================================================
   save —— 进度存档
   ---------------------------------------------------------------------
   存的是"这场考试的哪个切片"：四道题的 id、每题代码、每题得分、当前题、
   已用时间、警告次数、已解锁成就、背包、安检/手机状态、武器耐久，
   以及校门外那条街的账（钱、纸质准考证、茶叶蛋、搬过水、问出侧门）。
   读档时必须按 id 还原本局的四道题 —— 否则玩家上次抽到的题和这次不一样，
   存档里的代码就对不上了。
   ========================================================================= */

const SAVE_KEY = 'oi_room_save_v1';
let autoSaveTimer = null;

function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(persistSave, 1200);
}

function persistSave(){
  if (!state.started || state.ended) return;
  try {
    const blob = {
      code: state.code,
      score: state.score,
      curProb: state.curProb,
      elapsed: state.elapsed,
      warnCount: state.warnCount,
      achievements: Array.from(state.achievements),
      problems: state.problems.map(p => p.id),
      bag: bagSnapshot(),
      /* 武器耐久也要跟档走：不存的话读一次档就能把抡断的扫把修好 */
      weaponWear: state.weaponWear,
      /* 安检与手机：这两个以前没存，于是读档之后会出现"过了安检但手机又回来了"，
         或者"从侧门进来的却记得自己过了安检"这种谁也说不清的状态。
         enteredRoom 故意不存：读档后区域还在校园，存成 true 会让人卡在
         "进不去楼也没法重新安检"的死角里。 */
      passedSecurity: state.passedSecurity,
      hasPhone: state.hasPhone,
      sneakedIn: state.sneakedIn,
      /* 校门外那条街的进度：钱、纸质准考证、茶叶蛋、帮过的忙、门卫的情报。
         不存的话，读档之后会出现"准考证打过了但安检又不认"或者"钱又满了"
         这种对不上账的状态。 */
      money: state.money,
      paperTicket: state.paperTicket,
      rpSticker: state.rpSticker,
      eggShield: state.eggShield,
      helpedVolunteer: state.helpedVolunteer,
      knowsSideDoor: state.knowsSideDoor,
      prayed: state.prayed,
      netbarTried: state.netbarTried,
      uniformOff: state.uniformOff,
      rpCharm: state.rpCharm,
      hpMax: state.hpMax,
      /* 对手排名：被干扰后的延迟，以及在同学电脑上改过的代码 */
      npcDelay: state.npcDelay,
      npcEdit: state.npcEdit,
      savedAt: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch(e){}
}

function tryLoadSave(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return false;

    /* 题目集合必须完整还原，否则放弃整份存档（宁可重开也不给错题） */
    if (Array.isArray(o.problems) && o.problems.length === PROBLEM_COUNT){
      const restored = o.problems.map(id => PROBLEM_BY_ID.get(id)).filter(Boolean);
      if (restored.length !== PROBLEM_COUNT) return false;
      state.problems = restored;
      state.curProb = restored[0].id;
      updateAllDeskScreens();
    }

    if (o.code) state.code = o.code;
    if (o.score) state.score = o.score;
    if (o.curProb) state.curProb = o.curProb;
    if (typeof o.elapsed === 'number') state.elapsed = clamp(o.elapsed, 0, CONTEST_LEN);
    if (typeof o.warnCount === 'number') state.warnCount = o.warnCount;
    if (Array.isArray(o.achievements)) state.achievements = new Set(o.achievements);
    /* 背包是"少一瓶就真少一瓶"的资源，必须跟档走；
       老存档没有 bag 字段时保持 initBag() 给的开局配发，不当成空包。 */
    if (o.bag) bagRestore(o.bag);
    if (o.weaponWear && typeof o.weaponWear === 'object'){
      state.weaponWear = {};
      for (const id in o.weaponWear){
        if (ITEMS[id] && ITEMS[id].melee && typeof o.weaponWear[id] === 'number')
          state.weaponWear[id] = o.weaponWear[id];
      }
    }
    /* 老存档没有这几个字段 —— 只在真正存过时才覆盖，
       否则读一份旧档就会把手机状态冲成 undefined（表现为"手机凭空没了"）。 */
    if (typeof o.passedSecurity === 'boolean') state.passedSecurity = o.passedSecurity;
    if (typeof o.hasPhone === 'boolean') state.hasPhone = o.hasPhone;
    if (typeof o.sneakedIn === 'boolean') state.sneakedIn = o.sneakedIn;
    /* 街道支线的进度。老存档没有这些字段 —— 保持开局默认值，别冲成 undefined。 */
    if (typeof o.money === 'number') state.money = clamp(o.money | 0, 0, 999);
    if (typeof o.paperTicket === 'boolean') state.paperTicket = o.paperTicket;
    if (typeof o.rpSticker === 'boolean') state.rpSticker = o.rpSticker;
    if (typeof o.eggShield === 'number') state.eggShield = clamp(o.eggShield | 0, 0, 2);
    if (typeof o.helpedVolunteer === 'boolean') state.helpedVolunteer = o.helpedVolunteer;
    if (typeof o.knowsSideDoor === 'boolean') state.knowsSideDoor = o.knowsSideDoor;
    if (typeof o.prayed === 'boolean') state.prayed = o.prayed;
    if (typeof o.netbarTried === 'boolean') state.netbarTried = o.netbarTried;
    if (typeof o.uniformOff === 'boolean') state.uniformOff = o.uniformOff;
    if (typeof o.rpCharm === 'boolean') state.rpCharm = o.rpCharm;
    if (typeof o.hpMax === 'number') state.hpMax = clamp(o.hpMax | 0, HP_MAX, FIVE_HEARTS_MAX);
    /* 同学成绩曲线：干扰延迟 + 被改过的代码。老存档没有就保持空。 */
    if (o.npcDelay && typeof o.npcDelay === 'object'){
      state.npcDelay = {};
      for (const name in o.npcDelay){
        if (typeof o.npcDelay[name] === 'number') state.npcDelay[name] = o.npcDelay[name];
      }
    }
    if (o.npcEdit && typeof o.npcEdit === 'object'){
      state.npcEdit = {};
      for (const name in o.npcEdit){
        const e = o.npcEdit[name];
        if (e && typeof e.code === 'string' &&
            typeof e.score === 'number' && typeof e.slot === 'number'){
          state.npcEdit[name] = {
            code: e.code, score: clamp(e.score | 0, 0, 100),
            slot: clamp(e.slot | 0, 0, Math.max(0, PROBLEM_COUNT - 1))
          };
        }
      }
    }
    /* 背包和 hasPhone 是同一件事的两份记录：老存档的 bag 里没有手机，
       而 hasPhone 又是默认的 true —— 不对齐就会出现"背包里没有却能用"。 */
    reconcilePhone();

    recalcScore();
    lastHudProbsKey = '';        /* 强制 HUD 题目区重画 */
    renderHudProbs();
    return true;
  } catch(e){ return false; }
}

function clearSave(){
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
}

function hasSave(){
  try { return !!localStorage.getItem(SAVE_KEY); } catch(e){ return false; }
}
