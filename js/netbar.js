'use strict';
/* =========================================================================
   netbar —— 网吧内部（3D 建模）
   ---------------------------------------------------------------------
   街上的「极速网咖」不是只有一块招牌：门帘后面有一间真的屋子。
   它有自己的坐标（NETBAR.z = -500）、自己的碰撞体、自己的机位和吧台。
   进来之后：
     · 3 号机 → dino.exe（考后复用，分数进结算）
     · 吧台 → 网管（考前的嘴硬 / 考后的“还来啊”）
     · 门 → 回街上；考后从门出去会直接回学校

   几何全部用 primitive 现搭，和校园/考场一样零外部资源。
   ========================================================================= */

let netbarBuilt = false;
let netbarNeonA = null, netbarNeonB = null, netbarDinoGlow = null;
const netbarTargets = [];

/* 网吧尺寸：19 × 15（原来 13 × 10 —— 只有六台机位，进门就顶到墙）。
   下面所有家具坐标都相对 NETBAR 中心，换尺寸只改这两个数。 */
const NETBAR_W = 19.0, NETBAR_D = 15.0, NETBAR_HW = NETBAR_W / 2, NETBAR_HD = NETBAR_D / 2;

function buildNetbarInterior(){
  if (netbarBuilt) return;
  netbarBuilt = true;

  const bx = NETBAR.x, bz = NETBAR.z;
  const G = new THREE.Group();
  scene.add(G);

  /* ---- 地板 / 墙 / 天花板 ---- */
  box(NETBAR_W, 0.10, NETBAR_D, 0x161a22, bx, -0.05, bz, G, { roughness: 0.95 });
  box(NETBAR_W, 0.04, NETBAR_D, 0x232838, bx, 0.005, bz, G, { roughness: 0.7 });
  /* 地面网格：网吧那种深色地毯/地砖 */
  for (let i = -9; i <= 9; i++){
    box(0.025, 0.005, NETBAR_D, 0x2b3242, bx + i, 0.03, bz, G);
  }
  for (let j = -7; j <= 7; j++){
    box(NETBAR_W, 0.005, 0.025, 0x2b3242, bx, 0.03, bz + j, G);
  }

  const wallMat = { roughness: 1 };
  box(0.16, 4.2, NETBAR_D, 0x0d1017, bx - NETBAR_HW, 2.1, bz, G, wallMat);
  box(0.16, 4.2, NETBAR_D, 0x0d1017, bx + NETBAR_HW, 2.1, bz, G, wallMat);
  box(NETBAR_W, 4.2, 0.16, 0x0d1017, bx, 2.1, bz - NETBAR_HD, G, wallMat);
  box(NETBAR_W, 4.2, 0.16, 0x0d1017, bx, 2.1, bz + NETBAR_HD, G, wallMat);
  box(NETBAR_W, 0.12, NETBAR_D, 0x090b10, bx, 4.2, bz, G, wallMat);

  /* ---- 吧台 + 网管（挪到右后角，不再堵住进门那条线） ---- */
  box(5.2, 1.05, 0.75, 0x2a211a, bx + 6.4, 0.52, bz + 5.4, G, { roughness: 0.8 });
  box(5.35, 0.08, 0.88, 0x6b4a2c, bx + 6.4, 1.08, bz + 5.4, G, { roughness: 0.6 });
  box(0.55, 0.52, 0.42, 0x10141c, bx + 7.2, 1.32, bz + 5.64, G); /* 收银机 */
  const owner = buildPerson(bx + 4.4, bz + 3.55, 0x3a4a5a, Math.PI, 'stand');
  owner.group.scale.set(0.95, 0.95, 0.95);
  const ownerHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.9, 0.9),
    new THREE.MeshBasicMaterial({ visible: false }));
  ownerHit.position.set(bx + 6.4, 0.95, bz + 5.85);
  scene.add(ownerHit);
  netbarTargets.push({ obj: ownerHit, kind: 'owner', label: '网管' });
  netbarColliders.push({ x: bx + 6.4, z: bz + 5.4, hw: 2.7, hd: 0.5 });

  /* ---- 机位：十二台显示器 + 桌椅（三排 × 四列） ----
     原来六台挤在 13×10 的小屋里，进门就顶到墙；现在 19×15，
     中间留出 2 米宽的过道，3 号机仍在最左后角（按编号排的）。 */
  const pods = [
    { x: -7.0, z: -5.4, dino: true }, { x: -7.0, z: -2.8 }, { x: -7.0, z: -0.2 }, { x: -7.0, z: 2.4 },
    { x: -2.6, z: -5.4 }, { x: -2.6, z: -2.8 }, { x: -2.6, z: -0.2 }, { x: -2.6, z: 2.4 },
    { x: 1.8,  z: -5.4 }, { x: 1.8,  z: -2.8 }, { x: 1.8,  z: -0.2 }, { x: 1.8,  z: 2.4 }
  ];
  pods.forEach((p, i) => {
    const px = bx + p.x, pz = bz + p.z;
    /* 桌子 + 椅子 */
    box(1.2, 0.07, 0.7, 0x3a2f24, px, 0.74, pz, G, { roughness: 0.8 });
    box(0.06, 0.7, 0.06, 0x1b1f28, px - 0.5, 0.37, pz + 0.25, G);
    box(0.06, 0.7, 0.06, 0x1b1f28, px + 0.5, 0.37, pz + 0.25, G);
    box(0.55, 0.06, 0.55, 0x242a36, px, 0.46, pz + 0.85, G);
    box(0.08, 0.46, 0.08, 0x151922, px, 0.23, pz + 0.85, G);
    /* 显示器 */
    box(0.72, 0.46, 0.05, 0x0a0c10, px, 1.28, pz - 0.02, G);
    box(0.72, 0.46, 0.06, 0x1a2030, px, 1.28, pz + 0.01, G);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.39),
      new THREE.MeshBasicMaterial({ color: p.dino ? 0x7dff9a : 0x2a4c7a }));
    scr.position.set(px, 1.28, pz + 0.05);
    G.add(scr);
    if (p.dino){
      netbarDinoGlow = scr;
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.7, 1.0),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(px, 0.9, pz + 0.2);
      scene.add(hit);
      netbarTargets.push({ obj: hit, kind: 'dino', label: '3 号机 · dino.exe' });
      /* 3 号机的牌子 */
      const c = cpTextBoard(512, 160, [
        { text: '3', size: 92, color: '#8dff9f' },
        { text: 'dino.exe', size: 28, color: '#b9ffd0' }
      ], '#07120a', '#1d6b3a');
      cpBoard(c, 0.8, 0.25, px, 1.95, pz + 0.04, 0);
    }
    netbarColliders.push({ x: px, z: pz + 0.2, hw: 0.65, hd: 0.45 });
  });

  /* ---- 霓虹 / 墙饰 ---- */
  const neon1 = cpTextBoard(512, 160, [
    { text: '极 速 网 咖', size: 64, color: '#ff5fd2' },
    { text: '24H · 机位充足', size: 22, color: '#ffa8e8' }
  ], '#100711', '#ff4fc8');
  netbarNeonA = cpBoard(neon1, 4.6, 1.5, bx + NETBAR_HW - 0.12, 2.7, bz - 1.4, -Math.PI / 2);
  const neon2 = cpTextBoard(512, 160, [
    { text: '未成年', size: 54, color: '#7fd7ff' },
    { text: '禁 止 入 内', size: 38, color: '#d9f4ff' }
  ], '#061018', '#2f7ea8');
  netbarNeonB = cpBoard(neon2, 2.6, 0.9, bx - NETBAR_HW + 0.12, 2.4, bz + 0.6, Math.PI / 2);

  /* ---- 出口（南墙正中；两侧各留一段墙，进门不会立刻贴脸） ---- */
  box(1.4, 2.4, 0.12, 0x2a3242, bx, 1.2, bz + NETBAR_HD - 0.06, G);
  box(1.2, 2.2, 0.03, 0x080a0f, bx, 1.1, bz + NETBAR_HD - 0.10, G);
  const doorHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 2.2, 0.8),
    new THREE.MeshBasicMaterial({ visible: false }));
  doorHit.position.set(bx, 1.1, bz + NETBAR_HD - 0.3);
  scene.add(doorHit);
  netbarTargets.push({ obj: doorHit, kind: 'exit', label: '回到街上' });
  const exitSign = cpTextBoard(256, 96, [
    { text: '出 口', size: 42, color: '#9fe8ff' }
  ], '#071018', '#2f7ea8');
  cpBoard(exitSign, 0.7, 0.3, bx, 2.7, bz + NETBAR_HD - 0.14, 0);

  /* 灯光：网吧不需要太阳，只需要几盏冷光 + 粉色霓虹 */
  const l1 = new THREE.PointLight(0x9fc6ff, 0.9, 14, 2);
  l1.position.set(bx, 3.8, bz + 2.0); scene.add(l1);
  const l2 = new THREE.PointLight(0xff5fd2, 0.5, 10, 2);
  l2.position.set(bx + NETBAR_HW - 0.9, 2.6, bz - 1.4); scene.add(l2);
  const l3 = new THREE.PointLight(0x7dff9a, 0.55, 7, 2);
  l3.position.set(bx - 7.0, 2.2, bz - 5.0); scene.add(l3);
  /* 大房间需要两盏补光，否则后半边是黑的 */
  const l4 = new THREE.PointLight(0x9fc6ff, 0.55, 18, 2);
  l4.position.set(bx + 2.0, 3.7, bz - 3.0); scene.add(l4);
  const l5 = new THREE.PointLight(0xffd0a0, 0.4, 14, 2);
  l5.position.set(bx + 6.0, 3.4, bz + 4.0); scene.add(l5);

  /* 烟味：一层很淡的平面雾（不加后处理，省性能） */
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(NETBAR_W - 0.6, NETBAR_D - 0.6),
    new THREE.MeshBasicMaterial({ color: 0x2a3550, transparent: true,
      opacity: 0.08, depthWrite: false }));
  haze.rotation.x = -Math.PI / 2;
  haze.position.set(bx, 1.6, bz);
  G.add(haze);

  /* ---- 中间那条"走道的桌子"：几排共享长桌，别让大房间空荡荡 ---- */
  for (const row of [{ z: -4.1 }, { z: -1.5 }, { z: 1.1 }]){
    box(5.6, 0.07, 0.8, 0x33302a, bx + 7.6, 0.74, bz + row.z, G, { roughness: 0.85 });
    box(0.06, 0.7, 0.06, 0x1b1f28, bx + 5.0, 0.37, bz + row.z, G);
    box(0.06, 0.7, 0.06, 0x1b1f28, bx + 10.2, 0.37, bz + row.z, G);
    for (let k = 0; k < 3; k++){
      box(0.5, 0.06, 0.5, 0x242a36, bx + 6.2 + k * 1.8, 0.46, bz + row.z + 1.0, G);
    }
  }
}

