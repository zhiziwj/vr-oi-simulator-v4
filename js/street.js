'use strict';
/* =========================================================================
   street —— 校门外的马路（学校门口那条街）
   ---------------------------------------------------------------------
   这一段回答的是"考试之前你在哪"：
     从学校对面的人行道出发，先过一条有红绿灯和车流的马路，
     校门旁边是文印店、早餐摊、小卖部，对面是公交站和一家 24 小时网吧。
     走进去之后才是原来的校园段（校门 → 传送圈 → 安检 → 404）。

   为什么不做成第三个"区域"：
     校园整体平移到 +Z 500，街道只是把同一块空间的 zMax 往外推了 12 米。
     几何体一次建好、永远不销毁 —— 和 campus/room 的切换方式一致，
     也就不存在"从街道切回校园时漏了某个引用"这类问题。

   和 campus.js 的分工：
     · campusdata.js  街道的尺寸 / 出生点 / 门卫数据（跨文件共用）
     · campus.js      校园本体、安检、进楼；只把街道的"点"接进交互表
     · street.js      马路、车流、红绿灯、店铺、公交站、支线与结局入口

   一条硬规则：本文件里**所有**弹窗选项都要自己 closeDialog 或
   setDialogContent。漏一个就会让 hasDialog() 永远为真，整个输入系统停摆
   （project README 里"校园弹窗"那条 bug 就是这么来的）。
   ========================================================================= */

/* ---------------------------- 街上的常数 ---------------------------- */
const STREET_LIGHT_CYCLE = 20;        /* 红绿灯一轮 20 秒 */
const STREET_WALK_TIME   = 9;          /* 其中 9 秒是行人绿灯 */
const STREET_CAR_HALF    = 45;         /* 车开到这么远就绕回另一头 */
const STREET_NEAR_STOP_X = -4.6;       /* 靠近学校那条车道：停在斑马线前 */
const STREET_FAR_STOP_X  =  4.6;       /* 对面那条车道 */

/* 车流。车不是障碍物 —— 撞不到你；能撞到你的只有"红灯时横穿"那一下。 */
const streetCars = [];
/* 街上的行人。纯装饰，不登记碰撞：他们会从你身边擦过去。 */
const streetPeds = [];
/* 早餐摊的蒸汽 / 文曲星的许愿带：每帧动一下，让街是活的。 */
const streetSteam = [];
const streetRibbons = [];
let streetSignal = null;

/* 红绿灯的"状态机"是纯函数：t 秒时是走还是等、还剩几秒。
   纯函数才好测 —— 不用等 20 秒真实时间，直接喂 15 就知道是红灯。 */
function stSignalAt(t){
  const m = ((t % STREET_LIGHT_CYCLE) + STREET_LIGHT_CYCLE) % STREET_LIGHT_CYCLE;
  const walk = m < STREET_WALK_TIME;
  return {
    walk: walk,
    left: walk ? STREET_WALK_TIME - m : STREET_LIGHT_CYCLE - m
  };
}

/* 街上的店铺。位置、招牌、卖什么、点了 E 走哪个函数 —— 全在这里一份，
   建造和对话都读同一份，改价钱不用翻两个地方。 */
const STREET_SHOPS = {
  print: {
    x: -8.6, z: 12.0, w: 4.4, d: 3.0,
    title: '文 印 · 打 印 复 印',
    sub: '准考证 2 元 · 立等可取',
    poster: '复 印 · 打 印 · 扫 描',
    wall: 0x46505e, signBg: '#101a2c', signBorder: '#3fb8e0',
    prompt: '[ E ] 走进文印店', open: openPrintShop
  },
  store: {
    x: 8.8, z: 12.0, w: 4.4, d: 3.0,
    title: '小 卖 部',
    sub: '冰镇饮料 · 辣条 · 过期酸奶',
    poster: '冰 镇 · 饮 料 · 辣 条',
    wall: 0x51463a, signBg: '#1c160e', signBorder: '#d8a04a',
    prompt: '[ E ] 走进小卖部', open: openStore
  }
};

/* 小卖部的货架。过期酸奶就是臭水 —— 考前补给的老去处。
   price 和 ITEMS 里的东西分开写：item id 是机制，价格是这条街的物价。 */
const STORE_STOCK = [
  { id: 'water', price: 2, label: '矿泉水' },
  { id: 'spicy', price: 3, label: '辣条' },
  { id: 'stink', price: 2, label: '过期酸奶（臭水）' }
];

/* =========================================================================
   一、路面：人行道、马路、路缘、车道线、斑马线
   ========================================================================= */
