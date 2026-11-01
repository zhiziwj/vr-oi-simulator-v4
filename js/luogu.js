'use strict';
/* =========================================================================
   luogu —— 网吧 3 号机上的「洛谷刷题」本地版
   ---------------------------------------------------------------------
   不是把真洛谷嵌进来（离线、零依赖），而是复刻那个感觉：
     · 左边是题单，三题（A+B / 过河卒 / 采药）
     · 右边是题面、代码框、提交评测
     · 评测仍走 judge.js 的启发式，但成绩只记在 state.luoguSolved 里，
       不影响本场 CSP 分数
   它从网吧电脑的菜单进入；关闭后回到网吧 3D 里。
   ========================================================================= */

const LUOGU_PROBLEMS = [
  {
    id: 'P1001', name: 'A+B Problem', diff: '入门',
    checks: [/cin\s*>>|scanf\s*\(/, /cout\s*<<|printf\s*\(/, /\+/, /return\s+0/],
    statement:
      '题目描述\n输入两个整数 a, b，输出它们的和。\n\n' +
      '输入格式\n一行两个整数 a, b（-10^9 ≤ a, b ≤ 10^9）。\n\n' +
      '输出格式\n一个整数，表示 a + b。\n\n' +
      '输入输出样例\n1 2\n→ 3',
    template:
      '#include <iostream>\nusing namespace std;\n\nint main(){\n' +
      '    long long a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n' +
      '    return 0;\n}\n'
  },
  {
    id: 'P1002', name: '过河卒', diff: '普及-',
    checks: [/long\s+long/, /for\s*\(/, /dp\s*\[|f\s*\[/, /return\s+0/],
    statement:
      '题目描述\n棋盘上有一个卒，从 (0,0) 走到 (n,m)，只能向右或向下。\n' +
      '棋盘上有一个马，马所在点和马能一步走到的点都不能经过。\n' +
      '求从 (0,0) 到 (n,m) 的路径数。\n\n' +
      '输入格式\n一行四个整数 n, m, hx, hy。\n\n' +
      '输出格式\n一个整数，表示路径数。\n\n' +
      '提示\n开 long long；边界要特判。',
    template:
      '#include <iostream>\nusing namespace std;\n\n' +
      'long long dp[25][25];\nbool bad[25][25];\n\nint main(){\n' +
      '    int n, m, hx, hy;\n    cin >> n >> m >> hx >> hy;\n' +
      '    // TODO: 标记马的控制点，然后递推 dp[i][j] = dp[i-1][j] + dp[i][j-1]\n' +
      '    dp[0][0] = 1;\n    for (int i = 0; i <= n; i++)\n' +
      '        for (int j = 0; j <= m; j++){\n' +
      '            if (bad[i][j]) continue;\n' +
      '            if (i) dp[i][j] += dp[i-1][j];\n' +
      '            if (j) dp[i][j] += dp[i][j-1];\n' +
      '        }\n    cout << dp[n][m] << endl;\n    return 0;\n}\n'
  },
  {
    id: 'P1048', name: '采药', diff: '普及/提高-',
    checks: [/for\s*\(/, /max\s*\(|if\s*\(/, /f\s*\[|dp\s*\[/, /return\s+0/],
    statement:
      '题目描述\n山洞里有 M 株草药，采每一株需要一些时间，每株有自己的价值。\n' +
      '你总共有 T 的时间，求能获得的最大价值。\n\n' +
      '输入格式\n第一行两个整数 T, M。\n接下来 M 行，每行两个整数 time, value。\n\n' +
      '输出格式\n一个整数，表示最大价值。\n\n' +
      '提示\n0/1 背包：倒序枚举时间。',
    template:
      '#include <iostream>\nusing namespace std;\n\n' +
      'int f[1005];\n\nint main(){\n    int T, M;\n    cin >> T >> M;\n' +
      '    for (int i = 0; i < M; i++){\n        int t, v;\n        cin >> t >> v;\n' +
      '        for (int j = T; j >= t; j--)\n            f[j] = max(f[j], f[j-t] + v);\n' +
      '    }\n    cout << f[T] << endl;\n    return 0;\n}\n'
  }
];

const luoguUI = $('luoguUI');
const lgList = $('lgList');
const lgTitle = $('lgTitle');
const lgDiff = $('lgDiff');
const lgStatement = $('lgStatement');
const lgCode = $('lgCode');
const lgResult = $('lgResult');

let lgCurrent = 0;

function openLuogu(){
  dismissDialogs();
  state.view = 'luogu';
  releaseLock();
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  luoguUI.classList.remove('hidden');
  renderLuoguList();
  lgSelect(lgCurrent || 0);
  audio.beep(520, 0.06, 0.03, 'square');
}

function closeLuogu(){
  if (state.view !== 'luogu') return;
  lgSaveCode();
  luoguUI.classList.add('hidden');
  state.view = 'world';
  crosshair.classList.remove('hidden');
  requestLock();
  toast('你退出洛谷，回到网吧的机位前。', 1600);
}

function renderLuoguList(){
  if (!lgList) return;
  lgList.innerHTML = '';
  LUOGU_PROBLEMS.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'lgitem' + (i === lgCurrent ? ' on' : '');
    const id = document.createElement('span');
    id.className = 'lgid';
    id.textContent = p.id;
    row.appendChild(id);
    const nm = document.createElement('span');
    nm.textContent = p.name;
    row.appendChild(nm);
    if (state.luoguSolved[p.id]){
      const ac = document.createElement('span');
      ac.className = 'lgac';
      ac.textContent = 'AC';
      row.appendChild(ac);
    }
    row.onclick = () => lgSelect(i);
    lgList.appendChild(row);
  });
}

function lgSaveCode(){
  const p = LUOGU_PROBLEMS[lgCurrent];
  if (p && lgCode) state.luoguCode[p.id] = String(lgCode.value || '');
}

function lgSelect(i){
  lgSaveCode();
  lgCurrent = i;
  const p = LUOGU_PROBLEMS[i];
  if (!p) return;
  if (lgTitle) lgTitle.textContent = p.name;
  if (lgDiff) lgDiff.textContent = p.diff;
  if (lgStatement) lgStatement.textContent = p.statement;
  if (lgCode) lgCode.value = state.luoguCode[p.id] != null
    ? state.luoguCode[p.id] : p.template;
  if (lgResult) lgResult.textContent = state.luoguSolved[p.id]
    ? '这道题你已经 AC 过了。可以再写一遍。' : '';
  renderLuoguList();
}

function lgReset(){
  const p = LUOGU_PROBLEMS[lgCurrent];
  if (!p || !lgCode) return;
  lgCode.value = p.template;
  state.luoguCode[p.id] = p.template;
  if (lgResult) lgResult.textContent = '模板已重置。';
}

function lgSubmit(){
  const p = LUOGU_PROBLEMS[lgCurrent];
  if (!p || !lgCode) return;
  const code = String(lgCode.value || '');
  state.luoguCode[p.id] = code;
  if (!code.trim()){
    if (lgResult) lgResult.textContent = '代码是空的。';
    return;
  }
  const res = luoguJudge(p, code);
  const ok = res.status === 'AC';
  if (ok){
    state.luoguSolved[p.id] = true;
    unlockAch('luogu_ac');
    audio.beep(880, 0.15, 0.05, 'sine');
    setTimeout(() => audio.beep(1180, 0.20, 0.04, 'sine'), 140);
  } else {
    audio.beep(180, 0.18, 0.05, 'square');
  }
  if (lgResult){
    const cases = res.cases.map(c => c.status).join(' ');
    lgResult.textContent =
      (ok ? '✔ AC · ' : '✘ ' + res.status + ' · ') + res.score + ' / 100\n' +
      '测试点：' + cases + '\n' +
      (ok ? '已记进洛谷题单（不影响本场 CSP 分数）。' : '再改改，或者重置模板。');
  }
  renderLuoguList();
  toast(ok ? '洛谷：AC！' : '洛谷：' + res.status + '（' + res.score + ' 分）', 1600);
}

/* 洛谷题单的本地小评测：按题目的"关键结构"给分，不套用 CSP 的关键词表。
   这样 A+B 这种题写对了就是 AC，而不是被判成 PART。 */
function luoguJudge(p, code){
  if (!/int\s+main\s*\(/.test(code)){
    return { status: 'CE', score: 0, passed: 0,
             cases: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, status: 'CE' })) };
  }
  const checks = p.checks || [];
  let hit = 0;
  for (const re of checks) if (re.test(code)) hit++;
  const ratio = checks.length ? hit / checks.length : 0;
  const passed = Math.round(ratio * 10);
  const score = passed * 10;
  const status = passed === 10 ? 'AC' : (passed > 0 ? 'PART' : 'WA');
  const cases = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1, status: i < passed ? 'AC' : (i === passed ? 'WA' : 'WA')
  }));
  return { status: status, score: score, passed: passed, cases: cases };
}
