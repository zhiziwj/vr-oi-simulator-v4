'use strict';
/* =========================================================================
   feedback —— 字幕堆叠与成就解锁
   ========================================================================= */

const TOAST_MAX = 4;
const activeToasts = new Map();      /* text → { el, num, count, timer } */
let toastClock = 0;

/* 同内容的提示不重复起幕，只在尾部累计 x2 / x3 并刷新存活时间；
   超过 TOAST_MAX 条时立刻收起最早的一条，避免糊满半个屏幕。 */
function toast(text, ms){
  const dur = ms || 2000;

  /* 记下最后一条，只给调试/测试用（不参与游戏逻辑）。
     挂在 toastStack 元素上而不是新增全局变量：多一个模块级 let
     就多一份跨文件暂时性死区的风险，而这里只需要"能读到"。 */
  try { toastStack.dataset.last = text; } catch(e){}

  const hit = activeToasts.get(text);
  if (hit){
    hit.count++;
    hit.num.textContent = 'x' + hit.count;
    clearTimeout(hit.timer);
    hit.timer = setTimeout(() => hideToast(text), dur);
    hit.el.classList.remove('bump');
    void hit.el.offsetWidth;             /* 强制重排以重启动画 */
    hit.el.classList.add('bump');
    return;
  }

  const el = document.createElement('div');
  el.className = 'toast';
  const body = document.createElement('span');
  body.textContent = text;
  const num = document.createElement('i');
  num.className = 'n';
  el.appendChild(body);
  el.appendChild(num);
  toastStack.appendChild(el);

  const rec = { el: el, num: num, count: 1, timer: 0 };
  rec.timer = setTimeout(() => hideToast(text), dur);
  activeToasts.set(text, rec);
  toastClock++;

  while (activeToasts.size > TOAST_MAX){
    hideToast(activeToasts.keys().next().value);
  }
}

function hideToast(text){
  const rec = activeToasts.get(text);
  if (!rec) return;
  activeToasts.delete(text);
  clearTimeout(rec.timer);
  rec.el.classList.add('out');
  setTimeout(() => rec.el.remove(), 320);
}

function clearToasts(){
  for (const k of Array.from(activeToasts.keys())) hideToast(k);
  /* 调试记录也要一起清。不清就会留上一条文本，
     而"最后一条提示"正是测试用来判断有没有误报的依据 ——
     残留会让后续断言拿到过期值、把"没提示"误判成"提示了"。 */
  try { delete toastStack.dataset.last; } catch(e){}
}

