'use strict';
/* =========================================================================
   paper —— 草稿纸手写板
   ---------------------------------------------------------------------
   画布尺寸跟随容器像素尺寸（含 DPR 无关），关纸时把内容转存到一张离屏
   canvas 里，下次打开先回贴再继续写 —— 否则一关一开，推导就没了。
   ========================================================================= */

let paperCtx = null, paperDrawing = false, paperLastPt = null, paperBackup = null;
/* 每一笔的点集：用来识别"纸的下半部分画了矩阵" —— 只是画着好看，
   真正触发召唤的是下面 paperCheckMatrix() 的几何判定。 */
let paperStrokes = [], paperStroke = null;

function openPaper(){
  if (state.ended || state.frozen || state.grandpaActive) return;
  state.view = 'paper';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  releaseLock();
  paperUI.classList.remove('hidden');

  requestAnimationFrame(() => {
    const c = paperCanvas;
    const rect = c.getBoundingClientRect();
    const nw = Math.max(1, Math.floor(rect.width));
    const nh = Math.max(1, Math.floor(rect.height));
    c.width = nw; c.height = nh;
    paperCtx = c.getContext('2d');
    if (paperBackup) paperCtx.drawImage(paperBackup, 0, 0, nw, nh);
    else paintPaperBackground();
    paperCtx.lineCap = 'round';
    paperCtx.lineJoin = 'round';
  });
}

function paintPaperBackground(){
  const c = paperCanvas;
  paperCtx.fillStyle = '#f5f2ea';
  paperCtx.fillRect(0, 0, c.width, c.height);

  paperCtx.strokeStyle = '#e8dfcc';
  paperCtx.lineWidth = 1;
  for (let y = 40; y < c.height; y += 34){
    paperCtx.beginPath(); paperCtx.moveTo(0, y); paperCtx.lineTo(c.width, y); paperCtx.stroke();
  }
  /* 左侧红边线，像真的作业本 */
  paperCtx.strokeStyle = '#e0a0a0';
  paperCtx.beginPath(); paperCtx.moveTo(70, 0); paperCtx.lineTo(70, c.height); paperCtx.stroke();
}

function closePaper(){
  const c = paperCanvas;
  paperBackup = document.createElement('canvas');
  paperBackup.width = c.width;
  paperBackup.height = c.height;
  paperBackup.getContext('2d').drawImage(c, 0, 0);
  paperUI.classList.add('hidden');
  state.view = 'world';
  crosshair.classList.remove('hidden');
  requestLock();
}

/* 纸的下半部分画出一个"矩阵"：至少两条横向 + 两条纵向的笔画。
   判定用笔画的包围盒，不认具体字形 —— 斜着画、连笔、画成歪的格子都行，
   只要看起来像一张网。画成之后关纸、召唤。 */
function paperCheckMatrix(){
  if (!paperCtx || state.area !== 'room' || state.ended) return;
  if (state.grandpaActive || state.grandpaWon || state.grandpaDestroyed) return;
  if (state.teacherDown || securityGuards.length > 0) return;

  const c = paperCanvas;
  const h = c.height;
  if (!h) return;
  const bottom = paperStrokes.filter(s => s.some(p => p.y > h * 0.62));
  if (bottom.length < 4) return;

  let horiz = 0, vert = 0;
  for (const s of bottom){
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const p of s){
      if (p.x < minx) minx = p.x;
      if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y;
      if (p.y > maxy) maxy = p.y;
    }
    const sw = maxx - minx, sh = maxy - miny;
    if (sw > 24 && sw > sh * 1.8) horiz++;
    else if (sh > 24 && sh > sw * 1.8) vert++;
  }
  if (horiz < 2 || vert < 2) return;

  paperStrokes = [];
  paperStroke = null;
  closePaper();
  toast('纸面底下有什么东西动了一下。', 1800);
  audio.beep(90, 0.5, 0.06, 'sawtooth');
  setTimeout(() => { grandpaStart(); }, 150);
}

function initPaperEvents(){
  const c = paperCanvas;

  const getPos = e => {
    const r = c.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (cx - r.left) * (c.width / r.width),
      y: (cy - r.top) * (c.height / r.height)
    };
  };

  const down = e => {
    if (!paperCtx) return;
    e.preventDefault();
    paperDrawing = true;
    paperLastPt = getPos(e);
    paperStroke = [paperLastPt];
    paperStrokes.push(paperStroke);
    if (paperStrokes.length > 80) paperStrokes.shift();
    paperCtx.strokeStyle = '#1b2330';
    paperCtx.lineWidth = 2.2;
    paperCtx.beginPath();
    paperCtx.arc(paperLastPt.x, paperLastPt.y, 1.1, 0, TAU);
    paperCtx.fillStyle = '#1b2330';
    paperCtx.fill();
    audio.beep(320 + Math.random() * 120, 0.02, 0.015);
  };

  const move = e => {
    if (!paperDrawing || !paperCtx) return;
    e.preventDefault();
    const p = getPos(e);
    if (paperStroke) paperStroke.push(p);
    paperCtx.beginPath();
    paperCtx.moveTo(paperLastPt.x, paperLastPt.y);
    paperCtx.lineTo(p.x, p.y);
    paperCtx.stroke();
    paperLastPt = p;
  };

  const up = () => {
    paperDrawing = false;
    paperStroke = null;
    paperCheckMatrix();
  };

  c.addEventListener('mousedown', down);
  c.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  c.addEventListener('touchstart', down, { passive: false });
  c.addEventListener('touchmove', move, { passive: false });
  c.addEventListener('touchend', up);

  $('btnClearPaper').onclick = () => {
    paintPaperBackground();
    paperBackup = null;
    paperStrokes = []; paperStroke = null;
  };
  $('btnClosePaper').onclick = closePaper;
}
