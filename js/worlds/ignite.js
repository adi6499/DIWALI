// World I: the first flame. A terracotta diya floats in the dark; touching
// the wick lights it, the diya settles on the pool and light spreads through
// the courtyard. Personal greeting links arrive here too.
import { presetById } from '../greetings/presets.js';
import { sleep } from '../core/ui.js';
import { festivalToday } from '../config.js';

export function createIgniteWorld(ctx) {
  const $ = (s) => document.querySelector(s);
  const el = $('#world-ignite');
  const intro = $('#ignite-intro');
  const wickBtn = $('#wick-btn');
  const hint = $('#wick-hint');
  const after = $('#ignite-after');
  const received = $('#greeting-received');
  const note = $('#personal-note');
  let lighting = false;
  let unsubscribe = null;

  wickBtn.addEventListener('click', () => ignite());

  // On festival days (e.g. Dhanteras) greet the visitor and link to the story
  const fest = festivalToday();
  if (fest) {
    $('#festival-day').hidden = false;
    $('#festival-deva').textContent = fest.deva;
    $('#festival-deva').lang = 'hi';
    $('#festival-text').textContent = fest.text;
    $('#festival-link').addEventListener('click', (e) => {
      e.preventDefault();
      ctx.pendingTab = fest.tab;
      ctx.go('meaning');
    });
  }

  function placeWick() {
    const p = ctx.gl ? ctx.palace.wickScreen() : ctx.fallback.wickScreen();
    if (!p) return;
    wickBtn.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
  }

  function showIntro() {
    intro.hidden = false;
    intro.classList.remove('is-gone');
    hint.classList.remove('is-gone');
    hint.hidden = false;
    after.hidden = true;
    received.hidden = true;
    wickBtn.classList.add('is-ready');
    wickBtn.hidden = false;
    const g = ctx.greeting;
    if (g && (g.from || g.to)) {
      note.hidden = false;
      note.textContent = g.from
        ? `${g.to ? `For ${g.to}: ` : ''}${g.from} has lit a diya for you. Touch the wick to receive their wishes.`
        : `For ${g.to}: a diya has been lit for you. Touch the wick to receive it.`;
    } else {
      note.hidden = true;
    }
  }

  function showAfter() {
    intro.classList.add('is-gone');
    hint.classList.add('is-gone');
    wickBtn.classList.remove('is-ready');
    wickBtn.hidden = true;
    const g = ctx.greeting;
    if (g) {
      const p = presetById(g.lang);
      $('#received-headline').textContent = p.headline;
      $('#received-headline').lang = p.lang;
      $('#received-message').textContent = `${g.to ? `Dear ${g.to}, ` : ''}${g.message || p.message}`;
      $('#received-from').textContent = g.from ? `— ${g.from}` : '';
      received.hidden = false;
      after.hidden = true;
    } else {
      after.hidden = false;
      received.hidden = true;
    }
    ctx.setShift('panel');
  }

  async function ignite() {
    if (lighting || ctx.store.get().ignited) return;
    lighting = true;
    wickBtn.classList.remove('is-ready');
    hint.classList.add('is-gone');
    intro.classList.add('is-gone');
    ctx.audio.ignite();
    try { navigator.vibrate?.(16); } catch { /* ignore */ }
    ctx.announce('The diya is lit. Its light spreads across the palace courtyard.');
    ctx.store.set({ ignited: true });
    if (ctx.gl) {
      if (ctx.reduced) {
        ctx.palace.igniteQuick();
        ctx.palace.rig.set(ctx.palace.shots.reveal);
        showAfter();
      } else {
        const done = ctx.palace.ignite();
        await sleep(5200);
        if (ctx.current === 'ignite') showAfter();
        await done;
      }
    } else {
      await ctx.fallback.ignite();
      showAfter();
    }
    lighting = false;
    if (ctx.current === 'ignite') {
      const target = ctx.greeting ? received.querySelector('.btn') : document.getElementById('ignite-after-title');
      target?.focus({ preventScroll: true });
    }
  }

  return {
    id: 'ignite',
    el,
    get heading() { return ctx.store.get().ignited ? document.getElementById('ignite-after-title') : document.getElementById('ignite-title'); },
    async enter(prev) {
      await ctx.showScene('palace');
      if (ctx.gl) ctx.palace.setMood('none');
      if (!ctx.store.get().ignited) {
        showIntro();
        ctx.setShift('none');
        if (ctx.gl) ctx.palace.rig.goTo(ctx.palace.shots.heroClose, { duration: prev ? 2.6 : 0 });
        else ctx.fallback.setMode('courtyard');
        unsubscribe = ctx.onFrame(placeWick);
        placeWick();
      } else {
        if (ctx.gl) ctx.palace.rig.goTo(ctx.palace.shots.reveal, { duration: prev ? 3 : 0 });
        else ctx.fallback.setMode('courtyard');
        showAfter();
      }
    },
    exit() {
      unsubscribe?.();
      unsubscribe = null;
      wickBtn.classList.remove('is-ready');
    },
    onPointerDown(e, x, y) {
      if (ctx.store.get().ignited) return;
      const hit = ctx.gl ? ctx.palace.hitWick(x, y) : ctx.fallback.hitWick(x, y);
      if (hit) ignite();
    },
  };
}