/* ---------------------------- 成就 ---------------------------- */
const ACHIEVEMENTS = {
  first_ac:    { name: '初次 AC',   desc: '拿到第一道题的 Accepted' },
  full_score:  { name: '满分大神',  desc: '四道题全部 AC' },
  submitter:   { name: '一个都不落', desc: '四道题每道都至少提交过一次' },
  guard_5:     { name: '格斗入门',  desc: '击倒 5 名保安' },
  guard10:     { name: '初露拳脚',  desc: '击倒 10 名保安' },
  guard20:     { name: '考场一害',  desc: '击倒 20 名保安' },
  guard50:     { name: '保安克星',  desc: '击倒 50 名保安' },
  guard100:    { name: '百人斩',    desc: '击倒 100 名保安' },
  army:        { name: '一人军队',  desc: '击倒全部 200 名保安（隐藏结局）' },
  clean_run:   { name: '安分守己',  desc: '零警告完赛' },
  zero_king:   { name: '零分传奇',  desc: '交卷时 0 分' },
  trouble:     { name: '校园霸王',  desc: '干扰 3 名选手' },
  speedrun:    { name: '神速交卷',  desc: '1 小时内交卷' },
  banned:      { name: '失言者',    desc: '因屏蔽词被取消成绩' },
  teacher_hit: { name: '袭师者',    desc: '殴打了监考老师' },
  explorer:    { name: '厕所旅行家', desc: '完整去过一次洗手间' },
  wanderer:    { name: '红圈五连',  desc: '同一场考试五次随意走动' },

  /* ---- 校园段（从校门口走到考场） ---- */
  portal:      { name: '走个捷径',   desc: '第一次使用校门口的传送光圈' },
  security:    { name: '正规入场',   desc: '老老实实从正门进来，再过安检通道' },
  sideentry:   { name: '不正规入场', desc: '没走安检 —— 从员工通道进的楼' },
  rush:        { name: '压线进场',   desc: '赶在封场前 3 分钟内进的考场' },
  late:        { name: '迟到',       desc: '开考 30 分钟后才晃到门口 —— 本场缺考' },
  phone:       { name: '夹带',       desc: '把没封存的手机带进了考场，还掏出来看了' },
  phone_caught:{ name: '人赃并获',   desc: '在考场里看手机，被监考逮个正着' },
  phone2048:   { name: '2048',       desc: '在考场里用手机合出了 2048 —— 你今天是来干嘛的' },
  classroom:   { name: '404 找到了', desc: '进入 404 教室' },
  dino:        { name: '摸鱼选手',   desc: '在小恐龙里刷出个人最高分' },
  runaway:     { name: '跑路了兄弟', desc: '从校门口一路跑过马路 —— 出发之后记得回来' },
  champion:    { name: '榜一',       desc: '交卷时排在全场第一' },
  last_place:  { name: '垫底王',     desc: '交卷时排在全场最后' },

  /* ---- 校门外的马路（street.js） ---- */
  paperticket: { name: '有备而来',   desc: '在文印店打了一张纸质准考证' },
  paper_entry: { name: '纸质的',     desc: '用纸质准考证过安检 —— 手机没被封存' },
  face:        { name: '刷脸',       desc: '没钱也把准考证印出来了（老板认得你妈）' },
  rp:          { name: 'RP++',      desc: '在准考证背面贴了一张 RP++ 贴纸' },
  shop:        { name: '会过日子',   desc: '在小卖部买过东西' },
  breakfast:   { name: '早饭要吃',   desc: '在校门口吃了顿早饭 —— 考试也是体力活' },
  helper:      { name: '好人好事',   desc: '帮校门口的志愿者搬了一箱水' },
  crosswalk:   { name: '红灯停绿灯行', desc: '等绿灯亮起，从斑马线过了一次马路' },
  jaywalk:     { name: '鬼探头',     desc: '红灯时横穿马路 —— 被司机骂了一句' },
  oldhand:     { name: '老江湖',     desc: '从门卫嘴里问出了员工通道' },
  pray:        { name: '临时抱佛脚', desc: '在文曲星像前拜了三下' },
  netbar:      { name: '网瘾少年',   desc: '开考前想进网吧 —— 被网管赶了出来' },
  giveup:      { name: '明年再来',   desc: '坐上 K114 路回家，放弃了这一场' },
  surrender:   { name: '识时务',     desc: '在保安的通报里放下了拳头 —— 至少没被打两百次' },

  /* ---- 校门口的斗殴（brawl.js） ---- */
  brawl_first: { name: '动手了',     desc: '在校门口先一拳打倒了同学' },
  brawl_armed: { name: '抄家伙',     desc: '开打之前抄起了校门口的扫把' },
  brawl:       { name: '武德充沛',   desc: '放倒志愿者二人组，又放倒了门卫老赵' },
  brawl_lost:  { name: '校门口躺平', desc: '被志愿者和门卫老赵抬进了医务室' },
  brawl_legend:{ name: '校门口的传说', desc: '打赢之后没去考试，留下来等警察' },

  /* ---- 同学电脑 / 网吧 ---- */
  npc_edit:    { name: '代笔',       desc: '趁同学去告状，改了他电脑上的代码并交了卷' },
  netbar_end:  { name: '包夜',       desc: '脱了校服进网吧，把考试打没了' },
  uniform_off: { name: '便装',       desc: '在校门口把校服脱了' },

  /* ---- 考后流程（postexam.js） ---- */
  post_honor:  { name: '表彰大会',   desc: '考后走上报告厅的台，说了两句' },
  post_good:   { name: '榜上有名',   desc: '在校门口的红榜上看见了自己的名字' },
  post_office: { name: '办公室常客', desc: '考后被班主任叫进办公室，但是被鼓励了' },
  post_makeup: { name: '补考通知',   desc: '在教务处签了补考报名表' },
  post_coach:  { name: '办公室训话', desc: '100 分以下，被信息教练叫进办公室' },
  post_zero:   { name: '零分的仪式', desc: '在教研室围观了自己的零分提交记录' },
  post_police: { name: '喝茶',       desc: '因涉嫌殴打他人，考后进了派出所' },
  post_dino:   { name: '网吧战神',   desc: '考后在网吧的 dino.exe 上刷出四位数的分' },

  /* ---- 草稿纸矩阵 ---- */
  grandpa_win:  { name: '矩阵召唤师', desc: '画矩阵召出老赵的爷爷，还打赢了；四题自动 AC' },
  grandpa_lose: { name: '爷爷饶命',   desc: '召唤失败，考场被老赵的爷爷拆了' },
  luogu_ac:     { name: '洛谷 AC',    desc: '在网吧 3 号机的洛谷题单上 AC 了一道题' },
  five_hearts:  { name: '五颗心',     desc: '在早餐摊吃了一顿，血量上限变成五颗心' },
  rp_charm:     { name: 'rp++',       desc: '在街边老大爷那儿买了 rp++ 钥匙扣' },
  rp_oneshot:   { name: '一击必杀',   desc: '装备 rp++ 钥匙扣，一拳秒了老赵的爷爷' }
};

function unlockAch(id){
  if (state.achievements.has(id)) return;
  state.achievements.add(id);
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  clearTimeout(achTimer);
  achNotify.innerHTML =
    '<div class="at">成就解锁</div><div class="an">' + a.name + '</div>' +
    '<div style="font-size:11.5px;opacity:.85;margin-top:4px">' + a.desc + '</div>';
  achNotify.classList.add('show');
  achTimer = setTimeout(() => achNotify.classList.remove('show'), 3200);
  audio.beep(880, 0.12, 0.05);
  setTimeout(() => audio.beep(1174, 0.15, 0.04), 110);
}
