// The hero diya: a hand-thrown terracotta lamp with a pinched spout, a pool
// of oil, a twisted cotton wick and a living flame. Built procedurally from a
// lathe profile, then deformed to form the spout and a slight hand-made
// wobble, so no two rims are perfectly round.
import * as THREE from '../lib/three.js';
import { terracotta, glowSprite } from './textures.js';
import { LampField } from './lampField.js';
import { G } from '../config.js';

// Lathe profile (radius, height) in metres: outer wall → rim → inner wall.
const PROFILE = [
  [0.0005, 0.0], [0.02, 0.0], [0.028, 0.003], [0.036, 0.009], [0.042, 0.016],
  [0.046, 0.024], [0.0475, 0.029], [0.046, 0.0315], [0.0435, 0.03], [0.04, 0.024],
  [0.033, 0.016], [0.022, 0.0105], [0.0005, 0.0085],
];

const smooth = THREE.MathUtils.smoothstep;

function spout(x, y, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const s = Math.exp(-(a * a) / (2 * 0.3 * 0.3));
  const hf = smooth(y, 0.006, 0.03);
  const k = 1 + 0.55 * s * hf;
  const na = a * (1 - 0.32 * s * hf);
  const wob = 1 + 0.012 * Math.sin(3 * a + 1.1) + 0.008 * Math.sin(5 * a + 0.3);
  return [Math.cos(na) * r * k * wob, y + 0.0035 * s * hf + 0.0006 * Math.sin(2 * a), Math.sin(na) * r * k * wob];
}

function deformGeometry(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = spout(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  smoothSeams(g);
}

/** Average normals of vertices that share a position (lathe seam). */
function smoothSeams(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  const v = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    v.normalize();
    for (const i of list) n.setXYZ(i, v.x, v.y, v.z);
  }
}