/* 出生点安全落位：网吧的桌椅/吧台都有碰撞，进门时如果正落在桌子里，
   玩家两个轴都撞墙，看起来就是"卡死"（能转头，走不动）。
   这里按候选点找第一个不撞的；全撞了就退到门口。 */
function netbarSpawnAt(x, z, yaw){
  const tries = [[x, z], [x + 1.3, z], [x - 1.3, z], [x, z + 1.2],
                 [x, z - 1.2], [0, 4.2], [4.6, 4.6], [0, 6.0]];
  for (const p of tries){
    if (!collides(p[0], p[1], PLAYER_RADIUS)){
      state.pos.set(p[0], PLAYER_EYE, p[1]);
      state.yaw = yaw; yawTarget = yaw;
      state.pitch = 0; pitchTarget = 0;
      return true;
    }
  }
  state.pos.set(NETBAR.x, PLAYER_EYE, NETBAR.z + 6.0);
  state.yaw = yaw; yawTarget = yaw;
  state.pitch = 0; pitchTarget = 0;
  return false;
}

/* ---------------------------- 进出 ---------------------------- */
function enterNetbarPre(){
  dismissDialogs();
  if (state.view === 'pause') closePauseMenu();
  buildNetbarInterior();
  state.netbarMode = 'pre';
  state.postExamWorld = false;
  state.ended = false;
  state.view = 'world';
  switchArea('netbar');
  netbarSpawnAt(NETBAR.x, NETBAR.z + 6.2, 0);
  state.pauseGraceUntil = performance.now() + 1400;
  requestLock();
  toast('门帘落下。点击画面锁定鼠标，WASD 走到 3 号机，E 打开电脑。', 3200);
}

