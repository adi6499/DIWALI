// World III: what Diwali means: Lakshmi Puja, the Jain nirvana of
// Mahavira, the Sikh Bandi Chhor Divas, the five days and regional customs.
// Each tab moves the camera and changes the courtyard's light (a single
// steady lamp for the Jain tradition, the golden facade mirrored in the pool
// for Bandi Chhor Divas, the rangoli and footprints for Lakshmi).
import { rovingGroup } from '../core/a11y.js';

export function createMeaningWorld(ctx) {
  const el = document.getElementById('world-meaning');
  const tablist = document.getElementById('meaning-tabs');
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  let current = 'lakshmi';

  function select(tab, { focus = false } = {}) {
    current = tab.dataset.tab;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (ctx.gl) {
      ctx.palace.setMood(current);
      ctx.palace.rig.goTo(ctx.palace.shots[current], { duration: 2.8 });
    }
    ctx.audio.bell({ gain: 0.04, pitch: 1.2 });
  }

  rovingGroup(tablist, '[role="tab"]', (t) => select(t));

  return {
    id: 'meaning',
    el,
    heading: document.getElementById('meaning-title'),
    async enter() {
      await ctx.showScene('palace');
      ctx.ensureLit(true);
      ctx.setShift('panel');
      if (ctx.pendingTab) { current = ctx.pendingTab; ctx.pendingTab = null; }
      select(tabs.find((t) => t.dataset.tab === current) || tabs[0]);
    },
    exit() {
      if (ctx.gl) ctx.palace.setMood('none');
    },
  };
}
