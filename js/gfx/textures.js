// Procedural textures painted on 2D canvases at load time. There are no
// image downloads: stone, terracotta, marble, jaali lattice and decals are
// all generated here, which keeps the app small and fully offline.
import * as THREE from '../lib/three.js';

/** Tileable value noise with integer period. */
function makeNoise(seed = 1) {
  const hash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const m = (n) => ((n % period) + period) % period;
    const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, period, octaves = 3) => {
    let s = 0, amp = 0.5, p = period, f = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += amp * noise(x * f, y * f, p);
      norm += amp;
      amp *= 0.5;
      f *= 2;
      p *= 2;
    }
    return s / norm;
  };
  return { hash, noise, fbm };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = true, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Large sandstone floor slabs (2×2 per tile) + roughness/bump. */
export function stoneFloor(size = 512, aniso = 1) {
  const { hash, fbm } = makeNoise(7);
  const color = canvas(size);
  const rough = canvas(size);
  const cx = color.getContext('2d');
  const rx = rough.getContext('2d');
  const img = cx.createImageData(size, size);
  const rimg = rx.createImageData(size, size);
  const slab = size / 2;
  const P = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x / slab);
      const sy = Math.floor(y / slab);
      const lx = x - sx * slab;
      const ly = y - sy * slab;
      const edge = Math.min(lx, ly, slab - 1 - lx, slab - 1 - ly);
      const tint = hash(sx + 11, sy + 3);
      const n = fbm((x / size) * P, (y / size) * P, P, 4);
      const fine = fbm((x / size) * 64, (y / size) * 64, 64, 2);
      const wear = Math.max(0, 1 - edge / 14) * (0.5 + n);
      let l = 0.82 + (n - 0.5) * 0.32 + (fine - 0.5) * 0.12 + (tint - 0.5) * 0.14 - wear * 0.12;
      if (edge < 1.6) l *= 0.42;
      const i = (y * size + x) * 4;
      img.data[i] = clamp255(186 * l + tint * 8);
      img.data[i + 1] = clamp255(160 * l);
      img.data[i + 2] = clamp255(128 * l - tint * 6);
      img.data[i + 3] = 255;
      const r = edge < 1.6 ? 255 : 150 + (fine - 0.5) * 120 + wear * 50;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = clamp255(r);
      rimg.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  rx.putImageData(rimg, 0, 0);
  return { map: toTexture(color, { aniso }), rough: toTexture(rough, { srgb: false, aniso }) };
}

/** Ashlar masonry for walls: courses of blocks. Texture covers 2×2 m. */
export function ashlar(size = 512) {
  const { hash, fbm } = makeNoise(19);
  const color = canvas(size);
  const cx = color.getContext('2d');
  const img = cx.createImageData(size, size);
  const rows = 4;
  const rowH = size / rows;
  const blockW = size / 2;
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rowH);
    const ly = y - row * rowH;
    const off = row % 2 ? blockW / 2 : 0;
    for (let x = 0; x < size; x++) {
      const bx = Math.floor(((x + off) % size) / blockW);
      const lx = ((x + off) % size) - bx * blockW;
      const edge = Math.min(lx, ly, blockW - 1 - lx, rowH - 1 - ly);
      const tint = hash(bx + row * 7, row + 31);
      const n = fbm((x / size) * 6, (y / size) * 6, 6, 4);
      const fine = fbm((x / size) * 48, (y / size) * 48, 48, 2);
      let l = 0.8 + (n - 0.5) * 0.36 + (fine - 0.5) * 0.14 + (tint - 0.5) * 0.18;
      if (edge < 1.8) l *= 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = clamp255(196 * l);
      img.data[i + 1] = clamp255(158 * l);
      img.data[i + 2] = clamp255(120 * l);
      img.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return toTexture(color);
}

/** Ivory marble with soft veins, for arch frames and trims. */
export function marble(size = 256) {
  const { fbm } = makeNoise(5);
  const color = canvas(size);
  const cx = color.getContext('2d');
  const img = cx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u * 4, v * 4, 4, 4);
      const vein = Math.abs(Math.sin((u + v * 0.6 + n * 1.4) * Math.PI * 4));
      const veinDark = Math.pow(1 - vein, 14) * 0.18;
      const l = 0.93 + (n - 0.5) * 0.08 - veinDark;
      const i = (y * size + x) * 4;
      img.data[i] = clamp255(240 * l);
      img.data[i + 1] = clamp255(230 * l);
      img.data[i + 2] = clamp255(212 * l);
      img.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return toTexture(color);
}

/**
 * Hand-thrown terracotta for the hero diya, laid out for LatheGeometry UVs
 * (u = around, v = along the profile). `bands` gives v ranges: outer, rim, inner.
 */
