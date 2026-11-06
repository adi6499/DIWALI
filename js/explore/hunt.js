// Five small things hidden around the courtyard: Lakshmi's owl, Ganesha's
// mouse, a peacock, a cow and a conch. Each is modelled from a few simple
// shapes and lit softly so it can be found in the dark by someone looking.
// Now and then an unfound one gives off a tiny glint. Tapping one opens its
// story; the journal's hint shows a steady sparkle and scrolls to where it
// can be seen.
import * as THREE from '../lib/three.js';
import { t } from '../i18n/index.js';
import { openDialog } from '../core/ui.js';

const mat = (color, { rough = 0.6, metal = 0, emissive = 0x000000, glow = 0 } = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: glow });

function mesh(geo, m, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.rotation.set(rx, ry, rz);
  return o;
}

const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

// --- the five, each facing +z in its own space ----------------------------------
function makeOwl() {
  const g = new THREE.Group();
  const feather = mat(0xf3e6cf, { rough: 0.85, emissive: 0x6a4a24, glow: 0.35 });
  const wing = mat(0xc9b18c, { rough: 0.85, emissive: 0x2a1c0c, glow: 0.3 });
  const face = mat(0xfff9ef, { rough: 0.7, emissive: 0x4a3a24, glow: 0.4 });
  const eye = mat(0x1a0d05, { rough: 0.2, emissive: 0xffa53a, glow: 1.6 });
  const beak = mat(0xc58a3a, { rough: 0.5 });
  g.add(mesh(sphere(0.1), feather, [0, 0.12, 0], [1, 1.25, 0.9]));
  g.add(mesh(sphere(0.078), feather, [0, 0.27, 0.005]));
  g.add(mesh(new THREE.CircleGeometry(0.062, 20), face, [0, 0.268, 0.069], [1, 0.92, 1]));
  for (const s of [-1, 1]) {
    g.add(mesh(sphere(0.017, 10, 8), eye, [s * 0.027, 0.276, 0.07]));
    g.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 6), feather, [s * 0.05, 0.345, 0.0], [1, 1, 1], [0, 0, -s * 0.35]));
    g.add(mesh(sphere(0.07, 10, 8), wing, [s * 0.075, 0.12, -0.01], [0.42, 1.15, 0.85], [0, 0, s * 0.12]));
    g.add(mesh(sphere(0.014, 8, 6), beak, [s * 0.03, 0.006, 0.05], [1.3, 0.6, 1.4]));
  }
  g.add(mesh(new THREE.ConeGeometry(0.011, 0.03, 6), beak, [0, 0.252, 0.077], [1, 1, 1], [Math.PI * 0.85, 0, 0]));
  return { group: g, radius: 0.2, center: [0, 0.18, 0], animate: (o, t) => { o.children[1].rotation.y = Math.sin(t * 0.5) * 0.5; } };
}

function makeMouse() {
  const g = new THREE.Group();
  const fur = mat(0x8c7a68, { rough: 0.9, emissive: 0x2a2018, glow: 0.35 });
  const pink = mat(0xd99a9a, { rough: 0.7, emissive: 0x3a1a1a, glow: 0.3 });
  const eye = mat(0x050302, { rough: 0.15, emissive: 0x332211, glow: 0.4 });
  const laddoo = mat(0xf2a23a, { rough: 0.8, emissive: 0x7a3a08, glow: 0.55 });
  const body = new THREE.Group();
  body.add(mesh(sphere(0.045), fur, [0, 0.042, 0], [1, 0.92, 1.55]));
  body.add(mesh(new THREE.ConeGeometry(0.03, 0.07, 12), fur, [0, 0.048, 0.078], [1, 1, 1], [Math.PI / 2, 0, 0]));
  body.add(mesh(sphere(0.008, 8, 6), pink, [0, 0.048, 0.114]));
  for (const s of [-1, 1]) {
    body.add(mesh(sphere(0.019, 10, 8), pink, [s * 0.024, 0.078, 0.058], [1, 1, 0.35]));
    body.add(mesh(sphere(0.0065, 8, 6), eye, [s * 0.017, 0.06, 0.088]));
  }
  const tail = new THREE.CatmullRomCurve3([[0, 0.03, -0.065], [0.03, 0.02, -0.12], [0.06, 0.028, -0.16], [0.05, 0.05, -0.2]].map((p) => new THREE.Vector3(...p)));
  body.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 12, 0.0042, 5), pink));
  g.add(body);
  g.add(mesh(sphere(0.03, 12, 10), laddoo, [0, 0.03, 0.15]));
  return { group: g, radius: 0.13, center: [0, 0.04, 0.03], animate: (o, t) => { o.children[0].position.y = Math.max(0, Math.sin(t * 7)) * 0.006; } };
}

