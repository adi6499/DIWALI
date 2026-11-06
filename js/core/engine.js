// Rendering engine: one WebGL renderer shared by every scene, a render loop
// that pauses when the page is hidden, dynamic resolution, and (on medium and
// high tiers) a post-processing chain:
//
//   ScenePass (scene → HDR target, depth-of-field, golden dissolve between
//   scenes) → UnrealBloom → Grade (vignette + film grain) → Output (ACES + sRGB)
//
// Scenes register as "handles": { name, scene, camera, update(dt, t), bloom?,
// exposure?, dof?: () => ({ focus, aperture }) }.

import * as THREE from '../lib/three.js';
import { gsap } from '../lib/gsap.js';
import { AdaptiveMonitor } from './quality.js';
import { NOISE } from '../gfx/chunks.js';

const FSQ_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform sampler2D tDepth;
uniform float uMix;
uniform float uBlending;
uniform float uFocus;
uniform float uAperture;
uniform float uMaxBlur;
uniform float uNear;
uniform float uFar;
uniform vec2 uRes;
varying vec2 vUv;
${NOISE}

float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float cocAt(vec2 uv) {
  float z = viewZ(texture2D(tDepth, uv).x);
  return clamp(abs(z - uFocus) / max(z, 1e-3) * uAperture, 0.0, 1.0) * uMaxBlur;
}
vec3 sceneA(vec2 uv) {
  vec3 base = texture2D(tA, uv).rgb;
#if USE_DOF == 1
  float c = cocAt(uv);
  if (c < 0.75) return base;
  vec3 acc = base;
  float wsum = 1.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 16.0) * c;
    float a = fi * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * r / uRes;
    float sc = cocAt(uv + o);
    float w = clamp(sc - r + 1.0, 0.0, 1.0);
    acc += texture2D(tA, uv + o).rgb * w;
    wsum += w;
  }
  return acc / wsum;
#else
  return base;
#endif
}
// A single NaN/negative pixel would be smeared across the frame by bloom.
vec3 safe(vec3 c) {
  return vec3(c.r >= 0.0 ? min(c.r, 64.0) : 0.0, c.g >= 0.0 ? min(c.g, 64.0) : 0.0, c.b >= 0.0 ? min(c.b, 64.0) : 0.0);
}
void main() {
  vec3 a = safe(sceneA(vUv));
  if (uBlending < 0.5) { gl_FragColor = vec4(a, 1.0); return; }
  vec3 b = safe(texture2D(tB, vUv).rgb);
  // Noise dissolve with a thin seam of warm light along the edge. It must
  // look good held at any point, since the scroll can stop mid-way.
  float n = fbm3(vUv * vec2(uRes.x / uRes.y, 1.0) * 4.0 + 4.0) * 1.1;
  float t = uMix * 1.2 - 0.1;
  float k = smoothstep(n - 0.035, n + 0.035, t);
  vec3 c = mix(a, b, k);
  float edge = 1.0 - abs(k * 2.0 - 1.0);
  c += vec3(1.0, 0.6, 0.25) * edge * edge * edge * 0.8;
  gl_FragColor = vec4(c, 1.0);
}
`;

const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform vec2 uRes;
varying vec2 vUv;
${NOISE}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = smoothstep(1.1, 0.25, length(q));
  c *= mix(1.0, v, uVignette);
  float g = hash12(vUv * uRes + fract(uTime) * 91.7) - 0.5;
  c += g * uGrain * (0.2 + min(c, vec3(1.0)));
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}
`;

