// The palace courtyard scene: assembles the architecture, lamps, hero diya,
// water, sky and lighting, and exposes the choreography the worlds use
// (camera shots, ignition, story chapters, moods, fireworks, rangoli floor).

import * as THREE from '../lib/three.js';
import { gsap } from '../lib/gsap.js';
import { G } from '../config.js';
import { createGroupUniforms, LampField, DecalField, tweenWave, tweenGain, litAt, MAX_GROUPS } from '../gfx/lampField.js';
import { LampLights } from '../gfx/lighting.js';
import { buildPalace, LAYOUT } from '../gfx/palace.js';
import { createHeroDiya } from '../gfx/heroDiya.js';
import { createSky } from '../gfx/sky.js';
import { createWater } from '../gfx/water.js';
import { ConeField, createDust, makeGlowMaterial } from '../gfx/volumetrics.js';
import * as TX from '../gfx/textures.js';
import { CameraRig } from '../core/cameraRig.js';
import { generateRangoli } from '../rangoli/generator.js';

export const SHOTS = {
  heroClose: { pos: [0.12, 1.305, 2.66], target: [0.018, 1.2, 2.35], fov: 30, fit: 0.26, aperture: 0.9, focus: 0.34 },
  heroMid: { pos: [0.55, 1.5, 4.0], target: [0, 0.9, 1.0], fov: 40, aperture: 0.45 },
  reveal: { pos: [0, 2.3, 13.4], target: [0, 2.8, -12], fov: 50, aperture: 0.04 },
  about: { pos: [-1.2, 5.2, 15.8], target: [0, 2.6, -10], fov: 52, aperture: 0.02 },
  aerial: { pos: [10, 48, 36], target: [0, 3, -5], fov: 56, aperture: 0 },
  story0: { pos: [-3.7, 1.55, 4.8], target: [0.6, 1.0, -4], fov: 48, aperture: 0.04 },
  story1: { pos: [-3.9, 1.85, -0.4], target: [1.0, 1.6, -9.5], fov: 48, aperture: 0.04 },
  story2: { pos: [-3.3, 2.4, -6.3], target: [0.4, 3.6, -18], fov: 50, aperture: 0.04 },
  story3: { pos: [0, 2.6, 10.2], target: [0, 6.8, -21], fov: 52, aperture: 0.04 },
  lakshmi: { pos: [2.7, 2.3, 12.4], target: [0, 0.2, 6.2], fov: 46, aperture: 0.04 },
  dhanteras: { pos: [0.35, 0.95, 12.6], target: [0, 0.22, 15.0], fov: 40, aperture: 0.45 },
  jain: { pos: [0.5, -0.06, 0.62], target: [0, -0.26, -3], fov: 44, aperture: 0.7, focus: 1.15 },
  sikh: { pos: [0, 0.36, 0.78], target: [0, 5.6, -21], fov: 50, aperture: 0.05 },
  days: { pos: [-7.0, 3.2, 6.5], target: [-4.3, 2.7, 2.3], fov: 46, aperture: 0.04 },
  regions: { pos: [15.5, 15, 23], target: [0, 1, -5], fov: 50, aperture: 0 },
  rangoliTop: { pos: [0, 7.4, 6.46], target: [0, 0, 6.4], fov: 44, fit: 5.4, aperture: 0 },
  rangoliView: { pos: [3.8, 3.3, 11.6], target: [0, 0.1, 6.4], fov: 46, aperture: 0.04 },
  fireworks: { pos: [0, 1.25, 11], target: [0, 13, -24], fov: 60, aperture: 0 },
  greeting: { pos: [0.42, -0.12, 0.42], target: [0, 1.4, -14], fov: 40, aperture: 0.75, focus: 0.9 },
};

/** JS twin of the GLSL swell, so the hero diya rides the same waves. */
const waveH = (x, z, t) => 0.045 * Math.sin(x * 0.35 + t * 0.9) + 0.035 * Math.sin(z * 0.52 - t * 1.1 + x * 0.21) + 0.018 * Math.sin((x + z) * 0.95 + t * 1.7);

