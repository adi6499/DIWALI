// DEEPOTSAV bootstrap: detects the device, builds the 3D stage (or the 2D
// fallback), wires the chrome (sound, settings, journey map, rail) and hands
// the camera to the scroll director, which turns scrolling into one
// continuous flight through the seven parts of the journey.

import { WORLDS, STORAGE_KEYS } from './config.js';
import { createStore } from './core/store.js';
import { AudioEngine } from './core/audio.js';
import { probeDevice, resolveTier } from './core/quality.js';
import { announce, isReducedMotion, onSystemMotionChange } from './core/a11y.js';
import { toast, openDialog, closeDialog } from './core/ui.js';
import { initPWA } from './core/pwa.js';
import { ScrollDirector } from './core/scrollDirector.js';
import { decodeGreeting } from './greetings/link.js';
import * as i18n from './i18n/index.js';
import { t } from './i18n/index.js';
import * as THREE from './lib/three.js';

const $ = (s) => document.querySelector(s);
const GROUPS = WORLDS.map((w) => w.id);

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

let probe = null;
let soundOn = false;

// --- shared context handed to every part -------------------------------------------
const frameFns = new Set();
let riverPromise = null;
const controllers = {};

const ctx = {
  store,
  audio,
  gl: false,
  engine: null,
  palace: null,
  river: null,
  fallback: null,
  tier: null,
  greeting: null,
  director: null,
  explore: null,
  announce,
  toast,
  get reduced() { return isReducedMotion(store.get().motion); },
  onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
  rangoliImage: () => controllers.rangoli?.exportImage?.() || null,

  async getRiver() {
    if (!ctx.gl) return null;
    if (ctx.river) return ctx.river;
    if (!riverPromise) {
      riverPromise = import('./scenes/riverScene.js')
        .then(({ createRiverScene }) => createRiverScene({ engine: ctx.engine, tier: ctx.tier }))
        .then(async (r) => {
          // prepare its shaders now, not on the first frame of the dissolve
          try { await ctx.engine.warm(r.handle.scene, r.handle.camera); } catch (err) { console.warn('[deepotsav] river warm-up failed', err); }
          ctx.river = r;
          r.rig.reduced = ctx.reduced;
          ctx.engine.register(r.handle);
          controllers.wishes?.riverReady(r);
          return r;
        });
    }
    return riverPromise;
  },

  async enableSound() {
    if (audio.enabled) return true;
    const ok = await audio.enable();
    setSoundUI(ok);
    announce(ok ? t('sound.on') : t('sound.fail'));
    if (!ok) toast(t('sound.fail'));
    else ctx.explore?.mark('sound');
    $('#sound-chip').hidden = true;
    return ok;
  },

  /** Where to slide the 3D picture so it is not hidden behind a card. */
  shiftFor(kind) {
    if (kind !== 'panel') return [0, 0];
    if (window.matchMedia('(max-height: 520px) and (orientation: landscape)').matches) return [-0.18, 0];
    if (window.matchMedia('(min-width: 900px)').matches) return [0.15, 0];
    return [0, 0.16];
  },

  scrollToId(id) {
    const el = document.getElementById(id);
    const i = ctx.director.sections.findIndex((s) => s.el === el || s.el.contains(el));
    if (i >= 0) ctx.director.scrollToIndex(i);
  },

  /** Render the lit palace courtyard off-screen (for greeting cards). */
  capturePalace(w, h) {
    const p = ctx.palace;
    const e = ctx.engine;
    const saved = { active: e.active, incoming: e.incoming, blend: e.blend };
    const rig = p.rig;
    const keep = { pos: rig.pos.clone(), target: rig.target.clone(), fov: rig.fov, fit: rig.fit, focus: rig.focus, aperture: rig.aperture, shift: rig.shift.clone(), now: rig._shiftNow.clone() };
    const shot = p.shots.story3;
    rig.setDirect({ pos: new THREE.Vector3(...shot.pos), target: new THREE.Vector3(...shot.target), fov: shot.fov, aperture: 0 });
    rig.shift.set(0, 0);
    rig._shiftNow.set(0, 0);
    p.handle.update(0.016, e.time);
    e.active = p.handle;
    e.incoming = null;
    let out;
    try { out = e.capture(w, h); } finally {
      e.active = saved.active;
      e.incoming = saved.incoming;
      e.blend = saved.blend;
      rig.setDirect(keep);
      rig.shift.copy(keep.shift);
      rig._shiftNow.copy(keep.now);
    }
    return out;
  },
};

// --- chrome --------------------------------------------------------------------------
function setSoundUI(on) {
  soundOn = on;
  const soundBtn = $('#sound-btn');
  soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  soundBtn.querySelector('use').setAttribute('href', on ? '#i-sound-on' : '#i-sound-off');
  $('#sound-label').textContent = on ? t('sound.turnOff') : t('sound.turnOn');
}