function makePeacock() {
  const g = new THREE.Group();
  const blue = mat(0x1d4fc4, { rough: 0.35, metal: 0.35, emissive: 0x0a1f66, glow: 0.55 });
  const green = mat(0x1f7a4f, { rough: 0.45, metal: 0.25, emissive: 0x08331f, glow: 0.45 });
  const eyeGold = mat(0xd9b25f, { rough: 0.35, metal: 0.5, emissive: 0x6a4a10, glow: 0.7 });
  const eyeTeal = mat(0x15c4c9, { rough: 0.3, emissive: 0x0a8f96, glow: 1.2 });
  const beak = mat(0xd8c7a4, { rough: 0.5 });
  g.add(mesh(sphere(0.085), blue, [0, 0.14, 0], [0.9, 1.0, 1.5]));
  g.add(mesh(new THREE.CylinderGeometry(0.026, 0.045, 0.2, 10), blue, [0, 0.27, 0.09], [1, 1, 1], [0.35, 0, 0]));
  g.add(mesh(sphere(0.038), blue, [0, 0.38, 0.13]));
  g.add(mesh(new THREE.ConeGeometry(0.01, 0.04, 6), beak, [0, 0.375, 0.17], [1, 1, 1], [Math.PI / 2, 0, 0]));
  for (const s of [-1, 0, 1]) {
    g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.06, 4), blue, [s * 0.012, 0.44, 0.125], [1, 1, 1], [-0.25, 0, s * 0.3]));
    g.add(mesh(sphere(0.008, 6, 5), eyeTeal, [s * 0.021, 0.47, 0.118]));
  }
  // the train, fanned up behind the body
  const fan = new THREE.Group();
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = -1.2 + (i / (n - 1)) * 2.4;
    const f = new THREE.Group();
    f.add(mesh(new THREE.BoxGeometry(0.05, 0.56, 0.008), green, [0, 0.28, 0]));
    f.add(mesh(sphere(0.034, 12, 8), eyeGold, [0, 0.52, 0.006], [1, 1.25, 0.3]));
    f.add(mesh(sphere(0.019, 10, 8), eyeTeal, [0, 0.52, 0.013], [1, 1.25, 0.3]));
    f.rotation.z = a;
    fan.add(f);
  }
  fan.position.set(0, 0.16, -0.1);
  fan.rotation.x = -0.32;
  g.add(fan);
  return { group: g, radius: 0.45, center: [0, 0.3, -0.05], animate: (o, t) => { fan.rotation.x = -0.32 + Math.sin(t * 1.3) * 0.04; } };
}

function makeCow() {
  const g = new THREE.Group();
  const hide = mat(0xf0e7d8, { rough: 0.85, emissive: 0x3a3020, glow: 0.35 });
  const muzzle = mat(0xb9a59a, { rough: 0.8, emissive: 0x2a2018, glow: 0.25 });
  const horn = mat(0xd2452a, { rough: 0.5, emissive: 0x5a1408, glow: 0.4 });
  const marigold = mat(0xf29a2e, { rough: 0.8, emissive: 0x7a3a06, glow: 0.6 });
  const tilak = mat(0xc8102e, { rough: 0.5, emissive: 0x6a0010, glow: 0.6 });
  const eye = mat(0x0a0604, { rough: 0.2 });
  g.add(mesh(sphere(0.2, 18, 12), hide, [0, 0.17, 0], [0.95, 0.82, 1.55]));
  g.add(mesh(sphere(0.08, 12, 10), hide, [0, 0.31, 0.16], [1, 0.8, 1]));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), hide, [s * 0.13, 0.05, 0.2], [1, 1, 1], [Math.PI / 2, 0, 0]));
  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.33);
  head.add(mesh(sphere(0.09, 14, 10), hide, [0, 0, 0], [0.9, 1.0, 1.25]));
  head.add(mesh(sphere(0.06, 12, 10), muzzle, [0, -0.035, 0.1], [1, 0.8, 0.9]));
  head.add(mesh(sphere(0.012, 8, 6), tilak, [0, 0.05, 0.085]));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.ConeGeometry(0.016, 0.12, 8), horn, [s * 0.06, 0.1, -0.01], [1, 1, 1], [0, 0, -s * 0.55]));
    head.add(mesh(sphere(0.04, 10, 8), hide, [s * 0.1, 0.035, -0.02], [1.2, 0.5, 0.7], [0, 0, s * 0.4]));
    head.add(mesh(sphere(0.011, 8, 6), eye, [s * 0.05, 0.025, 0.07]));
  }
  g.add(head);
  g.add(mesh(new THREE.TorusGeometry(0.095, 0.022, 8, 18), marigold, [0, 0.27, 0.27], [1, 1, 1], [Math.PI / 2.4, 0, 0]));
  return { group: g, radius: 0.36, center: [0, 0.2, 0.08], animate: (o, t) => { head.rotation.x = Math.sin(t * 0.7) * 0.08; head.rotation.y = Math.sin(t * 0.31) * 0.25; } };
}

