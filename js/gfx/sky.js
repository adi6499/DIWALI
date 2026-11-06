// Night sky for Amavasya, the new-moon night: no moon, deep indigo, a
// procedural star field with a faint Milky Way, warm haze on the horizon
// from the city's lamps, and colour flashes from fireworks.
import * as THREE from '../lib/three.js';
import { NOISE } from './chunks.js';

export const SKY_GLSL = /* glsl */ `
uniform float uCityGlow;
uniform vec3 uFlash;
vec3 skyGradient(vec3 dir) {
  float h = dir.y;
  vec3 zenith = vec3(0.006, 0.008, 0.03);
  vec3 mid = vec3(0.016, 0.02, 0.07);
  vec3 horizon = vec3(0.07, 0.05, 0.11);
  vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.22, h));
  col = mix(col, zenith, smoothstep(0.22, 0.9, h));
  col += vec3(0.42, 0.18, 0.06) * uCityGlow * exp(-max(h + 0.02, 0.0) * 13.0) * 0.5;
  col += uFlash * (0.25 + 0.75 * smoothstep(-0.1, 0.6, h)) * 0.14;
  return col;
}
`;

export function createSky({ radius = 900, cityGlow = 0.6, stars = 1 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uCityGlow: { value: cityGlow },
    uFlash: { value: new THREE.Color(0, 0, 0) },
    uStars: { value: stars },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStars;
      varying vec3 vDir;
      ${NOISE}
      ${SKY_GLSL}
      float starLayer(vec3 d, float scale, float density, float size) {
        vec3 p = d * scale;
        vec3 cell = floor(p);
        vec3 f = fract(p);
        float h = hash13(cell);
        if (h > density) return 0.0;
        vec3 c = hash33(cell + 7.1) * 0.8 + 0.1;
        float dist = length(f - c);
        float tw = 0.65 + 0.35 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
        return smoothstep(size, 0.0, dist) * tw * (0.4 + 0.6 * hash13(cell + 3.3));
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyGradient(d);
        if (d.y > -0.05) {
          float horizonFade = smoothstep(-0.02, 0.18, d.y);
          float s = starLayer(d, 160.0, 0.06, 0.16) * 1.6 + starLayer(d, 330.0, 0.1, 0.2) * 0.7;
          // Milky Way: a soft band across the sky
          vec3 axis = normalize(vec3(0.35, 0.55, -0.76));
          float da = dot(d, axis);
          float band = exp(-da * da * 22.0);
          if (band > 0.03) {
            float dust = fbm5(vec2(atan(d.z, d.x) * 3.0, d.y * 6.0));
            col += vec3(0.11, 0.1, 0.16) * band * (0.4 + dust * 0.9) * horizonFade * 0.35;
            s += starLayer(d, 520.0, 0.18, 0.22) * band * 1.2;
          }
          col += vec3(0.95, 0.92, 1.0) * s * horizonFade * uStars;
        } else {
          col = mix(col, vec3(0.01, 0.01, 0.02), smoothstep(-0.05, -0.3, d.y));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.name = 'Sky';
  // Drawn after the opaque scene so early depth testing skips hidden sky pixels
  mesh.renderOrder = 100;
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    update(t, camera) {
      uniforms.uTime.value = t;
      mesh.position.copy(camera.position);
    },
  };
}
