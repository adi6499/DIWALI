// Downloads CC0 PBR textures from Poly Haven (https://polyhaven.com, public
// domain) and compresses them to WebP for the web. Run once; the results are
// committed in assets/textures, so the site itself needs no download step.
//
//   npm run textures
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'node_modules/.cache/polyhaven');
const out = join(root, 'assets/textures');

// name in the app → Poly Haven asset and which maps we need
const SETS = {
  wall: { asset: 'red_sandstone_wall', maps: ['diff', 'nor_gl', 'arm'] },
  floor: { asset: 'red_sandstone_pavement', maps: ['diff', 'nor_gl', 'arm'] },
  marble: { asset: 'marble_01', maps: ['diff', 'nor_gl', 'arm'] },
  granite: { asset: 'granite_wall', maps: ['diff', 'nor_gl', 'arm'] },
  clay: { asset: 'clay_plaster', maps: ['nor_gl', 'arm'] },
};
const SIZE = { diff: 1024, nor_gl: 1024, arm: 512 };
const QUALITY = { diff: 76, nor_gl: 84, arm: 78 };
const SHORT = { diff: 'color', nor_gl: 'normal', arm: 'arm' };

await mkdir(cache, { recursive: true });
await mkdir(out, { recursive: true });
const credits = [];
let total = 0;

for (const [name, { asset, maps }] of Object.entries(SETS)) {
  const info = await (await fetch(`https://api.polyhaven.com/info/${asset}`)).json();
  const files = await (await fetch(`https://api.polyhaven.com/files/${asset}`)).json();
  credits.push(`${asset} — ${info.name} by ${Object.keys(info.authors || {}).join(', ')} (CC0) — https://polyhaven.com/a/${asset}`);
  for (const map of maps) {
    const key = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm' }[map];
    const url = files[key]['1k'].jpg.url;
    const local = join(cache, url.split('/').pop());
    if (!(await stat(local).catch(() => null))) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${url}`);
      await writeFile(local, Buffer.from(await res.arrayBuffer()));
    }
    const dest = join(out, `${name}_${SHORT[map]}.webp`);
    const size = name === 'granite' || name === 'clay' ? Math.min(512, SIZE[map]) : SIZE[map];
    await sharp(await readFile(local)).resize(size, size).webp({ quality: QUALITY[map], effort: 6 }).toFile(dest);
    const s = (await stat(dest)).size;
    total += s;
    console.log(`${name}_${SHORT[map]}.webp  ${(s / 1024).toFixed(0)} KB`);
  }
}

await writeFile(join(root, 'vendor/LICENSES/polyhaven-textures-CC0.txt'),
  `Textures in assets/textures are from Poly Haven and are public domain (CC0):\n\n${credits.join('\n')}\n\nhttps://polyhaven.com/license\n`);
console.log(`total ${(total / 1024).toFixed(0)} KB`);
