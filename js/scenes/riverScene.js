// The ocean of wishes: stone ghats descending into dark water, thousands of
// floating diyas drifting on the current, a far shore of temples outlined in
// lamps, and your own wish-diyas in leaf boats with marigolds.
// Loaded lazily the first time the visitor reaches world V.

import * as THREE from '../lib/three.js';
import { gsap } from '../lib/gsap.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { G } from '../config.js';
import { createGroupUniforms, LampField, DecalField, tweenWave } from '../gfx/lampField.js';
import { LampLights } from '../gfx/lighting.js';
import { createSky } from '../gfx/sky.js';
import { createWater } from '../gfx/water.js';
import { makeSmallDiyaGeometry } from '../gfx/heroDiya.js';
import * as TX from '../gfx/textures.js';
import { CameraRig } from '../core/cameraRig.js';

export const RIVER_SHOTS = {
  river: { pos: [0, 2.7, 9.8], target: [0, 0.9, -60], fov: 50, aperture: 0.35, focus: 14 },
  release: { pos: [0.3, 1.75, 7.0], target: [0, 0.05, -8], fov: 46, aperture: 0.4, focus: 7 },
  riverGreeting: { pos: [2.4, 1.9, 7.6], target: [-1.2, 0.3, -12], fov: 48, aperture: 0.3, focus: 10 },
  riverEnd: { pos: [0, 10, 26], target: [0, 1.5, -140], fov: 52, aperture: 0 },
  aerial: { pos: [0, 62, 46], target: [0, 0, -90], fov: 56, aperture: 0 },
};

const waveH = (x, z, t) => 0.045 * Math.sin(x * 0.35 + t * 0.9) + 0.035 * Math.sin(z * 0.52 - t * 1.1 + x * 0.21) + 0.018 * Math.sin((x + z) * 0.95 + t * 1.7);
const rnd = Math.random;
const V2 = (x, y) => new THREE.Vector2(x, y);
const MAX_WISHES = 40;
const TIP = new THREE.Vector3();

