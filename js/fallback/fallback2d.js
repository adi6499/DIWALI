// 2D fallback stage for devices without WebGL2 (or after a GPU failure).
// It keeps every interaction real: a diya you light by touch, a palace
// silhouette that lights lamp by lamp, a river of floating lamps that carries
// your wishes, and Canvas 2D fireworks with a sparkler.

export function createFallback(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 1;
  let h = 1;
  let dpr = 1;
  let mode = 'courtyard';
  let lit = 0;          // 0..1 how much of the courtyard is lit
  let litTarget = 0;
  let heroLit = 0;
  let heroTarget = 0;
  let running = false;
  let last = 0;
  let t = 0;
  const particles = [];
  const wishes = [];
  const river = [];
  let sparklerAt = null;

  // glow sprite reused for every lamp
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  {
    const g = glow.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,236,190,1)');
    rg.addColorStop(0.18, 'rgba(255,170,80,0.7)');
    rg.addColorStop(0.5, 'rgba(255,120,40,0.18)');
    rg.addColorStop(1, 'rgba(255,100,30,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
  }

  const lamps = [];
  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lamps.length = 0;
    const base = h * 0.62;
    const rows = [base, base - h * 0.16, base - h * 0.28];
    rows.forEach((y, r) => {
      const n = Math.round(w / (r === 0 ? 22 : 30));
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * w;
        lamps.push({ x, y, key: Math.abs(x - w / 2) / w + r * 0.25, s: Math.random() });
      }
    });
    river.length = 0;
    for (let i = 0; i < 160; i++) {
      const d = Math.pow(Math.random(), 1.6);
      river.push({ x: Math.random() * w, d, sp: 4 + Math.random() * 10, s: Math.random() });
    }
  }

  function silhouette() {
    const base = h * 0.62;
    ctx.fillStyle = '#07060f';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, base - h * 0.3);
    const domes = [[w * 0.14, w * 0.06], [w * 0.5, w * 0.12], [w * 0.86, w * 0.06]];
    for (const [cx, r] of domes) {
      ctx.lineTo(cx - r, base - h * 0.3);
      ctx.bezierCurveTo(cx - r * 1.1, base - h * 0.3 - r * 1.2, cx - r * 0.2, base - h * 0.3 - r * 1.4, cx, base - h * 0.3 - r * 1.75);
      ctx.bezierCurveTo(cx + r * 0.2, base - h * 0.3 - r * 1.4, cx + r * 1.1, base - h * 0.3 - r * 1.2, cx + r, base - h * 0.3);
    }
    ctx.lineTo(w, base - h * 0.3);
    ctx.lineTo(w, h);
    ctx.fill();
    // arches with a warm glow inside when lit
    const n = Math.max(5, Math.round(w / 110));
    for (let i = 0; i < n; i++) {
      const cx = ((i + 0.5) / n) * w;
      const aw = (w / n) * 0.55;
      const top = base - h * 0.12;
      ctx.fillStyle = `rgba(255,140,60,${0.08 + lit * 0.28})`;
      ctx.beginPath();
      ctx.moveTo(cx - aw / 2, base);
      ctx.lineTo(cx - aw / 2, top);
      ctx.quadraticCurveTo(cx - aw / 2, top - aw * 0.6, cx, top - aw * 0.75);
      ctx.quadraticCurveTo(cx + aw / 2, top - aw * 0.6, cx + aw / 2, top);
      ctx.lineTo(cx + aw / 2, base);
      ctx.fill();
    }
  }

  function drawLamp(x, y, size, a) {
    if (a <= 0.01) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(glow, x - size, y - size, size * 2, size * 2);
    ctx.globalAlpha = 1;
  }

  function heroPos() {
    return { x: w * 0.5, y: mode === 'courtyard' ? h * 0.8 : h * 0.86 };
  }

  function drawHero() {
    const { x, y } = heroPos();
    const s = Math.min(w, h) / 700;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#8f3f1e';
    ctx.beginPath();
    ctx.moveTo(-60 * s, -6 * s);
    ctx.quadraticCurveTo(-50 * s, 26 * s, 0, 28 * s);
    ctx.quadraticCurveTo(52 * s, 26 * s, 64 * s, -4 * s);
    ctx.quadraticCurveTo(80 * s, -14 * s, 88 * s, -18 * s);
    ctx.quadraticCurveTo(30 * s, -10 * s, -60 * s, -6 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,140,0.6)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(-58 * s, -4 * s);
    ctx.quadraticCurveTo(0, -8 * s, 62 * s, -2 * s);
    ctx.stroke();
    if (heroLit > 0.01) {
      const fl = 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7) * 0.04;
      ctx.globalAlpha = heroLit;
      ctx.drawImage(glow, 80 * s - 90 * s, -60 * s - 90 * s, 180 * s, 180 * s);
      ctx.fillStyle = '#ffd37a';
      ctx.beginPath();
      ctx.moveTo(80 * s, -18 * s);
      ctx.bezierCurveTo(70 * s, -26 * s, 72 * s, -44 * s * fl, 81 * s, -62 * s * fl);
      ctx.bezierCurveTo(88 * s, -44 * s * fl, 90 * s, -26 * s, 80 * s, -18 * s);
      ctx.fill();
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      ctx.ellipse(80 * s, -28 * s, 3.5 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function sky() {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04051a');
    g.addColorStop(0.62, '#121540');
    g.addColorStop(1, '#1b1030');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    t += dt;
    const k = 1 - Math.exp(-dt * (reduced ? 30 : 1.4));
    lit += (litTarget - lit) * k;
    heroLit += (heroTarget - heroLit) * (1 - Math.exp(-dt * 4));
    sky();
    ctx.globalCompositeOperation = 'source-over';
    if (mode === 'river') drawRiver(dt);
    else {
      silhouette();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lamps) {
        const a = Math.max(0, Math.min(1, (lit * 1.6 - l.key) * 4));
        drawLamp(l.x, l.y, 9 + Math.sin(t * 6 + l.s * 10) * 1.2, a);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (mode === 'courtyard') drawHero();
    }
    drawParticles(dt);
    requestAnimationFrame(frame);
  }

  function drawRiver(dt) {
    const horizon = h * 0.46;
    ctx.fillStyle = '#07081c';
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 0; x < w; x += 14) drawLamp(x, horizon - 4, 5, 0.7);
    for (const r of river) {
      r.x += r.sp * dt * (0.3 + r.d);
      if (r.x > w + 20) r.x = -20;
      const y = horizon + 8 + r.d * (h - horizon - 30) + Math.sin(t + r.s * 9) * 2;
      const s = 3 + r.d * 12;
      drawLamp(r.x, y, s, 0.9);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(glow, r.x - s * 0.5, y + s * 0.4, s, s * 3.2);
      ctx.globalAlpha = 1;
    }
    for (const wsh of wishes) {
      wsh.p = Math.min(1, wsh.p + dt / (reduced ? 0.1 : 14));
      const x = wsh.x0 + (wsh.xT - wsh.x0) * wsh.p + Math.sin(t * 0.3 + wsh.ph) * 10;
      const y = h * 0.95 + (wsh.yT - h * 0.95) * wsh.p;
      wsh.sx = x;
      wsh.sy = y;
      drawLamp(x, y, 22, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawParticles(dt) {
    if (sparklerAt) {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 160;
        particles.push({ x: sparklerAt.x, y: sparklerAt.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, age: 0, c: '255,230,170', s: 1.4, g: 40 });
      }
      particles.push({ x: sparklerAt.x, y: sparklerAt.y, vx: 0, vy: 0, life: 1.4, age: 0, c: '255,170,70', s: 2.2, g: 0 });
    }
    if (!particles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      if (p.burstAt !== undefined && p.age >= p.burstAt) { explode(p); particles.splice(i, 1); continue; }
      p.vx *= Math.exp(-dt * 1.6);
      p.vy = p.vy * Math.exp(-dt * 1.6) + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      ctx.fillStyle = `rgba(${p.c},${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (particles.length > 3000) particles.splice(0, particles.length - 3000);
  }

  const PAL = ['255,90,70', '255,200,90', '120,255,150', '140,160,255', '255,110,200', '255,245,220'];
  function explode(p) {
    const n = 90;
    const c = PAL[Math.floor(Math.random() * PAL.length)];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 140 + Math.random() * 60;
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.6 + Math.random() * 0.4, age: 0, c, s: 1.8, g: 50 });
    }
  }

  const api = {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
    setMode(m) { mode = m; },
    setLit(f) { litTarget = f; },
    ignite() {
      heroTarget = 1;
      litTarget = Math.max(litTarget, 0.55);
      return new Promise((r) => setTimeout(r, reduced ? 50 : 2600));
    },
    lightAll() { heroTarget = 1; litTarget = 1; },
    wickScreen() {
      const { x, y } = heroPos();
      const s = Math.min(w, h) / 700;
      return { x: x + 80 * s, y: y - 24 * s };
    },
    launch(x, y) {
      particles.push({ x, y: h, vx: (Math.random() - 0.5) * 20, vy: -(h - y) * 1.6, life: 2, age: 0, burstAt: 0.62, c: '255,210,150', s: 2, g: 0 });
    },
    finale() {
      for (let i = 0; i < 12; i++) setTimeout(() => api.launch(w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.25)), i * 420);
    },
    sparkle(x, y) { sparklerAt = x === null ? null : { x, y }; },
    addWish(wish, fresh) {
      wishes.push({ id: wish.id, text: wish.text, created: wish.created, x0: w * 0.5, xT: w * (0.2 + Math.random() * 0.6), yT: h * (0.55 + Math.random() * 0.25), ph: Math.random() * 6, p: fresh ? 0 : 1 });
    },
    removeWish(id) { const i = wishes.findIndex((x) => x.id === id); if (i >= 0) wishes.splice(i, 1); },
    clearWishes() { wishes.length = 0; },
    pickWish(x, y) {
      let best = null;
      let bd = 50;
      for (const wsh of wishes) {
        const d = Math.hypot((wsh.sx || 0) - x, (wsh.sy || 0) - y);
        if (d < bd) { bd = d; best = wsh; }
      }
      return best;
    },
    hitWick(x, y) {
      const p = api.wickScreen();
      return Math.hypot(p.x - x, p.y - y) < 90;
    },
  };

  layout();
  window.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => (document.hidden ? api.stop() : api.start()));
  return api;
}
