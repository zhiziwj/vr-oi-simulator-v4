'use strict';
/* =========================================================================
   mobile —— 触屏支持
   ---------------------------------------------------------------------
   · 左摇杆：WASD 移动
   · 右侧拖屏：转视角（不申请 Pointer Lock）
   · 右下按钮：攻击/交互、跳、F、道具、背包、手机、暂停
   · 地址栏 ?touch=1 可在桌面强制预览触控层；?touch=0 关闭
   不改变桌面端任何输入路径：没有 .touch-mode 时这个文件只设置一个标志。
   ========================================================================= */
(() => {
  let params = null;
  try { params = new URLSearchParams((location && location.search) || ''); } catch(e){}
  const force = params ? params.get('touch') : null;
  const coarse = (window.matchMedia &&
                  window.matchMedia('(pointer: coarse)').matches) ||
                 (typeof navigator !== 'undefined' &&
                  (navigator.maxTouchPoints | 0) > 0);
  const TOUCH = force === '1' ? true : force === '0' ? false : !!coarse;

  state.touchMode = TOUCH;
  if (!TOUCH) return;

  document.body.classList.add('touch-mode');

  const ui = document.getElementById('touchUI');
  const stick = document.getElementById('touchStick');
  const knob = document.getElementById('touchKnob');
  const canvas = document.getElementById('scene');
  const hint = document.getElementById('touchHint');
  if (!ui || !stick || !knob || !canvas) return;

  const LOOK_SENS = 0.0042;
  const STICK_DEAD = 0.20;

  /* ---------------- 显示 / 隐藏 ---------------- */
  let stickActive = false;
  let lookId = null, lookX = 0, lookY = 0;
  const stickKeys = { w: false, a: false, s: false, d: false };

  function gameplayUI(){
    return state.started && state.view === 'world' &&
           (!state.ended || state.postExamWorld) && !state.frozen &&
           !hasDialog();
  }

  function releaseStick(){
    stickActive = false;
    knob.style.transform = 'translate(0,0)';
    for (const k in stickKeys){
      if (stickKeys[k]) state.keys[k] = false;
      stickKeys[k] = false;
    }
  }

  function syncUI(){
    const show = gameplayUI();
    ui.classList.toggle('hidden', !show);
    ui.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show){
      releaseStick();
      lookId = null;
    }
  }
  setInterval(syncUI, 180);
  syncUI();

  /* ---------------- 左摇杆 ---------------- */
  function setStickFromEvent(e){
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = r.width * 0.34;
    const d = Math.hypot(dx, dy);
    if (d > max){ dx = dx / d * max; dy = dy / d * max; }
    knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';

    const nx = dx / max, ny = dy / max;
    const dead = Math.abs(nx) < STICK_DEAD && Math.abs(ny) < STICK_DEAD;
    const next = {
      w: !dead && ny < -STICK_DEAD,
      s: !dead && ny > STICK_DEAD,
      a: !dead && nx < -STICK_DEAD,
      d: !dead && nx > STICK_DEAD
    };
    for (const k in next){
      if (next[k] !== stickKeys[k]){
        stickKeys[k] = next[k];
        state.keys[k] = next[k];
      }
    }
  }

  stick.addEventListener('pointerdown', e => {
    if (!gameplayUI()) return;
    e.preventDefault();
    stickActive = true;
    try { stick.setPointerCapture(e.pointerId); } catch(err){}
    setStickFromEvent(e);
  });
  stick.addEventListener('pointermove', e => {
    if (!stickActive) return;
    e.preventDefault();
    setStickFromEvent(e);
  });
  const endStick = () => { if (stickActive) releaseStick(); };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  stick.addEventListener('lostpointercapture', endStick);

  /* ---------------- 右侧拖屏转视角 ---------------- */
  function canLook(){
    return state.started && state.view === 'world' &&
           (!state.ended || state.postExamWorld) &&
           !state.frozen && !hasDialog() && LOOK_VIEWS.has(state.view);
  }

  function findTouch(list, id){
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }

  canvas.addEventListener('touchstart', e => {
    if (!canLook()) return;
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    lookId = t.identifier;
    lookX = t.clientX; lookY = t.clientY;
    if (hint) hint.style.opacity = '0';
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (lookId === null || !canLook()) return;
    const t = findTouch(e.changedTouches, lookId);
    if (!t) return;
    const dx = t.clientX - lookX;
    const dy = t.clientY - lookY;
    lookX = t.clientX; lookY = t.clientY;
    yawTarget -= dx * LOOK_SENS;
    pitchTarget = clamp(pitchTarget - dy * LOOK_SENS, -1.35, 1.35);
    e.preventDefault();
  }, { passive: false });

  const endLook = e => {
    if (lookId === null) return;
    if (findTouch(e.changedTouches, lookId) || e.type === 'touchcancel'){
      lookId = null;
    }
  };
  canvas.addEventListener('touchend', endLook);
  canvas.addEventListener('touchcancel', endLook);

  /* ---------------- 按钮 ---------------- */
  function tap(id, fn){
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!state.started) return;
      fn();
    });
  }

  tap('touchAttack', () => {
    if (state.view !== 'world') return;
    if (hasDialog()) activateDialogButton();
    else doInteract(actionSpace ? 'space' : 'e');
  });
  tap('touchF', () => { if (!hasDialog()) doInteract('f'); });
  tap('touchJump', () => { if (!hasDialog()) tryJump(); });
  tap('touchQ', () => { if (!hasDialog()) useSelectedItem(); });
  tap('touchBag', () => { if (!hasDialog() && state.view === 'world') openBag(); });
  tap('touchPhone', () => { if (!hasDialog() && state.view === 'world') togglePhone(); });
  tap('touchPause', () => {
    if (state.view === 'pause') closePauseMenu();
    else if (state.view === 'world') openPauseMenu();
  });

  /* ---------------- 弹窗：手机上用 DOM 选项，不靠准星悬停 ---------------- */
  const dialogUI = document.createElement('div');
  dialogUI.id = 'touchDialog';
  dialogUI.className = 'touchDialog hidden';
  document.body.appendChild(dialogUI);
  let dialogKey = '';

  function syncDialog(){
    const dlg = (typeof dialogs !== 'undefined' && dialogs.length)
      ? dialogs[dialogs.length - 1] : null;
    if (!dlg || !state.started || state.view !== 'world'){
      dialogUI.classList.add('hidden');
      dialogKey = '';
      return;
    }
    const key = dlg.id + ':' + dlg.options.length + ':' + dlg.title;
    if (key === dialogKey){
      dialogUI.classList.remove('hidden');
      return;
    }
    dialogKey = key;
    dialogUI.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'td-box';
    const title = document.createElement('div');
    title.className = 'td-title';
    title.textContent = dlg.title || '提示';
    box.appendChild(title);
    if (dlg.text){
      const text = document.createElement('div');
      text.className = 'td-text';
      text.textContent = dlg.text;
      box.appendChild(text);
    }
    const opts = document.createElement('div');
    opts.className = 'td-opts';
    if (dlg.options && dlg.options.length){
      dlg.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = o.label;
        b.addEventListener('pointerdown', e => {
          e.preventDefault();
          e.stopPropagation();
          selectDialogOption(i);
          dialogKey = '';
          syncDialog();
        });
        opts.appendChild(b);
      });
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '继续';
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        dismissPlainDialog();
        dialogKey = '';
        syncDialog();
      });
      opts.appendChild(b);
    }
    box.appendChild(opts);
    dialogUI.appendChild(box);
    dialogUI.classList.remove('hidden');
  }
  setInterval(syncDialog, 120);
  syncDialog();

  /* ---------------- 小恐龙：跳 / 蹲 ---------------- */
  const dinoUI = document.createElement('div');
  dinoUI.id = 'touchDino';
  dinoUI.className = 'touchDino hidden';
  dinoUI.innerHTML = '<button id="touchDinoJump" type="button">跳</button>' +
                     '<button id="touchDinoDuck" type="button">蹲</button>';
  document.body.appendChild(dinoUI);

  const dinoJumpBtn = document.getElementById('touchDinoJump');
  const dinoDuckBtn = document.getElementById('touchDinoDuck');
  let dinoDuckHeld = false;

  function syncDino(){
    const open = state.view === 'launcher' && dinoPane &&
                 !dinoPane.classList.contains('hidden');
    dinoUI.classList.toggle('hidden', !open);
    if (!open && dinoDuckHeld){
      dinoDuckHeld = false;
      dinoDuckKey = false;
      dinoDuck = false;
    }
  }
  setInterval(syncDino, 180);

  if (dinoJumpBtn){
    dinoJumpBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (state.view === 'launcher') dinoJump();
    });
  }
  if (dinoDuckBtn){
    const duckDown = e => {
      e.preventDefault();
      dinoDuckHeld = true;
      dinoDuckKey = true;
      if (typeof dinoOnGround !== 'undefined' && !dinoOnGround){
        /* 空中蹲 = 快速落地，和键盘一致 */
        try { dinoVY = Math.min(dinoVY, -260); } catch(err){}
      }
      dinoDuck = true;
    };
    const duckUp = e => {
      if (e) e.preventDefault();
      dinoDuckHeld = false;
      dinoDuckKey = false;
      dinoDuck = false;
    };
    dinoDuckBtn.addEventListener('pointerdown', duckDown);
    dinoDuckBtn.addEventListener('pointerup', duckUp);
    dinoDuckBtn.addEventListener('pointercancel', duckUp);
    dinoDuckBtn.addEventListener('pointerleave', duckUp);
  }

  /* 触屏用户不需要"点击画面锁定鼠标"的提示 */
  const lockHint = document.getElementById('lockHint');
  if (lockHint) lockHint.classList.add('hidden');
})();