export function createHeroDiya({ groupU, tier, reflect = null }) {
  const group = new THREE.Group();
  group.name = 'HeroDiya';
  const low = tier.name === 'low';

  // Bowl
  const bowlGeo = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), low ? 56 : 112);
  deformGeometry(bowlGeo);
  const tex = terracotta(low ? 256 : 512, low ? 128 : 256);
  const bowlMat = new THREE.MeshStandardMaterial({
    map: tex.map, bumpMap: tex.bump, bumpScale: 1.4, roughness: 0.86, metalness: 0, side: THREE.DoubleSide,
  });
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.castShadow = !low;
  group.add(bowl);

  // Oil, deformed with the same spout function so it meets the walls
  const oilGeo = new THREE.CircleGeometry(0.0372, low ? 48 : 96);
  oilGeo.rotateX(-Math.PI / 2);
  oilGeo.translate(0, 0.0205, 0);
  {
    const p = oilGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [x, , z] = spout(p.getX(i), 0.0205, p.getZ(i));
      p.setXYZ(i, x, 0.0205, z);
    }
    oilGeo.computeVertexNormals();
  }
  const oilMat = low
    ? new THREE.MeshStandardMaterial({ color: 0x4a2c07, roughness: 0.12, metalness: 0 })
    : new THREE.MeshPhysicalMaterial({ color: 0x4a2c07, roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
  const oil = new THREE.Mesh(oilGeo, oilMat);
  group.add(oil);

  // Wick: cotton, twisted, resting in the spout with a charred tip
  const tip = new THREE.Vector3(0.0655, 0.0385, 0);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.008, 0.0175, 0.003),
    new THREE.Vector3(0.028, 0.0215, -0.002),
    new THREE.Vector3(0.048, 0.0265, 0.001),
    new THREE.Vector3(0.06, 0.031, 0),
    tip.clone(),
  ]);
  const wickGeo = new THREE.TubeGeometry(curve, 40, 0.0021, 7, false);
  {
    const p = wickGeo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const segs = 41;
    const radial = 8;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / radial) / (segs - 1);
      const burnt = smooth(t, 0.78, 0.97);
      const twist = 0.92 + 0.08 * Math.sin(i * 1.7);
      const c = new THREE.Color(0.93 * twist, 0.89 * twist, 0.8 * twist).lerp(new THREE.Color(0.05, 0.035, 0.03), burnt);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    wickGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const wick = new THREE.Mesh(wickGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  group.add(wick);

  // Flame (single high-detail instance; positioned in world space each frame)
  const flame = new LampField({
    groupU, bodies: false, hero: true, capacity: 1, flameH: 0.034, haloSize: 0.075, maxCoc: tier.maxCoc, reflect,
  });
  flame.u.uIntensity.value = 1.15;
  flame.u.uHaloIntensity.value = 0.45;
  flame.add({ pos: [0, 0, 0], scale: 1, group: G.HERO, key: 0.5, seed: 0.37 });
  flame.build();

  // Real light for speculars on the oil and the clay
  const light = new THREE.PointLight(0xff9440, 0, 0, 2);
  light.position.copy(tip).add(new THREE.Vector3(-0.004, 0.016, 0));
  group.add(light);

  // Starlight: a cool rim and a soft key so the unlit diya reads in the dark.
  // Both fade out as the flame takes over.
  const rim = new THREE.PointLight(0x6f84e8, 0.12, 0, 2);
  rim.position.set(-0.12, 0.14, -0.2);
  const key = new THREE.PointLight(0xb8c4ff, 0.07, 0, 2);
  key.position.set(0.22, 0.26, 0.32);
  group.add(rim, key);

  // Embers
  const EMBERS = 48;
  const emberGeo = new THREE.BufferGeometry();
  const ePos = new Float32Array(EMBERS * 3).fill(-999);
  const eCol = new Float32Array(EMBERS * 3);
  emberGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  emberGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    size: 0.004, map: glowSprite(64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexColors: true, sizeAttenuation: true,
  }));
  embers.frustumCulled = false;
  const emberState = Array.from({ length: EMBERS }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
  let emberCursor = 0;
  let emberClock = 0;

  const worldTip = new THREE.Vector3();
  const lightState = { v: 0 };

  function spawnEmber(burst = false) {
    const e = emberState[emberCursor];
    emberCursor = (emberCursor + 1) % EMBERS;
    e.life = 0;
    e.max = burst ? 0.5 + Math.random() * 0.7 : 0.9 + Math.random() * 1.4;
    e.p.copy(worldTip).add(new THREE.Vector3((Math.random() - 0.5) * 0.004, 0.02 + Math.random() * 0.012, (Math.random() - 0.5) * 0.004));
    const sp = burst ? 0.12 : 0.03;
    e.v.set((Math.random() - 0.5) * sp, (burst ? 0.12 : 0.05) + Math.random() * 0.05, (Math.random() - 0.5) * sp);
  }

  return {
    group,
    flame,
    embers,
    light,
    bowl,
    tip,
    worldTip,
    lightState,
    hitRadius: 0.1,
    burst(n = 24) { for (let i = 0; i < n; i++) spawnEmber(true); },
    update(dt, t, lit) {
      group.updateMatrixWorld();
      worldTip.copy(tip).applyMatrix4(group.matrixWorld);
      flame.setPosition(0, worldTip.x, worldTip.y, worldTip.z);
      const flick = 0.86 + 0.08 * Math.sin(t * 13.3) * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 23.0 + 1.0);
      light.intensity = lightState.v * 0.028 * flick;
      rim.intensity = 0.12 * (1 - lightState.v);
      key.intensity = 0.07 * (1 - lightState.v);
      // embers
      emberClock += dt;
      if (lit > 0.9 && emberClock > 0.7) { emberClock = 0; if (Math.random() < 0.6) spawnEmber(false); }
      for (let i = 0; i < EMBERS; i++) {
        const e = emberState[i];
        if (e.life >= e.max) { ePos[i * 3 + 1] = -999; continue; }
        e.life += dt;
        e.v.y += dt * 0.02;
        e.v.x += (Math.random() - 0.5) * dt * 0.08;
        e.p.addScaledVector(e.v, dt);
        ePos[i * 3] = e.p.x; ePos[i * 3 + 1] = e.p.y; ePos[i * 3 + 2] = e.p.z;
        const k = Math.max(0, 1 - e.life / e.max);
        eCol[i * 3] = 1.6 * k; eCol[i * 3 + 1] = 0.7 * k * k; eCol[i * 3 + 2] = 0.2 * k * k * k;
      }
      emberGeo.attributes.position.needsUpdate = true;
      emberGeo.attributes.color.needsUpdate = true;
    },
  };
}

/** Geometry of the hero diya reused (unwrapped) for wish boats in the river. */
export function makeSmallDiyaGeometry(segments = 40) {
  const g = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  deformGeometry(g);
  return g;
}