function wireChrome() {
  // Journey links (rail + map) scroll instead of jumping
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-world-link]');
    const goBtn = e.target.closest('[data-go]');
    const target = link?.dataset.worldLink || goBtn?.dataset.go;
    if (!target || !ctx.director) return;
    e.preventDefault();
    const dlg = e.target.closest('dialog');
    if (dlg) closeDialog(dlg);
    if (goBtn?.dataset.go === 'greetings' && ctx.greeting) controllers.greetings?.prefillReply(ctx.greeting);
    if (target !== 'ignite') controllers.ignite?.quickLight();
    ctx.director.scrollToIndex(ctx.director.firstOfGroup(target));
  });
  $('#rail-prev').addEventListener('click', () => ctx.director?.scrollToIndex(Math.ceil(ctx.director.indexAt(window.scrollY) - 1.01)));
  $('#rail-next').addEventListener('click', () => {
    controllers.ignite?.quickLight();
    ctx.director?.scrollToIndex(Math.floor(ctx.director.indexAt(window.scrollY) + 1.01));
  });

  const mapDialog = $('#map-dialog');
  $('#map-btn').addEventListener('click', (e) => openDialog(mapDialog, e.currentTarget));
  $('#brand-btn').addEventListener('click', (e) => openDialog(mapDialog, e.currentTarget));
  const settings = $('#settings-dialog');
  $('#settings-btn').addEventListener('click', (e) => openDialog(settings, e.currentTarget));
  $('#journal-btn').addEventListener('click', (e) => ctx.explore?.open(e.currentTarget));
  wireLanguages();
  for (const d of [mapDialog, settings, $('#wish-dialog'), $('#lang-dialog')]) {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
  }

  // Sound (opt-in, never automatic)
  const soundBtn = $('#sound-btn');
  if (!audio.available) soundBtn.hidden = true;
  soundBtn.addEventListener('click', async () => {
    if (audio.enabled) {
      audio.disable();
      setSoundUI(false);
      announce(t('sound.off'));
    } else {
      await ctx.enableSound();
    }
  });

  const vol = $('#volume-range');
  vol.value = String(store.get().volume);
  vol.addEventListener('input', () => {
    store.set({ volume: Number(vol.value) });
    audio.setVolume(Number(vol.value) / 100);
  });

  const q = store.get().quality;
  for (const r of document.querySelectorAll('input[name="quality"]')) {
    r.checked = r.value === q;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      store.set({ quality: r.value });
      toast(t('quality.reload'), { action: { label: t('quality.reloadNow'), onClick: () => location.reload() } });
    });
  }

  const m = store.get().motion;
  for (const r of document.querySelectorAll('input[name="motion"]')) {
    r.checked = r.value === m;
    r.addEventListener('change', () => { if (r.checked) { store.set({ motion: r.value }); applyMotion(); } });
  }
  onSystemMotionChange(applyMotion);

  document.addEventListener('visibilitychange', () => audio.setPaused(document.hidden));
}

// --- languages ------------------------------------------------------------------------
const startLang = i18n.current;
let firstLang = null;

function wireLanguages() {
  const dialog = $('#lang-dialog');
  const list = $('#lang-list');
  for (const l of i18n.LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-option';
    b.setAttribute('role', 'radio');
    b.dataset.lang = l.code;
    b.lang = l.code;
    b.innerHTML = `<span class="lang-native"></span><span class="lang-english" lang="en"></span>`;
    b.querySelector('.lang-native').textContent = l.name;
    b.querySelector('.lang-english').textContent = l.english;
    b.addEventListener('click', async () => {
      closeDialog(dialog);
      if (l.code === i18n.current()) return;
      await i18n.setLang(l.code);
      announce(t('lang.changed', { name: l.name }));
    });
    list.append(b);
  }
  const open = (e) => {
    for (const b of list.children) b.setAttribute('aria-checked', b.dataset.lang === i18n.current() ? 'true' : 'false');
    openDialog(dialog, e.currentTarget);
    list.querySelector('[aria-checked="true"]')?.focus();
  };
  $('#lang-btn').addEventListener('click', open);
  $('#settings-lang').addEventListener('click', (e) => { closeDialog($('#settings-dialog')); open(e); });
  i18n.onLangChange(onLanguage);
  onLanguage();
}

