// World V: the ocean of wishes. Wishes are kept on this device only
// (localStorage). If a public wish wall endpoint is configured, a wish is sent
// there only when its author ticks the consent box for that wish.
import { WISH_ENDPOINT, STORAGE_KEYS } from '../config.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { openDialog, shareContent } from '../core/ui.js';
import { t, locale, onLangChange } from '../i18n/index.js';

const MAX = 40;

export function createWishesWorld(ctx) {
  const el = document.getElementById('wishes');
  const form = document.getElementById('wish-form');
  const text = document.getElementById('wish-text');
  const count = document.getElementById('wish-count');
  const list = document.getElementById('wish-list');
  const total = document.getElementById('wish-total');
  const consentBox = document.getElementById('wish-public');
  const consent = document.getElementById('wish-consent');
  const dialog = document.getElementById('wish-dialog');
  const floatHost = document.getElementById('float-words');
  let river = null;
  let wishes = readJSON(STORAGE_KEYS.wishes, []);
  if (!Array.isArray(wishes)) wishes = [];
  let placed = false;
  let openWish = null;
  const floating = [];
  let unsubscribe = null;

  if (WISH_ENDPOINT) {
    consentBox.hidden = false;
    const note = document.getElementById('wish-privacy-text');
    note.removeAttribute('data-i18n');
    const say = () => { note.textContent = t('wish.privacyWall'); };
    say();
    onLangChange(say);
  }

  text.addEventListener('input', () => { count.textContent = `${text.value.length} / 160`; });

  function save() { writeJSON(STORAGE_KEYS.wishes, wishes.slice(-MAX)); }

  function renderList() {
    list.textContent = '';
    total.textContent = String(wishes.length);
    for (const w of [...wishes].reverse()) {
      const li = document.createElement('li');
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = w.text;
      const d = document.createElement('span');
      d.className = 'fine';
      d.textContent = new Date(w.created).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
      body.append(p, d);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg>';
      del.setAttribute('aria-label', t('wish.remove', { text: w.text.slice(0, 40) }));
      del.addEventListener('click', () => remove(w.id));
      li.append(body, del);
      list.append(li);
    }
  }

  function remove(id) {
    wishes = wishes.filter((w) => w.id !== id);
    save();
    if (ctx.gl) river?.removeWish(id); else ctx.fallback.removeWish(id);
    renderList();
    ctx.announce(t('wish.removed'));
  }

  document.getElementById('wish-clear').addEventListener('click', () => {
    if (!wishes.length) return;
    if (!window.confirm(t('wish.confirmClear'))) return;
    wishes = [];
    save();
    if (ctx.gl) river?.clearWishes(); else ctx.fallback.clearWishes();
    renderList();
    ctx.announce(t('wish.allRemoved'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = text.value.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!value) {
      text.focus();
      ctx.toast(t('wish.writeFirst'));
      return;
    }
    const w = { id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: value, created: Date.now(), xT: (Math.random() - 0.5) * 9, zT: -9 - Math.random() * 20, ph: Math.random() * 6.28 };
    wishes.push(w);
    if (wishes.length > MAX) wishes = wishes.slice(-MAX);
    save();
    renderList();
    text.value = '';
    count.textContent = '0 / 160';
    text.blur(); // closes the phone keyboard so the river can be seen
    ctx.audio.chime();
    ctx.explore?.mark('wish');
    ctx.announce(t('wish.floating'));
    if (ctx.gl && river) {
      const item = river.addWish(w, { fresh: true });
      releaseMoment(item, value);
    } else {
      ctx.fallback.addWish(w, true);
      releaseMoment(null, value);
    }
    if (WISH_ENDPOINT && consent.checked) {
      consent.checked = false;
      try {
        await fetch(WISH_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value, lang: navigator.language || 'en', created: new Date().toISOString() }), credentials: 'omit', referrerPolicy: 'no-referrer' });
        ctx.toast(t('wish.wallShared'));
      } catch {
        ctx.toast(t('wish.wallFail'));
      }
    }
  });

  // --- the release moment ------------------------------------------------------
  // The card steps aside, the camera follows the leaf-boat diya as it floats
  // out, the wish rises above it, and then the card returns with a note.
  const card = el.querySelector('.card');
  const done = document.getElementById('wish-done');
  let caption = null;
  let releasing = null;

  function releaseMoment(item, value) {
    endRelease(true);
    const seconds = ctx.reduced ? 4 : 9;
    card.classList.add('is-releasing');
    done.hidden = true;
    caption = document.createElement('p');
    caption.className = 'release-caption';
    caption.textContent = t('wish.settingOut');
    document.body.append(caption);
    if (item) {
      floatWords(value, item);
      ctx.director.hold('river', () => {
        const p = item.mesh.position;
        return { pos: [p.x + 0.45, 1.05, p.z + 2.9], target: [p.x, 0.15, p.z - 0.6], fov: 44, focus: 3 };
      }, seconds + 1.2);
    }
    const startY = window.scrollY;
    const onScroll = () => { if (Math.abs(window.scrollY - startY) > 60) endRelease(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    releasing = { timer: setTimeout(() => endRelease(), seconds * 1000), onScroll };
  }

  function endRelease(silent = false) {
    if (!releasing) return;
    clearTimeout(releasing.timer);
    window.removeEventListener('scroll', releasing.onScroll);
    releasing = null;
    ctx.director.cancelHold();
    caption?.remove();
    caption = null;
    card.classList.remove('is-releasing');
    if (!silent) {
      done.hidden = false;
      done.focus({ preventScroll: true });
    }
  }

  function floatWords(value, item) {
    const span = document.createElement('span');
    span.className = 'float-word';
    span.textContent = value;
    floatHost.append(span);
    floating.push({ span, item, born: performance.now() });
  }

  function updateFloating() {
    const now = performance.now();
    for (let i = floating.length - 1; i >= 0; i--) {
      const f = floating[i];
      const age = (now - f.born) / 1000;
      const p = river?.projectWish(f.item);
      if (age > 9 || !p || ctx.director.group !== 'wishes') { f.span.remove(); floating.splice(i, 1); continue; }
      const a = age < 0.8 ? age / 0.8 : Math.max(0, 1 - (age - 6) / 3);
      f.span.style.opacity = a.toFixed(3);
      f.span.style.transform = `translate(-50%, -100%) translate3d(${p.x.toFixed(1)}px, ${(p.y - age * 10).toFixed(1)}px, 0)`;
    }
  }

  function showWish(w) {
    openWish = w;
    document.getElementById('wish-dialog-text').textContent = w.text;
    document.getElementById('wish-dialog-date').textContent = w.created ? t('wish.released', { date: new Date(w.created).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' }) }) : '';
    openDialog(dialog);
  }

  document.getElementById('wish-dialog-share').addEventListener('click', async () => {
    if (!openWish) return;
    // Sharing is always the author's own explicit action, through their device's share sheet.
    const r = await shareContent({ title: t('wish.shareTitle'), text: `“${openWish.text}”\n🪔 ${t('wish.shareText')}`, url: `${location.origin}${location.pathname}#/wishes` });
    if (r === 'copied') ctx.toast(t('wish.copied'));
  });

  /** Put this visitor's earlier wishes back on the water once the river exists. */
  function place() {
    if (placed) return;
    if (ctx.gl) {
      if (!river) return;
      river.awaken();
      for (const w of wishes) river.addWish(w);
    } else {
      for (const w of wishes) ctx.fallback.addWish(w, false);
    }
    placed = true;
  }

  renderList();

  return {
    id: 'wishes',
    el,
    /** Called when the river scene has loaded. */
    riverReady(r) { river = r; place(); },
    async enter() {
      if (ctx.gl && !river) river = await ctx.getRiver();
      place();
      if (ctx.gl && !unsubscribe) unsubscribe = ctx.onFrame(updateFloating);
      renderList();
    },
    exit() {
      endRelease(true);
      unsubscribe?.();
      unsubscribe = null;
      for (const f of floating) f.span.remove();
      floating.length = 0;
    },
    onTap(e, x, y) {
      const hit = ctx.gl ? river?.pickWish(x, y) : ctx.fallback.pickWish(x, y);
      if (hit) {
        const w = wishes.find((k) => k.id === hit.id) || hit;
        showWish(w);
      }
    },
  };
}
