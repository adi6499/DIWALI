// DEEPOTSAV bootstrap: detects the device, builds the 3D stage (or the 2D
// fallback), wires the chrome (sound, settings, journey map, rail, keyboard)
// and routes between the seven worlds. Worlds are loaded on first visit.

import { WORLDS, STORAGE_KEYS } from './config.js';
import { createStore } from './core/store.js';
import { createRouter } from './core/router.js';
import { AudioEngine } from './core/audio.js';
import { probeDevice, resolveTier } from './core/quality.js';
import { announce, focusHeading, isReducedMotion, onSystemMotionChange } from './core/a11y.js';
import { toast, openDialog, closeDialog } from './core/ui.js';
import { initPWA } from './core/pwa.js';
import { decodeGreeting } from './greetings/link.js';

const $ = (s) => document.querySelector(s);
const ids = WORLDS.map((w) => w.id);

const store = createStore(
  { quality: 'auto', motion: 'system', volume: 70, ignited: false },
  { persistKey: STORAGE_KEYS.settings, persist: ['quality', 'motion', 'volume'] },
);
const audio = new AudioEngine();
audio.setVolume(store.get().volume / 100);

const loader = {
  el: $('#loader'),
  status: $('#loader-status'),
  bar: $('#loader-bar'),
  set(text, p) {
    if (text) this.status.textContent = text;
    if (p !== undefined) this.bar.style.width = `${Math.round(p * 100)}%`;
  },
  done() {
    this.set('', 1);
    this.el.classList.add('is-done');
    this.el.setAttribute('aria-hidden', 'true');
    setTimeout(() => this.el.remove(), 1200);
  },
};

// --- shared context handed to every world ----------------------------------
const frameFns = new Set();
let river = null;
let riverPromise = null;
let shiftKind = 'none';

const ctx = {
  store,
  audio,
  gl: false,
  engine: null,
  palace: null,
  fallback: null,
  tier: null,
  greeting: null,
  current: null,
  announce,
  toast,
  get reduced() { return isReducedMotion(store.get().motion); },
  go: (id) => router.go(id),
  onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
  rangoliImage: () => worldCache.rangoli?.exportImage?.() || null,

  async getRiver() {
    if (!ctx.gl) return null;
    if (river) return river;
    if (!riverPromise) {
      toast('Setting the diyas afloat…', { timeout: 2500 });
      riverPromise = import('./scenes/riverScene.js')
        .then(({ createRiverScene }) => createRiverScene({ engine: ctx.engine, tier: ctx.tier }))
        .then((r) => { river = r; r.rig.reduced = ctx.reduced; ctx.engine.register(r.handle); return r; });
    }
    return riverPromise;
  },

  async showScene(name) {
    audio.setScene(name === 'river' ? 'river' : 'palace');
    if (!ctx.gl) {
      ctx.fallback.setMode(name === 'river' ? 'river' : 'courtyard');
      return;
    }
    const target = name === 'river' ? (await ctx.getRiver()).handle : ctx.palace.handle;
    if (ctx.engine.active !== target) await ctx.engine.transitionTo(target, { duration: 1.8 });
    applyShift();
  },

  ensureLit(full) {
    const wasLit = store.get().ignited;
    store.set({ ignited: true });
    if (!ctx.gl) { ctx.fallback.lightAll(); return; }
    if (!ctx.palace.state.ignited) ctx.palace.igniteQuick(full);
    else if (full) ctx.palace.lightAll();
    if (!wasLit) document.getElementById('ignite-after').hidden = false;
  },

  setShift(kind) {
    shiftKind = kind;
    applyShift();
  },
};

function shiftFor(kind) {
  if (kind !== 'panel') return [0, 0];
  if (window.matchMedia('(max-height: 520px) and (orientation: landscape)').matches) return [-0.18, 0];
  if (window.matchMedia('(min-width: 900px)').matches) return [0.15, 0];
  return [0, 0.17];
}

function applyShift() {
  if (!ctx.gl) return;
  const [x, y] = shiftFor(shiftKind);
  const rig = ctx.engine.active === river?.handle ? river.rig : ctx.palace.rig;
  rig.setShift(x, y);
}

// --- worlds ------------------------------------------------------------------
const loaders = {
  ignite: () => import('./worlds/ignite.js').then((m) => m.createIgniteWorld(ctx)),
  story: () => import('./worlds/story.js').then((m) => m.createStoryWorld(ctx)),
  meaning: () => import('./worlds/meaning.js').then((m) => m.createMeaningWorld(ctx)),
  rangoli: () => import('./worlds/rangoli.js').then((m) => m.createRangoliWorld(ctx)),
  wishes: () => import('./worlds/wishes.js').then((m) => m.createWishesWorld(ctx)),
  fireworks: () => import('./worlds/fireworks.js').then((m) => m.createFireworksWorld(ctx)),
  greetings: () => import('./worlds/greetings.js').then((m) => m.createGreetingsWorld(ctx)),
};
const worldCache = {};
async function getWorld(id) {
  if (!worldCache[id]) worldCache[id] = await loaders[id]();
  return worldCache[id];
}