export async function createPalaceScene({ engine, tier, progress = () => {} }) {
  const low = tier.name === 'low';
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070a1e, 0.017);
  scene.userData.prepass = true;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.03, 1200);
  const rig = new CameraRig(camera);
  rig.set(SHOTS.heroClose);
  const groupU = createGroupUniforms();
  const lights = new LampLights(groupU, tier.lampLights);

  // --- materials -----------------------------------------------------------
  progress('Grinding the sandstone…', 0.3);
  await tick();
  const aniso = Math.min(8, engine.renderer.capabilities.getMaxAnisotropy());
  const floorTex = TX.stoneFloor(low ? 256 : 512, aniso);
  const wallTex = TX.ashlar(low ? 256 : 512);
  const marbleTex = TX.marble(256);
  const jaaliTex = TX.jaali(256);
  const feetTex = TX.footprints(256);
  await tick();

  const Std = tier.material === 'lambert' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const mat = (o) => {
    if (tier.material === 'lambert') { delete o.roughness; delete o.metalness; delete o.roughnessMap; }
    return lights.patch(new Std(o));
  };

  const rangoliCanvas = document.createElement('canvas');
  rangoliCanvas.width = rangoliCanvas.height = low ? 512 : 1024;
  generateRangoli(rangoliCanvas.getContext('2d'), rangoliCanvas.width, { seed: 8, transparent: true });
  const rangoliTex = new THREE.CanvasTexture(rangoliCanvas);
  rangoliTex.colorSpace = THREE.SRGBColorSpace;
  rangoliTex.anisotropy = aniso;

  const materials = {
    floor: mat({ map: floorTex.map, roughnessMap: floorTex.rough, roughness: 0.92, color: 0xcfbc9e }),
    sandstone: mat({ map: wallTex, roughness: 0.92, color: 0xe6c79c }),
    ivory: mat({ map: marbleTex, roughness: 0.55, color: 0xf3ebdc }),
    granite: mat({ color: 0x5e5248, roughness: 0.7 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x050407 }),
    bronze: mat({ color: 0x6a4a22, roughness: 0.45, metalness: 0.4 }),
    jaali: mat({ map: wallTex, color: 0xdcc096, alphaMap: jaaliTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    glow: makeGlowMaterial(groupU, { intensity: 1.7 }),
    rangoli: mat({ map: rangoliTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    feet: mat({ map: feetTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    marigold: mat({ color: 0xffffff, roughness: 0.75 }),
    clay: mat({ color: 0x9c4a26, roughness: 0.85 }),
    gold: mat({ color: 0xf4c35a, roughness: 0.38, metalness: 0.15, emissive: 0x3a2206 }),
  };

  // Real stone, marble and clay (medium/high). Loaded in the background; the
  // procedural textures above stay until they arrive, so nothing waits.
  async function upgradeMaterials() {
    try {
      const [wall, floor, marble, granite, clay] = await Promise.all([
        TX.loadPBR('wall', { aniso }), TX.loadPBR('floor', { aniso }), TX.loadPBR('marble', { aniso }),
        TX.loadPBR('granite', { aniso }), TX.loadPBR('clay', { aniso, maps: ['normal', 'arm'] }),
      ]);
      const apply = (mat, set, { color, roughness = 1, normal = 1, ao = 0.85 }) => {
        mat.map = set.color;
        mat.normalMap = set.normal;
        mat.normalScale.set(normal, normal);
        mat.roughnessMap = set.arm;
        mat.aoMap = set.arm;
        mat.aoMapIntensity = ao;
        mat.roughness = roughness;
        mat.color.set(color);
        mat.needsUpdate = true;
      };
      apply(materials.sandstone, wall, { color: 0xf4e3cc, normal: 1.1 });
      apply(materials.floor, floor, { color: 0xeadccc, normal: 1.0 });
      apply(materials.ivory, marble, { color: 0xfffaf2, roughness: 0.6, normal: 0.6, ao: 0.6 });
      apply(materials.granite, granite, { color: 0xa79b90, normal: 1.0 });
      materials.jaali.map = wall.color;
      materials.jaali.normalMap = wall.normal;
      materials.jaali.needsUpdate = true;
      const bowl = hero.bowl.material;
      clay.normal.repeat.set(3, 1);
      bowl.normalMap = clay.normal;
      bowl.normalScale.set(0.5, 0.5);
      bowl.needsUpdate = true;
    } catch (err) {
      console.warn('[palace] real textures unavailable, keeping procedural ones', err);
    }
  }

  // --- fields & architecture ------------------------------------------------
  progress('Raising the palace…', 0.45);
  await tick();
  const P = LAYOUT.pool;
  const reflect = { y: P.waterY, bounds: [P.x0, P.x1, P.z0, P.z1] };
  const lamps = new LampField({ groupU, capacity: 4200, reflect, maxCoc: tier.maxCoc, segments: low ? 7 : 10, flameH: 0.044, haloSize: 0.065 });
  // Bloom already makes the glow; halos only add a soft core (stronger without bloom)
  lamps.u.uHaloIntensity.value = tier.bloom ? 0.32 : 0.6;
  const decals = new DecalField({ groupU, capacity: 2400 });
  const cones = new ConeField(groupU);
  const built = buildPalace({ tier, materials, lamps, decals, cones, lights, groupU });
  lamps.build();
  scene.add(built.group, lamps.group, decals.build());
  const coneMesh = cones.build();
  if (coneMesh) scene.add(coneMesh);

  // kandil glows (halo only)
  const kandilHalos = new LampField({ groupU, bodies: false, flames: false, capacity: 64, haloSize: 0.55, maxCoc: 2 });
  for (const k of built.kandils) kandilHalos.add({ pos: [k.pos.x, k.pos.y, k.pos.z], group: G.ARCADE, key: k.key, scale: 1 });
  kandilHalos.build();
  kandilHalos.u.uHaloColor.value.setRGB(1.0, 0.42, 0.3);
  kandilHalos.u.uHaloIntensity.value = 0.55;
  scene.add(kandilHalos.group);

  if (tier.dust) {
    scene.add(createDust({ groupU, count: tier.dust, beam: { apex: [0, 5.4, -21.6], dir: [0, -0.5, 1], angle: 0.42 }, group: G.ARCADE, key: 23 }));
  }

  // --- water ---------------------------------------------------------------
  progress('Filling the pool…', 0.6);
  await tick();
  let Reflector = null;
  if (tier.reflections) {
    try { ({ Reflector } = await import('../../vendor/three/addons/objects/Reflector.js')); } catch { Reflector = null; }
  }
  const water = createWater({ width: P.x1 - P.x0, depth: P.z1 - P.z0, reflect: !!Reflector, Reflector, resolution: 512 });
  water.mesh.position.set((P.x0 + P.x1) / 2, P.waterY, (P.z0 + P.z1) / 2);
  water.uniforms.uChop.value = 0.06;
  water.uniforms.uCityGlow.value = 0.25;
  scene.add(water.mesh);
  if (tier.reflections) lamps.u.uStreakIntensity.value = 0.45;

  // --- hero diya -------------------------------------------------------------
  progress('Twisting the wick…', 0.72);
  await tick();
  const hero = createHeroDiya({ groupU, tier, reflect });
  const heroBase = LAYOUT.heroStart.clone();
  hero.group.position.copy(heroBase);
  hero.group.rotation.y = 0.2;
  scene.add(hero.group, hero.flame.group, hero.embers);

  // --- sky & real lights ---------------------------------------------------------
  const sky = createSky({ cityGlow: 0.55 });
  scene.add(sky.mesh);
  const hemi = new THREE.HemisphereLight(0x3a4a9a, 0x120d0a, 2.2);
  scene.add(hemi);
  const gateSpot = new THREE.SpotLight(0xffa258, 0, 0, 0.78, 0.75, 2);
  gateSpot.position.set(0, 5.35, -21.6);
  gateSpot.target.position.set(0, 0, -6);
  if (tier.shadows) {
    gateSpot.castShadow = true;
    gateSpot.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
    gateSpot.shadow.bias = -0.0004;
    gateSpot.shadow.normalBias = 0.03;
    gateSpot.shadow.camera.near = 1;
    gateSpot.shadow.camera.far = 45;
  }
  scene.add(gateSpot, gateSpot.target);
  lights.finalize(tier.name);
  if (tier.realTextures && tier.material !== 'lambert') upgradeMaterials();

  // --- state -----------------------------------------------------------------
  const state = {
    ignited: false,
    landed: false,
    bob: 1,
    chapter: -1,
    mood: 'none',
    fireworks: null,
  };
  const flash = new THREE.Color();
  const handle = {
    name: 'palace',
    scene,
    camera,
    exposure: 0.9,
    vignette: 0.5,
    bloom: { strength: 0.62, radius: 0.42, threshold: 0.95 },
    dof: () => ({ focus: rig.focus, aperture: rig.aperture }),
    resize: (w, h) => rig.resize(w, h),
    update,
  };

  function update(dt, t) {
    groupU.uTime.value = t;
    rig.update(dt, t);
    const pxH = engine.height * engine.pixelRatio;
    lamps.updateCamera(camera, pxH);
    lamps.setFocus(rig.focus, rig.aperture);
    hero.flame.updateCamera(camera, pxH);
    // the hero flame is always the subject in focus: a soft glow, never a bokeh disc
    hero.flame.setFocus(rig.focus, 0);
    kandilHalos.updateCamera(camera, pxH);

    // hero floats in the air before ignition, then rides the water
    if (state.landed) {
      hero.group.position.set(heroBase.x, P.waterY + 0.004 + waveH(heroBase.x, heroBase.z, t) * 0.6, heroBase.z);
      hero.group.rotation.z = Math.sin(t * 0.9) * 0.025;
      hero.group.rotation.x = Math.sin(t * 0.7 + 1) * 0.02;
    } else {
      hero.group.position.set(heroBase.x, heroBase.y + Math.sin(t * 0.9) * 0.008 * state.bob, heroBase.z);
      hero.group.rotation.z = Math.sin(t * 0.6) * 0.03 * state.bob;
    }
    const heroLit = litAt(groupU, G.HERO, 0.5);
    hero.update(dt, t, heroLit);
    water.setGlow(0, hero.worldTip.x, P.waterY, hero.worldTip.z, state.landed ? heroLit : 0);

    lights.update(t);
    gateSpot.intensity = 520 * litAt(groupU, G.ARCADE, 23) * (0.95 + 0.05 * Math.sin(t * 5.3));
    let overall = 0;
    for (const g of [G.FLOOR, G.ARCADE, G.FACADE]) overall += litAt(groupU, g, 0) / 3;
    hemi.intensity = (0.75 + overall * 2.0) * (scene.environment ? 0.55 : 1);
    env.tick(dt);

    if (state.fireworks) {
      state.fireworks.update(dt, t, camera);
      flash.copy(state.fireworks.flash);
      lights.dynamic.pos.copy(state.fireworks.flashPos);
      lights.dynamic.color.copy(state.fireworks.flash);
      lights.dynamic.intensity = 0.8;
    } else {
      flash.setRGB(0, 0, 0);
    }
    sky.uniforms.uFlash.value.copy(flash);
    sky.update(t, camera);
    water.update(t, flash);
  }

  // --- choreography ------------------------------------------------------------
  const wave = (g, to, d, ease, delay) => tweenWave(groupU, g, to, d, ease, delay);

  function ignite() {
    if (state.ignited) return Promise.resolve();
    state.ignited = true;
    hero.burst(26);
    const tl = gsap.timeline();
    tl.add(wave(G.HERO, 1.7, 1.1, 'power2.out'), 0);
    tl.to(hero.lightState, { v: 1, duration: 1.3, ease: 'power2.out' }, 0);
    tl.to(state, { bob: 0, duration: 2 }, 1.2);
    tl.add(() => { rig.goTo(SHOTS.heroMid, { duration: 2.4 }); }, 0.9);
    tl.to(heroBase, { x: LAYOUT.heroRest.x, y: P.waterY + 0.02, z: LAYOUT.heroRest.z, duration: 4.0, ease: 'sine.inOut' }, 1.7);
    tl.to(hero.group.rotation, { y: 0.55, duration: 4.0, ease: 'sine.inOut' }, 1.7);
    tl.add(() => { state.landed = true; water.ripple(heroBase.x, heroBase.z, 1.1); }, 5.7);
    tl.add(() => { rig.goTo(SHOTS.reveal, { duration: 6.4, arc: 0.22 }); }, 2.6);
    tl.add(wave(G.FLOOR, 30, 6.6, 'power1.in'), 3.0);
    tl.add(wave(G.TOWER, 18, 6.0, 'sine.inOut'), 3.4);
    tl.add(wave(G.ARCADE, 32, 7.2, 'power1.inOut'), 4.0);
    return new Promise((resolve) => tl.eventCallback('onComplete', resolve));
  }

  /** Jump straight to a lit courtyard (deep links, reduced motion). */
  function igniteQuick(full = false) {
    state.ignited = true;
    state.bob = 0;
    hero.lightState.v = 1;
    groupU.uWaves.value[G.HERO] = 2;
    heroBase.set(LAYOUT.heroRest.x, P.waterY + 0.02, LAYOUT.heroRest.z);
    hero.group.rotation.y = 0.55;
    state.landed = true;
    const d = rig.reduced ? 0.01 : 1.6;
    wave(G.FLOOR, 30, d);
    wave(G.TOWER, 18, d);
    wave(G.ARCADE, 32, d);
    if (full) lightAll(d);
  }

  function lightAll(d = 2.4) {
    if (groupU.uWaves.value[G.POOL] < 5.8) wave(G.POOL, 5.9, d);
    if (groupU.uWaves.value[G.FACADE] < 40) wave(G.FACADE, 42, d * 1.4);
    if (groupU.uWaves.value[G.DOME] < 8) wave(G.DOME, 8, d * 1.4, 'power1.inOut', d * 0.4);
  }

  function storyChapter(c) {
    state.chapter = c;
    const pool = [2.9, 4.0, 5.9, 5.9][c];
    if (groupU.uWaves.value[G.POOL] < pool) wave(G.POOL, pool, rig.reduced ? 0.01 : 2.6);
    if (c === 3) {
      if (groupU.uWaves.value[G.FACADE] < 40) wave(G.FACADE, 42, rig.reduced ? 0.01 : 5.5);
      if (groupU.uWaves.value[G.DOME] < 8) wave(G.DOME, 8, rig.reduced ? 0.01 : 3.5, 'power1.inOut', rig.reduced ? 0 : 2.6);
    }
    return rig.goTo(SHOTS[`story${c}`], { duration: 3.2 });
  }

  const MOODS = {
    none: {},
    lakshmi: { [G.FLOOR]: 1.35 },
    dhanteras: { [G.FLOOR]: 1.3, [G.ARCADE]: 0.55, [G.FACADE]: 0.45, [G.DOME]: 0.45, [G.POOL]: 0.6, [G.TOWER]: 0.7 },
    jain: { [G.FLOOR]: 0.18, [G.ARCADE]: 0.15, [G.TOWER]: 0.15, [G.POOL]: 0.2, [G.FACADE]: 0.12, [G.DOME]: 0.12, [G.HERO]: 1.25 },
    sikh: { [G.FACADE]: 1.4, [G.DOME]: 1.5, [G.POOL]: 1.25 },
    days: { [G.TOWER]: 1.45 },
    regions: {},
  };
  function setMood(name) {
    state.mood = name;
    const m = MOODS[name] || {};
    for (let g = 0; g < MAX_GROUPS; g++) tweenGain(groupU, g, m[g] ?? 1, rig.reduced ? 0.01 : 1.6);
  }

  /** Scroll-driven: blend the light between two moods. */
  function blendMood(a, b, t) {
    const ma = MOODS[a] || {};
    const mb = MOODS[b] || {};
    for (let g = 0; g < MAX_GROUPS; g++) groupU.uGains.value[g] = (ma[g] ?? 1) + ((mb[g] ?? 1) - (ma[g] ?? 1)) * t;
  }

  /** Scroll-driven: how far the story has lit the pool, facade and domes. */
  function setJourneyLight({ pool, facade, dome }) {
    const w = groupU.uWaves.value;
    w[G.POOL] = pool;
    w[G.FACADE] = facade;
    w[G.DOME] = dome;
  }

  async function enableFireworks() {
    if (state.fireworks) return state.fireworks;
    const { Fireworks } = await import('../gfx/fireworks.js');
    state.fireworks = new Fireworks({ tier, engine, waterY: P.waterY, poolBounds: reflect.bounds });
    scene.add(state.fireworks.object);
    return state.fireworks;
  }

  function setRangoli(source) {
    const ctx = rangoliCanvas.getContext('2d');
    ctx.clearRect(0, 0, rangoliCanvas.width, rangoliCanvas.height);
    ctx.drawImage(source, 0, 0, rangoliCanvas.width, rangoliCanvas.height);
    rangoliTex.needsUpdate = true;
  }

  /** Is a screen point (CSS px) on or near the wick? */
  function hitWick(x, y) {
    const p = engine.project(hero.worldTip, camera);
    if (!p) return false;
    return Math.hypot(p.x - x, p.y - (y + 0)) < Math.max(70, Math.min(engine.width, engine.height) * 0.16);
  }

  function wickScreen() {
    const v = hero.worldTip.clone();
    v.y += 0.012;
    return engine.project(v, camera);
  }

  // --- environment light ---------------------------------------------------------
  // A 360° snapshot of the courtyard as it is currently lit, turned into image
  // based lighting. Marble, oil, bronze and gold then reflect the real lamps,
  // and stone picks up warm bounce light. It is refreshed whenever the lamps
  // have changed noticeably, and only while the scroll is still, so it never
  // causes a hitch mid-flight.
  const env = (() => {
    if (tier.material === 'lambert') return { tick() {}, capture() {} };
    const renderer = engine.renderer;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const cubeRT = new THREE.WebGLCubeRenderTarget(tier.name === 'high' ? 256 : 128, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.3, 400, cubeRT);
    cubeCam.position.set(0, 2.4, -1.5);
    scene.add(cubeCam);
    let current = null;
    let lastSum = -1;
    let cool = 2;
    const intensity = { sandstone: 0.45, floor: 0.6, ivory: 0.9, granite: 0.5, bronze: 1.2, gold: 1.4, marigold: 0.35, clay: 0.4, jaali: 0.4, rangoli: 0.3, feet: 0.3 };
    function capture() {
      const camPos = sky.mesh.position.clone();
      sky.mesh.position.copy(cubeCam.position);
      const hidden = [hero.embers, kandilHalos.group];
      hidden.forEach((o) => { o.visible = false; });
      const ac = renderer.autoClear;
      renderer.autoClear = true;
      cubeCam.update(renderer, scene);
      renderer.autoClear = ac;
      hidden.forEach((o) => { o.visible = true; });
      sky.mesh.position.copy(camPos);
      const next = pmrem.fromCubemap(cubeRT.texture);
      const firstTime = !current;
      current?.dispose();
      current = next;
      scene.environment = next.texture;
      if (firstTime) {
        for (const [k, v] of Object.entries(intensity)) if (materials[k]) materials[k].envMapIntensity = v;
        hero.bowl.material.envMapIntensity = 0.5;
      }
    }
    return {
      capture,
      tick(dt) {
        cool -= dt;
        if (cool > 0 || !state.ignited) return;
        const w = groupU.uWaves.value;
        const g = groupU.uGains.value;
        let sum = 0;
        for (let i = 0; i < w.length; i++) sum += Math.min(w[i], 50) * g[i];
        const director = engine._director;
        const moving = director && Math.abs(window.scrollY - director.y) > 2;
        if (Math.abs(sum - lastSum) > 2 && !moving) {
          lastSum = sum;
          cool = 1.2;
          try { capture(); } catch (err) { console.warn('[palace] environment capture failed', err); cool = 30; }
        }
      },
    };
  })();

  progress('Lighting the first lamp…', 0.9);
  await tick();
  return {
    handle,
    rig,
    state,
    hero,
    groupU,
    lamps,
    shots: SHOTS,
    ignite,
    igniteQuick,
    lightAll,
    storyChapter,
    setMood,
    blendMood,
    setJourneyLight,
    enableFireworks,
    setRangoli,
    hitWick,
    wickScreen,
    stats: () => ({ lamps: lamps.count, decals: decals.count, lights: lights.active.length }),
  };
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
