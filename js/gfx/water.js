// Water for the palace pool and the river: animated normals from a gentle
// swell plus fine ripples, Fresnel reflection of the night sky, a planar
// mirror of the scene on the high tier (via three's Reflector), warm pools of
// lamplight and an expanding ripple ring when the hero diya touches down.
import * as THREE from '../lib/three.js';
import { NOISE, WAVES } from './chunks.js';
import { SKY_GLSL } from './sky.js';

const MAX_GLOWS = 4;

function waterShader() {
  return {
    name: 'DeepotsavWater',
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      color: { value: new THREE.Color(0xffffff) },
      tDiffuse: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uHasReflect: { value: 0 },
      uReflectStrength: { value: 0.9 },
      uDeep: { value: new THREE.Color(0.006, 0.009, 0.025) },
      uCityGlow: { value: 0.5 },
      uFlash: { value: new THREE.Color(0, 0, 0) },
      uRipple: { value: new THREE.Vector4(0, 0, -100, 0) },
      uGlow: { value: Array.from({ length: MAX_GLOWS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uGlowColor: { value: new THREE.Color(1.0, 0.52, 0.2) },
      uRippleScale: { value: 1 },
      uChop: { value: 0.14 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vReflUv;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vReflUv = textureMatrix * vec4(position, 1.0);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uHasReflect;
      uniform float uReflectStrength;
      uniform vec3 uDeep;
      uniform vec4 uRipple;
      uniform vec4 uGlow[${MAX_GLOWS}];
      uniform vec3 uGlowColor;
      uniform float uRippleScale;
      uniform float uChop;
      varying vec4 vReflUv;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${NOISE}
      ${WAVES}
      ${SKY_GLSL}
      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        float e = 0.06;
        float h0 = waveH(p, t);
        float hx = waveH(p + vec2(e, 0.0), t);
        float hz = waveH(p + vec2(0.0, e), t);
        vec3 n = normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
        vec2 rp = p * 2.4 * uRippleScale;
        n.xz += (vec2(vnoise(rp + vec2(t * 0.5, t * 0.3)), vnoise(rp * 1.3 - vec2(t * 0.4, -t * 0.2) + 7.0)) - 0.5) * uChop;
        // ripple ring from the hero diya
        float rt = t - uRipple.z;
        if (rt > 0.0 && rt < 6.0) {
          float d = length(p - uRipple.xy);
          float ring = sin(d * 26.0 - rt * 9.0) * exp(-abs(d - rt * 0.34) * 6.0) * exp(-rt * 0.55);
          vec2 dir = (p - uRipple.xy) / max(d, 1e-3);
          n.xz += dir * ring * uRipple.w * 0.6;
        }
        n = normalize(n);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.025 + 0.975 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vec3 refl = skyGradient(R);
        if (uHasReflect > 0.5) {
          vec4 uv = vReflUv;
          uv.xy += n.xz * 0.05 * uv.w;
          vec3 mirror = texture2DProj(tDiffuse, uv).rgb;
          refl = mirror * uReflectStrength + refl * 0.25;
        }
        vec3 col = mix(uDeep, refl, fres);
        // warm light pooled on the surface around floating lamps
        for (int i = 0; i < ${MAX_GLOWS}; i++) {
          vec4 g = uGlow[i];
          if (g.w <= 0.0) continue;
          float d = length(p - g.xz);
          float spec = pow(max(dot(reflect(-V, n), normalize(vec3(g.x, g.y + 0.05, g.z) - vWorld)), 0.0), 40.0);
          col += uGlowColor * g.w * (exp(-d * d * 18.0) * 0.12 + spec * 0.6 * exp(-d * 1.2));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  };
}

/**
 * @param {object} o
 * @param {number} o.width
 * @param {number} o.depth
 * @param {boolean} o.reflect  use a planar Reflector (high tier)
 * @param {Function} [o.Reflector] the Reflector class (lazy loaded)
 */
export function createWater({ width, depth, reflect = false, Reflector = null, resolution = 512, segments = 1 }) {
  const shader = waterShader();
  const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
  let mesh;
  if (reflect && Reflector) {
    const pr = Math.min(window.devicePixelRatio || 1, 1.5);
    const aspect = width / depth;
    const w = Math.round(Math.min(1024, resolution * pr * Math.max(1, aspect)));
    const h = Math.round(Math.min(1024, resolution * pr / Math.min(1, aspect)));
    mesh = new Reflector(geo, { shader, textureWidth: w, textureHeight: h, clipBias: 0.003, multisample: 0 });
    mesh.material.fog = true;
    mesh.material.uniforms.uHasReflect.value = 1;
  } else {
    const mat = new THREE.ShaderMaterial({
      uniforms: shader.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      fog: true,
    });
    mesh = new THREE.Mesh(geo, mat);
  }
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'Water';
  const u = mesh.material.uniforms;
  return {
    mesh,
    uniforms: u,
    update(t, flash) {
      u.uTime.value = t;
      if (flash) u.uFlash.value.copy(flash);
    },
    ripple(x, z, amp = 1) {
      u.uRipple.value.set(x, z, u.uTime.value, amp);
    },
    setGlow(i, x, y, z, w) {
      if (i < MAX_GLOWS) u.uGlow.value[i].set(x, y, z, w);
    },
  };
}
