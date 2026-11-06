// World VII: greeting editor. Live card preview, PNG download, native share
// (with the image when the device supports it) and a personal link that
// opens Deepotsav with a diya waiting to be lit for the recipient.
import { PRESETS, presetById } from '../greetings/presets.js';
import { drawCard, ensureFonts } from '../greetings/card.js';
import { greetingUrl } from '../greetings/link.js';
import { rovingGroup, setChecked } from '../core/a11y.js';
import { canvasToBlob, downloadBlob, shareContent, copyText, sleep } from '../core/ui.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { STORAGE_KEYS, festivalToday } from '../config.js';
import { t, current, onLangChange } from '../i18n/index.js';

/** The greeting that matches the page's language (Dhanteras on its day). */
function defaultPreset() {
  if (festivalToday()?.tab === 'dhanteras') return current() === 'en' ? 'dhanteras-en' : 'dhanteras';
  return PRESETS.some((p) => p.id === current()) ? current() : 'hi';
}

export function createGreetingsWorld(ctx) {
  const el = document.getElementById('greetings');
  const canvas = document.getElementById('card-canvas');
  const to = document.getElementById('g-to');
  const from = document.getElementById('g-from');
  const lang = document.getElementById('g-lang');
  const msg = document.getElementById('g-msg');
  const styleGroup = document.getElementById('g-style');
  const accentGroup = document.getElementById('g-accent');

  const saved = readJSON(STORAGE_KEYS.greeting, {}) || {};
  const g = {
    to: saved.to || '', from: saved.from || '', lang: (saved.langChosen && saved.lang) || defaultPreset(),
    langChosen: !!saved.langChosen,
    message: saved.message ?? '', style: saved.style || 'courtyard', accent: saved.accent || 'gold',
    customMessage: !!saved.customMessage,
  };
  let background = null;
  let timer = 0;

  for (const p of PRESETS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.label;
    lang.append(o);
  }

  function syncForm() {
    to.value = g.to;
    from.value = g.from;
    lang.value = presetById(g.lang).id;
    msg.value = g.customMessage ? g.message : presetById(g.lang).message;
    setChecked(styleGroup, '[data-style]', styleGroup.querySelector(`[data-style="${g.style}"]`) || styleGroup.firstElementChild);
    setChecked(accentGroup, '[data-accent]', accentGroup.querySelector(`[data-accent="${g.accent}"]`) || accentGroup.firstElementChild);
  }

  function data() {
    return { to: g.to.trim(), from: g.from.trim(), message: msg.value.trim(), lang: g.lang, style: g.style, accent: g.accent };
  }

  function render() {
    const rangoli = ctx.rangoliImage?.() || null;
    drawCard(canvas, data(), { background, rangoli });
    const p = presetById(g.lang);
    canvas.setAttribute('aria-label', t('greet.previewAria', { text: `${p.headline}. ${g.to ? `${p.dear.replace('{to}', g.to)} ` : ''}${msg.value}${g.from ? ` — ${g.from}` : ''}` }));
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      render();
      writeJSON(STORAGE_KEYS.greeting, { to: g.to, from: g.from, lang: g.lang, langChosen: g.langChosen, message: msg.value, style: g.style, accent: g.accent, customMessage: g.customMessage });
    }, 120);
  }

  to.addEventListener('input', () => { g.to = to.value; schedule(); });
  from.addEventListener('input', () => { g.from = from.value; schedule(); });
  msg.addEventListener('input', () => { g.customMessage = true; g.message = msg.value; schedule(); });
  lang.addEventListener('change', () => {
    g.lang = lang.value;
    g.langChosen = true;
    if (!g.customMessage) msg.value = presetById(g.lang).message;
    schedule();
  });
  rovingGroup(styleGroup, '[data-style]', async (b) => {
    setChecked(styleGroup, '[data-style]', b);
    g.style = b.dataset.style;
    if (g.style === 'courtyard' && !background) await captureBackground();
    schedule();
  });
  rovingGroup(accentGroup, '[data-accent]', (b) => {
    setChecked(accentGroup, '[data-accent]', b);
    g.accent = b.dataset.accent;
    schedule();
  });

  /** A frame of the lit palace courtyard, rendered off-screen, behind the card. */
  async function captureBackground() {
    if (!ctx.gl) return;
    try {
      background = ctx.capturePalace(1080, 1350);
    } catch (err) {
      console.warn('[greetings] capture failed', err);
      background = null;
    }
  }

  async function cardBlob() {
    render();
    return canvasToBlob(canvas, 'image/png');
  }

  document.getElementById('g-download').addEventListener('click', async () => {
    try {
      downloadBlob(await cardBlob(), 'deepotsav-greeting.png');
      ctx.explore?.mark('greeting');
      ctx.toast(t('greet.saved'));
    } catch (err) {
      console.error(err);
      ctx.toast(t('greet.saveFail'));
    }
  });

  document.getElementById('g-share').addEventListener('click', async () => {
    const d = data();
    const url = greetingUrl(d);
    let file = null;
    try { file = new File([await cardBlob()], 'deepotsav-greeting.png', { type: 'image/png' }); } catch { file = null; }
    const p = presetById(d.lang);
    const text = `${p.headline}${d.to ? `, ${d.to}` : ''}! ${t('greet.shareWaiting')}`;
    const r = await shareContent({ title: p.headline, text, url, file });
    if (r === 'shared' || r === 'copied') ctx.explore?.mark('greeting');
    if (r === 'copied') ctx.toast(t('greet.shareCopied'));
    else if (r === 'unsupported') ctx.toast(t('greet.shareUnsupported'));
    if (r === 'shared' && file) {
      // Some share targets drop the URL when a file is attached; offer the link too.
      ctx.toast(t('greet.shared'), { action: { label: t('greet.copyLink'), onClick: () => copyText(url).then(() => ctx.toast(t('greet.linkCopied'))) } });
    }
  });

  document.getElementById('g-link').addEventListener('click', async () => {
    const ok = await copyText(greetingUrl(data()));
    if (ok) ctx.explore?.mark('greeting');
    ctx.toast(ok ? t('greet.personalCopied') : t('greet.copyFail'));
  });

  syncForm();

  // Until someone picks a greeting themselves, it follows the page's language
  onLangChange(() => {
    if (g.langChosen || g.customMessage) { render(); return; }
    g.lang = defaultPreset();
    syncForm();
    schedule();
  });

  return {
    id: 'greetings',
    el,
    heading: document.getElementById('greetings-title'),
    /** Pre-fill a reply to a greeting the visitor received. */
    prefillReply(received) {
      if (!received) return;
      g.to = received.from || '';
      g.from = received.to || '';
      g.lang = received.lang || g.lang;
      g.customMessage = false;
      syncForm();
    },
    async enter() {
      await ensureFonts();
      if (ctx.gl && g.style === 'courtyard' && !background) {
        await sleep(ctx.reduced ? 0 : 300);
        await captureBackground();
      }
      render();
    },
    exit() {},
  };
}