function stSidewalkTexture(){
  const c = makeCanvas(128, 128);
  const ctx = c.ctx;
  ctx.fillStyle = '#4a4e55';
  ctx.fillRect(0, 0, 128, 128);
  /* 两色方砖 + 一道砖缝 */
  for (let y = 0; y < 128; y += 32){
    for (let x = 0; x < 128; x += 32){
      const g = 64 + ((x + y) % 64 === 0 ? 5 : 0);
      ctx.fillStyle = 'rgb(' + g + ',' + (g + 3) + ',' + (g + 8) + ')';
      ctx.fillRect(x + 1, y + 1, 30, 30);
    }
  }
  const tex = canvasTex(c.c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function stBuildRoad(){
  /* 学校这侧的人行道：从校门（8）铺到路缘（15.4）。
     它压在草地上面一点，所以校门口那段看起来是"从砖路接到街上"。 */
  {
    const tex = stSidewalkTexture();
    tex.repeat.set(12, 3);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(40, STREET_CURB_Z - 8.0),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(CP.x, 0.006, CP.z + (8.0 + STREET_CURB_Z) / 2);
    scene.add(m);
  }

  /* 对面人行道：路缘到临街楼前 */
  {
    const tex = stSidewalkTexture();
    tex.repeat.set(12, 3);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(40, STREET_MAX_Z - STREET_FAR_CURB_Z + 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(CP.x, 0.006, CP.z + (STREET_FAR_CURB_Z + STREET_MAX_Z + 2) / 2);
    scene.add(m);
  }

  /* 沥青路面。比可走范围宽得多：走到 x=±12 时路还在往两边延伸，
     不会露出一道"世界到此为止"的硬边。 */
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(90, STREET_FAR_CURB_Z - STREET_CURB_Z),
    mat(0x10141a, { roughness: 0.98 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(CP.x, 0.004, CP.z + STREET_ROAD_MID_Z);
  scene.add(road);

  /* 路缘石：两条长条。不做成碰撞体 —— 人应该能迈上迈下。 */
  for (const z of [STREET_CURB_Z, STREET_FAR_CURB_Z]){
    box(40, 0.12, 0.18, 0x7a8088, CP.x, 0.06, CP.z + z, scene, { roughness: 0.9 });
  }

  /* 车道边线 */
  for (const z of [STREET_CURB_Z + 0.35, STREET_FAR_CURB_Z - 0.35]){
    box(80, 0.010, 0.07, 0xd8dde5, CP.x, 0.014, CP.z + z, scene);
  }
  /* 中间虚线 */
  for (let x = -38; x <= 38; x += 3.6){
    box(1.6, 0.010, 0.09, 0xd8dde5, CP.x + x, 0.014, CP.z + STREET_ROAD_MID_Z, scene);
  }
  /* 停止线：车在行人绿灯时停这里。车头（中心 ±1.9 米）刚好压在线上，
     也就是停在斑马线外沿（x = ±2.4）之前。 */
  box(0.22, 0.010, 3.0, 0xe8edf5, CP.x - 2.7, 0.015,
      CP.z + STREET_CURB_Z + 1.6, scene);
  box(0.22, 0.010, 3.0, 0xe8edf5, CP.x + 2.7, 0.015,
      CP.z + STREET_FAR_CURB_Z - 1.6, scene);

  /* 斑马线：正对校门。行人沿 z 走，横条沿 x 铺开。 */
  for (let z = STREET_CURB_Z + 0.45; z < STREET_FAR_CURB_Z - 0.25; z += 1.0){
    box(STREET_CROSS_HALF_W * 2, 0.012, 0.46, 0xe6ebf3,
        CP.x, 0.016, CP.z + z, scene);
  }

  /* 路面上写两遍"慢" —— 校门口的路，字比限速牌更有说服力。
     平铺的字不能走 cpBoard（那是竖着挂的牌子），要自己转 -90° 贴地。 */
  for (const sx of [-8.5, 8.5]){
    const tex = canvasTex(stTextTexture('慢', 256, 256, '#d8dde5', null, 150), true);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(CP.x + sx, 0.020, CP.z + STREET_ROAD_MID_Z);
    scene.add(m);
  }
}

/* 把一行字画成一块小贴图（地面字、门牌都用它） */
function stTextTexture(text, w, h, color, bg, size){
  const c = makeCanvas(w, h);
  const ctx = c.ctx;
  if (bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = color;
  ctx.font = 'bold ' + size + 'px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  return c.c;
}

/* =========================================================================
   二、红绿灯与车流
   ========================================================================= */
function stBuildSignals(){
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const greenMat = new THREE.MeshBasicMaterial({ color: 0x33ff88 });
  streetSignal = { redMat: redMat, greenMat: greenMat };

  /* 两盏行人灯：学校这侧一盏（朝校门）、对面一盏（朝马路对面）。
     facing = +1 表示灯面朝 +Z，-1 朝 -Z。 */
  for (const spec of [
    { x: -3.9, z: STREET_CURB_Z - 0.35, facing: -1 },
    { x: 3.9, z: STREET_FAR_CURB_Z + 0.35, facing: 1 }
  ]){
    const x = CP.x + spec.x, z = CP.z + spec.z;
    box(0.14, 4.0, 0.14, 0x2e3646, x, 2.0, z, scene, { metalness: 0.5, roughness: 0.5 });
    cpAddObstacle(x, z, 0.16, 0.16);
    box(0.46, 1.10, 0.30, 0x11161f, x, 3.28, z + spec.facing * 0.10, scene);
    const red = new THREE.Mesh(getSphereGeo(0.11, 10, 8), redMat);
    red.position.set(x, 3.55, z + spec.facing * 0.27);
    scene.add(red);
    const green = new THREE.Mesh(getSphereGeo(0.11, 10, 8), greenMat);
    green.position.set(x, 3.12, z + spec.facing * 0.27);
    scene.add(green);
    /* 一块小牌子：告诉玩家这灯是给行人的 */
    const sign = cpTextBoard(256, 128, [
      { text: '行人', color: '#0d1420', size: 52 },
      { text: '过街', color: '#0d1420', size: 38 }
    ], '#f2f2ea', '#2a3038');
    cpBoard(sign, 0.52, 0.26, x, 2.55, z, spec.facing > 0 ? 0 : Math.PI);
  }
}

function stBuildCar(color){
  const g = new THREE.Group();
  box(3.8, 0.55, 1.60, color, 0, 0.44, 0, g, { roughness: 0.35, metalness: 0.35 });
  box(1.90, 0.48, 1.44, 0x1a2230, -0.15, 0.88, 0, g,
      { roughness: 0.18, metalness: 0.4, transparent: true, opacity: 0.82 });
  /* 轮子：四个小方块，便宜、远看足够 */
  for (const sx of [-1.22, 1.22]){
    for (const sz of [-0.72, 0.72]){
      box(0.54, 0.30, 0.14, 0x090b10, sx, 0.22, sz, g);
    }
  }
  /* 车灯：车头（局部 +x）暖白，车尾红 */
  for (const sz of [-0.52, 0.52]){
    box(0.10, 0.10, 0.16, 0xfff0c0, 1.92, 0.48, sz, g).material =
      new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
    box(0.08, 0.10, 0.16, 0xff2a2a, -1.92, 0.48, sz, g).material =
      new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  }
  addContactShadow(g, 1.5);
  return g;
}

function stBuildCars(){
  const specs = [
    { lane: STREET_NEAR_LANE_Z, x: -24, dir:  1, color: 0x9a3b3b, speed: 7.2 },
    { lane: STREET_NEAR_LANE_Z, x: -9,  dir:  1, color: 0x3b5b8a, speed: 6.4 },
    { lane: STREET_FAR_LANE_Z,  x: 10,  dir: -1, color: 0xb08a3a, speed: 7.8 },
    { lane: STREET_FAR_LANE_Z,  x: 26,  dir: -1, color: 0x4a6a52, speed: 6.8 }
  ];
  for (const s of specs){
    const g = stBuildCar(s.color);
    g.position.set(CP.x + s.x, 0, CP.z + s.lane);
    if (s.dir < 0) g.rotation.y = Math.PI;
    scene.add(g);
    streetCars.push({
      group: g, x: s.x, lane: s.lane, dir: s.dir, base: s.speed, speed: s.speed,
      stopX: s.dir > 0 ? STREET_NEAR_STOP_X : STREET_FAR_STOP_X
    });
  }
}

/* 车在行人绿灯时要停在停止线前。已经过线的车不往回倒 —— 那看起来像 bug。
   停止判定要留一个"已经停在线上"的保持区：只看 `ahead > 0` 的话，
   车一停到 0 就会立刻被当成"已过线"重新起步，行人绿灯时它会慢慢蹭过斑马线。 */
function stCarStopAhead(car, sig){
  if (!sig.walk) return Infinity;
  return car.dir > 0 ? car.stopX - car.x : car.x - car.stopX;
}
function stCarShouldStop(car, sig){
  const ahead = stCarStopAhead(car, sig);
  return ahead > -2.0 && ahead < 3.0;
}

function stUpdateCars(dt, sig){
  for (const c of streetCars){
    /* 差点撞到人那辆车会真的急刹 1.5 秒 —— 不给它一个 brakedUntil，
       "司机急刹"就只是一句字幕，车会从玩家身上直接开过去。 */
    const braked = c.brakedUntil && state.worldTime < c.brakedUntil;
    const target = braked ? 0 : (stCarShouldStop(c, sig) ? 0 : c.base);
    /* 刹车比起步快：绿灯亮起时车流要能立刻停住，红灯亮起时慢慢加速 */
    const rate = target < c.speed ? 4.0 : 2.2;
    c.speed += (target - c.speed) * Math.min(1, dt * rate);
    if (c.speed < 0.02) c.speed = 0;
    c.x += c.dir * c.speed * dt;
    if (c.dir > 0 && c.x > STREET_CAR_HALF) c.x = -STREET_CAR_HALF;
    if (c.dir < 0 && c.x < -STREET_CAR_HALF) c.x = STREET_CAR_HALF;
    c.group.position.x = CP.x + c.x;
  }
}

/* =========================================================================
   三、店铺
   ========================================================================= */
function stShopShell(s){
  const x = CP.x + s.x, z = CP.z + s.z;
  const front = z + s.d / 2;

  box(s.w, 3.0, s.d, s.wall, x, 1.5, z, scene, { roughness: 0.88 });
  box(s.w + 0.5, 0.22, s.d + 0.5, 0x2b313c, x, 3.0, z, scene);

  /* 卷帘门半开着，玻璃窗是暖色的 —— 早上七点，店里已经开灯了 */
  box(s.w - 0.8, 0.10, 0.10, 0x2a3038, x, 2.55, front + 0.03, scene);
  box(s.w - 1.0, 1.65, 0.06, 0x8fc4e8, x, 1.35, front + 0.02, scene,
      { roughness: 0.16, metalness: 0.25, transparent: true, opacity: 0.52 });
  box(1.05, 2.10, 0.07, 0x2f3946, x + s.w / 2 - 0.95, 1.05, front + 0.05, scene);
  box(0.08, 0.34, 0.09, 0xd8dde5, x + s.w / 2 - 1.30, 1.02, front + 0.10, scene,
      { metalness: 0.7, roughness: 0.3 });

  /* 贴在玻璃上的一张纸：近看时窗口不是一块纯色 */
  if (s.poster){
    const poster = cpTextBoard(512, 256, [
      { text: s.poster, color: '#2a2018', size: 44 }
    ], '#f2eee3', '#b9ad96');
    cpBoard(poster, 0.92, 0.46, x - s.w / 2 + 1.05, 1.45, front + 0.10, 0);
  }

  /* 招牌压低到 2.7 米：站在人行道上（离店门只有 1~2 米）也能看见。
     第一版挂在 3.4 米，走到店门口抬头只剩一堵墙。 */
  const sign = cpTextBoard(1024, 256, [
    { text: s.title, color: '#f2f6ff', size: 72 },
    { text: s.sub,   color: '#9fd3ff', size: 30 }
  ], s.signBg, s.signBorder);
  cpBoard(sign, 3.9, 0.86, x, 2.68, front + 0.06, 0);

  /* 玻璃上沿一条深色框，给"店面"一点进深。雨棚就不做了：
     人行道只有 1.3 米宽，任何伸出来的檐都会把招牌挡在视线上方。 */
  box(s.w - 0.6, 0.08, 0.14, 0x2e3646, x, 2.20, front + 0.08, scene);

  /* 店里的暖光：不点真实光源，只贴一块亮面 —— 街上已经够多光源了 */
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 1.4, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xffd89a, transparent: true, opacity: 0.16,
                                  depthWrite: false }));
  glow.position.set(x, 1.5, front - 0.02);
  scene.add(glow);

  /* 可交互面：站在店门口按 E。做得比门宽一点，准星不用抠像素 */
  const hit = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.5, 2.5, 0.55),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 1.25, front + 0.20);
  scene.add(hit);
  campusSpotTargets.push({ obj: hit, label: s.title, prompt: s.prompt, fn: s.open });

  cpAddObstacle(x, z, s.w / 2, s.d / 2);
}

function stBuildShops(){
  stShopShell(STREET_SHOPS.print);
  stShopShell(STREET_SHOPS.store);
}

/* 早餐摊：一辆推车 + 一把伞 + 一口冒热气的锅。没有店面，所以单独建。 */
function stBuildBreakfast(){
  const x = CP.x - 3.6, z = CP.z + 13.0;

  box(2.7, 0.92, 1.15, 0xc8b8a0, x, 0.48, z, scene, { roughness: 0.85 });
  box(2.7, 0.10, 1.15, 0x8a7a64, x, 0.98, z, scene);
  box(1.9, 0.55, 0.82, 0x8fc4e8, x, 1.30, z, scene,
      { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.45 });
  /* 车轮 */
  for (const sx of [-1.05, 1.05]){
    box(0.52, 0.52, 0.12, 0x1a1e26, x + sx, 0.28, z + 0.55, scene);
    box(0.52, 0.52, 0.12, 0x1a1e26, x + sx, 0.28, z - 0.55, scene);
  }
  /* 伞 */
  box(0.06, 2.5, 0.06, 0x8a8f96, x + 1.22, 1.25, z, scene);
  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.55, 12),
    mat(0xb03a3a, { roughness: 0.9 }));
  umbrella.position.set(x + 1.22, 2.55, z);
  scene.add(umbrella);
  /* 锅与蒸汽 */
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.26, 0.26, 12),
    mat(0x4a4f57, { metalness: 0.6, roughness: 0.4 }));
  pot.position.set(x - 0.55, 1.10, z);
  scene.add(pot);

  conSteam(x - 0.55, 1.35, z, 0);
  conSteam(x - 0.55, 1.35, z, 1);
  conSteam(x - 0.55, 1.35, z, 2);

  /* 招牌 */
  const sign = cpTextBoard(768, 224, [
    { text: '早 点 · 现 做', color: '#fff4d8', size: 64 },
    { text: '豆浆 3 元 · 茶叶蛋 2 元 · 煎饼 5 元', color: '#ffd479', size: 28 }
  ], '#3a1e12', '#d8a04a');
  cpBoard(sign, 2.6, 0.76, x - 0.1, 2.35, z + 0.62, 0);

  /* 摊主：站在车后面，白色围裙 */
  const v = buildPerson(x + 0.15, z - 0.95, 0xe2d7c4, 0, 'stand');
  box(0.54, 0.72, 0.03, 0x9a3b3b, 0, 0.92, 0.17, v.group);
  /* 一摞一次性碗 */
  box(0.36, 0.20, 0.30, 0xe8e2d4, x + 0.95, 1.13, z - 0.1, scene);

  /* 可交互面：车头 */
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.2, 0.9),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 1.1, z + 0.65);
  scene.add(hit);
  campusSpotTargets.push({
    obj: hit, label: '早餐摊', prompt: '[ E ] 在早餐摊买点东西', fn: openBreakfast
  });

  cpAddObstacle(x, z, 1.4, 0.62);
  cpAddObstacle(x + 0.15, z - 0.95, 0.32, 0.32);
}