let switching = Promise.resolve();
let active = null;

function go(id, { focus = true } = {}) {
  switching = switching.then(() => enterWorld(id, focus)).catch((err) => {
    console.error('[deepotsav] world failed', err);
    toast('Something went wrong opening that part. Please try again.');
  });
  return switching;
}

async function enterWorld(id, focus) {
  if (active && active.id === id) return;
  const world = await getWorld(id);
  const prev = active;
  if (prev) {
    try { prev.exit(id); } catch (err) { console.error(err); }
    prev.el.classList.remove('is-active');
  }
  active = world;
  ctx.current = id;
  world.el.classList.add('is-active');
  updateRail(id);
  await world.enter(prev ? prev.id : null);
  if (ctx.current !== id) return;
  const index = ids.indexOf(id);
  announce(`${WORLDS[index].title}. Part ${index + 1} of ${ids.length}.`);
  if (focus && prev) focusHeading(world.heading);
  document.title = index === 0 ? 'Deepotsav — A Festival of Light' : `${WORLDS[index].title} · Deepotsav`;
}

function updateRail(id) {
  for (const a of document.querySelectorAll('[data-world-link]')) {
    if (a.dataset.worldLink === id) a.setAttribute('aria-current', 'step');
    else a.removeAttribute('aria-current');
  }
  const i = ids.indexOf(id);
  $('#rail-prev').disabled = i <= 0;
  $('#rail-next').disabled = i >= ids.length - 1;
}

const router = createRouter(ids, (route) => {
  if (route.greeting) {
    const g = decodeGreeting(route.greeting);
    if (g) ctx.greeting = g;
    history.replaceState(null, '', '#/ignite');
  }
  go(route.world);
});

// --- chrome ------------------------------------------------------------------
function wireChrome() {
  const step = (d) => {
    const i = ids.indexOf(ctx.current);
    const n = ids[Math.max(0, Math.min(ids.length - 1, i + d))];
    if (n && n !== ctx.current) router.go(n);
  };
  $('#rail-prev').addEventListener('click', () => step(-1));
  $('#rail-next').addEventListener('click', () => step(1));

  document.addEventListener('click', (e) => {
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) {
      e.preventDefault();
      if (goBtn.dataset.go === 'greetings' && ctx.greeting) {
        getWorld('greetings').then((w) => w.prefillReply(ctx.greeting));
      }
      router.go(goBtn.dataset.go);
      return;
    }
    const link = e.target.closest('[data-world-link]');
    if (link) {
      const dlg = link.closest('dialog');
      if (dlg) closeDialog(dlg);
    }
  });

  const mapDialog = $('#map-dialog');
  $('#map-btn').addEventListener('click', (e) => openDialog(mapDialog, e.currentTarget));
  $('#brand-btn').addEventListener('click', (e) => openDialog(mapDialog, e.currentTarget));
  const settings = $('#settings-dialog');
  $('#settings-btn').addEventListener('click', (e) => openDialog(settings, e.currentTarget));
  for (const d of [mapDialog, settings, $('#wish-dialog')]) {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
  }

  // Sound (opt-in, never automatic)
  const soundBtn = $('#sound-btn');
  const setSoundUI = (on) => {
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.querySelector('use').setAttribute('href', on ? '#i-sound-on' : '#i-sound-off');
    $('#sound-label').textContent = on ? 'Turn sound off' : 'Turn sound on';
  };
  if (!audio.available) soundBtn.hidden = true;
  soundBtn.addEventListener('click', async () => {
    if (audio.enabled) {
      audio.disable();
      setSoundUI(false);
      announce('Sound off.');
    } else {
      const ok = await audio.enable();
      setSoundUI(ok);
      announce(ok ? 'Sound on: tanpura drone and temple bells.' : 'Sound could not start on this device.');
      if (!ok) toast('Sound could not start on this device.');
    }
  });

  const vol = $('#volume-range');
  vol.value = String(store.get().volume);
  vol.addEventListener('input', () => {
    store.set({ volume: Number(vol.value) });
    audio.setVolume(Number(vol.value) / 100);
  });

  // Quality
  const q = store.get().quality;
  for (const r of document.querySelectorAll('input[name="quality"]')) {
    r.checked = r.value === q;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      store.set({ quality: r.value });
      toast('Quality will change when the page reloads.', { action: { label: 'Reload now', onClick: () => location.reload() } });
    });
  }

  // Motion
  const m = store.get().motion;
  for (const r of document.querySelectorAll('input[name="motion"]')) {
    r.checked = r.value === m;
    r.addEventListener('change', () => { if (r.checked) { store.set({ motion: r.value }); applyMotion(); } });
  }
  onSystemMotionChange(applyMotion);

  // Keyboard: move between worlds without trapping text inputs or the canvas
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t.closest?.('input, textarea, select, [contenteditable], canvas, [role="tablist"], [role="radiogroup"], dialog');
    if (e.key === 'PageDown' && !typing) { e.preventDefault(); step(1); }
    else if (e.key === 'PageUp' && !typing) { e.preventDefault(); step(-1); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
}

