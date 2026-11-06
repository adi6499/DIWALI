// Prepares a release: lists every file the site needs, hashes them, and
// writes the precache list and a content-based VERSION into sw.js, so
// returning visitors get exactly one clean update.   npm run release
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

const INCLUDE_DIRS = ['css', 'js', 'assets', 'vendor/three', 'vendor/gsap'];
const INCLUDE_FILES = ['index.html', 'offline.html', 'manifest.webmanifest'];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = [...INCLUDE_FILES.map((f) => join(root, f))];
for (const d of INCLUDE_DIRS) files.push(...(await walk(join(root, d))));
const hash = createHash('sha256');
let bytes = 0;
for (const f of files.sort()) {
  const buf = await readFile(f);
  bytes += (await stat(f)).size;
  hash.update(relative(root, f));
  hash.update(buf);
}
const version = `deepotsav-${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
const list = ['./', ...files.map((f) => `./${relative(root, f).split('\\').join('/')}`)];

const swPath = join(root, 'sw.js');
const sw = await readFile(swPath, 'utf8');
const block = `/* RELEASE:START */\nconst VERSION = '${version}';\nconst PRECACHE = [\n${list.map((f) => `  '${f}',`).join('\n')}\n];\n/* RELEASE:END */`;
const next = sw.replace(/\/\* RELEASE:START \*\/[\s\S]*?\/\* RELEASE:END \*\//, block);
await writeFile(swPath, next);
console.log(`sw.js → ${version}: ${list.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB precached`);
