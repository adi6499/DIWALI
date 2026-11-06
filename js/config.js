// App-wide constants. Change these to customise a deployment.

export const APP_VERSION = '1.0.0';

/** Worlds in journey order. `scene` says which 3D scene renders behind it.
 *  (Titles are English; the shown text comes from i18n key world.<id>.) */
export const WORLDS = [
  { id: 'ignite', title: 'The first flame', scene: 'palace' },
  { id: 'story', title: 'The way home', scene: 'palace' },
  { id: 'meaning', title: 'What Diwali means', scene: 'palace' },
  { id: 'rangoli', title: 'Rangoli studio', scene: 'palace' },
  { id: 'fireworks', title: 'Fireworks of light', scene: 'palace' },
  { id: 'wishes', title: 'Ocean of wishes', scene: 'river' },
  { id: 'greetings', title: 'Greetings', scene: 'river' },
];

/**
 * Optional public wish wall. Leave empty to keep every wish on the device.
 * If you set an HTTPS endpoint, the wish form shows an unticked consent box,
 * and only wishes whose author ticks it are POSTed as {text, lang, created}.
 * You must also add the endpoint's origin to connect-src in index.html's CSP.
 */
export const WISH_ENDPOINT = '';

/** Rendering quality presets. "auto" picks one from the device. */
export const TIERS = {
  low: {
    name: 'low', pixelRatio: 1, post: false, bloom: false, dof: false, msaa: 0,
    shadows: false, shadowSize: 0, reflections: false, lampDensity: 0.45, lampLights: 6,
    riverLamps: 450, skylineLamps: 260, fwParticles: 6000, fwTrail: 1, garlands: 0.35,
    material: 'lambert', archDetail: 10, maxCoc: 3, cones: false, dust: 0, realTextures: false,
  },
  medium: {
    name: 'medium', pixelRatio: 1.5, post: true, bloom: true, dof: false, msaa: 0, smaa: true,
    shadows: true, shadowSize: 1024, reflections: false, lampDensity: 0.75, lampLights: 10,
    riverLamps: 1200, skylineLamps: 520, fwParticles: 14000, fwTrail: 3, garlands: 0.7,
    material: 'standard', archDetail: 16, maxCoc: 5, cones: true, dust: 0, realTextures: true,
  },
  high: {
    name: 'high', pixelRatio: 2, post: true, bloom: true, dof: true, msaa: 0, smaa: true,
    shadows: true, shadowSize: 2048, reflections: true, lampDensity: 1, lampLights: 16,
    riverLamps: 2400, skylineLamps: 900, fwParticles: 26000, fwTrail: 5, garlands: 1,
    material: 'standard', archDetail: 24, maxCoc: 7, cones: true, dust: 90, realTextures: true,
  },
};

/** Lamp ignition groups shared by every scene. */
export const G = {
  HERO: 0, FLOOR: 1, ARCADE: 2, TOWER: 3, POOL: 4, FACADE: 5, DOME: 6, MISC: 7,
};

/**
 * Festival days (the visitor's local date) on which the opening screen shows a
 * greeting. Dates follow the panchang and can differ by a day between
 * regions; add future years here once they are confirmed.
 */
export const FESTIVAL_DAYS = [
  { date: '2026-11-06', tab: 'dhanteras', deva: 'शुभ धनतेरस', key: 'festival.dhanteras' },
  { date: '2026-11-07', tab: 'days', deva: 'छोटी दिवाली', key: 'festival.choti' },
  { date: '2026-11-08', tab: 'lakshmi', deva: 'शुभ दीपावली', key: 'festival.diwali' },
];

/** The festival day matching the visitor's local date, if any. */
export function festivalToday(d = new Date()) {
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return FESTIVAL_DAYS.find((f) => f.date === key) || null;
}

export const STORAGE_KEYS = {
  settings: 'deepotsav:settings',
  wishes: 'deepotsav:wishes',
  greeting: 'deepotsav:greeting',
  rangoli: 'rangoli:latest',
  lang: 'deepotsav:lang',
  journal: 'deepotsav:journal',
};
