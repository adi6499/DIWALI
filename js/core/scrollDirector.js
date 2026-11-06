// Scroll director: the page scrolls natively (so it stays accessible), and
// this maps the scroll position onto a continuous camera journey.
//
// Each <section> has an anchor (where its card sits in the middle of the
// screen) and a shot. Between two anchors the camera *flies*: like Google
// Earth, it rises for an overview on longer hops, travels while looking down
// on the courtyard, then descends into the next view. The camera rests at each
// anchor so the text can be read. The scroll value is smoothed, so wheel
// steps and flicks become one gliding motion.
//
// Moving between the palace and the river, the camera climbs into the sky
// above one, the scenes dissolve, and it descends onto the other.

import * as THREE from '../lib/three.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _t0 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _m = new THREE.Vector3();

function v3(out, a) { return Array.isArray(a) ? out.set(a[0], a[1], a[2]) : out.copy(a); }

/** Camera state between shot a and b at eased progress e. */
export function flight(a, b, e, out, { reduced = false } = {}) {
  v3(_p0, a.pos); v3(_p1, b.pos); v3(_t0, a.target); v3(_t1, b.target);
  if (reduced) e = e < 0.5 ? 0 : 1;
  const dist = _p0.distanceTo(_p1) + _t0.distanceTo(_t1) * 0.25;
  const lift = reduced ? 0 : Math.min(24, Math.max(0, dist * 0.42 - 0.6));
  const top = Math.max(_p0.y, _p1.y) + lift;
  _c1.lerpVectors(_p0, _p1, 0.22); _c1.y = lerp(_p0.y, top, 0.9);
  _c2.lerpVectors(_p0, _p1, 0.78); _c2.y = lerp(_p1.y, top, 0.9);
  const u = 1 - e;
  out.pos.set(0, 0, 0)
    .addScaledVector(_p0, u * u * u)
    .addScaledVector(_c1, 3 * u * u * e)
    .addScaledVector(_c2, 3 * u * e * e)
    .addScaledVector(_p1, e * e * e);
  // look down at the ground between the two places while high up
  _m.lerpVectors(_t0, _t1, 0.5);
  _m.y = Math.min(_t0.y, _t1.y) - lift * 0.35;
  out.target.set(0, 0, 0)
    .addScaledVector(_t0, u * u)
    .addScaledVector(_m, 2 * u * e)
    .addScaledVector(_t1, e * e);
  const arc = Math.sin(Math.PI * e);
  out.fov = lerp(a.fov ?? 50, b.fov ?? 50, e) + arc * Math.min(8, lift * 0.45);
  out.fit = lerp(a.fit || 0, b.fit || 0, e);
  const fa = a.focus ?? _p0.distanceTo(_t0);
  const fb = b.focus ?? _p1.distanceTo(_t1);
  out.focus = lerp(fa, fb, e);
  out.aperture = lerp(a.aperture ?? 0, b.aperture ?? 0, e) * (1 - arc * 0.9);
  return out;
}

const state = () => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, fit: 0, focus: 5, aperture: 0 });