function conSteam(x, y, z, phase){
  const m = new THREE.Mesh(getSphereGeo(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.18,
                                  depthWrite: false }));
  m.position.set(x, y, z);
  scene.add(m);
  streetSteam.push({ mesh: m, baseY: y, phase: phase, x: x, z: z });
}

/* =========================================================================
   四、公交站 / 文曲星 / 门卫 / 网吧
   ========================================================================= */
function stBuildBusStop(){
  const x = CP.x + 6.6, z = CP.z + 22.9;
  const poleX = x + 0.9;

  /* 杆子放到牌子侧面，别从字中间穿过去 —— 第一版就是签字笔一样把
     "K114" 劈成了两半。牌子挂在伸出来的小横臂上。 */
  box(0.12, 3.1, 0.12, 0x2e3646, poleX, 1.55, z, scene);
  box(1.0, 0.08, 0.08, 0x2e3646, x + 0.45, 2.92, z, scene);
  const board = cpTextBoard(768, 512, [
    { text: 'K114 路', color: '#f2f6ff', size: 62 },
    { text: '开往 火车站', color: '#9fd3ff', size: 36 },
    { text: '下一班 2 分钟', color: '#ffd479', size: 30 },
    { text: '※ 上车请投币', color: '#c8d6ea', size: 24 }
  ], '#0e1a2c', '#3fb8e0');
  cpBoard(board, 1.35, 0.9, x, 2.45, z - 0.10, Math.PI);
  cpBoard(board, 1.35, 0.9, x, 2.45, z + 0.10, 0);

  /* 候车长凳 */
  box(2.6, 0.10, 0.52, 0x8a6a4a, x + 1.6, 0.46, z + 0.55, scene, { roughness: 0.9 });
  for (const sx of [-1.0, 1.0]){
    box(0.10, 0.44, 0.44, 0x4a4f57, x + 1.6 + sx, 0.22, z + 0.55, scene);
  }
  /* 站牌杆上挂一块小牌：这条街的公交车真的只到火车站 */
  box(0.46, 0.32, 0.05, 0x1a2230, x, 1.55, z + 0.10, scene);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.8),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 1.2, z);
  scene.add(hit);
  campusSpotTargets.push({
    obj: hit, label: '公交站', prompt: '[ E ] 看看 K114 路站牌', fn: openBusStop
  });

  cpAddObstacle(poleX, z, 0.2, 0.2);
  cpAddObstacle(x + 1.6, z + 0.55, 1.3, 0.3);

  /* 等车的人：一个拎着袋子的阿姨。她只是站着，不拦你。 */
  const p = buildPerson(x - 1.5, z + 0.45, 0x7a5a6a, Math.PI, 'stand');
  box(0.28, 0.34, 0.16, 0xc8b89a, 0.26, 0.62, 0.10, p.group);
}

