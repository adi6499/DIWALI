// LampField: hundreds or thousands of diyas drawn with a handful of instanced
// draw calls: clay bodies, flames, halos (with sprite bokeh for depth of
// field) and reflection streaks on water.
//
// Every lamp belongs to an ignition *group* and has a *key*. A group lights
// when its wave value sweeps past the key, so a wave of fire can travel
// across the courtyard, up a lamp tower, or down the side of a pool without
// any per-frame CPU work.

import * as THREE from '../lib/three.js';
import { gsap } from '../lib/gsap.js';
import { NOISE, WAVES, FOG_FACTOR } from './chunks.js';

export const MAX_GROUPS = 8;

/** Uniforms shared by everything lit by groups (lamps, decals, lanterns). */
export function createGroupUniforms() {
  return {
    uTime: { value: 0 },
    uWaves: { value: new Array(MAX_GROUPS).fill(0) },
    uGains: { value: new Array(MAX_GROUPS).fill(1) },
    uWaveSoft: { value: 1.6 },
  };
}

/** CPU twin of the GLSL lit() function. */
export function litAt(groupU, group, key) {
  const w = groupU.uWaves.value[group];
  const s = groupU.uWaveSoft.value;
  const x = Math.min(1, Math.max(0, (w - key) / s));
  return x * x * (3 - 2 * x) * groupU.uGains.value[group];
}

export const LIT_GLSL = /* glsl */ `
uniform float uWaves[${MAX_GROUPS}];
uniform float uGains[${MAX_GROUPS}];
uniform float uWaveSoft;
float litFor(float group, float key) {
  int g = int(group + 0.5);
  float x = clamp((uWaves[g] - key) / uWaveSoft, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x) * uGains[g];
}
`;

/** Shared vertex logic: where is this lamp's wick tip right now? */
const CENTER_GLSL = /* glsl */ `
attribute vec3 iPos;      // wick tip (static) or drift data (river)
attribute vec4 iParams;   // scale, seed, group, key
attribute vec4 iExtra;    // rotation, tint, driftSpeed, driftPhase
uniform float uTime;
uniform float uWaterY;
uniform vec2 uDriftSpan;  // x half-width, fade length
${WAVES}
vec3 lampCenter(out float fade) {
  fade = 1.0;
#ifdef DRIFT
  float span = uDriftSpan.x * 2.0;
  float x = mod(iPos.x + uTime * iExtra.z + uDriftSpan.x, span) - uDriftSpan.x;
  float z = iPos.z + sin(uTime * 0.07 + iExtra.w) * 1.2;
  fade = smoothstep(uDriftSpan.x, uDriftSpan.x - uDriftSpan.y, abs(x));
  float y = uWaterY + waveH(vec2(x, z), uTime) + iPos.y;
  return vec3(x, y, z);
#else
  return iPos;
#endif
}
`;

// ---------------------------------------------------------------------------
// Diya body: tiny clay bowl lit by its own flame.
// ---------------------------------------------------------------------------
const BODY_VERT = /* glsl */ `
${CENTER_GLSL}
${LIT_GLSL}
varying vec3 vN;
varying vec3 vLocal;
varying float vLit;
varying float vTint;
#include <fog_pars_vertex>
void main() {
  float fade;
  vec3 c = lampCenter(fade);
  float s = iParams.x * fade;
  float r = iExtra.x;
  float cr = cos(r), sr = sin(r);
  vec3 p = position * s;
  p = vec3(cr * p.x + sr * p.z, p.y, -sr * p.x + cr * p.z);
  vN = vec3(cr * normal.x + sr * normal.z, normal.y, -sr * normal.x + cr * normal.z);
  vLocal = position;
#ifdef DRIFT
  // tilt with the swell
  float e = 0.4;
  float hx = waveH(c.xz + vec2(e, 0.0), uTime) - waveH(c.xz - vec2(e, 0.0), uTime);
  float hz = waveH(c.xz + vec2(0.0, e), uTime) - waveH(c.xz - vec2(0.0, e), uTime);
  p.y += (p.x * hx + p.z * hz) / (2.0 * e);
#endif
  vec4 mvPosition = viewMatrix * vec4(c + p, 1.0);
  vLit = litFor(iParams.z, iParams.w) * fade;
  vTint = iExtra.y;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const BODY_FRAG = /* glsl */ `
