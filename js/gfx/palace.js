// Procedural palace courtyard in the Rajput–Mughal tradition: sandstone
// arcades with cusped (multifoil) marble arches, jharokha balconies, glowing
// jaali lattices, chhajja eaves, kangura parapets, chhatri pavilions, a domed
// north facade, a reflecting pool, two deepastambha lamp towers, marigold
// torans and akash-kandil star lanterns.
//
// Coordinates are metres. The courtyard runs x ∈ [-11, 11], z ∈ [-21, 16];
// the main facade is at the north (−z), the visitor starts at the south.
//
// Static geometry is merged per material (few draw calls). Lamps, decals,
// lantern beams and glows are registered into the shared fields.

import * as THREE from '../lib/three.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { G } from '../config.js';
import { glowAttrs } from './volumetrics.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const rand = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

export const LAYOUT = {
  pool: { x0: -2.5, x1: 2.5, z0: -12, z1: 1, waterY: -0.3 },
  rangoli: { x: 0, z: 6.4, size: 4.8 },
  towers: [[-4.4, 2.3], [4.4, 2.3]],
  heroStart: new THREE.Vector3(0, 1.18, 2.35),
  heroRest: new THREE.Vector3(0.05, -0.3, -0.45),
  gate: new THREE.Vector3(0, 3.5, -21),
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

class GeoBag {
  constructor() { this.parts = new Map(); }
  add(key, geo, matrix = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
  }
  merged(key, { worldUV = 0 } = {}) {
    const list = this.parts.get(key);
    if (!list || !list.length) return null;
    const g = mergeGeometries(list, false);
    list.forEach((p) => p.dispose());
    if (worldUV) computeWorldUV(g, worldUV);
    g.computeBoundingSphere();
    return g;
  }
}

function computeWorldUV(g, scale) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function M(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) {
  _e.set(rx, ry, 0, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

/** Pointed, optionally cusped arch outline from left foot to right foot. */
function archOpening(w, spring, apex, { lobes = 0, cusp = 0, seg = 32 } = {}) {
  const half = w / 2;
  const rise = apex - spring;
  const n = lobes ? Math.max(seg, lobes * 8) : seg;
  let curve = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const cx = Math.cos(Math.PI * (1 - s));
    const ax = Math.abs(cx);
    curve.push(V2(half * cx, spring + rise * Math.pow(Math.max(0, 1 - Math.pow(ax, 1.15)), 0.55)));
  }
  if (lobes && cusp > 0) {
    const L = [0];
    for (let i = 1; i < curve.length; i++) L.push(L[i - 1] + curve[i].distanceTo(curve[i - 1]));
    const total = L[L.length - 1];
    curve = curve.map((p, i) => {
      const u = L[i] / total;
      const edge = THREE.MathUtils.smoothstep(u, 0, 0.05) * THREE.MathUtils.smoothstep(1 - u, 0, 0.05);
      const f = Math.pow(1 - Math.abs(Math.sin(Math.PI * lobes * u)), 2) * cusp * edge;
      const a = curve[Math.max(0, i - 1)];
      const b = curve[Math.min(curve.length - 1, i + 1)];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      return V2(p.x + (ty / tl) * f, p.y - (tx / tl) * f);
    });
  }
  return [V2(-half, 0), ...curve, V2(half, 0)];
}

function shapeFrom(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i].x, points[i].y);
  s.closePath();
  return s;
}

/** Wall panel bw×h with a doorway opening reaching the floor. */
function archPanelShape(bw, h, opening) {
  const pts = [V2(-bw / 2, 0), ...opening, V2(bw / 2, 0), V2(bw / 2, h), V2(-bw / 2, h)];
  return shapeFrom(pts);
}

/** Marble band around an arch opening. `yOff` lifts it to a window sill. */
function archFrameShape(w, spring, apex, t, opening, seg) {
  const outer = archOpening(w + 2 * t, spring, apex + t, { seg });
  const inner = [...opening].reverse();
  return shapeFrom([...outer, ...inner]);
}

function windowHole(w, spring, apex, sill, x = 0, opts = {}) {
  const pts = archOpening(w, spring, apex, opts).map((p) => V2(p.x + x, p.y + sill));
  const path = new THREE.Path();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
  return path;
}

function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

/** Bulbous dome with lotus base and kalash finial. */
function domeGeometry(R, seg = 24) {
  const pts = [
    [R * 0.92, 0], [R * 1.0, R * 0.22], [R * 0.96, R * 0.5], [R * 0.78, R * 0.8], [R * 0.5, R * 1.02],
    [R * 0.22, R * 1.16], [R * 0.07, R * 1.24], [R * 0.05, R * 1.3], [R * 0.11, R * 1.36], [R * 0.05, R * 1.44],
    [R * 0.035, R * 1.5], [R * 0.07, R * 1.55], [R * 0.02, R * 1.62], [R * 0.012, R * 1.8], [0.001, R * 1.82],
  ].map(([r, y]) => V2(r, y));
  return new THREE.LatheGeometry(pts, seg);
}

function columnGeometry(h, r, seg = 12) {
  const pts = [
    [r * 1.25, 0], [r * 1.25, h * 0.04], [r * 1.0, h * 0.06], [r * 0.95, h * 0.12], [r * 1.18, h * 0.18],
    [r * 0.92, h * 0.25], [r * 0.78, h * 0.3], [r * 0.74, h * 0.82], [r * 0.86, h * 0.85], [r * 0.74, h * 0.88],
    [r * 1.0, h * 0.94], [r * 1.35, h * 0.98], [r * 1.35, h], [0.001, h],
  ].map(([rr, y]) => V2(rr, y));
  return new THREE.LatheGeometry(pts, seg);
}