function stBuildShrine(){
  const x = CP.x + 3.9, z = CP.z + 9.6;

  box(1.15, 0.42, 0.80, 0x6a6258, x, 0.21, z, scene, { roughness: 0.95 });
  box(0.72, 0.12, 0.56, 0x8a8072, x, 0.48, z, scene);

  /* 文曲星：一个小金身 */
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.52, 10),
    mat(0xc8a44a, { metalness: 0.35, roughness: 0.45 }));
  body.position.set(x, 0.82, z);
  scene.add(body);
  const head = new THREE.Mesh(getSphereGeo(0.15, 12, 10),
    mat(0xd8b86a, { metalness: 0.3, roughness: 0.5 }));
  head.position.set(x, 1.18, z);
  scene.add(head);

  /* 红漆小顶 + 两根柱子 */
  for (const sx of [-0.62, 0.62]){
    box(0.08, 1.30, 0.08, 0x7a2a24, x + sx, 1.05, z, scene);
  }
  box(1.55, 0.10, 1.05, 0x8a2b2b, x, 1.76, z, scene);
  box(1.30, 0.08, 0.85, 0x6a1f1a, x, 1.86, z, scene);

  const plate = cpTextBoard(512, 192, [
    { text: '文 曲 星', color: '#ffe9a8', size: 64 },
    { text: '心诚则灵', color: '#ffb3b3', size: 28 }
  ], '#241010', '#c8a44a');
  cpBoard(plate, 1.1, 0.42, x, 2.02, z + 0.54, 0);

  /* 许愿带：三条红布，每帧晃一下 */
  for (let i = 0; i < 3; i++){
    const r = box(0.07, 0.45, 0.02, 0xc0392b, x - 0.28 + i * 0.28, 1.58, z + 0.48, scene);
    streetRibbons.push({ mesh: r, phase: i * 1.7 });
  }

  /* 三炷香 */
  for (let i = 0; i < 3; i++){
    box(0.018, 0.28, 0.018, 0x8a6a4a, x - 0.10 + i * 0.10, 0.62, z + 0.22, scene);
    const tip = box(0.03, 0.03, 0.03, 0xff8a3a, x - 0.10 + i * 0.10, 0.77, z + 0.22, scene);
    tip.material = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
  }

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 1.1),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 1.05, z);
  scene.add(hit);
  campusSpotTargets.push({
    obj: hit, label: '文曲星', prompt: '[ E ] 在文曲星像前拜一拜', fn: prayToWenqu
  });
  cpAddObstacle(x, z, 0.65, 0.45);
}

function stBuildGatekeeper(){
  const x = CP.x + GATEKEEPER.x, z = CP.z + GATEKEEPER.z;
  const p = buildPerson(x, z, GATEKEEPER.color, 0, 'stand');
  /* 保安帽 + 红袖标：不用另做一套模型，两个盒子就够认人了 */
  box(0.31, 0.08, 0.31, 0x0a1525, 0, 1.66, 0.02, p.group);
  box(0.25, 0.02, 0.20, 0x050c18, 0, 1.63, 0.19, p.group);
  box(0.13, 0.13, 0.13, 0xffe066, -0.29, 1.22, 0.14, p.group);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.9),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 0.95, z);
  scene.add(hit);
  const ob = cpAddObstacle(x, z, 0.36, 0.36);
  campusTalkTargets.push({ obj: hit, npc: p, data: GATEKEEPER, obstacle: ob });
}

function stBuildNetbar(){
  const x = CP.x + 10.4, z = CP.z + 26.3, front = z - 1.1;

  box(3.2, 3.4, 2.2, 0x241f2e, x, 1.7, z, scene, { roughness: 0.9 });
  box(3.4, 0.24, 2.4, 0x141018, x, 3.4, z, scene);
  box(1.0, 2.2, 0.08, 0x2f2a3a, x + 0.4, 1.1, front - 0.02, scene);
  box(0.55, 0.55, 0.06, 0x9fc8e8, x - 0.8, 1.8, front - 0.02, scene,
      { roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.5 });

  const sign = cpTextBoard(1024, 256, [
    { text: '极 速 网 咖', color: '#ff8ad8', size: 74 },
    { text: '2 4 H · 未 成 年 禁 止 入 内', color: '#8fe8ff', size: 28 }
  ], '#120a1a', '#ff5ab8');
  cpBoard(sign, 3.2, 0.8, x, 3.9, front - 0.04, Math.PI);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.7),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x + 0.4, 1.2, front - 0.15);
  scene.add(hit);
  campusSpotTargets.push({
    obj: hit, label: '极速网咖', prompt: '[ E ] 推开网吧的门', fn: openNetbar
  });
  cpAddObstacle(x, z, 1.6, 1.1);
}

/* =========================================================================
   五、街景：对面的楼、路灯、行道树、杂物、行人
   ========================================================================= */
function stFacadeTexture(b){
  /* 一栋楼一张贴图：窗画在 canvas 上，整面墙只占一次 draw call。
     第一版是"一层窗一个 PlaneGeometry"，四栋楼直接多出上百次绘制 ——
     在软件渲染的 headless 里掉帧掉得很明显。 */
  const W = 256, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.ctx;
  ctx.fillStyle = '#' + b.color.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fillRect(0, 0, W, 18);
  const cols = Math.max(4, Math.floor(b.w / 1.2));
  const rows = Math.max(5, Math.floor(b.h / 1.3));
  const cw = W / cols, ch = H / rows;
  for (let r = 1; r < rows; r++){
    for (let cix = 0; cix < cols; cix++){
      const lit = ((r * 5 + cix * 11 + Math.abs(b.z) | 0) % 3) !== 0;
      const x = cix * cw + cw * 0.24, y = r * ch + ch * 0.20;
      const w = cw * 0.52, h = ch * 0.46;
      ctx.fillStyle = lit ? 'rgba(255,216,154,.62)' : 'rgba(36,50,68,.85)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(10,14,20,.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }
  return c.c;
}

function stBuildBackdrop(){
  const buildings = [
    { x: -14.5, z: 31.2, w: 9.0, h: 12.0, color: 0x1b2430 },
    { x: -4.5,  z: 30.6, w: 8.0, h: 9.0,  color: 0x232a34 },
    { x: 5.0,   z: 31.4, w: 9.0, h: 14.0, color: 0x1d2838 },
    { x: 14.8,  z: 30.4, w: 8.0, h: 10.0, color: 0x242a30 }
  ];
  for (const b of buildings){
    box(b.w, b.h, 6.0, b.color, CP.x + b.x, b.h / 2, CP.z + b.z, scene, { roughness: 0.95 });
    /* 正面贴一张画满窗的贴图，代替几十个独立的小平面 */
    const facade = new THREE.Mesh(
      new THREE.PlaneGeometry(b.w - 0.05, b.h - 0.05),
      new THREE.MeshBasicMaterial({ map: canvasTex(stFacadeTexture(b), true) }));
    facade.position.set(CP.x + b.x, b.h / 2, CP.z + b.z - 3.02);
    facade.rotation.y = Math.PI;
    scene.add(facade);
  }

  /* 两块立在楼顶的招牌：街的尽头得有东西告诉玩家"这是商业街" */
  const neon1 = cpTextBoard(1024, 256, [
    { text: '便 利 店', color: '#8fe8ff', size: 90 },
    { text: '24 小 时', color: '#ffd479', size: 34 }
  ], '#0a1420', '#3fb8e0');
  cpBoard(neon1, 3.6, 0.9, CP.x - 4.5, 9.6, CP.z + 27.57, Math.PI);

  const neon2 = cpTextBoard(1024, 256, [
    { text: '第 114 中学', color: '#f2f6ff', size: 78 },
    { text: '考 场 39 · 404 教室', color: '#ffd479', size: 30 }
  ], '#101a2c', '#4a6bff');
  cpBoard(neon2, 3.8, 0.95, CP.x + 9.0, 8.2, CP.z + 28.34, Math.PI);
}

function stBuildLamps(){
  for (const spec of [
    { x: -11.6, z: 14.2 }, { x: 11.6, z: 14.2 },
    { x: -11.6, z: 22.2 }, { x: 11.6, z: 22.2 },
    { x: -6.2, z: 26.6 },  { x: 6.2, z: 26.6 }
  ]){
    const x = CP.x + spec.x, z = CP.z + spec.z;
    box(0.12, 4.6, 0.12, 0x2e3646, x, 2.3, z, scene);
    box(0.90, 0.07, 0.07, 0x2e3646, x + (spec.x > 0 ? -0.38 : 0.38), 4.55, z, scene);
    const lamp = box(0.62, 0.13, 0.26, 0xfff0c8,
                     x + (spec.x > 0 ? -0.80 : 0.80), 4.50, z, scene);
    lamp.material = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
    cpAddObstacle(x, z, 0.14, 0.14);
  }

  /* 行道树：只种在对面人行道，树坑用一块深色板压住。
     中间那棵刻意让开公交站 —— 第一版摆在公交站正前方，招牌全被树冠挡了。 */
  for (const spec of [ { x: -8.8, z: 24.2 }, { x: -2.8, z: 26.0 }, { x: 9.4, z: 24.6 } ]){
    const x = CP.x + spec.x, z = CP.z + spec.z;
    box(1.2, 0.04, 1.2, 0x2a241c, x, 0.03, z, scene);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 2.4, 8),
      mat(0x4a3a2a, { roughness: 0.95 }));
    trunk.position.set(x, 1.2, z);
    scene.add(trunk);
    const leaf = new THREE.Mesh(getSphereGeo(1.15, 10, 8),
      mat(0x2f5a33, { roughness: 1 }));
    leaf.position.set(x, 3.05, z);
    leaf.scale.set(1, 0.9, 1);
    scene.add(leaf);
    cpAddObstacle(x, z, 0.28, 0.28);
  }
}