export class Engine {
  constructor(canvas, tier, { onContextLost, onContextRestored, onDegrade } = {}) {
    this.canvas = canvas;
    this.tier = tier;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !tier.post,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true,
    });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = !!tier.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x05071a, 1);

    this.basePR = Math.min(window.devicePixelRatio || 1, tier.pixelRatio);
    this.scale = 1;
    this.width = 1;
    this.height = 1;
    this.active = null;
    this.incoming = null;
    this.blend = 0;
    this.time = 0;
    this.frame = 0;
    this.maxFps = 0;
    this.running = false;
    this._last = 0;
    this._lastRender = 0;
    this.listeners = new Set();
    this.handles = new Set();
    this.composer = null;
    this.reduced = false;

    this.monitor = new AdaptiveMonitor({
      onScale: (s) => { this.scale = s; this.resize(); },
      onDegrade: () => onDegrade?.(),
    });

    this._tick = this._tick.bind(this);
    this._onResize = () => { cancelAnimationFrame(this._resizeRaf); this._resizeRaf = requestAnimationFrame(() => this.resize()); };
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
      onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.resize();
      this.start();
      onContextRestored?.();
    });

    this.resize();
  }

  /** Loads post-processing modules for medium/high tiers. Safe to skip. */
  async initPost() {
    if (!this.tier.post) return;
    try {
      const [{ EffectComposer }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }, { Pass, FullScreenQuad }, { SMAAPass }] = await Promise.all([
        import('../../vendor/three/addons/postprocessing/EffectComposer.js'),
        import('../../vendor/three/addons/postprocessing/UnrealBloomPass.js'),
        import('../../vendor/three/addons/postprocessing/OutputPass.js'),
        import('../../vendor/three/addons/postprocessing/ShaderPass.js'),
        import('../../vendor/three/addons/postprocessing/Pass.js'),
        import('../../vendor/three/addons/postprocessing/SMAAPass.js'),
      ]);
      const engine = this;
      const tier = this.tier;

      class ScenePass extends Pass {
        constructor() {
          super();
          this.needsSwap = true;
          const opts = { type: THREE.HalfFloatType, samples: tier.msaa || 0 };
          this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
          if (tier.dof) this.rtA.depthTexture = new THREE.DepthTexture(1, 1);
          this.rtB = null;
          this.opts = opts;
          this.material = new THREE.ShaderMaterial({
            uniforms: {
              tA: { value: null }, tB: { value: null }, tDepth: { value: null },
              uMix: { value: 0 }, uBlending: { value: 0 },
              uFocus: { value: 5 }, uAperture: { value: 0 }, uMaxBlur: { value: 9 },
              uNear: { value: 0.05 }, uFar: { value: 1000 }, uRes: { value: new THREE.Vector2(1, 1) },
            },
            defines: { USE_DOF: tier.dof ? 1 : 0 },
            vertexShader: FSQ_VERT,
            fragmentShader: COMPOSITE_FRAG,
            depthTest: false,
            depthWrite: false,
          });
          this.fsq = new FullScreenQuad(this.material);
        }
        setSize(w, h) {
          this.rtA.setSize(w, h);
          this.rtB?.setSize(w, h);
          this.material.uniforms.uRes.value.set(w, h);
          this.material.uniforms.uMaxBlur.value = Math.max(4, h / 90);
        }
        render(renderer, writeBuffer) {
          const a = engine.active;
          const b = engine.incoming;
          const u = this.material.uniforms;
          renderer.setRenderTarget(this.rtA);
          renderer.clear();
          if (a) engine.renderScene(a.scene, a.camera);
          u.tA.value = this.rtA.texture;
          u.tDepth.value = this.rtA.depthTexture;
          if (a) {
            const d = a.dof ? a.dof() : null;
            u.uFocus.value = d ? d.focus : 10;
            u.uAperture.value = d && !b ? d.aperture : 0;
            u.uNear.value = a.camera.near;
            u.uFar.value = a.camera.far;
          }
          if (b) {
            if (!this.rtB) {
              this.rtB = new THREE.WebGLRenderTarget(this.rtA.width, this.rtA.height, this.opts);
            }
            renderer.setRenderTarget(this.rtB);
            renderer.clear();
            engine.renderScene(b.scene, b.camera);
            u.tB.value = this.rtB.texture;
            u.uBlending.value = 1;
            u.uMix.value = engine.blend;
          } else {
            u.uBlending.value = 0;
          }
          renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
          this.fsq.render(renderer);
        }
      }

      const composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
      composer.setPixelRatio(this.basePR * this.scale);
      composer.setSize(this.width, this.height);
      this.scenePass = new ScenePass();
      composer.addPass(this.scenePass);

      if (tier.bloom) {
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.9);
        composer.addPass(this.bloom);
      }
      this.grade = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null }, uVignette: { value: 0.55 }, uGrain: { value: 0.0 },
          uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: FSQ_VERT.replace('gl_Position = vec4(position.xy, 0.0, 1.0);', 'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);'),
        fragmentShader: GRADE_FRAG,
      });
      composer.addPass(this.grade);
      composer.addPass(new OutputPass());
      // SMAA on the final (display-space) image: clean edges for a fraction of
      // the cost of multisampling an HDR target, which is very slow on
      // integrated GPUs.
      if (tier.smaa) {
        this.smaa = new SMAAPass(1, 1);
        composer.addPass(this.smaa);
      }
      this.composer = composer;
      this.resize();
    } catch (err) {
      console.warn('[engine] post-processing unavailable, rendering directly', err);
      this.composer = null;
    }
  }

  register(handle) {
    this.handles.add(handle);
    handle.camera.aspect = this.width / this.height;
    handle.camera.updateProjectionMatrix();
    handle.resize?.(this.width, this.height);
  }

  /** Show a scene immediately. */
  use(handle) {
    if (!handle) return;
    if (!this.handles.has(handle)) this.register(handle);
    this.active = handle;
    this.incoming = null;
    this._applyLook(handle);
    this.monitor.reset();
  }

  /**
   * Cross-fade to another scene: golden dissolve when post-processing is on,
   * otherwise a quick fade through indigo.
   */
  transitionTo(handle, { duration = 1.6 } = {}) {
    if (!handle || handle === this.active) return Promise.resolve();
    if (!this.handles.has(handle)) this.register(handle);
    if (!this.active || this.reduced) {
      return this._curtainSwap(handle, this.reduced ? 0.25 : 0.45);
    }
    if (!this.composer) return this._curtainSwap(handle, 0.45);
    this.incoming = handle;
    this.blend = 0;
    return new Promise((resolve) => {
      gsap.to(this, {
        blend: 1,
        duration,
        ease: 'power1.inOut',
        onUpdate: () => this._applyLook(this.blend > 0.5 ? handle : this.active),
        onComplete: () => {
          this.active = handle;
          this.incoming = null;
          this.blend = 0;
          this._applyLook(handle);
          this.monitor.reset();
          resolve();
        },
      });
    });
  }

  /**
   * Scroll-scrubbed blend: show scene `a`, dissolving into `b` by t (0..1).
   * Without post-processing it cuts at the midpoint (the caller fades the
   * curtain over the cut).
   */
  setBlend(a, b, t) {
    if (a && !this.handles.has(a)) this.register(a);
    if (b && !this.handles.has(b)) this.register(b);
    const show = (h) => {
      if (this.active !== h) { this.active = h; this._applyLook(h); this.monitor.reset(0.5); }
      this.incoming = null;
      this.blend = 0;
    };
    if (!b || t <= 0.002) return show(a);
    if (t >= 0.998) return show(b);
    if (!this.composer) return show(t < 0.5 ? a : b);
    if (this.active !== a) { this.active = a; this.monitor.reset(0.5); }
    this.incoming = b;
    this.blend = t;
    this._applyLook(t > 0.5 ? b : a);
  }

  /** Opacity of the indigo curtain (0..1), driven directly by the scroll. */
  setCurtain(v) {
    const c = this._curtainEl || (this._curtainEl = document.getElementById('curtain'));
    if (!c) return;
    const o = Math.max(0, Math.min(1, v));
    if (o === this._curtainV) return;
    this._curtainV = o;
    c.style.transition = 'none';
    c.style.opacity = o.toFixed(3);
  }

  /**
   * Draw a scene with a depth-only pre-pass for the big opaque meshes (objects
   * on layer 1). Hidden walls are then rejected by the depth test before they
   * are shaded, so each pixel of stone is lit once instead of several times.
   */
  renderScene(scene, camera) {
    const r = this.renderer;
    if (!scene.userData.prepass) { r.render(scene, camera); return; }
    if (!this._depthMat) {
      this._depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    }
    const autoClear = r.autoClear;
    const autoShadow = r.shadowMap.autoUpdate;
    r.clear();
    r.autoClear = false;
    r.shadowMap.autoUpdate = false;
    const mask = camera.layers.mask;
    camera.layers.set(1);
    scene.overrideMaterial = this._depthMat;
    r.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.mask = mask;
    r.shadowMap.autoUpdate = autoShadow;
    r.render(scene, camera);
    r.autoClear = autoClear;
  }

  _curtainSwap(handle, seconds) {
    const curtain = document.getElementById('curtain');
    return new Promise((resolve) => {
      if (!curtain || !this.active) { this.use(handle); resolve(); return; }
      curtain.style.transitionDuration = `${seconds}s`;
      curtain.classList.add('is-on');
      setTimeout(() => {
        this.use(handle);
        requestAnimationFrame(() => {
          curtain.classList.remove('is-on');
          setTimeout(resolve, seconds * 1000);
        });
      }, seconds * 1000);
    });
  }

  _applyLook(h) {
    this.renderer.toneMappingExposure = h.exposure ?? 1.0;
    if (this.bloom && h.bloom) {
      this.bloom.strength = h.bloom.strength;
      this.bloom.radius = h.bloom.radius;
      this.bloom.threshold = h.bloom.threshold;
    }
    if (this.grade) this.grade.uniforms.uVignette.value = h.vignette ?? 0.55;
  }

  onFrame(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this._last = performance.now();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  _tick(now) {
    now = now || performance.now();
    if (this.maxFps && now - this._lastRender < 1000 / this.maxFps - 2) return;
    const dt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this._lastRender = now;
    this.time += dt;
    this.frame++;
    try {
      this.active?.update(dt, this.time);
      if (this.incoming) this.incoming.update(dt, this.time);
      for (const fn of this.listeners) fn(dt, this.time);
      this.renderFrame(dt);
    } catch (err) {
      console.error('[engine] frame failed', err);
    }
    if (!this.maxFps) this.monitor.sample(dt);
  }

  renderFrame(dt = 0.016) {
    if (!this.active) return;
    if (this.composer) {
      if (this.grade) this.grade.uniforms.uTime.value = this.time;
      this.composer.render(dt);
    } else {
      this.renderScene(this.active.scene, this.active.camera);
    }
  }

  resize() {
    const w = Math.max(1, Math.round(window.visualViewport?.width || window.innerWidth));
    const h = Math.max(1, Math.round(window.visualViewport?.height || window.innerHeight));
    this.width = w;
    this.height = h;
    const pr = this.basePR * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.grade?.uniforms.uRes.value.set(w * pr, h * pr);
    }
    for (const hd of this.handles) {
      hd.camera.aspect = w / h;
      hd.camera.updateProjectionMatrix();
      hd.resize?.(w, h);
    }
  }

  get pixelRatio() { return this.basePR * this.scale; }

  /** Change post effects at runtime (used when the GPU struggles). */
  async degrade() {
    this.tier = { ...this.tier, dof: false, msaa: 0 };
    if (this.scenePass) {
      this.scenePass.material.defines.USE_DOF = 0;
      this.scenePass.material.needsUpdate = true;
      this.scenePass.material.uniforms.uAperture.value = 0;
    }
    // stay crisp: never fall below 1.25× on high-density screens
    this.basePR = Math.min(this.basePR, Math.max(1, Math.min(1.25, window.devicePixelRatio || 1)));
    this.resize();
  }

  /**
   * Render the current frame and copy it into a new 2D canvas (cover-cropped
   * to w×h). Used for greeting cards.
   */
  capture(w, h) {
    this.renderFrame(0);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    const sa = src.width / src.height;
    const da = w / h;
    let sw = src.width;
    let sh = src.height;
    if (sa > da) sw = sh * da; else sh = sw / da;
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
    return out;
  }

  /** Project a world position to CSS pixels. Returns null if behind camera. */
  project(v, camera = this.active?.camera) {
    if (!camera) return null;
    const p = v.clone().project(camera);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height };
  }
}
