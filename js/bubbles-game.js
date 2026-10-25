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
  engine.gravity.y = 1.1;

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
    if (balls.length >= 24) return;
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

  /* ---------- 点爆 ---------- */
  function popAt(x, y) {
    var hits = Query.point(balls, { x: x, y: y });
    if (hits.length) {
      var b = hits[0];
      Composite.remove(engine.world, b);
      balls = balls.filter(function (o) { return o !== b; });
      score++;
      scoreEl.textContent = "得分 " + score;
      scoreEl.classList.remove("bump");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("bump");
      popParticles(b.position.x, b.position.y, b.clay.f, 10);
    } else {
      popParticles(x, y, "#FFFFFF", 4);   /* 点空了也有一点反馈 */
    }
  }

  canvas.addEventListener("pointerdown", function (e) {
    var r = canvas.getBoundingClientRect();
    popAt(e.clientX - r.left, e.clientY - r.top);
  });

  canvas.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    var hit = Query.point(balls, { x: e.clientX - r.left, y: e.clientY - r.top }).length;
    canvas.style.cursor = hit ? "pointer" : "default";
  });

  /* ---------- 按钮 ---------- */
  document.getElementById("btn-gravity").addEventListener("click", function () {
    zeroG = !zeroG;
    engine.gravity.y = zeroG ? 0 : 1.1;
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

    if (ts - lastSpawn > 850) {
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
    get balls() { return balls.map(function (b) { return { x: Math.round(b.position.x), y: Math.round(b.position.y), r: Math.round(b.circleRadius) }; }); }
  };
})();