function stBuildDecor(){
  /* 街道两端的矮绿篱：可走范围在 x=±12.4 就没了，没有东西挡一下的话
     玩家会撞上一堵"看不见的墙"。绿篱把边界变成看得见的东西。 */
  for (const sx of [-1, 1]){
    for (const z of [11.7, 24.4]){
      const hx = CP.x + sx * 12.15, hz = CP.z + z;
      box(0.50, 0.85, 6.0, 0x2f4a2f, hx, 0.42, hz, scene, { roughness: 1 });
      cpAddObstacle(hx, hz, 0.25, 3.0);
    }
  }

  /* 垃圾桶：别摆在斑马线正落点上 —— 一抬头就是一堵绿墙 */
  for (const spec of [ { x: -4.8, z: 22.0 }, { x: -10.9, z: 14.6 } ]){
    const x = CP.x + spec.x, z = CP.z + spec.z;
    box(0.46, 0.78, 0.46, 0x3a4a3a, x, 0.39, z, scene, { roughness: 0.9 });
    box(0.52, 0.08, 0.52, 0x2a3a2a, x, 0.82, z, scene);
    cpAddObstacle(x, z, 0.25, 0.25);
  }

  /* 共享单车：一排轮子 + 车架，纯装饰，不给碰撞 —— 免得把路口堵死 */
  for (let i = 0; i < 5; i++){
    const x = CP.x - 10.6 + i * 0.62, z = CP.z + 23.6;
    for (const sx of [-0.42, 0.42]){
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 12),
        mat(0x20242c, { roughness: 0.7 }));
      w.position.set(x + sx, 0.27, z);
      scene.add(w);
    }
    box(0.86, 0.06, 0.06, i % 2 ? 0xd8a04a : 0x3fb8e0, x, 0.55, z, scene);
    box(0.06, 0.38, 0.06, 0x20242c, x, 0.36, z, scene);
  }

  /* 路边一条"第 114 中学 ↑"的反光指路牌 */
  const x = CP.x - 6.2, z = CP.z + 21.85;
  box(0.08, 2.2, 0.08, 0x8a8f96, x, 1.1, z, scene);
  const sign = cpTextBoard(768, 192, [
    { text: '第 114 中学', color: '#12325e', size: 62 },
    { text: '前 方 50 米  →', color: '#1a2740', size: 34 }
  ], '#f2f6ff', '#4a6bff');
  cpBoard(sign, 1.7, 0.42, x, 2.15, z + 0.05, 0);

  /* 校门口的小广告：贴在灯柱上的"冲刺班"，纯彩蛋 */
  const ad = cpTextBoard(256, 384, [
    { text: 'CSP-S', color: '#e8f0ff', size: 52 },
    { text: '冲刺班', color: '#ffd479', size: 46 },
    { text: '电话 114', color: '#9fd3ff', size: 30 }
  ], '#1a1a24', '#c8a44a');
  cpBoard(ad, 0.5, 0.75, CP.x + 11.6, 2.4, CP.z + 14.35, 0);
}

function stBuildPeds(){
  const specs = [
    { x: -5.0, z: 22.3, dir: 1,  color: 0x5a7a8a, speed: 0.75 },
    { x: 3.4,  z: 23.1, dir: -1, color: 0x8a5a6a, speed: 0.62 },
    { x: 9.0,  z: 24.7, dir: 1,  color: 0x4a6a52, speed: 0.85 },
    { x: -8.0, z: 14.4, dir: -1, color: 0x6a5a3a, speed: 0.70 }
  ];
  for (const s of specs){
    const p = buildPerson(CP.x + s.x, CP.z + s.z, s.color, Math.PI / 2, 'stand');
    p.userData = { dir: s.dir, speed: s.speed, z: s.z, phase: Math.random() * TAU };
    streetPeds.push(p);
  }
}

function stUpdatePeds(dt, t){
  for (const p of streetPeds){
    const ud = p.userData;
    p.group.position.x += ud.dir * ud.speed * dt;
    if (p.group.position.x > CP.x + 11.5){ ud.dir = -1; p.group.position.x = CP.x + 11.5; }
    if (p.group.position.x < CP.x - 11.5){ ud.dir = 1; p.group.position.x = CP.x - 11.5; }
    p.group.rotation.y = ud.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    p.group.position.y = Math.abs(Math.sin(t * 4.2 + ud.phase)) * 0.045;
  }
}

/* =========================================================================
   六、总装与每帧更新
   ========================================================================= */
function stBuildStreet(){
  stBuildRoad();
  stBuildSignals();
  stBuildShops();
  stBuildBreakfast();
  stBuildRpVendor();
  stBuildBusStop();
  stBuildShrine();
  stBuildGatekeeper();
  stBuildNetbar();
  stBuildBackdrop();
  stBuildLamps();
  stBuildDecor();
  stBuildCars();
  stBuildPeds();
}

let stWelcomed = false;
let stCrossWasOnRoad = false;
let stCrossGreen = false;
let stCrossAwarded = false;
let stNearMissAt = -999;

function stUpdateStreet(worldDt, t){
  if (state.area !== 'campus') return;

  const sig = stSignalAt(t);

  /* 红绿灯：行人绿灯亮，车就得停；行人红灯亮，车才走。
     两个灯共用一份材质，所以这里改一次，两盏灯一起变。 */
  if (streetSignal){
    streetSignal.redMat.color.setHex(sig.walk ? 0x220808 : 0xff3b30);
    streetSignal.greenMat.color.setHex(sig.walk ? 0x33ff88 : 0x07200f);
  }

  stUpdateCars(worldDt, sig);
  stUpdatePeds(worldDt, t);
  stCheckCrossing(sig);
  stAnimateStreetProps(t);

  /* 开场第一句：只在第一次进入校园时提示。不能放在 build 里 ——
     那时玩家还在开始界面，提示会藏在遮罩后面。
     延后 1.6 秒，让"比赛开始"那条先说完 —— 三条提示同时糊在左上角很吵。 */
  if (!stWelcomed && state.started && !state.ended){
    stWelcomed = true;
    setTimeout(() => {
      if (!state.ended && state.area === 'campus'){
        toast('你在学校对面。过马路走斑马线 —— 红绿灯不等人，考场也不等。', 4200);
      }
    }, 1600);
  }
}

function stAnimateStreetProps(t){
  for (const s of streetSteam){
    const k = (t * 0.55 + s.phase * 0.33) % 1;
    s.mesh.position.y = s.baseY + k * 1.15;
    s.mesh.position.x = s.x + Math.sin(t * 0.9 + s.phase) * 0.10;
    s.mesh.scale.setScalar(0.55 + k * 1.0);
    s.mesh.material.opacity = 0.20 * (1 - k);
  }
  for (const r of streetRibbons){
    r.mesh.rotation.z = Math.sin(t * 1.7 + r.phase) * 0.14;
  }
}

/* ---------------------------- 过马路 ----------------------------
   规则只有三条：
     1) 绿灯走完斑马线 → 成就「红灯停绿灯行」
     2) 红灯横穿 → 成就「鬼探头」（没被撞也算）
     3) 红灯站在车道上，车过来 → 被逼回最近的马路牙子，成就同上
   不给惩罚性扣血。校门口的路不该是"必死关"，它是段氛围。 */
