// V. Fireworks of light over the palace. While this part of the journey is
// on screen a gentle show plays by itself; tap the sky to launch the chosen
// shell, drop an anar or chakri on the courtyard floor, or choose the sparkler
// and drag to write with light. Launches are limited to three a second so the
// sky never strobes; reduced motion softens the flashes further.
import * as THREE from '../lib/three.js';
import { rovingGroup, setChecked } from '../core/a11y.js';
import { t } from '../i18n/index.js';

const label = (type) => t(`fw.${type}`);
const SHOW = ['peony', 'willow', 'lotus', 'chrysanthemum', 'ring', 'palm', 'crossette'];

export function createFireworksWorld(ctx) {
  const el = document.getElementById('fireworks');
  const group = document.getElementById('fw-types');
  const finaleBtn = document.getElementById('fw-finale');
  const stage = document.getElementById(ctx.gl ? 'stage' : 'fallback-stage');
  let type = 'peony';
  let fw = null;
  let sparkling = null;
  let unsubscribe = null;
  let showTimer = 0;
  let active = false;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const skyPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 38);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  rovingGroup(group, '[data-fw]', (b) => {
    setChecked(group, '[data-fw]', b);
    type = b.dataset.fw;
    // The sparkler needs dragging on the sky, so the sky stops scrolling the page
    stage.classList.toggle('is-drawing', type === 'sparkler' && active);
    ctx.announce(type === 'sparkler' ? t('fw.sparklerSelected') : t('fw.selected', { name: label(type) }));
  });
  setChecked(group, '[data-fw]', group.querySelector('[aria-checked="true"]'));

  function rayFrom(x, y) {
    const cam = ctx.palace.handle.camera;
    ndc.set((x / ctx.engine.width) * 2 - 1, -(y / ctx.engine.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray;
  }

  function targetFor(kind, x, y) {
    const r = rayFrom(x, y);
    if (kind === 'anar' || kind === 'chakri') {
      if (r.ray.intersectPlane(floorPlane, hit) && Math.abs(hit.x) < 10 && hit.z > -19 && hit.z < 13 && !(Math.abs(hit.x) < 3 && hit.z < 1.5 && hit.z > -12.5)) {
        return hit.clone();
      }
      return new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4), 0, -6 - Math.random() * 10);
    }
    if (!r.ray.intersectPlane(skyPlane, hit)) hit.set(0, 24, -38);
    hit.x = THREE.MathUtils.clamp(hit.x, -22, 22);
    hit.y = THREE.MathUtils.clamp(hit.y, 15, 34);
    return hit.clone();
  }

  function launchAt(x, y, kind = type) {
    if (!ctx.gl) {
      ctx.fallback.launch(x, y);
      ctx.audio.launch(0);
      setTimeout(() => ctx.audio.burst({ distance: 60 }), 1200);
      return;
    }
    if (!fw) return;
    if (!fw.canLaunch() && kind !== 'anar' && kind !== 'chakri') return;
    fw.launch(kind, targetFor(kind, x, y));
    return true;
  }

  function randomLaunch(kind = type) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    launchAt(w * (0.2 + Math.random() * 0.6), kind === 'anar' || kind === 'chakri' ? h * 0.8 : h * (0.1 + Math.random() * 0.22), kind);
  }

  document.getElementById('fw-launch').addEventListener('click', () => {
    if (type === 'sparkler') { ctx.toast(t('fw.sparklerHint')); return; }
    randomLaunch();
    ctx.explore?.bump('fireworks');
    ctx.announce(t('fw.launched', { name: label(type) }));
  });
  finaleBtn.addEventListener('click', () => {
    if (ctx.gl) fw?.finale(); else ctx.fallback.finale();
    finaleBtn.disabled = true;
    ctx.explore?.mark('finale');
    ctx.announce(t('fw.finaleSaid'));
    setTimeout(() => { finaleBtn.disabled = false; }, 9000);
  });

  // A gentle show while the section is in view
  function scheduleShow() {
    clearTimeout(showTimer);
    if (!active) return;
    const wait = (ctx.reduced ? 5200 : 2400) + Math.random() * 1600;
    showTimer = setTimeout(() => {
      const near = Math.abs(ctx.director.f - ctx.director.firstOfGroup('fireworks')) < 0.45;
      if (near && !document.hidden && (!fw || fw.canLaunch())) randomLaunch(SHOW[Math.floor(Math.random() * SHOW.length)]);
      scheduleShow();
    }, wait);
  }

  function sparkleFrame(dt) {
    if (!sparkling || !fw) return;
    const r = rayFrom(sparkling.x, sparkling.y);
    fw.sparkle(r.ray.origin.clone().addScaledVector(r.ray.direction, 6), dt);
  }

  function hookSound(f) {
    f.onSound = (kind, o = {}) => {
      const a = ctx.audio;
      if (kind === 'launch') a.launch(o.pan);
      else if (kind === 'burst') a.burst(o);
      else if (kind === 'crackle') a.crackle(a.ctx ? a.ctx.currentTime : 0, 1, o.pan);
      else if (kind === 'hiss') a.hiss(o.duration, o.pan);
    };
  }

  return {
    id: 'fireworks',
    el,
    async enter() {
      active = true;
      if (ctx.gl) {
        fw = await ctx.palace.enableFireworks();
        fw.reduced = ctx.reduced;
        hookSound(fw);
        if (!unsubscribe) unsubscribe = ctx.onFrame(sparkleFrame);
      }
      stage.classList.toggle('is-drawing', type === 'sparkler');
      scheduleShow();
    },
    exit() {
      active = false;
      clearTimeout(showTimer);
      unsubscribe?.();
      unsubscribe = null;
      sparkling = null;
      stage.classList.remove('is-drawing');
      if (!ctx.gl) ctx.fallback.sparkle(null);
    },
    onTap(e, x, y) {
      if (type !== 'sparkler' && launchAt(x, y)) ctx.explore?.bump('fireworks');
    },
    onPointerDown(e, x, y) {
      if (type !== 'sparkler') return;
      sparkling = { x, y };
      if (!ctx.gl) ctx.fallback.sparkle(x, y);
      ctx.audio.hiss(1.2, 0, 0.03);
    },
    onPointerMove(e, x, y) {
      if (!sparkling) return;
      sparkling.x = x;
      sparkling.y = y;
      if (!ctx.gl) ctx.fallback.sparkle(x, y);
    },
    onPointerUp() {
      sparkling = null;
      if (!ctx.gl) ctx.fallback.sparkle(null);
    },
  };
}
