// GPU fireworks. Every spark is a point whose whole flight is solved in the
// vertex shader (gravity + air drag, closed form), so the CPU only writes a
// spark once, when it is born, into a ring buffer. Trails are delayed copies
// that follow the same path. Shells: peony, chrysanthemum, golden willow,
// ring, palm, crossette and a lotus; ground pieces: anar (fountain) and chakri
// (spinner); and the phuljhadi sparkler, which writes with light.
import * as THREE from '../lib/three.js';

const COLORS = {
  red: [1.0, 0.22, 0.16], gold: [1.0, 0.66, 0.24], green: [0.3, 1.0, 0.42], blue: [0.35, 0.52, 1.0],
  magenta: [1.0, 0.3, 0.78], white: [1.0, 0.94, 0.84], orange: [1.0, 0.48, 0.14], violet: [0.62, 0.42, 1.0],
  pink: [1.0, 0.5, 0.72],
};
const SHELL_PALETTES = [['red', 'gold'], ['green', 'white'], ['blue', 'violet'], ['magenta', 'gold'], ['orange', 'white'], ['gold'], ['pink', 'white'], ['violet', 'green']];

const VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec2 aTime;     // start, life
attribute vec4 aParams;   // size, drag, flags, gravityScale
uniform float uTime;
uniform float uGravity;
uniform float uScale;
uniform float uMaxSize;
uniform float uWaterY;
uniform vec4 uBounds;
varying vec3 vColor;
varying float vAlpha;

vec3 flight(float t) {
  float k = aParams.y;
  vec3 g = vec3(0.0, -uGravity * aParams.w, 0.0);
  if (k > 0.001) {
    float e = exp(-k * t);
    return position + (aVel - g / k) * (1.0 - e) / k + g * t / k;
  }
  return position + aVel * t + 0.5 * g * t * t;
}

void main() {
  float t = uTime - aTime.x;
  float life = aTime.y;
  if (t < 0.0 || t > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  vec3 p = flight(t);
  float age = t / life;
  float flags = aParams.z;
  float seed = fract(sin(float(gl_VertexID) * 12.9898) * 43758.5453);
  float b = (1.0 - smoothstep(0.62, 1.0, age)) * smoothstep(0.0, 0.025, t);
  if (mod(flags, 2.0) > 0.5) b *= step(0.42, fract(t * 8.0 + seed * 7.0));                 // strobe
  if (mod(floor(flags / 2.0), 2.0) > 0.5 && age > 0.5) b *= 0.4 + 1.2 * step(0.6, fract(t * 13.0 + seed * 3.0)); // glitter
  vec3 col = aColor;
  if (mod(floor(flags / 4.0), 2.0) > 0.5) col = mix(vec3(1.0, 0.95, 0.85) * 1.6, aColor, smoothstep(0.0, 0.22, age)); // hot start
  vColor = col;
  vAlpha = b;
#ifdef REFLECTION
  vec3 C = cameraPosition;
  vec3 Pm = vec3(p.x, 2.0 * uWaterY - p.y, p.z);
  float tt = (uWaterY - C.y) / min(Pm.y - C.y, -1e-4);
  vec3 P = C + (Pm - C) * clamp(tt, 0.0, 1.0);
  P.y = uWaterY + 0.005;
  float inside = step(uBounds.x, P.x) * step(P.x, uBounds.y) * step(uBounds.z, P.z) * step(P.z, uBounds.w);
  vAlpha *= inside * 0.45;
  vec4 mv = viewMatrix * vec4(P, 1.0);
  float size = aParams.x * (1.0 - age * age * 0.6) * clamp(tt, 0.0, 1.0);
#else
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = aParams.x * (1.0 - age * age * 0.6);
#endif
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.1), 2.0, uMaxSize);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha < 0.003) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.0);
  float glow = exp(-r2 * 1.8) * 0.4;
  gl_FragColor = vec4(vColor * (core * 1.4 + glow) * vAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const rnd = Math.random;
const range = (a, b) => a + rnd() * (b - a);
function sphereDir(out) {
  const u = rnd() * 2 - 1;
  const th = rnd() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(th), u, s * Math.sin(th));
}