function stCheckCrossing(sig){
  const lz = state.pos.z - CP.z;
  const onRoad = lz > STREET_CURB_Z + 0.15 && lz < STREET_FAR_CURB_Z - 0.15;

  if (onRoad){
    if (!stCrossWasOnRoad){
      stCrossWasOnRoad = true;
      stCrossGreen = sig.walk;
      stCrossAwarded = false;
    }
    if (sig.walk) stCrossGreen = true;

    if (!sig.walk && !stCrossAwarded &&
        state.worldTime - stNearMissAt > 2.5){
      for (const c of streetCars){
        if (Math.abs(c.x - (state.pos.x - CP.x)) < 2.4 &&
            Math.abs(c.lane - lz) < 1.15){
          stNearMiss(lz, c);
          break;
        }
      }
    }
  } else if (stCrossWasOnRoad){
    stCrossWasOnRoad = false;
    if (!stCrossAwarded){
      if (stCrossGreen){
        unlockAch('crosswalk');
        toast('你规规矩矩地等绿灯过了马路。', 2200);
      } else {
        unlockAch('jaywalk');
        toast('你闯了红灯 —— 好在没车。', 2200);
      }
    }
  }
}

function stNearMiss(lz, car){
  stNearMissAt = state.worldTime;
  stCrossAwarded = true;
  unlockAch('jaywalk');

  /* 让那辆车真的停一下：字幕说"急刹"，画面里也得停 */
  if (car){
    car.speed = 0;
    car.brakedUntil = state.worldTime + 1.5;
  }

  /* 推到离你最近的那条人行道上（不是"马路牙子内侧" —— 那还在车道上） */
  const toFar = lz > (STREET_CURB_Z + STREET_FAR_CURB_Z) / 2;
  state.pos.z = CP.z + (toFar ? STREET_FAR_CURB_Z + 0.7 : STREET_CURB_Z - 0.7);
  state.pos.x = clamp(state.pos.x, CP.x - 11.6, CP.x + 11.6);

  audio.beep(640, 0.20, 0.07, 'square');
  setTimeout(() => audio.beep(420, 0.30, 0.06, 'square'), 120);
  toast('一辆车在你面前急刹住，司机探出头骂了一句 —— 你被逼回了路边。', 3200);
}

/* ---------------------------- 交互提示 ----------------------------
   返回空串表示"街上没什么要说的"。campus.js 会把它排在
   "往教学楼走"那条提示前面 —— 站在学校对面还被指路，等于让人穿车流。 */
function stInteractHint(){
  if (state.area !== 'campus') return '';
  const lz = state.pos.z - CP.z;
  const nearCross = Math.abs(state.pos.x - CP.x) < 4.6 &&
                    lz > STREET_CURB_Z - 1.4 && lz < STREET_FAR_CURB_Z + 1.4;
  const sig = stSignalAt(performance.now() * 0.001);

  if (nearCross){
    if (sig.walk){
      return '绿灯 · 走斑马线过马路（还剩 ' + Math.ceil(sig.left) + ' 秒）';
    }
    return '红灯 · 等 ' + Math.ceil(sig.left) + ' 秒再走';
  }
  if (lz > STREET_FAR_CURB_Z) return '穿过斑马线，到马路对面去';
  if (lz > STREET_CURB_Z) return '你站在马路上 —— 快过去';
  return '';
}

/* =========================================================================
   七、钱、买卖与弹窗
   ========================================================================= */
function stCashText(){ return '（你身上有 ¥' + (state.money | 0) + '）'; }

/* 扣钱。钱不够返回 false，不扣。 */
function stPay(price){
  if ((state.money | 0) < price) return false;
  state.money = (state.money | 0) - price;
  const el = $('bagCash');
  if (el) el.textContent = '现金 ¥' + state.money;
  return true;
}

function stAddItem(id, n, label){
  const got = bagAdd(id, n);
  if (!got){ toast('背包里那一样已经满了。', 1600); return false; }
  toast('买下「' + label + '」×' + got + '。', 1700);
  return true;
}

/* ---- 文印店 ---- */
function openPrintShop(){
  dismissDialogs();
  stPrintDialog(null);
}

function stPrintDialog(dlg){
  const PRICE = 2;
  const body = state.paperTicket
    ? '老板头也不抬：「准考证打过了吧？\n要贴纸这边，一块钱一张。」\n' + stCashText()
    : '老板从复印机后面探出头：「打印？准考证？\n两块。有纸质的，安检就不用扫你手机了。」\n' + stCashText();

  const opts = [];
  if (!state.paperTicket){
    opts.push({ label: '打印准考证（¥' + PRICE + '）', cb: d => {
        if (!stPay(PRICE)){
          toast('钱不够 —— 跟老板说说看。', 1600);
          return;
        }
        state.paperTicket = true;
        unlockAch('paperticket');
        audio.beep(1040, 0.09, 0.05);
        toast('老板把还热乎的准考证递给你：「拿着。安检扫纸，不扫手机。」', 3600);
        stPrintDialog(d);
      } });
    if ((state.money | 0) < PRICE){
      opts.push({ label: '「老板，我忘带钱了……」', cb: d => {
          state.paperTicket = true;
          unlockAch('paperticket');
          unlockAch('face');
          toast('老板摆摆手：「先印。你妈上回还来我这儿印卷子呢。」', 3400);
          stPrintDialog(d);
        } });
    }
  } else {
    opts.push({ label: '准考证已经打好了', cb: d => closeDialog(d) });
  }

  if (!state.rpSticker && (state.money | 0) >= 1){
    opts.push({ label: '打印「RP++」贴纸（¥1）', cb: d => {
        if (!stPay(1)){ toast('一块钱都没有了。', 1400); return; }
        state.rpSticker = true;
        unlockAch('rp');
        toast('你把「RP++」贴纸贴在了准考证背面。', 2400);
        stPrintDialog(d);
      } });
  }
  opts.push({ label: '走了', cb: d => closeDialog(d) });

  if (dlg) setDialogContent(dlg, { text: body, options: opts });
  else openDialog({ title: '文 印 · 打 印 复 印', text: body, options: opts });
  audio.beep(760, 0.05, 0.03, 'triangle');
}

/* ---- 小卖部 ---- */
function openStore(){
  dismissDialogs();
  stStoreDialog(null);
}

function stStoreDialog(dlg){
  const body = '老板娘正在看一部很吵的电视剧。\n' +
               '「自己看啊，冰柜里有水。」\n' + stCashText();
  const opts = STORE_STOCK.map(it => ({
    label: it.label + '（¥' + it.price + '）',
    cb: d => {
      if (!stPay(it.price)){
        toast('钱不够，差 ' + (it.price - (state.money | 0)) + ' 块。', 1600);
        return;
      }
      if (!stAddItem(it.id, 1, it.label)){
        state.money = (state.money | 0) + it.price;
        const el = $('bagCash');
        if (el) el.textContent = '现金 ¥' + state.money;
        return;
      }
      unlockAch('shop');
      stStoreDialog(d);
    }
  }));
  opts.push({ label: '不买了', cb: d => closeDialog(d) });

  if (dlg) setDialogContent(dlg, { text: body, options: opts });
  else openDialog({ title: '小 卖 部', text: body, options: opts });
  audio.beep(880, 0.05, 0.03, 'triangle');
}

/* 街边老大爷：一张折叠桌，卖 rp++ 钥匙扣。
   钥匙扣是爷爷线的一击必杀护符 —— 不买也能打，只是要多打很久。 */
function stBuildRpVendor(){
  /* 放在对面人行道上（z > STREET_FAR_CURB_Z），绝不能摆进 15.4–21.6 的车道里 */
  const x = CP.x - 7.5, z = CP.z + 25.0;
  const g = new THREE.Group();
  scene.add(g);

  box(2.2, 0.06, 0.9, 0x6b5137, x, 0.78, z, g, { roughness: 0.85 });
  box(0.07, 0.78, 0.07, 0x2b303b, x - 1.0, 0.39, z + 0.35, g);
  box(0.07, 0.78, 0.07, 0x2b303b, x + 1.0, 0.39, z + 0.35, g);
  box(0.07, 0.78, 0.07, 0x2b303b, x - 1.0, 0.39, z - 0.35, g);
  box(0.07, 0.78, 0.07, 0x2b303b, x + 1.0, 0.39, z - 0.35, g);
  /* 红布 + 一排钥匙扣 */
  box(2.1, 0.015, 0.8, 0x7a1f28, x, 0.815, z, g);
  for (let i = 0; i < 5; i++){
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14),
      mat(0xffd166, { roughness: 0.4, metalness: 0.6 }));
    ring.position.set(x - 0.7 + i * 0.35, 0.86, z + 0.12);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const old = buildPerson(x + 1.5, z + 0.35, 0x5a4a3a, Math.PI, 'stand');
  old.group.scale.set(0.92, 0.94, 0.92);
  /* 白头发/白胡子，和爷爷区分开：这位只是普通老大爷 */
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10),
    mat(0xd8d4c8, { roughness: 1 }));
  hair.position.set(0, 1.56, 0.02);
  old.group.add(hair);
  box(0.20, 0.20, 0.08, 0xe8e2d4, 0, 1.33, 0.13, old.group);

  const board = cpTextBoard(640, 220, [
    { text: 'rp++ 钥匙扣', size: 52, color: '#ffe8a8' },
    { text: '¥6 · 保过 · 保命', size: 26, color: '#ffd166' }
  ], '#241a10', '#c9a24a');
  cpBoard(board, 1.7, 0.6, x, 1.55, z - 0.62, Math.PI);

  const hit = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.2, 1.5),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(x, 1.1, z);
  scene.add(hit);
  campusSpotTargets.push({
    obj: hit, label: 'rp++ 钥匙扣', prompt: '[ E ] 看看老大爷的钥匙扣', fn: openRpVendor
  });
  cpAddObstacle(x, z, 1.2, 0.55);
}