function makeConch() {
  const g = new THREE.Group();
  const shell = mat(0xf7f0e6, { rough: 0.25, metal: 0.05, emissive: 0x4a4038, glow: 0.45 });
  const lip = mat(0xf2b8a8, { rough: 0.3, emissive: 0x4a2018, glow: 0.35 });
  const leaf = mat(0x2f7a3a, { rough: 0.7, emissive: 0x0c2a10, glow: 0.3 });
  const pad = new THREE.CircleGeometry(0.24, 28, 0.25, Math.PI * 2 - 0.5);
  pad.rotateX(-Math.PI / 2);
  g.add(mesh(pad, leaf, [0, 0.006, 0]));
  const prof = [[0.001, 0], [0.028, 0.012], [0.06, 0.05], [0.07, 0.09], [0.062, 0.12], [0.045, 0.15], [0.028, 0.175], [0.016, 0.2], [0.006, 0.225], [0.001, 0.235]];
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const c = new THREE.Group();
  c.add(new THREE.Mesh(body, shell));
  for (let i = 0; i < 4; i++) c.add(mesh(new THREE.TorusGeometry(0.06 - i * 0.012, 0.006, 6, 18), shell, [0, 0.11 + i * 0.03, 0], [1, 1, 1], [Math.PI / 2, 0, 0]));
  c.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI * 1.1), lip, [0.02, 0.06, 0.02], [1, 1.4, 1], [0, 0.6, 0]));
  c.rotation.set(0, 0.5, -Math.PI / 2);
  c.position.set(0.1, 0.07, 0);
  g.add(c);
  return { group: g, radius: 0.18, center: [0, 0.06, 0], animate: (o, time) => { o.position.y = o.userData.baseY + Math.sin(time * 1.1) * 0.012; o.rotation.y = o.userData.baseRot + Math.sin(time * 0.4) * 0.15; } };
}

// Where each one hides, which section shows it best (for hints), and which
// way it faces (towards where the camera passes).
export const SPOTS = {
  owl: { make: makeOwl, pos: [-4.58, 3.36, 2.59], face: [-7, 6.5], section: 'm-days', scale: 0.8 },
  mouse: { make: makeMouse, pos: [-0.28, 0, 15.28], face: [-0.62, 15.0], section: 'm-dhanteras', scale: 1.25 },
  peacock: { make: makePeacock, pos: [3.2, 0, -12.8], face: [-3.9, -0.4], section: 'story-2', scale: 1.0 },
  cow: { make: makeCow, pos: [4.6, 0, 4.4], face: [0, 13.4], section: 'ignite', scale: 1.05 },
  conch: { make: makeConch, pos: [0.75, -0.3, -2.7], face: [0.5, 0.62], section: 'm-jain', scale: 1.0 },
};