uniform vec3 uClay;
uniform vec3 uAmbient;
uniform vec3 uFlameColor;
varying vec3 vN;
varying vec3 vLocal;
varying float vLit;
varying float vTint;
#include <fog_pars_fragment>
void main() {
  vec3 base = uClay * (0.8 + 0.4 * vTint);
  // Geometry origin is the wick tip; light falls from just above it.
  vec3 toFlame = vec3(0.0, 0.012, 0.0) - vLocal;
  float d = length(toFlame) / 0.06;
  float ndl = max(dot(normalize(vN), normalize(toFlame)), 0.0) * 0.8 + 0.2;
  float glow = vLit * ndl / (1.0 + d * d * 2.2);
  // inner bowl & oil catch most of the light
  float inner = smoothstep(-0.03, -0.012, vLocal.y) * step(0.0, normalize(vN).y);
  vec3 col = base * (uAmbient + uFlameColor * glow * (1.6 + inner * 2.4));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// ---------------------------------------------------------------------------
// Flame: camera-facing quad kept upright, shaped as a noisy teardrop.
// ---------------------------------------------------------------------------
const FLAME_VERT = /* glsl */ `
${CENTER_GLSL}
${LIT_GLSL}
uniform float uFlameH;
uniform float uMinPx;
uniform float uPxToWorld;
uniform float uWind;
varying vec2 vUv;
varying float vSeed;
varying float vLit;
varying float vFog;
varying float vTiny;
void main() {
  float fade;
  vec3 c = lampCenter(fade);
  float lit = litFor(iParams.z, iParams.w) * fade;
  vLit = lit;
  vSeed = iParams.y;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  vec3 vUp = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
  vec2 up2 = vUp.xy;
  float l = length(up2);
  vec2 upDir = l > 1e-3 ? up2 / l : vec2(0.0, 1.0);
  vec2 rightDir = vec2(upDir.y, -upDir.x);
  float fore = mix(0.4, 1.0, clamp(l, 0.0, 1.0));
  float t = uTime * (1.0 + iParams.y * 0.35) + iParams.y * 17.0;
  float flick = 0.9 + 0.06 * sin(t * 11.0) + 0.05 * sin(t * 6.7 + 1.3);
  float grow = lit < 0.999 ? pow(lit, 0.7) : 1.0;
  float h = uFlameH * iParams.x * grow * flick;
  // A distant flame thinner than a few pixels would vanish between pixels;
  // it becomes a small round point of light instead.
  float depth = max(-mv.z, 0.001);
  float pxPerM = 1.0 / (depth * uPxToWorld);
  float wPx = h * 0.16 * pxPerM;
  vTiny = 1.0 - smoothstep(1.5, 5.0, wPx);
  float minS = uMinPx * 3.0 / pxPerM;
  float big = mix(h, max(h * 0.5, minS), vTiny) * step(0.001, lit);
  float w = big * mix(0.42, 1.0, vTiny);
  vec2 p = position.xy;   // x -0.5..0.5, y -0.25..1.0
  float sway = (sin(t * 2.1) * 0.6 + sin(t * 3.7 + iParams.y * 4.0) * 0.4 + uWind) * 0.09 * p.y * p.y;
  mv.xy += rightDir * (p.x * w + sway * big) + upDir * (p.y * big * fore);
  vUv = vec2(p.x + 0.5, p.y);
  vFog = depth;
  gl_Position = projectionMatrix * mv;
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying float vSeed;
varying float vLit;
varying float vFog;
varying float vTiny;
#include <fog_pars_fragment>
${NOISE}
${FOG_FACTOR}
void main() {
  if (vLit < 0.002) discard;
  float x = vUv.x - 0.5;
  float y = vUv.y;
#ifdef HERO
  float n = fbm5(vec2(x * 3.2, y * 2.2 - uTime * 2.6 + vSeed * 7.0));
  float n2 = vnoise(vec2(x * 9.0, y * 6.0 - uTime * 5.0));
  x += (n - 0.5) * 0.16 * y + (n2 - 0.5) * 0.03 * y;
#else
  float n = fbm3(vec2(x * 3.0, y * 2.0 - uTime * 2.4 + vSeed * 7.0));
  x += (n - 0.5) * 0.18 * y;
#endif
  float yy = clamp(y, 0.0, 1.0);
  float prof = 0.7 * pow(yy + 0.03, 0.5) * pow(max(1.0 - yy, 0.0), 1.0) + 0.0001;
  float d = abs(x) / prof;
  float base = smoothstep(-0.2, 0.04, y);
  float body = (1.0 - smoothstep(0.5, 1.0, d)) * base * (1.0 - smoothstep(0.82, 1.0, y));
  float core = (1.0 - smoothstep(0.0, 0.6, d)) * smoothstep(0.02, 0.14, y) * (1.0 - smoothstep(0.32, 0.72, y));
  vec3 cOuter = vec3(1.0, 0.3, 0.05);
  vec3 cMid = vec3(1.0, 0.56, 0.16);
  vec3 cCore = vec3(1.0, 0.82, 0.48);
  vec3 col = mix(cOuter, cMid, 1.0 - smoothstep(0.25, 0.95, d));
  col = mix(col, cCore, core);
  // cool blue root of the flame, just above the wick
  float blue = (1.0 - smoothstep(0.0, 0.16, y)) * smoothstep(-0.12, 0.02, y) * smoothstep(0.25, 0.85, d) * 0.9;
  col = mix(col, vec3(0.3, 0.45, 1.0), blue * 0.7);
#ifdef HERO
  // dark zone hugging the wick
  float dark = (1.0 - smoothstep(0.0, 0.08, y)) * (1.0 - smoothstep(0.0, 0.35, d));
  col *= 1.0 - dark * 0.5;
#endif
  float a = body * (0.75 + 0.25 * (1.0 - y));
  // A flame smaller than a few pixels becomes a soft point
  float r = length(vec2(vUv.x - 0.5, (y - 0.375) * 0.8)) * 2.4;
  float dotA = exp(-r * r * 3.5) * 0.85;
  a = mix(a, dotA, vTiny);
  col = mix(col, mix(cMid, cCore, 0.5), vTiny);
  float fog = 1.0 - fogAmount(vFog) * 0.85;
  gl_FragColor = vec4(col * a * vLit * uIntensity * fog * (1.0 + core * 0.9), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Halo: soft glow that becomes a bokeh disc when out of focus.
// ---------------------------------------------------------------------------
const HALO_VERT = /* glsl */ `
${CENTER_GLSL}
${LIT_GLSL}
uniform float uHaloSize;
uniform float uFlameH;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxCoc;
uniform float uMinPx;
uniform float uPxToWorld;
varying vec2 vUv;
varying float vA;
varying float vBokeh;
varying float vFog;
void main() {
  float fade;
  vec3 c = lampCenter(fade);
  float lit = litFor(iParams.z, iParams.w) * fade;
  c.y += uFlameH * iParams.x * 0.35;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float depth = max(-mv.z, 0.001);
  float coc = clamp(abs(depth - uFocus) / depth * uAperture, 0.0, 1.0);
  float grow = 1.0 + coc * uMaxCoc;
  float size = uHaloSize * iParams.x * grow;
  float minS = uMinPx * 1.5 * depth * uPxToWorld;
  float boost = 1.0;
  if (size < minS) { boost = (size * size) / (minS * minS); size = minS; }
  float t = uTime * (1.0 + iParams.y) + iParams.y * 9.0;
  float flick = 0.88 + 0.12 * sin(t * 7.0) * sin(t * 3.1 + 0.7);
  vA = lit * flick * boost / pow(grow, 1.35);
  vBokeh = smoothstep(0.08, 0.5, coc);
  vUv = position.xy * 2.0;
  mv.xy += position.xy * 2.0 * size;
  vFog = depth;
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uHaloColor;
uniform float uHaloIntensity;
varying vec2 vUv;
varying float vA;
varying float vBokeh;
varying float vFog;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  if (vA < 0.002) discard;
  float r = length(vUv);
  if (r > 1.0) discard;
  // fades fully to zero before the edge of the quad, so no ring can show
  float fade = 1.0 - smoothstep(0.45, 1.0, r);
  float gauss = (exp(-r * r * 8.0) + exp(-r * r * 30.0) * 0.8) * fade;
  float disc = (1.0 - smoothstep(0.8, 1.0, r)) * (0.6 + 0.4 * smoothstep(0.5, 0.95, r));
  float a = mix(gauss, disc * 0.65, vBokeh);
  float fog = 1.0 - fogAmount(vFog) * 0.7;
  gl_FragColor = vec4(uHaloColor * a * vA * uHaloIntensity * fog, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Streak: reflection of a flame laid flat on the water surface, stretched
// toward the camera and broken up by ripples.
// ---------------------------------------------------------------------------
const STREAK_VERT = /* glsl */ `
${CENTER_GLSL}
${LIT_GLSL}
uniform float uFlameH;
uniform vec4 uBounds;   // minX, maxX, minZ, maxZ
uniform float uStretch;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vFog;
void main() {
  float fade;
  vec3 L = lampCenter(fade);
  float lit = litFor(iParams.z, iParams.w) * fade;
  L.y += uFlameH * iParams.x * 0.35;
  vec3 C = cameraPosition;
  vec3 Lm = vec3(L.x, 2.0 * uWaterY - L.y, L.z);
  float denom = Lm.y - C.y;
  float t = (uWaterY - C.y) / (abs(denom) < 1e-4 ? -1e-4 : denom);
  vec3 P = C + (Lm - C) * clamp(t, 0.0, 1.0);
  P.y = uWaterY + 0.004;
  vec2 toCam = C.xz - P.xz;
  float dl = max(length(toCam), 1e-3);
  vec2 D = toCam / dl;
  vec2 S = vec2(-D.y, D.x);
  float sinG = clamp((C.y - uWaterY) / length(C - P), 0.05, 1.0);
  float w = uFlameH * iParams.x * 0.9 * clamp(t, 0.05, 1.0) * 3.2;
  float len = uFlameH * iParams.x * uStretch * clamp(t, 0.05, 1.0) / sinG;
  w = max(w, 0.0016 * dl);
  len = max(len, 0.008 * dl);
  vec2 q = position.xy; // x -1..1, y -0.3..1
  P.xz += S * q.x * w + D * q.y * len;
  float inside = step(uBounds.x, L.x) * step(L.x, uBounds.y) * step(uBounds.z, L.z) * step(L.z, uBounds.w);
  vA = lit * inside * step(0.0, t);
  vUv = q;
  vSeed = iParams.y;
  vec4 mv = viewMatrix * vec4(P, 1.0);
  vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const STREAK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uStreakIntensity;
uniform vec4 uBounds;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vFog;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  if (vA < 0.002) discard;
  float ax = abs(vUv.x);
  float ay = vUv.y;
  float a = exp(-ax * ax * 5.0) * smoothstep(-0.3, 0.05, ay) * (1.0 - smoothstep(0.3, 1.0, ay));
  float bands = 0.5 + 0.5 * sin(ay * 26.0 - uTime * 2.6 + vSeed * 9.0 + ax * 4.0);
  a *= 0.35 + 0.65 * bands;
  float fog = 1.0 - fogAmount(vFog) * 0.8;
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a * vA * uStreakIntensity * fog, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Low-poly diya body with the wick tip at the origin. */
export function makeDiyaBodyGeometry(segments = 10) {
  const pts = [
    [0.001, 0.0], [0.02, 0.0], [0.034, 0.008], [0.043, 0.018], [0.047, 0.027],
    [0.044, 0.031], [0.036, 0.024], [0.02, 0.013], [0.001, 0.011],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segments);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const s = Math.exp(-(a * a) / (2 * 0.32 * 0.32));
    const hf = THREE.MathUtils.smoothstep(y, 0.008, 0.03);
    const k = 1 + 0.5 * s * hf;
    const na = a * (1 - 0.3 * s * hf);
    pos.setXYZ(i, Math.cos(na) * r * k, y + 0.003 * s * hf, Math.sin(na) * r * k);
  }
  g.computeVertexNormals();
  // wick tip sits in the spout at about (0.058, 0.036)
  g.translate(-0.058, -0.036, 0);
  g.deleteAttribute('uv');
  return g;
}

function quadGeometry(x0, x1, y0, y1) {
  const g = new THREE.InstancedBufferGeometry();
  const p = new Float32Array([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export class LampField {
  /**
   * @param {object} o
   * @param {object} o.groupU     shared group uniforms (createGroupUniforms)
   * @param {boolean} [o.bodies]  draw clay bodies
   * @param {boolean} [o.drift]   lamps float on water (river)
   * @param {object} [o.reflect]  { y, bounds:[minX,maxX,minZ,maxZ] } → streaks
   * @param {boolean} [o.hero]    high-detail flame
   * @param {number}  [o.capacity]
   */
  constructor({ groupU, bodies = true, flames = true, drift = false, reflect = null, hero = false, capacity = 1024, flameH = 0.034, haloSize = 0.09, maxCoc = 5, segments = 10 }) {
    this.groupU = groupU;
    this.opts = { bodies, flames, drift, reflect, hero, flameH, haloSize, maxCoc, segments };
    this.capacity = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
    this.extra = new Float32Array(capacity * 4);
    this.group = new THREE.Group();
    this.group.name = 'LampField';
    this.built = false;
    this.u = {
      ...groupU,
      uWaterY: { value: reflect ? reflect.y : 0 },
      uDriftSpan: { value: new THREE.Vector2(200, 30) },
      uFlameH: { value: flameH },
      uMinPx: { value: 1.6 },
      uPxToWorld: { value: 0.001 },
      uWind: { value: 0 },
      uIntensity: { value: hero ? 2.4 : 1.8 },
      uHaloSize: { value: haloSize },
      uHaloColor: { value: new THREE.Color(1.0, 0.55, 0.22) },
      uHaloIntensity: { value: hero ? 0.9 : 0.7 },
      uFocus: { value: 8 },
      uAperture: { value: 0 },
      uMaxCoc: { value: maxCoc },
      uBounds: { value: new THREE.Vector4(-1e5, 1e5, -1e5, 1e5) },
      uStretch: { value: 5 },
      uStreakIntensity: { value: 0.9 },
      uClay: { value: new THREE.Color(0.55, 0.24, 0.12) },
      uAmbient: { value: new THREE.Color(0.05, 0.05, 0.1) },
      uFlameColor: { value: new THREE.Color(1.0, 0.55, 0.22) },
    };
    if (reflect && reflect.bounds) this.u.uBounds.value.set(...reflect.bounds);
  }

  /** Add a lamp. For drift lamps pos = [x0, heightAboveWater, z0]. */
  add({ pos, scale = 1, group = 0, key = 0, rot = Math.random() * Math.PI * 2, tint = Math.random(), speed = 0, phase = Math.random() * 6.283, seed = Math.random() }) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.pos.set(pos, i * 3);
    this.params.set([scale, seed, group, key], i * 4);
    this.extra.set([rot, tint, speed, phase], i * 4);
    return i;
  }

  build() {
    if (this.built) return this;
    this.built = true;
    const n = this.count;
    if (!n) return this;
    const iPos = new THREE.InstancedBufferAttribute(this.pos.subarray(0, n * 3), 3);
    const iParams = new THREE.InstancedBufferAttribute(this.params.subarray(0, n * 4), 4);
    const iExtra = new THREE.InstancedBufferAttribute(this.extra.subarray(0, n * 4), 4);
    this.attrs = { iPos, iParams, iExtra };
    const defines = {};
    if (this.opts.drift) defines.DRIFT = 1;
    const withAttrs = (g) => {
      g.setAttribute('iPos', iPos);
      g.setAttribute('iParams', iParams);
      g.setAttribute('iExtra', iExtra);
      g.instanceCount = n;
      return g;
    };
    const fogU = THREE.UniformsLib.fog;
    const mk = (vert, frag, extra = {}) => new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(fogU), ...this.u },
      vertexShader: vert,
      fragmentShader: frag,
      defines: { ...defines, ...(extra.defines || {}) },
      fog: true,
      ...extra.mat,
    });

    if (this.opts.bodies) {
      const base = makeDiyaBodyGeometry(this.opts.segments);
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute('position', base.attributes.position);
      g.setAttribute('normal', base.attributes.normal);
      withAttrs(g);
      const m = mk(BODY_VERT, BODY_FRAG);
      this.bodies = new THREE.Mesh(g, m);
      this.bodies.frustumCulled = false;
      this.group.add(this.bodies);
    }

    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const flameDefines = this.opts.hero ? { HERO: 1 } : {};
    if (this.opts.flames) {
      this.flames = new THREE.Mesh(withAttrs(quadGeometry(-0.5, 0.5, -0.25, 1.0)), mk(FLAME_VERT, FLAME_FRAG, { defines: flameDefines, mat: additive }));
      this.flames.frustumCulled = false;
      this.flames.renderOrder = 3;
      this.group.add(this.flames);
    }
    this.halos = new THREE.Mesh(withAttrs(quadGeometry(-0.5, 0.5, -0.5, 0.5)), mk(HALO_VERT, HALO_FRAG, { mat: additive }));
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 4;
    this.group.add(this.halos);

    if (this.opts.reflect) {
      const g = withAttrs(quadGeometry(-1, 1, -0.3, 1));
      const m = mk(STREAK_VERT, STREAK_FRAG, { mat: { ...additive, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } });
      this.streaks = new THREE.Mesh(g, m);
      this.streaks.frustumCulled = false;
      this.streaks.renderOrder = 2;
      this.group.add(this.streaks);
    }
    return this;
  }

  /** Update a lamp's position (for a few moving lamps, e.g. the hero diya). */
  setPosition(i, x, y, z) {
    if (!this.attrs) return;
    this.attrs.iPos.setXYZ(i, x, y, z);
    this.attrs.iPos.needsUpdate = true;
  }

  /** Keep minimum on-screen sizes correct for the current camera. */
  updateCamera(camera, viewportHeightPx) {
    const fovRad = (camera.fov * Math.PI) / 180;
    this.u.uPxToWorld.value = (2 * Math.tan(fovRad / 2)) / Math.max(1, viewportHeightPx);
  }

  setFocus(focus, aperture) {
    this.u.uFocus.value = focus;
    this.u.uAperture.value = aperture;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}

/** Tween a group's wave value. Returns the GSAP tween. */
export function tweenWave(groupU, group, to, duration, ease = 'power1.inOut', delay = 0) {
  const proxy = { v: groupU.uWaves.value[group] };
  return gsap.to(proxy, {
    v: to,
    duration,
    ease,
    delay,
    onUpdate: () => { groupU.uWaves.value[group] = proxy.v; },
  });
}

export function tweenGain(groupU, group, to, duration = 1.2) {
  const proxy = { v: groupU.uGains.value[group] };
  return gsap.to(proxy, {
    v: to,
    duration,
    ease: 'sine.inOut',
    onUpdate: () => { groupU.uGains.value[group] = proxy.v; },
  });
}

// ---------------------------------------------------------------------------
// Decals: warm pools of light on floors and walls beneath lamps.
// ---------------------------------------------------------------------------
const DECAL_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iNormal;
attribute vec4 iParams; // radius, intensity, group, key
${LIT_GLSL}
varying vec2 vUv;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 n = normalize(iNormal);
  vec3 t = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec3 b = cross(n, t);
  vec3 p = iPos + (t * position.x + b * position.y) * iParams.x + n * 0.004;
  vUv = position.xy;
  vA = litFor(iParams.z, iParams.w) * iParams.y;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const DECAL_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
#include <fog_pars_fragment>
${FOG_FACTOR}
void main() {
  if (vA < 0.002) discard;
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 2.4);
  float fogD = 0.0;
  #ifdef USE_FOG
    fogD = vFogDepth;
  #endif
  float fog = 1.0 - fogAmount(fogD) * 0.9;
  gl_FragColor = vec4(uColor * a * vA * fog, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class DecalField {
  constructor({ groupU, capacity = 512 }) {
    this.groupU = groupU;
    this.capacity = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 3);
    this.nrm = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
  }

  add({ pos, normal = [0, 1, 0], radius = 0.5, intensity = 0.4, group = 0, key = 0 }) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos.set(pos, i * 3);
    this.nrm.set(normal, i * 3);
    this.params.set([radius, intensity, group, key], i * 4);
  }

  build() {
    const n = this.count;
    const g = quadGeometry(-1, 1, -1, 1);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos.subarray(0, n * 3), 3));
    g.setAttribute('iNormal', new THREE.InstancedBufferAttribute(this.nrm.subarray(0, n * 3), 3));
    g.setAttribute('iParams', new THREE.InstancedBufferAttribute(this.params.subarray(0, n * 4), 4));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...this.groupU, uColor: { value: new THREE.Color(1.0, 0.5, 0.18) } },
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      fog: true,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    return this.mesh;
  }
}