/* 考后从网吧开始：人站在机位之间的过道里（不能落在桌子里） */
function enterNetbarPost(){
  dismissDialogs();
  if (state.view === 'pause') closePauseMenu();
  buildNetbarInterior();
  const pe = $('postExam');
  if (pe) pe.classList.add('hidden');
  state.postExamWorld = true;
  state.postExamStage = 'netbar';
  state.netbarMode = 'post';
  state.ended = true;
  state.view = 'world';
  switchArea('netbar');
  netbarSpawnAt(NETBAR.x - 1.4, NETBAR.z + 5.4, 0.22);
  /* 最里面那排机位旁边站着一个人（lesson.js）：只在考后出现 */
  if (typeof lessonBuild === 'function'){
    lessonBuild();
    if (typeof lessonShow === 'function') lessonShow(lessonVisible());
  }
  state.pauseGraceUntil = performance.now() + 1400;
  requestLock();
  toast('3 号机还开着。点击画面锁定鼠标，走到机位前按 E；电脑里能开 dino 或洛谷。', 3400);
}

function exitNetbarPre(){
  switchArea('campus');
  state.pos.set(CP.x + 9.0, PLAYER_EYE, CP.z + 24.8);
  state.yaw = Math.PI; yawTarget = Math.PI;
  state.pitch = 0; pitchTarget = 0;
  state.pauseGraceUntil = performance.now() + 1400;
  requestLock();
  toast('你从网吧出来，街上的车流还在。', 2000);
}

