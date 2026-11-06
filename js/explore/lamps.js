// Diyas to light yourself: four rows of dark clay lamps framing the rangoli,
// each showing a faint ember. Tap one and it catches; every lamp in a row
// sings the next note of a rising scale, and a finished row flares up.
// Which lamps are lit is kept in the journal, so they stay lit on return.
import * as THREE from '../lib/three.js';
import { LampField } from '../gfx/lampField.js';
import { G } from '../config.js';
import { t } from '../i18n/index.js';

const WAVE = 100;               // this group's wave never moves; keys do the lighting
const EMBER = WAVE - 0.24;      // a dark lamp keeps a faint ember
const LIT = WAVE - 1.8;
const SCALE = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 27 / 16, 15 / 8, 2]; // Raga Yaman

function rows() {
  const out = [];
  const north = [];
  for (let i = 0; i < 8; i++) north.push([-2.8 + i * 0.8, 2.55]);
  const west = [];
  const east = [];
  for (let i = 0; i < 8; i++) { west.push([-3.45, 3.4 + i * 0.86]); east.push([3.45, 3.4 + i * 0.86]); }
  const south = [[-3.45, 10.5], [-2.8, 10.5], [-2.15, 10.5], [2.15, 10.5], [2.8, 10.5], [3.45, 10.5]];
  out.push(north, west, east, south);
  return out;
}

export function createPlayerLamps(ctx, { onChange = () => {} } = {}) {
  const palace = ctx.palace;
  const groupU = palace.groupU;
  const field = new LampField({ groupU, capacity: 40, flameH: 0.05, haloSize: 0.075, maxCoc: ctx.tier.maxCoc, segments: ctx.tier.name === 'low' ? 7 : 10 });
  const lamps = [];
  rows().forEach((row, r) => row.forEach(([x, z], k) => {
    const i = field.add({ pos: [x, 0.04, z], group: G.MISC, key: EMBER, scale: 1.12 });
    lamps.push({ i, row: r, k, pos: new THREE.Vector3(x, 0.08, z), lit: false, key: EMBER, target: EMBER, flare: 0 });
  }));
  field.build();
  field.u.uHaloIntensity.value = ctx.tier.bloom ? 0.34 : 0.6;
  const rowCount = rows().map((r) => r.length);
  groupU.uWaves.value[G.MISC] = WAVE;
  const ready = ctx.engine.warm(field.group, palace.handle.camera, palace.handle.scene)
    .catch(() => {})
    .then(() => palace.handle.scene.add(field.group));

  function light(l, { sound = true } = {}) {
    if (l.lit) return;
    l.lit = true;
    l.target = LIT;
    const inRow = lamps.filter((o) => o.row === l.row && o.lit).length;
    if (sound) ctx.audio.bell?.({ which: 'ghanti', gain: 0.06, pitch: 1.6 * SCALE[(inRow - 1) % SCALE.length] });
    try { navigator.vibrate?.(8); } catch { /* ignore */ }
    const done = lamps.filter((o) => o.lit).length;
    ctx.announce(t('lamps.lit', { n: done, total: lamps.length }));
    if (inRow === rowCount[l.row]) {
      // the whole row flares, one after another
      lamps.filter((o) => o.row === l.row).forEach((o) => { o.flare = -0.001 - o.k * 0.07; });
      setTimeout(() => {
        ctx.audio.bell?.({ which: 'temple', gain: 0.16 });
        if (done < lamps.length) ctx.toast(t('lamps.row'));
      }, 350);
    }
    onChange(lamps.filter((o) => o.lit).map((o) => lamps.indexOf(o)));
  }

  const v = new THREE.Vector3();
  return {
    total: lamps.length,
    ready,
    /** Light the dark lamp under a tap, if there is one. */
    onTap(x, y) {
      if (ctx.engine.active !== palace.handle || ctx.engine.incoming) return false;
      const cam = palace.handle.camera;
      let best = null;
      let bestD = 34;
      for (const l of lamps) {
        if (l.lit) continue;
        const p = ctx.engine.project(v.copy(l.pos), cam);
        if (!p) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { bestD = d; best = l; }
      }
      if (!best) return false;
      light(best);
      return true;
    },
    /** For keyboard and screen-reader visitors: light the next dark lamp. */
    lightNext() {
      const l = lamps.find((o) => !o.lit);
      if (l) light(l);
    },
    /** Lit on an earlier visit: light it straight away, quietly. */
    restore(idx) {
      const l = lamps[idx];
      if (!l || l.lit) return;
      l.lit = true;
      l.key = l.target = LIT;
      field.setKey(l.i, LIT);
    },
    reset() {
      for (const l of lamps) { l.lit = false; l.target = EMBER; }
    },
    update(dt) {
      groupU.uWaves.value[G.MISC] = WAVE;
      for (const l of lamps) {
        if (l.key !== l.target) {
          const step = dt * 3.2;
          l.key = l.key > l.target ? Math.max(l.target, l.key - step) : Math.min(l.target, l.key + step);
          field.setKey(l.i, l.key);
        }
        if (l.flare !== 0) {
          l.flare = Math.min(1, l.flare + dt * 1.4);
          const f = l.flare > 0 ? Math.sin(Math.PI * l.flare) : 0;
          field.setScale(l.i, 1.12 * (1 + 0.9 * f));
          if (l.flare >= 1) { l.flare = 0; field.setScale(l.i, 1.12); }
        }
      }
      field.updateCamera(palace.handle.camera, ctx.engine.height * ctx.engine.pixelRatio);
      field.setFocus(palace.rig.focus, palace.rig.aperture);
    },
  };
}