/** A chhatri: platform, four columns, chhajja ring and a dome. */
function chhatriGeometry(s = 1, seg = 16) {
  const parts = [];
  const add = (g, m) => { const gg = g.index ? g.toNonIndexed() : g; gg.applyMatrix4(m); gg.deleteAttribute('uv'); parts.push(gg); };
  add(box(1.9, 0.18, 1.9), M(0, 0.09));
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) add(columnGeometry(1.25, 0.07, 8), M(x, 0.18, z));
  add(new THREE.CylinderGeometry(1.15, 1.35, 0.12, seg, 1), M(0, 1.47));
  add(new THREE.CylinderGeometry(0.95, 0.95, 0.18, seg, 1), M(0, 1.6));
  add(domeGeometry(0.88, seg), M(0, 1.69));
  const g = mergeGeometries(parts, false);
  g.scale(s, s, s);
  return g;
}

/** Marigold garland along a catenary from a to b (local 3D points). */
function catenary(a, b, sag, step) {
  const pts = [];
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildPalace({ tier, materials, lamps, decals, cones, lights, groupU }) {
  const bag = new GeoBag();
  const density = tier.lampDensity;
  const seg = tier.archDetail;
  const flowers = []; // { m: Matrix4, c: Color }
  const kandils = [];
  const hero = LAYOUT.heroStart;
  const distKey = (x, z) => Math.hypot(x - hero.x, z - hero.z);

  const addLamp = (x, y, z, group, key, scale = 1) => lamps.add({ pos: [x, y + 0.036 * scale, z], group, key, scale });
  const lampRow = (from, to, spacing, cb) => {
    const len = from.distanceTo(to);
    const n = Math.max(1, Math.floor((len / spacing) * density));
    for (let i = 0; i <= n; i++) cb(from.clone().lerp(to, i / n), i, n);
  };
  const flowerAt = (p, i, colors = [0xf08a1c, 0xf6b618]) => {
    const s = 0.8 + rand() * 0.4;
    flowers.push({ m: M(p.x, p.y, p.z, rand() * 6, s, s * 0.85, s), c: new THREE.Color(colors[Math.floor(i / 5) % colors.length]) });
  };

  // --- Ground --------------------------------------------------------------
  const P = LAYOUT.pool;
  {
    // Floor with the pool cut out (shape is in XY, rotated so y → −z)
    const s = shapeFrom([V2(-70, -70), V2(70, -70), V2(70, 70), V2(-70, 70)]);
    const hole = new THREE.Path();
    hole.moveTo(P.x0, -P.z1);
    hole.lineTo(P.x1, -P.z1);
    hole.lineTo(P.x1, -P.z0);
    hole.lineTo(P.x0, -P.z0);
    hole.closePath();
    s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    bag.add('floor', g);
  }

  // --- Pool ----------------------------------------------------------------
  {
    const cw = 0.45; const ch = 0.14;
    const W = P.x1 - P.x0; const D = P.z1 - P.z0;
    const cz = (P.z0 + P.z1) / 2;
    bag.add('ivory', box(W + cw * 2, ch, cw), M(0, ch / 2, P.z1 + cw / 2));
    bag.add('ivory', box(W + cw * 2, ch, cw), M(0, ch / 2, P.z0 - cw / 2));
    bag.add('ivory', box(cw, ch, D), M(P.x0 - cw / 2, ch / 2, cz));
    bag.add('ivory', box(cw, ch, D), M(P.x1 + cw / 2, ch / 2, cz));
    // inner walls & floor (dark, only seen through the water edge)
    bag.add('dark', box(W, 1.2, 0.1), M(0, -0.6, P.z1 - 0.05));
    bag.add('dark', box(W, 1.2, 0.1), M(0, -0.6, P.z0 + 0.05));
    bag.add('dark', box(0.1, 1.2, D), M(P.x0 + 0.05, -0.6, cz));
    bag.add('dark', box(0.1, 1.2, D), M(P.x1 - 0.05, -0.6, cz));
    bag.add('dark', box(W, 0.1, D), M(0, -1.2, cz));

    const y = ch;
    const keyZ = (z) => 1 + ((P.z1 - z) / (P.z1 - P.z0)) * 3;
    for (const x of [P.x0 - cw / 2, P.x1 + cw / 2]) {
      lampRow(new THREE.Vector3(x, y, P.z1 - 0.2), new THREE.Vector3(x, y, P.z0 + 0.2), 0.6, (p) => {
        addLamp(p.x, y, p.z, G.POOL, keyZ(p.z));
        decals.add({ pos: [p.x, y, p.z], radius: 0.32, intensity: 0.35, group: G.POOL, key: keyZ(p.z) });
      });
    }
    for (const [z, k] of [[P.z1 + cw / 2, 1], [P.z0 - cw / 2, 4]]) {
      lampRow(new THREE.Vector3(P.x0, y, z), new THREE.Vector3(P.x1, y, z), 0.6, (p) => {
        addLamp(p.x, y, p.z, G.POOL, k + Math.abs(p.x) * 0.05);
        decals.add({ pos: [p.x, y, p.z], radius: 0.3, intensity: 0.3, group: G.POOL, key: k });
      });
    }
    lights.add({ pos: [0, 0.8, -0.5], intensity: 1.2, radius: 8, group: G.POOL, key: 1.6, priority: 2 });
    lights.add({ pos: [0, 0.8, -5.5], intensity: 1.2, radius: 8, group: G.POOL, key: 2.6, priority: 2 });
    lights.add({ pos: [0, 0.8, -10.5], intensity: 1.2, radius: 8, group: G.POOL, key: 3.6, priority: 2 });
    lights.add({ pos: [0, 1, -5.5], intensity: 1.6, radius: 13, group: G.POOL, key: 2.6, only: 'low' });
  }

  // --- Rangoli area: ring of diyas, footprints, processional path ----------
  {
    const R = LAYOUT.rangoli;
    const ringN = Math.max(10, Math.round(18 * Math.max(0.6, density)));
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2;
      const x = R.x + Math.cos(a) * 2.75;
      const z = R.z + Math.sin(a) * 2.75;
      addLamp(x, 0, z, G.FLOOR, distKey(x, z));
      decals.add({ pos: [x, 0, z], radius: 0.5, intensity: 0.42, group: G.FLOOR, key: distKey(x, z) });
    }
    for (const x of [-1.25, 1.25]) {
      lampRow(new THREE.Vector3(x, 0, 15.2), new THREE.Vector3(x, 0, 9.6), 0.7, (p) => {
        addLamp(p.x, 0, p.z, G.FLOOR, distKey(p.x, p.z));
        decals.add({ pos: [p.x, 0, p.z], radius: 0.42, intensity: 0.38, group: G.FLOOR, key: distKey(p.x, p.z) });
      });
    }
    lights.add({ pos: [0, 0.7, R.z], intensity: 2.2, radius: 9, group: G.FLOOR, key: 4.5, priority: 1, only: 'all' });
    lights.add({ pos: [0, 0.6, 12.5], intensity: 1.2, radius: 7, group: G.FLOOR, key: 10, priority: 3 });
  }

  // --- Deepastambhas (lamp towers) -----------------------------------------
  for (const [tx, tz] of LAYOUT.towers) {
    bag.add('granite', box(1.5, 0.3, 1.5), M(tx, 0.15, tz));
    bag.add('granite', box(1.15, 0.3, 1.15), M(tx, 0.45, tz));
    bag.add('granite', box(0.82, 0.35, 0.82), M(tx, 0.775, tz));
    const shaftPts = [[0.24, 0], [0.2, 0.2], [0.17, 0.6], [0.2, 0.9], [0.16, 1.2], [0.15, 2.6], [0.12, 4.0], [0.16, 4.15], [0.1, 4.3], [0.001, 4.35]].map(([r, y]) => V2(r, y));
    bag.add('granite', new THREE.LatheGeometry(shaftPts, 14), M(tx, 0.95, tz));
    const tiers = 8;
    const base = distKey(tx, tz);
    for (let i = 0; i < tiers; i++) {
      const y = 1.45 + i * 0.47;
      const r = 0.64 - i * 0.045;
      bag.add('granite', new THREE.CylinderGeometry(r, r * 0.86, 0.06, 20, 1), M(tx, y, tz));
      const n = Math.max(6, Math.round((Math.PI * 2 * r / 0.16) * Math.max(0.55, density)));
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2;
        const key = base + i * 0.75 + (j / n) * 0.75;
        addLamp(tx + Math.cos(a) * (r - 0.05), y + 0.03, tz + Math.sin(a) * (r - 0.05), G.TOWER, key, 0.95);
      }
      decals.add({ pos: [tx, y + 0.031, tz], radius: r * 1.05, intensity: 0.5, group: G.TOWER, key: base + i * 0.75 + 0.4 });
    }
    // finial lamp
    addLamp(tx, 5.3, tz, G.TOWER, base + tiers * 0.75, 1.5);
    lights.add({ pos: [tx, 2.6, tz], intensity: 2.4, radius: 9, group: G.TOWER, key: base + 2.5, priority: 1 });
  }
  lights.add({ pos: [0, 2.6, 2.3], intensity: 3.0, radius: 12, group: G.TOWER, key: 8, only: 'low' });

  // --- Side and south arcades ----------------------------------------------
  const arcade = ({ origin, rotY, length, bays, name }) => {
    const plinthH = 0.45;
    const H1 = 5.0;
    const H2 = 3.2;
    const bw = length / bays;
    const T = M(origin[0], 0, origin[2], rotY);
    const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(T);
    const add = (key, geo, local) => bag.add(key, geo, T.clone().multiply(local));
    const lampL = (x, y, z, group, scale = 1) => {
      const w = toWorld(x, y, z);
      addLamp(w.x, w.y, w.z, group, distKey(w.x, w.z), scale);
      return w;
    };
    const decalL = (x, y, z, normalLocal, radius, intensity, group) => {
      const w = toWorld(x, y, z);
      const n = new THREE.Vector3(...normalLocal).transformDirection(T);
      decals.add({ pos: [w.x, w.y, w.z], normal: [n.x, n.y, n.z], radius, intensity, group, key: distKey(w.x, w.z) });
    };

    // plinth and interior shell
    add('sandstone', box(length + 1.2, plinthH, 3.6), M(0, plinthH / 2, -1.6));
    add('sandstone', box(length, H1 + H2 + 0.6, 0.35), M(0, plinthH + (H1 + H2 + 0.6) / 2, -3.35));
    add('sandstone', box(length, 0.26, 3.4), M(0, plinthH + H1 + 0.13, -1.6));
    add('sandstone', box(length, 0.3, 3.6), M(0, plinthH + H1 + H2 + 0.27, -1.6));

    const opening = archOpening(2.3, 2.45, 4.15, { lobes: 7, cusp: 0.11, seg });
    const panel = extrude(archPanelShape(bw, H1, opening), 0.55);
    const frame = extrude(archFrameShape(2.3, 2.45, 4.15, 0.17, opening, seg), 0.63);
    const winOpts = { lobes: 5, cusp: 0.07, seg: Math.max(12, seg - 4) };
    const winOpening = archOpening(1.4, 1.25, 2.35, winOpts);
    const upperShape = shapeFrom([V2(-bw / 2, 0), V2(bw / 2, 0), V2(bw / 2, H2), V2(-bw / 2, H2)]);
    upperShape.holes.push(windowHole(1.4, 1.25, 2.35, 0.55, 0, winOpts));
    const upper = extrude(upperShape, 0.4);
    const winFrame = extrude(archFrameShape(1.4, 1.25, 2.35, 0.12, winOpening, Math.max(12, seg - 4)), 0.46);
    const col = columnGeometry(H1 - 0.6, 0.14, 12);
    const U0 = plinthH + H1 + 0.26;

    for (let i = 0; i < bays; i++) {
      const x = -length / 2 + bw * (i + 0.5);
      add('sandstone', panel, M(x, plinthH, -0.275));
      add('ivory', frame, M(x, plinthH, -0.275));
      add('sandstone', upper, M(x, U0, -0.2));
      add('ivory', winFrame, M(x, U0 + 0.55, -0.2));

      // jaali screen + glow behind each upper window
      const jw = 1.5; const jh = 2.5;
      const jaaliG = new THREE.PlaneGeometry(jw, jh);
      bag.add('jaali', jaaliG, T.clone().multiply(M(x, U0 + 0.55 + jh / 2 - 0.02, -0.45)));
      const glowW = toWorld(x, U0 + 1.6, -0.9);
      const gg = glowAttrs(new THREE.PlaneGeometry(jw, jh).toNonIndexed(), { group: G.ARCADE, key: distKey(glowW.x, glowW.z) + 2, bright: 0.8 + rand() * 0.6, color: [1.0, 0.5, 0.18] });
      bag.add('glow', gg, T.clone().multiply(M(x, U0 + 0.55 + jh / 2, -0.75)));

      // niche lamp on the back wall of the arcade
      const nicheW = toWorld(x, plinthH + 1.25, -3.1);
      const ng = glowAttrs(new THREE.PlaneGeometry(0.55, 0.85).toNonIndexed(), { group: G.ARCADE, key: distKey(nicheW.x, nicheW.z), bright: 0.35, color: [1.0, 0.45, 0.16] });
      bag.add('glow', ng, T.clone().multiply(M(x, plinthH + 1.55, -3.16)));
      add('ivory', box(0.7, 0.06, 0.3), M(x, plinthH + 1.2, -3.05));
      lampL(x, plinthH + 1.23, -3.02, G.ARCADE);
      decalL(x, plinthH + 1.6, -3.17, [0, 0, 1], 0.9, 0.5, G.ARCADE);

      // hanging lantern with a beam of light
      const lx = x; const ly = plinthH + 3.25; const lz = -0.35;
      add('bronze', new THREE.CylinderGeometry(0.004, 0.004, 0.75, 4), M(lx, ly + 0.55, lz));
      const cage = new THREE.LatheGeometry([[0.02, -0.16], [0.09, -0.12], [0.11, 0.0], [0.09, 0.1], [0.04, 0.16], [0.01, 0.2]].map(([r, y]) => V2(r, y)), 8);
      add('bronze', cage, M(lx, ly, lz));
      const lw = lampL(lx, ly - 0.07, lz, G.ARCADE, 1.3);
      const glass = glowAttrs(new THREE.SphereGeometry(0.055, 10, 8).toNonIndexed(), { group: G.ARCADE, key: distKey(lw.x, lw.z), bright: 1.6, color: [1.0, 0.62, 0.3] });
      add('glow', glass, M(lx, ly - 0.03, lz));
      if (tier.cones) cones.add({ pos: [lw.x, lw.y - 0.05, lw.z], length: 2.75, radius: 0.95, group: G.ARCADE, key: distKey(lw.x, lw.z), intensity: 0.1 });

      // marigold toran across the arch
      const a = toWorld(x - 1.18, plinthH + 2.5, 0.36);
      const b = toWorld(x + 1.18, plinthH + 2.5, 0.36);
      if (rand() < tier.garlands + 0.15) catenary(a, b, 0.5, 0.075 / Math.max(0.5, tier.garlands)).forEach((p, k) => flowerAt(p, k));

      // akash kandil in every third bay of the upper storey
      if (i % 3 === 1) {
        const kp = toWorld(x, U0 + H2 - 0.85, 0.75);
        kandils.push({ pos: kp, color: [[1.0, 0.42, 0.18], [1.0, 0.3, 0.55], [1.0, 0.75, 0.25], [0.5, 0.9, 0.4]][(i + bays) % 4], key: distKey(kp.x, kp.z) + 1 });
        add('bronze', new THREE.CylinderGeometry(0.004, 0.004, 0.65, 4), M(x, U0 + H2 - 0.42, 0.75));
      }
    }

    // pilasters and their garlands
    for (let i = 0; i <= bays; i++) {
      const x = -length / 2 + bw * i;
      add('ivory', col, M(x, plinthH, 0.12));
      if (rand() < tier.garlands) {
        const top = toWorld(x, plinthH + H1 - 0.2, 0.3);
        const bot = toWorld(x, plinthH + H1 - 1.7, 0.3);
        lampRow(top, bot, 0.075 / Math.max(0.5, tier.garlands), (p, k) => flowerAt(p, k, [0xf6b618, 0xf08a1c]));
      }
    }

    // lamp ledges, eaves and brackets
    for (const [y0, depth] of [[plinthH + H1, 1.05], [U0 + H2, 0.9]]) {
      add('sandstone', box(length, 0.12, 0.42), M(0, y0 + 0.06, 0.21));
      add('sandstone', box(length, 0.08, depth), M(0, y0 - 0.06, depth / 2, 0, 1, 1, 1, 0.24));
      for (let i = 0; i <= bays; i++) add('sandstone', box(0.16, 0.42, 0.5), M(-length / 2 + bw * i, y0 - 0.35, 0.25));
      const group = y0 > 8 ? G.ARCADE : G.ARCADE;
      lampRow(new THREE.Vector3(-length / 2 + 0.2, 0, 0), new THREE.Vector3(length / 2 - 0.2, 0, 0), 0.55, (p) => {
        lampL(p.x, y0 + 0.12, 0.25, group);
        if (rand() < 0.55) decalL(p.x, y0 + 0.5, 0.002, [0, 0, 1], 0.55, 0.35, group);
      });
    }

    // parapet with kanguras and lamps
    const top = plinthH + H1 + H2 + 0.42;
    add('sandstone', box(length, 0.7, 0.32), M(0, top + 0.35, 0));
    const merlon = extrude(shapeFrom([V2(-0.16, 0), V2(0.16, 0), V2(0.16, 0.22), V2(0.08, 0.34), V2(0, 0.44), V2(-0.08, 0.34), V2(-0.16, 0.22)]), 0.26);
    for (let x = -length / 2 + 0.25; x < length / 2; x += 0.6) add('sandstone', merlon, M(x, top + 0.7, 0));
    lampRow(new THREE.Vector3(-length / 2 + 0.55, 0, 0), new THREE.Vector3(length / 2 - 0.55, 0, 0), 0.6, (p) => lampL(p.x, top + 0.7, 0.05, G.ARCADE));

    // plinth edge lamps
    lampRow(new THREE.Vector3(-length / 2 + 0.3, 0, 0), new THREE.Vector3(length / 2 - 0.3, 0, 0), 0.7, (p) => {
      lampL(p.x, plinthH, 0.06, G.FLOOR);
      decalL(p.x, plinthH, 0.06, [0, 1, 0], 0.45, 0.35, G.FLOOR);
    });

    // roof chhatris
    const ch = chhatriGeometry(0.9, 14);
    for (const x of [-length / 2 + 1.4, 0, length / 2 - 1.4]) {
      add('ivory', ch, M(x, top + 0.7, -1.7));
      const c = toWorld(x, top + 0.7, -1.7);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        addLamp(c.x + Math.cos(a) * 0.85, c.y + 0.16, c.z + Math.sin(a) * 0.85, G.DOME, 2 + k * 0.1);
      }
    }

    // virtual lights for this arcade
    const near = toWorld(-length / 4, 3.2, 1.2);
    const far = toWorld(length / 4, 3.2, 1.2);
    const up = toWorld(0, 7.5, 1.4);
    lights.add({ pos: [near.x, near.y, near.z], intensity: 2.6, radius: 13, group: G.ARCADE, key: distKey(near.x, near.z), priority: name === 'south' ? 3 : 1 });
    lights.add({ pos: [far.x, far.y, far.z], intensity: 2.6, radius: 13, group: G.ARCADE, key: distKey(far.x, far.z), priority: name === 'south' ? 3 : 1 });
    lights.add({ pos: [up.x, up.y, up.z], intensity: 1.6, radius: 11, group: G.ARCADE, key: distKey(up.x, up.z) + 1, priority: 3 });
    const mid = toWorld(0, 4, 1.5);
    if (name !== 'south') lights.add({ pos: [mid.x, mid.y, mid.z], intensity: 3.4, radius: 22, group: G.ARCADE, key: distKey(mid.x, mid.z), only: 'low' });
  };

  arcade({ origin: [-11, 0, -2.5], rotY: Math.PI / 2, length: 33, bays: 10, name: 'west' });
  arcade({ origin: [11, 0, -2.5], rotY: -Math.PI / 2, length: 33, bays: 10, name: 'east' });
  arcade({ origin: [0, 0, 16], rotY: Math.PI, length: 22, bays: 7, name: 'south' });

  // --- North facade --------------------------------------------------------
  {
    const T = M(0, 0, -21, 0);
    const add = (key, geo, local) => bag.add(key, geo, T.clone().multiply(local));
    const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(T);
    const gateKey = (w) => Math.hypot(w.x - LAYOUT.gate.x, w.y - LAYOUT.gate.y, w.z - LAYOUT.gate.z);
    const lampF = (x, y, z, group = G.FACADE, scale = 1) => {
      const w = toWorld(x, y, z);
      addLamp(w.x, w.y, w.z, group, gateKey(w), scale);
      return w;
    };
    const decalF = (x, y, z, n, radius, intensity) => {
      const w = toWorld(x, y, z);
      decals.add({ pos: [w.x, w.y, w.z], normal: n, radius, intensity, group: G.FACADE, key: gateKey(w) });
    };

    const H1 = 7.6;
    const bays = [3.2, 3.2, 3.2, 6.8, 3.2, 3.2, 3.2];
    let x0 = -13;
    const sideOpening = archOpening(2.0, 2.3, 3.8, { lobes: 7, cusp: 0.1, seg });
    const gateOpening = archOpening(4.4, 4.4, 7.0, { lobes: 9, cusp: 0.15, seg: seg + 8 });
    bays.forEach((bw, i) => {
      const x = x0 + bw / 2;
      x0 += bw;
      const isGate = i === 3;
      const op = isGate ? gateOpening : sideOpening;
      const shape = archPanelShape(bw, H1, op);
      if (!isGate) shape.holes.push(windowHole(1.1, 0.6, 1.35, 4.9, 0, { seg: 16 }));
      add('sandstone', extrude(shape, 0.9), M(x, 0, 0));
      add('ivory', extrude(isGate ? archFrameShape(4.4, 4.4, 7.0, 0.32, op, seg + 8) : archFrameShape(2.0, 2.3, 3.8, 0.16, op, seg), 0.98), M(x, 0, 0));
      // interior behind the doorway
      add('dark', box(bw - 0.4, H1 - 0.2, 0.2), M(x, (H1 - 0.2) / 2, isGate ? -9 : -3.2));
      if (isGate) {
        add('sandstone', box(0.3, H1, 8.6), M(x - 2.4, H1 / 2, -4.7));
        add('sandstone', box(0.3, H1, 8.6), M(x + 2.4, H1 / 2, -4.7));
        add('sandstone', box(5.1, 0.3, 8.6), M(x, H1, -4.7));
        const doorGlow = glowAttrs(new THREE.PlaneGeometry(3.0, 4.6).toNonIndexed(), { group: G.ARCADE, key: 24, bright: 0.25, color: [1.0, 0.45, 0.16] });
        add('glow', doorGlow, M(x, 2.4, -8.85));
      } else {
        const gw = toWorld(x, 2, -3);
        const glow = glowAttrs(new THREE.PlaneGeometry(1.8, 3.6).toNonIndexed(), { group: G.FACADE, key: gateKey(gw) + 1, bright: rand() < 0.5 ? 0.22 : 0.08, color: [1.0, 0.42, 0.14] });
        add('glow', glow, M(x, 1.9, -3.05));
        const ww = toWorld(x, 5.5, -0.5);
        const wg = glowAttrs(new THREE.PlaneGeometry(1.1, 1.4).toNonIndexed(), { group: G.FACADE, key: gateKey(ww) + 1, bright: 0.3, color: [1.0, 0.42, 0.13] });
        add('glow', wg, M(x, 5.55, -0.5));
      }
    });
    // gate arch outline lamps
    {
      const outline = archOpening(4.4 + 0.64, 4.4, 7.0 + 0.32, { seg: 40 });
      outline.forEach((p, i) => { if (i % Math.max(1, Math.round(2 / density)) === 0) lampF(p.x, p.y, 0.5); });
    }
    // gate toran + strands
    if (tier.garlands > 0) {
      catenary(toWorld(-2.6, 6.6, 0.55), toWorld(2.6, 6.6, 0.55), 0.6, 0.07).forEach((p, k) => flowerAt(p, k));
      for (const gx of [-2.75, 2.75]) {
        lampRow(toWorld(gx, 6.8, 0.55), toWorld(gx, 3.6, 0.55), 0.075, (p, k) => flowerAt(p, k, [0xf6b618, 0xe8501a]));
      }
    }
    // gate lantern + spot light (real shadows)
    {
      add('bronze', new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), M(0, 6.6, -0.6));
      const big = new THREE.LatheGeometry([[0.05, -0.4], [0.24, -0.3], [0.3, 0.0], [0.24, 0.26], [0.1, 0.4], [0.02, 0.5]].map(([r, y]) => V2(r, y)), 12);
      add('bronze', big, M(0, 5.6, -0.6));
      const g = glowAttrs(new THREE.SphereGeometry(0.2, 14, 10).toNonIndexed(), { group: G.ARCADE, key: 23, bright: 2.2, color: [1.0, 0.62, 0.3] });
      add('glow', g, M(0, 5.62, -0.6));
      const lw = toWorld(0, 5.45, -0.6);
      lamps.add({ pos: [lw.x, lw.y, lw.z], group: G.ARCADE, key: 23, scale: 2.6 });
    }

    // chhajjas with lamp ledges
    for (const y0 of [H1, 11.6]) {
      add('sandstone', box(26.4, 0.14, 0.5), M(0, y0 + 0.07, 0.6));
      add('sandstone', box(26.4, 0.08, 1.2), M(0, y0 - 0.05, 0.95, 0, 1, 1, 1, 0.22));
      for (let x = -13; x <= 13; x += 1.6) add('sandstone', box(0.18, 0.5, 0.55), M(x, y0 - 0.32, 0.65));
      lampRow(new THREE.Vector3(-12.9, 0, 0), new THREE.Vector3(12.9, 0, 0), 0.5, (p) => {
        lampF(p.x, y0 + 0.14, 0.7);
        if (rand() < 0.5) decalF(p.x, y0 + 0.55, 0.47, [0, 0, 1], 0.55, 0.3);
      });
    }

    // second storey: 9 bays of windows with jaali + jharokhas
    const y2 = H1 + 0.15;
    const H2 = 11.6 - y2;
    const bw2 = 26 / 9;
    const winOpts = { lobes: 5, cusp: 0.07, seg: 18 };
    const win2 = archOpening(1.4, 1.5, 2.7, winOpts);
    for (let i = 0; i < 9; i++) {
      const x = -13 + bw2 * (i + 0.5);
      const s = shapeFrom([V2(-bw2 / 2, 0), V2(bw2 / 2, 0), V2(bw2 / 2, H2), V2(-bw2 / 2, H2)]);
      s.holes.push(windowHole(1.4, 1.5, 2.7, 0.55, 0, winOpts));
      add('sandstone', extrude(s, 0.6), M(x, y2, 0));
      add('ivory', extrude(archFrameShape(1.4, 1.5, 2.7, 0.13, win2, 18), 0.66), M(x, y2 + 0.55, 0));
      add('jaali', new THREE.PlaneGeometry(1.5, 2.9), M(x, y2 + 0.55 + 1.4, -0.33));
      const gw = toWorld(x, y2 + 2, -0.8);
      const g = glowAttrs(new THREE.PlaneGeometry(1.5, 2.9).toNonIndexed(), { group: G.FACADE, key: gateKey(gw) + 0.5, bright: 0.9 + rand() * 0.5, color: [1.0, 0.52, 0.2] });
      add('glow', g, M(x, y2 + 0.55 + 1.4, -0.7));
      add('dark', box(bw2, H2, 0.2), M(x, y2 + H2 / 2, -1.2));
      if (i % 2 === 1 || i === 4) {
        const big = i === 4;
        const jw = big ? 2.3 : 1.8;
        const base = y2 + 0.35;
        add('sandstone', box(jw, 0.3, 0.9), M(x, base, 0.55));
        add('sandstone', box(jw * 0.8, 0.35, 0.6), M(x, base - 0.32, 0.42));
        add('sandstone', box(jw, 0.55, 0.08), M(x, base + 0.42, 0.97));
        for (const cx of [-jw / 2 + 0.1, jw / 2 - 0.1]) add('ivory', columnGeometry(1.7, 0.05, 8), M(x + cx, base + 0.15, 0.9));
        const roof = new THREE.CylinderGeometry(0.55, 0.55, jw + 0.3, 16, 1, false, 0, Math.PI);
        add('ivory', roof, new THREE.Matrix4().multiplyMatrices(M(x, base + 1.85, 0.55), new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, 1, 0.55)).premultiply(new THREE.Matrix4().makeRotationX(0))));
        add('ivory', domeGeometry(0.18, 10), M(x, base + 2.35, 0.55));
        for (let k = 0; k < (big ? 5 : 4); k++) lampF(x - jw / 2 + 0.2 + k * ((jw - 0.4) / ((big ? 5 : 4) - 1)), base + 0.15, 1.0);
      }
    }

    // third storey loggia
    const y3 = 11.75;
    const H3 = 2.45;
    const bw3 = 26 / 13;
    for (let i = 0; i < 13; i++) {
      const x = -13 + bw3 * (i + 0.5);
      const s = shapeFrom([V2(-bw3 / 2, 0), V2(bw3 / 2, 0), V2(bw3 / 2, H3), V2(-bw3 / 2, H3)]);
      s.holes.push(windowHole(0.95, 0.8, 1.55, 0.4, 0, { lobes: 3, cusp: 0.05, seg: 14 }));
      add('sandstone', extrude(s, 0.5), M(x, y3, 0));
      const gw = toWorld(x, y3 + 1, -0.6);
      const g = glowAttrs(new THREE.PlaneGeometry(1.0, 1.6).toNonIndexed(), { group: G.FACADE, key: gateKey(gw) + 0.5, bright: 0.22 + rand() * 0.22, color: [1.0, 0.42, 0.13] });
      add('glow', g, M(x, y3 + 1.2, -0.45));
      add('dark', box(bw3, H3, 0.2), M(x, y3 + H3 / 2, -0.9));
    }

    // cornice, parapet, kanguras, lamps
    const topY = y3 + H3;
    add('ivory', box(26.6, 0.18, 0.9), M(0, topY + 0.09, 0.15));
    add('sandstone', box(26.4, 0.7, 0.4), M(0, topY + 0.53, 0));
    const merlon = extrude(shapeFrom([V2(-0.17, 0), V2(0.17, 0), V2(0.17, 0.24), V2(0.09, 0.36), V2(0, 0.48), V2(-0.09, 0.36), V2(-0.17, 0.24)]), 0.3);
    for (let x = -12.9; x <= 13; x += 0.62) add('sandstone', merlon, M(x, topY + 0.88, 0));
    lampRow(new THREE.Vector3(-12.6, 0, 0), new THREE.Vector3(12.6, 0, 0), 0.62, (p) => lampF(p.x + 0.31, topY + 0.88, 0.05, G.FACADE));

    // roof, side and back walls (the interior stays hollow behind the rooms),
    // then the drum and great dome
    add('sandstone', box(26.4, 0.45, 13.2), M(0, topY + 0.2, -6.8));
    add('sandstone', box(0.4, topY, 13.2), M(-13, topY / 2, -6.8));
    add('sandstone', box(0.4, topY, 13.2), M(13, topY / 2, -6.8));
    add('sandstone', box(26.4, topY, 0.4), M(0, topY / 2, -13.2));
    const drumY = topY + 0.9;
    add('sandstone', new THREE.CylinderGeometry(3.5, 3.6, 2.4, 32, 1), M(0, drumY + 1.2, -4.2));
    add('ivory', new THREE.CylinderGeometry(3.75, 3.75, 0.25, 32, 1), M(0, drumY + 2.5, -4.2));
    add('ivory', domeGeometry(3.6, Math.max(24, seg + 8)), M(0, drumY + 2.62, -4.2));
    const domeBase = toWorld(0, drumY + 2.62, -4.2);
    for (let k = 0; k < Math.round(28 * Math.max(0.5, density)); k++) {
      const a = (k / Math.round(28 * Math.max(0.5, density))) * Math.PI * 2;
      addLamp(domeBase.x + Math.cos(a) * 3.82, domeBase.y - 0.12, domeBase.z + Math.sin(a) * 3.82, G.DOME, 0.5 + Math.abs(Math.sin(a / 2)) * 0.4);
    }
    // lamp ribs up the dome
    {
      const prof = [[1.0, 0.22], [0.96, 0.5], [0.78, 0.8], [0.5, 1.02], [0.22, 1.16]];
      const ribs = density < 0.6 ? 6 : 10;
      for (let r = 0; r < ribs; r++) {
        const a = (r / ribs) * Math.PI * 2 + 0.2;
        prof.forEach(([rr, yy], j) => {
          const R = 3.6;
          addLamp(domeBase.x + Math.cos(a) * rr * R * 1.02, domeBase.y + yy * R, domeBase.z + Math.sin(a) * rr * R * 1.02, G.DOME, 1 + j * 0.5, 1.2);
        });
      }
    }
    for (const cx of [-7.5, 7.5]) {
      add('ivory', chhatriGeometry(1.3, 16), M(cx, topY + 0.2, -2.2));
      const c = toWorld(cx, topY + 0.2, -2.2);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        addLamp(c.x + Math.cos(a) * 1.2, c.y + 0.24, c.z + Math.sin(a) * 1.2, G.DOME, 1.5 + k * 0.08);
      }
    }
    // facade foot lamps
    lampRow(new THREE.Vector3(-12.5, 0, 0), new THREE.Vector3(12.5, 0, 0), 0.6, (p) => {
      if (Math.abs(p.x) < 2.3) return;
      lampF(p.x, 0, 0.7);
      decalF(p.x, 0, 0.7, [0, 1, 0], 0.45, 0.35);
    });

    lights.add({ pos: [0, 3.5, -18.5], intensity: 3.2, radius: 15, group: G.FACADE, key: 3, priority: 1, only: 'all' });
    lights.add({ pos: [-8, 9, -19], intensity: 2.6, radius: 14, group: G.FACADE, key: 9, priority: 2 });
    lights.add({ pos: [8, 9, -19], intensity: 2.6, radius: 14, group: G.FACADE, key: 9, priority: 2 });
    lights.add({ pos: [0, 19, -22], intensity: 2.4, radius: 14, group: G.DOME, key: 2, priority: 3 });
    lights.add({ pos: [0, 4.8, -20], intensity: 1.6, radius: 10, group: G.ARCADE, key: 23, priority: 2 });
  }

  // --- Corner towers ---------------------------------------------------------
  for (const [x, z, h] of [[-13.6, -21.3, 16.5], [13.6, -21.3, 16.5], [-12.4, 16.4, 10.4], [12.4, 16.4, 10.4]]) {
    bag.add('sandstone', new THREE.CylinderGeometry(1.45, 1.6, h, 24, 1), M(x, h / 2, z));
    for (const by of [0.5, h * 0.45, h - 0.1]) bag.add('ivory', new THREE.CylinderGeometry(1.62, 1.62, 0.2, 24, 1), M(x, by, z));
    bag.add('ivory', chhatriGeometry(1.15, 14), M(x, h, z));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      addLamp(x + Math.cos(a) * 1.68, h * 0.45 + 0.1, z + Math.sin(a) * 1.68, G.DOME, 1.2);
    }
  }

  // --- Dhanteras at the south threshold: a heap of gold and a four-wick
  //     Yama lamp (Yama Deepam) with one wick turned to the south --------------
  const coins = [];
  {
    const [hx, hz] = [-0.62, 15.0];
    for (let i = 0; i < 170; i++) {
      const r = Math.sqrt(rand()) * 0.27;
      const a = rand() * Math.PI * 2;
      const h = Math.max(0, 0.13 * (1 - (r / 0.27) ** 1.4));
      coins.push(M(hx + Math.cos(a) * r, 0.003 + rand() * h, hz + Math.sin(a) * r, rand() * 6, 1, 1, 1, (rand() - 0.5) * 1.3));
    }
    for (const [ox, oz, ry] of [[0.05, -0.04, 0.4], [-0.07, 0.06, -0.9]]) {
      bag.add('gold', new THREE.TorusGeometry(0.045, 0.006, 6, 20), M(hx + ox, 0.1, hz + oz, ry, 1, 1, 1, 1.2));
    }
    const kalash = new THREE.LatheGeometry([[0.001, 0], [0.03, 0.004], [0.05, 0.035], [0.045, 0.07], [0.022, 0.09], [0.03, 0.105], [0.001, 0.11]].map(([r, y]) => V2(r, y)), 16);
    bag.add('gold', kalash, M(hx - 0.2, 0, hz - 0.12));

    const [lx, lz] = [0.62, 15.0];
    bag.add('granite', box(0.34, 0.24, 0.34), M(lx, 0.12, lz));
    const bowl = new THREE.LatheGeometry([[0.001, 0], [0.07, 0], [0.1, 0.02], [0.12, 0.05], [0.115, 0.06], [0.09, 0.04], [0.001, 0.035]].map(([r, y]) => V2(r, y)), 20);
    bag.add('clay', bowl, M(lx, 0.24, lz));
    const key = distKey(lx, lz) + 0.3;
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      lamps.add({ pos: [lx + dx * 0.15, 0.345, lz + dz * 0.15], group: G.FLOOR, key, rot: Math.atan2(-dz, dx), scale: 1.25 });
    }
    decals.add({ pos: [lx, 0, lz], radius: 1.2, intensity: 0.55, group: G.FLOOR, key });
    decals.add({ pos: [hx, 0, hz], radius: 0.75, intensity: 0.3, group: G.FLOOR, key });
    lights.add({ pos: [0, 0.8, 14.6], intensity: 1.8, radius: 5, group: G.FLOOR, key, priority: 2 });
  }

  // --- Rangoli surface -------------------------------------------------------
  const R = LAYOUT.rangoli;
  const rangoliGeo = new THREE.PlaneGeometry(R.size, R.size);
  rangoliGeo.rotateX(-Math.PI / 2);
  const rangoliMesh = new THREE.Mesh(rangoliGeo, materials.rangoli);
  rangoliMesh.position.set(R.x, 0.006, R.z);
  rangoliMesh.receiveShadow = true;
  rangoliMesh.renderOrder = 1;

  // Lakshmi's footprints walking in from the south gate
  const feetGeoParts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.PlaneGeometry(0.42, 0.42);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.007, 14.6 - i * 1.25);
    feetGeoParts.push(g);
  }
  const feet = new THREE.Mesh(mergeGeometries(feetGeoParts, false), materials.feet);
  feet.renderOrder = 1;

  // --- Build meshes ----------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'Palace';
  const mk = (key, mat, { worldUV = 0, cast = false, receive = true } = {}) => {
    const g = bag.merged(key, { worldUV });
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast && tier.shadows;
    m.receiveShadow = receive && tier.shadows;
    m.name = key;
    group.add(m);
    return m;
  };
  mk('floor', materials.floor, { worldUV: 1 / 3 });
  mk('sandstone', materials.sandstone, { worldUV: 0.5, cast: true });
  mk('ivory', materials.ivory, { worldUV: 0.6, cast: true });
  mk('granite', materials.granite, { worldUV: 1, cast: true });
  mk('clay', materials.clay, {});
  mk('gold', materials.gold, {});
  mk('dark', materials.dark, { receive: false });
  mk('bronze', materials.bronze, {});
  mk('jaali', materials.jaali, { worldUV: 0 });
  mk('glow', materials.glow, { receive: false });
  group.add(rangoliMesh, feet);

  // jaali planes need uv for the lattice: recompute in local plane space
  const jaaliMesh = group.getObjectByName('jaali');
  if (jaaliMesh) computeWorldUV(jaaliMesh.geometry, 1 / 0.75);

  // garland instances
  let garlands = null;
  if (flowers.length) {
    const fg = new THREE.IcosahedronGeometry(0.05, 0);
    garlands = new THREE.InstancedMesh(fg, materials.marigold, flowers.length);
    flowers.forEach((f, i) => { garlands.setMatrixAt(i, f.m); garlands.setColorAt(i, f.c); });
    garlands.instanceMatrix.needsUpdate = true;
    garlands.castShadow = false;
    group.add(garlands);
  }

  // akash kandils: star lanterns (emissive) with tails
  let kandilMesh = null;
  if (kandils.length) {
    const starPts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.1 : 0.24;
      starPts.push(V2(Math.cos(a) * r, Math.sin(a) * r));
    }
    const parts = [];
    for (const k of kandils) {
      const sg = extrude(shapeFrom(starPts), 0.14);
      sg.deleteAttribute('uv');
      sg.applyMatrix4(M(k.pos.x, k.pos.y, k.pos.z, rand() * Math.PI));
      glowAttrs(sg, { group: G.ARCADE, key: k.key, bright: 1.4, color: k.color });
      parts.push(sg);
      for (const tx of [-0.07, 0, 0.07]) {
        const tg = new THREE.PlaneGeometry(0.035, 0.42).toNonIndexed();
        tg.deleteAttribute('uv');
        tg.applyMatrix4(M(k.pos.x + tx, k.pos.y - 0.42, k.pos.z, 0));
        glowAttrs(tg, { group: G.ARCADE, key: k.key, bright: 0.5, color: k.color });
        parts.push(tg);
      }
      lights.add({ pos: [k.pos.x, k.pos.y, k.pos.z + 0.3], color: new THREE.Color(...k.color).getHex(), intensity: 0.8, radius: 4, group: G.ARCADE, key: k.key, priority: 4 });
    }
    kandilMesh = new THREE.Mesh(mergeGeometries(parts, false), materials.glow);
    group.add(kandilMesh);
  }

  // gold coins for Dhanteras
  const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 14), materials.gold, coins.length);
  coins.forEach((m, i) => coinMesh.setMatrixAt(i, m));
  coinMesh.instanceMatrix.needsUpdate = true;
  group.add(coinMesh);

  return {
    group,
    rangoliMesh,
    garlands,
    kandils: kandils.map((k) => ({ pos: k.pos, color: k.color, key: k.key })),
  };
}
