// Procedural rangoli: concentric rings of lotus petals, dots (pulli) and
// scallops in traditional powder colours. Used for the courtyard floor's
// default design and the studio's "Inspire me" button. Drawing primitives are
// shared with the studio so generated and hand-drawn designs look alike.

export const POWDERS = [
  { id: 'kumkum', name: 'Kumkum red', hex: '#c8102e' },
  { id: 'sindoor', name: 'Sindoor orange', hex: '#e85d04' },
  { id: 'marigold', name: 'Marigold', hex: '#ff9a1f' },
  { id: 'haldi', name: 'Haldi yellow', hex: '#f6c026' },
  { id: 'rose', name: 'Rose pink', hex: '#e0559b' },
  { id: 'peacock', name: 'Peacock blue', hex: '#0a7a8f' },
  { id: 'indigo', name: 'Indigo', hex: '#4a3aa8' },
  { id: 'leaf', name: 'Leaf green', hex: '#2f9a52' },
  { id: 'rice', name: 'Rice white', hex: '#f6efe0' },
  { id: 'gold', name: 'Gold dust', hex: '#d9b25f' },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Powder stamp: a soft core plus grains scattered around it. */
export function powderStamp(ctx, x, y, r, hex, rnd, { grains = 1, gold = false } = {}) {
  const [cr, cg, cb] = hexToRgb(hex);
  ctx.fillStyle = `rgba(${cr},${cg},${cb},0.82)`;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  const n = Math.min(60, Math.ceil(r * 1.4 * grains)) + 4;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * (0.6 + rnd() * 0.5);
    const gr = r * (0.06 + rnd() * 0.12);
    const j = (rnd() - 0.5) * 34;
    ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, cr + j))},${Math.max(0, Math.min(255, cg + j))},${Math.max(0, Math.min(255, cb + j))},${0.55 + rnd() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, gr, 0, Math.PI * 2);
    ctx.fill();
  }
  if (gold) {
    ctx.fillStyle = 'rgba(255,246,214,0.9)';
    for (let i = 0; i < 3; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * r * 0.8;
      ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.4, 1.4);
    }
  }
}

/** A filled lotus petal pointing outward at angle a. */
export function petal(ctx, cx, cy, a, r0, len, width, hex, rnd, { outline = null } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(r0, 0);
  ctx.bezierCurveTo(r0 + len * 0.3, -width, r0 + len * 0.75, -width * 0.8, r0 + len, 0);
  ctx.bezierCurveTo(r0 + len * 0.75, width * 0.8, r0 + len * 0.3, width, r0, 0);
  ctx.closePath();
  ctx.fillStyle = hex;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  if (outline) {
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = Math.max(1.2, width * 0.12);
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // grain texture over the petal so it reads as powder
  const grains = Math.round(len * 0.6);
  for (let i = 0; i < grains; i++) {
    const t = rnd();
    const px = r0 + t * len;
    const py = (rnd() - 0.5) * width * Math.sin(Math.PI * t) * 1.4;
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`;
    ctx.fillRect(px, py, 1.3, 1.3);
  }
  ctx.restore();
}

export function dotRing(ctx, cx, cy, r, count, size, hex, rnd) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    powderStamp(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, hex, rnd, { grains: 0.6 });
  }
}

export function ringStroke(ctx, cx, cy, r, width, hex, rnd) {
  const steps = Math.max(24, Math.round((Math.PI * 2 * r) / (width * 0.45)));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    powderStamp(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r, width / 2, hex, rnd, { grains: 0.5 });
  }
}

function scallops(ctx, cx, cy, r, count, depth, width, hex) {
  ctx.save();
  ctx.strokeStyle = hex;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 1) / count) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.quadraticCurveTo(cx + Math.cos(am) * (r + depth), cy + Math.sin(am) * (r + depth), cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    ctx.stroke();
  }
  ctx.restore();
}

const PALETTES = [
  ['#c8102e', '#ff9a1f', '#f6c026', '#f6efe0', '#2f9a52'],
  ['#e0559b', '#4a3aa8', '#f6efe0', '#f6c026', '#0a7a8f'],
  ['#e85d04', '#f6c026', '#c8102e', '#f6efe0', '#d9b25f'],
  ['#0a7a8f', '#2f9a52', '#f6c026', '#f6efe0', '#e0559b'],
];

/**
 * Draw a complete rangoli into ctx (size×size). `transparent` leaves the
 * background clear (for the 3D floor); otherwise fills with `floor`.
 */
export function generateRangoli(ctx, size, { seed = Date.now() % 100000, transparent = false, floor = '#1b1a2c' } = {}) {
  const rnd = mulberry32(seed);
  const pal = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const c = size / 2;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  if (!transparent) {
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, size, size);
  }
  const s = size / 1024;
  const sym = [8, 12, 16][Math.floor(rnd() * 3)];

  // outer ring of dots and scallops
  ringStroke(ctx, c, c, 470 * s, 10 * s, pal[3], rnd);
  scallops(ctx, c, c, 440 * s, sym * 2, -34 * s, 7 * s, pal[0]);
  dotRing(ctx, c, c, 410 * s, sym * 4, 6 * s, pal[2], rnd);

  // big outer petals
  for (let i = 0; i < sym; i++) {
    const a = (i / sym) * Math.PI * 2;
    petal(ctx, c, c, a, 250 * s, 150 * s, 52 * s, pal[0], rnd, { outline: pal[3] });
    petal(ctx, c, c, a + Math.PI / sym, 270 * s, 110 * s, 30 * s, pal[4], rnd, { outline: pal[2] });
  }
  ringStroke(ctx, c, c, 240 * s, 12 * s, pal[2], rnd);
  // middle lotus
  for (let i = 0; i < sym; i++) {
    const a = (i / sym) * Math.PI * 2 + Math.PI / sym;
    petal(ctx, c, c, a, 120 * s, 115 * s, 40 * s, pal[1], rnd, { outline: pal[3] });
  }
  dotRing(ctx, c, c, 108 * s, sym * 2, 7 * s, pal[3], rnd);
  // inner flower
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    petal(ctx, c, c, a, 22 * s, 72 * s, 26 * s, pal[2], rnd, { outline: pal[0] });
  }
  powderStamp(ctx, c, c, 26 * s, pal[0], rnd);
  powderStamp(ctx, c, c, 12 * s, pal[3], rnd);
  ctx.restore();
}