function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,248,220,1)');
  r.addColorStop(0.18, 'rgba(255,214,140,0.85)');
  r.addColorStop(0.5, 'rgba(255,170,70,0.18)');
  r.addColorStop(1, 'rgba(255,150,50,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,240,200,0.9)';
  g.fillRect(31, 4, 2, 56);
  g.fillRect(4, 31, 56, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHunt(ctx, journal) {
  const palace = ctx.palace;
  const scene = palace.handle.scene;
  const camera = palace.handle.camera;
  const root = new THREE.Group();
  root.name = 'Hunt';
  const tex = sparkleTexture();
  const items = [];
  for (const [id, spot] of Object.entries(SPOTS)) {
    const made = spot.make();
    const o = made.group;
    o.position.set(...spot.pos);
    o.scale.setScalar(spot.scale);
    o.rotation.y = Math.atan2(spot.face[0] - spot.pos[0], spot.face[1] - spot.pos[2]);
    o.userData.baseY = o.position.y;
    o.userData.baseRot = o.rotation.y;
    const glints = new THREE.SpriteMaterial({ map: tex, color: 0xffd28a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glint = new THREE.Sprite(glints);
    glint.renderOrder = 6;
    root.add(o, glint);
    const center = new THREE.Vector3(...made.center).multiplyScalar(spot.scale);
    const mats = new Set();
    o.traverse((m) => { if (m.isMesh) mats.add(m.material); });
    items.push({ id, o, glint, made, center, mats: [...mats], base: [...mats].map((m) => m.emissiveIntensity), next: 3 + Math.random() * 6, glow: 0, hint: 0, spot });
  }
  const ready = ctx.engine.warm(root, camera, scene).catch(() => {}).then(() => scene.add(root));

  const dlg = document.getElementById('find-dialog');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  function show(item) {
    const r = journal.found(item.id);
    document.getElementById('find-count').textContent = t('hunt.count', { n: r.n, total: r.total });
    document.getElementById('find-title').textContent = t(`hunt.${item.id}.name`);
    document.getElementById('find-text').textContent = t(`hunt.${item.id}.story`);
    item.glow = 1;
    item.hint = 0;
    if (r.first) {
      ctx.audio.bell?.({ which: 'temple', gain: 0.2, pitch: 1.12 });
      try { navigator.vibrate?.([10, 40, 14]); } catch { /* ignore */ }
    }
    setTimeout(() => openDialog(dlg), r.first ? 420 : 0);
  }

  const w = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  return {
    ready,
    onTap(x, y) {
      if (ctx.engine.active !== palace.handle || ctx.engine.incoming) return false;
      const px = ctx.engine.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      camera.getWorldPosition(camPos);
      let best = null;
      let bestD = Infinity;
      for (const it of items) {
        w.copy(it.center).applyEuler(it.o.rotation).add(it.o.position);
        const dist = camPos.distanceTo(w);
        if (dist > 30) continue;
        const p = ctx.engine.project(w, camera);
        if (!p) continue;
        const reach = Math.max(30, (it.made.radius * it.spot.scale / dist) * px * 1.25);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < reach && d / reach < bestD) { bestD = d / reach; best = it; }
      }
      if (!best) return false;
      show(best);
      return true;
    },
    /** A steady sparkle on it, and a scroll to where it can be seen. */
    hint(id) {
      const it = items.find((i) => i.id === id);
      if (!it) return;
      it.hint = 10;
      ctx.scrollToId(it.spot.section);
      ctx.toast(t('hunt.hintGiven'), { timeout: 7000, action: { label: t('hunt.collect'), onClick: () => show(it) } });
    },
    reset() { for (const it of items) { it.glow = 0; it.hint = 0; } },
    update(dt, time) {
      camera.getWorldPosition(camPos);
      for (const it of items) {
        it.made.animate(it.o, time);
        const found = journal.isFound(it.id);
        // found ones keep a soft golden glow; a fresh find blazes for a moment
        if (it.glow > 0) it.glow = Math.max(0, it.glow - dt * 0.6);
        const boost = (found ? 0.5 : 0) + it.glow * 2.5;
        it.mats.forEach((m, k) => { m.emissiveIntensity = it.base[k] * (1 + boost); });
        // the occasional glint, only when the camera is fairly close
        w.copy(it.center).applyEuler(it.o.rotation).add(it.o.position);
        it.glint.position.copy(w).add(new THREE.Vector3(it.made.radius * 0.6 * it.spot.scale, it.made.radius * 0.7 * it.spot.scale, 0));
        let a = 0;
        if (it.hint > 0) {
          it.hint -= dt;
          a = 0.65 + 0.35 * Math.sin(time * 6);
        } else if (!found && camPos.distanceTo(w) < 16) {
          it.next -= dt;
          if (it.next < 0.9 && it.next > 0) a = Math.sin((it.next / 0.9) * Math.PI);
          if (it.next <= 0) it.next = 4 + Math.random() * 7;
        }
        it.glint.material.opacity = a;
        const sc = (0.22 + 0.5 * it.made.radius) * it.spot.scale * (it.hint > 0 ? 1.6 : 1);
        it.glint.scale.set(sc, sc, 1);
        it.glint.visible = a > 0.01;
      }
    },
  };
}