export class Fireworks {
  constructor({ tier, engine, waterY = 0, poolBounds = null }) {
    this.engine = engine;
    this.max = tier.fwParticles;
    // Trail copies follow 20 ms apart so streaks read as continuous light
    this.trail = tier.fwTrail * 2;
    this.scaleN = Math.min(1, Math.sqrt(this.max / 14000));
    this.time = 0;
    this.cursor = 0;
    this.minDirty = Infinity;
    this.maxDirty = -1;
    this.wrapped = false;
    this.events = [];
    this.emitters = [];
    this.rockets = [];
    this.flash = new THREE.Color();
    this.flashEnergy = new THREE.Color();
    this.flashPos = new THREE.Vector3(0, 24, -32);
    this.reduced = false;
    this.onSound = null;
    this.camera = null;
    this.launchTimes = [];

    const n = this.max;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.aColor = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    const times = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { times[i * 2] = -1e4; times[i * 2 + 1] = 0; }
    this.aTime = new THREE.BufferAttribute(times, 2);
    this.aParams = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    for (const a of [this.aPos, this.aVel, this.aColor, this.aTime, this.aParams]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aTime', this.aTime);
    geo.setAttribute('aParams', this.aParams);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, -20), 200);

    this.uniforms = {
      uTime: { value: 0 },
      uGravity: { value: 6.2 },
      uScale: { value: 900 },
      uMaxSize: { value: 48 },
      uWaterY: { value: waterY },
      uBounds: { value: new THREE.Vector4(...(poolBounds || [-1e5, 1e5, -1e5, 1e5])) },
    };
    const mk = (defines) => new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Group();
    this.points = new THREE.Points(geo, mk({}));
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.object.add(this.points);
    if (poolBounds) {
      this.reflection = new THREE.Points(geo, mk({ REFLECTION: 1 }));
      this.reflection.frustumCulled = false;
      this.reflection.renderOrder = 2;
      this.object.add(this.reflection);
    }
    try {
      const gl = engine.renderer.getContext();
      const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      if (r && r[1]) this.uniforms.uMaxSize.value = Math.min(64, r[1]);
    } catch { /* keep default */ }
    this._v = new THREE.Vector3();
  }

  // --- low level -------------------------------------------------------------
  _spawn(ox, oy, oz, vx, vy, vz, col, start, life, size, drag, flags, grav) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.cursor === 0) this.wrapped = true;
    this.aPos.array[i * 3] = ox; this.aPos.array[i * 3 + 1] = oy; this.aPos.array[i * 3 + 2] = oz;
    this.aVel.array[i * 3] = vx; this.aVel.array[i * 3 + 1] = vy; this.aVel.array[i * 3 + 2] = vz;
    this.aColor.array[i * 3] = col[0]; this.aColor.array[i * 3 + 1] = col[1]; this.aColor.array[i * 3 + 2] = col[2];
    this.aTime.array[i * 2] = start; this.aTime.array[i * 2 + 1] = life;
    this.aParams.array[i * 4] = size; this.aParams.array[i * 4 + 1] = drag; this.aParams.array[i * 4 + 2] = flags; this.aParams.array[i * 4 + 3] = grav;
    if (i < this.minDirty) this.minDirty = i;
    if (i > this.maxDirty) this.maxDirty = i;
  }

  /** A star plus its trail copies. */
  _star(o, v, col, { life, size, drag = 1.4, flags = 4, grav = 1, trail = this.trail, delay = 0, bright = 2.4 }) {
    const t0 = this.time + delay;
    for (let j = 0; j <= trail; j++) {
      const k = 1 - j / (trail + 1);
      const c = [col[0] * bright * (0.35 + 0.65 * k), col[1] * bright * (0.35 + 0.65 * k), col[2] * bright * (0.35 + 0.65 * k)];
      this._spawn(o.x, o.y, o.z, v.x, v.y, v.z, c, t0 + j * 0.02, life, size * (0.4 + 0.6 * k), drag, j === 0 ? flags : flags & ~4, grav);
    }
  }

  /** Position of a spark at time t (CPU twin of the shader). */
  _flight(out, o, v, drag, grav, t) {
    const g = -this.uniforms.uGravity.value * grav;
    if (drag > 0.001) {
      const e = Math.exp(-drag * t);
      out.set(
        o.x + (v.x * (1 - e)) / drag,
        o.y + ((v.y - g / drag) * (1 - e)) / drag + (g * t) / drag,
        o.z + (v.z * (1 - e)) / drag,
      );
    } else {
      out.set(o.x + v.x * t, o.y + v.y * t + 0.5 * g * t * t, o.z + v.z * t);
    }
    return out;
  }

  _flush() {
    if (this.maxDirty < 0) return;
    const attrs = [[this.aPos, 3], [this.aVel, 3], [this.aColor, 3], [this.aTime, 2], [this.aParams, 4]];
    for (const [a, size] of attrs) {
      a.clearUpdateRanges();
      if (this.wrapped) {
        a.addUpdateRange(0, this.max * size);
      } else {
        a.addUpdateRange(this.minDirty * size, (this.maxDirty - this.minDirty + 1) * size);
      }
      a.needsUpdate = true;
    }
    this.minDirty = Infinity;
    this.maxDirty = -1;
    this.wrapped = false;
  }

  _addFlash(col, pos, amount) {
    // Kept low on purpose: the sky must never strobe (photosensitive safety)
    const cap = this.reduced ? 0.2 : 0.55;
    this.flashEnergy.r = Math.min(cap, this.flashEnergy.r + col[0] * amount);
    this.flashEnergy.g = Math.min(cap, this.flashEnergy.g + col[1] * amount);
    this.flashEnergy.b = Math.min(cap, this.flashEnergy.b + col[2] * amount);
    this.flashPos.lerp(pos, 0.6);
  }

  _pan(p) {
    if (!this.camera) return 0;
    const v = p.clone().project(this.camera);
    return Math.max(-1, Math.min(1, v.x));
  }

  // --- public ----------------------------------------------------------------
  /** Rate-limited so the sky never flashes faster than 3 times a second. */
  canLaunch() {
    const now = performance.now();
    this.launchTimes = this.launchTimes.filter((t) => now - t < 1000);
    return this.launchTimes.length < 3;
  }

  launch(type, target) {
    if (type === 'anar') return this.fountain(new THREE.Vector3(target.x, 0, target.z));
    if (type === 'chakri') return this.chakri(new THREE.Vector3(target.x, 0, target.z));
    this.launchTimes.push(performance.now());
    const T = range(1.15, 1.55);
    const origin = new THREE.Vector3(target.x * 0.85 + range(-1, 1), 2, Math.min(target.z + range(-2, 2), -24));
    const g = this.uniforms.uGravity.value;
    const v = new THREE.Vector3((target.x - origin.x) / T, (target.y - origin.y + 0.5 * g * T * T) / T, (target.z - origin.z) / T);
    const head = [1.0, 0.75, 0.4];
    this._star(origin, v, head, { life: T, size: 0.32, drag: 0, flags: 4, grav: 1, trail: Math.max(2, this.trail + 2), bright: 2.2 });
    this.rockets.push({ o: origin, v, start: this.time, T });
    this.events.push({ at: this.time + T, fn: () => this.burst(type, target) });
    this.onSound?.('launch', { pan: this._pan(origin) });
  }

  burst(type, p, palette = null) {
    const pal = (palette || SHELL_PALETTES[Math.floor(rnd() * SHELL_PALETTES.length)]).map((c) => COLORS[c]);
    const N = (n) => Math.max(8, Math.round(n * this.scaleN));
    const d = this._v;
    const T = this.trail;
    let flashCol = pal[0];
    let big = 1;
    switch (type) {
      case 'chrysanthemum':
        for (let i = 0; i < N(130); i++) {
          sphereDir(d).multiplyScalar(range(13, 15));
          this._star(p, d.clone(), pal[i % pal.length], { life: range(2.0, 2.5), size: 0.34, drag: 1.3, flags: 4 | 2, trail: T + 2 });
        }
        break;
      case 'willow':
        flashCol = COLORS.gold;
        for (let i = 0; i < N(110); i++) {
          sphereDir(d).multiplyScalar(range(10, 12));
          this._star(p, d.clone(), COLORS.gold, { life: range(3.2, 4.0), size: 0.3, drag: 2.4, flags: 2, grav: 1.1, trail: T + 3, bright: 2.0 });
        }
        break;
      case 'ring': {
        const nrm = new THREE.Vector3(range(-0.4, 0.4), range(0.2, 0.8), 1).normalize();
        const a = new THREE.Vector3(1, 0, 0).cross(nrm).normalize();
        const b = nrm.clone().cross(a).normalize();
        const n = N(90);
        for (let i = 0; i < n; i++) {
          const th = (i / n) * Math.PI * 2;
          d.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th)).multiplyScalar(14);
          this._star(p, d.clone(), pal[0], { life: 1.9, size: 0.38, drag: 1.5, trail: T });
        }
        for (let i = 0; i < N(30); i++) {
          sphereDir(d).multiplyScalar(range(4, 6));
          this._star(p, d.clone(), COLORS.white, { life: 1.2, size: 0.25, drag: 1.6, flags: 1, trail: 0 });
        }
        break;
      }
      case 'palm':
        flashCol = COLORS.gold;
        for (let i = 0; i < 9; i++) {
          const th = (i / 9) * Math.PI * 2;
          d.set(Math.cos(th) * 0.8, range(0.5, 0.9), Math.sin(th) * 0.8).normalize().multiplyScalar(range(15, 17));
          this._star(p, d.clone(), COLORS.gold, { life: 2.5, size: 0.65, drag: 1.0, flags: 4 | 2, trail: T + 6, bright: 2.2 });
        }
        break;
      case 'crossette':
        for (let i = 0; i < N(14); i++) {
          sphereDir(d).multiplyScalar(range(11, 13));
          const v = d.clone();
          this._star(p, v, COLORS.white, { life: 0.95, size: 0.4, drag: 1.2, trail: T + 1 });
          const o = p.clone();
          const col = pal[i % pal.length];
          this.events.push({
            at: this.time + 0.9,
            fn: () => {
              const q = this._flight(new THREE.Vector3(), o, v, 1.2, 1, 0.9);
              const ax = new THREE.Vector3(1, 0, 0).cross(v).normalize();
              const ay = v.clone().cross(ax).normalize();
              for (const s of [ax, ay, ax.clone().negate(), ay.clone().negate()]) {
                this._star(q, s.clone().multiplyScalar(7), col, { life: 0.9, size: 0.3, drag: 1.4, trail: T });
              }
            },
          });
        }
        this.events.push({ at: this.time + 0.9, fn: () => this.onSound?.('crackle', { pan: this._pan(p) }) });
        big = 0.8;
        break;
      case 'lotus': {
        // A lotus opening in the plane facing the camera
        flashCol = COLORS.pink;
        const cam = this.camera;
        const right = new THREE.Vector3(1, 0, 0);
        if (cam) right.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const petals = 9;
        const per = Math.max(8, Math.round(16 * this.scaleN));
        for (let i = 0; i < petals; i++) {
          const ang = (-0.5 + i / (petals - 1)) * Math.PI * 1.15;
          const w = 0.2;
          for (let k = 0; k < per; k++) {
            const dl = (k / (per - 1) - 0.5) * 2 * w;
            const f = Math.sqrt(Math.max(0, 1 - (dl / w) ** 2));
            const th = ang + dl;
            const speed = 13 * (0.35 + 0.65 * f) * (i === 0 || i === petals - 1 ? 0.7 : 1);
            d.copy(right).multiplyScalar(Math.sin(th)).addScaledVector(up, Math.cos(th)).multiplyScalar(speed);
            const col = k % 3 === 0 ? COLORS.white : COLORS.pink;
            this._star(p, d.clone(), col, { life: 2.1, size: 0.34, drag: 1.5, grav: 0.55, trail: T });
          }
        }
        for (let i = 0; i < N(40); i++) {
          sphereDir(d).multiplyScalar(range(3, 5));
          this._star(p, d.clone(), COLORS.gold, { life: 1.4, size: 0.3, drag: 1.4, flags: 2, trail: 1 });
        }
        break;
      }
      case 'peony':
      default:
        for (let i = 0; i < N(150); i++) {
          sphereDir(d).multiplyScalar(range(12, 14.5));
          this._star(p, d.clone(), pal[i % pal.length], { life: range(1.6, 2.1), size: 0.42, drag: 1.6, trail: T });
        }
    }
    this._addFlash(flashCol, p, 0.45 * big);
    const dist = this.camera ? this.camera.position.distanceTo(p) : 50;
    this.onSound?.('burst', { pan: this._pan(p), distance: dist, crackle: type === 'chrysanthemum' || type === 'willow', size: big });
  }

  fountain(at, duration = 4.5) {
    this.emitters.push({ type: 'anar', at: at.clone(), start: this.time, end: this.time + duration, acc: 0 });
    this.onSound?.('hiss', { duration, pan: this._pan(at) });
  }

  chakri(at, duration = 4) {
    this.emitters.push({ type: 'chakri', at: at.clone(), start: this.time, end: this.time + duration, acc: 0, angle: 0 });
    this.onSound?.('hiss', { duration, pan: this._pan(at) });
  }

  /** Sparkler at a world position; call every frame while drawing. */
  sparkle(p, dt) {
    const rate = 260 * this.scaleN;
    const n = Math.min(40, Math.max(1, Math.round(rate * dt)));
    const d = this._v;
    for (let i = 0; i < n; i++) {
      sphereDir(d).multiplyScalar(range(1.4, 4));
      this._spawn(p.x, p.y, p.z, d.x, d.y, d.z, [2.4, 1.9, 1.3], this.time, range(0.2, 0.45), 0.05, 4, 2, 0.25);
    }
    this._spawn(p.x, p.y, p.z, 0, 0, 0, [1.8, 1.0, 0.35], this.time, 1.6, 0.075, 0, 0, 0);
    this._addFlash(COLORS.gold, p, 0.004);
  }

  finale() {
    const types = ['peony', 'willow', 'chrysanthemum', 'ring', 'lotus', 'palm', 'crossette', 'peony', 'willow', 'lotus', 'chrysanthemum', 'peony', 'palm', 'ring', 'willow', 'lotus'];
    const t0 = this.time;
    types.forEach((type, i) => {
      this.events.push({
        at: t0 + i * 0.42,
        fn: () => this.launch(type, new THREE.Vector3(range(-14, 14), range(20, 30), range(-42, -32))),
      });
    });
    for (let i = 0; i < 4; i++) {
      this.events.push({ at: t0 + i * 1.6, fn: () => this.fountain(new THREE.Vector3(i % 2 ? 6 : -6, 0, -10 - i), 4) });
    }
    this.launchTimes.length = 0;
  }

  get busy() { return this.events.length > 0 || this.emitters.length > 0; }

  update(dt, t, camera) {
    this.time = t;
    this.camera = camera;
    this.uniforms.uTime.value = t;
    const pxH = this.engine.height * this.engine.pixelRatio;
    this.uniforms.uScale.value = pxH / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // scheduled events
    if (this.events.length) {
      const due = this.events.filter((e) => e.at <= t);
      this.events = this.events.filter((e) => e.at > t);
      for (const e of due) e.fn();
    }

    // rocket glitter tails
    const tmp = this._v;
    this.rockets = this.rockets.filter((r) => t - r.start < r.T);
    for (const r of this.rockets) {
      this._flight(tmp, r.o, r.v, 0, 1, t - r.start);
      for (let k = 0; k < 2; k++) {
        this._spawn(tmp.x, tmp.y, tmp.z, range(-0.6, 0.6), range(-1.2, 0), range(-0.6, 0.6), [2.0, 1.2, 0.5], t, range(0.3, 0.6), 0.06, 2, 2, 0.4);
      }
    }

    // ground emitters
    this.emitters = this.emitters.filter((e) => t < e.end);
    for (const e of this.emitters) {
      const rate = (e.type === 'anar' ? 280 : 220) * this.scaleN;
      e.acc += rate * dt;
      const n = Math.min(60, Math.floor(e.acc));
      e.acc -= n;
      const life = (t - e.start) / (e.end - e.start);
      const fade = Math.min(1, (1 - life) * 4);
      if (e.type === 'anar') {
        for (let i = 0; i < n; i++) {
          const s = range(0, 1);
          this._spawn(e.at.x, 0.3, e.at.z, range(-1.3, 1.3), (7 + s * 4) * (0.6 + 0.4 * fade), range(-1.3, 1.3), s > 0.7 ? [1.7, 1.5, 1.2] : [1.6, 1.0, 0.35], t, range(1.0, 1.6), 0.16, 0.7, 2, 1);
        }
        this._addFlash(COLORS.gold, new THREE.Vector3(e.at.x, 2, e.at.z), 0.012 * fade);
      } else {
        e.angle += dt * 20;
        for (let i = 0; i < n; i++) {
          const a = e.angle + (i / Math.max(1, n)) * dt * 20;
          const col = i % 2 ? [2.4, 1.6, 0.6] : [0.8, 2.4, 1.0];
          this._spawn(e.at.x + Math.cos(a) * 0.25, 0.12, e.at.z + Math.sin(a) * 0.25, -Math.sin(a) * 5, range(0.3, 1.5), Math.cos(a) * 5, col, t, range(0.35, 0.6), 0.11, 2.2, 0, 0.6);
        }
        this._addFlash(COLORS.green, new THREE.Vector3(e.at.x, 0.5, e.at.z), 0.01 * fade);
      }
    }

    this._flush();

    // light from the sky: decays quickly
    const decay = Math.exp(-dt * 3.2);
    this.flashEnergy.multiplyScalar(decay);
    this.flash.copy(this.flashEnergy);
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.reflection?.material.dispose();
  }
}