/* ---- 街边老大爷：rp++ 钥匙扣 ---- */
function openRpVendor(){
  dismissDialogs();
  const have = bagCount('rp_keychain') > 0;
  const opts = [];
  if (!have){
    opts.push({ label: '买一个（¥6）', cb: d => {
      if (!stPay(6)){ toast('老大爷摆摆手：「不赊账。」', 1600); return; }
      bagAdd('rp_keychain', 1);
      state.rpCharm = true;
      unlockAch('rp_charm');
      audio.beep(760, 0.12, 0.05, 'triangle');
      toast('老大爷把钥匙扣塞给你：「挂上，保你一拳一个。」（已装备）', 3200);
      setDialogContent(d, {
        text: '老大爷眯起眼：「这玩意儿啊，我年轻时候从洛谷论坛淘来的。」\n' +
              '「你别问它为什么有用，挂上就完事了。」\n\n' +
              'rp++ 钥匙扣已挂在书包上。',
        options: [{ label: '……', cb: d2 => closeDialog(d2) }]
      });
    } });
  } else {
    opts.push({ label: state.rpCharm ? '摘下来（卸下）' : '挂上（装备）', cb: d => {
      toggleRpCharm();
      closeDialog(d);
    } });
  }
  opts.push({ label: '打听一下', cb: d => setDialogContent(d, {
    text: '老大爷压低声音：「你看见考场里那个白胡子老头没有？」\n' +
          '「那是老赵的爷爷。你这钥匙扣，专治他。」\n' +
          '「不过只在挂身上的时候有用 —— 摘了就是个普通钥匙扣。」',
    options: [{ label: '……', cb: d2 => closeDialog(d2) }]
  }) });
  opts.push({ label: '走了', cb: d => closeDialog(d) });

  openDialog({
    title: '街 边 老 大 爷',
    text: '一张折叠桌，红布上摆着几枚塑料钥匙扣。\n' +
          '老大爷戴着旧毡帽，眯着眼看你：「rp++ 钥匙扣，六块。保过，保命。」\n' +
          '「比你在洛谷上刷一晚上管用。」',
    options: opts
  });
  audio.beep(420, 0.06, 0.03, 'square');
}

/* ---- 早餐摊 ---- */
function openBreakfast(){
  dismissDialogs();
  stBreakfastDialog(null);
}

function stBreakfastDialog(dlg){
  const body = '阿姨一边摊饼一边问：「考试的吧？吃点东西再走。」\n' +
               '锅里的水汽糊了她半张脸。\n' +
               '「吃饱了才有力气 —— 我们家的早饭，吃完能多扛两下。」\n' + stCashText();
  const eat = (d, price, what) => {
    if (state.hpMax >= FIVE_HEARTS_MAX){
      toast('阿姨摆摆手：「你已经五颗心了，再吃该走不动了。」', 2000);
      return;
    }
    if (!stPay(price)){ toast('阿姨笑笑：「先欠着吧。」', 1600); return; }
    grantFiveHearts();
    unlockAch('breakfast');
    toast(what + '下肚 —— 你的血量变成五颗心。', 3000);
    stBreakfastDialog(d);
  };
  const opts = [
    { label: '豆浆（¥3）', cb: d => eat(d, 3, '热豆浆') },
    { label: '煎饼果子（¥5）', cb: d => eat(d, 5, '煎饼果子') },
    { label: '茶叶蛋（¥2）', cb: d => eat(d, 2, '茶叶蛋') },
    { label: '不吃了', cb: d => closeDialog(d) }
  ];

  if (dlg) setDialogContent(dlg, { text: body, options: opts });
  else openDialog({ title: '早 点 摊', text: body, options: opts });
  audio.beep(520, 0.05, 0.03, 'triangle');
}

/* ---- 公交站：一条真正的"弃考"分支 ---- */
function openBusStop(){
  dismissDialogs();
  openDialog({
    title: 'K 1 1 4 路 · 公 交 站',
    text: '站牌上写着：K114 路，开往火车站。\n' +
          '电子屏说下一班还有 2 分钟。\n' +
          '上车，这场考试就跟你没关系了；不上，你还得再过一次马路。',
    options: [
      { label: '上车回家（放弃本场考试）', cb: d => {
          closeDialog(d);
          stConfirmGoHome();
        } },
      { label: '再看一眼站牌', cb: d => {
          setDialogContent(d, {
            text: 'K114 路\n首班 5:30 · 末班 22:40\n途经：火车站 · 老城区 · 第 114 中学\n\n' +
                  '你盯着"第 114 中学"四个字看了一会儿。\n' +
                  '车还没来。',
            options: [{ label: '记下了', cb: d2 => closeDialog(d2) }]
          });
        } },
      { label: '还是去考试', cb: d => closeDialog(d) }
    ]
  });
  audio.beep(440, 0.06, 0.03, 'triangle');
}

function stConfirmGoHome(){
  openDialog({
    title: '真 的 要 上 车 吗？',
    text: '车门开着，车里空得能听见发动机的声音。\n' +
          '你想起报名费、想起昨晚背的模板、想起' + EXAM_BUILDING_TAG + '门口那个安检门。\n' +
          '也想起可以明年再来。',
    options: [
      { label: '上车', cb: d => { closeDialog(d); beginGoingHome(); } },
      { label: '不了，去考试', cb: d => closeDialog(d) }
    ]
  });
}

/* ---- 网吧 ---- */
/* ---- 极速网咖 ----
   两条路：穿校服被拦（可以脱掉校服再进），或者已经脱了直接进。
   进去之后「就玩一局」会一局接一局，最后是「包夜」结局。 */
function openNetbar(){
  dismissDialogs();

  if (!state.uniformOff){
    openDialog({
      title: '极 速 网 咖',
      text: '网管从屏幕后面抬头，扫了你一眼：\n' +
            '「未成年人禁止入内。」\n' +
            '他的目光停在你校服胸口的「第 114 中学」上。',
      options: [
        { label: '把校服脱了，塞进书包', cb: d => {
            closeDialog(d);
            state.uniformOff = true;
            unlockAch('uniform_off');
            audio.beep(360, 0.08, 0.04, 'triangle');
            toast('你把校服外套脱下来，塞进书包 —— 里面只剩一件 T 恤。', 3000);
            openNetbar();
          } },
        { label: '「我 18 了。」', cb: d => {
            state.netbarTried = true;
            unlockAch('netbar');
            setDialogContent(d, {
              text: '网管把手一摊：「你校服上还写着第 114 中学。」\n' +
                    '「再说你这时候不去考试，来我这儿干嘛？」\n' +
                    '他把门帘放了下来。',
              options: [{ label: '……', cb: d2 => closeDialog(d2) }]
            });
          } },
        { label: '「考完再来。」', cb: d => {
            state.netbarTried = true;
            closeDialog(d);
            toast('网管点点头：「考完再来，给你留机位。」', 2200);
          } },
        { label: '走了', cb: d => closeDialog(d) }
      ]
    });
    audio.beep(300, 0.06, 0.03, 'square');
    return;
  }

  /* 校服已经脱了：门帘掀开，里面是另一个世界 */
  openDialog({
    title: '极 速 网 咖',
    text: '网管扫了一眼你的 T 恤，又看了看门口：\n' +
          '「没穿校服？行，进去吧。」\n\n' +
          '里面一排屏幕亮着，键盘声像下雨。\n' +
          '墙上的钟指着开考前 ' + Math.max(0, Math.ceil(entryLeft() / 60)) + ' 分钟。',
    options: [
      { label: '开机（¥5）', cb: d => {
          closeDialog(d);
          stPay(5);                    /* 钱不够也让你欠着：这条支线不该被余额卡死 */
          netbarMachine();
        } },
      { label: '进去看看（先不玩）', cb: d => {
          closeDialog(d);
          enterNetbarPre();
        } },
      { label: '把校服穿回去', cb: d => {
          closeDialog(d);
          state.uniformOff = false;
          toast('你把校服穿回去了。网管把门帘放了下来。', 2400);
        } },
      { label: '还是去考试', cb: d => closeDialog(d) }
    ]
  });
  audio.beep(340, 0.07, 0.03, 'square');
}