function netbarExit(){
  if (state.postExamWorld){
    postExamAfterDino();
    return;
  }
  exitNetbarPre();
}

/* ---------------------------- 交互 ---------------------------- */
function netbarInteract(){
  if (state.area !== 'netbar' || !netbarBuilt) return false;
  raycaster.setFromCamera(CENTER, camera);
  raycaster.far = 3.2;
  const hits = raycaster.intersectObjects(netbarTargets.map(t => t.obj), false);
  if (!hits.length) return false;
  const rec = netbarTargets.find(t => t.obj === hits[0].object);
  if (!rec) return false;

  if (rec.kind === 'lesson'){
    /* 战斗已开：左键就是出拳，不再弹对话 */
    if (state.lessonActive){
      actionSpace = { fn: lessonPunch };
      setPrompt('[ 左键 ] 出拳');
    } else {
      actionE = { fn: lessonTalk };
      setPrompt('[ E ] 说句话');
    }
  } else if (rec.kind === 'dino'){
    actionE = { fn: netbarPCMenu };
    setPrompt('[ E ] 打开 3 号机（dino.exe / 洛谷）');
  } else if (rec.kind === 'exit'){
    actionE = { fn: netbarExit };
    setPrompt(state.postExamWorld ? '[ E ] 出门回学校' : '[ E ] 回到街上');
  } else {
    actionE = { fn: netbarTalk };
    setPrompt('[ E ] 和网管说话');
  }
  promptEl.classList.remove('hidden');
  return true;
}

