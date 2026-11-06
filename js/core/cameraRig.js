// Cinematic camera: shots are { pos, target, fov, fit?, focus?, aperture? }.
// Moves follow a lifted Bézier arc (a crane move) with eased timing, plus a
// little hand-held drift and pointer parallax. Reduced motion → instant cuts.
import * as THREE from '../lib/three.js';
import { gsap } from '../lib/gsap.js';

const UP = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const DEG = Math.PI / 180;

const vec = (a) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 1.6, 6);
    this.target = new THREE.Vector3(0, 1.4, 0);
    this.fov = 50;
    this.fit = 0;
    this.focus = 6;
    this.aperture = 0.0;
    this.pointer = new THREE.Vector2();
    this.parallax = new THREE.Vector2();
    this.parallaxAmount = 0.12;
    this.drift = 0.025;
    this.shift = new THREE.Vector2();
    this._shiftNow = new THREE.Vector2();
    this.viewport = { w: 1, h: 1 };
    this.reduced = false;
    this._tween = null;
  }

  set(shot) {
    this._tween?.kill();
    this.pos.copy(vec(shot.pos));
    this.target.copy(vec(shot.target));
    this.fov = shot.fov ?? this.fov;
    this.fit = shot.fit ?? 0;
    this.focus = shot.focus ?? this.pos.distanceTo(this.target);
    this.aperture = shot.aperture ?? this.aperture;
  }

  /** Set the camera state directly every frame (used by the scroll director). */
  setDirect({ pos, target, fov, fit = 0, focus, aperture = 0 }) {
    if (this._tween) { this._tween.kill(); this._tween = null; }
    this.pos.copy(pos);
    this.target.copy(target);
    this.fov = fov;
    this.fit = fit;
    this.focus = focus ?? this.pos.distanceTo(this.target);
    this.aperture = aperture;
  }

  goTo(shot, { duration = 2.6, ease = 'power2.inOut', arc = 0.16 } = {}) {
    if (this.reduced || duration <= 0) {
      this.set(shot);
      return Promise.resolve();
    }
    this._tween?.kill();
    const p0 = this.pos.clone();
    const p1 = vec(shot.pos);
    const t0 = this.target.clone();
    const t1 = vec(shot.target);
    const c = p0.clone().lerp(p1, 0.5);
    c.y += p0.distanceTo(p1) * arc;
    const f0 = this.fov;
    const f1 = shot.fov ?? f0;
    const fit0 = this.fit;
    const fit1 = shot.fit ?? 0;
    const fo0 = this.focus;
    const fo1 = shot.focus ?? p1.distanceTo(t1);
    const a0 = this.aperture;
    const a1 = shot.aperture ?? a0;
    const s = { u: 0 };
    return new Promise((resolve) => {
      this._tween = gsap.to(s, {
        u: 1,
        duration,
        ease,
        onUpdate: () => {
          const u = s.u;
          const iu = 1 - u;
          this.pos.set(
            iu * iu * p0.x + 2 * iu * u * c.x + u * u * p1.x,
            iu * iu * p0.y + 2 * iu * u * c.y + u * u * p1.y,
            iu * iu * p0.z + 2 * iu * u * c.z + u * u * p1.z,
          );
          this.target.lerpVectors(t0, t1, u);
          this.fov = f0 + (f1 - f0) * u;
          this.fit = fit0 + (fit1 - fit0) * u;
          this.focus = fo0 + (fo1 - fo0) * u;
          this.aperture = a0 + (a1 - a0) * u;
        },
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  }

  setPointer(nx, ny) {
    this.pointer.set(nx, ny);
  }

  /** Fraction of the viewport to slide the picture (x right, y up). */
  setShift(x, y) {
    this.shift.set(x, y);
  }

  resize(w, h) {
    this.viewport.w = w;
    this.viewport.h = h;
  }

  update(dt, t) {
    const cam = this.camera;
    const k = 1 - Math.exp(-dt * 2.2);
    if (this.reduced) this.parallax.set(0, 0);
    else this.parallax.lerp(this.pointer, k);
    this._shiftNow.lerp(this.shift, this.reduced ? 1 : 1 - Math.exp(-dt * 3));

    _f.subVectors(this.target, this.pos);
    const dist = Math.max(0.01, _f.length());
    _f.divideScalar(dist);
    _r.crossVectors(_f, UP);
    if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0);
    _r.normalize();
    _u.crossVectors(_r, _f).normalize();

    const amt = this.parallaxAmount * Math.min(1, dist / 5);
    const drift = this.reduced ? 0 : this.drift * Math.min(1, dist / 3);
    const dx = this.parallax.x * amt + Math.sin(t * 0.13) * drift;
    const dy = this.parallax.y * amt * 0.6 + Math.sin(t * 0.17 + 1.3) * drift * 0.6;
    cam.position.copy(this.pos).addScaledVector(_r, dx).addScaledVector(_u, dy);
    cam.lookAt(this.target);

    // Keep the composition on portrait screens by widening the vertical FOV.
    const aspect = this.viewport.w / this.viewport.h;
    let fov = this.fov;
    if (this.fit > 0) {
      const need = (2 * Math.atan(this.fit / 2 / dist / aspect)) / DEG;
      fov = Math.max(fov, Math.min(need, 82));
    } else if (aspect < 1.25) {
      const hDesigned = 2 * Math.atan(Math.tan((fov * DEG) / 2) * 1.6);
      const need = (2 * Math.atan((Math.tan(hDesigned / 2) * 0.66) / aspect)) / DEG;
      fov = Math.max(fov, Math.min(need, 76));
    }
    let dirty = false;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; dirty = true; }

    const sx = this._shiftNow.x;
    const sy = this._shiftNow.y;
    const { w, h } = this.viewport;
    if (Math.abs(sx) > 0.001 || Math.abs(sy) > 0.001) {
      cam.setViewOffset(w, h, -sx * w, sy * h, w, h);
    } else if (cam.view && cam.view.enabled) {
      cam.clearViewOffset();
    } else if (dirty) {
      cam.updateProjectionMatrix();
    }
  }
}
