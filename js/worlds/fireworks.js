// World VI: fireworks of light over the palace. Tap the sky to launch the
// chosen shell, drop an anar or chakri on the courtyard floor, or write with
// a phuljhadi sparkler. Launches are limited to three a second so the sky
// never strobes; reduced motion softens the flashes further.
import * as THREE from '../lib/three.js';
import { rovingGroup, setChecked } from '../core/a11y.js';

const LABELS = {
  peony: 'Peony', chrysanthemum: 'Chrysanthemum', willow: 'Golden willow', lotus: 'Lotus', ring: 'Ring',
  palm: 'Palm', crossette: 'Crossette', anar: 'Anar fountain', chakri: 'Chakri', sparkler: 'Sparkler',
};

export function createFireworksWorld(ctx) {
  const el = document.getElementById('world-fireworks');
  const group = document.getElementById('fw-types');
  const finaleBtn = document.getElementById('fw-finale');
  let type = 'peony';
  let fw = null;
  let sparkling = null; // { x, y } screen
  let unsubscribe = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const skyPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 38);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  rovingGroup(group, '[data-fw]', (b) => {
    setChecked(group, '[data-fw]', b);
    type = b.dataset.fw;
    ctx.announce(`${LABELS[type]} selected.`);
  });
  setChecked(group, '[data-fw]', group.querySelector('[aria-checked="true"]'));

  function rayFrom(x, y) {
    const cam = ctx.palace.handle.camera;
    ndc.set((x / ctx.engine.width) * 2 - 1, -(y / ctx.engine.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    return ray;
  }

  function targetFor(x, y) {
    const r = rayFrom(x, y);
    if (type === 'anar' || type === 'chakri') {
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

  function launchAt(x, y) {
    if (!ctx.gl) { ctx.fallback.launch(x, y); ctx.audio.launch(0); setTimeout(() => ctx.audio.burst({ distance: 60 }), 1200); return; }
    if (!fw) return;
    if (!fw.canLaunch() && type !== 'anar' && type !== 'chakri') return;
    fw.launch(type, targetFor(x, y));
    ctx.announce(`${LABELS[type]} launched.`);
  }

  function randomLaunch() {
    const w = ctx.gl ? ctx.engine.width : window.innerWidth;
    const h = ctx.gl ? ctx.engine.height : window.innerHeight;
    const x = w * (0.2 + Math.random() * 0.6);
    const y = h * (0.12 + Math.random() * 0.25);
    if (type === 'sparkler') {
      ctx.toast('Drag across the sky to write with the sparkler.');
      return;
    }
    launchAt(x, type === 'anar' || type === 'chakri' ? h * 0.8 : y);
  }

  document.getElementById('fw-launch').addEventListener('click', randomLaunch);
  finaleBtn.addEventListener('click', () => {
    if (ctx.gl) fw?.finale(); else ctx.fallback.finale();
    finaleBtn.disabled = true;
    ctx.announce('Grand finale.');
    setTimeout(() => { finaleBtn.disabled = false; }, 9000);
  });

  function sparkleFrame(dt) {
    if (!sparkling || !fw) return;
    const r = rayFrom(sparkling.x, sparkling.y);
    const p = r.ray.origin.clone().addScaledVector(r.ray.direction, 6);
    fw.sparkle(p, dt);
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
    heading: document.getElementById('fireworks-title'),
    async enter() {
      await ctx.showScene('palace');
      ctx.ensureLit(true);
      ctx.audio.setScene('fireworks');
      if (ctx.gl) {
        ctx.palace.setMood('none');
        ctx.palace.rig.goTo(ctx.palace.shots.fireworks, { duration: 3 });
        fw = await ctx.palace.enableFireworks();
        fw.reduced = ctx.reduced;
        hookSound(fw);
        unsubscribe = ctx.onFrame(sparkleFrame);
        // A welcome shell so the sky is never empty
        setTimeout(() => { if (ctx.current === 'fireworks' && fw.canLaunch()) fw.launch('willow', new THREE.Vector3(-6, 24, -38)); }, 1600);
      } else {
        ctx.fallback.setMode('fireworks');
        ctx.fallback.lightAll();
      }
      ctx.setShift('panel');
    },
    exit() {
      unsubscribe?.();
      unsubscribe = null;
      sparkling = null;
      if (!ctx.gl) ctx.fallback.sparkle(null);
      ctx.audio.setScene('palace');
    },
    onPointerDown(e, x, y) {
      if (type === 'sparkler') {
        sparkling = { x, y };
        if (!ctx.gl) ctx.fallback.sparkle(x, y);
        ctx.audio.hiss(1.2, 0, 0.03);
        return;
      }
      launchAt(x, y);
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
