// "Lamp lights": a cheap many-light system. Clusters of diyas are summarised
// as virtual point lights (diffuse only, no shadows) and injected into the
// standard three.js materials, so stone and marble pick up warm pools of
// light from hundreds of lamps for the cost of a short loop.
import * as THREE from '../lib/three.js';
import { litAt } from './lampField.js';

export class LampLights {
  constructor(groupU, slots) {
    this.groupU = groupU;
    this.slots = Math.max(1, slots) + 1; // last slot is dynamic (fireworks)
    this.defs = [];
    this.active = [];
    const n = this.slots;
    this.uniforms = {
      uLampPos: { value: Array.from({ length: n }, () => new THREE.Vector3(0, -999, 0)) },
      uLampCol: { value: Array.from({ length: n }, () => new THREE.Vector3()) },
      uLampRad: { value: new Array(n).fill(1) },
    };
    this.dynamic = { pos: new THREE.Vector3(0, 30, -30), color: new THREE.Color(), intensity: 0, radius: 80 };
    this._c = new THREE.Color();
  }

  /**
   * priority 1 = most important. `only`: 'full' (medium/high), 'low' (a
   * broad stand-in used on the low tier) or 'all'.
   */
  add({ pos, color = 0xff8a3d, intensity = 1, radius = 10, group = 0, key = 0, priority = 2, only = 'full' }) {
    this.defs.push({ pos: new THREE.Vector3(...pos), color: new THREE.Color(color), intensity, radius, group, key, priority, only, seed: Math.random() * 10 });
  }

  finalize(tierName) {
    const max = this.slots - 1;
    const want = tierName === 'low' ? ['all', 'low'] : ['all', 'full'];
    let list = this.defs.filter((d) => want.includes(d.only));
    list = list.sort((a, b) => a.priority - b.priority).slice(0, max);
    this.active = list;
  }

  update(t) {
    const P = this.uniforms.uLampPos.value;
    const C = this.uniforms.uLampCol.value;
    const R = this.uniforms.uLampRad.value;
    for (let i = 0; i < this.slots - 1; i++) {
      const d = this.active[i];
      if (!d) { C[i].set(0, 0, 0); continue; }
      const lit = litAt(this.groupU, d.group, d.key);
      // many flames average out: walls get only a slow, gentle breathing
      const fl = 0.98 + 0.015 * Math.sin(t * 2.3 + d.seed) + 0.008 * Math.sin(t * 3.7 + d.seed * 2);
      const k = d.intensity * lit * fl;
      P[i].copy(d.pos);
      C[i].set(d.color.r * k, d.color.g * k, d.color.b * k);
      R[i] = d.radius;
    }
    const j = this.slots - 1;
    const dy = this.dynamic;
    P[j].copy(dy.pos);
    C[j].set(dy.color.r * dy.intensity, dy.color.g * dy.intensity, dy.color.b * dy.intensity);
    R[j] = dy.radius;
  }

  /** Inject the lamp loop into a MeshStandard/MeshLambert material. */
  patch(material) {
    const n = this.slots;
    const u = this.uniforms;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prev?.call(material, shader, renderer);
      shader.uniforms.uLampPos = u.uLampPos;
      shader.uniforms.uLampCol = u.uLampCol;
      shader.uniforms.uLampRad = u.uLampRad;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLampWorld;')
        .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vLampWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vLampWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        #define LAMP_COUNT ${n}
        varying vec3 vLampWorld;
        uniform vec3 uLampPos[LAMP_COUNT];
        uniform vec3 uLampCol[LAMP_COUNT];
        uniform float uLampRad[LAMP_COUNT];`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 lampSum = vec3(0.0);
          vec3 wN = inverseTransformDirection(normal, viewMatrix);
          for (int i = 0; i < LAMP_COUNT; i++) {
            vec3 lv = uLampPos[i] - vLampWorld;
            float d2 = dot(lv, lv);
            float d = sqrt(d2);
            float win = clamp(1.0 - pow(d / uLampRad[i], 4.0), 0.0, 1.0);
            float att = win * win / (d2 * 0.08 + 1.0);
            float ndl = clamp(dot(wN, lv / max(d, 1e-4)) * 0.7 + 0.3, 0.0, 1.0);
            lampSum += uLampCol[i] * att * ndl;
          }
          reflectedLight.directDiffuse += lampSum * diffuseColor.rgb;
        }`);
    };
    material.customProgramCacheKey = () => `lamps${n}`;
    return material;
  }
}