function netbarMachine(){
  openDialog({
    title: '机 位 3 · 极 速 网 咖',
    text: '屏幕亮起来。桌面上排着一整列游戏图标。\n' +
          '网管在柜台后面喊：「一局 5 块，通宵 20。」\n\n' +
          '你摸了摸兜里的准考证。',
    options: [
      { label: '就玩一局（然后去考试）', cb: d => {
          closeDialog(d);
          netbarOneMore(0);
        } },
      { label: '包夜（不去考试了）', cb: d => {
          closeDialog(d);
          endByNetbar('allnight');
        } },
      { label: '算了，去考试', cb: d => closeDialog(d) }
    ]
  });
  audio.beep(520, 0.08, 0.04, 'triangle');
}

/* "就玩一局"是这场游戏里最大的谎话 */
function netbarOneMore(step){
  if (step >= 3){ endByNetbar('one'); return; }
  const lines = [
    '你开了一局。赢了。\n「再来一局就睡。」',
    '又赢了一局。\n「手感这么好，再来。」',
    '第三局。\n你抬头时，窗外已经黑了。'
  ];
  openDialog({
    title: '一 局',
    text: lines[step] + '\n\n' +
          (step < 2 ? '你看了眼右上角的时间，又移开了视线。' : '手机上有 17 个未接来电。'),
    options: [
      { label: step < 2 ? '再来一局' : '……', cb: d => {
          closeDialog(d);
          netbarOneMore(step + 1);
        } },
      { label: '看一眼时间', cb: d => {
          closeDialog(d);
          endByNetbar('one');
        } }
    ]
  });
}

/* ---- 文曲星 ---- */
function prayToWenqu(){
  dismissDialogs();
  if (state.prayed){
    openDialog({
      title: '文 曲 星',
      text: '你又站到像前。香还燃着，许愿带在风里轻轻响。\n' +
            '该做的都做了 —— 剩下的在键盘上。',
      options: [{ label: '走了', cb: d => closeDialog(d) }]
    });
    return;
  }
  openDialog({
    title: '文 曲 星',
    text: '校门旁边有个小小的文曲星像，香炉里插着三炷香。\n' +
          '许愿带上密密麻麻写着名字和「RP++」。\n' +
          '你不太信这个，但你现在站在这儿。',
    options: [
      { label: '拜三下', cb: d => {
          closeDialog(d);
          state.prayed = true;
          unlockAch('pray');
          audio.beep(720, 0.12, 0.04, 'sine');
          setTimeout(() => audio.beep(960, 0.16, 0.03, 'sine'), 120);
          toast('你拜了三下。风把许愿带吹得哗啦响。', 2600);
        } },
      { label: '在许愿牌上写「AK」', cb: d => {
          closeDialog(d);
          state.prayed = true;
          unlockAch('pray');
          toast('你写下「AK」两个字。旁边还有人写「T1 别挂」。', 2800);
        } },
      { label: '走了', cb: d => closeDialog(d) }
    ]
  });
}

/* ---- 门卫老赵 ---- */
function talkToGatekeeper(rec){
  const v = rec.data;
  dismissDialogs();

  if (state.knowsSideDoor){
    openDialog({
      title: v.name,
      text: '老赵从窗口探出头：「员工通道？我什么都没说过啊。」\n' +
            '他冲你挤了挤眼，又缩回去看他的报纸。',
      options: [{ label: '谢谢叔', cb: d => closeDialog(d) }]
    });
    return;
  }

  openDialog({
    title: v.name,
    text: '老赵从门卫室的窗口探出头，手里端着搪瓷杯。\n' +
          '「CSP 的吧？' + EXAM_BUILDING_TAG + '，' + EXAM_CLASSROOM + '。\n' +
          '　准考证打了没？马路对面文印店，两块。」',
    options: [
      { label: '「叔，东边那个员工通道能走吗？」', cb: d => {
          closeDialog(d);
          state.knowsSideDoor = true;
          unlockAch('oldhand');
          openDialog({
            title: '门卫 · 老赵',
            text: '老赵往两边看了看，压低声音：\n' +
                  '「那门锁早坏了，年年说修。\n' +
                  '　你从东墙外一直往北走，走到头就是。\n' +
                  '　别让人看见 —— 我什么都没说。」',
            options: [{ label: '记下了', cb: d2 => closeDialog(d2) }]
          });
        } },
      { label: '「准考证还没打……」', cb: d => {
          closeDialog(d);
          toast('老赵往马路对面一指：「文印店，两块。别磨蹭。」', 2600);
        } },
      { label: '谢谢叔', cb: d => closeDialog(d) }
    ]
  });
  audio.beep(420, 0.06, 0.03, 'triangle');
}

/* =========================================================================
   八、小地图标记
   ---------------------------------------------------------------------
   画布和坐标变换函数都由 player.js 传进来：这里只负责"街上有什么"。
   这样 player.js 不用反过来引用 street.js 里的 const（那会踩加载期 TDZ）。
   ========================================================================= */
function stMinimapMarks(ctx, tx, ty, sx, sy){
  /* 马路 */
  ctx.fillStyle = 'rgba(30,34,42,.95)';
  ctx.fillRect(tx(-13), ty(STREET_CURB_Z), 26 * sx, (STREET_FAR_CURB_Z - STREET_CURB_Z) * sy);
  /* 斑马线 */
  ctx.fillStyle = 'rgba(230,235,243,.40)';
  for (let z = STREET_CURB_Z + 0.45; z < STREET_FAR_CURB_Z - 0.25; z += 1.0){
    ctx.fillRect(tx(-STREET_CROSS_HALF_W), ty(z), STREET_CROSS_HALF_W * 2 * sx, 0.46 * sy);
  }
  /* 校门：一条横线，和地图上教学楼那条蓝线呼应 */
  ctx.strokeStyle = 'rgba(91,140,255,.9)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx(-5.2), ty(CAMPUS_GATE_Z));
  ctx.lineTo(tx(5.2), ty(CAMPUS_GATE_Z));
  ctx.stroke();
}

/* 地标点：在 obstacles 之后画，否则会被店铺的灰色方块盖住 */
function stMinimapDots(ctx, tx, ty){
  const mark = (wx, wz, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(tx(wx), ty(wz), r, 0, TAU); ctx.fill();
  };
  mark(STREET_SHOPS.print.x, STREET_SHOPS.print.z, '#5b8cff', 3.0);
  mark(STREET_SHOPS.store.x, STREET_SHOPS.store.z, '#8fd06a', 3.0);
  mark(-3.6, 13.0, '#ffb04a', 2.8);       /* 早餐摊 */
  mark(GATEKEEPER.x, GATEKEEPER.z, '#d8dde5', 2.6);  /* 门卫 */
  mark(3.9, 9.6, '#ffd479', 2.4);         /* 文曲星 */
  mark(6.6, 22.9, '#e8e2b0', 3.0);        /* 公交站 */
  mark(10.4, 26.3, '#ff8ad8', 2.6);       /* 网吧 */
  /* 红绿灯：跟着真实时间变色 */
  const sig = stSignalAt(performance.now() * 0.001);
  mark(-3.9, STREET_CURB_Z - 0.35, sig.walk ? '#33ff88' : '#ff3b30', 2.0);
}
