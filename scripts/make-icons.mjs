// Renders the app icons and social preview image with a tiny signed-distance
// rasteriser and a dependency-free PNG encoder (node:zlib).  npm run icons
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- PNG -------------------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- scene (coordinates: unit square, y down) --------------------------------------
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function shade(u, v, { rounded = 0.22, maskable = false, wide = false }) {
  // background: midnight indigo with a warm lift around the flame
  let col = mix([10, 13, 40], [22, 18, 52], smooth(0.2, 1.1, v));
  const s = maskable ? 0.72 : 0.9;           // keep the art inside the maskable safe zone
  const cx = 0.5;
  const fx = (u - cx) / s * (wide ? 1.9 : 1);
  const fy = (v - 0.5) / s;
  const glow = Math.exp(-((fx) ** 2 + (fy + 0.08) ** 2) * 9);
  col = mix(col, [255, 140, 50], glow * 0.45);
  // ring of tiny lamps (rangoli dots)
  const r = Math.hypot(fx, fy + 0.02);
  const ang = Math.atan2(fy + 0.02, fx);
  const dots = 18;
  const nearest = Math.round((ang / (Math.PI * 2)) * dots) * (Math.PI * 2) / dots;
  const dd = Math.hypot(fx - Math.cos(nearest) * 0.4, fy + 0.02 - Math.sin(nearest) * 0.4);
  col = mix(col, [230, 190, 110], smooth(0.022, 0.012, dd) * 0.95);
  col = mix(col, [214, 174, 94], smooth(0.006, 0.0, Math.abs(r - 0.46)) * 0.6);
  // bowl: lower half-ellipse
  const bx = fx / 0.27;
  const by = (fy - 0.12) / 0.11;
  const inBowl = by > 0 && bx * bx + by * by < 1;
  const rim = Math.abs(fy - 0.12) < 0.012 && Math.abs(fx) < 0.29;
  if (inBowl || rim) {
    const t = smooth(0, 1, by);
    col = mix([196, 104, 58], [96, 38, 16], t * 0.9);
    if (rim) col = [236, 196, 128];
  }
  // spout
  const sp = Math.hypot((fx - 0.25) / 0.09, (fy - 0.1) / 0.035);
  if (sp < 1 && fx > 0.18) col = [178, 88, 46];
  // flame: teardrop above the spout
  const ffx = (fx - 0.27);
  const ffy = (fy + 0.06);
  const yy = Math.min(1, Math.max(0, (0.07 - ffy) / 0.26));
  const width = 0.075 * Math.pow(yy + 0.02, 0.5) * Math.pow(1 - yy, 0.9);
  const d = Math.abs(ffx) / Math.max(width, 1e-4);
  if (ffy < 0.075 && ffy > -0.2 && d < 1) {
    const core = smooth(0.7, 0.0, d) * smooth(0.0, 0.25, yy) * smooth(0.8, 0.3, yy);
    col = mix([255, 120, 30], [255, 200, 90], smooth(1, 0.3, d));
    col = mix(col, [255, 248, 228], core);
  }
  const halo = Math.exp(-((ffx) ** 2 + (ffy + 0.06) ** 2) * 90);
  col = col.map((c, i) => Math.min(255, c + [255, 170, 90][i] * halo * 0.35));
  // rounded-square alpha for "any" icons
  let a = 1;
  if (rounded > 0) {
    const qx = Math.max(Math.abs(u - 0.5) - (0.5 - rounded), 0);
    const qy = Math.max(Math.abs(v - 0.5) - (0.5 - rounded), 0);
    const dist = Math.hypot(qx, qy) - rounded;
    a = smooth(0.004, -0.004, dist);
  }
  return [...col, a * 255];
}

function render(w, h, opts) {
  const buf = Buffer.alloc(w * h * 4);
  const SS = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        const c = shade((x + (i + 0.5) / SS) / w, (y + (j + 0.5) / SS) / h, opts);
        acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3];
      }
      const o = (y * w + x) * 4;
      const al = acc[3] / (SS * SS);
      buf[o] = acc[3] ? acc[0] / acc[3] : 0;
      buf[o + 1] = acc[3] ? acc[1] / acc[3] : 0;
      buf[o + 2] = acc[3] ? acc[2] / acc[3] : 0;
      buf[o + 3] = al;
    }
  }
  return png(w, h, buf);
}

const out = (p) => join(root, p);
await mkdir(out('assets/icons'), { recursive: true });
const jobs = [
  ['assets/icons/icon-192.png', 192, 192, {}],
  ['assets/icons/icon-512.png', 512, 512, {}],
  ['assets/icons/icon-maskable-512.png', 512, 512, { rounded: 0, maskable: true }],
  ['assets/icons/apple-touch-icon.png', 180, 180, { rounded: 0 }],
  ['assets/icons/favicon-32.png', 32, 32, { rounded: 0.18 }],
  ['assets/og-image.png', 1200, 630, { rounded: 0, wide: true }],
];
for (const [file, w, h, o] of jobs) {
  await writeFile(out(file), render(w, h, o));
  console.log('wrote', file);
}