function applyMotion() {
  const reduced = ctx.reduced;
  document.documentElement.classList.toggle('reduce-motion', reduced);
  document.documentElement.classList.toggle('motion-full', store.get().motion === 'full');
  if (ctx.gl) {
    ctx.engine.reduced = reduced;
    ctx.palace.rig.reduced = reduced;
    if (river) river.rig.reduced = reduced;
  }
}

// --- stage input ----------------------------------------------------------------
function wireStage(canvas) {
  const point = (e) => [e.clientX, e.clientY];
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = point(e);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or ended pointer */ }
    active?.onPointerDown?.(e, x, y);
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = point(e);
    if (ctx.gl && (e.pointerType === 'mouse' || e.buttons)) {
      const rig = ctx.engine.active === river?.handle ? river.rig : ctx.palace.rig;
      rig.setPointer((x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1));
    }
    active?.onPointerMove?.(e, x, y);
  });
  const up = (e) => {
    const [x, y] = point(e);
    active?.onPointerUp?.(e, x, y);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// --- boot --------------------------------------------------------------------------
async function startFallback(reason) {
  const { createFallback } = await import('./fallback/fallback2d.js');
  const stage = $('#fallback-stage');
  $('#stage').hidden = true;
  stage.hidden = false;
  ctx.gl = false;
  ctx.fallback = createFallback(stage, { reduced: ctx.reduced });
  ctx.fallback.start();
  wireStage(stage);
  if (reason) toast(`Showing the 2D version (${reason}).`, { timeout: 6000 });
}

async function boot() {
  wireChrome();
  initPWA();
  loader.set('Shaping the clay…', 0.08);
  const probe = probeDevice();
  const tier = resolveTier(store.get().quality, probe);
  ctx.tier = tier;
  $('#quality-note').textContent = `Detected: ${probe.tier} (${probe.reason || 'unknown device'}). Using ${tier.name}.`;
  document.documentElement.dataset.tier = tier.name;

  // ?2d previews the no-WebGL experience (useful for testing)
  const force2D = /[?&]2d\b/.test(location.search);
  if (probe.webgl2 && !force2D) {
    try {
      loader.set('Kneading the terracotta…', 0.16);
      const [{ Engine }, { createPalaceScene }] = await Promise.all([
        import('./core/engine.js'),
        import('./scenes/palaceScene.js'),
      ]);
      const canvas = $('#stage');
      const engine = new Engine(canvas, tier, {
        onContextLost: () => toast('The graphics card paused. Restoring…', { timeout: 3000 }),
        onContextRestored: () => toast('Restored.', { timeout: 1500 }),
        onDegrade: () => { engine.degrade(); console.info('[deepotsav] lowering effects for smoother frames'); },
      });
      await engine.initPost();
      ctx.engine = engine;
      ctx.palace = await createPalaceScene({ engine, tier, progress: (t, p) => loader.set(t, 0.2 + p * 0.75) });
      ctx.gl = true;
      engine.use(ctx.palace.handle);
      engine.onFrame((dt, t) => { for (const fn of frameFns) fn(dt, t); });
      applyMotion();
      engine.start();
      wireStage(canvas);
      const { gsap } = await import('./lib/gsap.js');
      window.__deepotsav = { ctx, engine, gsap, stats: () => ({ ...ctx.palace.stats(), calls: engine.renderer.info.render.calls, triangles: engine.renderer.info.render.triangles, tier: tier.name, pr: engine.pixelRatio }) };
    } catch (err) {
      console.error('[deepotsav] 3D unavailable, using 2D fallback', err);
      ctx.engine?.stop?.();
      await startFallback('3D graphics could not start');
    }
  } else {
    await startFallback(force2D ? '' : 'WebGL 2 is not available');
  }
  applyMotion();

  if (!ctx.gl) {
    // the 2D stage drives its own frames; worlds still subscribe through ctx.onFrame
    const loop = () => { for (const fn of frameFns) fn(0.016, performance.now() / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  router.start();
  await switching;
  loader.done();
}

window.addEventListener('error', (e) => console.error('[deepotsav] uncaught', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[deepotsav] unhandled', e.reason));

boot().catch((err) => {
  console.error('[deepotsav] boot failed', err);
  loader.set('Something went wrong. Please reload the page.', 1);
});
