// Blessing of the day: a golden diya at the end of the journey. Touch it and
// it gives today's blessing; tomorrow it has a new one. The choice depends
// only on the local date, so the same day always gives the same blessing.
import { t, onLangChange } from '../i18n/index.js';
import { shareContent } from '../core/ui.js';

export const BLESSINGS = 24;

export function todaysBlessing(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const day = Math.floor((d - start) / 86400000);
  return ((day * 7 + d.getFullYear()) % BLESSINGS) + 1;
}

export function createBlessing(ctx) {
  const btn = document.getElementById('blessing-btn');
  const card = document.getElementById('blessing-card');
  const text = document.getElementById('blessing-text');
  const n = todaysBlessing();
  const say = () => { text.textContent = t(`bless.${n}`); };

  btn.addEventListener('click', () => {
    say();
    const first = card.hidden;
    card.hidden = false;
    if (first) {
      ctx.audio.bell?.({ which: 'temple', gain: 0.18, pitch: 1.25 });
      ctx.explore?.mark('blessing');
    }
    card.focus({ preventScroll: true });
    ctx.announce(text.textContent);
  });
  document.getElementById('blessing-share').addEventListener('click', async () => {
    const r = await shareContent({ title: t('bless.shareTitle'), text: `${t(`bless.${n}`)}\n🪔 Deepotsav`, url: `${location.origin}${location.pathname}` });
    if (r === 'copied') ctx.toast(t('bless.copied'));
  });
  onLangChange(() => { if (!card.hidden) say(); });
}
