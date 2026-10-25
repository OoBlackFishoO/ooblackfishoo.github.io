/* ============================================================
   fish3d.js —— 首页 3D 黏土小黑鱼
   用一堆球体"捏"出来的黏土鱼：可拖拽旋转、可戳（Q弹+吐泡泡）
   依赖：libs/three.module.min.js（已下载到本地，无需联网）
   ============================================================ */
import * as THREE from "../libs/three.module.min.js";

window.__fish3d_ok = true; /* 供 HTML 内的后备检测使用 */

(function () {
  "use strict";

  var stage = document.getElementById("hero-stage");
  var canvas = document.getElementById("fish-canvas");
  var sayEl = document.querySelector(".fish-say");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PHRASES = ["咕噜咕噜~", "别戳啦！", "嘿嘿嘿", "我今天好看吗？", "再戳就吐泡泡了！", "fish!"];

  var renderer, scene, camera, rig, fish, tail, finL, finR, bubbles = [], burstPool = [];
  var clock = new THREE.Clock();
  var running = true, visible = true;
  var dragging = false, moved = 0, lastX = 0, lastY = 0, spinV = 0, downTime = 0;

  /* Q弹弹簧：q 被戳一下获得冲量，随后阻尼振荡回 0 */
  var q = 0, qv = 0;

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    camera.position.set(0, 1.15, 8.4);
    camera.lookAt(0, -0.15, 0);

    /* 柔和的"摄影棚"灯光 */
    scene.add(new THREE.HemisphereLight(0xfff8ec, 0xd9c2a8, 1.15));
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    var key = new THREE.DirectionalLight(0xffe9d2, 2.1);
    key.position.set(4, 6.5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    scene.add(key);

    buildFish();
    buildPedestal();
    buildBubbles();

    bindEvents();
    resize();
    new ResizeObserver(resize).observe(stage);
    loop();
  }

  /* ---------- 黏土材质 ---------- */
  function clay(color) {
    return new THREE.MeshPhysicalMaterial({
      color: color,
      roughness: 0.62,
      metalness: 0,
      sheen: 0.55,
      sheenColor: 0xffffff,
      sheenRoughness: 0.9,
      clearcoat: 0.08,
      clearcoatRoughness: 0.6
    });
  }

  function ball(r, color, sx, sy, sz) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 40), clay(color));
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    return m;
  }

  /* ---------- 捏鱼：鱼头朝右 ---------- */
  function buildFish() {
    rig = new THREE.Group();          /* 拖拽旋转作用在这层 */
    fish = new THREE.Group();         /* Q弹缩放作用在这层 */
    rig.add(fish);
    scene.add(rig);

    var BODY = 0x3e3a37;   /* 炭黑鱼身 */
    var BELLY = 0xfff3e2;  /* 奶白肚皮 */
    var FIN = 0xff8a5e;    /* 珊瑚橙鱼鳍 */
    var CHEEK = 0xffa8a0;  /* 粉腮红 */

    fish.add(ball(1.32, BODY, 1.26, 1.0, 0.98));               /* 身体 */
    var belly = ball(1.18, BELLY, 0.92, 0.68, 0.64);           /* 白肚皮：从下巴鼓出来 */
    belly.position.set(0.22, -0.7, 0);
    fish.add(belly);

    tail = ball(0.62, FIN, 0.55, 0.9, 0.3);                    /* 尾巴 */
    tail.position.set(-1.72, 0.02, 0);
    tail.rotation.z = 0.25;
    fish.add(tail);

    var dorsal = ball(0.55, FIN, 0.55, 0.62, 0.24);            /* 背鳍 */
    dorsal.position.set(-0.1, 1.06, 0);
    dorsal.rotation.z = -0.35;
    fish.add(dorsal);

    finL = ball(0.42, FIN, 0.7, 0.85, 0.32);                   /* 两侧鱼鳍 */
    finL.position.set(0.1, -0.32, 0.95);
    finL.rotation.y = 0.5;
    fish.add(finL);
    finR = finL.clone();
    finR.position.z = -0.95;
    finR.rotation.y = -0.5;
    fish.add(finR);

    /* 大眼睛（学 logo 的卡通风）—— 位置贴着椭球表面，向外鼓 */
    [1, -1].forEach(function (s) {
      var white = ball(0.34, 0xfffdf6, 1, 1.06, 0.82);
      white.position.set(0.5, 0.46, s * 1.04);
      fish.add(white);
      var pupil = ball(0.155, 0x2b2724, 1, 1, 0.9);
      pupil.position.set(0.62, 0.5, s * 1.27);
      fish.add(pupil);
      var glint = ball(0.05, 0xffffff, 1, 1, 1);
      glint.position.set(0.7, 0.6, s * 1.31);
      fish.add(glint);
      var cheek = ball(0.18, CHEEK, 1, 0.7, 0.5);             /* 腮红 */
      cheek.position.set(0.72, -0.02, s * 1.12);
      fish.add(cheek);
    });

    var lip = ball(0.13, 0x2b2724, 1, 0.72, 1);               /* 小嘴 */
    lip.position.set(1.6, 0.05, 0);
    fish.add(lip);

    rig.rotation.y = -0.35;   /* 初始微微侧身面向访客 */
  }

  function buildPedestal() {
    var base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.85, 2.0, 0.42, 48),
      clay(0xf3ddba)
    );
    base.position.y = -2.02;
    base.receiveShadow = true;
    scene.add(base);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 40),
      new THREE.ShadowMaterial({ opacity: 0.16 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.79;
    shadow.receiveShadow = true;
    scene.add(shadow);
  }

  /* ---------- 环境泡泡 ---------- */
  var PASTEL = [0xffd97e, 0x9ed4f2, 0xffb3c7, 0x7fd8ac, 0xc9b6f0];

  function buildBubbles() {
    for (var i = 0; i < 11; i++) {
      var r = 0.07 + Math.random() * 0.1;
      var b = ball(r, PASTEL[i % PASTEL.length], 1, 1, 1);
      b.castShadow = false;
      b.userData = {
        speed: 0.25 + Math.random() * 0.3,
        wob: Math.random() * Math.PI * 2,
        x0: (Math.random() - 0.5) * 5
      };
      b.position.set(b.userData.x0, -1.6 + Math.random() * 4, -1.5 + Math.random());
      scene.add(b);
      bubbles.push(b);
    }
  }

  /* ---------- 戳一下迸出的泡泡 ---------- */
  function spawnBurst(x, y, z, n) {
    for (var i = 0; i < n; i++) {
      var b = ball(0.09 + Math.random() * 0.08, PASTEL[i % PASTEL.length], 1, 1, 1);
      b.position.set(x, y, z);
      b.userData = {
        life: 1,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 1.5 + Math.random() * 2.4,
        vz: (Math.random() - 0.5) * 2
      };
      scene.add(b);
      burstPool.push(b);
    }
  }

  /* ---------- 交互 ---------- */
  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();

  function bindEvents() {
    /* pan-y：手机上竖向滑动交给页面滚动，横向拖动用来转鱼 */
    canvas.style.touchAction = "pan-y";

    canvas.addEventListener("pointerdown", function (e) {
      dragging = true;
      moved = 0;
      downTime = performance.now();
      lastX = e.clientX;
      lastY = e.clientY;
      spinV = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 部分浏览器不支持 */ }
    });

    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      rig.rotation.y += dx * 0.011;
      spinV = dx * 0.011;
      rig.rotation.x = Math.max(-0.5, Math.min(0.5, rig.rotation.x + dy * 0.007));
      if (reduceMotion) dirty = true;   /* 静态模式：拖拽后重绘 */
    });

    ["pointerup", "pointercancel"].forEach(function (ev) {
      canvas.addEventListener(ev, function (e) {
        dragging = false;
        var quick = performance.now() - downTime < 420;
        if (ev === "pointerup" && quick && moved < 7) poke(e);
      });
    });

    /* 只有射线真的打在鱼身上才算"戳到"，点空白处不触发 */
    function poke(e) {
      var r = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(fish.children, true);
      if (!hits.length) return;
      if (!reduceMotion) {                     /* 静态模式不做 Q 弹和迸泡 */
        qv -= 9;                                /* 弹簧冲量 */
        spawnBurst(hits[0].point.x, hits[0].point.y, hits[0].point.z, 6);
      }
      say(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    }
  }

  var sayTimer = null;
  function say(text) {
    if (!sayEl) return;
    sayEl.textContent = text;
    sayEl.classList.add("show");
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { sayEl.classList.remove("show"); }, 1300);
  }

  /* ---------- 主循环 ---------- */
  var t = 0;
  var dirty = true;   /* 减少动态模式下只在有变化时重绘一帧 */
  function loop() {
    requestAnimationFrame(loop);
    if (!running || !visible) return;

    /* 减少动态：不做任何自主动画，只在拖拽/尺寸变化后重绘静态一帧 */
    if (reduceMotion) {
      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
      return;
    }

    var dt = Math.min(clock.getDelta(), 0.05);
    t += dt;

    /* 待机漂浮 */
    fish.position.y = Math.sin(t * 1.15) * 0.13;
    fish.rotation.z = Math.sin(t * 0.7) * 0.05;
    tail.rotation.y = Math.sin(t * 3.2) * 0.35;
    finL.rotation.z = Math.sin(t * 2.6) * 0.4 - 0.15;
    finR.rotation.z = -Math.sin(t * 2.6) * 0.4 + 0.15;

    /* 惯性旋转 */
    if (!dragging) {
      rig.rotation.y += spinV;
      spinV *= 0.93;
    }

    /* Q弹弹簧 */
    var k = 150, c = 9;
    qv += (-k * q - c * qv) * dt;
    q += qv * dt;
    fish.scale.set(1 + q * 0.26, 1 - q * 0.34, 1 + q * 0.26);

    /* 环境泡泡上升 */
    bubbles.forEach(function (b) {
      b.position.y += b.userData.speed * dt;
      b.position.x = b.userData.x0 + Math.sin(t * 1.6 + b.userData.wob) * 0.3;
      if (b.position.y > 2.6) b.position.y = -1.7;
    });

    /* 迸出泡泡 */
    for (var i = burstPool.length - 1; i >= 0; i--) {
      var p = burstPool[i];
      var u = p.userData;
      u.life -= dt * 1.1;
      u.vy -= 2.6 * dt;
      p.position.x += u.vx * dt;
      p.position.y += u.vy * dt;
      p.position.z += u.vz * dt;
      var s = Math.max(u.life, 0.001);
      p.scale.setScalar(s);
      if (u.life <= 0) {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        burstPool.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  }

  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  /* 不在视口 / 标签页后台时暂停，省电（减少动态由 loop 内部分支处理） */
  new IntersectionObserver(function (en) {
    visible = en[0].isIntersecting;
  }, { threshold: 0.02 }).observe(stage);

  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
  });

  try {
    init();
  } catch (err) {
    fallback();
  }

  function fallback() {
    stage.classList.add("no3d");
    var f = document.createElement("div");
    f.className = "fish-fallback";
    f.textContent = "🐟";
    f.addEventListener("click", function () {
      f.classList.remove("squish");
      void f.offsetWidth;
      f.classList.add("squish");
      say("咕噜咕噜~");
    });
    stage.appendChild(f);
  }
})();