/** Everything written by scripts that has to follow the language. */
function onLanguage() {
  const info = i18n.langInfo();
  $('#lang-label').textContent = t('lang.button', { name: info.name });
  $('#settings-lang-name').textContent = info.name;
  $('#settings-lang-name').lang = info.code;
  setSoundUI(soundOn);
  sayQuality();
  const g = ctx.director?.group;
  document.title = !g || g === 'ignite' ? t('doc.title') : t('doc.part', { title: t(`world.${g}`) });
  if (firstLang === null) firstLang = startLang();
  else if (info.code !== firstLang) ctx.explore?.mark('language');
  // cards change height with the language: the camera's resting points move too
  if (ctx.director) requestAnimationFrame(() => ctx.director.measure());
}

function sayQuality() {
  if (!probe || !ctx.tier) return;
  $('#quality-note').textContent = t('quality.detected', {
    probe: t(`quality.${probe.tier}`),
    reason: probe.reason || t('quality.unknown'),
    tier: t(`quality.${ctx.tier.name}`),
  });
}

function applyMotion() {
  const reduced = ctx.reduced;
  document.documentElement.classList.toggle('reduce-motion', reduced);
  document.documentElement.classList.toggle('motion-full', store.get().motion === 'full');
  if (ctx.gl) {
    ctx.engine.reduced = reduced;
    ctx.palace.rig.reduced = reduced;
    if (ctx.river) ctx.river.rig.reduced = reduced;
  }
}

function updateRail(group) {
  for (const a of document.querySelectorAll('[data-world-link]')) {
    if (a.dataset.worldLink === group) a.setAttribute('aria-current', 'step');
    else a.removeAttribute('aria-current');
  }
}

