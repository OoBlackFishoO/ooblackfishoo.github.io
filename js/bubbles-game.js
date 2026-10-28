/* ============================================================
   bubbles-game.js —— 内置小游戏《黏土泡泡》
   玩法：泡泡会掉下来（也能关掉重力让它们飘着），点爆它们得分
   物理：matter.js；画面：手绘黏土质感（Canvas 2D 自绘）
   ============================================================ */
(function () {
  "use strict";

  var wrap = document.getElementById("game-wrap");
  if (!wrap) return;

  var canvas = document.getElementById("game-canvas");
  var scoreEl = document.getElementById("score");
  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var { Engine, World, Bodies, Body, Composite, Query } = Matter;

  var engine, balls = [], particles = [], walls = [];
  var W = 0, H = 420, score = 0, zeroG = false;
  var GRAV = 1;                 /* 下落速度 */
  var MAX_BALLS = 24;           /* 常驻泡泡上限；每点爆一颗大泡泡 +5 */
  var BASE_MAX = MAX_BALLS;
  var MAX_LIMIT = 80;           /* 上限增长的天花板，避免无尽模式后期太挤 */
  var CLUSTER_N = 15;           /* 大泡泡炸开的小泡泡数量 */
  var CLUSTER_MAX = MAX_BALLS + CLUSTER_N;   /* 炸开瞬间的临时上限，保证一波都放得下 */
  var GIANT_EVERY = 100;        /* 平时：每 100 分一颗超大泡泡 */
  var HIDDEN_EVERY = 25;        /* 隐藏模式：每 25 分一颗（只在本局生效） */
  var HIDDEN_AT = 100;          /* 到 100 分进入隐藏模式；重开或刷新就关掉 */
  var CLEAR_AT = 500;           /* 通关线 */
  var hidden = false;
  var nextGiant = GIANT_EVERY;
  var celebrating = false, celebrated = false;
  var PASTEL = [
    { f: "#FF9A6E", d: "#E86F44", h: "#FFD3BE" },
    { f: "#FFDD88", d: "#E8B84F", h: "#FFF3CE" },
    { f: "#8FE0B4", d: "#57B383", h: "#D3F5E2" },
    { f: "#A6DAF4", d: "#6FB4D8", h: "#DDF1FC" },
    { f: "#D2C2F2", d: "#A690D8", h: "#EDE5FA" },
    { f: "#FFBCCE", d: "#E58BA5", h: "#FFE4EC" }
  ];

  /* ---------- 初始化 ---------- */
  engine = Engine.create();
  engine.gravity.y = GRAV;

  function setup() {
    W = wrap.clientWidth;
    H = W < 520 ? 340 : 420;
    var dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (walls.length) Composite.remove(engine.world, walls);
    var opt = { isStatic: true, restitution: 0.6 };
    walls = [
      Bodies.rectangle(W / 2, H + 40, W + 200, 80, opt),      /* 地板 */
      Bodies.rectangle(-40, H / 2, 80, H * 3, opt),           /* 左墙 */
      Bodies.rectangle(W + 40, H / 2, 80, H * 3, opt)         /* 右墙 */
    ];
    Composite.add(engine.world, walls);
  }

  function spawnBall() {
    if (balls.length >= MAX_BALLS) return;
    var r = 16 + Math.random() * 15;
    var x = r + Math.random() * (W - r * 2);
    /* 失重时直接生成在画面里（顶部生成会永远飘不进来） */
    var y = zeroG ? r + 20 + Math.random() * (H - r * 2 - 40) : -r - 10;
    var b = Bodies.circle(x, y, r, {
      restitution: 0.82,
      friction: 0.001,
      frictionAir: 0.008,
      density: 0.0012
    });
    if (zeroG) {
      Body.setVelocity(b, { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 });
    }
    b.clay = PASTEL[Math.floor(Math.random() * PASTEL.length)];
    b.born = performance.now();
    balls.push(b);
    Composite.add(engine.world, b);
  }

  /* ---------- 超大泡泡：每 100 分掉一颗，戳爆炸出一窝小的 ---------- */
  function spawnGiant() {
    var r = 100;
    var x = r + 16 + Math.random() * Math.max(10, W - r * 2 - 32);
    var y = zeroG ? r + 30 + Math.random() * Math.max(10, H - r * 2 - 60) : -r - 16;
    var b = Bodies.circle(x, y, r, {
      restitution: 0.7,
      friction: 0.001,
      frictionAir: 0.012,        /* 比小泡泡飘一点，落得慢，好瞄准 */
      density: 0.0012
    });
    b.giant = true;
    b.clay = PASTEL[Math.floor(Math.random() * PASTEL.length)];
    b.born = performance.now();
    if (zeroG) Body.setVelocity(b, { x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * 1.6 });
    balls.push(b);
    Composite.add(engine.world, b);
  }

  function spawnCluster(x, y, n) {
    for (var i = 0; i < n && balls.length < CLUSTER_MAX; i++) {
      var r = 18 + Math.random() * 8;
      var a = Math.random() * Math.PI * 2;
      var d = Math.random() * 26;
      var b = Bodies.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r, {
        restitution: 0.86,
        friction: 0.001,
        frictionAir: 0.006,
        density: 0.0012
      });
      b.clay = PASTEL[Math.floor(Math.random() * PASTEL.length)];
      b.born = performance.now();
      balls.push(b);
      Composite.add(engine.world, b);
      var sp = 4 + Math.random() * 5;
      Body.setVelocity(b, { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 2 });
    }
  }

  /* 到了分数线就放一颗；场上已经有超大泡泡就等它被戳掉，不叠着刷 */
  function maybeGiant() {
    if (score < nextGiant) return;
    for (var i = 0; i < balls.length; i++) if (balls[i].giant) return;
    nextGiant += GIANT_EVERY;
    spawnGiant();
  }

  /* ---------- 爆裂粒子 ---------- */
  function popParticles(x, y, color, n) {
    if (reduceMotion) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 2 + Math.random() * 4;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        r: 3 + Math.random() * 5,
        life: 1, color: color
      });
    }
  }

  /* ---------- 点爆 / 按住扫爆 ---------- */
  function hitBall(x, y, pad) {
    pad = pad || 0;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      var dx = b.position.x - x, dy = b.position.y - y;
      var rr = b.circleRadius + pad;
      if (dx * dx + dy * dy <= rr * rr) return b;
    }
    return null;
  }
  /* ---------- 100 分：进入隐藏模式（本局有效） ---------- */
  function enterHidden() {
    if (hidden) return;
    hidden = true;
    /* 不动 nextGiant：第 100 分这颗照常掉，之后的间隔变成 35 */
    GIANT_EVERY = HIDDEN_EVERY;
  }

  /* ---------- 500 分：全屏撒花 + 通关提示，继续无尽模式 ---------- */
  function celebrate() {
    if (celebrating || celebrated) return;
    celebrating = true;
    celebrated = true;

    var layer = document.createElement("div");
    layer.className = "clear-layer";
    var txt = document.createElement("div");
    txt.className = "clear-txt";
    txt.textContent = "🎉 通关啦！";
    layer.appendChild(txt);

    if (!reduceMotion) {
      for (var i = 0; i < 64; i++) {
        var p = document.createElement("span");
        p.className = "confetti";
        p.style.left = (Math.random() * 100) + "vw";
        p.style.background = PASTEL[i % PASTEL.length].f;
        p.style.width = (6 + Math.random() * 7) + "px";
        p.style.height = (9 + Math.random() * 9) + "px";
        layer.appendChild(p);
        p.animate([
          { transform: "translate3d(0,-10vh,0) rotate(0deg)", opacity: 1 },
          { transform: "translate3d(" + ((Math.random() - 0.5) * 260) + "px," + (window.innerHeight + 40) + "px,0) rotate(" + ((Math.random() - 0.5) * 720) + "deg)", opacity: .95 }
        ], {
          duration: 1200 + Math.random() * 600,
          easing: "cubic-bezier(.2,.7,.4,1)",
          fill: "forwards"
        });
      }
    }

    document.body.appendChild(layer);
    setTimeout(function () { layer.classList.add("out"); }, 2000);   /* 多留一秒再淡出 */
    setTimeout(function () {
      layer.remove();
      celebrating = false;
    }, 2500);
  }

  /* 超大泡泡炸开时轻轻震一下画布 */
  function shakeCanvas() {
    if (reduceMotion || !canvas.animate) return;
    canvas.animate([
      { transform: "translate(0,0)" },
      { transform: "translate(-3px,2px)" },
      { transform: "translate(3px,-2px)" },
      { transform: "translate(-2px,-1px)" },
      { transform: "translate(0,0)" }
    ], { duration: 220, easing: "ease-out" });
  }
  function burstBall(b) {
    Composite.remove(engine.world, b);
    balls = balls.filter(function (o) { return o !== b; });
    score++;
    scoreEl.textContent = "得分 " + score;
    scoreEl.classList.remove("bump");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("bump");
    popParticles(b.position.x, b.position.y, b.clay.f, b.giant ? 18 : 10);
    if (b.giant) {
      /* 屏幕泡泡上限跟着涨 5，并把炸开这一波的空间留足 */
      MAX_BALLS = Math.min(MAX_LIMIT, MAX_BALLS + 5);
      CLUSTER_MAX = MAX_BALLS + CLUSTER_N;
      spawnCluster(b.position.x, b.position.y, CLUSTER_N);
      shakeCanvas();
    }
    if (!hidden && score >= HIDDEN_AT) enterHidden();
    maybeGiant();
    if (score >= CLEAR_AT) celebrate();
  }
  function popAt(x, y) {
    var b = hitBall(x, y, 6);          /* 手稍微偏一点也算中 */
    if (b) burstBall(b);
    else popParticles(x, y, "#FFFFFF", 4);   /* 点空了也有一点反馈 */
  }

  /* 左键按住划过：沿轨迹每 8px 采样，甩得再快也不会从泡泡缝里漏过去 */
  var dragging = false, lastPt = null;
  function sweepTo(x, y) {
    var from = lastPt || { x: x, y: y };
    var dx = x - from.x, dy = y - from.y;
    var steps = Math.max(1, Math.min(80, Math.ceil(Math.hypot(dx, dy) / 8)));
    for (var s = 1; s <= steps; s++) {
      var b = hitBall(from.x + dx * s / steps, from.y + dy * s / steps, 8);
      if (b) burstBall(b);      /* 大泡泡也会被扫爆 */
    }
    lastPt = { x: x, y: y };
  }
  function canvasPt(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function endDrag() { dragging = false; lastPt = null; }

  canvas.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;   /* 只认左键 */
    dragging = true;
    lastPt = canvasPt(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    popAt(lastPt.x, lastPt.y);
    e.preventDefault();
  });

  canvas.addEventListener("pointermove", function (e) {
    var p = canvasPt(e);
    if (dragging) { sweepTo(p.x, p.y); canvas.style.cursor = "pointer"; return; }
    canvas.style.cursor = hitBall(p.x, p.y, 4) ? "pointer" : "default";
  });

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  window.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointerleave", function () {
    if (!dragging) canvas.style.cursor = "default";
  });

  /* ---------- 按钮 ---------- */
  document.getElementById("btn-gravity").addEventListener("click", function () {
    zeroG = !zeroG;
    engine.gravity.y = zeroG ? 0 : GRAV;
    this.textContent = zeroG ? "🌍 开启重力" : "🚀 关闭重力";
    if (zeroG) {
      balls.forEach(function (b) {
        Body.setVelocity(b, { x: b.velocity.x * 0.4, y: -2 - Math.random() * 2 });
      });
    }
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    balls.forEach(function (b) { Composite.remove(engine.world, b); });
    balls = [];
    particles = [];
    score = 0;
    hidden = false;
    GIANT_EVERY = 100;
    nextGiant = GIANT_EVERY;
    MAX_BALLS = BASE_MAX;
    CLUSTER_MAX = MAX_BALLS + CLUSTER_N;
    celebrating = false;
    celebrated = false;
    scoreEl.textContent = "得分 0";
  });

  /* ---------- 黏土泡泡自绘 ---------- */
  function drawBall(b) {
    var r = b.circleRadius;
    var v = b.velocity;
    var sp = Math.min(Math.hypot(v.x, v.y) * 0.022, 0.22);
    var ang = Math.atan2(v.y, v.x);
    var grow = 1;                          /* 刚出生时从小长大 */
    var age = (performance.now() - b.born) / 260;
    if (age < 1) grow = 0.4 + 0.6 * (1 - Math.pow(1 - age, 3));

    ctx.save();
    ctx.translate(b.position.x, b.position.y);

    /* 落影 */
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#5D3F2B";
    ctx.beginPath();
    ctx.ellipse(3, 5, r * grow, r * grow * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* 本体（沿速度方向轻微压扁 → 果冻感） */
    ctx.rotate(ang);
    ctx.scale((1 + sp) * grow, (1 - sp) * grow);
    ctx.rotate(-ang);
    ctx.fillStyle = b.clay.f;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    /* 内阴影（右下弧） */
    ctx.strokeStyle = b.clay.d;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    /* 高光（左上小椭圆） */
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = b.clay.h;
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.36, r * 0.3, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();

    /* 呆萌小眼睛 */
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#45392F";
    var er = Math.max(r * 0.1, 1.8);
    ctx.beginPath();
    ctx.arc(-r * 0.18, -r * 0.05, er, 0, Math.PI * 2);
    ctx.arc(r * 0.22, -r * 0.05, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 主循环 ---------- */
  var lastSpawn = 0;
  function tick(ts) {
    requestAnimationFrame(tick);

    if (ts - lastSpawn > 600) {
      lastSpawn = ts;
      spawnBall();
    }

    Engine.update(engine, 1000 / 60);

    if (zeroG) {
      balls.forEach(function (b) {        /* 失重：随机漂 + 软边界轻轻推回画面内 */
        var m = 0.00005 * b.mass;
        var p = b.position, br = b.circleRadius;
        if (p.x < br + 10) Body.applyForce(b, p, { x: m, y: 0 });
        if (p.x > W - br - 10) Body.applyForce(b, p, { x: -m, y: 0 });
        if (p.y < br + 10) Body.applyForce(b, p, { x: 0, y: m });
        if (p.y > H - br - 10) Body.applyForce(b, p, { x: 0, y: -m });
        if (Math.random() < 0.04) {
          Body.applyForce(b, p, {
            x: (Math.random() - 0.5) * 4 * m,
            y: (Math.random() - 0.5) * 4 * m
          });
        }
        Body.setVelocity(b, { x: b.velocity.x * 0.999, y: b.velocity.y * 0.999 });
      });
    }

    ctx.clearRect(0, 0, W, H);
    balls.forEach(drawBall);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= 0.024;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  setup();
  window.addEventListener("resize", function () {
    setup();
  });
  for (var i = 0; i < 5; i++) spawnBall();   /* 开局就有几颗 */
  requestAnimationFrame(tick);

  /* 调试句柄：控制台里可用 __bubbles.balls 查看泡泡 */
  window.__bubbles = {
    get engine() { return engine; },
    get balls() { return balls.map(function (b) { return { x: Math.round(b.position.x), y: Math.round(b.position.y), r: Math.round(b.circleRadius), giant: !!b.giant }; }); },
    get nextGiant() { return nextGiant; },
    get giantEvery() { return GIANT_EVERY; },
    get maxBalls() { return MAX_BALLS; },
    get clusterMax() { return CLUSTER_MAX; },
    get hidden() { return hidden; },
    setThreshold: function (n) { nextGiant = Math.max(0, Number(n) || 0); },
    setScore: function (n) { score = Math.max(0, Number(n) || 0); scoreEl.textContent = "得分 " + score; }
  };
})();