export function terracotta(w = 512, h = 256, bands = { paintFrom: 0.3, paintTo: 0.48, rimTo: 0.6 }) {
  const { fbm, hash } = makeNoise(3);
  const color = canvas(w, h);
  const bump = canvas(w, h);
  const cx = color.getContext('2d');
  const bx = bump.getContext('2d');
  const img = cx.createImageData(w, h);
  const bimg = bx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1); // CanvasTexture flipY: the top row is v = 1
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const n = fbm(u * 8, v * 4, 8, 4);
      const fine = fbm(u * 96, v * 48, 96, 2);
      const rings = Math.sin(v * 140 + n * 6) * 0.5 + 0.5;
      const speck = hash(x, y) > 0.985 ? -0.25 : 0;
      let r = 158, g = 74, b = 38;
      let l = 0.9 + (n - 0.5) * 0.3 + (fine - 0.5) * 0.12 + (rings - 0.5) * 0.05 + speck;
      if (v > bands.rimTo) {
        // Inner wall: darkened and stained by oil and soot
        const stain = 0.55 + 0.25 * n;
        r = 120; g = 56; b = 30;
        l *= stain;
      } else if (v > bands.paintFrom && v < bands.paintTo) {
        // Painted band: ochre line with white dots, a common folk decoration
        const bandV = (v - bands.paintFrom) / (bands.paintTo - bands.paintFrom);
        const line = Math.abs(bandV - 0.5) < 0.12;
        const du = (u * 28) % 1;
        const dot = Math.hypot((du - 0.5) * 1.6, (bandV - 0.22) * 2.6) < 0.32 || Math.hypot((du - 0.5) * 1.6, (bandV - 0.78) * 2.6) < 0.32;
        if (line) { r = 214; g = 150; b = 52; l = 0.95 + (fine - 0.5) * 0.1; }
        else if (dot) { r = 238; g = 226; b = 204; l = 0.95; }
      }
      const i = (y * w + x) * 4;
      img.data[i] = clamp255(r * l);
      img.data[i + 1] = clamp255(g * l);
      img.data[i + 2] = clamp255(b * l);
      img.data[i + 3] = 255;
      const bb = 128 + (fine - 0.5) * 140 + (rings - 0.5) * 30 + speck * 200;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = clamp255(bb);
      bimg.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  bx.putImageData(bimg, 0, 0);
  const map = toTexture(color);
  map.wrapT = THREE.ClampToEdgeWrapping;
  const bumpTex = toTexture(bump, { srgb: false });
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump: bumpTex };
}

/** Jaali lattice: white = stone, black = hole. Use as alphaMap. */
export function jaali(size = 256) {
  const c = canvas(size);
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, size, size);
  x.fillStyle = '#000';
  const cells = 4;
  const cell = size / cells;
  const star = (cxp, cyp, r) => {
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 8;
      const rr = i % 2 ? r * 0.62 : r;
      x.lineTo(cxp + Math.cos(a) * rr, cyp + Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  };
  for (let j = 0; j <= cells; j++) {
    for (let i = 0; i <= cells; i++) {
      star(i * cell + cell / 2, j * cell + cell / 2, cell * 0.36);
      // small diamonds between stars
      const dx = i * cell;
      const dy = j * cell;
      x.beginPath();
      x.moveTo(dx, dy - cell * 0.13);
      x.lineTo(dx + cell * 0.13, dy);
      x.lineTo(dx, dy + cell * 0.13);
      x.lineTo(dx - cell * 0.13, dy);
      x.closePath();
      x.fill();
    }
  }
  const t = toTexture(c, { srgb: false });
  return t;
}

/** Soft radial sprite for halos in simple materials. */
export function glowSprite(size = 128) {
  const c = canvas(size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false });
}

/** Lakshmi's footprints in alta red with white dotted outline. */
export function footprints(size = 256) {
  const c = canvas(size);
  const x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  const foot = (cxp, cyp, flip) => {
    x.save();
    x.translate(cxp, cyp);
    x.scale(flip ? -1 : 1, 1);
    x.fillStyle = '#b3122e';
    x.beginPath();
    x.ellipse(0, 18, 20, 40, 0.08, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.ellipse(-2, -30, 19, 14, 0.1, 0, Math.PI * 2);
    x.fill();
    const toes = [[-16, -50, 6], [-5, -56, 6.5], [6, -55, 6], [15, -50, 5.4], [22, -42, 4.6]];
    for (const [tx, ty, r] of toes) { x.beginPath(); x.arc(tx, ty, r, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = '#fff4dc';
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      x.beginPath();
      x.arc(Math.cos(a) * 26, 6 + Math.sin(a) * 50, 2.2, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
  };
  foot(size * 0.33, size * 0.56, false);
  foot(size * 0.67, size * 0.56, true);
  return toTexture(c, { repeat: false });
}