// --- stage input ------------------------------------------------------------------------
function wireStage(canvas) {
  const current = () => controllers[ctx.director?.group];
  // A tap is a short press that did not turn into a scroll gesture.
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    if (canvas.classList.contains('is-drawing')) {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or ended pointer */ }
      current()?.onPointerDown?.(e, e.clientX, e.clientY);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (ctx.gl && e.pointerType === 'mouse') {
      const rig = ctx.engine.active === ctx.river?.handle ? ctx.river.rig : ctx.palace.rig;
      rig.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    }
    current()?.onPointerMove?.(e, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => {
    current()?.onPointerUp?.(e, e.clientX, e.clientY);
    if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && performance.now() - down.t < 600) {
      // a lamp to light or a hidden thing comes first
      if (!canvas.classList.contains('is-drawing') && ctx.explore?.onTap(e.clientX, e.clientY)) { down = null; return; }
      current()?.onTap?.(e, e.clientX, e.clientY);
    }
    down = null;
  });
  canvas.addEventListener('pointercancel', (e) => { down = null; current()?.onPointerUp?.(e, e.clientX, e.clientY); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// --- boot ---------------------------------------------------------------------------------
async function startFallback(reason) {
  const { createFallback } = await import('./fallback/fallback2d.js');
  const stage = $('#fallback-stage');
  $('#stage').hidden = true;
  stage.hidden = false;
  ctx.gl = false;
  ctx.fallback = createFallback(stage, { reduced: ctx.reduced });
  ctx.fallback.start();
  wireStage(stage);
  if (reason) toast(t('fallback.shown', { reason }), { timeout: 6000 });
}

async function boot() {
  history.scrollRestoration = 'manual';
  // the language first, so even the loader speaks it
  try { await i18n.init(); } catch (err) { console.warn('[deepotsav] language', err); }
  loader.set(t('loader.clay'), 0.08);
  probe = probeDevice();
  const tier = resolveTier(store.get().quality, probe);
  ctx.tier = tier;
  wireChrome();
  initPWA();
  document.documentElement.dataset.tier = tier.name;

  const force2D = /[?&]2d\b/.test(location.search);
  if (probe.webgl2 && !force2D) {
    try {
      loader.set(t('loader.knead'), 0.16);
      const [{ Engine }, { createPalaceScene }, { gsap }] = await Promise.all([
        import('./core/engine.js'),
        import('./scenes/palaceScene.js'),
        import('./lib/gsap.js'),
      ]);
      const canvas = $('#stage');
      const engine = new Engine(canvas, tier, {
        onContextLost: () => toast(t('gl.lost'), { timeout: 3000 }),
        onContextRestored: () => toast(t('gl.restored'), { timeout: 1500 }),
        onDegrade: () => { engine.degrade(); console.info('[deepotsav] lowering effects for smoother frames'); },
      });
      await engine.initPost();
      ctx.engine = engine;
      ctx.palace = await createPalaceScene({ engine, tier, progress: (t, p) => loader.set(t, 0.2 + p * 0.75) });
      ctx.gl = true;
      engine.use(ctx.palace.handle);
      // one full frame behind the loader, so the finishing passes (bloom,
      // anti-aliasing, colour) are built before the first visible frame
      try { engine.renderFrame(); } catch (err) { console.warn('[deepotsav] first frame failed', err); }
      wireStage(canvas);
      window.__deepotsav = { ctx, engine, gsap, stats: () => ({ ...ctx.palace.stats(), calls: engine.renderer.info.render.calls, tier: tier.name, pr: engine.pixelRatio }) };
    } catch (err) {
      console.error('[deepotsav] 3D unavailable, using 2D fallback', err);
      ctx.engine?.stop?.();
      ctx.engine = null;
      await startFallback(t('fallback.no3d'));
    }
  } else {
    await startFallback(force2D ? '' : t('fallback.noWebgl'));
  }
  applyMotion();

  // Parts of the journey
  const mods = await Promise.all([
    import('./worlds/ignite.js'),
    import('./worlds/rangoli.js'),
    import('./worlds/fireworks.js'),
    import('./worlds/wishes.js'),
    import('./worlds/greetings.js'),
  ]);
  controllers.ignite = mods[0].createIgniteWorld(ctx);
  controllers.rangoli = mods[1].createRangoliWorld(ctx);
  controllers.fireworks = mods[2].createFireworksWorld(ctx);
  controllers.wishes = mods[3].createWishesWorld(ctx);
  controllers.greetings = mods[4].createGreetingsWorld(ctx);

  // The director turns the scroll into the camera journey
  const director = new ScrollDirector(ctx, [...document.querySelectorAll('main .sec')]);
  ctx.director = director;
  if (ctx.engine) ctx.engine._director = director;
  director.onGroup = (g, prev) => {
    try { controllers[prev]?.exit(); } catch (err) { console.error(err); }
    Promise.resolve(controllers[g]?.enter()).catch((err) => console.error(err));
    updateRail(g);
    if (prev) {
      const title = t(`world.${g}`);
      announce(t('a11y.part', { title, n: GROUPS.indexOf(g) + 1, total: GROUPS.length }));
      document.title = g === 'ignite' ? t('doc.title') : t('doc.part', { title });
      if (!ctx.greeting) history.replaceState(null, '', `${location.pathname}${location.search}#/${g}`);
    }
  };

  director.onSection = (i) => ctx.explore?.onSection(director.sections[i]);

  // Lamps to light, hidden things, the blessing and the journal
  try {
    const { createExplore } = await import('./explore/index.js');
    ctx.explore = await createExplore(ctx);
  } catch (err) {
    console.error('[deepotsav] explore failed', err);
  }

  const tick = (dt) => {
    director.update(dt);
    for (const fn of frameFns) fn(dt, performance.now() / 1000);
  };
  if (ctx.gl) {
    // cameras are set before the scenes draw, so the picture never lags a frame
    ctx.engine.onBeforeFrame((dt) => director.update(dt));
    ctx.engine.onFrame((dt) => { for (const fn of frameFns) fn(dt, performance.now() / 1000); });
    ctx.engine.start();
  } else {
    let last = performance.now();
    const loop = (now) => { tick(Math.min(0.05, (now - last) / 1000)); last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    window.__deepotsav = { ctx, tick };
  }

  // Scrolling before the diya is lit lights it at once
  window.addEventListener('scroll', () => {
    if (!store.get().ignited && window.scrollY > 24) controllers.ignite.quickLight();
  }, { passive: true });

  // Deep links: #/for/<greeting> or #/<part>
  const route = location.hash.replace(/^#\/?/, '');
  if (route.startsWith('for/')) {
    const g = decodeGreeting(route.slice(4));
    if (g) ctx.greeting = g;
    history.replaceState(null, '', `${location.pathname}${location.search}#/ignite`);
  }
  controllers.ignite.start();
  controllers.rangoli.preload();
  const part = route.split('/')[0];
  if (GROUPS.includes(part) && part !== 'ignite') {
    controllers.ignite.quickLight();
    requestAnimationFrame(() => {
      director.measure();
      window.scrollTo(0, director.anchorOf(director.firstOfGroup(part)));
      director.y = window.scrollY;
    });
  } else {
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => {
    const p = location.hash.replace(/^#\/?/, '').split('/')[0];
    if (GROUPS.includes(p) && p !== director.group) director.scrollToIndex(director.firstOfGroup(p));
  });

  loader.done();
  // Build the river in the background so the flight there is seamless
  if (ctx.gl) setTimeout(() => ctx.getRiver().catch((err) => console.warn('[deepotsav] river failed', err)), 2500);
}

window.addEventListener('error', (e) => console.error('[deepotsav] uncaught', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[deepotsav] unhandled', e.reason));

boot().catch((err) => {
  console.error('[deepotsav] boot failed', err);
  loader.set(t('loader.error'), 1);
});
