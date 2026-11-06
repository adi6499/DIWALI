// I. The first flame. A terracotta diya floats in the dark; touching the wick
// lights it, the diya settles on the pool and light spreads through the
// courtyard, then the scroll takes over the camera. Scrolling before lighting
// it lights the diya at once, so the journey is never blocked.
import { presetById } from '../greetings/presets.js';
import { festivalToday } from '../config.js';
import { t, onLangChange } from '../i18n/index.js';

export function createIgniteWorld(ctx) {
  const $ = (s) => document.querySelector(s);
  const el = $('#ignite');
  const intro = $('#ignite-intro');
  const wickBtn = $('#wick-btn');
  const hint = $('#wick-hint');
  const cue = $('#scroll-cue');
  const received = $('#greeting-received');
  const note = $('#personal-note');
  const soundChip = $('#sound-chip');
  let lighting = false;
  let unsubscribe = null;

  wickBtn.addEventListener('click', () => ignite());

  // Opt-in sound, offered once on the opening screen
  if (ctx.audio.available) soundChip.hidden = false;
  soundChip.addEventListener('click', async () => {
    await ctx.enableSound();
    soundChip.hidden = true;
  });

  // On festival days (e.g. Dhanteras) greet the visitor and link to the story
  const fest = festivalToday();
  if (fest) {
    $('#festival-day').hidden = false;
    $('#festival-deva').textContent = fest.deva;
    $('#festival-deva').lang = 'hi';
    const sayFest = () => { $('#festival-text').textContent = t(fest.key); };
    sayFest();
    onLangChange(sayFest);
    $('#festival-link').addEventListener('click', (e) => {
      e.preventDefault();
      const target = fest.tab === 'dhanteras' ? 'dhanteras' : 'meaning';
      if (!ctx.store.get().ignited) quickLight();
      ctx.scrollToId(target);
    });
  }

  function placeWick() {
    const p = ctx.gl ? ctx.palace.wickScreen() : ctx.fallback.wickScreen();
    if (!p) return;
    // the button is position: fixed, like the stage, so screen coordinates map 1:1
    wickBtn.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
  }

  function showIntro() {
    intro.classList.remove('is-gone');
    hint.classList.remove('is-gone');
    cue.hidden = true;
    received.hidden = true;
    wickBtn.hidden = false;
    wickBtn.classList.add('is-ready');
    const g = ctx.greeting;
    if (g && (g.from || g.to)) {
      note.hidden = false;
      note.textContent = g.from
        ? (g.to ? t('ignite.noteFromTo', { to: g.to, from: g.from }) : t('ignite.noteFrom', { from: g.from }))
        : t('ignite.noteTo', { to: g.to });
    }
    if (!unsubscribe) unsubscribe = ctx.onFrame(placeWick);
  }

  function showAfter() {
    ctx.explore?.mark('flame');
    intro.classList.add('is-gone');
    hint.classList.add('is-gone');
    hint.hidden = true;
    wickBtn.classList.remove('is-ready');
    wickBtn.hidden = true;
    unsubscribe?.();
    unsubscribe = null;
    cue.hidden = false;
    const g = ctx.greeting;
    if (g) {
      const p = presetById(g.lang);
      $('#received-headline').textContent = p.headline;
      $('#received-headline').lang = p.lang;
      $('#received-message').textContent = `${g.to ? `${p.dear.replace('{to}', g.to)} ` : ''}${g.message || p.message}`;
      $('#received-from').textContent = g.from ? `— ${g.from}` : '';
      received.hidden = false;
    }
  }

  /** Light instantly (used when the visitor scrolls or deep-links first). */
  function quickLight() {
    if (ctx.store.get().ignited) return;
    ctx.store.set({ ignited: true });
    if (ctx.gl) ctx.palace.igniteQuick();
    else ctx.fallback.ignite();
    ctx.director.unlock();
    showAfter();
  }

  async function ignite() {
    if (lighting || ctx.store.get().ignited) return;
    lighting = true;
    ctx.store.set({ ignited: true });
    wickBtn.classList.remove('is-ready');
    hint.classList.add('is-gone');
    intro.classList.add('is-gone');
    ctx.audio.ignite();
    try { navigator.vibrate?.(16); } catch { /* ignore */ }
    ctx.announce(t('ignite.lit'));
    if (ctx.gl && !ctx.reduced) {
      const done = ctx.palace.ignite();
      setTimeout(showAfter, 4200);
      await done;
    } else {
      if (ctx.gl) { ctx.palace.igniteQuick(); ctx.palace.rig.set(ctx.palace.shots.reveal); } else await ctx.fallback.ignite();
      showAfter();
    }
    ctx.director.unlock();
    lighting = false;
  }

  return {
    id: 'ignite',
    el,
    quickLight,
    start() {
      if (ctx.store.get().ignited) { showAfter(); ctx.director.unlock(); return; }
      if (ctx.gl) ctx.palace.rig.set(ctx.palace.shots.heroClose);
      showIntro();
    },
    enter() {},
    exit() {},
    onTap(e, x, y) {
      if (ctx.store.get().ignited) return;
      const hit = ctx.gl ? ctx.palace.hitWick(x, y) : ctx.fallback.hitWick(x, y);
      if (hit) ignite();
    },
  };
}