export class ScrollDirector {
  constructor(ctx, sectionEls) {
    this.ctx = ctx;
    this.sections = sectionEls.map((el, i) => ({
      el,
      index: i,
      group: el.dataset.group,
      shot: el.dataset.shot,
      scene: el.dataset.scene || 'palace',
      mood: el.dataset.mood || 'none',
      shift: el.classList.contains('sec-hero') || el.classList.contains('sec-greet') || el.classList.contains('sec-end') ? 'none' : 'panel',
      card: el.querySelector('.card'),
      anchor: 0,
    }));
    this.y = window.scrollY;
    this.f = 0;
    this.current = -1;
    this.group = null;
    this.locked = true;          // the first flame owns the camera until it is lit
    this.handoff = null;
    this.holdState = null;
    this.onGroup = () => {};
    this.onSection = () => {};
    this._a = state();
    this._b = state();
    this._s = state();
    this.measure();
    let raf = 0;
    const remeasure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.measure()); };
    window.addEventListener('resize', remeasure);
    window.visualViewport?.addEventListener('resize', remeasure);
    if (window.ResizeObserver) new ResizeObserver(remeasure).observe(document.getElementById('main'));
  }

  /**
   * An anchor is the scroll position where a section's card rests at the
   * same point CSS scroll-snap settles it (centre of the snap port, which on
   * phones is pushed down by scroll-padding so the 3D shows above the card).
   */
  measure() {
    const vh = window.innerHeight;
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const place = (pad + vh) / 2 / vh;
    let prev = -1;
    for (const s of this.sections) {
      let a;
      if (s.index === 0 || !s.card) {
        a = s.index === 0 ? 0 : s.el.offsetTop;
      } else {
        const r = s.card.getBoundingClientRect();
        const top = r.top + window.scrollY;
        a = r.height > vh - pad - 40 ? top - pad - 16 : top + r.height / 2 - vh * place;
      }
      s.anchor = Math.max(prev + 1, Math.max(0, a));
      prev = s.anchor;
    }
    this.max = Math.max(1, document.documentElement.scrollHeight - vh);
  }

  /** Scroll position → fractional section index. */
  indexAt(y) {
    const s = this.sections;
    if (y <= s[0].anchor) return 0;
    for (let i = 0; i < s.length - 1; i++) {
      if (y < s[i + 1].anchor) return i + (y - s[i].anchor) / Math.max(1, s[i + 1].anchor - s[i].anchor);
    }
    return s.length - 1;
  }

  anchorOf(i) { return this.sections[Math.max(0, Math.min(this.sections.length - 1, i))].anchor; }

  firstOfGroup(group) { return this.sections.findIndex((s) => s.group === group); }

  scrollToIndex(i, { smooth = true } = {}) {
    window.scrollTo({ top: this.anchorOf(i), behavior: smooth && !this.ctx.reduced ? 'smooth' : 'auto' });
  }

  /** Release the camera to the scroll, blending from wherever it is now. */
  unlock() {
    if (!this.locked) return;
    this.locked = false;
    const rig = this.ctx.palace?.rig;
    if (rig) {
      rig._tween?.kill();
      this.handoff = { pos: rig.pos.clone(), target: rig.target.clone(), fov: rig.fov, t: 0 };
    }
  }

  /** Briefly steer the camera to a shot (e.g. following a released wish). */
  hold(scene, shot, seconds = 5) {
    this.holdState = { scene, shot, t: 0, dur: seconds };
  }

  update(dt) {
    const ctx = this.ctx;
    const k = ctx.reduced ? 40 : 5.5;
    this.y += (window.scrollY - this.y) * (1 - Math.exp(-dt * k));
    if (Math.abs(window.scrollY - this.y) < 0.3) this.y = window.scrollY;
    const f = this.indexAt(this.y);
    this.f = f;

    // progress bar
    const bar = document.getElementById('rail-progress');
    if (bar) bar.style.width = `${(clamp01(this.y / this.max) * 100).toFixed(2)}%`;

    // section / group changes follow the *real* scroll position, not the smoothed one
    const live = this.indexAt(window.scrollY);
    const cur = Math.min(this.sections.length - 1, Math.round(live));
    if (cur !== this.current) {
      const prev = this.current;
      this.current = cur;
      this.sections.forEach((s, i) => s.card?.classList.toggle('is-away', Math.abs(i - cur) > 0 && i !== 0));
      const g = this.sections[cur].group;
      if (g !== this.group) {
        const pg = this.group;
        this.group = g;
        this.onGroup(g, pg);
      }
      this.onSection(cur, prev);
    }

    if (!ctx.gl) { this._fallback(f); return; }
    this._camera(dt, f);
    this._light(f);
  }

  _shots(scene) {
    return scene === 'river' ? this.ctx.river?.shots : this.ctx.palace.shots;
  }

  _camera(dt, f) {
    const ctx = this.ctx;
    const i = Math.min(this.sections.length - 1, Math.floor(f));
    const A = this.sections[i];
    const B = this.sections[Math.min(this.sections.length - 1, i + 1)];
    const u = f - i;
    const e = smoother(clamp01((u - 0.1) / 0.8));
    const reduced = ctx.reduced;
    const palace = ctx.palace;
    const river = ctx.river;
    const engine = ctx.engine;

    let curtain = 0;
    if (A.scene === B.scene || (B.scene === 'river' && !river)) {
      const scene = A.scene === 'river' && river ? 'river' : 'palace';
      const shots = this._shots(scene);
      const sa = shots[A.shot] || shots.aerial;
      const sb = (B.scene === scene ? shots[B.shot] : shots.aerial) || sa;
      flight(sa, sb, B.scene === scene ? e : Math.min(e, 0.5), this._s, { reduced });
      if (reduced && A !== B) curtain = 1 - Math.abs(e * 2 - 1);
      const h = scene === 'river' ? river.handle : palace.handle;
      engine.setBlend(h, null, 0);
      this._apply(scene === 'river' ? river.rig : palace.rig, this._s, dt, A, B, e);
    } else {
      // palace ⇄ river: up into the sky, dissolve, down onto the other place
      const pA = A.scene === 'river' ? river : { shots: palace.shots, rig: palace.rig, handle: palace.handle };
      const pB = B.scene === 'river' ? river : { shots: palace.shots, rig: palace.rig, handle: palace.handle };
      flight(pA.shots[A.shot], pA.shots.aerial, clamp01(e / 0.55), this._a, { reduced });
      flight(pB.shots.aerial, pB.shots[B.shot], clamp01((e - 0.45) / 0.55), this._b, { reduced });
      this._apply(pA.rig, this._a, dt, A, A, 0);
      this._apply(pB.rig, this._b, dt, B, B, 0);
      const t = reduced ? (e < 0.5 ? 0 : 1) : THREE.MathUtils.smoothstep(e, 0.38, 0.62);
      if (reduced) curtain = 1 - Math.abs(e * 2 - 1);
      engine.setBlend(pA.handle, pB.handle, t);
      if (engine.composer == null && !reduced) curtain = Math.max(curtain, 1 - Math.abs(t * 2 - 1));
    }
    engine.setCurtain(curtain);
    const audioScene = this.sections[Math.round(f)].scene === 'river' ? 'river' : this.group === 'fireworks' ? 'fireworks' : 'palace';
    if (audioScene !== this._audioScene) { this._audioScene = audioScene; ctx.audio.setScene(audioScene); }
  }

  _apply(rig, s, dt, A, B, e) {
    if (rig === this.ctx.palace.rig && this.locked) return;
    let pos = s.pos;
    let target = s.target;
    let fov = s.fov;
    // smooth handover from the ignition move to the scroll
    if (this.handoff && rig === this.ctx.palace.rig) {
      this.handoff.t += dt;
      const w = smoother(clamp01(this.handoff.t / 1.4));
      pos = this.handoff.pos.clone().lerp(pos, w);
      target = this.handoff.target.clone().lerp(target, w);
      fov = lerp(this.handoff.fov, fov, w);
      if (w >= 1) this.handoff = null;
    }
    // temporary hold (e.g. watching a wish float away)
    const hs = this.holdState;
    if (hs) {
      const shots = this._shots(hs.scene);
      const sh = shots?.[hs.shot];
      const sameRig = (hs.scene === 'river' ? this.ctx.river?.rig : this.ctx.palace.rig) === rig;
      if (sh && sameRig) {
        hs.t += dt;
        const w = smoother(clamp01(hs.t / 1.2)) * smoother(clamp01((hs.dur - hs.t) / 1.6));
        pos = pos.clone().lerp(_p0.fromArray(sh.pos), w);
        target = target.clone().lerp(_t0.fromArray(sh.target), w);
        fov = lerp(fov, sh.fov ?? fov, w);
        if (hs.t >= hs.dur) this.holdState = null;
      }
    }
    rig.setDirect({ pos, target, fov, fit: s.fit, focus: s.focus, aperture: s.aperture });
    const [ax, ay] = this.ctx.shiftFor(A.shift);
    const [bx, by] = this.ctx.shiftFor(B.shift);
    rig.setShift(lerp(ax, bx, e), lerp(ay, by, e));
  }

  /** Lamps along the pool and the palace light as you scroll through the story. */
  _light(f) {
    const ctx = this.ctx;
    if (!ctx.palace.state.ignited) return;
    const s0 = this.firstOfGroup('story');
    const c = f - s0;
    const map = (x, a, b, lo, hi) => lo + (hi - lo) * clamp01((x - a) / (b - a));
    ctx.palace.setJourneyLight({
      pool: map(c, -0.7, 2.3, 0.5, 6),
      facade: map(c, 2.0, 3.0, 0, 42),
      dome: map(c, 2.4, 3.15, 0, 8),
    });
    const i = Math.floor(f);
    const A = this.sections[i];
    const B = this.sections[Math.min(this.sections.length - 1, i + 1)];
    const e = smoother(clamp01((f - i - 0.1) / 0.8));
    ctx.palace.blendMood(A.mood, B.mood, e);
  }

  _fallback(f) {
    const fb = this.ctx.fallback;
    if (!fb) return;
    const sec = this.sections[Math.round(f)];
    const mode = sec.scene === 'river' ? 'river' : sec.group === 'fireworks' ? 'fireworks' : 'courtyard';
    fb.setMode(mode);
    if (this.ctx.store.get().ignited) {
      const s0 = this.firstOfGroup('story');
      fb.setLit(Math.min(1, 0.55 + clamp01((f - s0) / 3.2) * 0.45));
    }
  }
}