/* 3 号机的桌面菜单：dino / 洛谷 / 关机。
   考后 dino 走考后结算；考前 dino 走包夜/一局。洛谷两边都能开。 */
function netbarPCMenu(){
  if (state.postExamWorld){
    openDialog({
      title: '3 号机 · 桌面',
      text: '屏幕亮着。桌面上有 dino.exe，浏览器收藏夹里还留着洛谷。\n' +
            '网管在吧台后面喊：「别打通宵。」',
      options: [
        { label: '打开 dino.exe（考后结算）', cb: d => {
            closeDialog(d);
            dinoPostOpen();
          } },
        { label: '上洛谷刷题', cb: d => {
            closeDialog(d);
            openLuogu();
          } },
        { label: '关机', cb: d => closeDialog(d) }
      ]
    });
    return;
  }
  openDialog({
    title: '3 号机 · 桌面',
    text: '屏幕亮着，桌面上的 dino.exe 在待机画面里来回踱步。\n' +
          '浏览器还开着洛谷。网管从吧台后面喊：「开机 5 块。」',
    options: [
      { label: '打开 dino.exe', cb: d => {
          closeDialog(d);
          netbarPreDinoMenu();
        } },
      { label: '上洛谷刷题（不玩 dino）', cb: d => {
          closeDialog(d);
          openLuogu();
        } },
      { label: '关机', cb: d => closeDialog(d) }
    ]
  });
}

function netbarPreDinoMenu(){
  openDialog({
    title: '3 号机 · dino.exe',
    text: '屏幕亮着，小恐龙在待机画面里来回踱步。\n' +
          '网管从吧台后面喊：「开机 5 块。玩到几点？」\n\n' +
          '你摸了摸兜里的准考证。',
    options: [
      { label: '包夜（不考了）', cb: d => {
          closeDialog(d);
          endByNetbar('allnight');
        } },
      { label: '就玩一局，然后回去考试', cb: d => {
          closeDialog(d);
          toast('你坐下，开了第一局。……至少你是这么想的。', 2600);
          /* 考前这局不展开成完整流程：真正的"包夜"结局在上面 */
          setTimeout(() => { if (!state.ended) endByNetbar('one'); }, 900);
        } },
      { label: '算了，回街上', cb: d => closeDialog(d) }
    ]
  });
}

function netbarTalk(){
  const pre = state.netbarMode === 'pre';
  openDialog({
    title: '网 管',
    text: pre
      ? '网管把烟按灭：「你别坐太久。外面那所学校，今天不是有考试吗？」\n' +
        '「……算了，我年轻时也这样。」'
      : '网管看了你一眼：「考完了？考完还来？」\n' +
        '「行吧，3 号机给你留着。别打通宵。」',
    options: [{ label: '……', cb: d => closeDialog(d) }]
  });
}

function updateNetbarArea(worldDt, t){
  if (netbarNeonA) netbarNeonA.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.1);
  if (netbarNeonB) netbarNeonB.material.opacity = 0.7 + 0.3 * Math.sin(t * 1.7 + 1.2);
  if (netbarDinoGlow){
    netbarDinoGlow.material.color.setHex(
      (t % 2.4) < 1.9 ? 0x7dff9a : 0x2f7a45);
  }
  /* 网吧里那个人：只有考后才在；战斗时推他的 AI（lesson.js 后加载）。
     用函数自身兜住"脚本还没加载完"的情况，别直接读 lesson.js 的 let ——
     那会在加载期踩到暂时性死区。 */
  if (typeof lessonVisible === 'function' && typeof lessonShow === 'function' &&
      typeof lessonGroup !== 'undefined' && lessonGroup){
    lessonShow(lessonVisible());
    if (typeof updateLesson === 'function') updateLesson(worldDt, t);
  }
}
