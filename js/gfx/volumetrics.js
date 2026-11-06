// Light that is "in the air": glowing lattice windows and lanterns, beams of
// lantern light (view-dependent additive cones) and dust drifting through
// the beam. All of it is keyed to the same ignition groups as the lamps.
import * as THREE from '../lib/three.js';
import { LIT_GLSL } from './lampField.js';
import { NOISE, FOG_FACTOR } from './chunks.js';

/**
 * Emissive surfaces (jaali glow, niches, lantern glass, kandils). Geometry
 * must carry per-vertex attributes aGroup, aKey, aBright and color.
 */
export function makeGlowMaterial(groupU, { intensity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...groupU, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      attribute float aGroup;
      attribute float aKey;
      attribute float aBright;
      attribute vec3 color;
      ${LIT_GLSL}
      varying float vLit;
      varying vec3 vColor;
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vLit = litFor(aGroup, aKey) * aBright;
        vColor = color;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying float vLit;
      varying vec3 vColor;
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        float f = 0.93 + 0.07 * vnoise(vW.xy * 2.5 + vW.z + uTime * 0.6);
        vec3 c = vColor * (vLit * uIntensity * f + 0.01);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide,
  });
}

/** Tag a geometry with the glow attributes. */
export function glowAttrs(geo, { group, key, bright = 1, color = [1, 0.55, 0.22] }) {
  const n = geo.attributes.position.count;
  const fill = (v) => new THREE.BufferAttribute(new Float32Array(n).fill(v), 1);
  geo.setAttribute('aGroup', fill(group));
  geo.setAttribute('aKey', fill(key));
  geo.setAttribute('aBright', fill(bright));
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(color, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/** Instanced light beams. Each cone's apex is at its origin, pointing down -Y. */
export class ConeField {
  constructor(groupU) {
    this.groupU = groupU;
    this.items = [];
  }

  add({ pos, dir = [0, -1, 0], length = 2, radius = 0.8, group, key, intensity = 0.25 }) {
    this.items.push({ pos, dir, length, radius, group, key, intensity });
  }

  build() {
    const n = this.items.length;
    if (!n) return null;
    const geo = new THREE.CylinderGeometry(0.03, 1, 1, 24, 6, true);
    geo.translate(0, -0.5, 0);
    const iParams = new Float32Array(n * 4);
    const mesh = new THREE.InstancedMesh(geo, null, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const down = new THREE.Vector3(0, -1, 0);
    this.items.forEach((it, i) => {
      q.setFromUnitVectors(down, new THREE.Vector3(...it.dir).normalize());
      m.compose(new THREE.Vector3(...it.pos), q, new THREE.Vector3(it.radius, it.length, it.radius));
      mesh.setMatrixAt(i, m);
      iParams.set([it.group, it.key, it.intensity, Math.random()], i * 4);
    });
    geo.setAttribute('iParams', new THREE.InstancedBufferAttribute(iParams, 4));
    mesh.material = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...this.groupU, uColor: { value: new THREE.Color(1.0, 0.6, 0.3) } },
      vertexShader: /* glsl */ `
        attribute vec4 iParams;
        ${LIT_GLSL}
        varying vec3 vN;
        varying vec3 vW;
        varying float vY;
        varying float vLit;
        varying float vI;
        varying float vSeed;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vY = -position.y;
          vLit = litFor(iParams.x, iParams.y);
          vI = iParams.z;
          vSeed = iParams.w;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec3 vN;
        varying vec3 vW;
        varying float vY;
        varying float vLit;
        varying float vI;
        varying float vSeed;
        #include <fog_pars_fragment>
        ${NOISE}
        ${FOG_FACTOR}
        void main() {
          if (vLit < 0.002) discard;
          vec3 V = normalize(cameraPosition - vW);
          float ndv = abs(dot(normalize(vN), V));
          float a = pow(max(ndv, 0.0), 2.2) * pow(max(1.0 - vY, 0.0), 1.7) * smoothstep(0.0, 0.12, vY);
          a *= 0.75 + 0.25 * vnoise(vec2(vW.x * 1.5 + uTime * 0.15 + vSeed * 9.0, vW.y * 2.0 - uTime * 0.1));
          float fog = 1.0 - fogAmount(length(cameraPosition - vW)) * 0.6;
          gl_FragColor = vec4(uColor * a * vLit * vI * fog, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.mesh = mesh;
    return mesh;
  }
}

/** Dust motes that drift in the air and catch a beam of light. */
export function createDust({ groupU, count = 300, box = [[-12, 0.3, -20], [12, 7, 12]], beam = null, group = 2, key = 20 }) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) pos[i * 3 + a] = box[0][a] + Math.random() * (box[1][a] - box[0][a]);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const b = beam || { apex: [0, 6, -20], dir: [0, -0.45, 1], angle: 0.5 };
  const dir = new THREE.Vector3(...b.dir).normalize();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...groupU,
      uPR: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uBeamA: { value: new THREE.Vector3(...b.apex) },
      uBeamD: { value: dir },
      uBeamCos: { value: Math.cos(b.angle) },
      uGroup: { value: group },
      uKey: { value: key },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      ${LIT_GLSL}
      uniform float uTime;
      uniform float uPR;
      uniform vec3 uBeamA;
      uniform vec3 uBeamD;
      uniform float uBeamCos;
      uniform float uGroup;
      uniform float uKey;
      varying float vA;
      void main() {
        float s = aSeed * 6.283;
        vec3 p = position + vec3(sin(uTime * 0.11 + s) * 0.5, sin(uTime * 0.07 + s * 2.0) * 0.35, cos(uTime * 0.09 + s * 3.0) * 0.5);
        vec3 toP = normalize(p - uBeamA);
        float inBeam = smoothstep(uBeamCos, uBeamCos + 0.08, dot(toP, uBeamD));
        float tw = 0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + s * 5.0);
        vA = (0.05 + inBeam * 0.95) * tw * litFor(uGroup, uKey);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((0.03 + aSeed * 0.03) * uPR * 600.0 / max(-mv.z, 0.1), 0.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0 || vA < 0.003) discard;
        gl_FragColor = vec4(vec3(1.0, 0.75, 0.45) * exp(-r * 3.0) * vA * 0.9, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}
