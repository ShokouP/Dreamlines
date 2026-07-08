/* CardForge — 梦雾与淡彩粒子
 * 漂浮雾层（若隐若现）+ 状态驱动淡彩粒子（低血 / 特殊 buff）。
 * 风格延续梦核：极简、低饱和、缓慢。
 */
(function () {
  let canvas, ctx, raf, w, h, dpr;
  const fog = [];       // drifting mist blobs
  const particles = []; // pastel motes
  let lastSpawn = 0;

  // Pastel palette — faintly colored, dreamcore
  const PASTELS = [
    'rgba(255, 160, 180, A)', // soft rose (光脚 / 危险)
    'rgba(180, 200, 255, A)', // soft blue (念力 / 挡住)
    'rgba(255, 230, 170, A)', // soft amber (发烧)
    'rgba(210, 255, 220, A)', // soft mint (打盹 / 回暖)
  ];

  function init() {
    canvas = document.createElement('canvas');
    canvas.id = 'dream-fx';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    seedFog();
    // setInterval is robust to background-tab / preview rAF throttling.
    setInterval(loop, 33);
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
  }

  function seedFog() {
    fog.length = 0;
    for (let i = 0; i < 5; i++) {
      fog.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: (0.25 + Math.random() * 0.3) * Math.min(w, h),
        vx: (Math.random() - 0.5) * 0.15 * dpr,
        vy: (Math.random() - 0.5) * 0.1 * dpr,
        a: 0.025 + Math.random() * 0.03,
        hue: Math.random() < 0.7 ? 255 : 0, // mostly white, occasional red tint
      });
    }
  }

  function drawFog() {
    for (const b of fog) {
      b.x += b.vx; b.y += b.vy;
      if (b.x < -b.r) b.x = w + b.r; if (b.x > w + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = h + b.r; if (b.y > h + b.r) b.y = -b.r;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      const col = b.hue === 0 ? '233,69,96' : '255,255,255';
      g.addColorStop(0, `rgba(${col},${b.a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
  }

  function spawn(x, y, color) {
    particles.push({
      x: x * dpr, y: y * dpr,
      vx: (Math.random() - 0.5) * 0.4 * dpr,
      vy: (-0.2 - Math.random() * 0.4) * dpr,
      r: (1 + Math.random() * 2) * dpr,
      life: 0,
      max: 120 + Math.random() * 80,
      color,
    });
    if (particles.length > 240) particles.shift();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;
      p.x += p.vx; p.y += p.vy;
      p.vy *= 0.995;
      const t = p.life / p.max;
      if (t >= 1) { particles.splice(i, 1); continue; }
      const a = 0.5 * (1 - t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('A', a.toFixed(3));
      ctx.fill();
    }
  }

  // Read game state, spawn particles near portraits for low HP / active buffs.
  function sampleState() {
    if (typeof game === 'undefined' || !game || !game.player || !game.enemy) return;
    const now = performance.now();
    if (now - lastSpawn < 90) return;
    const playerEl = document.querySelector('.player-hero .hero-portrait');
    const enemyEl = document.querySelector('.enemy .hero-portrait');
    const lowThreshold = game.player.maxHp * 0.25;

    // Near-death: player low HP → rose motes drifting up around player.
    if (game.player.hp > 0 && game.player.hp <= lowThreshold && playerEl) {
      lastSpawn = now;
      const r = playerEl.getBoundingClientRect();
      spawn(r.left + Math.random() * r.width, r.top + r.height * 0.6, PASTELS[0]);
    }

    // Special buff active on a hero → faint pastel motes matching the buff.
    emitForBuffs(game.player, playerEl, false);
    emitForBuffs(game.enemy, enemyEl, true);
  }

  function emitForBuffs(hero, el, isEnemy) {
    if (!el || !hero.buffs || !hero.buffs.length) return;
    for (const b of hero.buffs) {
      let color = null;
      if (b.id === 'vulnerable') color = PASTELS[0];        // 光脚 → rose
      else if (b.id === 'strength') color = PASTELS[1];     // 长高了 → blue
      else if (b.id === 'burning') color = PASTELS[2];      // 发烧 → amber
      else if (b.id === 'poison') color = PASTELS[3];       // 肚子疼 → mint
      else if (b.id === 'metallicize') color = PASTELS[1];  // 穿外套 → blue
      else if (b.id === 'thorns') color = PASTELS[3];       // 扎手 → mint
      else continue;
      // Sparse: only some frames, only some buffs (so it stays 若隐若现).
      if (Math.random() < 0.06) {
        const r = el.getBoundingClientRect();
        spawn(r.left + Math.random() * r.width, r.top + Math.random() * r.height, color);
      }
    }
  }

  function loop() {
    ctx.clearRect(0, 0, w, h);
    drawFog();
    drawParticles();
    sampleState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