export async function createRiverScene({ engine, tier }) {
  const low = tier.name === 'low';
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080a1f, 0.0042);
  scene.userData.prepass = true;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1500);
  const rig = new CameraRig(camera);
  rig.set(RIVER_SHOTS.river);
  rig.parallaxAmount = 0.2;
  const groupU = createGroupUniforms();
  const lights = new LampLights(groupU, Math.min(4, tier.lampLights));

  // --- ghats ---------------------------------------------------------------
  const wallTex = TX.ashlar(low ? 256 : 512);
  const Std = tier.material === 'lambert' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const stoneOpts = { map: wallTex, color: 0xd2b48c };
  if (tier.material !== 'lambert') stoneOpts.roughness = 0.9;
  const stone = lights.patch(new Std(stoneOpts));
  const parts = [];
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const y = 1.9 - i * 0.24;
    const z = 10.5 - i * 0.95;
    const g = new THREE.BoxGeometry(84, 0.24, 1.0).toNonIndexed();
    g.translate(0, y - 0.12, z);
    parts.push(g);
    const front = new THREE.BoxGeometry(84, y + 1.2, 0.2).toNonIndexed();
    front.translate(0, (y - 1.2) / 2 - 0.12, z - 0.5);
    parts.push(front);
  }
  const ghatGeo = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }), false);
  worldUV(ghatGeo, 0.5);
  const ghat = new THREE.Mesh(ghatGeo, stone);
  ghat.layers.enable(1);
  scene.add(ghat);

  // ghat lamps on step edges + pavilions
  const ghatLamps = new LampField({ groupU, capacity: 900, reflect: { y: 0, bounds: [-1e5, 1e5, -1e5, 1e5] }, maxCoc: tier.maxCoc, segments: low ? 6 : 9 });
  const decals = new DecalField({ groupU, capacity: 900 });
  const dens = tier.lampDensity;
  for (const i of [2, 4, 6, 8]) {
    const y = 1.9 - i * 0.24;
    const z = 10.5 - i * 0.95 - 0.38;
    const spacing = 0.55 / dens;
    for (let x = -16; x <= 16; x += spacing) {
      if (Math.abs(x) < 0.9 && i > 5) continue;
      ghatLamps.add({ pos: [x + (rnd() - 0.5) * 0.1, y + 0.036, z], group: G.FLOOR, key: Math.abs(x) * 0.3 + i * 0.2 });
      if (rnd() < 0.5) decals.add({ pos: [x, y, z], radius: 0.45, intensity: 0.4, group: G.FLOOR, key: Math.abs(x) * 0.3 });
    }
  }
  lights.add({ pos: [-6, 2.2, 6], intensity: 2.0, radius: 14, group: G.FLOOR, key: 2, priority: 1, only: 'all' });
  lights.add({ pos: [6, 2.2, 6], intensity: 2.0, radius: 14, group: G.FLOOR, key: 2, priority: 1, only: 'all' });
  lights.add({ pos: [0, 1.2, 3.5], intensity: 2.0, radius: 10, group: G.FLOOR, key: 1, priority: 1, only: 'all' });
  lights.finalize(tier.name);

  // --- far shore: temples and palaces in silhouette, outlined in lamps -----
  const skyline = [];
  const shoreLamps = new LampField({
    groupU, bodies: false, capacity: tier.skylineLamps + 50, reflect: { y: 0, bounds: [-1e5, 1e5, -1e5, 1e5] },
    flameH: 0.034, haloSize: 0.1, maxCoc: 2,
  });
  shoreLamps.u.uMinPx.value = 1.4;
  shoreLamps.u.uStretch.value = 9;
  const shoreZ = -290;
  let budget = tier.skylineLamps;
  const lampLine = (x0, x1, y, z, spacing) => {
    for (let x = x0; x <= x1 && budget > 0; x += spacing) { shoreLamps.add({ pos: [x, y, z], group: G.FLOOR, key: 0, scale: 5 }); budget--; }
  };
  for (let x = -360; x < 360;) {
    const w = 8 + rnd() * 18;
    const h = 3 + rnd() * 10;
    const z = shoreZ - rnd() * 30;
    const b = new THREE.BoxGeometry(w, h, 8).toNonIndexed();
    b.translate(x + w / 2, h / 2, z);
    skyline.push(b);
    const kind = rnd();
    if (kind < 0.3) {
      const sh = 8 + rnd() * 14;
      const pts = [[w * 0.28, 0], [w * 0.27, sh * 0.2], [w * 0.22, sh * 0.5], [w * 0.13, sh * 0.8], [w * 0.05, sh * 0.96], [0.4, sh], [0.001, sh * 1.06]].map(([r, y]) => V2(r, y));
      const s = new THREE.LatheGeometry(pts, 8).toNonIndexed();
      s.translate(x + w / 2, h, z);
      skyline.push(s);
      if (budget > 0) for (let k = 0; k < 6; k++) { shoreLamps.add({ pos: [x + w / 2 + (k % 2 ? 1 : -1) * w * 0.27 * (1 - k / 7), h + sh * (k / 6) * 0.9, z + 4.2], group: G.FLOOR, key: 0, scale: 5 }); budget--; }
    } else if (kind < 0.5) {
      const R = Math.min(w, 10) * 0.4;
      const pts = [[R, 0], [R * 1.05, R * 0.4], [R * 0.8, R * 0.85], [R * 0.4, R * 1.1], [0.001, R * 1.3]].map(([r, y]) => V2(r, y));
      const d = new THREE.LatheGeometry(pts, 10).toNonIndexed();
      d.translate(x + w / 2, h, z);
      skyline.push(d);
    }
    lampLine(x + 0.5, x + w - 0.5, h + 0.2, z + 4.2, 1.6 / Math.max(0.5, dens));
    x += w + rnd() * 6;
  }
  // far ghats: rows of lamps at the water's edge
  for (const y of [0.4, 1.4, 2.6]) lampLine(-340, 340, y, shoreZ + 6, 1.2 / Math.max(0.5, dens));
  const skyGeo = mergeGeometries(skyline.map((g) => { g.deleteAttribute('uv'); return g; }), false);
  const skylineMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: 0x0b0914 }));
  skylineMesh.layers.enable(1);
  scene.add(skylineMesh);

  // --- floating diyas ---------------------------------------------------------
  const drift = new LampField({ groupU, drift: true, capacity: tier.riverLamps, reflect: { y: 0, bounds: [-1e5, 1e5, -1e5, 1e5] }, maxCoc: tier.maxCoc, segments: low ? 6 : 8 });
  drift.u.uDriftSpan.value.set(110, 25);
  for (let i = 0; i < tier.riverLamps; i++) {
    const z = -2.5 - Math.pow(rnd(), 1.5) * 230;
    drift.add({ pos: [(rnd() - 0.5) * 220, 0.036, z], group: G.FLOOR, key: rnd() * 2, speed: 0.12 + rnd() * 0.35, scale: 1 + Math.min(2.5, -z / 70) });
  }

  // --- water, sky, light --------------------------------------------------------
  let Reflector = null;
  if (tier.reflections) {
    try { ({ Reflector } = await import('../../vendor/three/addons/objects/Reflector.js')); } catch { Reflector = null; }
  }
  const water = createWater({ width: 1400, depth: 900, reflect: !!Reflector, Reflector, resolution: 512 });
  water.mesh.position.set(0, 0, -300);
  water.uniforms.uCityGlow.value = 1.0;
  water.uniforms.uRippleScale.value = 0.7;
  const sky = createSky({ cityGlow: 1.0 });
  const hemi = new THREE.HemisphereLight(0x3a4a9a, 0x120d0a, 2.0);

  ghatLamps.build();
  drift.build();
  shoreLamps.build();
  if (tier.reflections) { drift.u.uStreakIntensity.value = 0.6; ghatLamps.u.uStreakIntensity.value = 0.5; }
  scene.add(water.mesh, sky.mesh, hemi, ghatLamps.group, decals.build(), drift.group, shoreLamps.group);

  // --- wish boats -------------------------------------------------------------------
  const wishFlames = new LampField({ groupU, bodies: false, capacity: MAX_WISHES, reflect: { y: 0, bounds: [-1e5, 1e5, -1e5, 1e5] }, haloSize: 0.16, maxCoc: tier.maxCoc, hero: !low });
  for (let i = 0; i < MAX_WISHES; i++) wishFlames.add({ pos: [0, -50, 0], group: G.MISC, key: 0, scale: 1.1 });
  wishFlames.build();
  wishFlames.u.uIntensity.value = 2.4;
  scene.add(wishFlames.group);
  groupU.uWaves.value[G.MISC] = 5;

  const boatGeo = new THREE.LatheGeometry([[0.001, 0], [0.09, 0.005], [0.16, 0.03], [0.2, 0.065], [0.19, 0.07]].map(([r, y]) => V2(r, y)), 18);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a2c, side: THREE.DoubleSide });
  const diyaGeo = makeSmallDiyaGeometry(low ? 20 : 36);
  const clayMat = new THREE.MeshStandardMaterial({ color: 0x9a4a26, roughness: 0.85 });
  const marigoldGeo = new THREE.IcosahedronGeometry(0.03, 0);
  const marigoldMat = new THREE.MeshLambertMaterial({ color: 0xf28a1a });
  const glowLight = new THREE.PointLight(0xff9440, 0, 3, 2);
  scene.add(glowLight);

  const wishes = []; // { id, text, mesh, slot, x, z, xT, zT, ph, release }
  const freeSlots = Array.from({ length: MAX_WISHES }, (_, i) => i).reverse();

  function makeBoat() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(boatGeo, leafMat));
    const d = new THREE.Mesh(diyaGeo, clayMat);
    d.position.set(-0.03, 0.04, 0);
    d.scale.setScalar(1.15);
    g.add(d);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(marigoldGeo, marigoldMat);
      const a = (i / 6) * Math.PI * 2 + 0.4;
      m.position.set(Math.cos(a) * 0.13, 0.07, Math.sin(a) * 0.13);
      m.scale.set(1, 0.8, 1);
      g.add(m);
    }
    return g;
  }

  // A hidden spare boat, so its shaders are prepared with the rest of the
  // river and releasing the very first wish doesn't stutter.
  const spare = makeBoat();
  spare.visible = false;
  scene.add(spare);

  /** Add a wish diya. `fresh` animates it from the shore. */
  function addWish(w, { fresh = false } = {}) {
    if (!freeSlots.length) {
      const oldest = wishes.shift();
      removeMesh(oldest);
    }
    const slot = freeSlots.pop();
    const mesh = makeBoat();
    scene.add(mesh);
    const ph = w.ph ?? rnd() * 6.28;
    const xT = w.xT ?? (rnd() - 0.5) * 9;
    const zT = w.zT ?? -9 - rnd() * 20;
    const item = { id: w.id, text: w.text, created: w.created, mesh, slot, x: xT, z: zT, xT, zT, ph, release: fresh ? 0 : 1 };
    if (fresh) {
      item.x = (rnd() - 0.5) * 1.2;
      item.z = 3.2;
      const s = { u: 0 };
      gsap.to(s, {
        u: 1,
        duration: rig.reduced ? 0.01 : 16,
        ease: 'power2.out',
        onUpdate: () => {
          item.release = s.u;
        },
      });
      item.startX = item.x;
      item.startZ = item.z;
    }
    wishes.push(item);
    return item;
  }

  function removeMesh(item) {
    scene.remove(item.mesh);
    wishFlames.setPosition(item.slot, 0, -50, 0);
    freeSlots.push(item.slot);
  }

  function removeWish(id) {
    const i = wishes.findIndex((w) => w.id === id);
    if (i < 0) return;
    removeMesh(wishes[i]);
    wishes.splice(i, 1);
  }

  function clearWishes() {
    while (wishes.length) removeMesh(wishes.pop());
  }

  function positionOf(item, t) {
    const meanderX = item.xT + Math.sin(t * 0.045 + item.ph) * 2.5;
    const meanderZ = item.zT + Math.sin(t * 0.03 + item.ph * 2) * 1.5;
    if (item.release < 1 && item.startX !== undefined) {
      const u = item.release;
      return [item.startX + (meanderX - item.startX) * u, item.startZ + (meanderZ - item.startZ) * u];
    }
    return [meanderX, meanderZ];
  }

  /** Screen-space pick of the nearest wish diya (CSS px). */
  function pickWish(x, y) {
    let best = null;
    let bestD = 64;
    for (const w of wishes) {
      const p = engine.project(w.mesh.position.clone().add(new THREE.Vector3(0, 0.08, 0)), camera);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  const handle = {
    name: 'river',
    scene,
    camera,
    exposure: 0.95,
    vignette: 0.5,
    bloom: { strength: 0.75, radius: 0.5, threshold: 0.9 },
    dof: () => ({ focus: rig.focus, aperture: rig.aperture }),
    resize: (w, h) => rig.resize(w, h),
    update(dt, t) {
      groupU.uTime.value = t;
      rig.update(dt, t);
      const pxH = engine.height * engine.pixelRatio;
      for (const f of [ghatLamps, drift, shoreLamps, wishFlames]) {
        f.updateCamera(camera, pxH);
        f.setFocus(rig.focus, rig.aperture);
      }
      lights.update(t);
      let nearest = null;
      for (const w of wishes) {
        const [x, z] = positionOf(w, t);
        const y = waveH(x, z, t);
        w.mesh.position.set(x, y, z);
        const e = 0.3;
        w.mesh.rotation.x = (waveH(x, z + e, t) - waveH(x, z - e, t)) / (2 * e);
        w.mesh.rotation.z = -(waveH(x + e, z, t) - waveH(x - e, z, t)) / (2 * e);
        w.mesh.rotation.y = w.ph + t * 0.05;
        w.mesh.updateMatrixWorld();
        TIP.set(-0.03 + 0.0655 * 1.15, 0.04 + 0.0385 * 1.15, 0).applyMatrix4(w.mesh.matrixWorld);
        wishFlames.setPosition(w.slot, TIP.x, TIP.y, TIP.z);
        if (!nearest || w.release < 1) nearest = w;
      }
      if (nearest) {
        glowLight.position.set(nearest.mesh.position.x, nearest.mesh.position.y + 0.3, nearest.mesh.position.z);
        glowLight.intensity = 0.25;
        water.setGlow(0, nearest.mesh.position.x, 0, nearest.mesh.position.z, 1);
      } else {
        glowLight.intensity = 0;
        water.setGlow(0, 0, 0, 0, 0);
      }
      sky.update(t, camera);
      water.update(t);
    },
  };

  // lamps fade in when the scene is first shown
  function awaken() {
    if (groupU.uWaves.value[G.FLOOR] > 1) return;
    tweenWave(groupU, G.FLOOR, 12, rig.reduced ? 0.01 : 4, 'power1.inOut');
  }

  return {
    handle,
    rig,
    shots: RIVER_SHOTS,
    awaken,
    addWish,
    removeWish,
    clearWishes,
    pickWish,
    wishes,
    projectWish(item) {
      return engine.project(item.mesh.position.clone().add(new THREE.Vector3(0, 0.45, 0)), camera);
    },
  };
}

function worldUV(g, scale) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ny = Math.abs(n.getY(i));
    const nx = Math.abs(n.getX(i));
    const nz = Math.abs(n.getZ(i));
    let u; let v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); } else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
